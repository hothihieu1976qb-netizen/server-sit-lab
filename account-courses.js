'use strict';

Object.assign(LINUX_CONCEPTS,{
  credentials:['账号资料与进程身份','id reportbot 查询账号资料。只输入 id 查询当前进程继承的用户和组；运行中的旧会话不会自动获得后来追加的组。','本课 sim session reportbot 打开一个模拟会话并记录当时的组。sudo -u reportbot id 启动一次新命令，用它核对新的有效身份。'],
  supplementary:['主组与补充组','主组与补充组都可以参与普通属组权限判断。usermod -aG 追加补充组，-G 后给出目标组，-a 保留原来的补充组。','本课 reportbot 原有 auditlog 组。获准加入 hostops 后应同时看到 auditlog 和 hostops，再用新进程实际读取验证。'],
  traversal:['目录的列举与经过','目录的 r 可以列举名字，x 允许按名字查找目录里的条目。读取一个已知文件仍需经过父目录。','组权限 r-- 时，可能看到 checks.json 的名字，却无法打开它。ls -ld 看目录本身，再核对文件权限。'],
  filemode:['权限位与访问类别','普通权限按属主、属组、其他用户三类选择对应权限。每类用 r=4、w=2、x=1 相加表示。','0750 是属主 rwx、属组 r-x、其他 ---。0640 是属主 rw-、属组 r--、其他 ---。chmod g+x 只追加属组的 x。真实现场还需考虑 ACL、SELinux、挂载等因素。'],
  createaccess:['创建条目与修改文件','在目录中新建文件需要目录的写和经过权限。已有文件的内容权限是另一层。目录可写不代表里面的每个已有文件都可修改。','本课输出目录原为 0750，获准改为 0770 后组成员可以创建。创建文件使用课内固定 umask 0027，属主和主组来自创建账号。'],
  leastaccess:['最小权限与反向验证','先说明哪个账号需要对哪个对象进行什么操作，再修改必要的权限或组。验证获准账号成功，也验证无关账号仍被拒绝。','本课管理员的管理命令已预授权。真实 sudo 由系统策略控制。只需读输入时，保留输入目录和文件的其他用户权限为零，输出目录也按工单范围处理。']
});
function accountSaw(kind,match=()=>true,live=false){
  return ({events,machine})=>events.some(e=>e.kind===kind&&!e.failed&&!e.pipeline&&(!live||e.accountRevision===machine.accounts.revision)&&match(e));
}
function accountDenied(target,layer,account='reportbot',live=false){
  return ({events,machine})=>events.some(e=>e.failed&&!e.pipeline&&e.reason==='permission'&&e.target===target&&e.account===account&&(!layer||e.layer===layer)&&(!live||e.accountRevision===machine.accounts.revision));
}

