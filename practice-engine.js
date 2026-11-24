'use strict';

// Guided lessons and cases use the same commands, machine and evidence format.
const PRACTICE_COMMANDS = {
  '环境':['hostnamectl','uname -a','cat /etc/os-release','dmidecode -t system','lscpu','lspci -nnk','lsmod','modinfo simhba','whoami','id'],
  '存储':['lsblk -f','blkid','findmnt /mnt/sit','df -hT','df -i','mount /mnt/sit','ls -ld /mnt/sit','touch /mnt/sit/permission-check','smartctl -a /dev/sdb','iostat -x 1','fio --help'],
  '网络':['ip -br link','ip -br addr','ip route','ip route get 192.168.10.20','ip neigh','ethtool enp3s0','ping -c 2 192.168.10.20','ss -lnt','iperf3 --help'],
  '资源':['free -h','top','ps aux','vmstat 1','stress --help','stress-ng --help','stop','pkill stress'],
  '日志和操作':['dmesg -T','journalctl -b -k','journalctl -u sit-agent -b','systemctl --failed','systemctl status sit-agent','reboot','sim help','history','clear','help']
};
const PRACTICE_TOOLS = new Set(Object.values(PRACTICE_COMMANDS).flat().map(example=>example.split(' ')[0]));
['dmidecode','modprobe','umount','uptime','tail','less','grep','curl','rpm','dnf','usermod','getent','install','date','pwd','cd','find','head','wc','chmod','command','printenv','export','jq','/usr/bin/jq',HOST_REPORT_SCRIPT].forEach(name=>PRACTICE_TOOLS.add(name));
const PRACTICE_ACTIONS = {
  'session':['在本课打开一个指定账号的新模拟会话，载入当时的组信息。','student、reportbot 或 guest；仅适用于账号课程。','sim session reportbot'],
  'kernel':['选择启动内核；当前运行内核直到 reboot 才会改变。','list 查看；select 4.19/5.10/6.6 设下次启动；rollback 选上一个版本。','sim kernel list'],
  'driver':['为指定教学内核安装模拟模块包，不改变运行驱动。','install 模块名 版本；再 modprobe 或 reboot 验证。','sim driver install simnic 5.10'],
  'save-ip':['保存下次启动使用的 IPv4 地址。','IPv4/前缀或 none；只改变启动配置。','sim save-ip 192.168.10.10/24'],
  'set-fstab':['保存测试盘的启动挂载配置。','UUID=SIM-TEST-01 对应本机测试卷；只写模拟 fstab。','sim set-fstab UUID=SIM-TEST-01'],
  'link':['设置模拟链路协商条件。','0 无载波；100 和 1000 的单位是 Mb/s。','sim link 1000'],
  'peer':['查看或停止对端监听。','ss 查看 B 的监听；stop 停止 B 的模拟 iperf3。','sim peer ss'],
  'wait':['推进虚拟时间，用于观察同轮负载。','单位是秒，压力模型按模拟时间产生状态。','sim wait 10'],
  'disk-busy':['设置后台磁盘争用。','on 开始；off 停止。','sim disk-busy on'],
  'io-error':['设置虚拟块设备的 I/O 错误条件。','on 注入；off 取消。写入或读取时才触发相关错误日志。','sim io-error on'],
  'space':['设置测试卷模拟基础占用率。','0–100，按百分比填写。','sim space 12'],
  'nic-fw':['改变网卡模拟固件包，下次启动才应用。','on 安装；off 移除。','sim nic-fw on'],
  'hba-driver':['改变模拟 HBA 模块包的内核匹配条件，下次启动才应用。','match 匹配；mismatch 不匹配。','sim hba-driver match'],
  'service-port':['写入实验服务的端口配置。','1–65535；服务重启才应用。','sim service-port 9090'],
  'app-port':['修改本课虚拟 /etc/status-app.env 的 APP_PORT。','1–65535；保存后还需 systemctl restart status-app。辅助动作仅适用于配置故障课。','sim app-port 8080'],
  'probe-service':['模拟本机访问实验服务。','目标端口；与本机监听值核对。','sim probe-service 9090'],
  'access':['模拟目标目录的 sitqa 组权限变更。','rw 允许创建；r 仅查看。','sim access rw'],
  'fs-mode':['切换模拟测试卷的运行挂载模式。','rw 可写；ro 只读。恢复代表已在隔离实验中完成安全处置。','sim fs-mode rw'],
  'inode-usage':['调整预置的模拟 inode 占用。','0–1000 个，不是容量百分比。','sim inode-usage 950'],
  'replace-disk':['在隔离环境装入预制好的替代盘镜像。','sdb 是这个模型唯一测试盘。','sim replace-disk sdb'],
  'host-route':['改变到 B 的精确路由条目。','clear 移除 /32；wrong 加入错误下一跳。','sim host-route clear'],
  'link-errors':['切换链路错误模拟。','on 注入；off 停止注入，不清空累计值。','sim link-errors off'],
  'restart-worker':['模拟重启后台进程并释放其内存。','已有日志会保留。','sim restart-worker'],
  'leak':['控制模拟后台进程的内存增长。','slow 为每虚拟秒 20 MiB；off 停止继续增长。','sim leak off'],
  'cpu-background':['控制后台负载的整机 CPU 占用。','0–99，单位 %。','sim cpu-background 3']
};

