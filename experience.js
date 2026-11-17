'use strict';

function currentGuidedCourse(){
  return GUIDED_COURSES_BY_ID.get(S.experience.guidedId)||NETWORK_GUIDED_COURSE;
}
function getGuidedRun(id=currentGuidedCourse().id){
  return S.experience.courses?.[id];
}
function saveGuidedRun(id,run){
  S.experience.courses[id]=run;
}
function currentPractice(page = S.page) {
  if (page === 'lesson') return getGuidedRun();
  if (page === 'cases') return S.experience.cases.find(c => c.id === S.experience.selectedCase);
  return null;
}

function practiceTerminal(page) {
  const next = currentPractice(page);
  const host = page === 'lesson' ? $('guided-terminal') : page === 'cases' ? $('case-terminal') : $('terminal-home');
  const context = next || null;
  const layout = $('coach-layout');
  if (layout.parentElement !== host) host.append($('work-toolbar'), $('work-task'), layout);
  host.hidden = page === 'cases' && !next;
  if (context === S.activePracticeTerminal) return;

  const output = $('terminal-output');
  if (!S.activePracticeTerminal) {
    S.legacyTerminal = { nodes: [...output.childNodes], lesson: S.lastLesson, quiz: S.currentMemoryQuiz, status: $('terminal-execution-status').textContent };
  }
  output.replaceChildren();
  S.activePracticeTerminal = context;
  $('command').value = '';
  $('terminal-execution-status').textContent = 'READY';
  S.lastLesson = null;
  S.currentMemoryQuiz = null;
  if (next) {
    next.cursor = next.events.length;
    for (const event of next.events.slice(-65)) printPracticeEvent(event);
    const last = next.events.findLast(e=>e.raw!=='[模拟机配置]');
    if (last) {
      S.lastLesson = practiceCommandLesson(last);
      S.currentMemoryQuiz = makeMemoryQuiz(S.lastLesson);
      $('terminal-execution-status').textContent = last.failed ? 'ERROR' : 'COMPLETED';
    }
  } else if (S.legacyTerminal) {
    const previous = S.legacyTerminal;
    output.append(...previous.nodes);
    output.scrollTop = output.scrollHeight;
    S.lastLesson = previous.lesson;
    S.currentMemoryQuiz = previous.quiz;
    $('terminal-execution-status').textContent = previous.status;
  }
  renderCommandLesson();
}

function printPracticeEvent(event) {
  if (event.raw === '[模拟机配置]') return;
  appendTerminal('student@sit-server:~$ ' + event.raw, 'prompt');
  if (event.output) appendTerminal(event.output);
}

function practiceCommandLesson(event,parsed=analyseInput(event.raw,{practice:true})){
  const lesson=lessonForRun(event.raw,event.output,parsed,event.failed,event);
  const labels={address:'当前 IPv4',savedAddress:'启动 IPv4',linkUp:'接口管理状态',speed:'协商条件',peerPort:'对端端口',localPort:'本机端口',
    mounted:'挂载',mountUUID:'启动 UUID',diskBusy:'后台 I/O',diskError:'I/O 模拟错误',diskUsed:'盘基础占用',
    boot:'启动轮次',loadId:'活动作业号',elapsed:'作业模拟秒数',
    nicFirmware:'下次启动固件',nicBound:'网卡绑定',hbaCompatible:'下次启动 HBA 模块匹配',hbaBound:'HBA 绑定',
    configuredPort:'服务端口配置',servicePort:'实际服务监听',serviceStatus:'服务状态',fileWritable:'目录组写权限',readOnly:'只读保护',
    inodeUsed:'inode 已用',driveSerial:'测试盘序列号',leakMiB:'进程额外驻留 MiB',rxErrors:'CRC 累计计数',crcFault:'接收误码条件'};
  const changed=event.changed?.filter(key=>labels[key])||[];
  if(changed.length){
    const show=value=>value===null||value===''?'无':typeof value==='boolean'?(value?'开启':'关闭'):String(value);
    lesson.effects=changed.map(key=>labels[key]+' '+show(event.delta[key][0])+' → '+show(event.delta[key][1])).join(' · ');
  }
  return lesson;
}

function executePractice(parsed, run) {
  const segment=parsed.segments[0],event=simulatePracticeCommand(run,parsed);
  printPracticeEvent(event);
  renderKernelWorkbench();
  if (segment?.command === 'clear') $('terminal-output').replaceChildren();
  $('terminal-execution-status').textContent = event.failed ? 'ERROR' : 'COMPLETED';
  S.lastLesson = practiceCommandLesson(event,parsed);
  S.currentMemoryQuiz = makeMemoryQuiz(S.lastLesson);
  learnPracticeCommand(segment,event);
  persistPractice(run);
  renderCommandLesson();
  if (S.page === 'lesson') renderGuidedChecks();
  if (S.page === 'cases') {
    const form = $('network-live-form');
    if (form && event.changed.length && !form.dataset.changed) $('case-live-fields').innerHTML = practiceConfigFields(run.machine);
    renderCaseRun();
  }
  return event.output;
}

function guidedChecks(run) {
  const step=currentGuidedCourse().steps[run.step];
  const events=run.events.slice(run.stepStart);
  const context={events,all:run.events,machine:run.machine};
  return step.checks.map(([label,test])=>[Boolean(test(context)),label]);
}

function renderGuidedChecks() {
  const run = getGuidedRun(), host = $('guided-checks');
  if (!currentGuidedCourse().steps[run.step] || !host) return;
  host.innerHTML = guidedChecks(run).map(([done,label])=>`<li class="${done?'done':''}"><span aria-hidden="true">${done?'✓':'○'}</span> ${label}<span class="sr-only">${done?'已取得':'待取得'}</span></li>`).join('');
  const load=run.machine.load;
  $('guided-boot').textContent = '服务器 A · 第 ' + run.machine.boot + ' 次启动'+(load?' · 作业 #'+load.id+' 运行中 '+load.elapsed+'/'+load.duration+'s':'');
  renderGuidedMeasurements(run);
  renderGuidedEvidence(run);
}

