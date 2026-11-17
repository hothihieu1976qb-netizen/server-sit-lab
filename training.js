'use strict';
// Additional project, learning and shared-state helpers; no runtime dependencies.
function stamp(){return new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}
function networkState(){
  const missing=fault('nic')||fault('driver'),up=S.netFault!=='down',carrier=!missing&&S.netFault!=='cable';
  return {missing,up,carrier,ip:fault('noip')||fault('netpersist')||S.netFault==='ip'?null:'192.168.10.10',route:S.netFault!=='route',speed:fault('link')||S.netFault==='speed'?100:1000,limit:S.netFault==='switch'?100:1000};
}
function storageState(){return {present:!fault('bootdriver'),mounted:!fault('bootdriver')&&!fault('mount'),full:fault('full')};}
function liveEnvironment(){
  const n=networkState(),d=storageState();return environment.map(([name,value])=>{
    if(name==='网卡')value=`SimNIC G1 · ${n.missing?'接口未创建':`enp3s0 ${n.up?'UP':'DOWN'} / ${n.carrier?n.speed+'Mb/s Full':'无载波'}`}`;
    if(name==='IP / 网关')value=`${n.ip?n.ip+'/24':'无IPv4地址'} · ${n.route?'网关192.168.10.1':'异常主机路由经192.168.10.254'}`;
    if(name==='独立测试盘')value=`SimSSD240 · 240GiB · ${!d.present?'当前未识别':d.mounted?'sdb1 ext4 /mnt/sit':'sdb1 ext4 未挂载'}${d.full?' · 空间已满':''}`;
    if(name==='网卡驱动 / 固件')value=`simnic ${S.fixed?'1.1':'1.0'} / ${fault('driver')?'模块未加载':fault('nic')?'固件加载失败、未绑定':'已加载并绑定，simnic-fw-1.0'}`;
    if(name==='存储驱动')value=fault('bootdriver')?'simhba加载失败；HBA未绑定':`simhba ${S.fixed?'1.1':'1.0'} · SimStorage HBA`;
    return [name,value];
  });
}
function renderLiveHardware(){
  const n=networkState(),d=storageState();
  const stats=$('overview-stats').querySelectorAll('.stat p');if(stats.length){stats[1].textContent='可用 '+(16-S.memory).toFixed(1)+'GiB / 模拟';stats[2].textContent=!d.present?'当前未识别 · 名义240GiB':!d.mounted?'sdb1 当前未挂载':d.full?'/mnt/sit · 空间已满':'独立测试盘 · /mnt/sit';}
  $('live-hardware-summary').innerHTML=`<span>系统 <b>麒麟V10 / 4.19.90-sit.sim</b></span><span>CPU <b>${S.cpu.toFixed(1)}%</b></span><span>内存 <b>${S.memory.toFixed(1)}/16GiB</b></span><span>测试盘 <b>${!d.present?'未识别':!d.mounted?'未挂载':d.full?'空间满':'已挂载'}</b></span><span>网络 <b>${n.missing?'接口缺失':!n.up?'DOWN':!n.carrier?'无载波':n.ip?n.speed+'Mb/s':'无IP'}</b></span>`;
}
function dfOutput(showType=true){const d=storageState(),output='Filesystem Type Size Used Avail Use% Mounted on\n/dev/sda2 ext4 119G 18G 101G 16% /\n/dev/sda1 ext4 1G 180M 844M 18% /boot'+(d.mounted?`\n/dev/sdb1 ext4 240G ${d.full?'240G 0G 100%':'12G 228G 5%'} /mnt/sit`:'');return showType?output:output.replace(' Type','').replace(/ ext4/g,'');}
function mountOutput(tree=false){
  const d=storageState();if(tree)return d.mounted?'TARGET SOURCE FSTYPE OPTIONS\n/mnt/sit /dev/sdb1 ext4 rw,relatime':'findmnt: /mnt/sit 当前没有挂载源 [模拟]';
  return '/dev/sda2 on / type ext4 (rw,relatime)\n/dev/sda1 on /boot type ext4 (rw,relatime)'+(d.mounted?'\n/dev/sdb1 on /mnt/sit type ext4 (rw,relatime)':'');
}
function pciOutput(){const n=networkState();return `03:00.0 Ethernet controller [0200]: SimNIC G1 [1abc:1001]\n Kernel driver in use: ${n.missing?'(none)':'simnic'}\n Kernel modules: simnic\n04:00.0 SAS controller [0107]: SimStorage HBA [1abc:2001]\n Kernel driver in use: ${fault('bootdriver')?'(none)':'simhba'}\n Kernel modules: simhba\n00:17.0 SATA controller: SimBoot AHCI [1abc:2000]\n Kernel driver in use: simahci [虚构教学信息]`;}
function ethtoolOutput(args){
  const dev=args.find(a=>!a.startsWith('-')),n=networkState();if(!dev)return '用法 ethtool [-i|-S] enp3s0';if(dev!=='enp3s0'||n.missing)return 'Cannot get device settings: No such device [模拟]';
  if(args.includes('-i')){note('driver');return `driver: simnic\nversion: ${S.fixed?'1.1':'1.0'}\nfirmware-version: simnic-fw-1.0\nbus-info: 0000:03:00.0`;}
  if(args.includes('-S'))return `NIC statistics:\n rx_packets: 72500\n rx_crc_errors: ${S.netFault==='cable'?128:0}\n rx_dropped: ${S.netFault==='udploss'?320:0}\n tx_timeout: ${S.netFault==='retrans'?48:0}`;
  note('ethtool');return `Settings for enp3s0:\n Supported link modes: 10baseT/Full 100baseT/Full 1000baseT/Full\n Advertised link modes: 10baseT/Full 100baseT/Full 1000baseT/Full\n Speed: ${n.carrier?n.speed+'Mb/s':'Unknown!'}\n Duplex: ${n.carrier?'Full':'Unknown!'}\n Auto-negotiation: on\n Link detected: ${n.carrier?'yes':'no'}\n[模拟] Speed是协商速率，Full是全双工，yes代表有载波；还要用ip link检查管理状态。`;
}
function pingOutput(args){
  const target=args.find((v,i)=>!v.startsWith('-')&&!(i>0&&['-c','-i','-W'].includes(args[i-1]))),n=networkState();if(!target)return '用法 ping -c 4 192.168.10.20';
  const count=Number(options(args)['-c']||4);if(!Number.isInteger(count)||count<1||count>10)return 'ping: invalid count (simulated range 1-10)';
  if(n.missing||!n.up)return 'ping: Network is down';if(!n.carrier||!n.ip||(!n.route&&target==='192.168.10.20'))return 'ping: Destination Host Unreachable [模拟链路/地址/路由异常]';
  if(!['192.168.10.10','192.168.10.20','192.168.10.1','127.0.0.1'].includes(target))return `${count} packets transmitted, 0 received, 100% packet loss`;
  note('ping');return `PING ${target}\n`+Array.from({length:count},(_,i)=>`64 bytes from ${target}: icmp_seq=${i+1} ttl=64 time=0.30ms`).join('\n')+`\n${count} packets transmitted, ${count} received, 0% packet loss`;
}
function processOutput(){
  let out='USER PID %CPU %MEM RSS COMMAND\nstudent 601 1.0 0.4 65536 system-monitor\n';
  if(fault('cpu'))out+='student 921 1480 1.0 167772 sim-index --rebuild\n';
  if(fault('leak'))out+=`student 922 4.0 ${(S.memory/16*100).toFixed(1)} ${Math.round((S.memory-2.1)*1048576)} sim-cache\n`;
  if(fault('slowdown'))out+='root 923 25.0 2.0 335544 sim-backup --target=/mnt/sit\n';
  if(S.stress)out+=`student 842 ${S.stress.cpu*100} ${((S.memory-2.1)/16*100).toFixed(1)} ${Math.round((S.memory-2.1)*1048576)} ${S.stress.command}`;
  return out+'\n[模拟] RSS 单位KiB。';
}
function systemctlOutput(args){
  const failed=fault('service')||fault('mount')||fault('nic'),unit=fault('service')?'sit-agent.service':fault('mount')?'mnt-sit.mount':'network-online.target';
  if(args.includes('--failed'))return failed?`UNIT LOAD ACTIVE SUB\n${unit} loaded failed failed\n1 loaded units listed.`:'0 loaded units listed.';
  if(args.includes('list-units'))return 'UNIT LOAD ACTIVE SUB\nNetworkManager.service loaded active running\n'+`sit-agent.service loaded ${fault('service')?'failed failed':'active running'}\n`+(fault('mount')?'mnt-sit.mount loaded failed failed':'mnt-sit.mount loaded active mounted');
  if(args.includes('status')){if(args.some(x=>/sit-agent/.test(x)))return fault('service')?'sit-agent.service - SIT telemetry agent\nActive: failed (Result: exit-code)\nMain PID: 730 (code=exited, status=2/INVALIDARGUMENT)\nsit-agent: invalid port "abc"':'sit-agent.service - SIT telemetry agent\nActive: active (running)\nMain PID: 730 (sit-agent)\nListening on 9090';return failed?unit+' Active: failed':'NetworkManager.service Active: active (running)';}
  return '本模拟支持 systemctl --failed / status sit-agent / list-units。';
}
function logFileCommand(cmd,args){
  const path=args.find(x=>x.startsWith('/'));if(path&&!['/var/log/messages','/tmp/sit-evidence.log'].includes(path))return cmd+': 虚拟日志不存在。';
  const text=path==='/tmp/sit-evidence.log'?S.saved:logs();note('logview');
  if(cmd==='less')return text+'\n[模拟分页快照；真实less按q退出]';
  if(cmd==='tail'){const index=args.indexOf('-n'),count=index>=0?Number(args[index+1]):10;return text.split('\n').slice(-Math.max(1,Math.min(200,count||10))).join('\n');}
  const term=args.find(x=>!x.startsWith('-')&&!x.startsWith('/'));if(!term)return 'grep: 请提供关键词，例如 grep -i error /var/log/messages';
  return text.split('\n').filter(line=>args.includes('-i')?line.toLowerCase().includes(term.toLowerCase()):line.includes(term)).join('\n')||'(无匹配行)';
}
function vmstatOutput(){
  const wa=S.ioError?9:0,used=Math.min(S.cpu,100-wa),swap=S.swap>0?128:0;
  return `procs --------memory-------- --swap-- ---io--- -----cpu-----\n r b swpd free buff cache si so bi bo us sy id wa\n ${fault('cpu')?16:S.stress?Math.min(16,S.stress.cpu):1} ${S.ioError?1:0} ${Math.round(S.swap*1048576)} ${Math.round(Math.max(0,14.5-S.memory)*1048576)} 65536 524288 ${swap} ${swap} ${S.ioError?128:0} ${S.ioError?64:(S.stress?.io||0)*16} ${Math.round(used-2)} 2 ${Math.round(100-used-wa)} ${wa}\n[模拟快照] si/so单位KiB/s；本模型仅在内存压力活跃时显示换页。`;
}
function updateResourceState(){
  S.cpu=fault('cpu')?96:3;let base=fault('leak')?Math.min(15.8,3.1+S.simTime/30*.8):2.1;S.memory=base;S.swap=0;
  if(!S.stress)return;
  const t=S.stress;S.cpu=Math.min(99,S.cpu+t.cpu/16*96);let request=t.memMiB/1024;
  if(S.stressFault==='cpu')S.cpu=99;
  if(S.stressFault==='lowmem')request=Math.max(request,14.8);
  if(S.stressFault==='oom')request=Math.max(request,20);
  if(t.oom)request=0;
  S.cpu=Math.min(99,S.cpu+(t.io||0)*2);
  const total=base+request;S.memory=Math.min(15.7,total);S.swap=Math.min(2,Math.max(0,total-15.5));
  const add=message=>{if(!S.resourceMessages.includes(message))S.resourceMessages.push(message);};
  if(S.cpu>=95)add('[模拟监控] CPU持续高使用率，检查运行队列与业务响应。');
  if(total>15)add('[模拟监控] MemAvailable不足，swap使用增加；检查资源配额。');
  if((total>18||S.stressFault==='oom')&&t.elapsed>=10&&!t.oom){t.oom=true;t.error=true;add('Out of memory: Killed process 843 (stress-vm), simulated OOM killer');S.memory=base;S.swap=0;}
  if(S.swap>0||S.stressFault==='slow')add('[模拟监控] 系统响应变慢：检查换页、CPU队列与I/O等待。');
  if(S.ioError)t.error=true;
  t.peakCPU=Math.max(t.peakCPU,S.cpu);t.peakMemory=Math.max(t.peakMemory,S.memory);t.peakSwap=Math.max(t.peakSwap,S.swap);
}
function advanceTime(seconds){
  S.simTime+=seconds;if(S.stress)S.stress.elapsed+=seconds;updateResourceState();
  if(S.stress&&S.stress.elapsed>=S.stress.duration)stopStress('timeout');
  refreshResources();renderLiveHardware();renderProject();
}
function resetFaultState(){
  S.netFault='none';S.stressFault='normal';S.resourceMessages=[];S.simTime=0;S.memorySample=null;S.swap=0;$('net-fault').value='none';$('stress-fault').value='normal';updateResourceState();
}
function clearLabResults(){
  S.lastFio=null;S.lastNet=null;$('fio-result').innerHTML='<div class="empty-state">环境已切换，请重新运行测试；历史记录仍保留。</div>';$('net-result').innerHTML='<div class="empty-state">环境已切换，请启动服务并重新测试。</div>';
}

