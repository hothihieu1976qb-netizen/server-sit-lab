'use strict';

const reportRun='sudo -u reportbot '+HOST_REPORT_SCRIPT;
const scheduleInstall='sudo install -o root -g root -m 0644 '+HOST_CRON_TEMPLATE+' '+HOST_CRON_FILE;
const hostOpsFind=(events,kind,match=()=>true)=>events.findLast(event=>event.kind===kind&&!event.pipeline&&match(event));
const hostOpsSaw=(kind,match=event=>!event.failed)=>({events})=>Boolean(hostOpsFind(events,kind,match));

function hostOpsAcceptance(machine,events){
  const {boot,ops}=machine;
  const current=events.filter(event=>event.boot===boot);
  const find=(kind,match=()=>true)=>hostOpsFind(current,kind,event=>!event.failed&&match(event));
  const reboot=find('reboot',event=>event.fromBoot<boot);
  const enabled=find('ops-cron-status',event=>event.enabled&&['status','is-enabled'].includes(event.action));
  const active=find('ops-cron-status',event=>event.active&&['status','is-active'].includes(event.action));
  const latest=ops.latest?.source==='cron'&&ops.latest.boot===boot?ops.latest:null;
  const row=(label,...records)=>({label,status:records.every(Boolean)?'PASS':'NOT RUN',refs:records.every(Boolean)?[...new Set(records.map(event=>event.seq))]:[]});
  return [
    row('执行模拟重启并进入新启动轮次',reboot),
    row('reportbot 补充组 hostops 在重启后仍保留',reboot,ops.groupMember&&find('ops-account',event=>event.groupMember)),
    row('jq 软件包在重启后仍可由 RPM 查询',reboot,ops.packageInstalled&&find('ops-package-query',event=>event.installed)),
    row('crond 已开机启用、本次随系统启动且仍在运行',reboot,ops.autoStartedBoot===boot&&ops.enabled&&enabled,ops.active&&active),
    row('系统计划仍在 /etc/cron.d，权限符合模板约定',reboot,ops.schedule&&find('ops-schedule-read',event=>event.installed),find('ops-schedule-mode')),
    row('本次启动的 cron 派发、脚本退出 0 和新报告相符',reboot,latest&&find('ops-cron-log',event=>event.current&&event.dispatchedAt===latest.generatedAt),latest&&find('ops-job-log',event=>event.scheduled===latest.generatedAt),latest&&find('ops-artifact',event=>event.artifact.source==='cron'&&event.artifact.generatedAt===latest.generatedAt))
  ];
}

