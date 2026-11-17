'use strict';

const HOST_DEFAULTS={
  nicFirmware:true,hbaCompatible:true,nicBound:true,hbaBound:true,
  configuredPort:'9090',servicePort:9090,serviceStatus:'active',serviceFailedPort:'',serviceExit:'',
  fileWritable:true,probeExists:false,readOnly:false,inodeUsed:100,pendingSectors:0,driveSerial:'SIM-DISK-A',
  leakRate:0,leakMiB:0,simSeconds:0,rxErrors:0,crcFault:false
};
const LAB_AGENT='sit-agent.service';
const LAB_PROBE='/mnt/sit/permission-check';
const LAB_INODES=1000;

function labDiskVisible(machine){
  return machine.diskPresent&&machine.hbaBound;
}

function bootLabDrivers(machine){
  initializeKernelMachine(machine);
  loadKernelDriver(machine,'simnic');
  loadKernelDriver(machine,'simhba');
}

function startLabService(machine){
  const port=Number(machine.configuredPort);
  const valid=/^\d+$/.test(machine.configuredPort)&&Number.isInteger(port)&&port>=1&&port<=65535;
  const conflict=valid&&machine.localPort===port;
  const active=valid&&!conflict;
  machine.servicePort=active?port:0;
  machine.serviceStatus=active?'active':'failed';
  machine.serviceFailedPort=active?'':machine.configuredPort;
  machine.serviceExit=active?'':conflict?'98/ADDRESS_IN_USE':'2/INVALIDARGUMENT';
  const message=active?'sit-agent: listening on 0.0.0.0:'+port
    :conflict?'sit-agent: port '+port+' already in use; exited with status 98'
      :'sit-agent: invalid listen port "'+machine.configuredPort+'"; exited with status 2';
  appendLabLog(machine,message,'system',LAB_AGENT);
}

function labPCI(machine,opts){
  const controller=(address,category,model,id,driver,bound)=>{
    const entry=address+' '+(opts['-n']===true?category+': '+model+' ['+id+']':category+': '+model);
    return opts['-k']?[entry,...(bound?[' Kernel driver in use: '+driver]:[]),' Kernel modules: '+driver].join('\n'):entry;
  };
  return controller('03:00.0','Ethernet controller','SimNIC G1','1abc:1001','simnic',machine.nicBound)+'\n'
    +controller('04:00.0','SAS controller','SimStorage HBA','1abc:2001','simhba',machine.hbaBound);
}

