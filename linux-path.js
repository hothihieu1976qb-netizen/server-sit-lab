'use strict';

// Item IDs are existing course IDs or real-lab keys. The first stage can be
// validated directly without marking its practice lessons as completed.
const LINUX_PATH=[
  {label:'共同基础',icon:'terminal',title:'认识你正在操作的系统',goal:'能从一台陌生主机查清身份、权限和服务响应，交出一份可复核的记录。',
   items:FOUNDATION_COURSES.map(c=>c.id),checkpoint:'linux-foundation-check'},
  {label:'共同基础 · 取证',icon:'file-text',title:'从文件找到可交接的证据',goal:'找对本轮日志，读清时间范围，按明确条件筛选并保存，解释统计口径。',
   items:FILE_COURSES.map(c=>c.id),checkpoint:'linux-log-handoff'},
  {label:'共同基础 · 权限',icon:'shield-check',title:'按实际账号验证最小权限',goal:'分清账号资料与进程身份，理解目录与文件权限，授权后验证获准账号及无关账号。',
   items:ACCOUNT_COURSES.map(c=>c.id),checkpoint:'linux-access-handoff'},
  {label:'共同基础 · 软件',icon:'layers',title:'从软件包验证到本轮任务',goal:'区分仓库、本机安装、程序搜索和实际运行，读回本轮产物再交接。',
   items:PACKAGE_COURSES.map(c=>c.id),checkpoint:'linux-package-handoff'},
  {label:'初级到中级',icon:'workflow',title:'接手一项日常工作',goal:'恢复每天的巡检报告，再接手一次 Web 发布。每次变更都要有验证和交接。',
   items:['linux-host-ops','linux-web-release']},
  {label:'中级实务',icon:'layers',title:'维护真实服务',goal:'在自己的容器环境里恢复订单、回滚发布、确认告警解除，导入现场证据。',
   items:['ops-003','ops-004','ops-005']},
  {label:'高级专题',icon:'activity',title:'诊断跨节点和容量问题',goal:'追踪请求实际经过的后端，或用同一负载复测排队延迟，说明结论的适用条件。',
   items:['ops-006','ops-007']}
];

const COURSE_KNOWLEDGE={
  'linux-host-ops':['identity','credentials','supplementary','leastaccess','access','packages','dependencies','freshartifact','schedule'],'linux-web-release':['process','socket','http'],
  'ops-003':['recovery','container'],'ops-004':['container','http'],'ops-005':['monitor','http'],
  'ops-006':['endpoints','socket'],'ops-007':['queue','http']
};

function knowledgeShelf(keys=[]){
  if(!keys.length)return '';
  return '<section class="knowledge-shelf" aria-label="本任务的基础知识"><h3>动手前，先弄懂</h3>'+keys.map(key=>{
    const [name,concept,reading]=LINUX_CONCEPTS[key];
    return `<details><summary>${esc(name)}</summary><p>${esc(concept)}</p><p>${esc(reading)}</p></details>`;
  }).join('')+'</section>';
}

function pathItem(id){
  const course=GUIDED_COURSES_BY_ID.get(id);
  if(course){
    const run=getGuidedRun(id),done=run?.step===course.steps.length;
    return {id,title:course.title,route:'lesson/'+id,done,started:Boolean(run),status:done?'已验收':run?'进行中 · 第 '+(run.step+1)+' 步':'未开始',
      detail:run&&!done?course.steps[run.step].goal:course.description};
  }
  const lab=realLabByRoute(id),status=S.ui.fieldProgress?.[id];
  return {id,title:lab?.title||'把订单备份恢复到隔离数据库',route:lab?'real-labs/'+id:'real-labs',done:status==='PASS',started:Boolean(status),
    status:status==='PASS'?'已交接':status==='FAIL'?'需复测':status?'待补证据':'真实环境',
    detail:lab?.brief||'准备 Docker 与 Compose，在隔离数据库恢复备份，并核对实际缺少的订单。'};
}

