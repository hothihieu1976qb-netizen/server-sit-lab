'use strict';

const HOST_REPORT_SCRIPT='/opt/host-report/bin/collect';
const HOST_REPORT_INBOX='/srv/host-report/inbox';
const HOST_REPORT_INPUT=HOST_REPORT_INBOX+'/checks.json';
const HOST_REPORT_RESULT='/var/lib/host-report/latest.json';
const HOST_REPORT_LOG='/var/log/host-report.log';
const HOST_CRON_TEMPLATE='/opt/host-report/host-report.cron';
const HOST_CRON_FILE='/etc/cron.d/host-report';
const HOST_CRON_UNIT='crond.service';
const HOST_CRON_LINE='15 2 * * * reportbot '+HOST_REPORT_SCRIPT;
const HOST_CRON_DAY=86400;
const HOST_CRON_OFFSET=2*3600+15*60;
const HOST_REPORT_PACKAGE='jq-1.6-1.lab.x86_64';
const HOST_CHECKS=[{check:'root-filesystem',status:'ok'},{check:'network-address',status:'ok'},{check:'service-units',status:'ok'}];

function createHostOps(){
  return {groupMember:false,packageInstalled:false,enabled:false,active:false,autoStartedBoot:null,schedule:false,clock:Date.UTC(2025,0,1,1,55)/1000,latest:null,log:[]};
}

const hostOpsTime=clock=>new Date(clock*1000).toISOString().slice(0,19)+'Z';
const nextHostCron=clock=>(Math.floor((clock-HOST_CRON_OFFSET)/HOST_CRON_DAY)+1)*HOST_CRON_DAY+HOST_CRON_OFFSET;

function setHostCronActive(machine,active){
  const ops=machine.ops;
  if(ops.active===active)return;
  ops.active=active;
  appendLabLog(machine,'systemd[1]: '+(active?'Started':'Stopped')+' Command Scheduler.','system',HOST_CRON_UNIT);
}

function runHostReport(machine,source){
  const ops=machine.ops;
  const runId=ops.runOrdinal=(ops.runOrdinal||0)+1;
  const reason=!ops.groupMember?'permission':!ops.packageInstalled?'missing-package':null;
  const error=reason==='permission'?HOST_REPORT_INPUT+': Permission denied':reason==='missing-package'?'/usr/bin/jq: No such file or directory':'';
  const exitCode=reason==='permission'?1:reason==='missing-package'?127:0;
  const time=hostOpsTime(ops.clock);
  ops.log.push({boot:machine.boot,runId,source,scheduledAt:time,exitCode,message:time+' reportbot source='+source+' exit='+exitCode+' '+(error||'wrote '+HOST_REPORT_RESULT)+' run='+runId});
  if(ops.log.length>80)ops.log.shift();
  if(reason)return {...modelError('collect: '+error,'ops-collect',reason,exitCode),runId,source};
  ops.latest={generatedAt:time,boot:machine.boot,source,account:'reportbot',checks:HOST_CHECKS.length,runId};
  if(machine.scheduleTraining)ops.reportRevision=machine.scheduleTraining.revision;
  return modelResult('Wrote '+HOST_REPORT_RESULT+' ('+HOST_CHECKS.length+' checks)','ops-collect',{source,runId,exitCode:0});
}

function advanceHostOpsClock(machine,seconds){
  const ops=machine.ops,end=ops.clock+seconds;
  if(ops.active&&ops.schedule){
    for(let due=nextHostCron(ops.clock);due<=end;due+=HOST_CRON_DAY){
      ops.clock=due;
      appendLabLog(machine,hostOpsTime(due)+' CROND: (reportbot) CMD ('+HOST_REPORT_SCRIPT+')','system',HOST_CRON_UNIT);
      runHostReport(machine,'cron');
    }
  }
  ops.clock=end;
}

