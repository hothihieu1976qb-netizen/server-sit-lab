'use strict';

// A bounded Linux behaviour model, not an executable kernel or a CPU emulator.
// Profiles describe this teaching build only, not vendor compatibility or performance.
const KERNEL_PROFILES={
  '4.19':{release:'4.19.90-sit.sim',abi:'sit-x86-4.19-b1',uring:false,label:'4.19 · 原有教学基线'},
  '5.10':{release:'5.10.0-sit.sim',abi:'sit-x86-5.10-b1',uring:true,label:'5.10 · 升级与驱动适配'},
  '6.6':{release:'6.6.0-sit.sim',abi:'sit-x86-6.6-b1',uring:true,label:'6.6 · 能力与回退对比'}
};
const MODEL_VERSION=2;
const MODEL_MEMORY={total:16384,swap:2048,reserved:128,cache:640,buffers:64}; // MiB
Object.assign(COMMAND_SPECS.uname.options,{'-r':['显示实际运行的内核版本。'],'-s':['显示内核名称。'],'-m':['显示硬件架构。']});
COMMAND_SPECS.uname.fields[0][1]='Linux|sit\\.sim';
COMMAND_SPECS.modinfo.options={'-k':['读取指定内核目录中的模块元数据，不切换当前内核。','value',v=>'目标教学内核：'+v+'。']};
COMMAND_SPECS.modprobe={purpose:'在模拟运行内核中加载或卸载驱动模块。',options:{'-r':['卸载模块；已挂载的存储控制器会返回忙碌。']},positional:'模块 {v}；只支持 simnic、simhba。',fields:[['status','modprobe|module|probe','模块加载、版本匹配和设备 probe 是不同步骤。']],memory:'包已安装不等于已加载，加载后还要查绑定。'};
COMMAND_SPECS.umount={purpose:'卸载虚拟测试卷，保留文件和启动配置。',positional:'挂载点 {v}；仅支持 /mnt/sit。',fields:[['status','umount|busy','忙碌时先停止访问该卷的作业。']],memory:'卸载不删数据，重挂看原文件。'};
COMMAND_TEACHING.modprobe=['把匹配当前内核的模块装载进模拟运行环境。','模块文件、内核 ABI、固件和 probe 任一环节失败，都可能导致设备不可用。','对照 uname -r、modinfo、lsmod、lspci 和日志，最后验证接口或磁盘。'];
COMMAND_TEACHING.umount=['解除挂载点与文件系统的运行关联。','卸载不删除磁盘文件，也不修改 fstab。','确认业务已停并保存证据，重挂后验证数据和访问。'];
function kernelProfile(m){return KERNEL_PROFILES[m.kernel.running];}
function kernelRelease(m){return kernelProfile(m).release;}
function kernelPackage(id){return {build:KERNEL_PROFILES[id].abi,release:KERNEL_PROFILES[id].release,version:'1.0'};}
function initializeKernelMachine(m){
  m.kernel??={running:'4.19',next:'4.19',previous:null};m.hbaMismatchProfile??='4.19';
  m.driverPackages??={'4.19':{simnic:kernelPackage('4.19'),simhba:kernelPackage('4.19')}};
  m.nicBlacklisted??=false;m.nicLoaded??=true;m.hbaLoaded??=m.hbaBound;
  m.loadedDriverBuilds??={};m.loadedNicFirmware??=m.nicBound;
  if(m.modelVersion!==MODEL_VERSION){
    for(const [name,loaded] of [['simnic',m.nicLoaded],['simhba',m.hbaLoaded]]){
      if(loaded&&m.driverPackages[m.kernel.running]?.[name])m.loadedDriverBuilds[name]=m.driverPackages[m.kernel.running][name].build;
    }
  }
  m.envEpoch??=0;m.simSeconds??=0;m.idleSeconds??=0;m.loadAverages??=[0,0,0];m.syncCalls??=0;m.dirtyMiB??=0;
  m.ioStats??={readKiB:0,writeKiB:0,readOps:0,writeOps:0,seconds:0};
  m.netStats??={rxBytes:0,txBytes:0,rxPackets:0,txPackets:0,rxDropped:0,tcpRetrans:0};
  m.vmRates??={si:0,so:0};m.pressureFlags??={};m.completedLoads??=[];m.workerKilled??=false;
  m.files??={};
  if(m.fileMiB>0&&!m.files['/mnt/sit/test.bin'])m.files['/mnt/sit/test.bin']={sizeMiB:m.fileMiB,mode:'rw-r--r--',owner:'student',group:'sitqa',inode:101,content:''};
  if(m.probeExists&&!m.files[LAB_PROBE])m.files[LAB_PROBE]={sizeMiB:0,mode:'rw-r--r--',owner:'student',group:'student',inode:102,content:''};
  m.modelVersion=MODEL_VERSION;
}
function machineEnvironment(m){
  return {model:MODEL_VERSION,kernel:kernelRelease(m),profile:m.kernel.running,epoch:m.envEpoch,boot:m.boot,
    nicBuild:m.loadedDriverBuilds.simnic||null,hbaBuild:m.loadedDriverBuilds.simhba||null,
    nicFirmware:m.loadedNicFirmware,driveSerial:m.driveSerial,system:'Kylin V10 / teaching configuration',
    conditions:{speed:m.speed,up:m.up,address:m.address,route:m.badRoute,pathLimit:m.pathLimit||1000,crc:m.crcFault,tcp:m.tcpFault||false,udp:m.udpFault||false,diskPresent:m.diskPresent,mounted:m.mounted,diskBusy:m.diskBusy,diskError:m.diskError,readOnly:m.readOnly,cpuBackground:m.cpuBackground,resident:m.resident,leakRate:m.leakRate}};
}
function environmentKey(m){
  const e=machineEnvironment(m);
  return [e.model,e.kernel,e.epoch,e.nicBuild,e.hbaBuild,e.nicFirmware,e.driveSerial,...Object.values(e.conditions)].join('|');
}
function modelResult(output,kind,extra={}){return {output,kind,...extra};}
function modelError(output,kind,reason,exitCode=1){return {output,kind,reason,failed:true,exitCode};}

