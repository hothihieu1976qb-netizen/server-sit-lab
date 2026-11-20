'use strict';

// One execution model; each course/case/project still owns its own machine.
function projectEngine(){
  const context=[S.scene||'',S.fixed,S.netFault].join('|');
  let run=S.project.engine;
  if(!run||run.context!==context){
    const previous=run?.machine,initial={};
    if(S.scene&&!S.fixed)Object.assign(initial,{
      nic:{nicFirmware:false},driver:{nicBlacklisted:true},bootdriver:{hbaCompatible:false},
      link:{speed:100},mount:{mounted:false,mountUUID:'SIM-TEST-99'},full:{diskUsed:100,fileMiB:0},
      noip:{address:''},netpersist:{address:'',savedAddress:''},slowdown:{diskBusy:true,backgroundName:'sim-backup'},
      cpu:{cpuBackground:96,backgroundName:'sim-index --rebuild'},leak:{resident:3.1,leakRate:27.3},service:{configuredPort:'abc'}
    }[S.scene]||{});
    Object.assign(initial,{speed:{speed:100},cable:{speed:0},switch:{pathLimit:100},down:{up:false},ip:{address:''},route:{badRoute:true},retrans:{tcpFault:true},udploss:{udpFault:true}}[S.netFault]||{});
    if(previous){initial.kernel=structuredClone(previous.kernel);initial.driverPackages=structuredClone(previous.driverPackages);initial.envEpoch=previous.envEpoch+1;}
    run=createPracticeRun(initial);run.context=context;S.project.engine=run;
    if(S.scene==='nic')run.machine.previous=[{message:'simnic: enp3s0 registered; link up 1000 Mbps Full Duplex',transport:'kernel'}];
    if(S.scene==='netpersist')run.machine.previous=[{message:'ip: added 192.168.10.10/24 (runtime only)',transport:'system'}];
    if(S.scene==='cpu')appendLabLog(run.machine,'monitor: sim-index busy loop; high CPU');
    if(S.scene==='slowdown')appendLabLog(run.machine,'backup: sim-backup active on /mnt/sit');
    if(S.scene==='driver'&&!S.fixed)appendLabLog(run.machine,'config: simnic blacklisted in /etc/modprobe.d/sit.conf','kernel');
  }
  initializeKernelMachine(run.machine);
  return run;
}
function currentMachine(){return (currentPractice()||projectEngine()).machine;}
function evidenceEnvironment(m=projectEngine().machine){return {environment:machineEnvironment(m),environmentKey:environmentKey(m)};}
function currentEvidence(record){return Boolean(record&&record.environmentKey===environmentKey(projectEngine().machine));}
function currentProjectData(){
  const p=S.project;
  return {...p,reportAt:p.reportEnvironment===environmentKey(projectEngine().machine)?p.reportAt:null,observations:Object.fromEntries(Object.entries(p.observations).filter(([,r])=>currentEvidence(r))),
    fio:p.fio.filter(currentEvidence),network:p.network.filter(currentEvidence),stress:p.stress.filter(currentEvidence),cases:p.cases};
}
function historicalEnvironmentReport(){
  const rows=['fio','network','stress'].flatMap(kind=>S.project[kind].filter(r=>!currentEvidence(r)).map(r=>'- '+kind+' / '+r.at+' / '+(r.environment?.kernel||'旧记录未标注内核')+' / '+(r.error?'记录失败':'已执行，需在当前环境复测')));
  return rows.join('\n')||'暂无其他环境的性能记录。';
}
function syncProjectMachine(){
  const m=projectEngine().machine,r=modelResourceSample(m);
  S.cpu=r.cpu;S.memory=r.used;S.swap=r.swap;S.simTime=m.simSeconds;S.boot=m.boot;S.ioError=m.diskError;
  S.localServer=Boolean(m.localPort);S.peerServer=Boolean(m.peerPort);S.localPort=m.localPort||5201;S.peerPort=m.peerPort||5201;
  S.resourceMessages=m.journal.filter(e=>/^monitor:|^oom:/.test(e.message)).slice(-6).map(e=>e.message);
  if(S.stress&&m.load)Object.assign(S.stress,{elapsed:m.load.elapsed,peakCPU:m.load.peakCPU||r.cpu,peakMemory:m.load.peakMemory||r.used,peakSwap:m.load.peakSwap||r.swap,error:Boolean(m.load.error)});
}
function collectCoreEvidence(result,segment){
  const keys={link:'interface',addr:'address',route:'route','route-lookup':'route',pci:'pci',modules:'module','module-info':'driver',driver:'driver',carrier:'ethtool',block:'block',uuid:'block','mount-state':'mount',space:'space',sockets:'sockets',process:'process','disk-stats':'iostat','service-status':'service',config:'config',fstab:'config','service-config':'config'};
  if(keys[result.kind])note(keys[result.kind]);
  if(result.kind==='units')note('service');
  if(result.kind==='reboot'){
    ['pci','interface','address','route','ethtool','nettest','kernel','current'].forEach(key=>S.evidence.delete(key));
    note('reboot');
  }
  if(result.kind==='ping'&&!result.failed)note('ping');
  if(['top','free','vmstat'].includes(segment.command))note('monitor');
  if(segment.command==='fio'&&segment.positionals.length)note('fioparams');
  if(result.kind==='logs'){
    if(result.previousBoot)note('previous');
    else if(segment.command==='dmesg'){if(S.scene!=='io'||S.ioError||S.fixed)note('kernel');}
    else if(!(['mount','netpersist','service'].includes(S.scene)&&result.kernelOnly)&&(S.scene!=='io'||S.ioError||S.fixed))note('current');
  }
}
function runProjectCore(raw){
  const run=projectEngine(),parsed=analyseInput(raw),before=environmentKey(run.machine);
  const result=simulatePracticeCommand(run,parsed);S.lastCoreResult=result;
  syncProjectMachine();
  if(before!==environmentKey(run.machine)){
    S.evidence.clear();S.captures=[];S.saved='';S.regressionEnvironment=environmentKey(run.machine);
  }
  collectCoreEvidence(result,parsed.segments[0]);
  return result;
}
function coreLogs(previous=false,service=false,kernelOnly=false){
  const m=projectEngine().machine;
  return (previous?m.previous:m.journal).filter(e=>(!kernelOnly||e.transport==='kernel')&&(!service||e.unit===LAB_AGENT)).map(e=>e.message).join('\n')||'-- No entries --';
}
async function coreFio(args){
  if(S.busy.fio)return 'fio: a simulated job is already running';
  const generation=S.generation,project=S.project;
  S.busy.fio=true;refreshButtons();
  await new Promise(resolve=>setTimeout(resolve,250));S.busy.fio=false;refreshButtons();
  if(generation!==S.generation||project!==S.project)return 'fio: environment changed; job cancelled';
  const e=runProjectCore('fio '+args.join(' '));
  if(!e.config)return e.output;
  const r={id:Date.now(),at:stamp(),scene:S.scene,version:S.fixed?'1.1':'1.0',config:e.config,conditions:{diskBusy:e.diskBusy,underLoad:e.underLoad},...e.metrics,error:Boolean(e.failed),reason:e.reason,output:e.output,...evidenceEnvironment()};
  S.lastFio=r;S.fioRuns.push(r);S.project.fio.push(r);
  if(!r.error&&((S.scene==='fio'&&isBaseline(r.config)&&r.config.jobs===1&&r.config.timeBased)||(S.scene!=='fio'&&r.config.target.startsWith('/mnt/sit/'))))note('fiotest');
  practice('fio');renderFioResult();renderFioComparison();return e.output;
}
async function coreNetwork(args,fromB=false){
  const e=runProjectCore((fromB?'sim b ':'')+'iperf3 '+args.join(' ')),o=options(args);
  if(o['-s']){if(!e.failed)note('server');refreshNetwork();return e.output;}
  const t=Number(o['-t']||10),udp=Boolean(o['-u']),rate=e.rate||0;
  const r={id:Date.now(),at:stamp(),scene:S.scene,version:S.fixed?'1.1':'1.0',fromB,ip:o['-c'],port:Number(o['-p']||5201),t,parallel:Number(o['-P']||1),udp,
    throughput:rate,loss:e.loss||0,lost:e.lost||0,total:e.total||0,jitter:e.jitter||0,retrans:e.retries||0,transfer:+(rate*t/8).toFixed(1),direction:e.direction?.replace(' -> ',' → '),local:e.local,
    output:e.output,error:Boolean(e.failed),reason:e.reason,...evidenceEnvironment()};
  S.lastNet=r;S.netRuns.push(r);S.project.network.push(r);
  if(!r.error&&!r.local&&(!S.fixed||rate>=900&&r.retrans<=10&&r.loss===0))note('nettest');
  practice('network');renderNetworkResult();return e.output;
}
function coreStartStress(args,tool='stress'){
  const e=runProjectCore(tool+' '+args.join(' '));if(e.failed)return e.output;
  const m=projectEngine().machine,l=m.load;
  if(!l)return e.output;
  if(S.stressFault==='cpu')l.cpu=32;
  if(S.stressFault==='lowmem'){l.vm=Math.max(1,l.vm);l.memory=Math.max(l.memory,14.8);}
  if(S.stressFault==='oom'){l.vm=Math.max(1,l.vm);l.memory=Math.max(l.memory,20);}
  if(S.stressFault==='slow')m.diskBusy=true;
  if(fault('io')||S.stressFault==='io'){m.diskError=true;l.error=true;recordModelIOError(m);}
  S.stress={...l,runId:Date.now(),ownerLessonId:S.academy.activeLesson||null,ownerAttemptId:courseRecord(S.academy.activeLesson)?.attemptId||null,projectId:S.project.id,memMiB:l.memory*1024,command:tool+' '+args.join(' '),at:stamp(),peakCPU:0,peakMemory:0,peakSwap:0,...evidenceEnvironment(m)};
  projectEngine().activeStress=S.stress;
  if(S.scene==='io')['stop','kernel','current','fiotest','saved'].forEach(key=>S.evidence.delete(key));note('trigger');
  syncProjectMachine();$('stress-log').textContent=e.output;
  clearInterval(stressTimer);stressTimer=setInterval(()=>advanceTime(10),1000);practice('stress');return e.output;
}
function coreStopStress(reason='manual'){
  const m=projectEngine().machine;
  if(!S.stress){if(S.scene==='io'&&m.diskError)note('stop');return 'stress: no active workers';}
  clearInterval(stressTimer);
  const ended=finishModelLoad(m,reason)||m.completedLoads.at(-1),old=S.stress;S.stress=null;delete projectEngine().activeStress;note('stop');
  const record={...old,...ended,courseSeq:S.coach.seq+1,ended:stamp(),scene:S.scene,version:S.fixed?'1.1':'1.0',observed:Boolean(old.observed),error:Boolean(ended?.error||old.error||m.diskError)};
  S.project.stress.push(record);syncProjectMachine();persist();
  const output='stress: workers ended, elapsed='+record.elapsed+'s, reason='+record.reason+(record.error?', errors recorded':'');
  $('stress-log').textContent+='\n'+output;return output;
}
function coreAdvanceTime(seconds){
  const m=projectEngine().machine;advanceMachineTime(m,seconds);syncProjectMachine();
  if(S.stress&&!m.load)coreStopStress(m.completedLoads.at(-1)?.reason||'timeout');
  if(['stress','overview','terminal','project'].includes(S.page))refresh();
}
async function executeUnifiedCommand(raw){
  const parsed=analyseInput(raw),seg=parsed.segments[0],cmd=seg.command,a=seg.positionals;
  if(parsed.issues.length)return null;
  if(cmd==='fio')return coreFio(seg.words.slice(1));
  if(cmd==='iperf3')return coreNetwork(seg.words.slice(1),seg.fromB);
  if(['stress','stress-ng'].includes(cmd))return coreStartStress(seg.words.slice(1),cmd);
  if(cmd==='stop'||cmd==='pkill')return coreStopStress();
  if(cmd==='sim'&&a[0]==='wait'){
    const seconds=Number(a[1]);if(!Number.isInteger(seconds)||seconds<1||seconds>3600)return 'sim wait: expected 1 to 3600 virtual seconds';
    coreAdvanceTime(seconds);return 'Clock advanced by '+seconds+'s';
  }
  if(cmd==='sim'&&a[0]==='peer'&&a[1]==='start')return coreNetwork(['-s','-p',a[2]||'5201'],true);
  if(cmd==='sim'&&!PRACTICE_ACTIONS[a[0]])return null;
  if(['help','history','clear','save-logs','date','hostname','pwd','nproc','du','fdisk','traceroute','route'].includes(cmd))return null;
  if(cmd==='cat'&&['/mnt/sit/low.fio','/mnt/sit/fixed.fio','/mnt/sit/baseline.txt','/tmp/sit-evidence.log'].includes(a[0]))return null;
  if(cmd==='reboot')coreStopStress('reboot');
  if(!PRACTICE_TOOLS.has(cmd))return null;
  const e=runProjectCore(raw);return e.output;
}