function recordFieldHandoff(id,verdict){
  S.ui.fieldProgress??={};
  S.ui.fieldProgress[id]=verdict;
  persist();
}

function nextPathItem(){
  for(const stage of LINUX_PATH){
    if(stage.checkpoint&&pathItem(stage.checkpoint).done)continue;
    const id=stage.items.find(id=>!pathItem(id).done);
    if(id)return pathItem(id);
  }
  return null;
}

function renderLinuxPath(){
  const stages=LINUX_PATH.map(stage=>({...stage,lessons:stage.items.map(pathItem)}));
  const next=nextPathItem();
  const resume=S.ui.lastLinuxTask?pathItem(S.ui.lastLinuxTask):null;
  const previous=getGuidedRun(S.experience.guidedId)&&stages.some(s=>s.items.includes(S.experience.guidedId))?pathItem(S.experience.guidedId):null;
  const recent=resume||previous;
  const current=recent&&!recent.done?recent:next;
  const currentStage=stages.find(stage=>stage.items.includes(current?.id));
  const verified=stages.filter(s=>s.checkpoint?pathItem(s.checkpoint).done:s.lessons.every(l=>l.done)).length;
  const secondary=next&&next.id!==current?.id?`<button data-go="${next.route}">回到主线 · ${esc(next.title)}</button>`:
    !pathItem(stages[0].checkpoint).done&&current?.id!==stages[0].checkpoint?`<button data-go="lesson/${stages[0].checkpoint}">已有基础，直接验收</button>`:'';
  const rows=stages.map(stage=>`<details class="path-stage" ${stage===currentStage?'open':''}><summary><span class="path-icon">${studioIcon(stage.icon)}</span><span><small>${stage.label}</small><strong>${stage.title}</strong></span><span class="stage-count">${stage.checkpoint&&pathItem(stage.checkpoint).done?'阶段已验收':stage.lessons.filter(l=>l.done).length+' / '+stage.lessons.length}</span></summary><div class="stage-body"><p>${stage.goal}</p><ul>${stage.lessons.map(l=>`<li><a href="#${l.route}">${esc(l.title)}</a><small>${l.status}</small></li>`).join('')}</ul></div></details>`).join('');
  $('learning-home').innerHTML=`<section class="linux-hero"><div><p class="section-kicker">LINUX PRACTICE LAB</p><h1>我的 Linux 学习主线</h1><p>从读懂第一条终端输出，到独立接手一项服务。</p></div><div class="path-counter"><strong>${verified}<small> / ${stages.length}</small></strong><span>已验收阶段</span></div></section>
    <section class="path-current"><span class="path-icon">${studioIcon('terminal')}</span><div><p class="section-kicker">${currentStage?.label||'我的学习'} · ${current?.started||resume&&!resume.done?'继续实训':'下一项任务'}</p><h2>${esc(current?.title||'主线阶段已全部验收')}</h2><p>${esc(current?.detail||'可以从下方选择专题，或从现场问题开始新一轮练习。')}</p><div class="inline-actions">${current?`<button class="primary" data-go="${current.route}">${current.started||resume&&!resume.done?'继续实训':'进入任务'} ${studioIcon('arrow-right')}</button>`:''}${secondary}</div></div></section>
    <section class="path-map"><div class="section-heading"><h2>学习路线</h2><a href="#catalog">浏览课程目录 ↗</a></div>${rows}</section>
    <section class="path-branches"><h2>按工作方向练习</h2><div><article><h3>服务器 SIT</h3><p>环境巡检、性能基线、故障回归和测试报告。</p><button data-path-sit>进入 SIT 案例</button> <button data-go="academy">SIT 专题</button></article><article><h3>复现现场问题</h3><p>带上环境、现象和脱敏日志，配置模拟机并验证判断。</p><button data-go="cases">打开案例实验室</button></article><article><h3>真实容器环境</h3><p>用本地 Docker 练备份、发布、监控和集群排障。</p><button data-go="real-labs">打开真实工单</button></article></div></section>`;
}