function loadKernelDriver(m,name){
  const field=name==='simnic'?'nic':'hba',p=m.driverPackages[m.kernel.running]?.[name];
  m[field+'Loaded']=false;m[field+'Bound']=false;delete m.loadedDriverBuilds[name];
  if(name==='simnic')m.loadedNicFirmware=false;
  let reason=!p?'module-not-found':p.build!==kernelProfile(m).abi||name==='simhba'&&!m.hbaCompatible&&m.hbaMismatchProfile===m.kernel.running?'vermagic':name==='simnic'&&m.nicBlacklisted?'blacklisted':null;
  if(reason){
    const message=reason==='module-not-found'?name+': module not found for '+kernelRelease(m):reason==='vermagic'?name+': version magic mismatch; invalid module format':name+': blacklisted, automatic loading skipped';
    appendLabLog(m,message,'kernel');return modelError('modprobe: '+message,'driver-load',reason);
  }
  m[field+'Loaded']=true;m.loadedDriverBuilds[name]=p.build;
  if(name==='simnic'&&!m.nicFirmware){appendLabLog(m,'simnic: failed to load firmware simnic-fw.bin (-2); probe failed','kernel');return modelError('modprobe: module loaded; device probe failed (-2)','driver-load','firmware');}
  m[field+'Bound']=true;
  if(name==='simnic')m.loadedNicFirmware=true;
  appendLabLog(m,name+': module loaded; '+(name==='simnic'?'enp3s0 registered':'controller ready; sdb online'),'kernel');
  return modelResult('','driver-load',{driver:name,bound:true});
}