let kernelPanelSelection='',kernelPanelContext='';
function initKernelWorkbench(){
  const panel=document.createElement('details');panel.id='kernel-workbench';panel.className='kernel-workbench';
  panel.innerHTML='<summary><span>模拟机 · 内核与驱动</span><span id="kernel-summary"></span></summary><div id="kernel-controls"></div>';
  $('section-tabs').after(panel);
  panel.addEventListener('change',e=>{if(e.target.id==='kernel-profile')kernelPanelSelection=e.target.value;});
  panel.addEventListener('click',async e=>{
    const b=e.target.closest('[data-kernel-action]');if(!b)return;
    if(S.busy.fio||S.busy.network){toast('请等待当前模拟测试完成。');return;}
    const action=b.dataset.kernelAction,id=$('kernel-profile').value;
    const command={select:'sim kernel select '+id,reboot:'reboot',rollback:'sim kernel rollback',nic:'sim driver install simnic '+id,hba:'sim driver install simhba '+id}[action];
    if(command){await execute(command);persist();renderKernelWorkbench();}
  });
}
function renderKernelWorkbench(){
  const host=$('kernel-workbench');if(!host)return;
  host.hidden=assessmentActive()||S.page==='lesson'&&currentGuidedCourse().track==='linux'&&currentGuidedCourse().level==='基础'&&!currentGuidedCourse().workOrder||!['lesson','cases','terminal','hardware','overview','fio','network','stress','faults','project'].includes(S.page);
  if(host.hidden)return;
  const m=currentMachine(),p=currentPractice(),context=p?S.page+':'+(S.experience.guidedId||'')+':'+m.envEpoch:S.project.id;
  initializeKernelMachine(m);
  if(context!==kernelPanelContext){kernelPanelContext=context;kernelPanelSelection=m.kernel.next;}
  const id=kernelPanelSelection||m.kernel.next;
  $('kernel-summary').textContent=kernelRelease(m)+' · 第 '+m.boot+' 次启动'+(m.kernel.next!==m.kernel.running?' · 待启动 '+m.kernel.next:'');
  $('kernel-controls').innerHTML=`<div class="kernel-status-grid"><div><small>正在运行</small><b>${esc(kernelRelease(m))}</b><span>${esc(p?'当前课程 / 案例独立模拟机':S.project.id)}</span></div><div><small>下次启动</small><b>${esc(KERNEL_PROFILES[m.kernel.next].release)}</b><span>选择后需模拟重启生效</span></div><div><small>当前驱动状态</small><b>NIC ${m.nicBound?'已绑定':m.nicLoaded?'已加载 / 未绑定':'未加载'} · HBA ${m.hbaBound?'已绑定':'未绑定'}</b><span>用 lsmod、lspci、日志验证</span></div></div>
    <div class="kernel-actions"><label>教学内核配置<select id="kernel-profile">${Object.entries(KERNEL_PROFILES).map(([key,v])=>'<option value="'+key+'" '+(key===id?'selected':'')+'>'+v.label+'</option>').join('')}</select></label><button data-kernel-action="select">设为下次启动</button><button data-kernel-action="reboot">模拟重启</button><button data-kernel-action="rollback" ${m.kernel.previous?'':'disabled'}>选择上一版本回退</button></div>
    <div class="kernel-actions"><span class="muted">为所选版本准备模块包</span><button data-kernel-action="nic">安装 simnic 包</button><button data-kernel-action="hba">安装 simhba 包</button><span class="muted">${esc(id)} 已安装：${Object.keys(m.driverPackages[id]||{}).join('、')||'无'}</span></div>
    <details class="kernel-guide"><summary>如何练习内核升级与回退</summary><ol><li>先执行 uname -r、modinfo simnic、lspci -nnk，记录旧环境和基线。</li><li>选择目标版本。模块包按内核分别安装；可以先准备匹配包，也可以在独立案例中观察缺包故障。</li><li>模拟重启后检查 uname、lsmod、lspci、ip、lsblk、dmesg。安装包不会自动改变已加载驱动。</li><li>需要时用 modprobe simnic / modprobe simhba 加载，再用 mount /mnt/sit、ping 和测试工具验证。故障固件仍需单独处理。</li><li>回退按钮只选择上一版本，仍需模拟重启。旧结果保留，新环境要重新采集证据。</li></ol><p>这是有范围的 Linux 行为模型，不运行 Linux 内核、系统调用或真实驱动。版本号是虚构教学构建，不代表银河麒麟的官方兼容支持。4.19 配置未启用 io_uring；5.10、6.6 配置启用。其他已实现行为一致，不假设新版更快。</p><p>free、top、vmstat 与 /proc/meminfo 共用内存账本；available 是估计值，used=total−available。进程 CPU 可超过 100%，整机上限为 100%。负载与 OOM 是教学近似，不模拟真实调度器、页表或 OOM 选取算法。iostat 显示最近模拟 I/O 区间；sim wait 推进虚拟时间，不等待真实秒数。</p></details>`;
}