function renderGuidedEvidence(run){
  const host=$('guided-evidence');
  if(!host)return;
  const events=run.events.slice(run.stepStart).filter(e=>!['help','history'].includes(e.kind));
  host.hidden=!events.length;
  const rows=events.slice(-12).map(e=>`<li><button data-practice-evidence="${e.seq}"><code>${esc(e.raw)}</code></button><small>记录 #${e.seq} · 启动 ${e.boot}</small></li>`).join('');
  if (host.dataset.count===String(events.length)&&host.dataset.last===String(events.at(-1)?.seq))return;
  host.dataset.count=events.length;host.dataset.last=events.at(-1)?.seq;
  host.innerHTML=rows?'<summary>查看本步原始记录（'+events.length+' 条）</summary><ul>'+rows+'</ul>':'';
}

function renderGuidedMeasurements(run) {
  const host=$('guided-measurements'), id=currentGuidedCourse().id;
  if(!host)return;
  let columns,rows=[];
  if(id==='fio'||id==='storage-failure'){
    columns=['访问模式','深度','后台磁盘负载','IOPS','带宽 MiB/s','P99 ms','作业结果'];
    rows=run.events.filter(e=>e.kind==='fio').slice(-10).map(e=>[e.config.rw,e.config.depth,e.diskBusy?'开启':'关闭',e.metrics?.iops??'—',e.metrics?.bw??'—',e.metrics?.p99??'—',e.reason?e.output:'已完成']);
  }
  if(id==='fio-time'){
    columns=['引擎','请求深度','有效并发','实际秒数','IOPS','P99 ms'];
    rows=run.events.filter(e=>e.kind==='fio'&&e.metrics).slice(-10)
      .map(e=>[e.config.engine,e.config.depth,e.metrics.effective,e.metrics.elapsed,e.metrics.iops,e.metrics.p99]);
  }
  if(id==='throughput'||id==='network-errors'){
    columns=['协议','方向','目标发送 Mb/s','接收 Mb/s','Lost%','TCP 重传'];
    rows=run.events.filter(e=>e.kind==='transfer'&&!e.failed).slice(-10)
      .map(e=>[e.udp?'UDP':'TCP',e.reverse?'反向':'正向',e.offered??'未设置',e.rate.toFixed(1),e.udp?e.loss+'%':'—',e.udp?'—':e.retries??0]);
  }
  if(id==='pressure'){
    columns=['作业号','采样工具','可用 GiB','Swap 已用 GiB','CPU %'];
    rows=run.events.filter(e=>['memory','monitor'].includes(e.kind)).slice(-10)
      .map(e=>[e.loadId||'空载',e.kind==='memory'?'free':'vmstat',e.available.toFixed(2),e.swap.toFixed(2),e.cpu.toFixed(0)]);
  }
  if(id==='memory-trend'||id==='cpu-vs-io'){
    columns=['虚拟时间 s','采样工具','后台进程 RSS MiB','可用 GiB','可运行 / 阻塞','CPU 使用 / 等待 %'];
    rows=run.events.filter(e=>['memory','monitor','process'].includes(e.kind)).slice(-10)
      .map(e=>[e.sampleTime,e.command||e.raw,e.workerMiB,e.available.toFixed(2),e.running+' / '+e.blocked,e.cpu+' / '+e.wait]);
  }
  if(id==='acceptance'){
    columns=['轮次','条件','实际 IOPS','验收线','状态'];
    rows=run.events.filter(e=>e.kind==='fio'&&labComparableDisk(e,'randread',16)).slice(-10)
      .map(e=>['启动 '+e.boot,e.diskBusy?'后台 I/O 开启':'后台 I/O 关闭',e.metrics?.iops??'无',38000,e.reason==='not-mounted'?'BLOCKED':e.failed||e.metrics.iops<38000?'FAIL':'PASS']);
  }
  host.hidden=!rows.length;
  if(!rows.length){host.replaceChildren();return;}
  const cell=(tag,values)=>'<tr>'+values.map(v=>'<'+tag+'>'+esc(v)+'</'+tag+'>').join('')+'</tr>';
  host.innerHTML='<h2>本课实测记录（模拟）</h2><div class="guided-result-scroll"><table><thead>'+cell('th',columns)+'</thead><tbody>'+rows.map(row=>cell('td',row)).join('')+'</tbody></table></div>';

}

function recommendedGuidedCourse() {
  const last = GUIDED_COURSES_BY_ID.get(S.experience.guidedId);
  if (last && getGuidedRun(last.id)?.step < last.steps.length) return last;
  return GUIDED_COURSES.find(c=>(getGuidedRun(c.id)?.step ?? 0)<c.steps.length)||GUIDED_COURSES[0];
}

