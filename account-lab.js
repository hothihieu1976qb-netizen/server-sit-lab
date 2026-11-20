'use strict';

const ACCOUNT_OUTBOX='/srv/host-report/outbox';
const ACCOUNT_PROBE=ACCOUNT_OUTBOX+'/proof.txt';
const ACCOUNT_IDS={student:1000,reportbot:990,guest:1001,root:0};
const ACCOUNT_GROUP_IDS={student:1000,reportbot:990,guest:1001,root:0,sitqa:2000,hostops:2001,auditlog:2002};

COMMAND_SPECS.chmod={purpose:'修改课程中指定文件或目录的权限位。',positional:'第一个参数是权限模式，第二个是目标路径。本参数为 {v}。',fields:[['result','.+','成功通常没有输出，重新 ls 并用目标账号操作验证。']],memory:'改前记录，按需授权，用原账号复测。'};
COMMAND_TEACHING.chmod=['改变指定对象的权限位。','文件的 r/w/x 与目录的 r/w/x 作用不同。真实系统还可能有 ACL、只读挂载等限制。','用 ls -ld 看目录、ls -l 看文件，再用实际账号复测。'];
COMMAND_KB.push(['权限','sudo chmod g+x /srv/host-report/inbox','为目录属组增加经过权限','账号与最小权限课提供独立的虚拟目录。','g 选择属组，+x 追加目录搜索权限。','','为什么文件可读但仍打不开？','linux-directory-access']);
COMMAND_KB.push(
  ['账号','id reportbot','查询服务账号资料','与当前进程的 id 输出分开记录。','显示该账号的主组及补充组。','uid=990(reportbot) gid=990(reportbot) groups=990(reportbot),2002(auditlog)','账号资料与旧会话为何可能不同？','linux-account-identity'],
  ['账号','sudo -u reportbot id','核对新命令的有效身份','在新进程中验证追加组的效果。','-u 指定本次命令的执行账号。','uid=990(reportbot) gid=990(reportbot) groups=990(reportbot),2002(auditlog),2001(hostops)','还需要怎样验证实际读取？','linux-account-identity']
);

