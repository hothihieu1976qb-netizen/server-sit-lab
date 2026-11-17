'use strict';
// All commands and devices below are an in-memory teaching model. No shell/API calls.
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const navItems = [
  ['home','◫','学习课程',''],
  ['lesson','◫','同页实训',''],
  ['cases','◇','工作问题复现',''],
  ['assessment','◎','独立考核','在单独工程检验操作、分析和交付，交卷后统一复盘。'],
  ['academy','◫','学习路径','以中级SIT工作方法为目标，按任务学习、实操、提交产物与复盘。'],
  ['project','◉','工程与报告','银河麒麟 V10 服务器兼容性与稳定性测试项目 · 八阶段实训'],
  ['overview','▦','服务器概览','确认环境，规划一次属于你的服务器测试。'],
  ['terminal','›_','终端实训','输入命令，观察设备、驱动、日志与测试结果。'],
  ['hardware','▤','硬件信息','核对固定配置，区分硬件识别、驱动绑定和接口创建。'],
  ['fio','▥','fio 磁盘测试','用同一组参数比较结果，理解磁盘性能的三个核心指标。'],
  ['network','⇄','iperf3 网络测试','在两个模拟端点之间检查链路与网络吞吐。'],
  ['stress','⌁','stress 压力测试','施加模拟负载，观察 CPU、内存和系统日志。'],
  ['faults','◇','故障排查','收集证据，提出判断，再验证你的排查结论。'],
  ['bugs','⚑','Bug 管理','记录可复现的问题，切换修复版本并亲自执行回归。'],
  ['interview','♧','技术复盘','先用自己的话回答，再对照知识点补足遗漏。'],
  ['learning','▧','专题资料','理解目的、参数、证据与实际使用场景。'],
  ['mistakes','✓','错题本','回顾命令参数与输出知识，重新回答并订正。'],
  ['reference','≡','命令手册','常用命令与核心参数，一查就能接着练。']
];
const NAV_GROUPS=[
 ['study','◫','学习课程','home',['home','lesson','academy']],
 ['work','›_','实验室','cases',['cases','terminal','overview','hardware','fio','network','stress','faults']],
 ['review','▤','我的学习','mistakes',['mistakes','reference','learning','project','bugs','assessment','interview']]
];
function renderNavigation(){
 const group=NAV_GROUPS.find(g=>g[4].includes(S.page))||NAV_GROUPS[0];
 $('nav').innerHTML=NAV_GROUPS.map(([id,icon,label,landing])=>`<button data-go="${landing}" title="${label}" aria-label="${label}" class="${id===group[0]?'active':''}" ${id===group[0]?'aria-current="page"':''}><span class="nav-icon">${studioIcon({study:'layers',work:'flask-conical',review:'chart-no-axes-combined'}[id])}</span><span class="nav-text">${label}</span>${id==='study'?'<span class="nav-count">'+GUIDED_COURSES.length+'</span>':''}</button>`).join('');
 const visibleTabs=assessmentActive()?['assessment','terminal','project','bugs']:group[4].filter(id=>id!=='lesson');
 $('section-tabs').hidden=['home','lesson','cases'].includes(S.page);
 $('section-tabs').innerHTML=visibleTabs.map(id=>{const item=navItems.find(n=>n[0]===id);return `<button data-go="${id}" class="${S.page===id?'active':''}" ${S.page===id?'aria-current="page"':''}>${item[2]}</button>`;}).join('');
 const pageName=navItems.find(n=>n[0]===S.page)[2];
 $('crumb').textContent=group[2]+(pageName===group[2]?'':' / '+pageName);
}
let stored = {};
try { stored = JSON.parse(localStorage.getItem('sit-lab-v1') || '{}'); } catch (_) {}
const S = {
  ui:stored.ui||{courseStep:1,openStage:null},
  experience:readPracticeStore(stored.experience), activePracticeTerminal:null,
  academy:stored.academy || {selected:null,activeLesson:null,records:{},pace:'task'},
  coach:stored.coach || {mode:'guided',hidden:false,learned:{},mastered:{},mistakes:{},events:[],seq:0,quizCycle:0,guided:0,guideSince:0,workHint:false,exam:null},
  lastLesson:null,currentMemoryQuiz:null,operationFollowups:null,
  page:'overview', scene:null, fixed:false, generation:0, evidence:new Set(), captures:[], saved:'',
  hints:0, explanation:false, diagnosisMessage:'', boot:1, ioError:false,
  stress:null, cpu:3, memory:2.1, swap:0, peerServer:false, localServer:false, peerPort:5201, localPort:5201,
  netFault:'none', stressFault:'normal', resourceMessages:[], simTime:0, freeMode:false, fioRuns:[], netRuns:[], selectedFio:[], followup:null, report:null,
  project:stored.project || {id:'PRJ-'+Date.now(), started:new Date().toLocaleString('zh-CN'), observations:{}, fio:[], network:[], stress:[], cases:[], reportAt:null},
  history:[], historyIndex:0, transcript:[], busy:{fio:false,network:false},
  lastFio:null, lastNet:null, regression:null,
  bugs:Array.isArray(stored.bugs)?stored.bugs:[], completed:Array.isArray(stored.completed)?stored.completed:[],
  practiced:Array.isArray(stored.practiced)?stored.practiced:[], answers:stored.answers || {}, q:Number(stored.q)||0
};
let toastTimer;
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200); }
let persistTimer;
function persist() {
  clearTimeout(persistTimer);persistTimer=setTimeout(flushProjectStore,60);
}
function flushProjectStore() {
  clearTimeout(persistTimer);
  syncCoachSnapshot();syncActiveCourseArtifacts();
  try { localStorage.setItem('sit-lab-v1',JSON.stringify({bugs:S.bugs,completed:S.completed,practiced:S.practiced,answers:S.answers,q:S.q,project:S.project,coach:S.coach,academy:S.academy,ui:S.ui,experience:practiceStoreReady?undefined:S.experience,session:sessionSnapshot()})); }
  catch (_) { toast('浏览器未能保存本次进度。可先导出案例或学习记录。'); }
}
window.addEventListener('pagehide',flushProjectStore);
function sessionSnapshot(){
  const keys=['scene','fixed','regression','boot','ioError','netFault','stressFault','simTime','resourceMessages','captures','saved','freeMode','hints','explanation','diagnosisMessage','localServer','peerServer','localPort','peerPort','report','regressionEnvironment'];
  return {projectId:S.project.id,...Object.fromEntries(keys.map(key=>[key,S[key]])),evidence:[...S.evidence],stressInterrupted:Boolean(S.stress)};
}
function restoreSession(snapshot){
  if(snapshot?.projectId!==S.project.id)return;
  const {projectId,evidence,stressInterrupted,...state}=snapshot;
  Object.assign(S,state,{evidence:new Set(evidence)});
  $('scene-select').value=S.scene||$('scene-select').options[0]?.value;
  if(S.scene)$('bug-scene').value=S.scene;
  $('free-mode').checked=S.freeMode;
  $('net-fault').value=S.netFault;
  $('stress-fault').value=S.stressFault;
  if(S.scene&&S.captures.length){
    $('terminal-output').replaceChildren();
    for(const capture of S.captures){
      appendTerminal('student@sit-server:~$ '+capture.command,'prompt');
      if(capture.output)appendTerminal(capture.output);
    }
  }
  if(S.project.engine?.machine.load){
    S.stress=S.project.engine.activeStress||{...S.project.engine.machine.load,command:'stress (restored workload)',at:stamp(),peakCPU:0,peakMemory:0,peakSwap:0};
    coreStopStress('page-reload');
  }
  if(stressInterrupted)$('stress-log').textContent='页面刷新结束了此前的压力作业，请重新启动作业再采样。';
  updateResourceState();
}
function practice(key) { if (!S.practiced.includes(key)) { S.practiced.push(key); persist(); } }
function fault(id) { return S.scene===id && !S.fixed; }
function note(key) { if(S.scene) S.evidence.add(key); }
function showPage(id,updateHash=true){
  if(!allowWorkPage(id)){id='terminal';toast('考核中只开放终端、交付和任务书；交卷后再查看教学资料。');}
  if(['lesson','cases'].includes(id)&&(S.busy.fio||S.busy.network)){toast('当前模拟测试正在收尾，结束后即可切换。');return;}
  if(id==='lesson'&&!getGuidedRun()){startGuided();return;}
  const item=navItems.find(n=>n[0]===id)||navItems.find(n=>n[0]==='home');S.page=item[0];
  document.body.classList.toggle('learning-experience',['home','lesson','cases'].includes(S.page));
  document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!=='view-'+S.page);
  $('page-title').textContent=item[2];$('page-desc').textContent=item[3];$('eyebrow').textContent='SIT LEARNING WORKSPACE';
  if(updateHash&&location.hash!=='#'+S.page)history.replaceState(null,'','#'+S.page);
  practiceTerminal(S.page);
  if(['home','lesson','cases'].includes(S.page))renderWorkMode();else refresh();
  renderNavigation();renderExperiencePage();
  if(S.page==='academy')renderAcademy();if(S.page==='mistakes')renderMistakes();if(S.page==='terminal')$('command').focus();
  renderKernelWorkbench();studioPageChanged();
}
function appendTerminal(text, kind='') {
  const line=document.createElement('pre'); line.className=kind; line.textContent=text; $('terminal-output').appendChild(line);
  const out=$('terminal-output'); while(out.children.length>180)out.firstChild.remove();out.scrollTop=out.scrollHeight;
}
function record(command, output,valid=true) {
  if(valid)trackProjectCommand(command,output);
  const capture={...evidenceEnvironment(),command,output,time:new Date().toLocaleTimeString('zh-CN',{hour12:false})};
  S.transcript.push(capture); if(S.transcript.length>100)S.transcript.shift();
  if(S.scene){S.captures.push(capture);if(S.captures.length>70)S.captures.shift();}
}
const environment = [
  ['服务器','SimRack R200 · 主机 SIT-SERVER-01（虚构）'],['系统','银河麒麟高级服务器操作系统 V10（模拟）'],
  ['内核 / 架构','4.19.90-sit.sim / x86_64'],['CPU','SimServer 3200 · 8 核 / 16 线程 / 2.4 GHz'],
  ['内存','16 GiB · 系统常驻约 2.1 GiB · swap 2 GiB'],['系统盘','sda · 120 GiB · sda1 /boot，sda2 /（ext4）'],
  ['独立测试盘','sdb · 240 GiB · sdb1 /mnt/sit（ext4）'],['网卡','SimNIC G1 · enp3s0 · 千兆以太网'],
  ['IP / 网关','192.168.10.10/24 · 192.168.10.1'],['模拟测试对端','192.168.10.20 · iperf3 5201'],
  ['BIOS / UEFI','SimUEFI 2.6.0 · 2026-07-01'],['存储控制器','SimStorage HBA [1abc:2001] · 系统盘使用独立启动控制器'],
  ['硬盘型号','SimBoot120 SATA / SimSSD240 SATA（虚构）'],
  ['网卡驱动 / 固件','simnic 1.0 / simnic-fw-1.0（教学名称）'],['存储驱动','simhba 1.0 · SimStorage HBA（教学名称）']
];
const scenarios = {
  nic:{n:'01',title:'重启后网卡消失',desc:'第二次启动后，原本存在的 enp3s0 不见了。先区分设备、驱动与接口。',
    steps:[['interface','检查接口是否存在'],['pci','检查 PCI 设备及驱动绑定'],['module','检查模块是否加载'],['kernel','查看当前 dmesg'],['current','查看本次启动 journal'],['previous','对比上次正常启动日志']],
    options:['请选择你的判断','网卡硬件完全未识别','固件加载失败，驱动未绑定，接口未创建','网卡已创建，仅 IP 配置错误','网线断开导致 PCI 设备消失'],answer:2,
    hints:['从 ip link 与 lspci -nnk 的差别开始。','模块出现在 lsmod 中，不等于它已经成功绑定到设备。对比两轮启动的 firmware/probe 消息。'],
    analysis:'PCI 仍显示 SimNIC G1，但本次没有 Kernel driver in use。simnic 模块已加载，日志显示 simnic-fw.bin 加载失败、probe 返回 -2，故障落在驱动初始化/固件路径；接口因此没有创建。不能仅凭 ip link 就判断硬件损坏。修复包恢复固件并重新探测设备；回归要再次启动并检查绑定、接口、链路和吞吐。',
    regression:[['reboot','执行一次模拟重启'],['pci','复查驱动绑定'],['interface','复查接口'],['ethtool','复查链路'],['nettest','完成 iperf3 连通与吞吐测试']]},
  link:{n:'02',title:'千兆只跑百兆',desc:'业务反馈网络约 94 Mbps。链路是否在线？协商到了多少？逐段定位。',
    steps:[['ethtool','查看 Speed / Duplex / Link detected'],['nettest','执行 iperf3 获取吞吐证据'],['cable','检查网线与接头'],['switch','检查交换机端口'],['ends','核对两端自协商配置']],
    options:['请选择你的判断','端口已协商千兆，仅测试工具故障','网线线对异常，导致降为百兆','只要开更多并行连接就能达到千兆','没有 IP 地址'],answer:2,
    hints:['先对比 iperf3 吞吐和 ethtool 的 Speed。','使用工作台的三个模拟现场检查，核对线对、交换机能力和两端配置。'],
    analysis:'Speed=100Mb/s、Duplex=Full、Link detected=yes 表明链路在线但协商为百兆。现场检查中 4–5 线对不连续，交换机支持千兆且双方自协商开启，证据指向网线。更换合格线缆后重新协商到 1000Mb/s，再用同参数 iperf3 验证约 940 Mbps。不同现场也可能是交换机端口或强制配置，本场景结论只由这里的证据支持。',
    regression:[['ethtool','确认重新协商到千兆'],['nettest','重跑同参数 iperf3']]},
  io:{n:'03',title:'压力时 I/O Error',desc:'组合压力下出现存储错误。先复现并停止负载，再保留证据，逐层定位。',
    steps:[['trigger','运行 stress 复现错误'],['stop','停止压力测试'],['kernel','检查 dmesg 的异常'],['current','检查 journal 的异常'],['block','确认磁盘与文件系统映射'],['saved','保存异常日志']],
    options:['请选择你的判断','仅凭 I/O error 就确定磁盘物理损坏','挂载路径拼写错误','控制器/驱动命令超时方向，需保留证据进一步确认','应直接格式化测试盘'],answer:3,
    hints:['先到 stress 模块启动组合负载，再用 stop 或 Ctrl+C 停止。','关注 simhba timeout、reset 和 sdb 错误的先后顺序。I/O error 本身无法证明具体硬件损坏。'],
    analysis:'先记录压力参数与时间、停止负载。日志先出现 simhba command timeout/controller reset，再出现 sdb I/O error；lsblk -f 显示 sdb1→ext4→/mnt/sit 映射仍在。当前证据指向控制器/驱动超时，需要版本对比和硬件日志继续确认，不能直接定论磁盘坏或擅自修复文件系统。提交含原始证据的 Bug 后，在模拟修复包下重新施压、停止、检查日志并用 fio 验证读写。',
    regression:[['trigger','在修复版重新施加压力'],['stop','停止并记录负载'],['kernel','复查本轮 dmesg'],['current','复查本轮 journal'],['fiotest','用 fio 检查测试盘 I/O']]},
  fio:{n:'04',title:'fio 结果明显偏低',desc:'现有作业只有约 600 IOPS。查目标和参数，先保证与基线可比，再下结论。',
    steps:[['fioparams','查看当前低性能作业文件'],['block','确认目标盘与挂载'],['baseline','查看基线与条件'],['fiotest','按基线参数重新执行 fio']],
    options:['请选择你的判断','直接判定测试盘损坏','基线比较无意义','只看 IOPS 数字即可下结论','误测系统盘且作业参数与基线不一致'],answer:4,
    hints:['cat /mnt/sit/low.fio，然后 cat /mnt/sit/baseline.txt。','sync 引擎不能靠 iodepth=16 获得异步队列效果。检查是否还误测系统盘、用了缓存或运行时间过短。'],
    analysis:'异常作业写的是 /root/test.bin（系统盘），使用 sync、iodepth=1、direct=0、runtime=5，与独立测试盘的 4K randread/libaio/16/direct=1/60秒基线不一致。缓存 I/O 也使结果不能与直接 I/O 简单比较。先统一目标与所有关键参数再测，之后仍需多次重复、检查后台负载。本模拟仅训练比较流程，不能证明真实磁盘性能。',
    regression:[['baseline','重新核对基线'],['fiotest','使用修正后的基线作业运行 fio']]}
};
Object.entries(EXTRA_CASES).forEach(([id,c],i)=>scenarios[id]={n:String(i+5).padStart(2,'0'),...c,options:['请选择你的判断',...c.options]});
const presets=[['4k','randread',70],['4k','randwrite',70],['64k','randrw',50],['1m','read',70],['1m','write',70],['4k','randrw',70]];
const baselineCommand='fio --name=baseline --filename=/mnt/sit/test.bin --size=1G --bs=4k --rw=randread --iodepth=16 --ioengine=libaio --direct=1 --runtime=60 --time_based --group_reporting';
const lowCommand='fio --name=low --filename=/root/test.bin --size=1G --bs=4k --rw=randread --iodepth=1 --ioengine=sync --direct=0 --runtime=5 --time_based';
const questions=[
  ['什么是服务器 SIT 测试？', [['系统集成',['系统集成','system integration','sit 是']],['系统与硬件协同',['协同','组合','集成']],['驱动与固件',['驱动','固件']],['功能、性能与稳定性',['功能','性能','稳定']],['缺陷与回归',['缺陷','回归','bug']]], 'SIT 是系统集成测试。服务器场景中，它验证操作系统、CPU、内存、存储、网卡、驱动和固件组合后能否协同工作，包括安装启动、硬件识别、功能、性能、稳定性，以及缺陷跟踪和回归。'],
  ['拿到一台服务器，如何开始测试？', [['核对硬件与版本',['型号','硬件','配置']],['明确范围和通过标准',['范围','标准','需求','用例']],['系统与驱动确认',['系统','版本','驱动']],['基础检查及日志',['识别','日志','检查']],['专项测试、记录和回归',['性能','回归','记录']]], '先核对型号、架构、CPU、内存、磁盘、网卡、固件，确认目标系统、兼容性要求、测试范围和通过标准。安装后检查版本、硬件识别、驱动、网络、存储和日志；按用例执行功能、性能、压力测试，保留结果、提交缺陷，修复后回归并汇总报告。'],
  ['如何检查 CPU、内存、硬盘和网卡？', [['CPU：lscpu',['lscpu']],['内存：free',['free']],['磁盘：lsblk / df',['lsblk','df -h']],['接口：ip link',['ip link','ip -br']],['驱动与日志',['lspci','dmesg','journalctl','ethtool']]], 'lscpu 看 CPU 架构、型号和核心；free -h 看内存总量与 available；lsblk -f、df -hT 看设备、文件系统和挂载；ip -br link/addr 看接口和地址，lspci -nnk 看 PCI 及驱动绑定，ethtool 看速率与驱动，结合 dmesg/journalctl 检查初始化错误。'],
  ['fio 是什么，适合做什么测试？', [['存储 I/O 性能',['磁盘','存储','i/o']],['随机与顺序负载',['随机','顺序']],['性能指标',['iops','吞吐','延迟']],['专用测试文件',['文件','目标','授权']]], 'fio 是存储 I/O 性能测试工具，可设置顺序/随机、读/写/混合负载，观察 IOPS、带宽与延迟。测试前确认目标、空间、参数和基线，写入使用授权的专用测试文件，不能随意写系统盘或裸设备。'],
  ['IOPS、吞吐量、延迟分别是什么？', [['IOPS：每秒次数',['次数','每秒操作','每秒 i/o','每秒io']],['吞吐量：单位时间数据量',['数据量','mib/s','mb/s','带宽']],['延迟：请求耗时',['耗时','响应时间','花费','延迟']],['尾延迟',['p95','p99','尾延迟']]], 'IOPS 是每秒完成的 I/O 次数；吞吐量是单位时间传输的数据量，如 MiB/s；延迟是一次 I/O 从提交到完成的时间，常用 ms 或 μs。P95/P99 是延迟百分位，用来观察慢请求；相同条件下通常希望 IOPS、吞吐更高，延迟更低。'],
  ['fio 常用参数有哪些，各表示什么？', [['目标与块大小',['filename','bs']],['读写模式',['rw','randread','randwrite']],['队列与引擎',['iodepth','ioengine']],['缓存与时长',['direct','runtime']],['混合比例',['rwmixread']]], 'filename 指测试文件；size 指文件大小；bs 为单次块大小；rw 为 read/write/randread/randwrite/randrw；iodepth 为期望未完成 I/O 数，需配合异步 ioengine；direct=1 绕过页缓存；runtime 设置时长，配合 time_based 持续运行；rwmixread 设置混合读写中的读比例。参数必须与基线保持可比。'],
  ['iperf3 如何进行双机测试？', [['服务端 -s',['-s']],['客户端 -c IP',['-c']],['时长/并行/方向',['-t','-p','-r']],['UDP 与带宽',['-u','-b']],['指标',['重传','丢包','jitter','吞吐']]], '两端先确认网络连通与防火墙端口。一端 iperf3 -s，另一端 iperf3 -c 服务端IP；-t 指定时长，-P 指并行连接，-R 反向，-u 使用 UDP，-b 指 UDP 目标带宽。TCP 看吞吐和重传；UDP 看实际接收速率、丢包和 jitter。测试两端都可能成为瓶颈。'],
  ['千兆网卡为什么只跑到 100 Mbps？如何排查？', [['先检查协商速率',['ethtool','speed']],['双工和链路',['duplex','link detected','双工']],['网线和端口',['网线','端口']],['两端配置',['自协商','两端','配置']],['吞吐与链路的区别',['iperf','1000','重传','cpu']]], '先用 ethtool 查看 Speed、Duplex、Link detected。若只协商到 100Mb/s，检查网线线对/接头、交换机端口能力、两端自协商或强制配置。若已是 1000Mb/s 而吞吐偏低，再检查 iperf3 参数、方向、CPU、重传、错误包、MTU、驱动与网络路径。'],
  ['stress 是什么？运行时看哪些指标？', [['CPU 与内存压力',['cpu','内存']],['监控工具',['top','free','vmstat']],['日志与异常',['日志','oom','卡死']],['控制负载及停止',['停止','超时','timeout','可控']],['磁盘性能用 fio',['fio']]], 'stress 用于对 CPU、内存等施加可控负载，观察稳定性。--cpu 指 worker 数，--vm/--vm-bytes 控制内存 worker 和每个申请量，--timeout 控制时间。用 top、free -h、vmstat 和内核日志看资源、swap、OOM、错误或卡死，异常时停止或降载。磁盘性能应由 fio 测量。'],
  ['压力测试出现 I/O Error，怎么处理？', [['先停止或降载',['停止','降载','降低']],['记录时间和命令',['时间','参数','命令']],['保留日志',['dmesg','journalctl','日志']],['设备映射及定位',['lsblk','控制器','文件系统','驱动']],['Bug 与回归',['bug','缺陷','回归']]], '先停止或降低压力，记录异常时间、参数、测试目标和复现步骤。保存 dmesg、journalctl、工具输出和硬件信息，用 lsblk -f/df 确认设备与挂载，区分磁盘、文件系统、控制器或驱动方向。不能只凭 I/O error 判硬盘坏，也不擅自格式化或修复文件系统。整理 Bug，修复后按原步骤及相关功能回归。'],
  ['服务器重启后网卡消失，怎么排查？', [['接口层',['ip link','ip -br']],['硬件和绑定',['lspci']],['模块与驱动',['lsmod','modinfo','驱动']],['两次启动日志',['journalctl','dmesg','上次']],['分层判断',['固件','firmware','probe','pcie']]], '先用 ip -br link 看接口，再用 lspci -nnk 看 PCI 设备及 Kernel driver in use，lsmod/modinfo 检查模块版本，并对比 dmesg 和 journalctl 的当前、上次启动日志。PCI 不见查硬件/BIOS/PCIe；PCI 可见但不绑定查驱动、固件、probe；接口存在则查链路、IP 和路由。按实际证据判断。'],
  ['什么是 Bug 报告和回归测试？', [['环境与版本',['环境','版本']],['可复现步骤与频率',['步骤','频率']],['预期与实际',['预期','实际']],['日志证据',['日志','证据']],['修复后原步骤和相关功能',['回归','修复','相关']]], 'Bug 报告应写明标题、环境版本、前置条件、复现步骤、预期/实际、频率、日志证据和影响。回归测试是在修复版本上重新执行原复现步骤，确认缺陷消失，并检查相关功能没有受影响。不能仅以开发声称已修复就关闭缺陷，应记录回归版本、步骤、结果和证据。']
];
INTERVIEW_BANK.forEach(q=>questions.push([q[1],q[2],q[3],q[4],q[0]]));
const references=[
 ['uname -a','内核与架构。cat /etc/os-release 查看银河麒麟 V10 发行版。','uname -a'],
 ['lscpu / free -h','CPU 型号/核心/线程；内存 total、used、available，结合 swap。','lscpu'],
 ['lsblk -f / df -hT','设备→分区→文件系统→挂载点。测试文件必须位于预期测试盘。','lsblk -f'],
 ['ip -br link / addr','接口是否存在、UP/DOWN，以及 IP 地址；存在与能联网不是一回事。','ip -br addr'],
 ['ethtool enp3s0','查看 Speed、Duplex、Link detected；-i 查看驱动和固件版本。','ethtool enp3s0'],
 ['lspci -nnk','PCI 设备、Kernel driver in use（实际绑定）和 Kernel modules（候选模块）。','lspci -nnk'],
 ['lsmod / modinfo','模块是否加载、文件位置、版本、固件要求；加载不代表成功绑定。','modinfo simnic'],
 ['dmesg / journalctl','dmesg -T 看本次内核；journalctl -b -1 -k 对比上一轮。','journalctl -b -1 -k'],
 ['fio: bs / rw','bs 是每次 I/O 块大小；read/write 顺序，randread/randwrite 随机，randrw 随机混合。',null],
 ['iodepth / ioengine','队列深度是未完成 I/O 数；同步引擎通常不能达到高异步深度。',null],
 ['direct / runtime','direct=1 绕过页缓存；runtime 配合 time_based 控制持续负载时长。',null],
 ['rwmixread','混合读写中读占比，70 表示读 70%、写 30%；仅混合模式生效。',null],
 ['IOPS / BW / Latency','次数/秒、数据量/秒、每次耗时。P95/P99 描述尾延迟；同参数、同环境才可比较。',null],
 ['iperf3 -s / -c IP','对端服务监听 5201；客户端 -t 时长、-P 连接数、-R 反向。','iperf3 -c 192.168.10.20 -t 10 -P 4'],
 ['iperf3 -u -b 800M','UDP 目标带宽，观察实际接收、丢包和 jitter。Mbps 是兆比特每秒。','iperf3 -c 192.168.10.20 -u -b 800M -t 10'],
 ['stress --cpu / --vm','worker 数；--vm-bytes 是每个内存 worker 的申请量；--timeout 是时限。','stress --cpu 2 --vm 1 --vm-bytes 512M --timeout 60s'],
 ['top / vmstat 1','CPU、内存、负载、r/b、si/so、wa。模拟终端输出快照。','vmstat 1'],
 ['Bug / 回归','记录环境、步骤、预期/实际、频率、日志；修复版重跑原步骤和相关功能。',null],
 ['实验室辅助命令','stop 停止压力；save-logs 保存虚拟证据；sim help 查看模拟现场检查。','sim help']
];