function renderLearningHome() {
  const recommended = recommendedGuidedCourse(), run = getGuidedRun(recommended.id);
  const done = GUIDED_COURSES.filter(c=>getGuidedRun(c.id)?.step===c.steps.length).length;
  const totalSteps=GUIDED_COURSES.reduce((sum,c)=>sum+c.steps.length,0);
  const finishedSteps=GUIDED_COURSES.reduce((sum,c)=>sum+Math.min(getGuidedRun(c.id)?.step||0,c.steps.length),0);
  const percent=Math.round(finishedSteps/totalSteps*100), active=Boolean(run&&run.step<recommended.steps.length);
  const cards = GUIDED_COURSES.map((course,index)=>{
    const practice = getGuidedRun(course.id);
    const complete=practice?.step===course.steps.length;
    const status = complete?'已完成':practice?'进行中 · '+(practice.step+1)+' / '+course.steps.length:'未开始';
    const style=studioCourseStyle(course),progress=Math.min(practice?.step||0,course.steps.length)/course.steps.length*100;
    return `<article class="panel guided-card tone-${style.hue}" data-level="${course.level}" data-topic="${esc(course.group)}" data-search="${esc((course.title+' '+course.description+' '+course.group+' '+course.id).toLowerCase())}"><div class="course-cover"><div class="course-cover-heading"><span>${style.name}</span><span>${String(index+1).padStart(2,'0')}</span></div>${studioCourseArt(style.kind)}<span class="course-difficulty">${course.level==='基础'?'初级 · FOUNDATION':'中级 · INTERMEDIATE'}</span><span class="course-cover-icon">${studioIcon(style.icon)}</span></div><div class="course-card-body"><div class="course-meta"><span>${course.group}</span><small class="${complete?'is-complete':''}">${complete?studioIcon('check'):''}${status}</small></div><h3>${course.title}</h3><p>${course.description}</p><div class="course-bottom"><span>${course.steps.length} 个实操步骤</span><button data-guided-course="${course.id}" aria-label="${complete?'查看复盘':practice?'继续实训':'开始学习'}：${esc(course.title)}">${complete?'查看复盘':practice?'继续实训':'开始学习'} ${studioIcon('arrow-up-right')}</button></div></div><div class="card-progress" aria-label="已完成步骤 ${practice?.step||0} / ${course.steps.length}"><i style="width:${progress}%"></i></div></article>`;
  }).join('');
  $('learning-home').innerHTML = `<section class="studio-hero"><div class="hero-copy"><div class="hero-eyebrow"><span class="hero-line"></span> YOUR NEXT ENGINEERING CHAPTER</div><h1>让每一次排查，<br>成为真正的<span class="hero-accent">能力<span class="accent-dot">.</span></span></h1><p>在浏览器里，走进你的服务器实验室。<br>从第一条命令，到独立定位问题、验证并交付。</p><div class="hero-actions"><button class="primary" data-guided-course="${recommended.id}">${studioIcon('terminal')}${active?'继续我的实训':'开始第一场实训'} ${studioIcon('arrow-right')}</button><button class="hero-secondary" data-studio="catalog">探索课程 ${studioIcon('chevron-down')}</button></div><div class="hero-footnote"><span>${studioIcon('check')} 完全离线</span><span>${studioIcon('check')} 按任务推进</span><span>${studioIcon('check')} 即刻动手</span></div></div>${studioServerArt()}</section>
  <div class="studio-metrics"><div><span class="metric-glyph">${studioIcon('layers')}</span><span><b>${GUIDED_COURSES.length}<em>个</em></b><small>完整实训案例</small></span><span class="metric-mini">HANDS-ON</span></div><div><span class="metric-glyph">${studioIcon('workflow')}</span><span><b>${totalSteps}<em>步</em></b><small>从操作走向判断</small></span><span class="metric-mini">STEP BY STEP</span></div><div><span class="metric-glyph">${studioIcon('terminal')}</span><span><b>3<em>大</em></b><small>fio / iperf3 / stress</small></span><span class="metric-mini">CORE TOOLKIT</span></div><div><span class="metric-glyph">${studioIcon('circle-check')}</span><span><b>${done}<em>/ ${GUIDED_COURSES.length}</em></b><small>已完成课程</small></span><span class="metric-mini">YOUR PROGRESS</span></div></div>
  <section class="continue-learning"><div class="learning-ring" style="--progress:${percent}%" aria-label="操作步骤完成 ${percent}%"><span>${percent}<small>%</small></span></div><div class="continue-copy"><span>${active?'CONTINUE LEARNING · 接着上次的进度':'RECOMMENDED NEXT · 下一站实训'}</span><h2>${recommended.title}</h2><p>${recommended.group} <i>·</i> ${recommended.steps.length} 个步骤 <i>·</i> ${active?'已完成 '+run.step+' 步，进度已保存':'读懂现象，动手验证，用证据作答'}</p></div><button data-guided-course="${recommended.id}">${active?'继续学习':'进入课程'} ${studioIcon('arrow-right')}</button></section>
  <section id="course-catalog" class="course-catalog"><div class="section-heading guided-course-list-title"><div><p class="section-kicker">LEARNING PATH</p><h2>同页实训课程<span class="count-badge">${GUIDED_COURSES.length}</span></h2></div><span>每一次实操，都离独立工作更近一步。</span></div><div class="course-catalog-filter"><label class="catalog-search">${studioIcon('search')}<input id="catalog-search" type="search" placeholder="找到你想解决的问题…" aria-label="搜索实训课程"></label><label><span class="sr-only">难度</span><select id="catalog-level" aria-label="课程难度"><option value="">全部难度</option><option value="基础">初级</option><option value="进阶">中级</option></select></label><label><span class="sr-only">方向</span><select id="catalog-topic" aria-label="课程方向"><option value="">全部方向</option>${[...new Set(GUIDED_COURSES.map(c=>c.group))].map(group=>'<option>'+esc(group)+'</option>').join('')}</select></label><p id="catalog-count" aria-live="polite"></p></div><div class="guided-course-grid">${cards}</div><div id="catalog-empty" class="catalog-empty" hidden>${studioIcon('search')}<h3>暂时没有匹配的课程</h3><p>换一个关键词，或清除筛选看看全部实训。</p><button data-studio="clear-filter">清除筛选</button></div></section>
  <div class="learn-home-links"><section class="panel studio-next"><span class="next-icon">${studioIcon('workflow')}</span><p class="section-kicker">GO DEEPER</p><h2>把单项技能，串成完整项目。</h2><p>进入 24 节进阶专题，练习测试方案、兼容性矩阵与项目交付。</p><button data-go="academy">探索进阶路径 ${studioIcon('arrow-up-right')}</button></section><section class="panel studio-next"><span class="next-icon">${studioIcon('flask-conical')}</span><p class="section-kicker">BRING YOUR OWN PROBLEM</p><h2>让工作中的问题，在这里重现。</h2><p>带上现场现象和日志，配置你的模拟服务器，开始新一轮排查。</p><button data-go="cases">打开案例实验室 ${studioIcon('arrow-up-right')}</button></section></div><div class="home-colophon"><span>SIT LAB</span><span>UNDERSTAND THE SYSTEM. OWN THE PROCESS.</span><a href="#reference">打开命令手册 ↗</a></div>`;
  $('catalog-level').value=S.ui.catalogLevel||'';
  $('catalog-topic').value=S.ui.catalogTopic||'';
  filterGuidedCatalog();
}