const ACCOUNT_COURSES=[
  {id:'linux-account-identity',track:'linux',group:'账号与最小权限',level:'基础',title:'账号加组后，为什么仍然读不到',
   description:'给巡检账号增加获准的读取权限，比较账号资料、旧会话与新命令，并复测无关账号。',
   initial:{workload:'host-ops',accountTraining:'identity'},
   recap:'你能分清账号资料和进程的有效组，追加获准的组后用新进程验证，并保留原有补充组。',
   steps:[
     {title:'核对谁在读取什么',goal:'先核对当前操作账号，再查 reportbot 与 hostops。查看输入目录，并通过预授权的 sudo 查看文件权限，最后以 reportbot 打开 checks.json，保留失败现场。',
      knowledge:['identity','supplementary','filemode','leastaccess'],concept:'操作终端的账号与脚本执行账号可能不同。用实际执行账号验证目标访问。',
      commands:['whoami','id','id reportbot','getent group hostops','ls -ld '+HOST_REPORT_INBOX,'sudo ls -l '+HOST_REPORT_INPUT,'sudo -u reportbot cat '+HOST_REPORT_INPUT],
      checks:[['核对当前身份、服务账号资料和组',c=>accountSaw('account-identity',e=>e.account==='student'&&e.identitySource==='process')(c)&&accountSaw('account-identity',e=>e.queried==='reportbot'&&e.identitySource==='database'&&!e.members.includes('hostops'))(c)&&accountSaw('account-group',e=>e.group==='hostops'&&!e.member)(c)],
        ['记录目录与文件权限及目标账号的失败',c=>accountSaw('account-list',e=>e.target===HOST_REPORT_INBOX&&e.mode==='0750')(c)&&accountSaw('account-list',e=>e.target===HOST_REPORT_INPUT&&e.mode==='0640')(c)&&accountDenied(HOST_REPORT_INPUT,'directory-search')(c)]],
      question:'student 能执行命令，为什么还需要用 reportbot 试读？',choices:['sudo -u 会修改文件属主','真实运行账号的组和访问权限需要单独核对','用户名不同就必须重装软件'],answer:1,feedback:'记录 reportbot 的有效身份和读取结果，才能判断运行账号是否有需要的访问。',
      example:['从执行者出发','某任务由 svc-runner 执行，管理员在自己的终端可以读取输入。','管理员的成功不能自动证明服务账号也能读取。','用获准的方式以服务账号复测。']},
     {title:'比较旧会话与新进程',goal:'先打开 reportbot 的模拟会话，再以管理员追加 hostops。对比 id、id reportbot 与 sudo -u reportbot id。用新命令成功读取后，验证 guest 仍被拒绝，最后回到 student 会话。',
      knowledge:['credentials','supplementary','leastaccess'],concept:'本课 sim session 是模拟会话辅助动作。每次 sudo -u 执行一条新命令；旧会话的组快照继续保留。',
      commands:['sim session reportbot','id','sudo usermod -aG hostops reportbot','id','id reportbot','sudo -u reportbot id','sudo -u reportbot cat '+HOST_REPORT_INPUT,'sudo -u guest cat '+HOST_REPORT_INPUT,'sim session student'],
      checks:[['旧会话仍保留原组，账号资料已追加组',c=>c.events.some(e=>e.kind==='account-identity'&&e.account==='reportbot'&&e.identitySource==='process'&&!e.members.includes('hostops')&&c.events.some(change=>change.kind==='ops-account-change'&&!change.failed&&change.seq<e.seq))&&accountSaw('account-identity',e=>e.queried==='reportbot'&&e.identitySource==='database'&&e.members.includes('hostops')&&e.members.includes('auditlog'))(c)],
        ['新进程获得组并读取成功，无关账号被拒绝',c=>accountSaw('account-identity',e=>e.account==='reportbot'&&e.identitySource==='process'&&e.members.includes('hostops'))(c)&&accountSaw('account-read',e=>e.account==='reportbot'&&e.target===HOST_REPORT_INPUT)(c)&&accountDenied(HOST_REPORT_INPUT,null,'guest')(c)&&c.machine.accounts.sessionUser==='student']],
      question:'id reportbot 有 hostops，旧会话的 id 没有，下一步应怎样验证？',choices:['立即放开所有用户权限','把配置文件改成可执行','用新的有效身份执行命令，核对组并试读'],answer:2,feedback:'账号资料、进程身份和访问结果分别取证。重新登录也是实际环境中常用的验证方式。',
      example:['比较两个来源','id 显示旧进程的组；id runner 显示账号的新组。','两条输出查询的来源不同。','启动新进程或新会话，确认实际访问结果。']}
   ]},
  {id:'linux-directory-access',track:'linux',group:'账号与最小权限',level:'基础',title:'读文件、经过目录与创建文件',initial:{workload:'host-ops',accountTraining:'permissions'},
   description:'服务账号已在获准组里。通过受控变更观察目录 x、文件 r 与目录写权限分别控制什么。',
   recap:'你已经用实际操作区分目录搜索、文件读取和新建条目，能在批准范围内修改权限并做正反验证。',
   steps:[
     {title:'看得到名字，为什么打不开',goal:'本课允许暂时移除输入目录的属组 x。对比目录列举与文件读取，再恢复原权限并用 reportbot 读回。',
      knowledge:['traversal','filemode'],concept:'本课上级目录可经过。把输入目录的组权限从 r-x 暂改为 r--，只观察这一处变化。',
      commands:['id reportbot','ls -ld '+HOST_REPORT_INBOX,'sudo chmod g-x '+HOST_REPORT_INBOX,'sudo -u reportbot ls '+HOST_REPORT_INBOX,'sudo -u reportbot cat '+HOST_REPORT_INPUT,'sudo chmod g+x '+HOST_REPORT_INBOX,'ls -ld '+HOST_REPORT_INBOX,'sudo -u reportbot cat '+HOST_REPORT_INPUT],
      checks:[['移除 x 后看到名字，同时捕获经过失败',c=>accountSaw('account-list',e=>e.account==='reportbot'&&e.names?.includes('checks.json'))(c)&&accountDenied(HOST_REPORT_INPUT,'directory-search')(c)],
        ['恢复 0750 并以目标账号成功读取',c=>c.machine.accounts.modes[HOST_REPORT_INBOX]==='0750'&&accountSaw('account-list',e=>e.target===HOST_REPORT_INBOX&&e.mode==='0750',true)(c)&&accountSaw('account-read',e=>e.account==='reportbot',true)(c)]],
      question:'文件名能列出，却提示 Permission denied，哪项需要继续检查？',choices:['路径上各目录的搜索权限，以及文件自己的权限','只看硬盘容量','把文件扩展名去掉'],answer:0,feedback:'列举目录内容和按名字打开文件需要的权限条件不同。',
      example:['目录与文件分开','目录组权限 r--，文件组权限 r--。','列出名字后，仍可能无法经过该目录打开文件。','结合账号组，逐层验证目录和文件。']},
     {title:'目录恢复后仍要核对文件',goal:'暂时移除 checks.json 的属组 r，读取并保留失败结果。核对目录仍为 0750，再恢复文件 0640 并成功读取。',
      knowledge:['filemode','traversal'],concept:'目录允许经过后，文件本身仍要允许相应账号读取。',
      commands:['sudo chmod g-r '+HOST_REPORT_INPUT,'ls -ld '+HOST_REPORT_INBOX,'sudo ls -l '+HOST_REPORT_INPUT,'sudo -u reportbot cat '+HOST_REPORT_INPUT,'sudo chmod g+r '+HOST_REPORT_INPUT,'sudo ls -l '+HOST_REPORT_INPUT,'sudo -u reportbot cat '+HOST_REPORT_INPUT],
      checks:[['在目录可经过时捕获文件读取失败',c=>accountDenied(HOST_REPORT_INPUT,'file-read')(c)&&accountSaw('account-list',e=>e.target===HOST_REPORT_INBOX&&e.mode==='0750')(c)],
        ['恢复文件 0640 后读取成功',c=>c.machine.accounts.modes[HOST_REPORT_INPUT]==='0640'&&accountSaw('account-list',e=>e.target===HOST_REPORT_INPUT&&e.mode==='0640',true)(c)&&accountSaw('account-read',e=>e.account==='reportbot',true)(c)]],
      question:'chmod g+r checks.json 修改了哪一类权限？',choices:['所有目录的权限','属组对该文件的读取权限','服务的运行账号'],answer:1,feedback:'g 选择属组，+r 追加读取位；目标是这一个文件。',
      example:['八进制的每一位','0640：属主 6=4+2，属组 4，其他 0。','属组能读取文件内容。','把权限位与实际账号所属组对应。']},
     {title:'只给输出目录所需的写权限',goal:'获准让 hostops 成员在 outbox 创建文件。先保存被拒绝的结果，再追加属组 w，创建 proof.txt 并核对属主。guest 创建同一文件应被拒绝。',
      knowledge:['createaccess','leastaccess'],concept:'此目录无 setgid 位。本课固定 umask 为 0027，新文件的属主和主组来自创建账号。',
      commands:['ls -ld '+ACCOUNT_OUTBOX,'sudo -u reportbot touch '+ACCOUNT_PROBE,'sudo chmod g+w '+ACCOUNT_OUTBOX,'sudo -u reportbot touch '+ACCOUNT_PROBE,'ls -ld '+ACCOUNT_OUTBOX,'sudo ls -l '+ACCOUNT_PROBE,'sudo -u guest touch '+ACCOUNT_PROBE],
      checks:[['记录目录没有写权限时的创建失败',accountDenied(ACCOUNT_PROBE,'directory-write')],
        ['目录为 0770，目标账号创建并核对归属',c=>c.machine.accounts.modes[ACCOUNT_OUTBOX]==='0770'&&accountSaw('account-create',e=>e.account==='reportbot'&&e.created,true)(c)&&accountSaw('account-list',e=>e.target===ACCOUNT_PROBE&&e.owner==='reportbot'&&e.group==='reportbot',true)(c)],
        ['无关账号仍不能创建或修改',accountDenied(ACCOUNT_PROBE,null,'guest',true)]],
      question:'为什么此处采用 g+w，而不直接给其他用户写权限？',choices:['目录的 w 永远无效','所有目录都应该 0777','工单只要求获准组创建，其他用户没有这个需求'],answer:2,feedback:'让授权与工作目标对应，并保留目标账号成功和无关账号失败的结果。',
      example:['定义授权对象','获准组可以在某个输出目录创建，其他用户仍无访问。','授权范围包括账号、目录和具体操作。','用两类账号分别复测，核对文件归属。']}
   ]},
  {id:'linux-access-handoff',track:'linux',group:'账号与最小权限',level:'基础',title:'独立验收：让巡检账号只读输入',initial:{workload:'host-ops',accountTraining:'assessment'},
   description:'新主机同时存在组成员和路径访问问题。按获准范围恢复读取，交付正向与反向证据。',
   recap:'你完成了只读授权交接，可继续进入主机巡检工单，处理依赖、服务、调度和重启验收。',
   steps:[{title:'独立恢复并核对授权边界',independent:true,goal:'reportbot 需要读取 /srv/host-report/inbox/checks.json。先记录当前账号资料、目录与文件权限及读取失败，再以最小变更修复。保留原有 auditlog 补充组；输入目录最终应为属主 rwx、属组 r-x、其他无权限，输入文件保持属主 rw-、属组 r--、其他无权限。输出目录仍只允许组读取和经过。最后以 reportbot 成功读取，并以 guest 验证无关账号仍被拒绝。可使用预授权的 sudo 管理与查看；不要运行巡检脚本。',
     checks:[['记录授权前状态和失败',({events})=>events.some(e=>e.kind==='account-identity'&&e.identitySource==='database'&&e.queried==='reportbot'&&!e.members.includes('hostops'))&&events.some(e=>e.kind==='account-list'&&e.target===HOST_REPORT_INBOX&&e.mode==='0740')&&events.some(e=>e.kind==='account-read'&&e.account==='reportbot'&&e.failed)],
       ['当前账号组和权限符合授权范围',c=>c.machine.ops.groupMember&&c.machine.accounts.modes[HOST_REPORT_INBOX]==='0750'&&c.machine.accounts.modes[HOST_REPORT_INPUT]==='0640'&&c.machine.accounts.modes[ACCOUNT_OUTBOX]==='0750'&&accountSaw('account-identity',e=>e.queried==='reportbot'&&e.members.includes('auditlog')&&e.members.includes('hostops'),true)(c)&&[HOST_REPORT_INBOX,HOST_REPORT_INPUT,ACCOUNT_OUTBOX].every(path=>accountSaw('account-list',e=>e.target===path,true)(c))],
       ['用新进程成功读取，guest 仍被拒绝',c=>accountSaw('account-read',e=>e.account==='reportbot'&&e.target===HOST_REPORT_INPUT,true)(c)&&accountDenied(HOST_REPORT_INPUT,null,'guest',true)(c)]],
     readings:[['group','输入目录的属组',()=> 'hostops'],['directory','输入目录的四位八进制权限',()=> '0750'],['file','输入文件的四位八进制权限',()=> '0640'],['original','保留的原补充组',()=> 'auditlog']],
     question:'哪项交接结论符合本轮任务？',choices:['读取成功后所有权限都应继续放开','保留原组并补充获准组、修复经过权限，正反验证已取得；巡检流程仍需继续验收','只要账号资料里有 hostops 就证明任务已运行'],answer:1,feedback:'账号能读取是后续巡检工作的一个前置条件。继续验证依赖、脚本、服务与调度。'}
   ]}
];