function modelMemory(m){
  const t=MODEL_MEMORY,background=Math.max(0,m.resident*1024+m.leakMiB),request=(m.load?.memory||0)*1024;
  const demand=background+request,ram=Math.min(t.total-t.reserved,demand),swap=Math.min(t.swap,Math.max(0,demand-ram));
  const headroom=Math.max(0,t.total-t.reserved-ram),buffers=Math.min(t.buffers,headroom/4),cache=Math.min(t.cache,Math.max(0,headroom-buffers));
  const free=Math.max(0,t.total-t.reserved-ram-buffers-cache);
  const available=Math.min(t.total,Math.max(0,free+cache*.9+buffers*.5-32));
  return {total:t.total,free,available,used:t.total-available,anonymous:ram,cache,buffers,swap,swapTotal:t.swap,demand,background,request,reserved:t.reserved};
}
function modelResourceSample(m){
  const mem=modelMemory(m),load=m.load||{},io=load.io||0;
  const cpu=Math.min(100,m.cpuBackground+(load.cpu||0)*100/16+io*.7+(load.vm||0)*.8);
  const wait=Math.min(100-cpu,m.diskBusy?28:m.diskError&&io?12:io&&m.dirtyMiB>0?Math.min(12,io*2):0);
  return {used:mem.used/1024,available:mem.available/1024,swap:mem.swap/1024,cpu,wait,
    workerMiB:Math.round(mem.background),running:(load.cpu||0)+(load.vm||0)+(m.cpuBackground>=80?20:Math.ceil(m.cpuBackground*16/100)),
    blocked:m.diskBusy?2:m.diskError&&io?io:0,sampleTime:m.simSeconds,pressure:mem.available<1024,loadId:load.id||null,memory:mem};
}
function finishModelLoad(m,reason){
  if(!m.load)return null;
  const ended={...m.load,reason,endedAt:m.simSeconds,error:reason==='oom'||Boolean(m.load.error),environment:machineEnvironment(m),environmentKey:environmentKey(m)};
  m.completedLoads.push(ended);if(m.completedLoads.length>12)m.completedLoads.shift();m.load=null;
  appendLabLog(m,'stress: workload #'+ended.id+' ended, reason='+reason+', elapsed='+ended.elapsed+'s');
  return ended;
}
function recordModelIOError(m){
  appendLabLog(m,m.pendingSectors>0?'sdb: medium error; unrecovered read (UNC)':'simhba: command timeout; controller reset requested','kernel');
  appendLabLog(m,'blk_update_request: I/O error, dev sdb, sector 4096','kernel');
}
function advanceMachineTime(m,seconds){
  // At most 720 five-second integration steps for the largest accepted sim wait.
  const before=modelMemory(m);let remaining=seconds;
  while(remaining>0){
    const load=m.load,dt=Math.min(remaining,5,load?Math.max(.001,load.duration-load.elapsed):5);
    m.simSeconds+=dt;remaining-=dt;m.leakMiB+=m.leakRate*dt;if(load)load.elapsed=Math.min(load.duration,load.elapsed+dt);
    const sample=modelResourceSample(m),r=sample.running+sample.blocked;
    m.idleSeconds+=dt*16*Math.max(0,100-sample.cpu-sample.wait)/100;
    m.loadAverages=m.loadAverages.map((old,i)=>old*Math.exp(-dt/[60,300,900][i])+r*(1-Math.exp(-dt/[60,300,900][i])));
    if(load){load.peakCPU=Math.max(load.peakCPU||0,sample.cpu);load.peakMemory=Math.max(load.peakMemory||0,sample.used);load.peakSwap=Math.max(load.peakSwap||0,sample.swap);}
    if(load?.io){
      m.syncCalls+=load.io*dt;
      if(m.diskError&&!load.error){recordModelIOError(m);load.error=true;}
      else if(!m.diskError&&m.mounted&&!m.readOnly){
        const flushed=Math.min(m.dirtyMiB,load.io*dt*16);m.dirtyMiB-=flushed;
        m.ioStats.writeKiB+=flushed*1024;m.ioStats.writeOps+=Math.ceil(flushed*256);
      }
    }
    for(const [key,active,message] of [['cpu',sample.cpu>=95,'monitor: CPU busy; inspect runnable tasks'],['memory',sample.pressure,'monitor: low MemAvailable; reclaim and swap pressure']]){
      if(active&&!m.pressureFlags[key])appendLabLog(m,message);m.pressureFlags[key]=active;
    }
    if(sample.memory.demand>MODEL_MEMORY.total-MODEL_MEMORY.reserved+MODEL_MEMORY.swap){
      if(load?.vm){
        appendLabLog(m,'oom: Out of memory: Killed process 843 (stress-vm), workload #'+load.id,'kernel');finishModelLoad(m,'oom');
      }else if(m.leakMiB>0){
        appendLabLog(m,'oom: Out of memory: Killed process 590 (workload-agent)','kernel');m.leakMiB=0;m.leakRate=0;m.workerKilled=true;
      }
    }
    if(m.load&&m.load.elapsed>=m.load.duration)finishModelLoad(m,'timeout');
  }
  const after=modelMemory(m);m.vmRates={si:Math.max(0,before.swap-after.swap)*1024/seconds,so:Math.max(0,after.swap-before.swap)*1024/seconds};m.ioStats.seconds+=seconds;
  return modelResourceSample(m);
}

