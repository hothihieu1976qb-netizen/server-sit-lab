'use strict';

const FIELD_MANUAL='labs/operations-stack/README.md';
const fieldStart='cd labs/operations-stack';
const stageCommand=(id,stage)=>'node observe.mjs '+id+' '+stage;
const FIELD_LABS=[
  {key:'ops-004',id:'OPS-004',label:'容器发布',level:'中级',title:'容器发布失败：回滚镜像并检查数据卷', brief:'订单服务刚升级。进程仍能响应，但业务不应放量。你要识别镜像、探针与依赖契约，回到已知可用版本，并验证重建后的后端仍读取原有数据。',steps:[
    ['记录 v1 与卷内标记','在后端数据卷写一条受控记录，采集旧版本基线。',[fieldStart,'docker compose up -d --build --wait gateway','docker compose exec -T ledger python /lab/service.py add SIT-OPS004',stageCommand('OPS-004','before')]],
    ['部署 v2，验证三种状态','对照 liveness、readiness 和订单，保存实际错误。',["docker compose -f compose.yaml -f release-v2.yaml up -d --no-deps --build gateway",stageCommand('OPS-004','fault'),'docker compose ps','docker compose logs --tail=20 gateway']],
    ['回滚并重建后端','检查恢复后的订单，以及后端实例 ID 与持久化记录。',['docker compose up -d --force-recreate --no-deps --wait ledger','docker compose up -d --wait gateway',stageCommand('OPS-004','after')]]]},
  {key:'ops-005',id:'OPS-005',label:'监控告警',level:'中级',title:'告警值班：查找订单服务的上游故障',brief:'Prometheus 可以抓取网关，但这不能说明用户请求成功。用抓取状态、依赖告警、探针、日志与订单响应确定故障范围，再验证告警消失。',steps:[
    ['启动监控，建立健康基线','用 Prometheus 的 HTTP API 采集 up 与告警。',[fieldStart,'docker compose --profile monitoring up -d --build --wait gateway prometheus',stageCommand('OPS-005','before')]],
    ['模拟依赖下线，等待规则生效','只停止实验后端，观察 up 保持 1 和依赖告警 firing。',['docker compose stop ledger',stageCommand('OPS-005','fault'),'docker compose logs --tail=20 gateway']],
    ['恢复依赖并复测','确认订单响应恢复，且告警状态清除。',['docker compose up -d --wait ledger',stageCommand('OPS-005','after')]]]},
  {key:'ops-006',id:'OPS-006',label:'集群排障',level:'进阶',title:'Kubernetes 跨节点排障：后端 Ready，转发仍失败',brief:'两个应用分别部署到不同的 kind worker。你要核对 DNS 对应的 Service、Selector 和 EndpointSlice，判断为什么 Pod Ready 但请求无法抵达它。另需 kind、kubectl 和 Linux 容器运行环境。',steps:[
    ['创建独立集群并部署','只对 kind-sit-ops006 操作。在另一终端持续运行 port-forward。',[fieldStart,'kind create cluster --name sit-ops006 --config cluster/kind.yaml','docker build -t sitlab/ops-platform:v1 .','kind load docker-image sitlab/ops-platform:v1 --name sit-ops006','kubectl --context kind-sit-ops006 apply -f cluster/workloads.yaml','kubectl --context kind-sit-ops006 -n sit-ops006 rollout status deployment/gateway --timeout=120s','kubectl --context kind-sit-ops006 -n sit-ops006 port-forward deployment/gateway 18652:8080 --address 127.0.0.1']],
    ['采集基线后模拟 Selector 漂移','对照后端 Pod Ready、服务选择条件与 EndpointSlice。',[stageCommand('OPS-006','before'),'kubectl --context kind-sit-ops006 -n sit-ops006 patch service ledger --type=merge --patch-file cluster/selector-fault.json','kubectl --context kind-sit-ops006 -n sit-ops006 get endpointslices -l kubernetes.io/service-name=ledger',stageCommand('OPS-006','fault')]],
    ['恢复标签匹配并跨节点复测','恢复 EndpointSlice 后采集真实请求和 Pod 节点证据。',['kubectl --context kind-sit-ops006 -n sit-ops006 patch service ledger --type=merge --patch-file cluster/selector-fix.json','kubectl --context kind-sit-ops006 -n sit-ops006 get pods -o wide',stageCommand('OPS-006','after')]]]},
  {key:'ops-007',id:'OPS-007',label:'性能容量',level:'进阶',title:'容量排查：高并发下的排队与尾延迟',brief:'同一业务接口在请求上升后超过实验目标。做有界的对照实验，区分依赖实际处理耗时与排队耗时，再评估提高并发槽是否改善延迟和成功吞吐。',steps:[
    ['固定处理条件，采集低并发基线','保持 v1、两个后端工作槽和相同请求路径。',[fieldStart,'docker compose up -d --build --wait gateway',stageCommand('OPS-007','before')]],
    ['只提高客户端并发','记录 8 路并发、请求数、成功吞吐、P95 及队列 P95。',[stageCommand('OPS-007','fault'),'docker stats --no-stream']],
    ['只更换后端工作槽，重复同一负载','把两个槽增至四个，以同样请求数和并发复测。',['docker compose -f compose.yaml -f capacity.yaml up -d --no-deps --wait ledger',stageCommand('OPS-007','after')]]]}
];

const fieldDrafts=new Map();
const realLabByRoute=key=>FIELD_LABS.find(lab=>lab.key===key)||null;
const fieldCols=['before','fault','after'];
const fieldNames=['基线','故障或高负载','恢复或调优后'];