function runHostOpsCommand(machine,segment){
  const {command,positionals:args,opts,effectiveUser}=segment;
  const [action,target]=args;
  const unit=['crond',HOST_CRON_UNIT];
  const paths=[HOST_REPORT_INBOX,HOST_REPORT_INPUT,HOST_REPORT_RESULT,HOST_REPORT_LOG,HOST_CRON_TEMPLATE,HOST_CRON_FILE];
  const isOps=['rpm','dnf','usermod','getent','install',HOST_REPORT_SCRIPT].includes(command)||command==='id'&&args.length||command==='systemctl'&&unit.includes(target)||command==='journalctl'&&unit.includes(opts['-u'])||['cat','ls','tail'].includes(command)&&paths.includes(action)||command==='sim'&&action==='next-cron';
  if(!isOps&&!(machine.ops&&command==='date'))return null;
  if(!machine.ops||segment.fromB)return modelError(command+': unavailable in this workspace or host','ops-unavailable','unavailable');
  const ops=machine.ops;
  const result=(output,kind,values)=>modelResult(output,kind,values);
  const root=(kind)=>effectiveUser==='root'?null:modelError(command+': operation requires root (use sudo)','ops-'+kind,'permission');
  const readable=effectiveUser==='root'||effectiveUser==='reportbot'&&ops.groupMember;
  if(command==='sim'&&action==='next-cron'&&args.length===1){
    advanceHostOpsClock(machine,nextHostCron(ops.clock)-ops.clock);
    return result('Work order clock advanced to '+hostOpsTime(ops.clock),'ops-time');
  }
  if(command==='date')return result(hostOpsTime(ops.clock).replace('T',' ').replace('Z',' UTC'),'ops-time');
  if(command==='id'&&args.length===1&&action==='reportbot')return result('uid=990(reportbot) gid=990(reportbot) groups=990(reportbot)'+(ops.groupMember?',2001(hostops)':''),'ops-account',{groupMember:ops.groupMember});
  if(command==='getent'&&args.length===2&&action==='group'&&target==='hostops')return result('hostops:x:2001:'+(ops.groupMember?'reportbot':''),'ops-group',{groupMember:ops.groupMember});
  if(command==='usermod'&&args.length===1&&action==='reportbot'&&opts['-a']&&opts['-G']==='hostops'){
    const denied=root('account-change');if(denied)return denied;
    ops.groupMember=true;
    return result('','ops-account-change',{groupMember:true});
  }
  if(command==='rpm'&&opts['-q']&&action==='jq'&&args.length===1){
    const kind=opts['-l']?'package-files':'ops-package-query';
    const paths=['/usr/bin/jq','/usr/share/doc/jq/README'];
    const query=ops.packageInstalled?result(opts['-l']?paths.join('\n'):HOST_REPORT_PACKAGE,kind,opts['-l']?{paths}:{}):modelError('package jq is not installed',kind,'missing-package');
    return {...query,installed:ops.packageInstalled};
  }
  if(command==='dnf'&&target==='jq'&&args.length===2){
    if(action==='info')return result((ops.packageInstalled?'Installed':'Available')+' Packages\nName         : jq\nVersion      : 1.6\nRelease      : 1.lab\nArchitecture : x86_64\n'+(ops.packageInstalled?'From repo':'Repository')+'    : ops-approved','ops-package-repo');
    if(action==='install'){
      const denied=root('package-install');if(denied)return denied;
      if(ops.packageInstalled)return result('Package '+HOST_REPORT_PACKAGE+' is already installed.','ops-package-install',{installed:true});
      ops.packageInstalled=true;
      appendLabLog(machine,'dnf: Installed: '+HOST_REPORT_PACKAGE+' (ops-approved)');
      return result('Installed:\n  '+HOST_REPORT_PACKAGE+'\nComplete!','ops-package-install',{installed:true});
    }
  }
  if(command===HOST_REPORT_SCRIPT&&!args.length){
    if(effectiveUser!=='reportbot')return modelError('collect: run as reportbot for this work order','ops-collect','wrong-user');
    return runHostReport(machine,'manual');
  }
  if(command==='systemctl'&&args.length===2&&unit.includes(target)){
    const status={active:ops.active,enabled:ops.enabled,action};
    if(action==='is-active'||action==='is-enabled'){
      const enabled=action==='is-enabled',ready=enabled?ops.enabled:ops.active;
      const output=enabled?(ready?'enabled':'disabled'):(ready?'active':'inactive');
      return {...(ready?result(output,'ops-cron-status'):modelError(output,'ops-cron-status',output,enabled?1:3)),...status};
    }
    if(action==='status'){
      const output='● crond.service - Command Scheduler\n   Loaded: loaded (/usr/lib/systemd/system/crond.service; '+(ops.enabled?'enabled':'disabled')+')\n   Active: '+(ops.active?'active (running)':'inactive (dead)');
      return {...(ops.active?result(output,'ops-cron-status'):modelError(output,'ops-cron-status','inactive',3)),...status};
    }
    if(['start','stop','enable','disable'].includes(action)){
      const denied=root('cron-change');if(denied)return denied;
      if(action==='start'||action==='stop')setHostCronActive(machine,action==='start');
      else{
        ops.enabled=action==='enable';
        if(opts['--now'])setHostCronActive(machine,ops.enabled);
      }
      return result('','ops-cron-change',{action,active:ops.active,enabled:ops.enabled});
    }
  }
  if(command==='journalctl'&&unit.includes(opts['-u'])){
    const current=opts['-b']!=='-1';
    const lines=(current?machine.journal:machine.previous).filter(entry=>entry.unit===HOST_CRON_UNIT&&!opts['-k']).map(entry=>entry.message);
    return result(lines.join('\n')||'-- No entries --','ops-cron-log',{current,started:lines.some(message=>message.includes('Started Command Scheduler')),dispatchedAt:lines.findLast(message=>message.includes('(reportbot) CMD'))?.split(' ')[0]});
  }
  if(command==='install'&&args.length===2&&action===HOST_CRON_TEMPLATE&&target===HOST_CRON_FILE&&opts['-o']==='root'&&opts['-g']==='root'&&opts['-m']==='0644'){
    const denied=root('schedule-install');if(denied)return denied;
    ops.schedule=true;
    return result('','ops-schedule-install');
  }
  if(command==='ls'&&args.length===1&&opts['-l']){
    if(action===HOST_REPORT_INBOX&&opts['-d'])return result('drwxr-x--- 2 root hostops 4096 '+action,'ops-inbox-mode');
    if(action===HOST_CRON_FILE&&ops.schedule)return result('-rw-r--r-- 1 root root '+(HOST_CRON_LINE.length+1)+' '+action,'ops-schedule-mode');
  }
  if(command==='cat'&&args.length===1){
    if(action===HOST_CRON_TEMPLATE||action===HOST_CRON_FILE&&ops.schedule)return result(HOST_CRON_LINE+'\n','ops-schedule-read',{installed:action===HOST_CRON_FILE});
    if(action===HOST_REPORT_INPUT)return readable?result(JSON.stringify(HOST_CHECKS,null,2),'ops-input',{account:effectiveUser}):modelError('cat: '+action+': Permission denied','ops-input','permission');
    if(action===HOST_REPORT_RESULT&&ops.latest)return result(JSON.stringify(ops.latest,null,2),'ops-artifact',{artifact:{...ops.latest}});
  }
  if((command==='tail'||command==='cat')&&action===HOST_REPORT_LOG){
    const limit=Number(opts['-n']||10);
    if(command==='tail'&&(!Number.isInteger(limit)||limit<0))return modelError('tail: invalid number of lines','ops-job-log','arguments');
    const entries=command==='cat'?ops.log:limit?ops.log.slice(-limit):[];
    return result(entries.map(entry=>entry.message).join('\n'),'ops-job-log',{entries:entries.map(entry=>({...entry})),scheduled:entries.findLast(entry=>entry.source==='cron'&&entry.boot===machine.boot&&entry.exitCode===0)?.scheduledAt});
  }
  if(['ls','cat'].includes(command)&&paths.includes(action))return modelError(command+': cannot access '+action+': No such file or unsupported view','ops-file','unavailable');
  return modelError(command+': unsupported action or target in the host work order','ops-command','arguments');
}