function appendLabLog(machine,message,transport='system',unit){
  machine.journal.push({message,transport,unit});
  if(machine.journal.length>180)machine.journal.shift();
}

function createPracticeRun(initial){
  const machine={...LAB_NETWORK,...LAB_SYSTEM,...HOST_DEFAULTS,...initial,boot:1,revision:0,localPort:0,neighbor:'',previous:[],journal:[],load:null,fioOrdinal:0,loadOrdinal:0};
  bootLabDrivers(machine);
  machine.mounted=machine.mounted&&labDiskVisible(machine);
  startLabNetworkBoot(machine);
  appendLabLog(machine,machine.mounted?'systemd: Mounted /mnt/sit from /dev/sdb1':machine.mountUUID!==LAB_DISK_UUID?'systemd: /mnt/sit: UUID='+machine.mountUUID+' not found':'systemd: /mnt/sit not mounted');
  if(machine.readOnly)appendLabLog(machine,'EXT4-fs (sdb1): remounting filesystem read-only','kernel');
  startLabService(machine);
  if(initial.workload==='status-web'){
    machine.web=createWebWorkload();
    if(initial.initialRelease){
      machine.web.current=initial.initialRelease;
      if(initial.appConfigFault){
        machine.web.configPort='eight-thousand';
        machine.previous.push({message:'status-app: failed to open /var/lib/status-app/cache: Permission denied; exit=13',unit:WEB_UNIT,transport:'system'});
      }
      logWebAppStart(machine);
    }
  }
  if(initial.workload==='host-ops')machine.ops=createHostOps();
  if(initial.fileTraining)initializeFileLab(machine,initial.fileTraining);
  if(initial.accountTraining)initializeAccountLab(machine,initial.accountTraining);
  if(initial.packageTraining)initializePackageLab(machine,initial.packageTraining);
  if(initial.scheduleTraining)initializeScheduleLab(machine,initial.scheduleTraining);
  return {machine,events:[],sequence:0};
}

