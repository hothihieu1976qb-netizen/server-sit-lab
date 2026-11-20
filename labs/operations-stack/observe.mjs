import {execFileSync} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';

const [lab,phase]=process.argv.slice(2);
const stages=['before','fault','after'];
const marker='SIT-OPS004';
const sloMs=210;
const roundTrip=path=>resolve(fileURLToPath(new URL('./',import.meta.url)),path);
const artifactDir=process.env.SIT_EVIDENCE_DIR||roundTrip('artifacts');
const localPort=(key,fallback)=>{
  const port=Number(process.env[key]||fallback);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port in '+key);
  return 'http://127.0.0.1:'+port;
};
const gateway=localPort('SIT_GATEWAY_PORT',18650);
const monitor=localPort('SIT_PROM_PORT',18651);
const cluster=localPort('SIT_CLUSTER_PORT',18652);

async function http(base,path){
  const response=await fetch(base+path,{signal:AbortSignal.timeout(4500)});
  return {status:response.status,body:await response.json()};
}

async function gatewayState(base){
  const [live,ready,orders]=await Promise.all(['/live','/ready','/orders'].map(path=>http(base,path)));
  return {live:live.status,ready:ready.status,ordersStatus:orders.status,release:live.body.release,
    error:orders.body.error||null,orders:orders.body.orders||[],ledgerInstance:orders.body.ledgerInstance||null};
}

async function scrapeState(){
  const instant=query=>http(monitor,'/api/v1/query?query='+encodeURIComponent(query));
  const [up,dependency,alerts]=await Promise.all([instant('up{job="gateway"}'),instant('sit_gateway_dependency_ready'),http(monitor,'/api/v1/alerts')]);
  if([up,dependency,alerts].some(item=>item.body.status!=='success'))throw Error('Prometheus API did not return a successful response');
  const value=metric=>metric.body.data.result.length?Number(metric.body.data.result[0].value[1]):null;
  return {up:value(up),dependencyReady:value(dependency),
    alerts:alerts.body.data.alerts.map(alert=>({name:alert.labels.alertname,state:alert.state,since:alert.activeAt}))};
}

async function monitoringState(){
  const expected=phase==='fault';
  const start=performance.now();
  for(;;){
    const [service,metrics]=await Promise.all([gatewayState(gateway),scrapeState()]);
    const fired=metrics.alerts.some(alert=>alert.name==='LedgerDependencyUnavailable'&&alert.state==='firing');
    const clear=!metrics.alerts.some(alert=>alert.name==='LedgerDependencyUnavailable');
    if(metrics.up===1&&(expected?fired&&metrics.dependencyReady===0:clear&&metrics.dependencyReady===1)||performance.now()-start>=16000)return {...service,...metrics};
    await wait(1000);
  }
}

function kubectl(...args){
  const context=process.env.SIT_CLUSTER_CONTEXT||'kind-sit-ops006';
  const command=['--context',context,'-n','sit-ops006',...args,'-o','json'];
  return JSON.parse(execFileSync('kubectl',command,{encoding:'utf8',timeout:8000}));
}

async function clusterState(){
  const start=performance.now();
  for(;;){
    const pods=kubectl('get','pods').items.filter(pod=>['ledger','gateway'].includes(pod.metadata.labels?.app)&&!pod.metadata.deletionTimestamp)
      .map(pod=>({role:pod.metadata.labels.app,name:pod.metadata.name,node:pod.spec.nodeName,ready:pod.status.conditions?.some(condition=>condition.type==='Ready'&&condition.status==='True')||false}));
    const slices=kubectl('get','endpointslices','-l','kubernetes.io/service-name=ledger').items;
    const ledgerEndpoints=slices.flatMap(slice=>slice.endpoints||[]).filter(endpoint=>endpoint.conditions?.ready!==false).flatMap(endpoint=>endpoint.addresses||[]);
    const selector=kubectl('get','service','ledger').spec.selector;
    const state={...await gatewayState(cluster),pods,ledgerEndpoints,selector};
    const ready=phase==='fault'?state.ordersStatus===502&&ledgerEndpoints.length===0:state.ordersStatus===200&&ledgerEndpoints.length>0;
    if(ready||performance.now()-start>14000)return state;
    await wait(1000);
  }
}

const percentile=(values,fraction)=>[...values].sort((first,second)=>first-second)[Math.ceil(values.length*fraction)-1];
const round=value=>Math.round(value*100)/100;

async function capacityState(){
  const concurrency=phase==='before'?1:8;
  const count=phase==='before'?16:32;
  const samples=[];
  await http(gateway,'/orders');
  const started=performance.now();
  for(let begin=0;begin<count;begin+=concurrency){
    const batch=Array.from({length:Math.min(concurrency,count-begin)},async()=>{
      const start=performance.now();
      try{
        const {status,body}=await http(gateway,'/orders');
        return {ms:round(performance.now()-start),status,queueMs:body.queueMs??null,workers:body.workers??null,workMs:body.workMs??null,release:body.release??null};
      }catch(_){return {ms:round(performance.now()-start),status:0,queueMs:null,workers:null,workMs:null,release:null};}
    });
    samples.push(...await Promise.all(batch));
  }
  const totalMs=round(performance.now()-started);
  const successful=samples.filter(sample=>sample.status===200);
  return {concurrency,count,totalMs,successful:successful.length,workers:[...new Set(successful.map(sample=>sample.workers))],
    workMs:[...new Set(successful.map(sample=>sample.workMs))],release:[...new Set(successful.map(sample=>sample.release))],
    p95:round(percentile(samples.map(sample=>sample.ms),.95)),queueP95:successful.length?round(percentile(successful.map(sample=>sample.queueMs),.95)):null,
    goodput:round(successful.length*1000/totalMs),sloMs,samples};
}

