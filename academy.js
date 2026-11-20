'use strict';
function courseRecord(id){return S.academy.records[id];}
function beginCourse(id){
 const lesson=SIT_COURSE.find(l=>l.id===id);if(!lesson||assessmentActive())return;
 S.academy.selected=id;if(!courseRecord(id))S.academy.records[id]=newCourseRecord(id);
 persist();showPage('academy');
}
function courseEvents(record){
 const map=new Map();record.evidence.forEach(e=>map.set(e.seq,e));
 S.coach.events.filter(e=>e.seq>record.seqStart&&(
  e.lessonId===record.lessonId&&e.projectId===record.projectId&&e.attemptId===record.attemptId||
  !e.lessonId&&e.seq<=record.legacyBoundarySeq&&(!e.projectId||e.projectId===record.projectId)
 )).forEach(e=>map.set(e.seq,e));
 return [...map.values()].sort((a,b)=>a.seq-b.seq);
}
function courseChecks(lesson,record){
  const events=courseEvents(record).filter(e=>!e.failed&&!e.helpOnly&&!/\s--help(?:\s|$)/.test(e.raw)),has=cmd=>events.some(e=>e.command===cmd),all=commands=>commands.every(has),contains=(cmd,re)=>events.some(e=>e.command===cmd&&re.test(e.output)),rows=[];
  const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
  for(const key of lesson.checks||[]){
    if(key==='identity'){
      const link = events.some(e=>e.key==='ip link'&&!e.fromB&&/^enp3s0\s|^\d+:\s+enp3s0:|^lo\s|^\d+:\s+lo:/m.test(e.output)&&!/^sim b\s/.test(e.raw));
      check('本课实际执行身份、目录及接口检查',all(['whoami','id','pwd'])&&link,'需要本机接口列表，ip route只能证明查过路由。');
    }
    if(key==='inventory'){
      check('采集主机及BIOS',events.some(e=>e.command==='dmidecode'&&e.opts['-t']==='system')&&events.some(e=>e.command==='dmidecode'&&e.opts['-t']==='bios'),'型号与BIOS分别记录。');
      check('采集系统、内核与CPU/内存',all(['uname','lscpu','free'])&&events.some(e=>e.command==='cat'&&e.raw.includes('/etc/os-release')),'发行版与内核不混写。');
      check('采集存储、PCI与网卡驱动',all(['lsblk','lspci'])&&events.some(e=>e.command==='ethtool'&&e.opts['-i']),'保留盘、控制器与驱动输出。');
    }
    if(key==='driverchain')check('PCI、模块、元数据、接口和启动日志',all(['lspci','lsmod','modinfo','ip','dmesg','journalctl']),'有多层证据才能分析绑定与初始化。');
    if(key==='networklayers')check('接口/地址/路由/邻居/协商/连通/监听',events.some(e=>e.key==='ip link')&&events.some(e=>e.key==='ip addr')&&events.some(e=>e.key==='ip route')&&events.some(e=>e.key==='ip neigh')&&all(['ethtool','ping','ss']),'按实际结果区分连通、服务和吞吐。');
    if(key==='storagepath')check('设备、UUID、挂载与空间相互核对',all(['lsblk','blkid','findmnt','mount','df','du']),'目录存在不能代替挂载源确认。');
    if(key==='fiodesign'){
      const groups=fioCourseGroups(record),valid=groups.find(g=>g.q1.length>=2&&g.q16.length>=2);
      check('固定条件下深度1和16各完成至少2轮',!!valid,'匹配目标、bs/rw、size、引擎、direct、numjobs、runtime/time_based、工程、故障及版本；不计失败轮。');
    }
    if(key==='networkdesign'){
      const runs=events.filter(e=>e.net&&!e.net.error&&!e.net.local).map(e=>e.net);
      check('TCP两个方向都有实际接收结果',runs.some(r=>!r.udp&&r.direction==='192.168.10.20 → 192.168.10.10')&&runs.some(r=>!r.udp&&r.direction==='192.168.10.10 → 192.168.10.20'),'服务角色与收发方向分别确认。');
      check('记录UDP接收、丢包与抖动',runs.some(r=>r.udp&&r.total>0),'不是只写目标-b。');
    }
    if(key==='stability'){
      const ends=[...record.endRefs,...S.project.stress.filter(r=>r.ownerLessonId===record.lessonId&&r.ownerAttemptId===record.attemptId&&r.projectId===record.projectId)],validEnd=ends.find(r=>r.cpu>0&&r.vm>0&&r.duration>=60&&r.elapsed>=r.duration&&!r.error);
      check('完成一轮有监控的组合压力',validEnd&&validEnd.observed,'需要实际运行结束记录，不是单击启动即算完成。');
      check('运行期间观察CPU、内存、换页和日志',['top','free','vmstat'].every(cmd=>events.some(e=>e.command===cmd&&e.underLoad&&e.loadId===validEnd?.runId))&&events.some(e=>['dmesg','journalctl'].includes(e.command)&&e.underLoad&&e.loadId===validEnd?.runId),'负载结束后的空闲数据不能冒充运行中数据。');
      check('结束后再次检查CPU和内存',validEnd&&['top','free'].every(cmd=>events.some(e=>e.command===cmd&&!e.underLoad&&e.seq>=validEnd.courseSeq)),'保留恢复阶段的快照。');
    }
    if(key==='nicdiagnosis'){
      check('取得接口、PCI、模块与本次错误日志',all(['ip','lspci','lsmod','dmesg'])&&contains('dmesg',/firmware.*failed|failed to load firmware/),'本课需要主动加载网卡初始化故障，不能用正常输出替代。');
      check('对比两轮启动',events.some(e=>e.command==='journalctl'&&e.opts['-b']==='-1')&&events.some(e=>e.command==='journalctl'&&e.opts['-b']!== '-1'),'回溯与当前两类日志都要有。');
    }
    if(key==='iodiagnosis'){
      const start=events.find(e=>e.command==='stress'),stop=events.find(e=>['stop','pkill'].includes(e.command)&&e.seq>(start?.seq||0)),log=events.find(e=>e.command==='dmesg'&&/I\/O error/.test(e.output));
      check('复现后停止，再检查异常',start&&stop&&log&&stop.seq<log.seq,'先降低风险，再继续取证；保留实际顺序。');
      check('同时保存journal、映射和虚拟证据',all(['journalctl','lsblk','df','save-logs']),'不把概括性结论当原始日志。');
    }
    if(key==='bugquality')check('本课提交一条带日志的新缺陷单',record.bugRefs.some(b=>!record.baseBugs.includes(b.id)&&b.logs?.trim()&&b.steps?.trim()),'先提交Bug，再捕获证据。已有历史缺陷不算本课新提交。');
    if(key==='regression')check('取得本课修复版新增的关闭回归记录',record.bugRefs.some(b=>b.status==='已关闭'&&(b.regressions||[]).slice(record.baseRegressions[b.id]||0).some(r=>r.verdict==='已解决'&&r.evidence)),'引用明确的修复版本与本轮证据。');
    if(key==='reportquality')check('本课实际重新生成测试报告',record.reportRef&&record.reportRef.revision>(record.baseReport.projectId===record.reportRef.projectId?record.baseReport.revision:0),'先在项目实战生成报告，再回本课保存证据。');
  }
  return rows;
}
function captureCourseEvidence(){
 const r=courseRecord(S.academy.selected);if(!r)return;
 if(r.projectId!==S.project.id){toast('当前工程与本课不一致，未新增证据；历史产物仍保留。');renderAcademy();return;}
 syncCourseArtifacts(r);persist();renderAcademy();toast('已同步本课绑定工程中的操作与产物。');
}
function courseStatus(id){const r=courseRecord(id);return !r?'未开始':r.reviewedAt?'已复盘（自评）':r.submittedAt?'产物已提交':'学习中';}
function courseCounts(){return {started:Object.keys(S.academy.records).length,submitted:SIT_COURSE.filter(l=>courseRecord(l.id)?.submittedAt).length,reviewed:SIT_COURSE.filter(l=>courseRecord(l.id)?.reviewedAt).length};}
function recommendedCourse(){return SIT_COURSE.find(l=>!courseRecord(l.id)?.reviewedAt)||SIT_COURSE[0];}
function renderAcademy(){
 const count=courseCounts(),lesson=SIT_COURSE.find(l=>l.id===S.academy.selected)||recommendedCourse();S.academy.selected=lesson.id;
 const stage=SIT_STAGES.find(s=>s[0]===lesson.stage),open=S.ui.openStage||stage[0];
 $('academy-board').innerHTML=`<div class="learning-intro"><div><span class="eyebrow">LEARNING PATH</span><h2>从Linux基础，到独立承担SIT任务</h2><p>命令基础作为查漏，主线训练系统分层、测试设计、数据分析和项目闭环。按任务推进，不按天数速成。</p></div><div class="learning-count"><b>${count.reviewed}<small> / ${SIT_COURSE.length}</small></b><span>单元完成自评复盘</span></div></div><div class="learning-shell"><aside class="course-outline ${S.ui.outlineExpanded?'outline-expanded':''}"><div class="outline-heading"><b>课程目录</b><button class="outline-toggle" data-action="toggle-course-outline">切换阶段</button><button data-action="continue-learning">继续学习 →</button></div>${SIT_STAGES.map(([id,no,title])=>`<section><button class="outline-stage ${open===id?'open':''}" data-course-stage="${id}"><small>${no}</small><span>${title}</span><i>${open===id?'−':'+'}</i></button>${open===id?'<div class="outline-lessons">'+SIT_COURSE.filter(l=>l.stage===id).map(l=>`<button data-course="${l.id}" class="${l.id===lesson.id?'selected':''}"><span>${l.id==='shell'?'Linux操作习惯查漏':l.title}</span><small>${courseStatus(l.id)}</small></button>`).join('')+'</div>':''}</section>`).join('')}<div class="outline-footer"><p>学习记录是课程自评；工程验收和独立考核分开记录。</p><details><summary>备份学习档案</summary><button data-action="export-academy">导出JSON档案</button><button data-action="export-academy-notes">导出Markdown笔记</button></details></div></aside><div id="course-workspace">${renderCourse(lesson)}</div></div>`;
 renderAcademyCommandGuide(lesson);
}
function renderCourse(lesson){
 const r=courseRecord(lesson.id),step=S.ui.courseStep||1,index=SIT_COURSE.indexOf(lesson),other=S.academy.activeLesson&&S.academy.activeLesson!==lesson.id?SIT_COURSE.find(l=>l.id===S.academy.activeLesson):null;
 const mismatch=r&&r.projectId!==S.project.id;
 return `<article class="lesson-paper"><header class="lesson-heading"><div><span class="tag">${lesson.kind==='practice'?'模拟操作课':'方案分析课'}</span><h2>${lesson.title}</h2><p>${lesson.goal}</p></div><span class="lesson-state">${courseStatus(lesson.id)}</span></header>${!r?'<div class="lesson-entry"><p>可以先阅读。本课开始前的操作不会自动计入证据。</p><button class="primary" data-action="begin-current-course">开始本课</button></div>':''}${other?'<div class="info-box warn">你正在查看本课，实训仍绑定“'+esc(other.title)+'”。选择开始本课任务后才切换，两个单元不混记。</div>':''}${mismatch?'<div class="info-box warn">本课绑定工程 '+esc(r.projectId)+'，当前是 '+esc(S.project.id)+'。历史产物保留；当前工程的操作不会自动计入本课。<button data-action="new-course-attempt">在当前工程重做本课（保留旧轮次）</button></div>':''}<div class="lesson-steps">${['理解','任务','产物','复盘'].map((label,i)=>`<button data-course-step="${i+1}" class="${step===i+1?'active':''}"><small>0${i+1}</small>${label}</button>`).join('')}</div><div class="lesson-step-body">${step===1?renderCourseUnderstanding(lesson,r):step===2?renderCourseTask(lesson,r):step===3?renderCourseProduct(lesson,r):renderCourseReview(lesson,r)}</div><footer class="lesson-footer"><span>${r?'本课数据独立记录 · '+esc(r.projectId):'先读原理，再开始任务'}</span><div>${step>1?'<button data-course-step="'+(step-1)+'">← 上一步</button>':''}${step<4?'<button class="primary" data-course-step="'+(step+1)+'">'+['','进入任务','填写产物','对照复盘'][step]+' →</button>':index<SIT_COURSE.length-1?'<button data-course="'+SIT_COURSE[index+1].id+'">下一单元 →</button>':''}</div></footer></article>`;
}
function renderCourseFeedback(r){
  if(!r.feedback)return '';
  return '<div class="info-box'+(r.feedback.ready?'':' warn')+' spaced">'+r.feedback.messages.map(esc).join('<br>')+'<br>这是结构与操作证据检查，不代表技术结论已通过专家评审。</div>';
}
function submitCourse(){
 const lesson=SIT_COURSE.find(l=>l.id===S.academy.selected),r=courseRecord(lesson.id);if(!r){toast('请先开始本课，再提交产物。');return;}
 syncCourseArtifacts(r);const missing=lesson.prompts.filter(([key])=>(r.notes[key]||'').trim().length<12).map(([,name])=>name),unmet=courseChecks(lesson,r).filter(c=>!c.ok);
 r.feedback={ready:!missing.length&&!unmet.length,messages:[missing.length?'需要补充完整说明：'+missing.join('、'):'产物字段已填写；内容正确性还需要对照复盘。',unmet.length?'还缺操作或产物证据：'+unmet.map(c=>c.name).join('、'):lesson.kind==='practice'?'本轮操作证据条件已覆盖。':'本课仅完成方案分析，不生成硬件实测通过。']};
 r.submittedAt=r.feedback.ready?stamp():null;r.reviewedAt=null;persist();renderAcademy();toast(r.feedback.ready?'完整性检查已通过，下一步对照复盘。':'草稿已保存，请补齐说明或证据。');
}
function reviewCourse(){
  const l=SIT_COURSE.find(l=>l.id===S.academy.selected),r=courseRecord(l.id);
  if(!r.submittedAt||!r.feedback?.ready){toast('先提交结构完整且有证据的作业，再自评复核。');return;}
  if(r.reviewChecks.length!==l.review.length){toast('请逐项核对复核清单，尚未确认的项可以先继续学习。');return;}
  r.reviewedAt=stamp();persist();renderAcademy();toast('已记录自评复核，可继续下一单元或返回实操。');
}
function fioCourseGroups(record){
  const map=new Map();for(const e of courseEvents(record)){const r=e.fio;if(e.failed||!r||r.error)continue;const c=r.config;
    if(c.bs!=='4k'||c.rw!=='randread'||c.jobs!==1||c.direct!==1||c.engine!=='libaio'||!c.target.startsWith('/mnt/sit/'))continue;
    const key=JSON.stringify([e.projectId,r.environmentKey,r.conditions?.underLoad,c.target,c.bs,c.rw,c.jobs,c.direct,c.engine,c.size,c.runtime,c.timeBased,r.scene,r.version]);
    if(!map.has(key))map.set(key,{q1:[],q16:[],config:c});if(c.depth===1)map.get(key).q1.push(r);if(c.depth===16)map.get(key).q16.push(r);
  }return [...map.values()];
}
function renderCourseFio(record){
  const groups=fioCourseGroups(record),g=groups.find(g=>g.q1.length>=2&&g.q16.length>=2)||groups.at(-1);
  const stats=list=>{const a=list.map(r=>r.iops).sort((a,b)=>a-b),n=a.length;if(!n)return '无记录';const median=n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;return `${n}轮 · 均值 ${(a.reduce((x,y)=>x+y,0)/n).toFixed(1)} · 中位数 ${median} · 范围 ${a[0]}–${a[n-1]} IOPS`;};
  return `<div class="course-material"><b>本课重复测量观察台（只统计固定条件一致的同组结果）</b><p>深度1：${g?stats(g.q1):'无记录'}<br>深度16：${g?stats(g.q16):'无记录'}</p>${g?'<table><thead><tr><th>深度</th><th>IOPS</th><th>BW MiB/s</th><th>clat / P99 ms</th></tr></thead><tbody>'+[...g.q1,...g.q16].map(r=>`<tr><td>${r.config.depth}</td><td>${r.iops}</td><td>${r.bw}</td><td>${r.clat} / ${r.p99}</td></tr>`).join('')+'</tbody></table>':''}<p>展示均值不等于建立统计充分性。解释时还要看每轮条件、波动与尾延迟，不只选最高值。</p></div>`;
}