const ENV_CHECKS=[['model','服务器型号','dmidecode -t system'],['cpu','CPU型号/架构/核心数','lscpu'],['memory','16GiB内存识别','free -h'],['block','硬盘型号/容量','lsblk -o NAME,SIZE,MODEL'],['pci','网卡及RAID/HBA型号','lspci -nnk'],['bios','BIOS/UEFI版本','dmidecode -t bios'],['os','操作系统版本','cat /etc/os-release'],['kernelVersion','内核版本','uname -a']];
const BASIC_CHECKS=[['kernelVersion','内核/架构','uname -a'],['os','发行版','cat /etc/os-release'],['cpu','CPU识别','lscpu'],['memory','内存识别','free -h'],['block','硬盘识别','lsblk'],['blockfs','文件系统映射','lsblk -f'],['pci','PCI和驱动绑定','lspci -nnk'],['link','网卡接口','ip link'],['address','IP地址','ip addr'],['kernelLog','内核错误检查','dmesg -T'],['journal','本次启动错误检查','journalctl -b -k']];
function trackProjectCommand(command,output){
  const raw=command.replace(/^sudo\s+/,''),n=networkState(),d=storageState();let key=null,ok=true;
  if(/^uname\b/.test(raw))key='kernelVersion';else if(raw==='cat /etc/os-release')key='os';else if(/^lscpu/.test(raw))key='cpu';
  else if(/^free\b/.test(raw)){key='memory';if(S.memorySample!==null&&S.simTime>S.memorySample)note('trend');S.memorySample=S.simTime;}
  else if(/^lsblk/.test(raw)){key=raw.includes('-f')?'blockfs':'block';ok=d.present&&(key!=='blockfs'||d.mounted);}
  else if(/^lspci/.test(raw)){key='pci';ok=!n.missing&&!fault('bootdriver');}
  else if(/^ip .*\blink\b/.test(raw)){key='link';ok=!n.missing&&n.up&&n.carrier;}
  else if(/^ip .*\baddr\b/.test(raw)){key='address';ok=!n.missing&&!!n.ip;}
  else if(/^dmesg/.test(raw)||/^journalctl/.test(raw)&&!raw.includes('-1')&&!raw.includes('-u')){key=raw.startsWith('dmesg')?'kernelLog':'journal';ok=!S.ioError&&!n.missing&&!fault('bootdriver')&&!fault('mount')&&!fault('full')&&!S.resourceMessages.some(x=>x.includes('Out of memory'));}
  else if(/^dmidecode/.test(raw))key=raw.includes('bios')?'bios':'model';
  if(key)S.project.observations[key]={command,output,ok,at:stamp(),context:S.scene?(S.fixed?'修复版:':'故障版:')+scenarios[S.scene].title:'正常环境'};
  if(S.stress&&/^(top|free|vmstat|dmesg|journalctl)\b/.test(raw))S.stress.observed=true;
  persist();
}
function projectBugs(){return S.bugs.filter(b=>b.projectId===S.project.id);}
function projectStages(){
  const p=S.project,checks=list=>list.every(([key])=>p.observations[key]?.ok),observed=list=>list.some(([key])=>p.observations[key]);
  const checklistState=list=>checks(list)?'已完成':list.some(([key])=>p.observations[key]&&!p.observations[key].ok)?'发现异常':observed(list)?'进行中':'未执行';
  const diskModes=['read','write','randread','randwrite','mixed'].every(mode=>p.fio.some(r=>!r.error&&r.config.target.startsWith('/mnt/sit/')&&(mode==='mixed'?['rw','randrw'].includes(r.config.rw):r.config.rw===mode)));
  const baseline=p.fio.some(r=>!r.error&&isBaseline(r.config)&&r.config.jobs===1&&r.config.timeBased&&r.iops>=38000&&r.iops<=45000);
  const f=p.fio.at(-1),net=p.network.filter(r=>!r.local).at(-1),tcp=p.network.filter(r=>!r.local&&!r.udp).at(-1),udp=p.network.filter(r=>!r.local&&r.udp).at(-1),stress=p.stress.at(-1),bugs=projectBugs();
  return [
    ['测试环境确认',checklistState(ENV_CHECKS),'project'],['安装后基础检查',checklistState(BASIC_CHECKS),'terminal'],
    ['磁盘功能与性能',!f?'未执行':f.error?'发现异常':diskModes&&baseline?'已完成':'已执行/待基线验证','fio'],
    ['网络功能与性能',!net?'未执行':net.error||tcp&&(tcp.error||tcp.throughput<900||tcp.retrans>10)||udp&&(udp.error||udp.loss>0)?'发现异常':tcp&&udp?'已完成':'已执行/待TCP与UDP补全','network'],
    ['压力与稳定性',S.stress?'进行中':!stress?'未执行':stress.error?'发现异常':!stress.observed||stress.elapsed<stress.duration?'已执行/需监控并跑满时长':'已完成','stress'],
    ['故障定位',p.cases.length?'已完成':'未执行','faults'],
    ['Bug提交和回归',!bugs.length?'未执行':bugs.every(b=>b.status==='已关闭'&&b.regressions?.some(r=>r.verdict==='已解决'))?'已完成':'进行中/有未关闭缺陷','bugs'],
    ['测试报告',p.reportAt?'已生成':'未生成','project']
  ];
}
function renderProject(){
  if(assessmentActive()){$('project-board').innerHTML='<div class="panel"><h2>当前工程用于独立考核</h2><p class="muted">任务、输出理解和交卷统一在独立考核入口。生成的报告按本轮实际记录保存。</p><div class="inline-actions"><button data-go="assessment">返回考核任务书</button><button data-action="generate-report">记录本轮报告</button><button data-go="bugs">处理Bug与回归</button></div></div>';return;}
  const p=S.project,stages=projectStages(),done=stages.slice(0,7).filter(s=>s[1]==='已完成').length;
  $('overview-project-progress').textContent=`已完成 ${done}/7 项执行阶段 · 报告${p.reportAt?'已生成':'待生成'} · 当前工程师：student`;
  const rows=list=>list.map(([key,name,command])=>{const o=p.observations[key];return `<div class="project-check"><span class="${o?(o.ok?'check-ok':'check-fail'):''}">${o?(o.ok?'✓':'!'):'○'}</span><div><b>${name}</b><small>${o?esc(o.at+' · '+o.context+' · '+(o.ok?'符合检查预期':'存在异常，需复核')):'尚未采集'}</small></div><button data-cmd="${command}">${command}</button></div>`;}).join('');
  $('project-board').innerHTML=`<div class="panel project-intro"><span class="tag">END-TO-END SIT PROJECT</span><h2>银河麒麟 V10 服务器兼容性与稳定性测试项目</h2><p class="muted">身份：服务器SIT测试工程师 · 工程号 ${esc(p.id)} · 开始于 ${esc(p.started)}<br>系统已安装。亲自确认环境、执行测试、定位故障、跟进回归，最后基于实际记录生成报告。</p><div class="info-box">项目基线：测试盘4K随机读 / libaio / iodepth16 / numjobs1 / direct1 / 1G / 60s time_based，38,000–45,000 IOPS；双机千兆TCP约≥900Mbps、Retr≤10；压力须跑满设定时长、实际监控、无I/O/OOM错误。数据仅教学，不替代真实项目标准。</div><div class="project-meter"><i style="width:${done/7*100}%"></i></div></div><div class="stage-grid">${stages.map(([name,state,go],i)=>`<button class="stage-card" data-go="${go}"><small>PHASE ${String(i+1).padStart(2,'0')}</small><h3>${name}</h3><span class="${state==='已完成'?'check-ok':state==='发现异常'?'check-fail':'muted'}">${state}</span></button>`).join('')}</div><div class="two-col spaced"><div class="panel"><h2>阶段1 · 环境确认</h2>${rows(ENV_CHECKS)}</div><div class="panel"><h2>阶段2 · 安装后基础检查</h2>${rows(BASIC_CHECKS)}</div></div><div class="panel spaced"><div class="panel-title"><h2>阶段8 · 依据操作记录生成报告</h2><span class="tag">EVIDENCE BASED</span></div><p class="muted">fio ${p.fio.length}次 · 网络 ${p.network.length}次 · 已结束压力 ${p.stress.length}次 · 排查结论 ${p.cases.length}份 · 本项目Bug ${projectBugs().length}个。未执行项会明确列出，故障版与修复版记录都保留。</p><div class="inline-actions"><button class="primary" data-action="generate-report">生成/更新测试报告</button><button data-action="download-report">导出Markdown报告</button><button data-action="download-project">导出项目记录JSON</button></div><pre id="report-preview" class="light-log report-preview">${S.report?esc(S.report):'尚未生成报告。可以先生成一次，查看哪些项目还缺少证据。'}</pre></div>`;
}
function generateReport(){
  S.project.reportRevision=(S.project.reportRevision||0)+1;
  const p=S.project,stages=projectStages(),bugs=projectBugs(),complete=stages.slice(0,7).every(s=>s[1]==='已完成'),issues=stages.some(s=>s[1]==='发现异常')||bugs.some(b=>b.status!=='已关闭');
  const conclusion=complete?'在本项目已声明的模拟范围和基线内完成验证；仅限教学，不代表真实硬件认证。':issues?'存在异常或未关闭缺陷，当前不能给出全部通过结论。':'执行范围尚不完整，需补足未执行或待验证项目，当前不能给出全部通过结论。';
  const rows=stages.map(([name,state],i)=>`| ${i+1} | ${name} | ${workVerdict(i===7?'已生成':state,i)} / ${i===7?'本次生成':state} |`).join('\n');
  const env=ENV_CHECKS.map(([key,label])=>{const o=p.observations[key];return `### ${label}\n${o?'采集时间：'+o.at+' / '+o.context+' / '+(o.ok?'符合':'异常')+'\n命令：`'+o.command+'`\n```text\n'+o.output+'\n```':'未采集，需实际执行确认。'}`;}).join('\n\n');
  const f=p.fio.map((r,i)=>r.error?`${i+1}. ${r.at} / ${r.scene||'正常环境'} / ${r.version} / 失败：${r.output}`:`${i+1}. ${r.at} / ${r.scene||'正常环境'} / v${r.version}\n   参数：${JSON.stringify(r.config)}\n   IOPS=${r.iops}，BW=${r.bw}MiB/s，slat/clat/lat=${r.slat}/${r.clat}/${r.lat}ms，P50/P95/P99=${r.p50}/${r.p95}/${r.p99}ms，模拟运行${r.elapsed.toFixed(2)}s`).join('\n');
  const net=p.network.map((r,i)=>`${i+1}. ${r.at} / ${r.scene||'正常环境'} / ${r.error?'失败：'+r.output:`v${r.version} ${r.udp?'UDP':'TCP'} ${r.direction} port=${r.port} t=${r.t}s P=${r.parallel}：${r.throughput}Mbps，Retr=${r.retrans}，Lost=${r.lost} (${r.loss}%)，Jitter=${r.jitter}ms，传输=${r.transfer}MBytes${r.local?'（本机回环，不用于物理链路结论）':''}`}`).join('\n');
  const stress=p.stress.map((r,i)=>`${i+1}. ${r.at} / ${r.scene||'正常环境'} / v${r.version}\n   ${r.command}\n   完成${r.elapsed}/${r.duration}s，结束方式=${r.reason}，监控=${r.observed?'有':'无'}，峰值CPU=${r.peakCPU.toFixed(1)}%，内存=${r.peakMemory.toFixed(1)}GiB，swap=${r.peakSwap.toFixed(1)}GiB，结果=${r.error?'记录异常':'未记录错误'}`).join('\n');
  const cases=p.cases.map(c=>`- ${c.at} ${c.title} (${c.free?'自由排查':'引导排查'})\n  证据分析：${c.analysis}\n  处理与验证建议：${c.advice}\n  执行命令：${c.commands.join('；')}`).join('\n');
  const bugText=bugs.map(b=>`### ${b.id} ${b.title}\n状态：${b.status} / 回归版本：${b.version||'未应用'}\n环境：${b.environment}\n步骤：${b.steps}\n预期：${b.expected}\n实际：${b.actual}\n频率：${b.frequency}\n结论：${b.conclusion}\n日志：\n\`\`\`text\n${b.logs}\n\`\`\`\n回归：${b.regressions?.length?b.regressions.map(r=>r.time+' '+r.version+' '+r.verdict+'\n'+r.evidence).join('\n'):'尚未执行'}`).join('\n\n');
  p.reportAt=stamp();S.report=`# 银河麒麟V10服务器兼容性与稳定性测试报告（纯浏览器模拟）\n\n工程号：${p.id}\n生成时间：${p.reportAt} / Asia/Shanghai\n角色：student / 服务器SIT测试工程师（模拟）\n\n## 1. 测试范围与通过标准\n固定SimRack R200 / 麒麟V10组合的识别、驱动、文件I/O、双机网络、CPU/内存压力、故障、缺陷与回归。所有硬件和数据虚构，不包含真实Linux安装、真实硬件认证或真实长稳验证。\n性能基线：4K randread/libaio/iodepth16/numjobs1/direct1/size1G/runtime60/time_based，38000–45000IOPS；千兆双机吞吐≥900Mbps且Retr≤10；压力需监控且跑满设定时长，无I/O/OOM错误。\n\n## 2. 测试环境（实际采集证据）\n${env}\n\n## 3. 测试项目与执行结果\n| 阶段 | 项目 | 结果 |\n|---|---|---|\n${rows}\n\n### 专项用例结果\n| 用例 | 状态 | 证据 |\n|---|---|---|\n${detailedResultRows().map(r=>'| '+r[0]+' | '+r[1]+' | '+r[2].replace(/\n/g,' ; ').replace(/\|/g,'/')+' |').join('\n')}\n\n## 4. 性能数据与参数\n### fio\n${f||'未执行'}\n### iperf3\n${net||'未执行'}\n### stress\n${stress||'未完成压力任务'}${S.stress?'\n当前还有运行中的压力任务，尚未形成结束记录。':''}\n\n## 5. 发现的问题与排查结论\n${cases||'尚未完成故障定位；不能据此声称未发现问题。'}\n\n## 6. Bug记录与回归结果\n${bugText||'尚无本项目Bug记录，不能据此声称缺陷全部修复。'}\n\n## 7. 最终测试结论\n${conclusion}\n未完成项：${stages.slice(0,7).filter(s=>s[1]!=='已完成').map(s=>s[0]+'（'+s[1]+'）').join('、')||'本模拟声明范围内无未完成项'}\n\n报告仅反映生成时已保存的模拟操作；后续新操作请重新生成报告。\n`;
  persist();renderProject();return S.report;
}
function downloadText(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderFioComparison(){
  const list=S.project.fio.filter(r=>!r.error),selected=S.selectedFio.map(id=>list.find(r=>r.id===id)).filter(Boolean);
  $('fio-comparison').innerHTML=`<p class="muted">选择两组实际完成的结果；显示参数差异，避免跨条件直接判高低。</p><div class="compare-picks">${list.slice(-10).map(r=>`<label class="checkbox"><input type="checkbox" data-compare="${r.id}" ${S.selectedFio.includes(r.id)?'checked':''}>${esc(r.at)} ${esc(r.config.bs)}/${esc(r.config.rw)} Q${r.config.depth}×${r.config.jobs} · ${r.iops} IOPS</label>`).join('')||'<p class="muted">先运行一组测试。</p>'}</div>${selected.length===2?comparisonTable(selected):'<div class="muted">已选 '+selected.length+'/2 组</div>'}`;
}
function comparisonTable([a,b]){
  const fields=[['target','目标'],['bs','块大小'],['rw','模式'],['depth','iodepth'],['jobs','numjobs'],['engine','ioengine'],['direct','direct'],['size','size'],['runtime','runtime'],['timeBased','time_based']];
  return '<table><thead><tr><th>参数/结果</th><th>A</th><th>B</th></tr></thead><tbody>'+fields.map(([k,l])=>`<tr class="${a.config[k]!==b.config[k]?'different':''}"><td>${l}</td><td>${esc(a.config[k])}</td><td>${esc(b.config[k])}</td></tr>`).join('')+[['iops','IOPS'],['bw','BW MiB/s'],['lat','lat ms'],['p99','P99 ms']].map(([k,l])=>`<tr><td>${l}</td><td>${a[k]}</td><td>${b[k]}</td></tr>`).join('')+`</tbody></table><p class="muted">IOPS变化 ${((b.iops/a.iops-1)*100).toFixed(1)}%，P99变化 ${((b.p99/a.p99-1)*100).toFixed(1)}%。高亮行为参数差异；还要对照故障版本与背景负载。A=${esc(a.scene||'正常环境')} v${a.version}，B=${esc(b.scene||'正常环境')} v${b.version}。</p>`;
}

function freeDiagnosisMatches(id,text){
  const groups={nic:[['固件','firmware'],['加载','失败','probe']],link:[['网线','线对','线缆'],['百兆','100','不连续']],io:[['控制器','simhba','驱动'],['超时','timeout','reset']],fio:[['系统盘','/root'],['参数','sync','基线']],mount:[['uuid','fstab'],['不一致','错误','不匹配']],full:[['空间','容量'],['满','不足','100%']],noip:[['ip','地址'],['没有','未配置','缺失']],driver:[['模块','simnic','驱动'],['未加载','黑名单','blacklist']],netpersist:[['临时','持久'],['未保存','丢失','配置']],slowdown:[['备份','backup'],['后台','争用','占用']],cpu:[['sim-index','忙循环'],['cpu','占用']],leak:[['rss','available','内存'],['增长','下降','泄漏']],bootdriver:[['内核','vermagic','版本'],['匹配','加载失败','不一致']],service:[['端口','port'],['abc','配置','错误']]};
  const lower=text.toLowerCase();return groups[id].every(terms=>terms.some(t=>lower.includes(t)));
}
function questionCategory(index){return index<12?['SIT 项目','SIT 项目','Linux 基础','fio','fio','fio','iperf3','iperf3','stress','stress','Linux 基础','SIT 项目'][index]:questions[index][4];}
function followupPool(){if(S.operationFollowups)return S.operationFollowups;return FOLLOWUP_BY_CATEGORY[questionCategory(S.q)]||FOLLOWUPS;}
function currentQuestion(){return S.followup===null?questions[S.q]:followupPool()[S.followup];}
function answerKey(){return S.followup===null?String(S.q):S.q+(S.operationFollowups?':operation:'+S.operationCommand:':followup')+':'+S.followup;}
function nextInterview(){const category=$('interview-category').value;for(let count=0;count<questions.length;count++){S.q=(S.q+1)%questions.length;if(category==='全部'||questionCategory(S.q)===category)break;}}
function scoreAnswer(q,text){
  const lower=text.toLowerCase(),points=q[1],correct=[],missing=[],details=[];let concept=0;
  const explanation=/(表示|是指|用于|查看|检查|每秒|每次|单次|单位时间|未完成|因为|所以|导致|影响|不等于|不能|需要|对比|确认|记录|观察|通过|反映|衡量|越|增加|减少|响应|耗时)/;
  for(const [name,words] of points){
    const hits=words.filter(word=>lower.includes(word.toLowerCase()));let earned=0;
    if(hits.length){
      const pos=lower.indexOf(hits[0].toLowerCase()),context=lower.slice(Math.max(0,pos-22),pos+hits[0].length+45),explained=explanation.test(context)&&context.replace(/[^\u4e00-\u9fff]/g,'').length>=9;
      earned=explained?1:.4;correct.push(name+(explained?'（有解释）':'（仅提及）'));if(!explained)missing.push(name+'：补充含义、观察方法或因果关系');
    }else missing.push(name);
    concept+=earned;details.push(name+'：'+Math.round(earned*70/points.length)+'/'+(70/points.length).toFixed(1)+'分（概念权重）');
  }
  const misconceptionRules=[
    [/iops\s*(就是|等于|表示)\s*(延迟|毫秒|时延)/i,'IOPS 是次数/秒，不是延迟。'],
    [/(iodepth|队列深度).{0,8}(越大越好|一定越高越好)/i,'队列深度增加可能提高吞吐，也可能增加排队延迟。'],
    [/(lsmod.{0,10}(有|出现).{0,10}(就证明|一定).{0,8}(绑定|可用))/i,'模块加载不等于绑定或初始化成功。'],
    [/(ping.{0,5}通.{0,5}(就证明|代表).{0,5}(性能正常|吞吐正常))/i,'连通与吞吐需要分别验证。'],
    [/(p99.{0,6}(就是|等于).{0,5}(最大|最慢))/i,'P99 是百分位，不是最大延迟。'],
    [/(有序可靠的udp|udp.{0,5}(保证可靠|保证不丢包|保证有序))/i,'UDP 不保证可靠交付与顺序。'],
    [/(直接|马上|立即)(格式化|重建raid)/i,'未确认范围、授权和证据时不应直接做破坏性操作。'],
    [/(100mb\/s.{0,8}(代表|就是|等于).{0,5}千兆)/i,'100Mb/s 是百兆，千兆是1000Mb/s。']
  ];
  const errors=[];for(const [pattern,message] of misconceptionRules){const m=lower.match(pattern);if(m){const before=lower.slice(Math.max(0,m.index-5),m.index);if(!/(不|不能|不要|并非|避免)/.test(before))errors.push(message);}}
  const clauses=text.split(/[。；;\n]/).filter(t=>t.trim().length>7),relations=Math.min(20,clauses.filter(t=>explanation.test(t)).length*5);
  const method=/(先|再|然后|最后|步骤|命令|基线|例如|比如|异常|监控|日志|回归)/.test(text)?10:0;
  const coverage=concept/points.length,score=Math.max(0,Math.min(100,Math.round(coverage*70+relations*Math.min(1,coverage*1.5)+method*Math.min(1,coverage*2)-errors.length*20)));
  details.push('解释关系：'+relations+'/20（按有效知识点覆盖折算）','方法/应用：'+method+'/10（按覆盖折算）','常见误解：扣'+errors.length*20+'分');
  const clarity=[];if(text.length<35)clarity.push('回答偏短，补充检查目的、方法和判断依据。');if(!/(先|再|然后|最后|步骤)/.test(text))clarity.push('用先后顺序说明操作，不只罗列术语。');if(!/(因为|所以|导致|观察|确认|表示|是指|用于)/.test(text))clarity.push('补充参数、输出与结论之间的关系。');
  return {score,correct,missing,errors,details,clarity};
}
function renderKnowledge(){
  const query=$('reference-search').value.trim().toLowerCase(),rows=COMMAND_KB.filter(r=>r.join(' ').toLowerCase().includes(query));
  $('reference-list').innerHTML=rows.map(([category,example,purpose,usage,focus,output,followup])=>`<details class="knowledge-card"><summary><span class="tag">${category}</span><code>${esc(example)}</code><span>${purpose}</span></summary><div class="knowledge-body"><div class="two-col"><div><h3>为什么执行？</h3><p>${purpose}。${usage}。</p><h3>输出重点</h3><p>${focus}</p><h3>面试追问</h3><p>${followup}</p></div><div><h3>模拟输出示例（正常场景）</h3><pre class="light-log">${esc(output)}</pre><button data-cmd="${esc(example)}">执行并查看当前环境的实际模拟输出 ↗</button></div></div></div></details>`).join('')||'<p class="muted">未找到匹配知识，试试参数或命令名。</p>';
}
function renderLearning(){
  $('learning-center').innerHTML=`<div class="panel"><span class="tag">LEARNING CENTER</span><h2>知道为什么执行，才知道如何判断。</h2><p class="muted">先阅读目的与指标，再到实验室亲自验证。下列输出是教学样例；点击执行后，终端会反映当前故障状态。</p><div class="lesson-tabs">${LESSONS.map((l,i)=>`<button data-lesson="${i}" class="${i===0?'primary':''}">${l[0]}</button>`).join('')}</div><div id="lesson-content"></div></div><div class="panel spaced"><h2>术语速查</h2><div class="term-grid">${TERMS.map(([term,meaning])=>`<div><b>${term}</b><p>${meaning}</p></div>`).join('')}</div></div>`;renderLesson(0);$('learning-center').insertAdjacentHTML('afterbegin','<div class="panel spaced"><h2>先按成长路线学，再按模块查</h2><p class="muted">时间不固定也可以按任务推进。成长路线提供原理、实操、作业与复核；这里保留各工具速查，技术复盘继续可用。</p><button class="primary" data-go="academy">进入长期成长路线 →</button></div>');
}
function renderLesson(index){
  const [category,title,concept,parameters,command,output,usage,caseText,question]=LESSONS[index];
  $('lesson-content').innerHTML=`<div class="lesson-head"><span>${category}</span><h2>${title}</h2></div><div class="two-col"><div><h3>基础概念</h3><p>${concept}</p><h3>参数解释</h3><p>${parameters}</p><h3>使用场景</h3><p>${usage}</p></div><div><h3>命令示例</h3><div class="code-preview">${esc(command)}</div><pre class="light-log">${esc(output)}</pre><button data-cmd="${esc(command)}">在当前环境中练习</button></div></div><div class="info-box spaced"><b>故障案例</b><br>${caseText}</div><div class="inline-actions"><span class="muted">面试问题：${question}</span><button data-interview-category="${category}">练习本模块面试题 →</button></div>`;
  document.querySelectorAll('[data-lesson]').forEach(b=>b.classList.toggle('primary',+b.dataset.lesson===index));
}
function handleV2Click(button){
  if(button.dataset.lesson!==undefined){renderLesson(+button.dataset.lesson);return true;}
  if(button.dataset.interviewCategory){$('interview-category').value=button.dataset.interviewCategory;S.followup=null;S.q=questions.findIndex((_,i)=>questionCategory(i)===button.dataset.interviewCategory);renderQuestion();showPage('interview');return true;}
  if(button.dataset.addCompare){toggleComparison(Number(button.dataset.addCompare));return true;}
  if(button.dataset.action==='generate-report'){generateReport();toast('报告已按实际操作记录生成。');return true;}
  if(button.dataset.action==='download-report'){downloadText('服务器SIT模拟测试报告.md',generateReport(),'text/markdown;charset=utf-8');return true;}
  if(button.dataset.action==='download-project'){downloadText('sit-project-records.json',JSON.stringify({project:S.project,bugs:projectBugs()},null,2),'application/json');return true;}
  return false;
}
function toggleComparison(id){if(S.selectedFio.includes(id))S.selectedFio=S.selectedFio.filter(v=>v!==id);else S.selectedFio=[...S.selectedFio.slice(-1),id];renderFioComparison();}
function initV2(){
  $('scene-select').innerHTML=Object.entries(scenarios).map(([id,c])=>`<option value="${id}">${c.n} · ${c.title}</option>`).join('');
  $('bug-scene').innerHTML='<option value="">一般缺陷（无自动修复包）</option>'+Object.entries(scenarios).map(([id,c])=>`<option value="${id}">${c.title}</option>`).join('');
  $('load-scene').addEventListener('click',()=>startScenario($('scene-select').value));
  $('random-scene').addEventListener('click',()=>{const ids=Object.keys(scenarios);startScenario(ids[Math.floor(Math.random()*ids.length)]);});
  $('free-mode').addEventListener('change',()=>{S.freeMode=$('free-mode').checked;renderScenarios();});
  $('net-fault').addEventListener('change',()=>{if(S.scene){$('net-fault').value=S.netFault;toast('先退出当前案例，再切换自由故障。');return;}S.netFault=$('net-fault').value;S.generation++;clearLabResults();refresh();toast('已切换网络练习状态，使用ip/ethtool/日志检查。');});
  $('net-client').addEventListener('change',()=>{$('net-ip').value=$('net-client').value==='B'?'192.168.10.10':'192.168.10.20';updateCommands();});
  $('stress-fault').addEventListener('change',()=>{if(S.scene){$('stress-fault').value=S.stressFault;toast('先退出当前案例，再切换自由故障。');return;}S.stressFault=$('stress-fault').value;S.resourceMessages=[];if(!fault('io'))S.ioError=false;updateResourceState();refresh();});
  $('interview-category').innerHTML=['全部','Linux 基础','fio','iperf3','stress','SIT 项目'].map(v=>'<option>'+v+'</option>').join('');
  $('interview-category').addEventListener('change',()=>{S.followup=null;S.operationFollowups=null;const category=$('interview-category').value;if(category!=='全部')S.q=questions.findIndex((_,i)=>questionCategory(i)===category);renderQuestion();});
  $('followup-question').addEventListener('click',()=>{S.followup=S.followup===null?0:(S.followup+1)%followupPool().length;renderQuestion();});
  document.addEventListener('change',event=>{if(event.target.dataset.compare){toggleComparison(Number(event.target.dataset.compare));}});
  const descriptions={
    'fio-bs':'每次请求的数据块大小，影响操作率与数据量。','fio-size':'每个作业的数据集大小；不是块大小，也不是内存大小。',
    'fio-runtime':'模拟运行时间上限（秒）；time_based决定是否持续循环。','fio-depth':'每个作业期望的未完成I/O请求数，sync引擎有效值通常为1。',
    'fio-direct':'1绕过OS页缓存；不代表绕过硬盘内部缓存。','fio-engine':'libaio为异步模型，sync为同步模型。','fio-mix':'仅rw/randrw生效，读比例0–100，其余为写。','fio-rw':'read/write顺序；randread/randwrite随机；rw/randrw混合；trim只解释。'
  };
  Object.entries(descriptions).forEach(([id,text])=>{const small=document.createElement('small');small.textContent=text;$(id).after(small);});
  renderLearning();renderFioComparison();
}