function readFieldReport(value,lab){
  if(value?.format!=='sit-field-evidence'||value.version!==1||value.lab!==lab.id||!Number.isFinite(Date.parse(value.recordedAt))||!value.stages||!Array.isArray(value.checks))return null;
  if(!value.checks.every(check=>Array.isArray(check)&&typeof check[0]==='string'&&typeof check[1]==='boolean'))return null;
  return value;
}

function fieldVerdict(report){
  if(!fieldCols.every(key=>report.stages[key])||!report.checks.length)return '待采集';
  return report.checks.every(([,pass])=>pass)?'PASS':'FAIL';
}

function fieldOutput(lab,report){
  if(!report)return '';
  const sections=fieldCols.map((key,index)=>{
    const {samples,...summary}=report.stages[key]||{};
    return `<details><summary>${fieldNames[index]}</summary><pre>${esc(Object.keys(summary).length?JSON.stringify(summary,null,2):'尚未采集')}</pre></details>`;
  });
  let capacity='';
  if(lab.id==='OPS-007'){
    const readings=fieldCols.map(key=>report.stages[key]?.p95).filter(value=>Number.isFinite(value)&&value>=0);
    const scale=Math.max(210,...readings);
    capacity=`<div class="field-evidence-bars"><p>订单 P95（目标 210 ms）</p>${fieldCols.map((key,index)=>{const value=report.stages[key]?.p95;return Number.isFinite(value)&&value>=0?`<div><span>${fieldNames[index]} · ${value} ms</span><progress value="${value}" max="${scale}" aria-label="${fieldNames[index]} P95"></progress></div>`:'';}).join('')}</div>`;
  }
  const verdict=fieldVerdict(report);
  return `<p>采集脚本的验收：<strong>${verdict}</strong> · ${esc(report.recordedAt)}</p>${capacity}<ul>${report.checks.map(([label,passed])=>`<li>${passed?'PASS':'FAIL'} · ${esc(label)}</li>`).join('')}</ul>${sections.join('')}`;
}

function renderRealLab(lab){
  const backup=$('backup-real-lab'),host=$('field-real-lab');
  $('real-lab-tabs').innerHTML=[{id:'OPS-003',label:'备份恢复',key:null},...FIELD_LABS].map(item=>`<button type="button" data-go="real-labs${item.key?'/'+item.key:''}" aria-pressed="${(lab?.key??null)===item.key}">${item.id} · ${item.label}</button>`).join('');
  backup.hidden=Boolean(lab);host.hidden=!lab;
  if(!lab)return;
  const draft=fieldDrafts.get(lab.id)||{report:null,notes:''};
  fieldDrafts.set(lab.id,draft);
  host.innerHTML=`<section class="panel real-lab-overview"><p class="section-kicker">${lab.id} · 真实环境 · ${lab.level}</p><h2>${lab.title}</h2><p>${lab.brief}</p><p class="info-box">在系统终端运行命令。需要 Docker、Compose 和 Node.js 20+；集群工单还需要 kind 和 kubectl。</p><a href="${FIELD_MANUAL}#${lab.key}">打开操作手册 ↗</a></section>${realPrelude(lab.key)}<div class="real-lab-steps">${lab.steps.map(([title,goal,commands],index)=>`<details class="panel" ${index===0?'open':''}><summary>0${index+1} · ${title}</summary><p>${goal}</p>${commands.map(realCommandGuide).join('')}</details>`).join('')}</div><section class="panel real-lab-overview"><h2>导入现场证据</h2><p>选择 <code>artifacts/${lab.key}-evidence.json</code>。每个阶段的命令都会更新这份文件，最终记录保留各阶段结果。</p><label>实训证据（JSON）<input type="file" id="field-evidence-file" accept=".json,application/json"></label><p id="field-evidence-status" role="status"></p><div class="field-evidence-body" id="field-evidence-result">${fieldOutput(lab,draft.report)}</div><label>交接记录<textarea id="field-evidence-notes" rows="4" maxlength="8000" placeholder="说明影响、证据、恢复情况和下一步。">${esc(draft.notes)}</textarea></label><button id="field-evidence-export" type="button">导出交接报告</button></section>`;
  const file=$('field-evidence-file'),status=$('field-evidence-status'),result=$('field-evidence-result'),notes=$('field-evidence-notes');
  file.addEventListener('change',async()=>{
    const selected=file.files[0];if(!selected)return;
    try{
      const report=selected.size<1024*1024?readFieldReport(JSON.parse(await selected.text()),lab):null;
      if(!report){status.textContent='该证据不适用于 '+lab.id+'。请选择对应的 JSON。';return;}
      draft.report=report;result.innerHTML=fieldOutput(lab,report);status.textContent='已导入 '+lab.id+' 证据。';
    }catch(_){status.textContent='无法读取 JSON，请重新采集。';}
  });
  notes.addEventListener('input',()=>{draft.notes=notes.value;});
  $('field-evidence-export').addEventListener('click',()=>{
    if(!draft.report||!draft.notes.trim()){status.textContent='请先导入证据并填写交接记录。';return;}
    downloadText(lab.id+'-handoff.md',[`# ${lab.id} · ${lab.title}`,'','## 交接记录',draft.notes.trim(),'','## 验收清单',...draft.report.checks.map(([label,pass])=>`- ${pass?'PASS':'FAIL'} · ${label}`),'','## 原始证据','```json',JSON.stringify(draft.report,null,2),'```'].join('\n'));
    recordFieldHandoff(lab.key,fieldVerdict(draft.report));
    status.textContent='已导出交接报告。';
  });
}