function tokens(line) { return shellWords(line); }
function options(args) {
  const opts={}; for(let i=0;i<args.length;i++) {
    if(!args[i].startsWith('-')) continue;
    const equal=args[i].indexOf('=');
    if(equal>0) opts[args[i].slice(0,equal)]=args[i].slice(equal+1);
    else if(args[i+1] && !args[i+1].startsWith('-')) opts[args[i]]=args[++i];
    else opts[args[i]]=true;
  } return opts;
}
function numberIn(value,min,max) { const n=Number(value); return Number.isFinite(n)&&n>=min&&n<=max?n:null; }
function sizeMiB(value) { const m=String(value).match(/^(\d+(?:\.\d+)?)([kmg])(?:i?b)?$/i);return m ? +m[1]*({k:1/1024,m:1,g:1024})[m[2].toLowerCase()] : null; }
function netMbps(value) { const m=String(value).match(/^(\d+(?:\.\d+)?)([kmg])?$/i);return m ? +m[1]*({k:.001,m:1,g:1000})[(m[2]||'').toLowerCase()] || (m&&!m[2]?+m[1]/1e6:null) : null; }
function linkSpeed() { return networkState().speed; }
function freeOutput(unit='kib') {
  note('memory');const available=Math.max(0,16-S.memory),cache=Math.min(1.5,available),free=Math.max(0,available-cache),factor=unit==='mib'?1024:1048576;
  const format=n=>unit==='human'?n.toFixed(1)+'Gi':Math.round(n*factor);
  return `              total used free shared buff/cache available\nMem: ${format(16)} ${format(S.memory)} ${format(free)} ${unit==='human'?'128Mi':Math.round(.125*factor)} ${format(cache)} ${format(available)}\nSwap: ${format(2)} ${format(S.swap)} ${format(2-S.swap)}`;
}
function topOutput() {
  note('monitor');const wa=S.ioError?9:0,used=Math.min(S.cpu,100-wa);
  const process=fault('cpu')?'sim-index':fault('leak')?'sim-cache':S.stress?'stress':'system-monitor';
  return `top - 模拟资源快照 / load average: ${(S.cpu/12+(S.swap>0?2:0)).toFixed(2)}, ${(S.cpu/15).toFixed(2)}, ${(S.cpu/18).toFixed(2)}\nTasks: 162 total, ${S.stress?Math.max(1,Math.min(16,S.stress.cpu+S.stress.vm)):1} running\n%Cpu(s): ${Math.max(0,used-2).toFixed(1)} us, 2.0 sy, ${(100-used-wa).toFixed(1)} id, ${wa.toFixed(1)} wa\nMiB Mem: 16384 total, ${(S.memory*1024).toFixed(0)} used, ${((16-S.memory)*1024).toFixed(0)} available\nMiB Swap: 2048 total, ${(S.swap*1024).toFixed(0)} used\n PID USER      %CPU    RES COMMAND\n 842 student   ${(fault('cpu')?1480:S.stress?S.stress.cpu*100:1).toFixed(1).padStart(6)} ${Math.round((S.memory-2.1)*1048576).toString().padStart(7)} ${process}\n[模拟快照] 进程 %CPU 可超过100；系统 CPU 为16逻辑线程平均。`;
}
function diskOutput(full=false,columns=false) {
  if(columns){note('block');return 'NAME SIZE MODEL\nsda 120G SimBoot120\n'+(storageState().present?'sdb 240G SimSSD240':'');}
  note('block');const mounted=storageState().mounted;
  const system=full?'NAME   FSTYPE LABEL UUID          MOUNTPOINT\nsda\n├─sda1 ext4   boot  SIM-BOOT-01  /boot\n└─sda2 ext4   root  SIM-ROOT-02  /':'NAME   SIZE MODEL          TYPE MOUNTPOINT\nsda    120G SimBoot120     disk\n├─sda1   1G                part /boot\n└─sda2 119G                part /';
  if(!storageState().present)return system+'\n[模拟] 未发现其他块设备。';
  return system+(full?'\nsdb\n└─sdb1 ext4   sit   SIM-TEST-01  '+(mounted?'/mnt/sit':''):'\nsdb    240G SimSSD240      disk\n└─sdb1 240G                part '+(mounted?'/mnt/sit':''));
}
function ipOutput(args,peer=false,override=null,collect=true) {
  const cmd=args.join(' '),brief=args.includes('-br'),n=override||(peer?{missing:false,up:true,carrier:true,ip:'192.168.10.20',route:true,speed:1000}:networkState()),iface=peer?'enp4s0':'enp3s0';
  if(n.customRoute&&cmd.includes('neigh'))return args.includes('-br')?'':(n.neighbor||'');
  if(n.customRoute&&cmd.includes('route')){
    if(!n.ip)return '';
    return (!n.route?`192.168.10.20 via 192.168.10.254 dev ${iface}\n`:'')+`${n.subnet} dev ${iface} proto kernel scope link src ${n.ip}${n.up?'':' linkdown'}`;
  }
  if(cmd.includes('neigh'))return !n.ip?'':`192.168.10.${peer?'10':'20'} dev ${iface} ${n.up&&n.carrier?'lladdr 02:51:54:00:10:20 REACHABLE':'FAILED'}`;
  if(cmd.includes('route')){note('route');return n.missing||!n.ip?'':`${n.route?'default via 192.168.10.1 dev '+iface:'192.168.10.20 via 192.168.10.254 dev '+iface}\n192.168.10.0/24 dev ${iface} src ${n.ip}`;}
  const state=n.up&&n.carrier?'UP':'DOWN',flags='BROADCAST,MULTICAST'+(n.up?',UP':'')+(n.carrier?',LOWER_UP':'');
  if(cmd.includes('addr')){if(collect)note('address');return brief?'lo UNKNOWN 127.0.0.1/8'+(n.missing?'':`\n${iface} ${state} ${n.ip?n.ip+'/'+(n.prefix??24):''}`):'1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo'+(n.missing?'':`\n2: ${iface}: <${flags}> mtu 1500 state ${state}`+(n.ip?`\n    inet ${n.ip}/${n.prefix??24} scope global ${iface}`:''));}
  if(collect)note('interface');if(brief)return 'lo UNKNOWN 00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>'+(n.missing?'':`\n${iface} ${state} 02:51:54:00:10:${peer?'20':'10'} <${flags}>`);
  let out='1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN';if(n.missing)return out;
  out+=`\n2: ${iface}: <${flags}> mtu 1500 state ${state}\n    link/ether 02:51:54:00:10:${peer?'20':'10'}`;
  if(args.includes('-s')){const counters=n.stats||{rxBytes:0,txBytes:0,rxPackets:0,txPackets:0,rxDropped:0};out+=`
    RX: bytes packets errors dropped
        ${counters.rxBytes} ${counters.rxPackets} ${n.rxErrors||0} ${counters.rxDropped}
    TX: bytes packets errors dropped
        ${counters.txBytes} ${counters.txPackets} 0 0`;}return out;
}
function logs(previous=false,service=false,kernelOnly=false) { return coreLogs(previous,service,kernelOnly); }
function getFioConfig(opts) {
  return {name:String(opts['--name']||'sit-test'),groupReporting:opts['--group_reporting']!==undefined&&opts['--group_reporting']!=='0',target:String(opts['--filename']||'/mnt/sit/test.bin'),bs:String(opts['--bs']||'4k').toLowerCase(),rw:String(opts['--rw']||'randread'),depth:Number(opts['--iodepth']||1),runtime:Number(opts['--runtime']||60),direct:Number(opts['--direct']??1),mix:Number(opts['--rwmixread']??70),engine:String(opts['--ioengine']||'libaio'),size:String(opts['--size']||'1G'),jobs:Number(opts['--numjobs']||1),timeBased:opts['--time_based']!==undefined&&opts['--time_based']!=='0'};
}
function isBaseline(c) { return c.target==='/mnt/sit/test.bin'&&c.bs==='4k'&&c.rw==='randread'&&c.depth===16&&c.engine==='libaio'&&c.direct===1&&c.runtime===60&&sizeMiB(c.size)===1024; }
function simulateFioMetrics(c,{testDisk=true,slowdown=false,underLoad=false,ordinal=0}={}){
  const blockMiB=sizeMiB(c.bs),size=sizeMiB(c.size);
  const random=c.rw.startsWith('rand'),effective=(c.engine==='sync'?1:c.depth)*c.jobs,queueFactor=Math.sqrt(Math.min(effective,32)/16);
  let bw=random?Math.min(450,160*queueFactor*Math.sqrt(blockMiB/(4/1024))):Math.min(520,310+Math.min(effective,32)*12);
  const readRatio=['randrw','rw'].includes(c.rw)?c.mix/100:(c.rw.includes('write')?0:1);
  bw*=.8+.2*readRatio;if(!testDisk)bw*=.08;if(c.direct===0)bw*=1.15;if(size<512)bw*=c.direct===0?1.3:.95;if(slowdown)bw*=.23;if(underLoad)bw*=.9;
  // Bounded, reproducible variation, stronger for short runs; no real I/O.
  const wave=Math.sin((ordinal+1)*2.4),variation=1+wave*(c.runtime<30?.10:.018);bw*=variation;
  const elapsed=c.timeBased?c.runtime:Math.min(c.runtime,size*c.jobs/bw);bw=+bw.toFixed(2);
  const iops=Math.max(1,Math.round(bw/blockMiB)),clat=+(effective/iops*1000).toFixed(3),slat=+(.008+c.jobs*.002).toFixed(3),lat=+(slat+clat).toFixed(3),p50=+(clat*.85).toFixed(3),p95=+(clat*1.7).toFixed(3),p99=+(clat*(2.8+(effective>32?.5:0))).toFixed(3);
  const streams=[];if(readRatio>0)streams.push(['READ',readRatio]);if(readRatio<1)streams.push(['WRITE',1-readRatio]);
  const output=`${c.name}: (groupid=0, jobs=${c.jobs}): err=0 [SIMULATED]\n${c.groupReporting||c.jobs===1?streams.map(([label,r])=>`${label}: IOPS=${Math.round(iops*r)}, BW=${(bw*r).toFixed(2)}MiB/s (${(bw*r*elapsed).toFixed(1)}MiB/${elapsed.toFixed(2)}sec)`).join('\n'):Array.from({length:c.jobs},(_,j)=>c.name+'.'+j+': '+streams.map(([label,r])=>`${label}: IOPS=${Math.round(iops*r/c.jobs)}, BW=${(bw*r/c.jobs).toFixed(2)}MiB/s`).join(' ')).join('\n')}\n  slat (msec): avg=${slat}\n  clat (msec): avg=${clat}\n   lat (msec): avg=${lat}\n  clat percentiles (msec):\n   50.00th=[${p50}], 95.00th=[${p95}], 99.00th=[${p99}]\n  effective outstanding I/O≈${effective}, engine=${c.engine}, direct=${c.direct}\n  requested runtime=${c.runtime}s, actual simulated=${elapsed.toFixed(2)}s, time_based=${c.timeBased?1:0}\n  target=${c.target}, bs=${c.bs}, size=${c.size}/job\n[教学模型] 所有数字为模拟数据，不是真实硬盘性能。`;
  return {iops,bw,slat,clat,lat,p50,p95,p99,elapsed,effective,output};
}
async function runFio(args) { return coreFio(args); }
async function runNetwork(args,fromB=false) { return coreNetwork(args,fromB); }
let stressTimer;
function startStress(args) { return coreStartStress(args); }
function stopStress(reason='manual') { return coreStopStress(reason); }
function saveLogs() {
  S.saved=S.captures.map(c=>`[${c.time}] $ ${c.command}\n${c.output}`).join('\n\n');
  if(!S.saved)return 'save-logs: 尚无场景命令输出，请先收集证据。';
  note('saved');return '已保存 '+S.captures.length+' 条场景命令输出到虚拟 /tmp/sit-evidence.log。可 cat 查看，或在 Bug 管理中导入。';
}
function inspectPart(part) {
  const map={cable:['cable',fault('link')?'Cable tester: pair1-2 PASS; pair3-6 PASS; pair4-5 OPEN; pair7-8 PASS':S.netFault==='cable'?'Cable tester: disconnected, no continuity':'Cable tester: all four pairs PASS; connector latch PASS'],switch:['switch',`Port GE1/0/1: 10/100/1000BASE-T; auto-negotiation on; Speed=${linkSpeed()}Mb/s; egress rate-limit=${S.netFault==='switch'?'100':'none'}Mbps`],ends:['ends','Local advertised: 10/100/1000 Full, auto on\nRemote advertised: 10/100/1000 Full, auto on\nForced speed: none']};
  if(!map[part])return 'sim cable | sim switch | sim ends | sim peer start/stop | sim b iperf3 ... | sim wait SECONDS | sim net PROFILE';note(map[part][0]);return map[part][1];
}
async function dispatch(raw) {
  const a=tokens(raw);if(!a.length)return '';if(a[0]==='sudo')a.shift();const cmd=a.shift(),o=options(a);
  if(raw.includes('>')) {
    const match=raw.match(/^(.+?)\s*>\s*(\/tmp\/[\w.-]+)$/);
    if(!match)return '模拟器只支持将命令输出保存到虚拟 /tmp/文件名。不会创建真实文件。';
    const out=await dispatch(match[1]);createVirtualFile(projectEngine().machine,match[2],out.length/1048576,out);S.saved+='\n$ '+match[1]+'\n'+out;note('saved');return 'Output saved to virtual '+match[2];
  }
  if(raw.includes('|')) {
    const m=raw.match(/^(.+?)\s*\|\s*grep\s+(-i\s+)?(.+)$/);
    if(!m)return '模拟器支持简单的 | grep [-i] 关键词，其他管道未实现。';
    const text=await dispatch(m[1]),term=m[3].replace(/^['"]|['"]$/g,'');return text.split('\n').filter(line=>m[2]?line.toLowerCase().includes(term.toLowerCase()):line.includes(term)).join('\n')||'(无匹配行)';
  }
  const unified=await executeUnifiedCommand(raw);if(unified!==null){S.unifiedOutput=true;return unified;}
  switch(cmd) {
    case 'help':return `SIT LAB V2 · 命令全部模拟，无真实 Linux 内核\n新增：hostnamectl / dmidecode -t system|bios / id / ps aux / date\n存储：fdisk -l / blkid / findmnt / smartctl -a /dev/sdb / iostat -x 1\n网络：ss -tulnp / ip neigh / traceroute / route -n / ethtool -S enp3s0\n服务：systemctl status sit-agent / systemctl list-units\n日志：grep -i error /var/log/messages / tail -n 10 /var/log/messages / less /var/log/messages\n系统: uname -a | cat /etc/os-release | lscpu | nproc | free -h | top | uptime | vmstat 1\n磁盘: lsblk [-f] | df -hT | mount\n网络: ip link | ip -br link | ip -br addr | ip route | ip -s link\n      ethtool enp3s0 | ethtool -i enp3s0 | ping -c 4 192.168.10.20\n驱动: lspci -nnk | lsmod | modinfo simnic | modinfo simhba\n日志: dmesg -T | journalctl -b -k | journalctl -b -1 -k | systemctl --failed\n性能: fio --help | iperf3 --help | stress --help\n辅助: clear | history | stop | save-logs | sim help | reboot（模拟）\n文件: cat /mnt/sit/baseline.txt | cat /mnt/sit/low.fio | cat /tmp/sit-evidence.log\n支持简单 grep 与 > /tmp/文件名；top/vmstat/ping 均为有限快照。`;
    case 'clear':$('terminal-output').replaceChildren();return '';
    case 'history':return S.history.map((c,i)=>`${String(i+1).padStart(3)}  ${c}`).join('\n');
    case 'uname':practice('terminal');return 'Linux sit-server-01 4.19.90-sit.sim #1 SMP Fri Oct 30 2026 x86_64 GNU/Linux [模拟内核]';
    case 'hostname':return 'sit-server-01';
    case 'whoami':return 'student';
    case 'pwd':return '/home/student';
    case 'nproc':return '16';
    case 'cat': {
      const path=a[0];
      if(path==='/etc/fstab'){note('config');return 'UUID=SIM-ROOT-02 / ext4 defaults 0 1\nUUID='+ (fault('mount')?'SIM-TEST-99':'SIM-TEST-01')+' /mnt/sit ext4 defaults 0 2';}
      if(path?.includes('ifcfg-enp3s0')){note('config');return 'DEVICE=enp3s0\nONBOOT=yes\nBOOTPROTO=none'+(fault('netpersist')?'\n# IPADDR 未保存':'\nIPADDR=192.168.10.10\nPREFIX=24\nGATEWAY=192.168.10.1');}
      if(path==='/etc/sit-agent.conf'){note('config');return 'listen_port='+(fault('service')?'abc':'9090');}
      if(path==='/var/log/messages')return logs();
      if(path==='/etc/os-release')return 'NAME="Kylin Linux Advanced Server"\nVERSION="V10 (Simulated)"\nID="kylin"\nVERSION_ID="V10"\nPRETTY_NAME="银河麒麟高级服务器操作系统 V10（模拟）"';
      if(path==='/mnt/sit/baseline.txt'){note('baseline');return '虚拟基线 / 测试版本 1.0\n目标 /mnt/sit/test.bin → sdb1/ext4；文件 1G\nbs=4k rw=randread ioengine=libaio iodepth=16 direct=1 runtime=60 time_based\n示例通过范围：38,000–45,000 IOPS；约 148–176 MiB/s；平均延迟约 0.39ms\n'+baselineCommand+'\n基线仅用于教学。需同环境同参数比较，真实项目还需重复测量。';}
      if(path==='/mnt/sit/low.fio'){note('fioparams');return '[low]\nfilename=/root/test.bin\nsize=1G\nbs=4k\nrw=randread\nioengine=sync\niodepth=1\ndirect=0\nruntime=5\ntime_based=1\n[模拟] 当前报告约 600 IOPS，请与基线逐项对照。';}
      if(path==='/mnt/sit/fixed.fio'){note('fioparams');return '[baseline]\nfilename=/mnt/sit/test.bin\nsize=1G\nbs=4k\nrw=randread\nioengine=libaio\niodepth=16\ndirect=1\nruntime=60\ntime_based=1';}
      if(path==='/tmp/sit-evidence.log'||path?.startsWith('/tmp/'))return S.saved||'cat: 尚无已保存的虚拟证据。';
      return 'cat: '+(path||'未指定路径')+': 虚拟文件不存在。';
    }
    case 'lscpu':return 'Architecture:          x86_64\nCPU op-mode(s):        32-bit, 64-bit\nCPU(s):                16\nOn-line CPU(s) list:    0-15\nThread(s) per core:    2\nCore(s) per socket:    8\nSocket(s):             1\nModel name:            SimServer 3200 (虚构教学 CPU)\nCPU MHz:               2400.000\nNUMA node(s):          1';
    case 'free':return freeOutput(a.includes('-h')?'human':a.includes('-m')?'mib':'kib');
    case 'top':return topOutput();
    case 'uptime':return `09:30:00 up 2:10, 1 user, load average: ${(S.cpu/12).toFixed(2)}, ${(S.cpu/15).toFixed(2)}, ${(S.cpu/18).toFixed(2)} [模拟]`;
    case 'vmstat':note('monitor');return vmstatOutput();
    case 'lsblk':return diskOutput(a.includes('-f'),a.includes('-o'));
    case 'df':note('space');note('block');return dfOutput(a.some(v=>/^-[^-]*T/.test(v)));
    case 'du':return duOutput(a);
    case 'mount':note('mount');return mountOutput();
    case 'ip':if(!a.some(x=>['link','addr','route','neigh'].includes(x)))return 'ip: 支持 link、addr、-br link/addr、-s link、route、neigh。';return ipOutput(a);
    case 'ethtool':return ethtoolOutput(a);
    case 'ping':return pingOutput(a);
    case 'lspci':note('pci');return pciOutput();
    case 'lsmod':note('module');return 'Module            Size Used by\n'+(fault('driver')?'':'simnic           98304 '+(fault('nic')?'0':'1')+'\n')+(fault('bootdriver')?'':'simhba          163840 2\n')+'ext4            745472 3\n[模拟] 已装载不代表成功绑定。';
    case 'modinfo': {
      if(!['simnic','simhba'].includes(a[0]))return 'modinfo: 本模拟可查 simnic 或 simhba。';note('driver');
      return `filename: /lib/modules/4.19.90-sit.sim/kernel/drivers/${a[0]}.ko\nversion: ${S.fixed?'1.1':'1.0'}\ndescription: Simulated teaching driver\nlicense: GPL (fictional metadata)\n${a[0]==='simnic'?'firmware: simnic-fw.bin\n':''}vermagic: 4.19.90-sit.sim SMP mod_unload`;
    }
    case 'dmesg':if(S.scene!=='io'||S.ioError||S.fixed)note('kernel');return logs(false,false,true);
    case 'journalctl': {
      const kernel=a.includes('-k'),systemFocus=['mount','netpersist','service'].includes(S.scene);
      if(a.includes('-1')){
        if(!kernel||S.scene!=='netpersist')note('previous');
        return logs(true,false,kernel);
      }
      if((!kernel||!systemFocus)&&(S.scene!=='io'||S.ioError||S.fixed))note('current');
      return logs(false,a.includes('-u'),kernel);
    }
    case 'systemctl':note('service');return systemctlOutput(a);
    case 'fio':if(o['--help'])return 'fio 支持 --numjobs=N、--time_based=0/1、rw=rw；trim仅解释不执行。fio [虚拟作业.fio] 或 --filename=/mnt/sit/test.bin --bs=4k --rw=randread --ioengine=libaio --iodepth=16 --direct=1 --size=1G --runtime=60 --time_based；混合使用 --rwmixread=70。';return runFio(a);
    case 'iperf3':if(o['--help'])return 'iperf3 -s | iperf3 -c 192.168.10.20 [-t 10] [-P 4] [-R] [-u -b 800M]；sim peer start 启动模拟对端。';return runNetwork(a);
    case 'stress-ng':case 'stress':if(o['--help'])return 'stress --cpu N --vm N --vm-bytes 512M --timeout 60s；--vm-bytes 为每个 vm worker 的内存；stop 停止。';{const result=startStress(a);if(S.stress&&cmd==='stress-ng')S.stress.command=S.stress.command.replace(/^stress /,'stress-ng ');return result;}
    case 'stop':return stopStress();
    case 'pkill':if(a.includes('stress'))return stopStress();return 'pkill: 模拟器仅支持 pkill stress。';
    case 'save-logs':return saveLogs();
    case 'reboot':stopStress();S.boot++;if(S.scene==='nic'||S.scene==='netpersist')['pci','interface','address','route','ethtool','nettest'].forEach(key=>S.evidence.delete(key));note('reboot');return '模拟重启完成 boot='+S.boot+'，请重新检查接口、地址、驱动与日志。不会重启真实电脑。';
    case 'sim': {
      if(a[0]==='b') {if(a[1]==='iperf3')return runNetwork(a.slice(2),true);if(a[1]==='ip')return ipOutput(a.slice(2),true);return 'B端仅模拟网络子系统：sim b iperf3 ... 或 sim b ip addr。';}
      if(a[0]==='wait'){const sec=Number(a[1]||30);if(!numberIn(sec,1,3600))return 'sim wait 需要1–3600秒。';advanceTime(sec);return '模拟时间已推进 '+sec+'秒。请再次检查资源。';}
      if(a[0]==='net'){if(S.scene)return 'sim: current scenario owns network state; exit the scenario before choosing a separate profile';if(!['none','speed','cable','switch','down','ip','route','retrans','udploss'].includes(a[1]))return 'sim net none|speed|cable|switch|down|ip|route|retrans|udploss';S.netFault=a[1];$('net-fault').value=a[1];refresh();return '网络练习状态已切换。';}
      if(a[0]==='peer'){if(a[1]==='start')return runNetwork(['-s','-p',a[2]||'5201'],true);if(a[1]!=='stop')return 'sim peer start 或 stop';S.peerServer=false;refreshNetwork();return 'B端iperf3服务已停止。';}
      return inspectPart(a[0]);
    }

    case 'hostnamectl':return 'Static hostname: sit-server-01\nChassis: server\nOperating System: Kylin V10 (模拟)\nKernel: Linux 4.19.90-sit.sim\nArchitecture: x86-64';
    case 'dmidecode':note('dmi');return a.includes('bios')?'BIOS Information\nVendor: SimFirmware\nVersion: SimUEFI 2.6.0\nRelease Date: 07/01/2026\nUEFI supported [虚构]':'System Information\nManufacturer: SIT Teaching Hardware\nProduct Name: SimRack R200\nSerial Number: SIM-0001 [虚构]';
    case 'id':return 'uid=1000(student) gid=1000(student) groups=1000(student),10(wheel) [模拟]';
    case 'date':return new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' Asia/Shanghai [页面时钟]';
    case 'ps':note('process');return processOutput();
    case 'fdisk':if(!a.includes('-l'))return 'fdisk: 本模拟只支持 fdisk -l 查看，不实现写分区。';note('block');return 'Disk /dev/sda: 120 GiB, model SimBoot120\n/dev/sda1 1G Linux filesystem\n/dev/sda2 119G Linux filesystem'+(storageState().present?'\nDisk /dev/sdb: 240 GiB, model SimSSD240\n/dev/sdb1 240G Linux filesystem':'');
    case 'blkid':note('block');return '/dev/sda2: UUID="SIM-ROOT-02" TYPE="ext4"'+(storageState().present?'\n/dev/sdb1: UUID="SIM-TEST-01" TYPE="ext4"':'');
    case 'findmnt':note('mount');return mountOutput(true);
    case 'smartctl':return smartOutput(a);
    case 'iostat':note('iostat');return fault('slowdown')?'Device r/s w/s rMiB/s wMiB/s await %util\nsdb 900 4500 12.0 260.0 35.0 99.0':'Device r/s w/s rMiB/s wMiB/s await %util\nsdb 100 80 1.5 1.0 0.4 12.0\n[模拟单次快照]';
    case 'ss':note('sockets');return 'Netid State Local Address:Port Process\n'+(S.localServer?`tcp LISTEN 0.0.0.0:${S.localPort} iperf3\n`:'')+(!fault('service')?'tcp LISTEN 0.0.0.0:9090 sit-agent\n':'')+'tcp LISTEN 0.0.0.0:22 sshd [模拟]';
    case 'route':note('route');return ipOutput(['route']);
    case 'traceroute':return networkState().route&&networkState().ip?'[模拟] 1 192.168.10.1 0.5ms\n2 '+(a[0]||'192.168.20.20')+' 1.0ms':'[模拟] 1 192.168.10.254 0.4ms\n2 * * *\nDestination unreachable';
    case 'grep':case 'tail':case 'less':return logFileCommand(cmd,a);
    default:return `${cmd}: 未实现的模拟命令。没有执行任何真实命令；输入 help 查看支持列表。`;
  }
}
async function execute(command) {
  const raw=String(command).trim();if(!raw)return '';
  const practiceRun=currentPractice(),parsed=analyseInput(raw);
  if(practiceRun)return executePractice(parsed,practiceRun);
  S.history.push(raw);S.historyIndex=S.history.length;appendTerminal('student@sit-server:~$ '+raw,'prompt');
  S.lastCoreResult=null;S.unifiedOutput=false;
  const underLoad=!!S.stress,operationContext={...evidenceEnvironment(),projectId:S.project.id,lessonId:S.academy.activeLesson||null,attemptId:courseRecord(S.academy.activeLesson)?.attemptId||null,loadId:S.stress?.runId||null};let original;
  $('terminal-execution-status').textContent='RUNNING';
  try{original=parsed.issues.length?'unsupported simulated syntax':parsed.segments[0]?.opts['--help']?'help':await dispatch(raw);}catch(error){original='simulator: execution error: '+error.message;}
  const typed=S.lastCoreResult?.raw===raw?S.lastCoreResult:null;
  const failed=Boolean(typed?.failed)||failedSimulation(parsed,original),output=S.unifiedOutput&&!parsed.operators.length?original:terminalOutput(raw,original,parsed);
  if(output)appendTerminal(output);$('terminal-execution-status').textContent=failed?'ERROR':'COMPLETED';
  if(raw!=='clear')record(raw,output,!failed&&!parsed.segments[0]?.opts['--help']);
  practice('terminal');afterCommand(raw,output,parsed,failed,underLoad,operationContext);refresh();return output;
}
function fioFormCommand() {
  return `fio --name=sit-test --filename=${$('fio-target').value} --size=${$('fio-size').value} --bs=${$('fio-bs').value} --rw=${$('fio-rw').value} --iodepth=${$('fio-depth').value} --numjobs=${$('fio-jobs').value} --ioengine=${$('fio-engine').value} --direct=${$('fio-direct').value} --runtime=${$('fio-runtime').value} --rwmixread=${$('fio-mix').value}${$('fio-time-based').checked?' --time_based':''} --group_reporting`;
}
function networkFormCommand() {
  return `${$('net-client').value==='B'?'sim b ':''}iperf3 -c ${$('net-ip').value.trim()} -p ${$('net-port').value} -t ${$('net-time').value} -P ${$('net-parallel').value}${$('net-reverse').checked?' -R':''}${$('net-protocol').value==='udp'?' -u -b '+$('net-bandwidth').value:''}`;
}
function stressFormCommand() {
  const mode=$('stress-mode').value;
  return `stress${mode!=='memory'?' --cpu '+$('stress-cpu').value:''}${mode!=='cpu'?' --vm '+$('stress-vm').value+' --vm-bytes '+$('stress-memory').value:''}${Number($('stress-io').value)>0?' --io '+$('stress-io').value:''} --timeout ${$('stress-time').value}s`;
}
function updateCommands() {$('fio-command').textContent=fioFormCommand();$('net-command').textContent=networkFormCommand();$('stress-command').textContent=stressFormCommand();}
function setFioForm(low=false) {
  $('fio-jobs').value=1;$('fio-time-based').checked=true;
  $('fio-target').value=low?'/root/test.bin':'/mnt/sit/test.bin';$('fio-bs').value='4k';$('fio-rw').value='randread';$('fio-depth').value=low?1:16;
  $('fio-engine').value=low?'sync':'libaio';$('fio-direct').value=low?'0':'1';$('fio-runtime').value=low?5:60;$('fio-mix').value=70;$('fio-size').value='1G';$('fio-preset').value='0';updateCommands();
}
function metric(label,value,unit='',error=false) {return `<div class="metric${error?' error':''}"><small>${label}</small><b>${esc(value)}<span>${unit}</span></b></div>`;}
function renderFioResult() {
  const r=S.lastFio;if(!r)return;if(r.error){$('fio-result').innerHTML='<pre class="light-log">'+esc(r.output)+'</pre>';return;}const c=r.config;
  $('fio-result').innerHTML=`<div class="panel-title"><h2>磁盘测试结果</h2><span class="tag">SIMULATED / err=0</span></div><div class="result-metrics">${metric('IOPS · 总操作率',r.iops.toLocaleString(),'次/秒')}${metric('BW · 总吞吐',r.bw,'MiB/s')}${metric('slat / clat / lat',r.slat+' / '+r.clat+' / '+r.lat,'ms')}${metric('P50 / P95 / P99',r.p50+' / '+r.p95+' / '+r.p99,'ms')}</div><p class="result-notes">${c.engine==='sync'?'sync 每作业有效深度为1；':c.engine+'模拟异步请求；'}总在途约 ${(c.engine==='sync'?1:c.depth)*c.jobs}。${c.direct===0?'缓存会改变测量条件，勿与direct=1直接比较。':''}${c.target.startsWith('/root')?'目标是系统盘。':'目标是独立测试盘。'}${c.timeBased?'持续模拟指定时长。':'仅跑一轮size数据集，可能在runtime前完成。'}<br>IOPS≈BW/块大小；并发达到设备瓶颈后，吞吐收益递减，排队延迟可能继续增长。slat为提交开销，clat为提交到完成，lat为两者之和；百分位基于clat。</p><pre class="light-log">${esc(r.output)}</pre><button data-add-compare="${r.id}">加入两组结果对比</button>`;
}
function renderNetworkResult() {
  const r=S.lastNet;if(!r)return;if(r.error){$('net-result').innerHTML='<pre class="light-log">'+esc(r.output)+'</pre>';return;}
  $('net-result').innerHTML=`<div class="panel-title"><h2>${r.udp?'UDP':'TCP'} 网络结果</h2><span class="tag">SIMULATED</span></div><div class="result-metrics">${metric('接收吞吐',r.throughput,'Mbps')}${r.udp?metric('Lost / Lost%',r.lost+' / '+r.loss,'%'):metric('Retr · TCP重传',r.retrans,'次')}${r.udp?metric('Jitter',r.jitter,'ms'):metric('传输数据',r.transfer,'MBytes')}${metric('并行流',r.parallel,'条')}</div><p class="result-notes">方向：${esc(r.direction)}。${r.local?'回环不能证明物理网络性能。':'协议开销、两端与路径均影响吞吐。'}${r.udp?' -b 为每流目标，合计目标随-P增加；发送目标不等于实际接收。':''}<br>Speed=100Mb/s、Duplex=Full、Link detected=yes：有链路、全双工、协商速率百兆。</p><pre class="light-log">${esc(r.output)}</pre>`;
}
function refreshButtons() {
  $('fio-form').querySelector('button[type=submit]').disabled=S.busy.fio;
  $('network-form').querySelector('button[type=submit]').disabled=S.busy.network;
}
function refreshResources() {
  $('stress-status').textContent=S.stress?'RUNNING / '+Math.min(S.stress.elapsed,S.stress.duration)+'s':'IDLE';
  $('resource-monitor').innerHTML=`<div class="resource-row"><div><span>CPU /16逻辑线程</span><b>${S.cpu.toFixed(1)}%</b></div><div class="resource-bar"><i style="width:${S.cpu}%"></i></div></div><div class="resource-row"><div><span>内存 /16GiB</span><b>${S.memory.toFixed(1)} GiB</b></div><div class="resource-bar"><i style="width:${S.memory/16*100}%"></i></div></div><div class="mini-metrics"><span>Available <b>${(16-S.memory).toFixed(1)}GiB</b></span><span>Swap used <b>${S.swap.toFixed(1)}/2GiB</b></span></div><p class="muted">${S.stress?esc(S.stress.command)+' · 剩余'+Math.max(0,S.stress.duration-S.stress.elapsed)+'模拟秒':'当前无主动压力。背景故障仍可能占用资源。'}</p>${S.resourceMessages.length||S.ioError?'<div class="info-box warn">'+esc((S.ioError?'I/O error，保留日志。\n':'')+S.resourceMessages.join('\n'))+'</div>':''}`;
}
function refreshNetwork() {
  const n=networkState();$('link-speed').textContent=n.missing?'接口未创建':!n.carrier?'无载波':n.speed+' Mbps';
  $('server-state').textContent='A .10: '+(S.localServer?'监听 '+S.localPort:'未启动')+' ｜ B .20: '+(S.peerServer?'监听 '+S.peerPort:'未启动');
  $('local-server').textContent=S.localServer?'A端已启动:'+S.localPort:'启动A端 iperf3 -s';$('peer-toggle').textContent=S.peerServer?'停止B端服务':'启动B端服务';
  $('endpoint-a').innerHTML=`<b>服务器 A · 本机</b><br>IP：${n.ip||'无IPv4'} / enp3s0<br>网卡：${n.missing?'未创建':n.up?'UP':'DOWN'} · ${n.carrier?n.speed+'Mb/s Full':'无载波'}<br>驱动：${n.missing?'未成功绑定':'simnic 1.0'}<br>服务端：${S.localServer?'监听 '+S.localPort:'未启动'}`;
  $('endpoint-b').innerHTML=`<b>服务器 B · 模拟对端</b><br>IP：192.168.10.20 / enp4s0<br>网卡：UP · 1000Mb/s Full<br>驱动：simnic 1.0<br>服务端：${S.peerServer?'监听 '+S.peerPort:'未启动'}<br>客户端：${S.busy.network?'测试中':S.lastNet?.error?'上次连接失败':S.lastNet?.fromB?'最近测试已完成':'待执行'}`;
}
function refresh() {
  renderKernelWorkbench();
  if(['home','lesson','cases'].includes(S.page))return;
  syncProjectMachine();
  $('page-status').textContent=S.scene?'● '+(S.fixed?'修复版 1.1 · ':'故障注入 · ')+scenarios[S.scene].title:'● 教学服务器在线';
  if(S.page==='overview')$('overview-stats').innerHTML=[['CPU / PROCESSOR','8','核 / 16线程','SimServer 3200 · x86_64'],['MEMORY','16','GiB','可用 '+(16-S.memory).toFixed(1)+' GiB / 模拟'],['STORAGE','240','GiB','独立测试盘 · /mnt/sit'],['NETWORK',networkState().missing?'N/A':linkSpeed(),'Mbps',networkState().missing?'enp3s0 未创建':!networkState().up?'enp3s0 DOWN':!networkState().carrier?'无载波':'enp3s0 · '+linkSpeed()+'Mb/s']].map(([a,b,c,d])=>`<div class="stat"><small>${a}</small><b>${b}<em>${c}</em></b><p>${d}</p></div>`).join('');
  $('learning-progress').textContent=`已体验 ${['fio','network','stress'].filter(k=>S.practiced.includes(k)).length}/3 个专项实验 · 已完成 ${S.completed.length}/${Object.keys(scenarios).length} 个故障 · 已练习 ${Object.keys(S.answers).filter(k=>!k.includes(':')).length}/${questions.length} 道面试题`;
  if(['overview','project'].includes(S.page))renderProject();
  if(S.page==='overview')renderLiveHardware();
  if(S.page==='hardware')$('hardware-info').innerHTML='<table><thead><tr><th>项目</th><th>配置 / 教学数据</th></tr></thead><tbody>'+liveEnvironment().map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join('')+'</tbody></table>';
  $('terminal-scenario').innerHTML=S.scene?`当前：${esc(scenarios[S.scene].title)}${S.fixed?' · 修复版 1.1':' · 故障版 1.0'}。${S.evidence.size} 项证据已收集。<button data-go="faults">返回排查工作台 →</button> <button data-action="save">保存证据</button>`:'建议先运行 uname -a、lscpu、lsblk -f、ip -br link。输入 help 查看所有命令；在故障排查中选择场景后，这里会显示相应异常。';
  if(S.page==='network')refreshNetwork();if(S.page==='stress')refreshResources();
  if(S.page==='faults')renderScenarios();if(S.page==='bugs')renderBugs();if(S.page==='assessment')renderAssessmentPage();
  renderWorkMode();renderSessionBar();
  if(assessmentActive()){$('page-status').textContent='● 独立考核 · 无解析模式';$('terminal-scenario').textContent=S.coach.exam.injected?scenarios[S.coach.exam.caseId].desc:'按任务书自行巡检和执行测试。';}
  else if(S.coach.mode==='free'&&!S.scene)$('terminal-scenario').textContent='自由实操：自行决定检查目标和下一步，解析在执行之后生成。';
}
function startScenario(id) {
  if(!scenarios[id])return;archiveCurrentScenario('切换场景');stopStress();S.generation++;S.scene=id;S.fixed=false;S.regression=null;S.evidence=new Set();S.captures=[];S.saved='';S.hints=0;S.explanation=false;S.diagnosisMessage='';S.ioError=false;S.boot=id==='nic'?2:1;S.lastFio=null;S.lastNet=null;$('scene-select').value=id;
  $('fio-result').innerHTML='<div class="empty-state"><span>▥</span><h3>场景已加载</h3><p>请执行测试并查看结果。</p></div>';
  $('net-result').innerHTML='<div class="empty-state"><span>⇄</span><h3>场景已加载</h3><p>请执行网络测试并查看结果。</p></div>';
  $('stress-log').textContent='场景已加载，等待启动压力测试。';
  resetFaultState();setFioForm(id==='fio');$('case-library').open=false;$('bug-scene').value=id;persist();showPage('faults');toast('已载入故障场景。先收集证据，再提交判断。');
}
function endScenario() {
  archiveCurrentScenario('退出场景');stopStress();S.generation++;S.scene=null;S.regression=null;S.fixed=false;S.ioError=false;S.evidence=new Set();S.captures=[];S.saved='';S.diagnosisMessage='';resetFaultState();setFioForm(false);persist();refresh();toast('已恢复正常教学服务器。已有 Bug 与完成记录已保留。');
}
function checklist(steps) {return '<ul class="checklist">'+steps.map(([key,label])=>`<li class="${S.evidence.has(key)?'ok':''}">${esc(label)}</li>`).join('')+'</ul>';}
function renderScenarios() {
  $('scenario-cards').innerHTML=Object.entries(scenarios).map(([id,c])=>`<div class="scene-card${S.scene===id?' selected':''}"><small>CASE ${c.n}</small>${S.completed.includes(id)?'<span class="done">✓ 已完成</span>':''}<h3>${c.title}</h3><p>${c.desc}</p><button data-start-scene="${id}">开始排查 →</button></div>`).join('');
  const host=$('scenario-workbench');if(!S.scene){host.innerHTML='<div class="info-box">载入一个场景，或随机抽取。自由模式隐藏证据清单、快捷命令、选项和提示，需要自己提出初步判断、原因与处理建议。</div>';return;}
  const c=scenarios[S.scene];if(S.fixed){host.innerHTML=`<div class="panel"><div class="panel-title"><h2>修复版1.1 · 回归工作台</h2><button data-action="end-scene">恢复正常环境</button></div><p class="muted">重新执行原步骤和相关功能。网络测试需先启动目标端服务；下面的检查只有实际执行后才会勾选。</p>${checklist(c.regression)}<div class="inline-actions"><button class="primary" data-go="terminal">到终端执行回归</button><button data-go="fio">fio</button><button data-go="network">网络</button><button data-go="stress">压力</button><button data-go="bugs">提交回归判断</button></div></div>`;return;}
  const oldChoice=$('diagnosis')?.value||'0',oldAnalysis=$('case-analysis')?.value||'',oldAdvice=$('case-advice')?.value||'';
  const cmds=c.commands||({nic:['ip -br link','lspci -nnk','lsmod','dmesg -T','journalctl -b -k','journalctl -b -1 -k'],link:['ethtool enp3s0','iperf3 -c 192.168.10.20 -t 10','sim cable','sim switch','sim ends'],io:['stress --cpu 8 --vm 1 --vm-bytes 2G --timeout 60s','stop','dmesg -T','journalctl -b -k','lsblk -f'],fio:['cat /mnt/sit/low.fio','fio /mnt/sit/low.fio','lsblk -f','cat /mnt/sit/baseline.txt']})[S.scene];
  host.innerHTML=`<div class="panel"><div class="panel-title"><h2>${S.freeMode?'自由排查 · 未知故障':'CASE '+c.n+' · '+c.title}</h2><button data-action="end-scene">恢复正常环境</button></div><div class="flow-caption">现象 → 初步判断 → 执行命令 → 输出 → 证据分析 → 确认原因 → 处理建议 → 修复回归</div><div class="info-box">${esc(c.desc)}</div>${S.freeMode?'<p class="muted">本模式不展示检查清单与提示。进入终端独立收集证据。</p><button data-go="terminal">进入终端</button>':`<div class="evidence-grid"><div><h3>需要取得的证据</h3>${checklist(c.steps)}</div><div><h3>命令练习入口</h3><div class="scene-actions">${cmds.map(cmd=>`<button data-cmd="${esc(cmd)}">${esc(cmd)}</button>`).join('')}</div><div class="inline-actions"><button data-action="hint">下一条提示 (${Math.min(S.hints,2)}/2)</button><button data-action="solution">主动查看解析</button></div>${S.hints?'<div class="info-box spaced">'+c.hints.slice(0,S.hints).map(esc).join('<br>')+'</div>':''}</div></div>`}<div class="diagnosis">${S.freeMode?'':`<label>初步原因判断<select id="diagnosis">${c.options.map((v,i)=>`<option value="${i}"${String(i)===oldChoice?' selected':''}>${esc(v)}</option>`).join('')}</select></label>`}<label>证据分析 / 原因判断<textarea id="case-analysis" rows="3" placeholder="写出命令看到的事实，以及事实为什么支持你的判断">${esc(oldAnalysis)}</textarea></label><label>处理建议及验证方法<textarea id="case-advice" rows="2" placeholder="建议如何处理，修复后如何验证">${esc(oldAdvice)}</textarea></label><div class="inline-actions"><button class="primary" data-action="diagnose">确认排查结论</button><button data-action="save">保存证据</button><button data-action="prepare-bug">整理Bug并进入修复回归</button></div><p class="muted">${esc(S.diagnosisMessage)}</p></div>${S.explanation&&!S.freeMode?'<div class="solution"><b>最终解析 / 处理与验证建议</b><br>'+esc(c.analysis)+'</div>':''}</div>`;
}
function submitDiagnosis() {
  const c=scenarios[S.scene],analysis=$('case-analysis').value.trim(),advice=$('case-advice').value.trim();
  if(analysis.length<8||advice.length<6){toast('请补充自己的证据分析和处理/验证建议。');return;}
  const missing=c.steps.filter(([key])=>!S.evidence.has(key));
  if(missing.length)S.diagnosisMessage=S.freeMode?'证据仍不足，请继续从不同层次验证推断。':'仍缺证据：'+missing.map(([,label])=>label).join('、');
  else if(S.freeMode?!freeDiagnosisMatches(S.scene,analysis):Number($('diagnosis').value)!==c.answer)S.diagnosisMessage='判断与证据还未形成一致结论，请对照实际输出重新分析。';
  else {S.diagnosisMessage='排查已完成。原因、建议和原始证据已记录到项目；下一步提交Bug并在修复版验证。';S.explanation=!S.freeMode;if(!S.completed.includes(S.scene))S.completed.push(S.scene);S.project.cases.push({...evidenceEnvironment(),id:S.scene,title:c.title,at:stamp(),analysis,advice,free:S.freeMode,assisted:S.hints>0||S.explanation,commands:S.captures.map(c=>c.command)});persist();}
  renderScenarios();renderProject();
}
function prepareBug() {
  if(!S.scene)return;saveLogs();$('bug-scene').value=S.scene;
  const f=$('bug-form');f.elements.title.value=scenarios[S.scene].title+'（模拟故障版 1.0）';f.elements.logs.value=S.saved;
  f.elements.environment.value='SIT-SERVER-01 / 银河麒麟 V10（模拟） / 内核 4.19.90-sit.sim / 16GB / simnic 1.0 / simhba 1.0';
  showPage('bugs');toast('已填入标题、环境和证据；请亲自补充步骤、预期、实际与结论。');
}
function renderBugs() {
  const list=$('bug-list');if(!S.bugs.length){list.innerHTML='<div class="panel empty-state"><span>⚑</span><h3>还没有模拟缺陷</h3><p>在左侧填写报告，或从故障排查工作台导入证据。</p></div>';return;}
  list.innerHTML=S.bugs.slice().reverse().map(b=>{
    const active=S.regression===b.id&&S.fixed&&S.scene===b.scene;
    return `<article class="bug-card"><div class="bug-header"><span>${esc(b.id)} · ${esc(b.created)}</span><span class="status-badge${b.status==='已关闭'?' closed':''}">${esc(b.status)}</span></div><h3>${esc(b.title)}</h3><p class="muted">关联：${b.scene?(assessmentActive()?'当前未知故障工单':scenarios[b.scene]?.title):'一般缺陷'} · 当前回归版本：${b.version||'尚未应用修复'}</p><details><summary>查看完整报告和证据</summary>${[['environment','环境'],['steps','步骤'],['expected','预期'],['actual','实际'],['frequency','频率'],['logs','日志'],['conclusion','结论']].map(([key,label])=>`<p><b>${label}</b><br>${esc(b[key])}</p>`).join('')}</details>${b.scene?`<div class="inline-actions"><button data-fix="${b.id}">${active?'重新加载修复版本':'应用模拟修复版 1.1'}</button>${active?`<button data-go="faults">查看回归条件</button><button data-go="terminal">执行回归命令</button><button data-pass="${b.id}">判断：已解决</button><button data-fail="${b.id}">判断：未解决</button>`:''}</div>`:'<p class="muted">一般缺陷仅记录报告；关联教学场景后可使用模拟修复包。</p>'}${active?'<div class="regression-box">本轮回归证据：'+scenarios[b.scene].regression.map(([key,label])=>(S.evidence.has(key)?'✓ ':'○ ')+esc(label)).join(' · ')+'</div>':''}${b.regressions?.length?'<details><summary>回归记录 ('+b.regressions.length+')</summary>'+b.regressions.map(r=>'<p><b>'+esc(r.time)+' / '+esc(r.verdict)+'</b><br>版本 '+esc(r.version)+'<br>'+esc(r.evidence)+'</p>').join('')+'</details>':''}</article>`;
  }).join('');
}
function applyFix(id) {
  captureAssessmentBeforeFix();archiveCurrentScenario('应用修复版');
  const b=S.bugs.find(b=>b.id===id);if(!b?.scene)return;
  stopStress();S.generation++;S.scene=b.scene;S.fixed=true;S.ioError=false;S.evidence=new Set();S.captures=[];S.saved='';S.regression=id;S.localServer=false;S.peerServer=false;resetFaultState();S.lastFio=null;S.lastNet=null;
  b.status='待回归';b.version='1.1';S.regressionEnvironment=environmentKey(projectEngine().machine);clearLabResults();setFioForm(false);persist();showPage('faults');toast('已切换到模拟修复版本，证据清单已清空。请重新执行回归。');
}
function regressionVerdict(id,pass) {
  const b=S.bugs.find(b=>b.id===id);if(!b||S.regression!==id||!S.fixed||b.scene!==S.scene)return;
  if(S.regressionEnvironment!==environmentKey(projectEngine().machine)){S.evidence.clear();S.captures=[];S.regressionEnvironment=environmentKey(projectEngine().machine);toast('模拟环境已变化，请在当前环境重新收集回归证据。');return;}
  const missing=scenarios[b.scene].regression.filter(([key])=>!S.evidence.has(key));
  if(pass&&missing.length){toast(assessmentActive()?'回归证据不足，暂不能关闭。':'尚不能关闭：还需 '+missing.map(([,label])=>label).join('、'));return;}
  const evidence=S.captures.map(c=>'$ '+c.command+'\n'+c.output).join('\n\n');
  b.regressions=b.regressions||[];b.regressions.push({...evidenceEnvironment(),time:new Date().toLocaleString('zh-CN'),version:'1.1',verdict:pass?'已解决':'未解决（学习者判断）',evidence});
  b.status=pass?'已关闭':'重新打开';S.regression=null;persist();refresh();toast(pass?'已记录回归证据并关闭模拟 Bug。':'已记录未解决结论，Bug 重新打开。');
}
function renderQuestion() {
  S.q=Math.max(0,Math.min(questions.length-1,S.q));const q=currentQuestion();
  $('question-counter').textContent=S.followup!==null?'FOLLOW UP '+(S.followup+1):String(S.q+1).padStart(2,'0')+' / '+questions.length;
  $('question-text').textContent=q[0];$('interview-progress').style.width=(S.q+1)/questions.length*100+'%';
  $('interview-answer').value=S.answers[answerKey()]?.text||'';$('interview-feedback').replaceChildren();
  $('next-question').textContent=S.followup!==null?'返回主问题':S.q===questions.length-1?'回到第一题 ↺':'下一题 →';
  $('followup-question').textContent=S.followup===null?'进入追问模式':'下一道追问';
  $('interview-progress-text').textContent=`已练 ${Object.keys(S.answers).filter(k=>!k.includes(':')).length}/${questions.length}题 · ${questionCategory(S.q)}`;
}
function evaluateAnswer() {
  const text=$('interview-answer').value.trim();if(text.length<8){toast('请用自己的话写至少一句回答。');return;}
  const q=currentQuestion(),graded=scoreAnswer(q,text);S.answers[answerKey()]={text,...graded,at:stamp()};persist();
  $('interview-feedback').innerHTML=`<div class="score-strip"><b>${graded.score}<small>/100</small></b><span>知识点覆盖 + 解释关系 + 方法应用 − 明显误解<br><small>本地规则评分，辅助练习，不代表真实面试评价。</small></span></div><h3>正确内容 / 已识别的方向</h3><p>${graded.correct.map(esc).join('；')||'暂未识别到可确认的知识点。'}</p><h3>遗漏或解释不足</h3><p>${graded.missing.map(esc).join('；')||'主要知识点已覆盖，可进一步练习表达。'}</p><h3>错误理解</h3><p>${graded.errors.map(esc).join('；')||'未命中预设常见误解；这不代表本地规则能发现所有语义错误。'}</p><h3>表达不清 / 可改进点</h3><p>${graded.clarity.map(esc).join('；')||'继续用目的、方法、指标、异常处理组织回答。'}</p><h3>优化后的回答 / 参考表达</h3><p>${esc(q[2])}</p><h3>面试官可能继续追问</h3><p>${esc(q[3]||followupPool()[0][0])}</p><details><summary>查看本题评分细则</summary><ul class="rubric-list">${graded.details.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul><p class="muted">每个知识点：只提名称得部分分，结合含义/因果说明得完整分；再评价步骤与观察方法。每项明确误解扣20分。</p></details>`;
  refresh();
}
function renderReference() { renderKnowledge(); }
// Events are delegated so regenerated scenario/bug cards stay interactive.
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(handleExperienceClick(b))return;
  if(handleAcademyClick(b))return;
  if(handleCoachClick(b))return;
  if(handleV2Click(b))return;
  if(b.dataset.go){showPage(b.dataset.go);return;}
  if(b.dataset.cmd){showPage('terminal');execute(b.dataset.cmd);return;}
  if(b.dataset.startScene){startScenario(b.dataset.startScene);return;}
  if(b.dataset.fix){applyFix(b.dataset.fix);return;}
  if(b.dataset.pass){regressionVerdict(b.dataset.pass,true);return;}
  if(b.dataset.fail){regressionVerdict(b.dataset.fail,false);return;}
  switch(b.dataset.action){
    case 'end-scene':endScenario();break;
    case 'save':execute('save-logs').then(()=>toast('证据已保存在虚拟文件中，可导入 Bug。'));break;
    case 'hint':if(S.freeMode)return;S.hints=Math.min(2,S.hints+1);renderScenarios();break;
    case 'solution':if(S.freeMode)return;S.explanation=!S.explanation;renderScenarios();break;
    case 'diagnose':submitDiagnosis();break;
    case 'prepare-bug':prepareBug();break;
  }
});
$('terminal-form').addEventListener('submit',event=>{event.preventDefault();const cmd=$('command').value;$('command').value='';execute(cmd);});
$('command').addEventListener('keydown',event=>{
  const run=currentPractice();
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
    event.preventDefault();const direction=event.key==='ArrowUp'?-1:1;
    if(run){run.cursor=Math.max(0,Math.min(run.events.length,run.cursor+direction));$('command').value=run.events[run.cursor]?.raw||'';return;}
    S.historyIndex=Math.max(0,Math.min(S.history.length,S.historyIndex+direction));$('command').value=S.history[S.historyIndex]||'';
  }
  if(event.ctrlKey&&event.key.toLowerCase()==='l'){event.preventDefault();$('terminal-output').replaceChildren();}
  if(event.ctrlKey&&event.key.toLowerCase()==='c'){event.preventDefault();if(run){$('command').value='';if(run.machine.load)execute('stop');return;}appendTerminal('^C\n'+terminalOutput('stop',stopStress(),analyseInput('stop')));refresh();}
});
$('clear-terminal').addEventListener('click',()=>$('terminal-output').replaceChildren());
['fio-form','network-form','stress-form'].forEach(id=>{
  $(id).addEventListener('input',updateCommands);$(id).addEventListener('change',updateCommands);
  $(id).addEventListener('submit',async event=>{
    event.preventDefault();const command=id==='fio-form'?fioFormCommand():id==='network-form'?networkFormCommand():stressFormCommand();
    const out=await execute(command);
    if(id==='fio-form'&&!out.includes('err=0')){if(!S.lastFio?.error)$('fio-result').innerHTML='<pre class="light-log">'+esc(out)+'</pre>';}
    if(id==='network-form'&&!out.includes('receiver'))$('net-result').innerHTML='<pre class="light-log">'+esc(out)+'</pre>';
    if(id==='stress-form'&&!S.stress){$('stress-log').textContent=out;toast(out);}
  });
});
$('fio-preset').addEventListener('change',()=>{const p=presets[+$('fio-preset').value];$('fio-bs').value=p[0];$('fio-rw').value=p[1];$('fio-mix').value=p[2];updateCommands();});
$('local-server').addEventListener('click',()=>execute('iperf3 -s -p '+$('server-port').value));
$('peer-toggle').addEventListener('click',()=>execute('sim peer '+(S.peerServer?'stop':'start')+' '+$('server-port').value));
$('stop-stress').addEventListener('click',()=>execute('stop'));
$('bug-form').addEventListener('submit',event=>{
  event.preventDefault();const form=$('bug-form'),data=Object.fromEntries(new FormData(form));
  if(Object.values(data).some(v=>!String(v).trim())){toast('请填写所有缺陷字段，避免提交空白内容。');return;}
  const bug={...data,simulationEnvironment:machineEnvironment(projectEngine().machine),environmentKey:environmentKey(projectEngine().machine),projectId:S.project.id,id:'SIT-'+Date.now().toString(36).toUpperCase(),scene:$('bug-scene').value,status:'待修复',created:new Date().toLocaleString('zh-CN'),regressions:[]};
  S.bugs.push(bug);persist();form.reset();$('bug-scene').value=S.scene||'';renderBugs();toast('模拟 Bug 已提交，现可加载修复版本进行回归。');
});
$('import-evidence').addEventListener('click',()=>{if(!S.saved){toast('请先在场景或终端使用 save-logs 保存证据。');return;}$('bug-form').elements.logs.value=S.saved;toast('已导入已保存的原始命令输出。');});
$('export-bugs').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({project:'SIT LAB（模拟）',bugs:S.bugs},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sit-lab-bugs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('evaluate-answer').addEventListener('click',evaluateAnswer);
$('retry-answer').addEventListener('click',()=>{$('interview-feedback').replaceChildren();$('interview-answer').focus();toast('保留你的草稿，可直接修改后再次提交。');});
$('next-question').addEventListener('click',()=>{if(S.followup!==null)S.followup=null;else nextInterview();persist();renderQuestion();});
$('reference-search').addEventListener('input',renderReference);
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1),false));
// Primary navigation is rendered from the five workflow groups by showPage().
appendTerminal('Kylin Linux Advanced Server V10 / SIT-SERVER-01', 'intro');
initKernelWorkbench();initV2();restoreSession(stored.session);initCoach();initAcademy();initExperience();updateCommands();renderQuestion();renderReference();showPage(location.hash.slice(1)||(assessmentActive()?'assessment':'home'),false);