function filterGuidedCatalog(){
  const level=$('catalog-level').value, topic=$('catalog-topic').value;
  const query=($('catalog-search')?.value||'').trim().toLowerCase();
  let visible=0;
  for(const card of document.querySelectorAll('.guided-card')){
    card.hidden=Boolean(level&&level!==card.dataset.level||topic&&topic!==card.dataset.topic||query&&!card.dataset.search.includes(query));
    if(!card.hidden)visible++;
  }
  $('catalog-count').textContent='显示 '+visible+' / '+GUIDED_COURSES.length+' 个案例';
  $('catalog-empty').hidden=visible!==0;

}

function renderGuided() {
  const course=currentGuidedCourse(), run = getGuidedRun(), step = course.steps[run.step];
  $('guided-terminal').hidden = !step;
  $('guided-intro').innerHTML = `<div class="learn-course-heading"><div><p class="learn-kicker">${course.group} · ${course.level==='基础'?'初级':'中级'}</p><h1>${course.title}</h1></div><button data-go="home">返回课程目录</button></div><ol class="learn-steps" style="--step-count:${course.steps.length}" aria-label="课程进度">${course.steps.map((entry,i)=>`<li class="${i===run.step?'current':i<run.step?'complete':''}" ${i===run.step?'aria-current="step"':''}><span>${i<run.step?'✓':i+1}</span>${entry.title}</li>`).join('')}</ol>`;
  $('guided-exercise').hidden = !step;
  if (!step) {
    const next=GUIDED_COURSES[GUIDED_COURSES.indexOf(course)+1];
    $('guided-intro').insertAdjacentHTML('beforeend',`<div class="panel learn-completion"><h2>本课已完成</h2><p>${course.recap}</p><div class="inline-actions">${course.challenge?'<button class="primary" data-action="challenge-case">进入独立练习 →</button>':''}${next?'<button data-guided-course="'+next.id+'">学习下一课</button>':''}<button data-action="export-guided">导出本课证据</button><button data-action="reset-guided">从头复练</button></div></div>`);
    return;
  }
  const worked=step.example||LESSON_WALKTHROUGHS[course.id][run.step];
  const example=`<details class="worked-example" ${run.step===0?'open':''}><summary>看懂一个例子 · ${esc(worked[0])}</summary>
    <dl><dt>看到什么</dt><dd>${esc(worked[1])}</dd><dt>怎么读、能说明什么</dt><dd>${esc(worked[2])}</dd><dt>怎么继续验证</dt><dd>${esc(worked[3])}</dd></dl></details>`;
  $('guided-intro').insertAdjacentHTML('beforeend',`<section class="panel learn-task"><div><h2>${step.title}</h2><p>${step.goal}</p><p class="learn-concept">${step.concept}</p></div><span id="guided-boot"></span>${example}<details><summary>本步操作提示${step.sample?'与输出样例':''}</summary>${step.sample?'<pre class="light-log course-output-sample">'+esc(step.sample)+'</pre>':''}<div class="learn-commands">${practiceCommandButtons(step.commands)}</div></details></section>`);
  $('guided-exercise').innerHTML = `<section class="panel"><h2>本步证据</h2><ul id="guided-checks" class="learn-checks"></ul><details id="guided-evidence" hidden></details></section><form id="guided-answer" class="panel"><fieldset><legend>${step.question}</legend>${step.choices.map((choice,i)=>`<label class="learn-option"><input type="radio" name="choice" value="${i}" required>${choice}</label>`).join('')}</fieldset><p id="guided-feedback" class="learn-feedback" role="status"></p><div class="inline-actions"><button class="primary">检查并继续</button><button type="button" data-action="retry-guided-step">重做本步</button></div></form>`;
  $('guided-exercise').insertAdjacentHTML('beforeend','<section id="guided-measurements" class="panel guided-measurements" hidden></section>');
  renderGuidedChecks();
}

function practiceCommandButtons(commands) {
  return commands.map(command => `<button type="button" data-practice-command="${esc(command)}" title="填到终端输入框">${esc(command)}</button>`).join('');
}

const CASE_FIELDS = [
  ['title','案例名称','例如 维护重启后地址消失'],['environment','现场环境','例如 系统版本、网卡、配置工具或拓扑'],
  ['expected','预期行为','例如 重启后仍可访问同网段对端'],['symptom','实际现象','例如 链路灯正常，但 ping 不通'],
  ['steps','现场复现步骤','记录触发条件和执行过的操作'],['logs','现场日志','可粘贴脱敏后的日志或命令输出']
];