function modelProcesses(m){
  const r=modelResourceSample(m),load=m.load,capacity=1600;
  const rawBackground=m.cpuBackground*16,rawLoad=load?load.cpu*100+(load.vm||0)*12.8+(load.io||0)*11.2:0;
  const scale=Math.min(1,capacity/Math.max(1,rawBackground+rawLoad));
  const residentRatio=r.memory.anonymous/Math.max(1,r.memory.demand);
  const processes=[{id:590,user:'root',cpu:rawBackground*scale,memory:Math.max(0,Math.round(r.memory.background*residentRatio)-(m.serviceStatus==='active'?16:0)),command:m.workerKilled?'system-services':m.backgroundName||'workload-agent',state:m.cpuBackground>=80?'R':'S'}];
  if(load)processes.push({id:843,user:'student',cpu:rawLoad*scale,memory:Math.round(load.memory*1024*residentRatio),command:load.tool||'stress',state:load.io&&m.diskError?'D':load.cpu?'R':'S'});
  if(m.serviceStatus==='active')processes.push({id:617,user:'root',cpu:0,memory:16,command:'sit-agent',state:'S'});
  return processes;
}
function modelMonitorOutput(m,segment){
  const {command,opts}=segment,r=modelResourceSample(m),mem=r.memory;
  if(command==='free'){
    const unit=v=>opts['-h']?(v/1024).toFixed(1)+'Gi':String(Math.round(v*(opts['-m']?1:1024)));
    return modelResult('              total        used        free      shared  buff/cache   available\nMem:   '+[mem.total,mem.used,mem.free,0,mem.buffers+mem.cache,mem.available].map(unit).join('     ')+'\nSwap:  '+[mem.swapTotal,mem.swap,mem.swapTotal-mem.swap].map(unit).join('     '),'memory',r);
  }
  const cpu=Math.round(r.cpu),wa=Math.round(r.wait),sys=Math.min(cpu,Math.round(2+(m.load?.io||0)*.7)),idle=100-cpu-wa;
  if(command==='vmstat')return modelResult(' r  b  swpd    free    buff  cache  si  so  bi   bo  in  cs  us  sy  id wa st\n '+[
    r.running,r.blocked,mem.swap*1024,mem.free*1024,mem.buffers*1024,mem.cache*1024,m.vmRates.si,m.vmRates.so,
    m.diskBusy?18000:0,m.diskBusy?220000:(m.load?.io&&m.dirtyMiB?m.load.io*16384:0),100+cpu*4,200+r.running*15+(m.load?.io||0)*40,cpu-sys,sys,idle,wa,0
  ].map(Math.round).join('  '),'monitor',r);
  const processes=modelProcesses(m);
  if(command==='ps')return modelResult('USER PID %CPU %MEM RSS STAT COMMAND\n'+processes.map(p=>[p.user,p.id,p.cpu.toFixed(1),(p.memory/16384*100).toFixed(1),p.memory*1024,p.state,p.command].join(' ')).join('\n'),'process',r);
  if(command==='top')return modelResult('top - up '+Math.floor(m.simSeconds)+' sec, load average: '+m.loadAverages.map(v=>v.toFixed(2)).join(', ')+'\n%Cpu(s): '+(cpu-sys)+' us, '+sys+' sy, '+idle+' id, '+wa+' wa\nMiB Mem: '+mem.total+' total, '+mem.free.toFixed(1)+' free, '+mem.used.toFixed(1)+' used, '+(mem.cache+mem.buffers).toFixed(1)+' buff/cache\n PID USER S %CPU RES(MiB) COMMAND\n'+processes.map(p=>[p.id,p.user,p.state,p.cpu.toFixed(1),p.memory,p.command].join(' ')).join('\n'),'process',r);
  return null;
}