const HOST_OPS_COURSE={
  id:'linux-host-ops',track:'linux',group:'主机日常运维',level:'基础',title:'接管维护主机：恢复每日巡检任务',
  description:'检查服务账号与权限、软件来源、开机启动和调度，重启验收后交付巡检证据。',
  initial:{workload:'host-ops'},
  workOrder:{id:'OPS-002',role:'Linux 运维接班工程师',service:'每日 02:15 UTC 主机巡检汇总',
    hosts:[['A · 巡检主机',LAB_LOCAL,'上一班保留了服务账号、巡检脚本及审核过的计划模板；每日巡检报告尚未上线。']],
    acceptance:'仅追加报告账号需要的读权限，使用已批准的软件源，保持现有目录权限。重启后核对账号组、软件包和计划，取得本次启动自动产出的报告。',
    fields:[['baseline','接管前状态','记录账号组、输入目录、软件包和 crond 的初始状态。'],['changes','变更内容与边界','说明补充组、软件来源、启动配置和计划文件，哪些权限没有改变？'],['verification','重启后验证','说明如何对照派发日志、脚本结果和报告来源；引用命令记录编号。'],['followup','后续检查','下一班应检查哪些失败信号？出现无新报告时先看哪一层？']],
    rows:(run,events)=>hostOpsAcceptance(run.machine,events)},
  recap:'你已完成初级运维的主机接管和重启验收。交接清单保存分项结论、命令执行编号和实际输出。',
  steps:[
    {
      title:'核对接管前的状态',goal:'调查缺失的每日巡检报告。先记录主机、账号、输入目录、依赖软件与调度服务设置。',
      concept:'账号已存在、计划执行权限、依赖已安装、服务开机启动是不同层面的条件。先保留现状再修改。',
      commands:['hostnamectl','id reportbot','ls -ld '+HOST_REPORT_INBOX,'rpm -q jq','systemctl is-enabled crond'],
      checks:[['主机、reportbot 组与目录权限',context=>hostOpsSaw('hostname')(context)&&hostOpsSaw('ops-account',event=>!event.groupMember)(context)&&hostOpsSaw('ops-inbox-mode')(context)],
        ['确认 jq 未安装、crond 未设置开机启用',context=>hostOpsSaw('ops-package-query',event=>event.failed&&!event.installed)(context)&&hostOpsSaw('ops-cron-status',event=>event.action==='is-enabled'&&!event.enabled)(context)]],
      question:'rpm -q jq 提示 not installed，代表什么？',choices:['本机 RPM 库里没有这个已安装的包','说明软件源一定没有 jq','说明 cron 文件是空的'],answer:0,
      feedback:'已安装状态与仓库可用性是两回事，后续再查软件来源。',
      example:['看权限先分三类','目录长格式以 drwxr-x--- 开头，随后是属主和属组。','属组成员可以列目录和经过目录，其他用户没有权限。','用 id 确认实际运行账号在哪些组。']
    },{
      title:'按最小权限恢复读取',goal:'使用巡检的服务账号试跑，抓到具体的权限错误，再让该账号加入获准的只读组。',
      concept:'本工单的输入目录对组提供 r-x，输入文件对组提供 r。目录的 x 允许经过目录。补充组变更应由新进程复核。',
      commands:[reportRun,'sudo usermod -aG hostops reportbot','id reportbot','getent group hostops','sudo -u reportbot cat '+HOST_REPORT_INPUT],
      checks:[['服务账号试跑捕获 Permission denied',hostOpsSaw('ops-collect',event=>event.failed&&event.reason==='permission')],['已追加组且核对新身份和输入读取',context=>hostOpsSaw('ops-account-change')(context)&&hostOpsSaw('ops-account',event=>event.groupMember)(context)&&hostOpsSaw('ops-input',event=>!event.failed&&event.account==='reportbot')(context)]],
      question:'为什么用 usermod -aG 追加组？',choices:['让所有用户都可读输入','保留原有补充组，只补上获准的访问','把 reportbot 提升为 root'],answer:1,
      feedback:'给运行账号增加必要访问，并用新进程验证；不放宽整个目录。',
      example:['先确认失败层次','程序读取配置时返回 Permission denied。','错误出现在打开输入的时候，暂时不能据此判断依赖程序是否可用。','先核对当前组和目标权限，再用原账号重试。']
    },{
      title:'查软件来源并手工试跑',goal:'确认 jq 来自批准的仓库，安装后用 RPM 查询，并检查手工试跑生成的 JSON。',
      concept:'DNF 查候选和安装来源，RPM 查本机；运行命令没有报错还需检查产物。这里的软件源和安装事务是内置模拟。',
      commands:['dnf info jq','sudo dnf install jq','rpm -q jq',reportRun,'cat '+HOST_REPORT_RESULT],
      checks:[['核对仓库、安装成功并确认已安装版本',context=>hostOpsSaw('ops-package-repo')(context)&&hostOpsSaw('ops-package-install')(context)&&hostOpsSaw('ops-package-query',event=>event.installed)(context)],
        ['以 reportbot 试跑成功并读到手工生成的 JSON',context=>hostOpsSaw('ops-collect',event=>!event.failed&&event.source==='manual')(context)&&hostOpsSaw('ops-artifact',event=>event.artifact.source==='manual')(context)]],
      question:'latest.json 显示 source 为 manual，能得出什么结论？',choices:['每天 02:15 已经运行并通过','证明 crond 正在运行','手工试跑能生成报告，还需要验证调度'],answer:2,
      feedback:'手工试跑建立脚本基线；计划运行和重启后验证还没开始。',
      example:['来源不等于已安装','仓库查询显示 Available Packages，RPM 查询可能仍提示未安装。','软件存在于批准仓库，不代表当前主机已有依赖。','安装后用 rpm -q 确认，并验证脚本产物。']
    },{
      title:'启动调度服务并设置开机启用',goal:'先启动 crond，比较当前运行与开机启用，再保存启用状态并看本次启动的系统日志。',
      concept:'start 使服务现在运行；enable 决定今后启动时是否拉起该服务。enable --now 同时启用和启动，本步分开操作以观察差异。',
      commands:['sudo systemctl start crond','systemctl is-active crond','systemctl is-enabled crond','sudo systemctl enable crond','systemctl status crond','journalctl -u crond -b'],
      checks:[['在开机启用前观察到服务已运行',context=>hostOpsSaw('ops-cron-status',event=>event.action==='is-active'&&event.active&&!event.enabled)(context)&&hostOpsSaw('ops-cron-status',event=>event.action==='is-enabled'&&event.active&&!event.enabled)(context)],
        ['已启用开机启动且本次服务启动有日志',context=>context.machine.ops.enabled&&context.machine.ops.active&&hostOpsSaw('ops-cron-change',event=>event.action==='enable'&&event.enabled)(context)&&hostOpsSaw('ops-cron-log',event=>event.current&&event.started)(context)]],
      question:'is-active 是 active，但 is-enabled 是 disabled，意味着什么？',choices:['现在在运行，但未设置正常开机自动启动','服务已经失败','启用会立即停止服务'],answer:0,
      feedback:'分别记录当前运行和下次启动。启用后还要通过实际重启复查。',
      example:['读两类状态','systemctl status 的 Loaded 行可见启用状态，Active 行显示当前运行状态。','它们可同时是 disabled 和 active。','配合 -u crond -b 看当前启动中是否出现启动记录。']
    },{
      title:'安装和核对每日计划',goal:'读已审核的计划模板，安装到系统的 cron.d，核对运行账号、时间、属主与权限。',
      concept:'系统计划行比用户自己的 crontab 多一个运行账号字段。此机使用 UTC。使用绝对路径能减少交互终端和计划环境的差异。',
      commands:['cat '+HOST_CRON_TEMPLATE,scheduleInstall,'cat '+HOST_CRON_FILE,'ls -l '+HOST_CRON_FILE],
      checks:[['查看模板并安装到正确目标',context=>hostOpsSaw('ops-schedule-read',event=>!event.installed)(context)&&hostOpsSaw('ops-schedule-install')(context)],
        ['读取已安装配置并复查属主与权限',context=>hostOpsSaw('ops-schedule-read',event=>event.installed)(context)&&hostOpsSaw('ops-schedule-mode')(context)]],
      question:'15 2 * * * reportbot … 在 /etc/cron.d 里表示什么？',choices:['每 15 分钟运行一次','系统时区内每天 02:15，以 reportbot 执行','每天 15:02，以 root 执行'],answer:1,
      feedback:'配置已安装。下一步要验证重启后，计划确实按时生成报告。',
      example:['按字段读计划','15 2 * * * reportbot /绝对路径','前五列依次是分、时、日、月、星期。随后是运行账号和命令。','核对系统时区，再对照派发时间和产物。']
    },{
      title:'重启验收并交接',goal:'重启模拟机，核对账号组、包、调度服务和计划文件仍然有效。推进时钟到下次触发点，取得本次启动的派发日志、脚本结果和新报告。',
      concept:'crond 派发并不保证脚本成功。用本次启动的日志、脚本退出码和 JSON 的生成时间与来源，证明这次计划实际完成。sim next-cron 只推进工单时钟，不需要等待现实时间。',
      commands:['sudo reboot','id reportbot','rpm -q jq','systemctl status crond','cat '+HOST_CRON_FILE,'ls -l '+HOST_CRON_FILE,'date','sim next-cron','journalctl -u crond -b','tail -n 6 '+HOST_REPORT_LOG,'cat '+HOST_REPORT_RESULT],
      evaluate:({events,machine})=>hostOpsAcceptance(machine,events).map(row=>[row.status==='PASS',row.label]),
      question:'哪组证据足以通过计划任务验收？',choices:['看到配置文件存在即可','只看 crond 的 CMD 记录','本次启动已派发，脚本退出 0，且报告来源、时间和启动轮次匹配'],answer:2,
      feedback:'本机任务已在重启后按计划执行。交接时保留环境、变更、结果和下一班观察点。',handoff:true,
      example:['证据指向同一次运行','日志显示 CMD、脚本状态为 exit=0、报告显示 source=cron。','核对时间和启动轮次后，才能排除留存的旧报告或手工试跑。','若只有派发日志而没有新产物，继续查脚本日志和服务账号权限。']
    }
  ]
};
