'use strict';

const LAB_DISK_UUID = 'SIM-TEST-01';
const LAB_SYSTEM = { diskPresent:true, mounted:true, mountUUID:LAB_DISK_UUID, diskUsed:12, diskBusy:false, diskError:false, fileMiB:1024, writtenMiB:0, resident:2, cpuBackground:3 };
const LAB_DISK_MIB=240*1024;

function labDiskUsage(machine){
  return Math.min(LAB_DISK_MIB,machine.diskUsed/100*LAB_DISK_MIB+machine.writtenMiB);
}

function labStorageBoot(m) {
  m.mounted = labDiskVisible(m) && m.mountUUID === LAB_DISK_UUID;
  appendLabLog(m, m.mounted ? 'systemd: Mounted /mnt/sit from /dev/sdb1' : 'systemd: /mnt/sit: UUID='+m.mountUUID+' not found');
}

function labResourceSample(m) { return modelResourceSample(m); }

function runLabSystemCommand(m, segment) {
  const {command, positionals:args,opts}=segment;
  const ok=(output,kind,extra={})=>({output,kind,...extra});
  const error=(output,kind,extra={})=>({output,kind,failed:true,...extra});
  const onOff=v=>['on','off'].includes(v);
  if(command==='hostnamectl')return ok('Static hostname: sit-server-01\nOperating System: Kylin Linux Advanced Server V10\nKernel: Linux 4.19.90-sit.sim\nArchitecture: x86-64','hostname');
  if(command==='dmidecode'&&opts['-t']==='system')return ok('Manufacturer: SIT Teaching Hardware\nProduct Name: SimRack R200\nSerial Number: SIM-0001','model');
  if(command==='dmidecode'&&opts['-t']==='bios')return ok('Vendor: SimFirmware\nVersion: SimUEFI 2.6.0\nRelease Date: 07/01/2026','bios');
  if(command==='cat'&&args[0]==='/etc/os-release')return ok('NAME="Kylin Linux Advanced Server"\nVERSION_ID="V10"\nID=kylin','os');
  if(command==='cat'&&args[0]==='/proc/meminfo'){
    const r=labResourceSample(m);
    const line=(key,value)=>key.padEnd(15)+Math.round(value*1048576)+' kB';
    return ok([line('MemTotal:',16),line('MemAvailable:',r.available),line('SwapTotal:',2),line('SwapFree:',2-r.swap)].join('\n'),'memory-files');
  }
  if(command==='cat'&&args[0]==='/sys/class/net/enp3s0/operstate')return m.nicBound?ok(m.up&&m.speed?'up':'down','operstate'):error('cat: No such file or directory','operstate');
  if(command==='lscpu')return ok('Architecture:          x86_64\nCPU(s):                16\nThread(s) per core:    2\nCore(s) per socket:    8\nSocket(s):             1\nModel name:            SimServer 3200','cpu');
  if(command==='lsblk'){
    const fields=opts['-o'], fs=opts['-f'];
    const rows=fields?'NAME SIZE MODEL\nsda 120G SimBoot120':fs?'NAME FSTYPE UUID MOUNTPOINT\nsda2 ext4 SIM-ROOT-02 /':'NAME SIZE TYPE MOUNTPOINT\nsda 120G disk\n└─sda2 119G part /';
    const mount=m.mounted?' /mnt/sit':'';
    const disk=!labDiskVisible(m)?'':fields?'\nsdb 240G SimSSD240':fs?'\nsdb\n└─sdb1 ext4 '+LAB_DISK_UUID+mount:'\nsdb 240G disk\n└─sdb1 240G part'+mount;
    return ok(rows+disk,'block',{present:labDiskVisible(m),fileSystems:Boolean(fs)});
  }
  if(command==='blkid')return ok('/dev/sda2: UUID="SIM-ROOT-02" TYPE="ext4"'+(labDiskVisible(m)?'\n/dev/sdb1: UUID="'+LAB_DISK_UUID+'" TYPE="ext4"':''),'uuid',{present:labDiskVisible(m)});
  if(command==='findmnt'){
    if(args.length && args[0]!=='/mnt/sit')return error('findmnt: unsupported target');
    if(args.length&&!m.mounted)return error('','mount-state',{mounted:false,target:args[0],exitCode:1});
    return ok((args.length?'':'TARGET SOURCE FSTYPE OPTIONS\n/ /dev/sda2 ext4 rw\n')+(m.mounted?'/mnt/sit /dev/sdb1 ext4 '+(m.readOnly?'ro':'rw'):''),
      'mount-state',{mounted:m.mounted,readOnly:m.readOnly,target:args[0]||'all'});
  }
  if(command==='df'){
    if(opts['-i']){
      const total=LAB_INODES, used=m.inodeUsed;
      return ok('Filesystem Inodes IUsed IFree IUse% Mounted on\n/dev/sda2 10000 540 9460 6% /'+
        (m.mounted?'\n/dev/sdb1 '+total+' '+used+' '+(total-used)+' '+Math.ceil(used/total*100)+'% /mnt/sit':''),
        'inodes',{free:m.mounted?total-used:null});
    }
    const type=Boolean(opts['-T']), fs=type?' ext4':'';
    const used=labDiskUsage(m), percent=Math.ceil(used/LAB_DISK_MIB*100);
    return ok('Filesystem'+(type?' Type':'')+' Size Used Avail Use% Mounted on\n/dev/sda2'+fs+' 119G 18G 101G 16% /'+
      (m.mounted?'\n/dev/sdb1'+fs+' 240G '+(used/1024).toFixed(1)+'G '+((LAB_DISK_MIB-used)/1024).toFixed(1)+'G '+percent+'% /mnt/sit':''),
      'space',{mounted:m.mounted,usedPercent:m.mounted?percent:null});
  }
  if(command==='cat'&&args[0]==='/etc/fstab')return ok('UUID=SIM-ROOT-02 / ext4 defaults 0 1\nUUID='+m.mountUUID+' /mnt/sit ext4 defaults 0 2','fstab',{matches:m.mountUUID===LAB_DISK_UUID});
  if(command==='mount'){
    if(!args.length)return ok('/dev/sda2 on / type ext4 (rw)'+(m.mounted?'\n/dev/sdb1 on /mnt/sit type ext4 ('+(m.readOnly?'ro':'rw')+')':''),'mount-state',{mounted:m.mounted,readOnly:m.readOnly,target:'all'});
    if(args.length!==1||args[0]!=='/mnt/sit')return error('mount: supported target is /mnt/sit');
    labStorageBoot(m);
    return m.mounted?ok('','mount-applied'):error('mount: /mnt/sit: UUID='+m.mountUUID+' not found','mount-rejected');
  }
  if(command==='iostat'){
    if(!labDiskVisible(m))return ok('Device r/s w/s await %util\nsda 12 17 0.7 8.0','disk-stats',{busy:false,present:false});
    const sample=m.diskError?'0 0 841.0 99.0':m.diskBusy?'900 4500 35.0 99.0':'100 80 0.4 12.0';
    return ok('Device r/s w/s await %util\nsdb '+sample,'disk-stats',{busy:m.diskBusy,present:true,ioError:m.diskError});
  }
  if(command==='smartctl'&&opts['-a']){
    if(args[0]!=='/dev/sdb'||!labDiskVisible(m))return error('smartctl: No such virtual device');
    return ok('Device Model: SimSSD240\nSerial Number: '+m.driveSerial+'\nUser Capacity: 240 GiB\nSMART overall-health self-assessment test result: PASSED\nReallocated_Sector_Ct 0\nCurrent_Pending_Sector '+m.pendingSectors,'smart',{pending:m.pendingSectors,serial:m.driveSerial});
  }
  if(command==='fio')return modelFio(m,segment);
  if(command==='stress'||command==='stress-ng'){
    if(m.load)return error('stress: a virtual workload is already running');
    const cpu=Number(opts['--cpu']||0), vm=Number(opts['--vm']||0), io=Number(opts['--io']||0), bytes=sizeMiB(opts['--vm-bytes']||'512M');
    const time=/^(\d+)([sm]?)$/.exec(opts['--timeout']||'60s');
    const duration=time?Number(time[1])*(time[2]==='m'?60:1):0;
    if(![cpu,vm,io].every(Number.isInteger)||cpu<0||cpu>32||vm<0||vm>8||io<0||io>8||(!cpu&&!vm&&!io)||!bytes||vm*bytes>65536||!numberIn(duration,1,3600))return error('stress: invalid worker count, memory size or timeout');
    m.load={id:++m.loadOrdinal,cpu,vm,io,memory:vm*bytes/1024,duration,elapsed:0,tool:command};
    appendLabLog(m,'stress: workload #'+m.load.id+' started (cpu='+cpu+', vm='+vm+', io='+io+')');
    return ok('stress: dispatching '+cpu+' cpu, '+vm+' vm, '+io+' io; memory requested='+vm*bytes+'MiB','load-start',{...m.load});
  }
  if((command==='stop'||command==='pkill')&&(!args.length||['stress','stress-ng'].includes(args[0]))){
    const stopped=m.load?.id||null;
    finishModelLoad(m,'manual');
    if(stopped)appendLabLog(m,'stress: workload #'+stopped+' manually stopped');
    return ok(stopped?'stress: workers stopped':'stress: no active workers','load-stop',{loadId:stopped});
  }
  if(command!=='sim')return null;
  if(args[0]==='wait'&&args.length===2){
    const seconds=Number(args[1]);
    if(!Number.isInteger(seconds)||!numberIn(seconds,1,3600))return error('sim wait: expected 1 to 3600 virtual seconds');
    const load=m.load;
    advanceMachineTime(m,seconds);
    const ended=load&&!m.load?m.completedLoads.at(-1):null;
    if(ended)return {output:'stress: ended after '+ended.elapsed+'s, reason='+ended.reason,kind:'load-end',loadId:ended.id,reason:ended.reason,failed:ended.error};
    return ok(m.load?'stress: elapsed '+m.load.elapsed+' / '+m.load.duration+'s':'Clock advanced by '+seconds+'s; no active workload','clock',{loadId:m.load?.id});
  }
  if(args[0]==='set-fstab'&&args.length===2&&/^UUID=SIM-TEST-\d{2}$/.test(args[1])){
    m.mountUUID=args[1].slice(5);
    appendLabLog(m,'config: /etc/fstab updated for /mnt/sit: '+args[1]);
    return ok('Saved virtual fstab entry for /mnt/sit','fstab-change',{matches:m.mountUUID===LAB_DISK_UUID});
  }
  if(args[0]==='disk-busy'&&args.length===2&&onOff(args[1])){
    m.diskBusy=args[1]==='on';
    appendLabLog(m,'backup: virtual disk background traffic '+args[1]);
    return ok('Background disk load: '+args[1],'disk-busy-change',{active:m.diskBusy});
  }
  if(args[0]==='io-error'&&args.length===2&&onOff(args[1])){
    m.diskError=args[1]==='on';
    appendLabLog(m,'lab: virtual I/O error injection '+args[1]);
    return ok('Virtual disk I/O error: '+args[1],'io-change',{active:m.diskError});
  }
  if(args[0]==='space'&&args.length===2&&Number.isInteger(Number(args[1]))&&numberIn(args[1],0,100)!==null){
    m.diskUsed=Number(args[1]);
    m.writtenMiB=0;
    appendLabLog(m,'filesystem: simulated /mnt/sit usage '+m.diskUsed+'%');
    return ok('/mnt/sit use: '+m.diskUsed+'%','space-change',{usedPercent:m.diskUsed});
  }
  if(args[0]==='link'&&args.length===2&&['0','100','1000'].includes(args[1])){
    m.speed=Number(args[1]);m.neighbor='';
    appendLabLog(m,'simnic: negotiated speed changed to '+args[1]+' Mbps','kernel');
    return ok('Link: '+(m.speed?m.speed+'Mbps':'no carrier'),'speed-change',{speed:m.speed});
  }
  return null;
}