function virtualFile(m,path){return m.files[path];}
function virtualFileError(m,path,write=false,creating=false){
  if(!path.startsWith('/mnt/sit/'))return path.startsWith('/tmp/')?null:['unsupported-path','Path outside virtual writable volumes',22];
  if(!labDiskVisible(m))return ['no-device','No such device',19];
  if(!m.mounted)return ['not-mounted','Test volume is not mounted',2];
  if(write&&m.readOnly)return ['read-only','Read-only file system',30];
  if(write&&!m.fileWritable)return ['permission','Permission denied',13];
  if(write&&creating&&m.inodeUsed>=LAB_INODES)return ['no-inodes','No space left on device',28];
  return null;
}
function createVirtualFile(m,path,sizeMiB=0,content=''){
  const old=m.files[path],delta=Math.max(0,sizeMiB-(old?.sizeMiB||0));
  if(path.startsWith('/mnt/sit/')){if(!old)m.inodeUsed++;m.writtenMiB+=delta;}
  m.files[path]={sizeMiB,content,owner:'student',group:'sitqa',mode:'rw-r--r--',inode:old?.inode||m.inodeUsed};
  if(path==='/mnt/sit/test.bin')m.fileMiB=sizeMiB;if(path===LAB_PROBE)m.probeExists=true;
  return m.files[path];
}