const COURSE_REFERENCES={
 scope:'可以把“重启后网卡可用”拆成：设备存在、驱动绑定、接口创建、地址/路由恢复、链路与指定业务可达。每项附命令、实际输出、执行次数及验收依据。模拟没有提供真实兼容性矩阵或可靠性证明，报告必须限定范围。',
 architecture:'当前拓扑为1×8×2=16逻辑CPU。容量采集与可靠性验证分开：free不能证明ECC无错误，单节点模拟不能证明跨NUMA访问表现。BMC、控制器、EDAC与平台日志应列为真实环境需要补采的来源。',
 shell:'不要只复述右侧解释，要引用自己刚执行的输出。用户、组、目录和网络接口分别属于不同对象；看到用户名只能说明身份的一部分。真实写盘或配置变更需要确认目标与权限，模拟器拒绝未知选项也不意味着真实Linux没有该选项。',
 inventory:'清单应把名义配置和实际采集分开，至少关联主机型号、CPU拓扑、内存、盘/控制器、网卡、OS/内核、BIOS、驱动/固件。用工程标识和版本区分两轮，缺项标记待采集，不根据概览页猜测。',
 driverchain:'PCI、模块文件、模块装载、实际绑定、接口创建是几个不同事实。模块在但probe失败，与模块根本未加载，预期的lsmod和日志结果不同。先提出预测，再取证；定位到阶段不等于确认实现中的根因。',
 networklayers:'Speed为链路协商、Duplex为双工、Link detected为物理载波；接口管理状态、IP/路由、监听端口和端到端性能另查。ping通但连接拒绝，先核对目标服务和端口，而不是直接继续更换物理线缆。',
 storagepath:'把test.bin映射到/mnt/sit、sdb1、sdb，再用UUID核对身份。df查看文件系统可用空间，du查看目录占用。若挂载源缺失，先停止文件写测试，保留挂载配置与错误日志，避免真实环境误写系统盘。',
 raid:'一个逻辑盘不能证明成员盘、阵列状态或重建过程。先采控制器、固件、成员、级别、策略与状态，再定义正常/降级/重建用例。Linux软件md资料不能代替具体硬件控制器手册。本课只评方案的边界与证据需求。',
 datapath:'A/B同时改变目标、模式、块大小、引擎、深度、缓存和时长，所以不能把更高BW归因于某个单独参数。新实验只改一个变量，其余条件和背景负载固定，保留重复数据与日志。direct1不等于绕过所有设备缓存。',
 testcase:'完整用例应让其他人独立复现。正向、异常检测和恢复用例针对不同分支；次数与时长未定义时列待确认，不从教学示例推断正式要求。每条预期需要对应可观察证据。',
 matrix:'2×2×2=8个组合。新驱动D2与历史问题网卡N2应优先关注，但如何分配窗口仍需结合风险和执行成本。记录未覆盖行及影响，不把抽样后的结论扩大为所有组合全通过。',
 measurement:'A均值和中位数都是40000，范围39200–40800；B均值约30933.33、中位数41800，范围9000–42000 IOPS。B的低值使稳定性值得调查；没有日志依据不能直接删除。补采背景负载、错误与版本信息，在同条件下复测。',
 fiodesign:'应在同一工程、目标、模式、块、size、引擎、缓存、作业数、时长与版本下比较深度。每组至少两轮只是练习门槛，不是充分统计证明。解释IOPS/BW提升时，同时记录clat/P99变化及业务时延要求。',
 networkdesign:'服务端先监听。正常方向是客户端发送，-R后服务端发送，角色仍保持。TCP观察接收速率和Retr，UDP记录目标、实际接收、Lost%和Jitter。千兆协商但90Mbps时，交换机限速与百兆协商是不同假设，需不同证据。',
 stability:'本例内存请求为2×2GiB=4GiB。运行中采CPU、available/swap、si/so/wa与日志，结束后再采样。发生OOM或I/O错误时停止/降载并保存上下文；没有真实温度、电源与长时间记录，不能声明硬件长稳通过。',
 nicdiagnosis:'事实可以是PCI在、模块在、绑定缺失、接口不在、当前固件加载失败，而上轮正常。它们支持初始化/固件加载方向；是否为包缺失、兼容性或实现问题仍需要额外证据。用假设和预测组织判断，不直接下硬件损坏结论。',
 iodiagnosis:'先停止压力，再保留参数、对象、时间和两类日志。timeout/reset若早于块层I/O error，是控制器/驱动路径的重要线索，但仍不能排除其他来源。升级材料写清已证实、已排除和待确认，不擅自格式化或修复。',
 hypothesis:'后台备份与性能下降同时出现只是相关线索。可先协调停止冲突任务并按原参数复测；若未恢复，再对照版本、路径、控制器与健康证据。每一步只改变可解释的因素，并保留支持与反对假设的结果。',
 bugquality:'标题、环境、步骤、预期、实际、频率和日志要互相一致。别人能复现的必要条件不能省略。说明影响和初步定位边界；严重程度/优先级按团队标准处理，而不是每条都最高。',
 regression:'记录故障版与修复版，原步骤重跑，并按改动影响选择相关功能。旧版本日志不能代替本轮复测，开发的修复说明也不能代替测试证据。失败重新打开，缺前置说明BLOCKED。',
 reportquality:'质量摘要首先写已测范围和版本，再写关键结果、缺陷回归与遗留风险。用实际状态和证据支持建议。未测或无正式基线的事项不能自动写通过，发布决定也不能只靠一个模拟分数。',
 subproject:'小范围计划至少包含目标、组合、用例、环境、优先级、依赖、进入/退出条件、证据和负责人。工作量应包含切换、复测与分析，未确认的重启次数和时长保留为假设或待澄清。',
 reviewpacket:'建立能从结论追到原始记录的索引，保留至少一次失败或误判的修正过程。导出的课程档案记录作业、自评及证据，不能代替真实项目履历或同行评审。',
 transfer:'可以迁移检查思路、模板、控制变量和闭环方法；设备路径、工具/内核版本、正式标准与性能基线必须重新确认。先获得实验范围、资料、授权与恢复条件，再逐步执行真实验证。'
};
function courseReference(lesson){return COURSE_REFERENCES[lesson.id]||lesson.review.join('；');}
function academyPracticeCard(){
 const lesson=SIT_COURSE.find(l=>l.id===S.academy.activeLesson),r=lesson&&courseRecord(lesson.id);if(!r)return '';
 const checks=courseChecks(lesson,r);return `<span class="tag">课程实训</span><b>${lesson.title}</b><p>${lesson.goal} · 本课证据 ${checks.filter(c=>c.ok).length}/${checks.length}。操作会自动归入本轮课程与绑定工程。</p><div class="inline-actions"><button data-course-return="${lesson.id}">返回本课任务与产物</button><button data-action="leave-course-practice">暂停课程，切换自由实训</button></div>`;
}
function startCoursePractice(id,command){
 if(assessmentActive())return;const lesson=SIT_COURSE.find(l=>l.id===id);if(!lesson)return;
 if(!courseRecord(id))S.academy.records[id]=newCourseRecord(id);const r=courseRecord(id);
 if(r.projectId!==S.project.id){S.academy.selected=id;S.ui.courseStep=2;showPage('academy');toast('本课绑定其他工程，请先恢复该工程，或明确开始新一轮。');return;}
 if(S.stress&&S.stress.ownerLessonId!==id){toast('另一项压力作业仍在运行，请先停止或等待结束，再切换课程。');showPage('stress');return;}
 S.academy.selected=id;S.academy.activeLesson=id;S.coach.mode='free';S.coach.hidden=false;persist();showPage(command?'terminal':lesson.route||'terminal');
 if(command){$('command').value=command;$('command').focus();toast('已填入命令，请确认后自行回车。');}return true;
}
function academyExport(markdown=false){
  if(!markdown){downloadText('sit-learning-portfolio.json',JSON.stringify({type:'SIT学习档案（非认证）',exportedAt:stamp(),courseVersion:'4.0',pace:'按任务推进',records:S.academy.records},null,2),'application/json');return;}
  const text='# SIT成长学习档案\n\n这是个人模拟练习和自评，不是企业项目履历或岗位认证。\n导出时间：'+stamp()+'\n\n'+SIT_COURSE.map(l=>{const r=courseRecord(l.id);return '## '+l.title+'\n类型：'+(l.kind==='practice'?'模拟操作':'方案分析')+'\n状态：'+courseStatus(l.id)+'\n'+(r?l.prompts.map(([key,label])=>'### '+label+'\n'+(r.notes[key]||'未填写')).join('\n')+'\n证据：\n'+r.evidence.map(e=>'- '+e.at+' / '+(e.projectId||'工程')+' / `'+e.raw+'`').join('\n')+'\n自评复核时间：'+(r.reviewedAt||'未复核'):'未开始')+'\n';}).join('\n');
  downloadText('SIT成长学习笔记.md',text,'text/markdown;charset=utf-8');
}
function handleAcademyClick(button){
 if(button.hasAttribute('data-academy-guide-index')){S.ui.academyGuide={lessonId:S.academy.selected,index:Number(button.dataset.academyGuideIndex)};persist();renderAcademy();$('academy-command-guide').scrollIntoView({block:'start'});return true;}
 if(button.dataset.course){viewCourse(button.dataset.course);return true;}
 if(button.dataset.courseStep){S.ui.courseStep=Number(button.dataset.courseStep);persist();renderAcademy();return true;}
 if(button.dataset.courseStage){S.ui.openStage=button.dataset.courseStage;persist();renderAcademy();return true;}
 if(button.dataset.courseReturn){viewCourse(button.dataset.courseReturn,2);return true;}
 if(button.dataset.coursePractice){startCoursePractice(button.dataset.coursePractice);return true;}
 if(button.dataset.courseFill){startCoursePractice(button.dataset.courseId,button.dataset.courseFill);return true;}
 if(button.dataset.courseScene){const lesson=SIT_COURSE.find(l=>l.id===button.dataset.courseScene);if(!startCoursePractice(lesson.id))return true;S.freeMode=true;$('free-mode').checked=true;startScenario(lesson.scene);persist();showPage('terminal');return true;}
 switch(button.dataset.action){
  case 'begin-current-course':beginCourse(S.academy.selected);return true;
  case 'continue-learning':viewCourse(recommendedCourse().id);return true;
  case 'toggle-course-outline':S.ui.outlineExpanded=!S.ui.outlineExpanded;persist();renderAcademy();return true;
  case 'new-course-attempt':restartCourseAttempt();return true;
  case 'capture-course':captureCourseEvidence();return true;
  case 'submit-course':submitCourse();return true;
  case 'review-course':reviewCourse();return true;
  case 'course-hint':if(!courseRecord(S.academy.selected))S.academy.records[S.academy.selected]=newCourseRecord(S.academy.selected);courseRecord(S.academy.selected).hints=true;persist();renderAcademy();return true;
  case 'leave-course-practice':syncActiveCourseArtifacts();S.academy.activeLesson=null;persist();refresh();return true;
  case 'export-academy':academyExport();return true;
  case 'export-academy-notes':academyExport(true);return true;
  case 'reset-training-environment':endScenario();return true;
 }
 return false;
}
function initAcademy(){
  reconcileLearningRecords();
  document.addEventListener('input',event=>{const key=event.target.dataset.courseNote;if(!key)return;const r=courseRecord(S.academy.selected);r.notes[key]=event.target.value;r.submittedAt=null;r.reviewedAt=null;r.reviewChecks=[];r.feedback=null;document.querySelectorAll('[data-course-review]').forEach(c=>c.checked=false);const feedback=$('course-feedback');if(feedback)feedback.textContent='草稿自动保存。修改后需要重新提交与复核。';const status=$('course-review-status');if(status)status.textContent='修改后尚未重新复核。';persist();});
  document.addEventListener('change',event=>{const index=event.target.dataset.courseReview;if(index===undefined)return;const r=courseRecord(S.academy.selected),value=Number(index);r.reviewChecks=event.target.checked?[...new Set([...r.reviewChecks,value])]:r.reviewChecks.filter(i=>i!==value);if(!event.target.checked)r.reviewedAt=null;persist();});
  renderAcademy();
}

