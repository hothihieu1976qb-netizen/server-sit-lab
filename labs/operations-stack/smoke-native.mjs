import {spawn, execFileSync} from 'node:child_process';
import {copyFile, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {once} from 'node:events';

const here=fileURLToPath(new URL('./',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'sit-platform-smoke-'));
const children=new Set();
const python=process.env.PYTHON||'python';
const prom=process.env.SIT_PROM_BIN;
const freePort=async()=>{
  const server=createServer().listen(0,'127.0.0.1');
  await once(server,'listening');
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return String(port);
};
const port={gateway:await freePort(),ledger:await freePort(),prom:await freePort()};
const url=(role,path)=>`http://127.0.0.1:${port[role]}${path}`;
const base={...process.env,SIT_EVIDENCE_DIR:root,SIT_GATEWAY_PORT:port.gateway,SIT_PROM_PORT:port.prom,
  SIT_BIND:'127.0.0.1',SIT_DATA:join(root,'orders.db'),SIT_LEDGER:url('ledger',''),PYTHONUNBUFFERED:'1'};

function start(file,args,env){
  const child=spawn(file,args,{env,cwd:here,windowsHide:true,stdio:['ignore','ignore','pipe']});
  children.add(child);
  let recent='';
  child.stderr.on('data',chunk=>{recent=(recent+chunk).slice(-3000);});
  child.once('error',error=>{recent=String(error);});
  return {child,diagnostic:()=>recent};
}

async function stop(job){
  if(job.child.exitCode===null&&job.child.signalCode===null&&job.child.pid){
    const ended=once(job.child,'exit');
    job.child.kill();
    await ended;
  }
  children.delete(job.child);
}

async function ready(target,job){
  for(let attempt=0;attempt<24;attempt++){
    try{if((await fetch(target,{signal:AbortSignal.timeout(750)})).ok)return;}catch(_){}
    if(job.child.exitCode!==null)break;
    await wait(200);
  }
  throw Error('Native service did not become ready: '+target+'\n'+job.diagnostic());
}

async function app(role,release='v1',workers='2'){
  const env={...base,SIT_ROLE:role,SIT_RELEASE:release,SIT_WORKERS:workers,SIT_WORK_MS:'80',SIT_PORT:port[role]};
  const job=start(python,['service.py'],env);
  await ready(url(role,'/live'),job);
  return job;
}

function capture(lab,phase){
  try{
    const output=execFileSync(process.execPath,['observe.mjs',lab,phase],{cwd:here,env:base,windowsHide:true,encoding:'utf8',timeout:30000});
    console.log(output.trim().split(/\r?\n/).at(-1));
  }catch(error){throw Error(`Capture failed: ${lab} ${phase}\n${error.stdout||''}\n${error.stderr||''}`);}
}

try{
  execFileSync(python,['service.py','add','SIT-OPS004'],{cwd:here,env:{...base,SIT_ROLE:'ledger'},windowsHide:true});
  let ledger=await app('ledger'),front=await app('gateway');
  capture('OPS-004','before');
  await stop(front);
  front=await app('gateway','v2');
  capture('OPS-004','fault');
  await stop(ledger);
  await stop(front);
  ledger=await app('ledger');
  front=await app('gateway');
  capture('OPS-004','after');

  if(prom){
    const config=await readFile(join(here,'prometheus.yaml'),'utf8');
    const configPath=join(root,'prometheus.yaml');
    await writeFile(configPath,config.replace('gateway:8080',`127.0.0.1:${port.gateway}`));
    await copyFile(join(here,'alerts.yaml'),join(root,'alerts.yml'));
    const monitoring=start(prom,[`--config.file=${configPath}`,`--storage.tsdb.path=${join(root,'prom-data')}`,`--web.listen-address=127.0.0.1:${port.prom}`],base);
    await ready(url('prom','/-/ready'),monitoring);
    capture('OPS-005','before');
    await stop(ledger);
    capture('OPS-005','fault');
    ledger=await app('ledger');
    capture('OPS-005','after');
    await stop(monitoring);
  }

  capture('OPS-007','before');
  capture('OPS-007','fault');
  await stop(ledger);
  ledger=await app('ledger','v1','4');
  capture('OPS-007','after');
  const report=JSON.parse(await readFile(join(root,'ops-007-evidence.json'),'utf8'));
  console.log('HTTP P95 ms: '+['before','fault','after'].map(stage=>report.stages[stage].p95).join(' / '));
  console.log('Actual evidence folder: '+root);
} finally {
  await Promise.all([...children].map(child=>stop({child})));
}