function runKernelModelCommand(m,segment){
  const {command,opts,positionals:a}=segment;
  if(['free','top','vmstat','ps'].includes(command))return modelMonitorOutput(m,segment);
  if(command==='uname')return modelResult(opts['-a']?'Linux sit-server-01 '+kernelRelease(m)+' #1 SMP x86_64 GNU/Linux':
    Object.keys(opts).filter(k=>['-r','-s','-m'].includes(k)).map(k=>({'-r':kernelRelease(m),'-s':'Linux','-m':'x86_64'})[k]).join(' ')||'Linux','kernel');
  if(command==='hostnamectl')return modelResult('Static hostname: sit-server-01\nOperating System: Kylin V10 (teaching configuration)\nKernel: Linux '+kernelRelease(m)+'\nArchitecture: x86-64','hostname');
  if(command==='uptime')return modelResult('up '+Math.floor(m.simSeconds)+' seconds, 1 user, load average: '+m.loadAverages.map(n=>n.toFixed(2)).join(', '),'uptime');
  if(command==='cat'){
    const path=a[0],r=modelResourceSample(m),mem=r.memory;
    if(path==='/proc/meminfo')return modelResult(Object.entries({MemTotal:mem.total,MemFree:mem.free,MemAvailable:mem.available,Buffers:mem.buffers,Cached:mem.cache,AnonPages:mem.anonymous,SwapTotal:mem.swapTotal,SwapFree:mem.swapTotal-mem.swap,Dirty:m.dirtyMiB}).map(([k,v])=>k+': '+Math.round(v*1024)+' kB').join('\n'),'memory-files');
    if(path==='/proc/version')return modelResult('Linux version '+kernelRelease(m)+' (SIT teaching build, simulated)','kernel');
    if(path==='/proc/uptime')return modelResult(m.simSeconds.toFixed(2)+' '+m.idleSeconds.toFixed(2),'uptime');
    if(path==='/proc/loadavg')return modelResult(m.loadAverages.map(v=>v.toFixed(2)).join(' ')+' '+r.running+'/'+modelProcesses(m).length+' 843','load-average');
    if(path==='/proc/sys/kernel/osrelease')return modelResult(kernelRelease(m),'kernel');
    if(path==='/boot/config-'+kernelRelease(m))return modelResult('CONFIG_64BIT=y\nCONFIG_SMP=y\nCONFIG_MODULES=y\nCONFIG_EXT4_FS=y\n'+(kernelProfile(m).uring?'CONFIG_IO_URING=y':'# CONFIG_IO_URING is not set'),'kernel-config');
    if(m.files[path]){const failure=virtualFileError(m,path);return failure?modelError('cat: '+failure[1],'file-read',failure[0]):modelResult(m.files[path].content||'','file-read',{target:path});}
  }
  if(command==='iostat'){
    const r=m.lastIO||{readRate:0,writeRate:0,readMiB:0,writeMiB:0,await:0,util:0};
    const values=m.diskError?[0,0,0,0,841,99]:m.diskBusy?[900,4500,12,260,35,99]:Object.values(r);
    return modelResult('Device r/s w/s rMiB/s wMiB/s await %util\nsda 0 0 0 0 0 0'+(labDiskVisible(m)?'\nsdb '+values.map(n=>Number(n).toFixed(2)).join(' '):''),'disk-stats',{busy:m.diskBusy,present:labDiskVisible(m),ioError:m.diskError});
  }
  if(command==='systemctl'&&a[0]==='list-units')return modelResult('UNIT LOAD ACTIVE SUB\nNetworkManager.service loaded active running\nsit-agent.service loaded '+(m.serviceStatus==='active'?'active running':'failed failed')+'\nmnt-sit.mount loaded '+(m.mounted?'active mounted':'inactive dead'),'units');
  if(command==='systemctl'&&a[0]==='status'&&['NetworkManager','NetworkManager.service'].includes(a[1]))return modelResult('NetworkManager.service - Network Manager\nActive: active (running)\nMain PID: 602 (NetworkManager)','service-status',{active:true});
  if(['tail','less','grep'].includes(command)||command==='cat'&&a[0]==='/var/log/messages'){
    const path=a.find(v=>v.startsWith('/')),failure=path&&path!=='/var/log/messages'?virtualFileError(m,path):null;
    if(failure)return modelError(command+': '+failure[1],'file-read',failure[0]);
    let text=path==='/var/log/messages'?m.journal.map(e=>e.message).join('\n'):m.files[path]?.content;
    if(text===undefined)return modelError(command+': No such virtual file','file-read','no-file',2);
    if(command==='tail')text=text.split('\n').slice(-Number(opts['-n']||10)).join('\n');
    if(command==='grep'){const term=a[0];text=text.split('\n').filter(line=>opts['-i']?line.toLowerCase().includes(term.toLowerCase()):line.includes(term)).join('\n');}
    return {output:text,kind:'file-read',exitCode:command==='grep'&&!text?1:0};
  }
  if(command==='lsmod')return modelResult('Module        Size Used by\n'+(m.nicLoaded?'simnic       98304 '+Number(m.nicBound)+'\n':'')+(m.hbaLoaded?'simhba      163840 '+Number(m.hbaBound)+'\n':'')+'ext4        745472 2','modules',{nicLoaded:m.nicLoaded,hbaLoaded:m.hbaLoaded});
  if(command==='modinfo'){
    const id=opts['-k']?Object.keys(KERNEL_PROFILES).find(k=>k===opts['-k']||KERNEL_PROFILES[k].release===opts['-k']):m.kernel.running;
    const p=m.driverPackages[id]?.[a[0]];
    if(!p)return modelError('modinfo: ERROR: Module '+a[0]+' not found.','module-info','no-module');
    const compatible=p.build===KERNEL_PROFILES[id].abi&&(a[0]!=='simhba'||m.hbaCompatible||id!==m.hbaMismatchProfile);
    return modelResult('filename: /lib/modules/'+KERNEL_PROFILES[id].release+'/'+a[0]+'.ko\nversion: '+p.version+'\nvermagic: '+(!compatible?'4.18-sit.sim':p.release)+' SMP\nbuild-id: '+p.build+(a[0]==='simnic'?'\nfirmware: simnic-fw.bin':''),'module-info',{driver:a[0],compatible});
  }
  if(command==='modprobe'){
    if(!['simnic','simhba'].includes(a[0]))return modelError('modprobe: unknown virtual module','driver-load','unknown-module');
    if(opts['-r']){
      if(a[0]==='simhba'&&m.mounted)return modelError('modprobe: FATAL: Module simhba is in use.','driver-unload','busy',16);
      const field=a[0]==='simnic'?'nic':'hba';m[field+'Loaded']=false;m[field+'Bound']=false;delete m.loadedDriverBuilds[a[0]];m.envEpoch++;
      if(a[0]==='simnic')m.loadedNicFirmware=false;
      appendLabLog(m,a[0]+': module unloaded','kernel');return modelResult('','driver-unload');
    }
    const result=loadKernelDriver(m,a[0]);m.envEpoch++;return result;
  }
  if(command==='umount'){
    if(a[0]!=='/mnt/sit')return modelError('umount: unsupported target','unmount','unsupported-path');
    if(!m.mounted)return modelError('umount: /mnt/sit: not mounted','unmount','not-mounted');
    if(m.load?.io)return modelError('umount: /mnt/sit: target is busy','unmount','busy',16);
    m.mounted=false;appendLabLog(m,'systemd: Unmounted /mnt/sit');return modelResult('','unmount');
  }
  if(command==='touch'){
    const path=a[0];if(!/^\/(mnt\/sit|tmp)\/[\w.-]+$/.test(path||'')||a.length!==1)return modelError('touch: unsupported virtual path','file-create','unsupported-path');
    const failure=virtualFileError(m,path,true,!virtualFile(m,path));if(failure)return modelError('touch: '+failure[1],'file-create',failure[0],failure[2]);
    if(!virtualFile(m,path))createVirtualFile(m,path);return modelResult('','file-create',{created:true,target:path});
  }
  if(command==='ls'&&a[0]!=='/mnt/sit'){
    const file=virtualFile(m,a[0]);return file?modelResult('-'+file.mode+' 1 '+file.owner+' '+file.group+' '+Math.round(file.sizeMiB*1048576)+' '+a[0],'file-list'):
      modelError('ls: cannot access '+a[0]+': No such file or directory','file-list','no-file',2);
  }
  if(command==='sim'&&a[0]==='kernel'){
    if(a.length===1||a[1]==='list')return modelResult(Object.entries(KERNEL_PROFILES).map(([id,p])=>(m.kernel.running===id?'* ':'  ')+id+' '+p.release+(m.kernel.next===id?' [next boot]':'')).join('\n'),'kernel-list');
    if(a[1]==='select'&&a.length===3&&KERNEL_PROFILES[a[2]]){m.kernel.next=a[2];appendLabLog(m,'bootloader: selected '+KERNEL_PROFILES[a[2]].release+' for next boot');return modelResult('Next boot: '+KERNEL_PROFILES[a[2]].release+'; running: '+kernelRelease(m),'kernel-select');}
    if(a[1]==='rollback'&&a.length===2){if(!m.kernel.previous)return modelError('bootloader: no previous kernel','kernel-select','no-previous');m.kernel.next=m.kernel.previous;return modelResult('Next boot: '+KERNEL_PROFILES[m.kernel.next].release,'kernel-select');}
    return modelError('sim kernel list | select 4.19|5.10|6.6 | rollback','kernel-select','arguments');
  }
  if(command==='sim'&&a[0]==='driver'){
    const [,action,name,id]=a;
    if(action!=='install'||a.length!==4||!['simnic','simhba'].includes(name)||!KERNEL_PROFILES[id])return modelError('sim driver install simnic|simhba 4.19|5.10|6.6','driver-package','arguments');
    m.driverPackages[id]??={};m.driverPackages[id][name]=kernelPackage(id);if(name==='simhba'&&id===m.hbaMismatchProfile)m.hbaCompatible=true;
    appendLabLog(m,'package: installed '+name+' for '+KERNEL_PROFILES[id].release+'; running driver unchanged');
    return modelResult('Installed '+name+' for '+KERNEL_PROFILES[id].release+'; load with modprobe or reboot','driver-package');
  }
  return null;
}