function rebootPracticeMachine(machine){
  finishModelLoad(machine,'reboot');
  machine.previous=machine.journal;
  machine.journal=[];
  machine.boot++;
  machine.localPort=0;
  machine.neighbor='';
  machine.up=true;
  machine.load=null;
  machine.leakMiB=0;
  machine.simSeconds=0;
  machine.idleSeconds=0;
  machine.rxErrors=0;
  if(machine.kernel.next!==machine.kernel.running){machine.kernel.previous=machine.kernel.running;machine.kernel.running=machine.kernel.next;machine.envEpoch++;}
  machine.loadAverages=[0,0,0];machine.vmRates={si:0,so:0};machine.syncCalls=0;machine.dirtyMiB=0;machine.pressureFlags={};
  machine.ioStats={readKiB:0,writeKiB:0,readOps:0,writeOps:0,seconds:0};
  machine.lastIO=null;machine.netStats={rxBytes:0,txBytes:0,rxPackets:0,txPackets:0,rxDropped:0,tcpRetrans:0};
  bootLabDrivers(machine);
  machine.address=machine.savedAddress;
  startLabNetworkBoot(machine);
  labStorageBoot(machine);
  startLabService(machine);
  if(machine.web?.current)logWebAppStart(machine);
  if(machine.ops){
    machine.ops.active=false;
    machine.ops.autoStartedBoot=machine.ops.enabled?machine.boot:null;
    if(machine.ops.enabled)setHostCronActive(machine,true);
  }
  if(machine.accounts){
    machine.accounts.sessionGroups=accountGroups(machine,machine.accounts.sessionUser);
    machine.accounts.revision++;
  }
  if(machine.packageTraining){
    machine.packageTraining.path=PACKAGE_DEFAULT_PATH;
    machine.packageTraining.revision++;
  }
  return machine.boot;
}

function practiceState(machine){
  return {
    kernel:machine.kernel.running,nextKernel:machine.kernel.next,environment:environmentKey(machine),simSeconds:machine.simSeconds,
    boot:machine.boot,address:machine.address,savedAddress:machine.savedAddress,linkUp:machine.up,
    speed:machine.speed,badRoute:machine.badRoute,peerPort:machine.peerPort,localPort:machine.localPort,
    diskPresent:machine.diskPresent,mounted:machine.mounted,mountUUID:machine.mountUUID,diskBusy:machine.diskBusy,
    diskError:machine.diskError,diskUsed:machine.diskUsed,fileMiB:machine.fileMiB,writtenMiB:machine.writtenMiB,
    resident:machine.resident,cpuBackground:machine.cpuBackground,loadId:machine.load?.id||null,elapsed:machine.load?.elapsed||0,
    nicFirmware:machine.nicFirmware,nicBound:machine.nicBound,hbaCompatible:machine.hbaCompatible,hbaBound:machine.hbaBound,
    configuredPort:machine.configuredPort,servicePort:machine.servicePort,serviceStatus:machine.serviceStatus,
    fileWritable:machine.fileWritable,probeExists:machine.probeExists,readOnly:machine.readOnly,inodeUsed:machine.inodeUsed,
    driveSerial:machine.driveSerial,leakMiB:machine.leakMiB,leakRate:machine.leakRate,rxErrors:machine.rxErrors,crcFault:machine.crcFault,
    appRelease:machine.web?.current||null,releaseRevision:machine.web?.revision||0,appConfigPort:machine.web?.configPort,appFailed:machine.web?.failed,
    cwd:machine.fileTraining?.cwd,fileRevision:machine.fileTraining?.revision,
    accountSession:machine.accounts?.sessionUser,accountRevision:machine.accounts?.revision,
    packagePath:machine.packageTraining?.path,packageRevision:machine.packageTraining?.revision,reportRun:machine.ops?.runOrdinal,
    reportAccess:machine.ops?.groupMember||false,reportDependency:machine.ops?.packageInstalled||false,cronActive:machine.ops?.active||false,cronEnabled:machine.ops?.enabled||false,cronSchedule:machine.ops?.schedule||false
  };
}