function accountGroups(machine,user){
  if(user==='reportbot')return ['reportbot','auditlog',...(machine.ops.groupMember?['hostops']:[])];
  return user==='student'?['student','sitqa']:[user];
}
function initializeAccountLab(machine,variant){
  machine.accounts={revision:0,sessionUser:'student',sessionGroups:['student','sitqa'],
    modes:{[HOST_REPORT_INBOX]:variant==='assessment'?'0740':'0750',[HOST_REPORT_INPUT]:'0640',[ACCOUNT_OUTBOX]:'0750'}};
  machine.ops.groupMember=variant==='permissions';
}
function accountModeText(mode){
  return [...mode.slice(-3)].map(digit=>{const n=Number(digit);return (n&4?'r':'-')+(n&2?'w':'-')+(n&1?'x':'-');}).join('');
}
function accountPermission(mode,owner,group,user,groups,bit){
  if(user==='root')return true;
  const index=user===owner?0:groups.includes(group)?1:2;
  return Boolean(Number(mode.slice(-3)[index])&bit);
}
function runAccountLabCommand(machine,segment){
  if(!machine.accounts)return null;
  const state=machine.accounts,{command,positionals:a,opts}=segment;
  if(segment.fromB)return modelError(command+': account exercise is on host A','account-command','unavailable');
  const explicit=segment.input[0]==='sudo';
  const user=explicit?segment.effectiveUser:state.sessionUser;
  const groups=explicit?accountGroups(machine,user):state.sessionGroups;
  const result=(output,kind,extra={})=>modelResult(output,kind,{account:user,groups:[...groups],accountRevision:state.revision,...extra});
  const denied=(kind,path,layer)=>({...modelError(command+': '+path+': Permission denied',kind,'permission',1),account:user,groups:[...groups],target:path,layer,accountRevision:state.revision});
  const isDirectory=path=>[HOST_REPORT_INBOX,ACCOUNT_OUTBOX].includes(path);
  const access=(path,bit)=>accountPermission(state.modes[path], 'root','hostops',user,groups,bit);
  if(command==='sim'&&a[0]==='session'){
    if(a.length!==2||!['student','reportbot','guest'].includes(a[1]))return modelError('sim session student|reportbot|guest','account-session','arguments');
    state.sessionUser=a[1];state.sessionGroups=accountGroups(machine,a[1]);state.revision++;
    return result('Opened simulated session for '+a[1],'account-session',{sessionUser:a[1],sessionGroups:[...state.sessionGroups]});
  }
  if(command==='whoami')return result(user,'account-identity',{identitySource:'process'});
  if(command==='id'){
    const queried=a[0]||user;
    if(a.length>1||!Object.hasOwn(ACCOUNT_IDS,queried))return modelError('id: unknown account','account-identity','arguments');
    const named=a.length===1,members=named?accountGroups(machine,queried):groups;
    return result('uid='+ACCOUNT_IDS[queried]+'('+queried+') gid='+ACCOUNT_IDS[queried]+'('+queried+') groups='+members.map(g=>ACCOUNT_GROUP_IDS[g]+'('+g+')').join(','),'account-identity',{queried,identitySource:named?'database':'process',members:[...members]});
  }
  if(command==='getent'&&a[0]==='group'&&a.length===2){
    const group=a[1];
    if(!Object.hasOwn(ACCOUNT_GROUP_IDS,group))return modelError('getent: group not found','account-group','no-group',2);
    const member=group==='hostops'?(machine.ops.groupMember?'reportbot':''):group==='auditlog'?'reportbot':'';
    return result(group+':x:'+ACCOUNT_GROUP_IDS[group]+':'+member,'account-group',{group,member});
  }
  if(command==='usermod'){
    const before=machine.ops.groupMember;
    const changed=runHostOpsCommand(machine,segment);
    if(!changed.failed&&machine.ops.groupMember!==before)state.revision++;
    return {...changed,accountRevision:state.revision};
  }
  if(command==='chmod'){
    const [mode,path]=a;
    if(a.length!==2||!state.modes[path])return modelError('chmod: supported targets are inbox, checks.json and outbox','account-mode','arguments');
    if(user!=='root')return denied('account-mode',path,'owner');
    let next;
    if(/^0?[0-7]{3}$/.test(mode))next=mode.padStart(4,'0');
    else if(/^g[+-][rwx]$/.test(mode)){
      const bit={r:4,w:2,x:1}[mode[2]],old=Number(state.modes[path][2]);
      next=state.modes[path].slice(0,2)+String(mode[1]==='+'?old|bit:old&~bit)+state.modes[path][3];
    }else return modelError('chmod: supported modes are 0000..0777 and g+/-r,w,x','account-mode','arguments');
    const previous=state.modes[path];state.modes[path]=next;state.revision++;
    return result('','account-mode',{target:path,previous,mode:next});
  }
  if(command==='ls'&&(state.modes[a[0]]||a[0]===ACCOUNT_PROBE&&machine.files[a[0]])){
    const path=a[0],directory=isDirectory(path);
    if(a.length!==1)return modelError('ls: expected one exercise path','account-list','arguments');
    if(directory&&!opts['-d']){
      if(!access(path,4))return denied('account-list',path,'directory-read');
      if(opts['-l']&&!access(path,1))return denied('account-list',path,'directory-search');
      const names=path===HOST_REPORT_INBOX?['checks.json']:Object.keys(machine.files).filter(p=>p.startsWith(ACCOUNT_OUTBOX+'/')).map(p=>p.split('/').at(-1));
      return result(names.join('\n'),'account-list',{target:path,names});
    }
    const parent=path.slice(0,path.lastIndexOf('/'));
    if(!directory&&state.modes[parent]&&!access(parent,1))return denied('account-list',path,'directory-search');
    const f=machine.files[path],mode=state.modes[path]||f.mode;
    return result((directory?'d':'-')+accountModeText(mode)+' 1 '+(f?.owner||'root')+' '+(f?.group||'hostops')+' '+(directory?4096:128)+' '+path,'account-list',{target:path,mode,owner:f?.owner||'root',group:f?.group||'hostops'});
  }
  if(command==='cat'&&a.length===1&&(a[0]===HOST_REPORT_INPUT||a[0]===ACCOUNT_PROBE)){
    const path=a[0],parent=path.slice(0,path.lastIndexOf('/'));
    if(!access(parent,1))return denied('account-read',path,'directory-search');
    const file=machine.files[path];
    if(path!==HOST_REPORT_INPUT&&!file)return modelError('cat: No such file','account-read','no-file',2);
    if(!accountPermission(state.modes[path]||file.mode,file?.owner||'root',file?.group||'hostops',user,groups,4))return denied('account-read',path,'file-read');
    return result(path===HOST_REPORT_INPUT?JSON.stringify(HOST_CHECKS,null,2):file.content,'account-read',{target:path});
  }
  if(command==='touch'&&a.length===1&&a[0]===ACCOUNT_PROBE){
    const old=machine.files[ACCOUNT_PROBE];
    if(!access(ACCOUNT_OUTBOX,1))return denied('account-create',ACCOUNT_PROBE,'directory-search');
    if(!old&&!access(ACCOUNT_OUTBOX,2))return denied('account-create',ACCOUNT_PROBE,'directory-write');
    if(old&&!accountPermission(old.mode,old.owner,old.group,user,groups,2))return denied('account-create',ACCOUNT_PROBE,'file-write');
    if(!old){
      createVirtualFile(machine,ACCOUNT_PROBE,0,'');
      Object.assign(machine.files[ACCOUNT_PROBE],{owner:user,group:user,mode:'0640'});
      state.revision++;
    }
    return result('','account-create',{target:ACCOUNT_PROBE,created:!old});
  }
  if(command===HOST_REPORT_SCRIPT){
    if(!access(HOST_REPORT_INBOX,1)||!access(HOST_REPORT_INPUT,4))return denied('ops-collect',HOST_REPORT_INPUT,'input-access');
  }
  return null;
}