function renderCases() {
  const active = currentPractice(), cases = S.experience.cases;
  const initial = {...LAB_NETWORK,...LAB_SYSTEM,savedAddress:''};
  $('case-intro').innerHTML = `<div class="learn-course-heading"><div><p class="learn-kicker">实验室</p><h1>工作问题复现</h1><p>保存现场材料，设置网络、存储或资源条件，再运行命令取证。</p></div><button data-go="terminal">打开综合实验工具</button></div>
  <div class="case-controls panel"><label for="case-picker">本机案例</label><select id="case-picker"><option value="">选择案例</option>${cases.map(c=>`<option value="${esc(c.id)}" ${active?.id===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select><button data-action="new-network-case">新建案例</button><label class="case-import">导入 JSON<input id="case-import" type="file" accept=".json,application/json"></label></div>
  ${active ? `<div class="panel case-header"><div><h2>${esc(active.title)}</h2><p>${esc(active.symptom || '本案例尚未填写现场现象。')}</p></div><div class="inline-actions"><button data-action="export-network-case">导出案例</button><button data-action="reset-network-case">重置到初始环境</button><button data-action="delete-network-case">删除案例</button></div></div>` : ''}
  <details class="panel case-editor" ${active?'':'open'}><summary>${active?'编辑现场材料与初始条件':'填写新案例'}</summary>
  <form id="network-case-form"><div class="case-form-grid">${CASE_FIELDS.map(([key,label,hint])=>`<label>${label}${key==='logs'||key==='steps'?`<textarea name="${key}" maxlength="${key==='logs'?18000:3000}" rows="3" placeholder="${hint}">${esc(active?.[key]||'')}</textarea>`:`<input name="${key}" maxlength="${key==='title'?100:1000}" ${key==='title'?'required':''} value="${esc(active?.[key]||'')}" placeholder="${hint}">`}</label>`).join('')}</div>
  <h3>要验证的模拟初始条件</h3><p>起始地址影响此刻，启动配置影响模拟重启后。保存初始条件后可用重置重新开一轮。</p>${practiceConfigFields(active?.initial||initial)}<button class="primary">${active?'保存案例资料与初始条件':'保存并打开终端'}</button><p id="case-form-feedback" class="learn-feedback" role="status"></p></form></details>`;
  $('case-terminal').hidden = !active;
  $('case-experiment').hidden = !active;
  $('case-results').hidden = !active;
  if (active) {
    $('case-experiment').innerHTML = `<details class="panel case-editor"><summary>调整当前模拟机</summary><form id="network-live-form"><p>观察当前状态后再改一个条件。每次应用都会记录到本轮模拟日志。</p><div id="case-live-fields">${practiceConfigFields(active.machine)}</div><button class="primary">应用到当前模拟机</button><p id="live-form-feedback" class="learn-feedback" role="status"></p></form></details><details class="case-command-help"><summary>支持的命令示例</summary><div class="learn-commands">${practiceCommandButtons(['ip -br addr','ethtool enp3s0','ping -c 2 192.168.10.20','lsblk -f','findmnt /mnt/sit','df -hT','iostat -x 1','free -h','vmstat 1','top','dmesg -T','help'])}</div></details>`;
    renderCaseRun();
  }
}

function practiceConfigFields(input) {
  const n={...LAB_SYSTEM,...HOST_DEFAULTS,...input};
  const yesNo=(key,label,yes,no)=>`<label>${label}<select name="${key}"><option value="1" ${n[key]?'selected':''}>${yes}</option><option value="0" ${!n[key]?'selected':''}>${no}</option></select></label>`;
  return `<section class="case-fields-block"><h4>网络</h4><div class="case-form-grid">${networkConfigFields(n)}</div></section>
    <section class="case-fields-block"><h4>存储</h4><div class="case-form-grid">
      ${yesNo('diskPresent','测试盘 /dev/sdb1','可见','掉盘')}
      ${yesNo('mounted','当前挂载 /mnt/sit','已挂载','未挂载')}
      <label>启动配置 UUID<select name="mountUUID"><option value="SIM-TEST-01" ${n.mountUUID===LAB_DISK_UUID?'selected':''}>SIM-TEST-01（匹配）</option><option value="SIM-TEST-99" ${n.mountUUID!==LAB_DISK_UUID?'selected':''}>SIM-TEST-99（不匹配）</option></select></label>
      <label>基础磁盘占用 (%)<input type="number" name="diskUsed" min="0" max="100" step="1" value="${n.diskUsed}" required></label>
      ${yesNo('diskBusy','后台磁盘负载','运行中','关闭')}
      ${yesNo('diskError','模拟 I/O 错误','开启','关闭')}
      <label>已准备的测试文件 (MiB)<input type="number" name="fileMiB" min="0" max="65536" step="1" value="${n.fileMiB}" required><small>0 表示写入需要先分配空间</small></label>
    </div></section>
    <section class="case-fields-block"><h4>资源</h4><div class="case-form-grid">
      <label>后台内存占用 (GiB)<input type="number" name="resident" min="0" max="16" step="0.1" value="${n.resident}" required></label>
      <label>后台 CPU 占用 (%)<input type="number" name="cpuBackground" min="0" max="99" step="1" value="${n.cpuBackground}" required></label>
    </div></section>
    <details class="case-fields-block"><summary>驱动、服务和其它故障条件</summary><div class="case-form-grid">
      ${yesNo('nicFirmware','下一次启动可用固件','固件存在','固件缺失')}
      ${yesNo('hbaCompatible','下一次启动 HBA 模块','匹配','版本不匹配')}
      ${yesNo('fileWritable','测试组目录写权限','允许','禁止')}
      ${yesNo('readOnly','卷保护模式','只读','读写')}
      ${yesNo('crcFault','接收链路误码','注入','正常')}
      <label>sit-agent 启动端口配置<input name="configuredPort" value="${esc(n.configuredPort)}" maxlength="12"><small>变更后重启服务或主机才会应用</small></label>
      <label>预置已用 inode<input type="number" name="inodeUsed" min="0" max="1000" step="1" value="${n.inodeUsed}" required></label>
      <label>SMART 待处理扇区<input type="number" name="pendingSectors" min="0" max="1000" step="1" value="${n.pendingSectors}" required></label>
      <label>后台内存增长 (MiB/虚拟秒)<input type="number" name="leakRate" min="0" max="100" step="1" value="${n.leakRate}" required></label>
    </div></details>`;
}

function networkConfigFields(n) {
  return `<label>当前 IPv4 / 前缀<input name="address" value="${esc(n.address)}" placeholder="留空表示没有地址"></label><label>启动配置 IPv4 / 前缀<input name="savedAddress" value="${esc(n.savedAddress)}" placeholder="留空表示重启无地址"></label><label>接口管理状态<select name="up"><option value="1" ${n.up?'selected':''}>UP</option><option value="0" ${!n.up?'selected':''}>DOWN</option></select></label><label>链路协商<select name="speed">${[[1000,'千兆'],[100,'百兆'],[0,'无载波']].map(([value,label])=>`<option value="${value}" ${n.speed===value?'selected':''}>${label}</option>`).join('')}</select></label><label>到对端的路由<select name="badRoute"><option value="0" ${!n.badRoute?'selected':''}>按地址和前缀使用直连路由</option><option value="1" ${n.badRoute?'selected':''}>错误的主机路由</option></select></label><label>对端监听端口<input name="peerPort" type="number" min="0" max="65535" value="${n.peerPort}" required><small>0 表示服务未监听</small></label>`;
}

function readNetworkConfig(input) {
  const config = {};
  for (const name of ['address','savedAddress']) {
    const raw = String(input[name] || '').trim(), addr = readLabCidr(raw);
    if (raw && !addr) throw Error('地址请使用 IPv4/前缀格式，例如 192.168.10.10/24。对端和网关地址已预留。');
    config[name] = addr ? addr.ip + '/' + addr.prefix : '';
  }
  const speed = Number(input.speed), peerPort = Number(input.peerPort);
  if (![0,100,1000].includes(speed) || !Number.isInteger(peerPort) || peerPort < 0 || peerPort > 65535) throw Error('请检查链路速率和对端端口。');
  const defaults={...LAB_NETWORK,...LAB_SYSTEM,...HOST_DEFAULTS};
  const flag=key=>input[key]===undefined?defaults[key]:input[key]===true||input[key]==='1';
  for(const [key,max] of [['diskUsed',100],['fileMiB',65536],['resident',16],['cpuBackground',99],['inodeUsed',LAB_INODES],['pendingSectors',1000],['leakRate',100]]){
    config[key]=input[key]===undefined?defaults[key]:numberIn(input[key],0,max);
    if(config[key]===null||(key!=='resident'&&!Number.isInteger(config[key])))throw Error('请检查占用、测试文件大小和后台资源值。');
  }
  const diskPresent=flag('diskPresent');
  return {...config,up:flag('up'),speed,badRoute:flag('badRoute'),peerPort,diskPresent,mounted:diskPresent&&flag('mounted'),
    mountUUID:input.mountUUID==='SIM-TEST-99'?input.mountUUID:LAB_DISK_UUID,diskBusy:flag('diskBusy'),diskError:flag('diskError'),
    nicFirmware:flag('nicFirmware'),hbaCompatible:flag('hbaCompatible'),fileWritable:flag('fileWritable'),readOnly:flag('readOnly'),
    crcFault:flag('crcFault'),configuredPort:String(input.configuredPort??defaults.configuredPort).slice(0,12)};
}

function caseVerdictText(c){
  const verdict=c.verdict||'未判定';
  return c.verdictRevision!==undefined&&c.verdictRevision<c.machine.revision
    ?verdict+'（记录于变更前，当前环境待复核）':verdict;
}

function appendCaseRunRecord(c) {
  if (!c.events.length && !c.conclusion) return;
  c.previous.push({at:stamp(),events:c.events,conclusion:c.conclusion||'',verdict:caseVerdictText(c)});
  if (c.previous.length > 8) c.previous.shift();
}

function renderCaseRun() {
  const c = currentPractice();
  if (!c) return;
  const last = c.events.at(-1);
  const previous = c.previous.map(r=>`<details><summary>${esc(r.at)} · ${r.events.length} 条操作</summary><p>${esc(r.conclusion||'本轮未填写结论。')}</p><pre class="light-log">${esc(r.events.map(e=>'$ '+e.raw+'\n'+e.output).join('\n\n'))}</pre></details>`).join('');
  const status = `<div class="case-conclusion-controls"><label for="case-verdict">本轮判定</label><select id="case-verdict">${['未判定','PASS','FAIL','BLOCKED','NOT RUN'].map(status=>'<option '+((c.verdict||'未判定')===status?'selected':'')+'>'+status+'</option>').join('')}</select><button data-action="export-case-report">导出 Markdown 报告</button></div>`;
  $('case-results').innerHTML = `<div class="panel case-record"><div class="panel-title"><h2>本轮模拟记录</h2><span>第 ${c.machine.boot} 次启动 · ${c.events.length} 条操作</span></div><p>${last?`最近操作 <code>${esc(last.raw)}</code> · ${last.failed?'返回错误':'已返回结果'}`:'输入命令后，这里会保留操作及输出。'}</p>${status}${caseVerdictText(c)!==(c.verdict||'未判定')?'<p class="case-verdict-note">此判定记录于环境变更前，请复测后重新选择本轮判定。</p>':''}<label>排查结论<textarea id="case-conclusion" rows="3" maxlength="3000" placeholder="记录你的假设、关键证据、验证结果和仍待确认的问题。">${esc(c.conclusion||'')}</textarea></label><small>自动保存到本轮</small>${previous?`<details class="case-history"><summary>查看重置前的 ${c.previous.length} 轮记录</summary>${previous}</details>`:''}</div>`;
}

function displayNetworkCase(id) {
  S.experience.selectedCase = id;
  persistPractice(currentPractice('cases'));
  showPage('cases');
}

function saveNetworkCase(fields, initial) {
  const active = currentPractice();
  const entries = Object.fromEntries(CASE_FIELDS.map(([key])=>[key, String(fields[key]||'').trim().slice(0,key==='logs'?18000:key==='steps'?3000:key==='title'?100:1000)]));
  if (!entries.title) throw Error('请填写案例名称。');
  if (active) {
    Object.assign(active, entries, {initial});
    persistPractice(active);
    renderCases();
    toast('案例已保存。选择重置可应用新的初始条件。');
  } else {
    createNetworkCase(entries, initial);
  }
}

function createNetworkCase(entries, initial) {
  if (S.experience.cases.length >= 30) throw Error('当前已保存 30 个案例，请先导出并删除无需保留的案例。');
  const c = {id:'CASE-'+Date.now()+'-'+S.experience.cases.length,...entries,initial,...createPracticeRun(initial),previous:[]};
  S.experience.cases.push(c);
  displayNetworkCase(c.id);
  return c;
}

function startGuided(reset=false,id=currentGuidedCourse().id) {
  const course=GUIDED_COURSES_BY_ID.get(id);
  if(!course)return;
  S.experience.guidedId=id;
  if (reset || !getGuidedRun(id)) {
    const run = createPracticeRun({...LAB_NETWORK,...course.initial});
    saveGuidedRun(id,{...run,step:0,stepStart:0,stepMachine:structuredClone(run.machine)});
  }
  persistPractice(getGuidedRun(id));
  showPage('lesson');
}

function submitGuidedAnswer(form) {
  const run = getGuidedRun(), step = currentGuidedCourse().steps[run.step], feedback = $('guided-feedback');
  const missing = guidedChecks(run).find(([done])=>!done);
  if (missing) {feedback.textContent = '本步还需'+missing[1]+'。请在终端操作后再检查。';return;}
  if (Number(new FormData(form).get('choice')) !== step.answer) {feedback.textContent = '再对照本轮输出。'+step.feedback;return;}
  run.step++;
  run.stepStart = run.events.length;
  run.stepMachine = structuredClone(run.machine);
  persistPractice(run);
  renderGuided();
  $('guided-intro').scrollIntoView({block:'start'});
  toast(step.feedback);
}

function renderExperiencePage() {
  if (S.page === 'home') renderLearningHome();
  if (S.page === 'lesson') renderGuided();
  if (S.page === 'cases') renderCases();
  if (S.page === 'mistakes') renderGuidedHistory();
}

function renderGuidedHistory() {
  const started=GUIDED_COURSES.filter(c=>getGuidedRun(c.id));
  const list=started.map(c=>{
    const run=getGuidedRun(c.id);
    const status=run.step===c.steps.length?'已完成':'第 '+(run.step+1)+' 步 / '+c.steps.length;
    return `<li><button data-guided-course="${c.id}">${c.title}</button> · ${status}</li>`;
  }).join('');
  $('guided-history').innerHTML='<h2>同页实训进度</h2>'+(list?'<ul>'+list+'</ul>':'<p>开始实训后，可在这里继续上次的课程。</p>')+'<button data-go="home">打开课程目录</button>';
}

function handleExperienceClick(button) {
  const action = button.dataset.action;
  if(button.dataset.guidedCourse){startGuided(false,button.dataset.guidedCourse);return true;}
  if(button.dataset.practiceEvidence){
    const event=currentPractice()?.events.find(entry=>entry.seq===Number(button.dataset.practiceEvidence));
    if(event){
      S.lastLesson=practiceCommandLesson(event);
      S.currentMemoryQuiz=makeMemoryQuiz(S.lastLesson);
      S.coach.hidden=false;renderCommandLesson();
      document.querySelector('.command-coach').scrollIntoView({block:'nearest'});
    }
    return true;
  }
  if(button.dataset.studyCommand){
    showPage('terminal');$('command').value=button.dataset.studyCommand;$('command').focus();return true;
  }
  if (button.dataset.practiceCommand) {
    $('command').value = button.dataset.practiceCommand;
    $('command').focus();
    return true;
  }
  if (action === 'open-guided' || action === 'reset-guided') {startGuided(action === 'reset-guided');return true;}
  if (action === 'retry-guided-step') {
    const run = getGuidedRun();
    if (!run.stepMachine) {startGuided(true);return true;}
    saveGuidedRun(currentGuidedCourse().id,{...run,machine:structuredClone(run.stepMachine),events:run.events.slice(0,run.stepStart)});
    persistPractice(getGuidedRun());
    showPage('lesson');
    toast('已恢复本步开始时的环境。');
    return true;
  }
  if (action === 'new-network-case') {displayNetworkCase('');return true;}
  if (action === 'challenge-case') {
    const challenge=currentGuidedCourse().challenge;
    if(!challenge)return true;
    const {initial,...facts}=challenge;
    try {createNetworkCase(facts,{...LAB_NETWORK,...initial});}
    catch(error){toast(error.message);}
    return true;
  }
  if(action==='export-guided'){
    const course=currentGuidedCourse(),run=getGuidedRun();
    downloadText(course.id+'-practice.md','# '+course.title+'\n\n'+course.recap+'\n\n'+reportTrace(run.events));
    return true;
  }
  if (action === 'reset-network-case') {
    const c = currentPractice();
    appendCaseRunRecord(c);
    Object.assign(c,createPracticeRun(c.initial));
    c.conclusion = '';
    c.verdict = '';
    delete c.verdictRevision;
    $('terminal-output').replaceChildren();
    $('terminal-execution-status').textContent = 'READY';
    S.lastLesson=null;S.currentMemoryQuiz=null;
    renderCommandLesson();
    displayNetworkCase(c.id);
    toast('已恢复案例的初始环境。上一轮模拟操作已保留。');
    return true;
  }
  if(action==='export-case-report'){
    const c=currentPractice();
    downloadText('sit-case-report.md',caseReport(c));
    return true;
  }
  if (action === 'export-network-case') {
    const c = currentPractice();
    const record = {format:'sit-network-case', version:1, ...c};
    delete record.cursor;
    downloadText('sit-network-case.json',JSON.stringify(record,null,2),'application/json');
    return true;
  }
  if (action === 'delete-network-case') {
    const c = currentPractice();
    if (!c || !window.confirm('删除本机案例「'+c.title+'」及其模拟记录？')) return true;
    pendingPracticeNotes.delete(c);
    S.experience.cases = S.experience.cases.filter(item=>item!==c);
    displayNetworkCase('');
    return true;
  }
  return false;
}

function reportTrace(events){
  return events.map(e=>'- '+(e.seq?'记录 #'+e.seq+' / ':'')+e.at+' / '+(e.environment?.kernel||'旧记录未标注内核')+' / 环境 '+(e.environmentKey||'未标注')+' / 启动 '+e.boot+' / '+(e.failed?'执行返回错误':'获得结果')+'\n\n'
    + ('> '+e.raw+'\n'+e.output).split('\n').map(line=>'    '+line).join('\n')).join('\n\n');
}

function caseReport(c) {
  const facts=CASE_FIELDS.filter(([key])=>key!=='title').map(([key,label])=>'## '+label+'\n\n'+(c[key]||'未填写')).join('\n\n');
  const previous=c.previous.map((run,index)=>'### 第 '+(index+1)+' 轮 · '+run.at+'\n\n'+(run.verdict||'未判定')+'\n\n'+(run.conclusion||'未填写结论')+'\n\n'+reportTrace(run.events)).join('\n\n');
  return '# '+c.title+'\n\n本地模拟案例报告 · '+stamp()+'\n\n'+facts+'\n\n## 模拟初始条件\n\n'
    +JSON.stringify(c.initial,null,2).split('\n').map(line=>'    '+line).join('\n')+'\n\n## 本轮验证\n\n学习者判定 '+caseVerdictText(c)
    +'\n\n'+(c.conclusion||'未填写排查结论。')+'\n\n'+(reportTrace(c.events)||'未执行模拟操作。')+'\n\n## 已归档轮次\n\n'+(previous||'没有归档轮次。');
}

function initExperience() {
  S.experience.courses ||= {};
  if(S.experience.guided){
    S.experience.courses.network??=S.experience.guided;
    delete S.experience.guided;
  }
  restorePracticeLearned(S.coach);
  for(const run of [...Object.values(S.experience.courses),...S.experience.cases])restorePracticeRun(run);
  if(!practiceStoreReady){
    const hadLegacy=Boolean(stored.experience);
    persistPractice();
    if(hadLegacy&&practiceStoreReady)persist();
  }
  window.addEventListener('pagehide',flushPracticeNotes);
  document.addEventListener('input',event=>{
    if(event.target.id==='case-conclusion'){
      currentPractice().conclusion=event.target.value;
      deferPracticeNote(currentPractice());
      return;
    }
    const form=event.target.form;
    if(form?.id==='network-live-form'){
      const changed=new Set((form.dataset.changed||'').split(',').filter(Boolean));
      changed.add(event.target.name);
      form.dataset.changed=[...changed].join(',');
    }
  });
  document.addEventListener('submit',event=>{
    const form = event.target;
    if (!['guided-answer','network-case-form','network-live-form'].includes(form.id)) return;
    event.preventDefault();
    if (form.id === 'guided-answer') {submitGuidedAnswer(form);return;}
    const entries = Object.fromEntries(new FormData(form));
    try {
      const config = readNetworkConfig(entries);
      if (form.id === 'network-case-form') {saveNetworkCase(entries,config);return;}
      const run = currentPractice();
      const change=applyPracticeConfig(run,config,(form.dataset.changed||'').split(',').filter(Boolean));
      delete form.dataset.changed;
      $('case-live-fields').innerHTML=practiceConfigFields(run.machine);
      if(!change){$('live-form-feedback').textContent='当前配置没有变化。';return;}
      persistPractice(run);renderCaseRun();
      $('live-form-feedback').textContent='已应用。回到终端验证受影响的状态。';
    } catch(error) {form.querySelector('[role=status]').textContent=error.message;}
  });
  document.addEventListener('change',async event=>{
    if(['catalog-level','catalog-topic'].includes(event.target.id)){
      S.ui.catalogLevel=$('catalog-level').value;
      S.ui.catalogTopic=$('catalog-topic').value;
      filterGuidedCatalog();
      return;
    }
    if (event.target.id === 'case-verdict') {
      const run=currentPractice();
      run.verdict=event.target.value;
      run.verdictRevision=run.machine.revision;
      persistPractice(run);
      renderCaseRun();
      return;
    }
    if (event.target.id === 'case-picker') {displayNetworkCase(event.target.value);return;}
    if (event.target.id !== 'case-import') return;
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 12000000) throw Error('案例文件过大。');
      const record = JSON.parse(await file.text());
      if (record.format !== 'sit-network-case' || record.version !== 1 || !record.initial || !String(record.title||'').trim()) throw Error('请选择本站导出的网络案例 JSON。');
      if (S.page !== 'cases') return;
      const entries = Object.fromEntries(CASE_FIELDS.map(([key])=>[key,String(record[key]||'').slice(0,key==='logs'?18000:key==='steps'?3000:key==='title'?100:1000)]));
      createNetworkCase(entries,readNetworkConfig(record.initial));
      toast('已导入现场材料和初始配置，新的模拟轮次已打开。');
    } catch(error) {toast(error instanceof SyntaxError?'案例文件不是有效的 JSON。':error.message);event.target.value='';}
  });
}