function recordPracticeEvent(run,raw,result,previous,segment){
  const state=practiceState(run.machine);
  const changed=Object.keys(state).filter(key=>state[key]!==previous[key]);
  if(changed.length)run.machine.revision++;
  if(run.machine.scheduleTraining&&changed.some(key=>['boot','reportAccess','reportDependency','cronActive','cronEnabled','cronSchedule'].includes(key)))run.machine.scheduleTraining.revision++;
  const event={
    environment:machineEnvironment(run.machine),environmentKey:environmentKey(run.machine),
    ...result,failed:Boolean(result.failed),raw,at:stamp(),seq:++run.sequence,
    boot:state.boot,simTime:run.machine.simSeconds,address:state.address,savedAddress:state.savedAddress,
    revision:run.machine.revision,fromBoot:previous.boot,changed,
    workingDirectory:previous.cwd,
    workingUser:previous.accountSession,
    scheduleRevision:run.machine.scheduleTraining?.revision,
    command:segment?.command, target:result.target??segment?.positionals[0], fromPeer:Boolean(segment?.fromB),
    delta:changed.length?Object.fromEntries(changed.map(key=>[key,[previous[key],state[key]]])):undefined
  };
  run.events.push(event);
  if(run.events.length>240){
    run.events.shift();
    if(run.stepStart!==undefined)run.stepStart=Math.max(0,run.stepStart-1);
  }
  run.cursor=run.events.length;
  return event;
}

function restorePracticeRun(run){
  const defaults={...LAB_NETWORK,...LAB_SYSTEM,...HOST_DEFAULTS,revision:0,load:null,loadOrdinal:0,fioOrdinal:0};
  run.machine={...defaults,...run.machine};
  if(run.stepMachine)run.stepMachine={...defaults,...run.stepMachine};
  if(run.initial)run.initial={...LAB_SYSTEM,...run.initial};
  const restoreLog=entry=>typeof entry==='string'
    ?{message:entry,transport:/^(kernel|simnic|simhba|oom|blk_update_request):/.test(entry)?'kernel':'system'}:entry;
  for(const machine of [run.machine,run.stepMachine].filter(Boolean)){
    initializeKernelMachine(machine);
    if(machine.fileTraining)ensureWcDemo(machine);
    machine.journal=machine.journal.map(restoreLog);
    machine.previous=machine.previous.map(restoreLog);
  }
  run.events.forEach((event,i)=>{
    event.seq??=i+1;
    event.fromPeer??=/^(?:sudo\s+)?sim\s+b\s/.test(event.raw);
    if(event.previous&&event.state){
      if(event.changed?.length)event.delta=Object.fromEntries(event.changed.map(key=>[key,[event.previous[key],event.state[key]]]));
      delete event.previous;
      delete event.state;
    }
  });
  run.sequence=Math.max(run.sequence||0,run.events.at(-1)?.seq||0);
}

function simulatePracticeCommand(run,parsed){
  const segment=parsed.segments[0],machine=run.machine,previous=practiceState(machine);
  const reject=(output,reason)=>({output,reason,kind:'rejected',failed:true});
  let result;
  if(parsed.issues.length||!segment)result=reject(terminalOutput(parsed.raw,'',parsed),'syntax');
  else if(parsed.operators.length)result=runPracticePipeline(machine,parsed);
  else if(!PRACTICE_TOOLS.has(segment.command))result=reject(segment.command+': unavailable in this workspace','unavailable');
  else if(segment.command==='help'||segment.command==='sim'&&segment.positionals[0]==='help'||segment.opts['--help']){
    const examples=segment.command==='sim'?Object.values(PRACTICE_ACTIONS).map(action=>action[2]):Object.values(PRACTICE_COMMANDS).flat();
    if(machine.web)examples.push(...(segment.command==='sim'?['sim release status','sim release deploy v1','sim release rollback']:['curl -i '+WEB_PROXY_URL,'sim b journalctl -u nginx -b','sim release status']));
    if(machine.ops)examples.push(...(segment.command==='sim'?['sim next-cron']:['id reportbot','rpm -q jq','dnf info jq','systemctl is-enabled crond','cat '+HOST_CRON_FILE,'date','sim next-cron']));
    const reference=segment.opts['--help']?segment.command+' '+Object.entries(segment.spec.options||{}).map(([name,info])=>name+(info[1]==='value'?' VALUE':'')).join(' '):examples.join('\n');
    result={output:reference,kind:'help'};
  }else if(segment.command==='history'){
    result={output:run.events.slice(-40).map(e=>e.seq+'  '+e.raw).join('\n'),kind:'history'};
  }else{
    result=runMachineSegment(machine,segment);
  }
  return recordPracticeEvent(run,parsed.raw,result,previous,segment);
}