function runHostLabCommand(m,segment){
  const {command,positionals:args,opts}=segment;
  const out=(output,kind,values)=>({output,kind,...values});
  const err=(output,kind,reason)=>({output,kind,reason,failed:true});
  const flag=v=>['on','off'].includes(v);
  if(command==='lspci')return out(labPCI(m,opts),'pci',{nicBound:m.nicBound,hbaBound:m.hbaBound,withDrivers:Boolean(opts['-k'])});
  if(command==='lsmod')return out('Module        Size Used by\nsimnic       98304 '+Number(m.nicBound)
    +(m.hbaBound?'\nsimhba      163840 1':'')+'\next4        745472 2','modules',{hbaLoaded:m.hbaBound,nicLoaded:true});
  if(command==='modinfo'){
    const driver=args[0];
    return out('filename: /lib/modules/4.19.90-sit.sim/'+driver+'.ko\nversion: '+(driver==='simhba'&&!m.hbaCompatible?'0.9':'1.0')
      +'\nvermagic: '+(driver==='simhba'&&!m.hbaCompatible?'4.18-sit.sim':'4.19.90-sit.sim')+' SMP'
      +(driver==='simnic'?'\nfirmware: simnic-fw.bin':''),'module-info',{driver,compatible:driver!=='simhba'||m.hbaCompatible});
  }
  if(command==='whoami')return out('student','identity',{user:'student'});
  if(command==='id')return out('uid=1000(student) gid=1000(student) groups=1000(student),2000(sitqa)','identity',{user:'student',group:'sitqa'});
  if(command==='ls'){
    const target=args[0];
    if(args.length!==1)return err('ls: specify one virtual path','file-list','unsupported-path');
    if(![LAB_PROBE,'/mnt/sit'].includes(target)||target===LAB_PROBE&&!m.probeExists)return err('ls: cannot access '+(target||'target')+': No such file or directory','file-list','no-file');
    return out(target==='/mnt/sit'?(m.fileWritable?'drwxrwxr-x':'drwxr-xr-x')+' 2 root sitqa 4096 /mnt/sit'
      :'-rw-r--r-- 1 student student 0 '+LAB_PROBE,'file-list',{directory:target==='/mnt/sit',groupWrite:m.fileWritable});
  }
  if(command==='touch'){
    if(args[0]!==LAB_PROBE||args.length!==1)return err('touch: supported target is '+LAB_PROBE,'file-create','unsupported-path');
    if(!m.mounted)return err('touch: test volume is not mounted','file-create','not-mounted');
    if(m.readOnly)return err('touch: Read-only file system','file-create','read-only');
    if(!m.fileWritable)return err('touch: Permission denied','file-create','permission');
    if(!m.probeExists&&m.inodeUsed>=LAB_INODES)return err('touch: No space left on device','file-create','no-inodes');
    if(!m.probeExists){m.probeExists=true;m.inodeUsed++;}
    return out('','file-create',{created:true});
  }
  if(command==='systemctl'){
    if(opts['--failed']){
      const rows=[];
      if(m.serviceStatus==='failed')rows.push('sit-agent.service loaded failed failed');
      if(!m.mounted&&m.journal.some(entry=>entry.message.includes('/mnt/sit: UUID=')))rows.push('mnt-sit.mount loaded failed failed');
      return out((rows.length?'UNIT LOAD ACTIVE SUB\n'+rows.join('\n')+'\n':'')+rows.length+' loaded units listed','units',{agentFailed:m.serviceStatus==='failed'});
    }
    if(['status','restart'].includes(args[0])&&['sit-agent',LAB_AGENT].includes(args[1])&&args.length===2){
      const restart=args[0]==='restart';
      if(restart)startLabService(m);
      const failed=m.serviceStatus==='failed';
      return {
        output:'● sit-agent.service - Simulated SIT agent\n   Active: '+(failed?'failed (Result: exit-code)\n   Main PID: 617 (code=exited, status='+m.serviceExit+')':'active (running)\n   Main PID: 617 (sit-agent)'),
        kind:restart?'service-restart':'service-status',failed,reason:failed?'service-failed':null, active:!failed,port:m.servicePort
      };
    }
  }
  if(command==='cat'&&args[0]==='/etc/sit-agent.conf')return out('listen_port='+m.configuredPort,'service-config',{port:m.configuredPort});
  if(command!=='sim')return null;
  const [action,value]=args;
  if(args.length!==2&&!(action==='restart-worker'&&args.length===1))return null;
  if(action==='nic-fw'&&flag(value)){
    m.nicFirmware=value==='on';
    appendLabLog(m,'lab: NIC firmware package '+value+' (applies at next boot)');
    return out('NIC firmware staged for next boot: '+value,'nic-firmware',{enabled:m.nicFirmware});
  }
  if(action==='hba-driver'&&['match','mismatch'].includes(value)){
    m.hbaCompatible=value==='match';
    m.hbaMismatchProfile=m.kernel.running;
    return out('HBA driver staged: '+value,'hba-package',{enabled:m.hbaCompatible});
  }
  if(action==='service-port'&&/^\d{1,5}$/.test(value)&&Number(value)>=1&&Number(value)<=65535){
    m.configuredPort=value;
    return out('Saved sit-agent listen_port='+value,'service-config-change',{port:Number(value)});
  }
  if(action==='probe-service'&&/^\d{1,5}$/.test(value)){
    const port=Number(value);
    return m.serviceStatus==='active'&&port===m.servicePort?out('127.0.0.1:'+port+' connected; sit-agent OK','service-probe',{port})
      :err('127.0.0.1:'+port+': Connection refused','service-probe','no-listener');
  }
  if(action==='access'&&['rw','r'].includes(value)){
    m.fileWritable=value==='rw';
    appendLabLog(m,'lab: sitqa directory write permission '+(m.fileWritable?'granted':'removed'));
    return out('sitqa: '+value,'access-change',{enabled:m.fileWritable});
  }
  if(action==='fs-mode'&&['rw','ro'].includes(value)){
    m.readOnly=value==='ro';
    appendLabLog(m,m.readOnly?'EXT4-fs (sdb1): remounting filesystem read-only':'EXT4-fs (sdb1): virtual volume restored read-write','kernel');
    return out('/mnt/sit mode: '+value,'fs-mode',{readOnly:m.readOnly});
  }
  if(action==='inode-usage'&&/^\d+$/.test(value)&&Number(value)<=LAB_INODES){
    m.inodeUsed=Number(value);
    return out('Inodes in use: '+value+' / '+LAB_INODES,'inode-change',{used:m.inodeUsed});
  }
  if(action==='replace-disk'&&value==='sdb'){
    m.pendingSectors=0;m.driveSerial='SIM-DISK-B';m.diskError=false;
    appendLabLog(m,'lab: enrolled a replacement test disk with the saved teaching image');
    return out('Replacement test image ready: SIM-DISK-B','disk-replaced');
  }
  if(action==='host-route'&&['clear','wrong'].includes(value)){
    m.badRoute=value==='wrong';m.neighbor='';
    appendLabLog(m,'network: explicit host route '+value+' for '+LAB_PEER);
    return out('Host route: '+value,'route-change',{wrong:m.badRoute});
  }
  if(action==='link-errors'&&flag(value)){
    m.crcFault=value==='on';
    return out('Link checksum fault: '+value,'crc-change',{active:m.crcFault});
  }
  if(action==='restart-worker'){
    m.leakMiB=0;m.workerKilled=false;
    appendLabLog(m,'workload-agent: restarted; private memory released', 'system');
    return out('workload-agent restarted','worker-restart');
  }
  if(action==='leak'&&['off','slow'].includes(value)){
    m.leakRate=value==='slow'?20:0;
    return out('Synthetic worker growth: '+m.leakRate+' MiB/s','leak-change',{rate:m.leakRate});
  }
  if(action==='cpu-background'&&/^\d+$/.test(value)&&Number(value)<=99){
    m.cpuBackground=Number(value);
    return out('Background CPU busy: '+value+'%','cpu-change',{cpu:m.cpuBackground});
  }
  return null;
}