function modelFio(m,segment){
  let {opts,positionals:args}=segment;
  if(args.length){
    if(args.length!==1||!['/mnt/sit/low.fio','/mnt/sit/fixed.fio'].includes(args[0]))return modelError('fio: unknown virtual job','fio','arguments');
    opts=options(tokens(args[0].endsWith('low.fio')?lowCommand:baselineCommand).slice(1));
  }
  const c=getFioConfig(opts),block=sizeMiB(c.bs),size=sizeMiB(c.size),testDisk=c.target.startsWith('/mnt/sit/');
  if(c.rw==='trim')return modelError('fio: trim workload is not implemented in this simulator','fio','unsupported-mode');
  if(!block||block>1||!size||size>65536||!['/mnt/sit/test.bin','/root/test.bin'].includes(c.target)||!['read','write','randread','randwrite','randrw','rw'].includes(c.rw)||!['sync','libaio','io_uring'].includes(c.engine)
    ||!Number.isInteger(c.depth)||!numberIn(c.depth,1,128)||!Number.isInteger(c.jobs)||!numberIn(c.jobs,1,16)||!numberIn(c.runtime,1,3600)||numberIn(c.mix,0,100)===null||![0,1].includes(c.direct))return modelError('fio: invalid arguments or unsupported virtual target','fio','arguments');
  const extra={config:c,diskBusy:m.diskBusy,underLoad:Boolean(m.load)};
  const fail=(reason,message,errno)=>({...modelError('fio: err='+errno+', '+message,'fio',reason,errno),...extra});
  if(c.engine==='io_uring'&&!kernelProfile(m).uring)return fail('engine-unavailable','io_uring is disabled in this teaching kernel configuration',38);
  const writes=!['read','randread'].includes(c.rw),existing=testDisk?m.fileMiB:1024,allocate=writes?Math.max(0,size-existing):0;
  const pathError=testDisk?virtualFileError(m,c.target,writes,!existing):null;
  if(pathError)return fail(pathError[0],pathError[1],pathError[2]);
  if(testDisk&&m.diskError){recordModelIOError(m);return fail('io-error','Input/output error',5);}
  if(testDisk&&allocate>LAB_DISK_MIB-labDiskUsage(m))return fail('no-space','No space left on device',28);
  if(!writes&&existing<size)return fail('too-short','Prepared virtual file is smaller than requested read size',22);
  const metrics=simulateFioMetrics(c,{testDisk,slowdown:m.diskBusy,underLoad:Boolean(m.load),ordinal:m.fioOrdinal++});
  if(testDisk&&allocate)createVirtualFile(m,c.target,size);
  const readRatio=['rw','randrw'].includes(c.rw)?c.mix/100:c.rw.includes('write')?0:1;
  const amount=metrics.bw*metrics.elapsed;
  m.ioStats.readKiB+=amount*1024*readRatio;m.ioStats.writeKiB+=amount*1024*(1-readRatio);
  m.ioStats.readOps+=metrics.iops*metrics.elapsed*readRatio;m.ioStats.writeOps+=metrics.iops*metrics.elapsed*(1-readRatio);
  if(!c.direct&&writes)m.dirtyMiB=Math.min(256,m.dirtyMiB+amount*(1-readRatio));
  m.lastIO={readRate:metrics.iops*readRatio,writeRate:metrics.iops*(1-readRatio),readMiB:metrics.bw*readRatio,writeMiB:metrics.bw*(1-readRatio),await:metrics.lat,util:Math.min(100,metrics.bw/520*100)};
  advanceMachineTime(m,metrics.elapsed);
  const {output,...values}=metrics;
  return modelResult(output.split('\n[教学模型]')[0],'fio',{...extra,metrics:values});
}