function runMachineSegment(machine,segment){
  return runPackageLabCommand(machine,segment)||runAccountLabCommand(machine,segment)||runFileLabCommand(machine,segment)||runHostOpsCommand(machine,segment)||runWebWorkCommand(machine,segment)||runKernelModelCommand(machine,segment)||runHostLabCommand(machine,segment)||runLabSystemCommand(machine,segment)||runLabNetworkCommand(machine,segment);
}
function runPracticePipeline(machine,parsed){
  const first=parsed.segments[0];
  if(!PRACTICE_TOOLS.has(first.command))return modelError(first.command+': unavailable in this workspace','rejected','unavailable');
  const redirect=parsed.operators.find(op=>op==='>'||op==='>>');
  const destination=redirect?parsed.operators.at(-1):null;
  if(destination){
    const failure=virtualFileError(machine,destination,true,!virtualFile(machine,destination));
    if(failure)return modelError('redirect: '+failure[1],'rejected',failure[0],failure[2]);
    if(redirect==='>'||!virtualFile(machine,destination))createVirtualFile(machine,destination,0,'');
  }
  let result=runMachineSegment(machine,first);
  const sourcePath=result.target,sourceKind=result.kind;
  const filters=[],errors=[];
  const stream=value=>{
    if(value.failed&&value.reason!=='no-match'){errors.push(value.output);return '';}
    return value.output;
  };
  let output=stream(result);
  for(const filter of parsed.segments.slice(1)){
    const expected=filter.command==='grep'?1:0;
    result=filter.positionals.length===expected?filterLabText(filter,output):modelError(filter.command+': pipe input expects no filename','text-filter','arguments',2);
    filters.push({command:filter.command,opts:filter.opts,pattern:filter.positionals[0],matches:result.matches,newlineCount:result.newlineCount,selectedLines:result.selectedLines});
    output=stream(result);
  }
  const content=output;
  if(destination){
    const before=machine.files[destination]?.content||'';
    const text=redirect==='>>'?before+content:content;
    createVirtualFile(machine,destination,new TextEncoder().encode(text).length/1048576,text);
    machine.files[destination].provenance={raw:parsed.raw,sourcePath,boot:machine.boot};
    output='';
  }
  return {...result,output:errors.join('\n')+(errors.length&&output?'\n':'')+output,pipeline:true,sourceKind,sourcePath,filters,destination,redirect,savedContent:destination?machine.files[destination].content:undefined};
}

function applyPracticeConfig(run,requested,keys){
  const m=run.machine,before=practiceState(m), edited=new Set(keys);
  if(edited.has('diskPresent')&&!requested.diskPresent)edited.add('mounted');
  if(edited.has('mounted')&&(!m.hbaBound||!(edited.has('diskPresent')?requested.diskPresent:m.diskPresent)))requested.mounted=false;
  const changed=[...edited].filter(key=>m[key]!==requested[key]);
  if(!changed.length)return null;
  for(const key of changed)m[key]=requested[key];
  if(changed.includes('fileMiB')){delete m.files['/mnt/sit/test.bin'];if(m.fileMiB)initializeKernelMachine(m);}
  if(changed.includes('diskUsed'))m.writtenMiB=0;
  if(changed.some(key=>['address','up','speed','badRoute'].includes(key)))m.neighbor='';
  const lines=changed.map(key=>key+'='+requested[key]);
  appendLabLog(m,'lab: applied configuration: '+lines.join(', '));
  return recordPracticeEvent(run,'[模拟机配置]',{output:lines.join('\n'),kind:'case-config'},before);
}