function newCourseRecord(id){
 return {lessonId:id,attemptId:'COURSE-'+Date.now()+'-'+S.coach.seq,projectId:S.project.id,legacyBoundarySeq:S.coach.seq,startedAt:stamp(),seqStart:S.coach.seq,notes:{},evidence:[],bugRefs:[],endRefs:[],baseBugs:S.bugs.map(b=>b.id),baseRegressions:Object.fromEntries(S.bugs.map(b=>[b.id,b.regressions?.length||0])),baseReport:{projectId:S.project.id,revision:S.project.reportRevision||0},submittedAt:null,reviewedAt:null,reviewChecks:[],feedback:null,previousAttempts:[]};
}
function reconcileLearningRecords(){
 S.ui.courseStep=S.ui.courseStep||1;
 for(const [id,r] of Object.entries(S.academy.records)){
  if(!r.attemptId){r.lessonId=id;r.attemptId='LEGACY-'+id+'-'+r.seqStart;r.legacyBoundarySeq=S.coach.seq;r.projectId=r.evidence.find(e=>e.projectId)?.projectId||S.project.id;r.migrated=true;}
  r.previousAttempts=r.previousAttempts||[];
 }
 const active=courseRecord(S.academy.activeLesson);if(active&&active.projectId!==S.project.id){S.academy.suspendedLesson=S.academy.activeLesson;S.academy.activeLesson=null;}
 if(!assessmentActive())S.coach.mode='free';
}
function viewCourse(id,step){
 const lesson=SIT_COURSE.find(l=>l.id===id);if(!lesson)return;
 if(S.academy.selected!==id)S.ui.courseStep=step||1;else if(step)S.ui.courseStep=step;
 S.academy.selected=id;S.ui.openStage=lesson.stage;S.ui.outlineExpanded=false;persist();showPage('academy');
}
function restartCourseAttempt(){
 const id=S.academy.selected,old=courseRecord(id);if(!old)return;
 if(S.stress){toast('先结束当前压力作业，再开始新一轮课程。');return;}
 const {previousAttempts,...archive}=old;const fresh=newCourseRecord(id);fresh.previousAttempts=[...(previousAttempts||[]),archive];S.academy.records[id]=fresh;
 if(S.academy.activeLesson===id)S.academy.activeLesson=null;S.ui.courseStep=2;persist();renderAcademy();toast('已为当前工程建立新一轮，旧草稿、证据和自评记录已存档。');
}
function eventBelongsToCourse(event,record){return event.lessonId===record.lessonId&&event.attemptId===record.attemptId&&event.projectId===record.projectId&&event.seq>record.seqStart;}
function storeCourseEvent(event){
 const r=courseRecord(event.lessonId);if(!r||!eventBelongsToCourse(event,r))return;
 const l=SIT_COURSE.find(l=>l.id===event.lessonId),relevant=l.commands?new Set(l.commands.map(c=>analyseInput(c).segments[0].command)):null;
 if(!relevant||relevant.has(event.command))r.evidence=[...r.evidence.filter(e=>e.seq!==event.seq),event];
}
function syncCourseArtifacts(record){
 if(record.projectId!==S.project.id||assessmentActive())return;
 const l=SIT_COURSE.find(l=>l.id===record.lessonId);if(!l)return;
 const relevant=l.commands?new Set(l.commands.map(c=>analyseInput(c).segments[0].command)):null;
 record.evidence=courseEvents(record).filter(e=>!relevant||relevant.has(e.command));
 if(['bugquality','regression'].includes(l.id))record.bugRefs=S.bugs.filter(b=>b.projectId===record.projectId&&(l.id==='bugquality'?!record.baseBugs.includes(b.id):(b.regressions?.length||0)>(record.baseRegressions[b.id]||0))).map(b=>({...b,regressions:(b.regressions||[]).map(r=>({...r}))}));
 if(l.id==='stability'){
  const ends=new Map();[...record.endRefs,...S.project.stress.filter(r=>r.ownerLessonId===record.lessonId&&r.ownerAttemptId===record.attemptId&&r.projectId===record.projectId)].forEach(r=>ends.set(r.runId||r.courseSeq+'|'+r.command,r));record.endRefs=[...ends.values()];
 }
 if(S.project.reportAt)record.reportRef={projectId:S.project.id,revision:S.project.reportRevision||0,at:S.project.reportAt};
}
function syncActiveCourseArtifacts(){
 const r=courseRecord(S.academy.activeLesson);if(r)syncCourseArtifacts(r);
}
function renderCourseUnderstanding(l,r){
 return `${topicPrelude(l)}<div class="reading-lead"><b>先把已有Linux基础接到SIT工作上</b><p>${l.id==='shell'?'本节用于查漏：如果命令语法已经熟悉，重点核对目标路径、权限与证据习惯，不必机械重学所有命令。':'本课先回答“验证什么、为什么这样做、结论能到哪里”，命令是后面的执行工具。'}</p></div><div class="course-concepts">${l.concepts.map(([title,text],i)=>`<section><span>${i+1}</span><div><h3>${title}</h3><p>${text}</p></div></section>`).join('')}</div>${l.commands?.length?'<section id="academy-command-guide" class="starter-guide" aria-label="本专题逐条命令导读"></section>':''}${l.sources?.length?'<details class="source-links"><summary>原始资料：可离线学，联网时选读</summary>'+l.sources.map(k=>`<a href="${COURSE_SOURCES[k][1]}" target="_blank" rel="noreferrer">${COURSE_SOURCES[k][0]} ↗</a>`).join('')+'</details>':''}`;
}
function renderCourseTask(l,r){
 const checks=r?courseChecks(l,r):[],mismatch=r&&r.projectId!==S.project.id;
 return `<div class="task-brief"><span class="eyebrow">YOUR TASK</span><h3>${l.task}</h3><p>${l.kind==='practice'?'开始本课实训后，操作自动归入本课与当前工程；浏览其他课程不会切换归属。':'本课交付方案与证据分析，不生成硬件实测通过结果。'}</p></div>${l.material?'<div class="course-material"><b>已知条件</b><p>'+l.material+'</p></div>':''}${l.kind==='practice'?`<div class="practice-actions"><button class="primary" data-course-practice="${l.id}" ${mismatch?'disabled':''}>${r?'进入本课实训':'开始本课并进入实训'}</button>${l.scene?`<button data-course-scene="${l.id}" ${mismatch?'disabled':''}>载入本课故障</button>`:''}</div>`:'<button class="primary" data-course-step="3">开始写分析产物</button>'}<h3>完成条件</h3>${r&&checks.length?'<ul class="course-checks">'+checks.map(c=>`<li class="${c.ok?'ok':''}"><b>${c.ok?'✓':'○'} ${c.name}</b><small>${c.detail}</small></li>`).join('')+'</ul>':'<p class="muted">'+(l.kind==='practice'?'开始本课后，检查实际操作与产物证据；之前的自由练习不会自动计入。':'把已知事实、原因假设、验证方案和限制写清楚，再对照复盘。')+'</p>'}${l.commands?`<details class="course-examples"><summary>需要时查看命令示例</summary><p>示例只填入终端，不代替你执行和理解。</p>${l.commands.map(cmd=>`<div><code>${esc(cmd)}</code><button data-course-fill="${esc(cmd)}" data-course-id="${l.id}" ${mismatch?'disabled':''}>填入终端</button></div>`).join('')}</details>`:''}<details class="task-hints"><summary>逐步提示</summary>${l.hints.map(t=>'<p>'+esc(t)+'</p>').join('')}</details>${l.id==='fiodesign'&&r?renderCourseFio(r):''}`;
}
function renderCourseProduct(l,r){
 return `<div class="step-intro"><h3>把操作转成可检查的产物</h3><p>写事实、依据和下一步，而不是抄一段定义。草稿自动保存；提交只检查完整性与操作条件。</p>${r?.migrated?'<p>历史草稿、自评及旧规则证据已保留；新操作按课程、轮次和工程归属。需要重新验证时可以另开本课新轮次。</p>':''}</div>${!r?'<button class="primary" data-action="begin-current-course">先开始本课</button>':''}<div class="course-notes">${l.prompts.map(([key,label,placeholder])=>`<label>${label}<textarea data-course-note="${key}" rows="4" placeholder="${esc(placeholder)}" ${!r?'disabled':''}>${esc(r?.notes[key]||'')}</textarea></label>`).join('')}<div class="inline-actions"><button class="primary" data-action="submit-course" ${!r?'disabled':''}>检查产物完整性</button>${l.kind==='practice'&&r?'<button data-action="capture-course">同步操作记录</button>':''}</div><div id="course-feedback">${r?renderCourseFeedback(r):''}</div></div><details class="evidence-drawer"><summary>查看本轮操作证据（${r?.evidence.length||0}条）</summary>${r?.evidence.length?r.evidence.slice(-24).map(e=>`<div class="course-evidence"><b>${esc(e.at)} · ${esc(e.projectId||r.projectId)}</b><code>${esc(e.raw)}</code><pre>${esc(e.output)}</pre></div>`).join(''):'<p>本课暂未保存操作记录。方案分析课不强制生成命令证据。</p>'}</details>${r?.previousAttempts.length?'<details class="evidence-drawer"><summary>保留的历史轮次（'+r.previousAttempts.length+'）</summary>'+r.previousAttempts.map(a=>`<div class="course-evidence"><b>${esc(a.projectId||'历史工程')} · ${esc(a.startedAt)}</b><p>原自评时间：${esc(a.reviewedAt||'未复核')}</p>${l.prompts.map(([k,label])=>'<p><b>'+label+'</b><br>'+esc(a.notes[k]||'未填写')+'</p>').join('')}<p>保留证据 ${a.evidence.length} 条，随学习档案导出。</p></div>`).join('')+'</details>':''}`;
}
function renderCourseReview(l,r){
 return `<div class="step-intro"><h3>对照思路，确认你能解释依据</h3><p>自评复盘与工程PASS、能力考核分开。阅读参考不自动提升掌握度。</p></div><details class="course-reference" open><summary>参考思路与常见偏差</summary><p>${courseReference(l)}</p><p><b>常见偏差：</b>${l.pitfalls}</p></details><div class="course-review">${l.review.map((text,i)=>`<label class="checkbox"><input type="checkbox" data-course-review="${i}" ${r?.reviewChecks.includes(i)?'checked':''} ${!r?.submittedAt?'disabled':''}>${text}</label>`).join('')}<button data-action="review-course" ${!r?.submittedAt?'disabled':''}>记录本课自评复盘</button><p id="course-review-status" class="muted">${r?.reviewedAt?'复盘记录：'+esc(r.reviewedAt)+'；属于个人学习自评。':r?.submittedAt?'请逐项确认；不确定的部分回到任务继续练。':'先完成产物完整性检查，再记录自评。'}</p></div>`;
}
function renderSessionBar(){
 const exam=assessmentActive(),id=S.academy.activeLesson,lesson=SIT_COURSE.find(l=>l.id===id),r=lesson&&courseRecord(id);
 const label=exam?'独立考核工程':S.coach.exam?.projectId===S.project.id?'考核结果工程（已交卷）':lesson?'课程实训':'自由实训',environment=S.scene?(exam?'未知故障工单':scenarios[S.scene].title)+(S.fixed?' / 修复版1.1':' / 故障版1.0'):S.netFault!=='none'?'网络练习故障：'+S.netFault:S.stressFault!=='normal'?'压力练习故障：'+S.stressFault:'正常环境';
 $('session-bar').innerHTML=`<div><span class="session-label">${label}</span><code>${esc(S.project.id)}</code><span>${esc(environment)}</span>${S.stress?'<span class="live-load">压力运行中</span>':''}</div><div>${lesson?`<button data-course-return="${id}">当前课程：${esc(lesson.title)} ↗</button>`:!exam?'<button data-go="academy">选择学习任务</button>':''}${S.scene&&!exam?'<button data-action="reset-training-environment">退出当前故障</button>':''}</div>`;
 $('net-fault').disabled=!!S.scene;$('stress-fault').disabled=!!S.scene;
}
function renderAssessmentPage(){
 const host=$('assessment-board');if(!host)return;
 if(assessmentActive()){renderAssessmentBoard('assessment-board');return;}
 host.innerHTML=`<div class="panel assessment-entry"><span class="tag">INDEPENDENT PRACTICE</span><h2>把“会跟着做”与“能独立完成”分开验证</h2><p>适合已经完成基础巡检、性能、故障和交付练习后使用。考核创建独立工程，暂存当前课程与项目；交卷前不展示教学答案，结束后给出规则评分与遗漏。</p><div class="assessment-scope"><span>环境与基础巡检</span><span>磁盘/网络/稳定性</span><span>未知故障与回归</span><span>记录与质量结论</span></div><button class="primary" data-action="start-assessment">开始独立项目考核</button><p class="muted">学习自评进度、工程验收结果、考核评分分别记录；一次规则分数不代表岗位资格。</p></div>${renderAssessmentResult()}`;
}
function archiveCurrentScenario(reason){
 if(!S.scene)return;
 S.project.scenarioArchives=S.project.scenarioArchives||[];S.project.scenarioArchives.push({scene:S.scene,title:scenarios[S.scene].title,fixed:S.fixed,reason,at:stamp(),captures:S.captures.map(c=>({...c})),saved:S.saved});
}