const healthy=state=>state.live===200&&state.ready===200&&state.ordersStatus===200&&state.orders.includes('SIT-1001');
const firing=state=>state.alerts.some(alert=>alert.name==='LedgerDependencyUnavailable'&&alert.state==='firing');
const cleared=state=>!state.alerts.some(alert=>alert.name==='LedgerDependencyUnavailable');
const placed=state=>state.pods.some(pod=>pod.role==='gateway'&&pod.node&&state.pods.some(peer=>peer.role==='ledger'&&peer.node&&peer.node!==pod.node&&peer.ready));

const labs={
  'OPS-004':{capture:()=>gatewayState(gateway),checks:(before,fault,after)=>[
    ['v1 正常，基线包含卷持久化标记',healthy(before)&&before.release==='v1'&&before.orders.includes(marker)],
    ['v2 进程存活，v2 上游接口未实现',fault.live===200&&fault.ready===503&&fault.ordersStatus===502&&fault.release==='v2'&&fault.error==='ledger_http_404'],
    ['回滚到 v1，后端实例已重建，卷中的数据标记和订单仍在',healthy(after)&&after.release==='v1'&&Boolean(before.ledgerInstance&&after.ledgerInstance)&&after.ledgerInstance!==before.ledgerInstance&&JSON.stringify(after.orders)===JSON.stringify(before.orders)]
  ]},
  'OPS-005':{capture:monitoringState,checks:(before,fault,after)=>[
    ['基线可抓取、业务正常、无依赖告警',healthy(before)&&before.up===1&&before.dependencyReady===1&&cleared(before)],
    ['依赖停止时网关仍被抓取，依赖告警进入 firing',fault.up===1&&fault.dependencyReady===0&&fault.live===200&&fault.ready===503&&fault.ordersStatus===502&&fault.error==='ledger_unreachable'&&firing(fault)],
    ['依赖恢复后业务正常，告警消失',healthy(after)&&after.up===1&&after.dependencyReady===1&&cleared(after)]
  ]},
  'OPS-006':{capture:clusterState,checks:(before,fault,after)=>[
    ['前后端工作负载分别运行于不同的节点',placed(before)&&healthy(before)&&before.ledgerEndpoints.length>0],
    ['后端 Pod Ready，错误的 Service Selector 导致可用 Endpoint 归零',placed(fault)&&fault.ledgerEndpoints.length===0&&fault.selector.app==='ledger-obsolete'&&fault.ordersStatus===502&&fault.live===200],
    ['纠正 Selector 后恢复跨节点请求',placed(after)&&after.selector.app==='ledger'&&after.ledgerEndpoints.length>0&&healthy(after)]
  ]},
  'OPS-007':{capture:capacityState,checks:(before,fault,after)=>[
    ['控制变量、请求全成功，比较只改变并发或后端工作槽',before.concurrency===1&&fault.concurrency===after.concurrency&&fault.count===after.count&&[before,fault,after].every(state=>state.successful===state.count&&state.workMs.join()===before.workMs.join()&&state.release.join()==='v1')&&before.workers.join()==='2'&&fault.workers.join()==='2'&&after.workers.join()==='4'],
    ['基线满足目标，队列在高并发下增长并超过目标',before.p95<=sloMs&&fault.p95>sloMs&&fault.queueP95>before.queueP95+30],
    ['同等负载下，扩展后队列和尾延迟下降、成功吞吐提升',after.queueP95<fault.queueP95&&after.p95<fault.p95&&after.goodput>fault.goodput]
  ]}
};

if(!Object.hasOwn(labs,lab)||!stages.includes(phase)){
  console.error('Usage: node observe.mjs OPS-004|OPS-005|OPS-006|OPS-007 before|fault|after');
  process.exit(2);
}
await mkdir(artifactDir,{recursive:true});
const file=resolve(artifactDir,lab.toLowerCase()+'-evidence.json');
const report=phase==='before'?{format:'sit-field-evidence',version:1,lab,stages:{},recordedAt:null,checks:[],verdict:'INCOMPLETE'}:JSON.parse(await readFile(file,'utf8'));
const index=stages.indexOf(phase);
if(report.lab!==lab||stages.slice(0,index).some(stage=>!report.stages[stage]))throw Error('Record the previous stages first');
const capture=await labs[lab].capture();
for(const later of stages.slice(index+1))delete report.stages[later];
report.recordedAt=new Date().toISOString();
report.stages[phase]={at:report.recordedAt,...capture};
report.checks=phase==='after'?labs[lab].checks(report.stages.before,report.stages.fault,report.stages.after):[];
report.verdict=phase!=='after'?'INCOMPLETE':report.checks.every(([,pass])=>pass)?'PASS':'FAIL';
const temporary=file+'.tmp';
await writeFile(temporary,JSON.stringify(report,null,2)+'\n');
await rename(temporary,file);
console.log(JSON.stringify(capture,null,2));
console.log(`${lab} ${phase} ${report.verdict}: ${file}`);
if(report.verdict==='FAIL')process.exitCode=1;
