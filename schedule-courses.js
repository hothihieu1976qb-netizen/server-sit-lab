'use strict';

Object.assign(LINUX_CONCEPTS,{
  servicestates:['当前运行与开机启用','start 请求服务现在启动；enable 为正常开机流程建立启用关系。两者管理的是不同状态，enable 本身不启动服务。','is-active 查现在，is-enabled 查启用关系。对本课 crond，active + disabled 可以同时成立；enabled + inactive 也可以同时成立。其他真实服务还可能被依赖或手工启动。'],
  stopdisable:['停止、禁用与重启验证','stop 停止本次运行，不移除开机启用关系；disable 移除启用关系，不默认停止正在运行的服务。','enable --now 同时启用并启动。本课先分别操作，再模拟重启；用本次启动日志证明是否自动启动。禁用不是禁止任何方式启动。'],
  cronfields:['系统计划行的七个部分','/etc/cron.d 的一行依次是分、时、日、月、星期、执行账号、命令。前三个星号在这里分别允许任意日、月、星期。','15 2 * * * reportbot /opt/host-report/bin/collect 表示每天 02:15 以 reportbot 启动脚本。15 是分钟，2 是小时；不是每 15 分钟。用户自己的 crontab 没有额外账号列。'],
  crontime:['先确认时区和触发时间','本课时钟固定使用 UTC。初始 01:55，到当天 02:15 还差 20 分钟，也就是 1200 秒。','sim wait 只推进模拟时间；sim next-cron 跳到下一次每日 02:15。现实中不会自动加速，计划内容和系统时区也需分别确认。这里未模拟夏令时、补跑或复杂表达式。'],
  croninstall:['模板与实际生效的配置','/opt/host-report/host-report.cron 是审核过的源模板。只有安装到 /etc/cron.d/host-report 后，本课调度器才读取它。','install -o root -g root -m 0644 指定目标属主、属组和权限。读回目标内容，再 ls -l 核对；仅有源模板并不能证明任务已安排。'],
  dispatchproof:['派发、执行与产物三层证据','CROND 的 CMD 表示已启动任务；脚本自己的日志记录退出结果；报告记录实际生成的数据和来源。任务失败时，旧报告可能继续留在原路径。','把同一时刻的 CMD、source=cron 的脚本日志以及报告 generatedAt、boot、runId 对应。失败日志的 exit=127 是脚本结果，tail 命令自身仍可能读取成功。']
});

const SCHEDULE_COURSES=[
  {id:'linux-service-lifecycle',track:'linux',group:'服务与定时任务',level:'基础',title:'现在能运行，重启后还会运行吗',
   description:'亲自对比 start、enable、stop 和重启。把现在的运行状态与开机启用设置分开取证。',initial:{workload:'host-ops',scheduleTraining:'service'},
   recap:'你已能解释两类状态，并用实际重启和本次日志核对 crond 的自动启动。继续学习它怎样派发任务。',
   steps:[
     {title:'先启动，观察两类状态',goal:'本课账号权限和 jq 已准备好，只关注调度服务 crond。先查它的当前运行和开机启用状态；再启动服务，重新查询这两项。',
      knowledge:['process','servicestates'],concept:'crond 是按时启动任务的后台服务。“运行中”回答现在的状态，“开机启用”回答启动流程中的设置。',
      commands:['systemctl is-active crond','systemctl is-enabled crond','sudo systemctl start crond','systemctl is-active crond','systemctl is-enabled crond','systemctl status crond'],
      checks:[['先记录 inactive 与 disabled',c=>scheduleSaw('ops-cron-status',e=>e.action==='is-active'&&!e.active&&!e.enabled,false)(c)&&scheduleSaw('ops-cron-status',e=>e.action==='is-enabled'&&!e.active&&!e.enabled,false)(c)],
        ['启动后复测 active 与 disabled',c=>scheduleSaw('ops-cron-status',e=>e.action==='is-active'&&e.active&&!e.enabled)(c)&&scheduleSaw('ops-cron-status',e=>e.action==='is-enabled'&&e.active&&!e.enabled)(c)]],
      question:'start 后查询得到 active 和 disabled，说明什么？',choices:['现在已经运行，但尚未设置本课的正常开机自动启动','现在服务已经停止','下次启动一定会永久禁止该服务'],answer:0,feedback:'分别记录两类状态。下一步启用后停止服务，再用重启验证差别。',
      example:['先看一个小例子','一台练习机现在 active，启用设置为 disabled。','它可以被手工启动，所以当前运行与开机设置不矛盾。','使用自己的两次查询对照。']},
     {title:'启用后停止，再真正重启验证',goal:'设置 crond 开机启用，再 stop。查询并观察 enabled 与 inactive。随后模拟重启，重新查完整状态与本次启动日志。',
      knowledge:['servicestates','stopdisable','journal'],concept:'本课重启保留开机启用设置，并按照它启动 crond。停止当前进程不会删除这项设置。刷新页面只是续学，不是模拟重启。',
      commands:['sudo systemctl enable crond','sudo systemctl stop crond','systemctl is-enabled crond','systemctl is-active crond','sudo reboot','systemctl status crond','journalctl -u crond -b'],
      checks:[['重启前亲自观察 enabled 与 inactive',({events})=>events.some(e=>e.kind==='ops-cron-status'&&!e.pipeline&&!e.fromPeer&&e.action==='is-enabled'&&e.enabled&&!e.active)&&events.some(e=>e.kind==='ops-cron-status'&&!e.pipeline&&!e.fromPeer&&e.action==='is-active'&&e.enabled&&!e.active)],
        ['新启动已自动拉起，状态与当前日志相符',scheduleBootVerified]],
      readings:[['boot','模拟机当前启动轮次',m=>String(m.boot)]],
      question:'stop 后仍然 enabled，重启又 active，原因是什么？',choices:['stop 自动清空了全部计划','stop 只停止当前运行，启用设置在本次重启时重新拉起服务','浏览器刷新安装了新的 Linux 内核'],answer:1,feedback:'服务已随本次启动运行，还不能据此证明任何定时脚本成功。',
      example:['把操作与证据连起来','启用 → 停止 → enabled/inactive → 重启 → enabled/active。','两次状态查询分别描述各自时点。','在新的启动轮次读日志，避免拿上次记录证明这次启动。']}
   ]},
  {id:'linux-cron-evidence',track:'linux',group:'服务与定时任务',level:'基础',title:'计划派发了，为什么还是旧报告',
   description:'读懂每日计划的每一列。观察派发成功而脚本失败，恢复依赖后串起同一次执行的三层证据。',initial:{workload:'host-ops',scheduleTraining:'dispatch'},
   recap:'你能区分配置、派发和脚本结果，排除旧报告与手工试跑，再进入独立交接。',
   steps:[
     {title:'先读时间与模板，再安装计划',goal:'本课 crond 已启动并启用，reportbot 可读输入，但 jq 尚未安装，磁盘上留有旧手工报告。先看时间、状态和旧报告，再逐列读审核模板，安装到 cron.d 并核对内容、属主与权限。',
      knowledge:['crontime','cronfields','croninstall','freshartifact'],concept:'先保留现场。原模板位于 /opt，实际任务文件位于 /etc/cron.d。安装配置不会立刻生成报告。',
      commands:['date','systemctl status crond','cat '+HOST_REPORT_RESULT,'cat '+HOST_CRON_TEMPLATE,scheduleInstall,'cat '+HOST_CRON_FILE,'ls -l '+HOST_CRON_FILE],
      checks:[['记录时区、当前服务和旧手工产物',c=>scheduleSaw('ops-time',e=>!e.failed&&e.output.includes('UTC'),false)(c)&&scheduleSaw('ops-cron-status',e=>!e.failed&&e.active&&e.enabled,false)(c)&&scheduleSaw('ops-artifact',e=>!e.failed&&e.artifact.boot!==c.machine.boot&&e.artifact.source==='manual',false)(c)],
        ['模板已安装，并读回目标内容及权限',c=>scheduleSaw('ops-schedule-read',e=>!e.failed&&!e.installed,false)(c)&&scheduleSaw('ops-schedule-read',e=>!e.failed&&e.installed)(c)&&scheduleSaw('ops-schedule-mode',e=>!e.failed)(c)]],
      question:'/etc/cron.d 中的 15 2 * * * reportbot 告诉我们什么？',choices:['每 15 秒以 root 执行','按本课 UTC 每天 02:15 以 reportbot 执行','每天 15:02 启动浏览器'],answer:1,feedback:'配置就位，下一步观察触发后的实际执行。',
      example:['换个数字自己读','30 8 * * * analyst /opt/demo/check','每天 08:30，以 analyst 执行该绝对路径。','回到本课逐列读出 02:15 和 reportbot。']},
     {title:'保存派发成功、脚本失败的现场',goal:'用模拟时钟跳到下一次触发点。查本次启动的调度日志、脚本日志和依赖包，再读 latest.json：它有没有被这一次任务更新？',
      knowledge:['dispatchproof','dependencies','freshartifact'],concept:'这次会真正触发模拟脚本。CMD 只能证明派发；缺少 jq 时脚本退出 127，旧文件仍留在原路径。',
      commands:['sim next-cron','journalctl -u crond -b','tail -n 6 '+HOST_REPORT_LOG,'rpm -q jq','cat '+HOST_REPORT_RESULT],
      checks:[['当前已派发，同时留下本轮 exit=127 的脚本证据',c=>scheduleSaw('ops-cron-log',e=>!e.failed&&e.current&&Boolean(e.dispatchedAt))(c)&&scheduleSaw('ops-job-log',e=>!e.failed&&e.entries.some(row=>row.source==='cron'&&row.boot===c.machine.boot&&row.exitCode===127&&row.runId===c.machine.ops.runOrdinal))(c)],
        ['证实依赖缺失，读回的仍是旧手工报告',c=>scheduleSaw('ops-package-query',e=>e.failed&&!e.installed)(c)&&scheduleSaw('ops-artifact',e=>!e.failed&&e.artifact.boot!==c.machine.boot&&e.artifact.source==='manual')(c)]],
      readings:[['exit','脚本日志中本轮 cron 任务的 exit',()=> '127']],
      question:'CMD 存在、tail 读取成功，但日志里 exit=127，应该怎样判定？',choices:['tail 成功等于巡检成功','计划已经派发，脚本失败；旧报告不能作为本轮成功证据','只需要删掉错误日志'],answer:1,feedback:'保存失败证据后修复依赖，再等一次新的调度并复查。',
      example:['读取成功不等于被读程序成功','tail 返回了一行 source=cron exit=127。','tail 成功读取文件；文件记录的是另一程序的失败。','把查询命令结果与任务退出结果分开。']},
     {title:'修复后核对新的自动产物',goal:'确认批准来源并安装 jq。先手工试跑、读报告，明确 manual 只证明手工成功。再跳到下次 02:15，重新采服务、计划、派发日志、脚本日志和新报告。',
      knowledge:['repositories','dispatchproof','freshartifact'],concept:'修复不删除历史错误。新一次自动运行应有新的 runId、source=cron 和对应时间。旧日志仍在，需要找到这一轮。',
      commands:['dnf info jq','sudo dnf install jq',reportRun,'cat '+HOST_REPORT_RESULT,'sim next-cron','systemctl status crond','cat '+HOST_CRON_FILE,'ls -l '+HOST_CRON_FILE,'journalctl -u crond -b','tail -n 6 '+HOST_REPORT_LOG,'cat '+HOST_REPORT_RESULT],
      checks:[['修复依赖后先验证本轮手工产物',c=>scheduleSaw('ops-package-repo',e=>!e.failed&&e.output.includes('ops-approved'),false)(c)&&scheduleSaw('ops-artifact',e=>!e.failed&&e.artifact.source==='manual'&&e.artifact.boot===c.machine.boot)(c)],
        ['变更后重新核对服务和实际计划',c=>scheduleSaw('ops-cron-status',e=>!e.failed&&e.action==='status'&&e.active&&e.enabled)(c)&&scheduleSaw('ops-schedule-read',e=>!e.failed&&e.installed)(c)&&scheduleSaw('ops-schedule-mode',e=>!e.failed)(c)],
        ['自动任务的派发、退出 0 与本轮产物一致',scheduleCurrentReport]],
      readings:[['source','新自动报告的 source',()=> 'cron'],['run','新自动报告的 runId',m=>String(m.ops.latest?.runId||'')]],
      question:'手工报告和自动报告都成功，最终证明计划完成应引用哪一组？',choices:['任意一次 manual 报告','只有模板和 enabled','本轮 cron 的派发时间、exit=0 与匹配的新报告'],answer:2,feedback:'用具体的时间、编号和启动轮次说明这一次成功。',
      example:['同一路径，不同运行','旧报告 runId=4，手工试跑 runId=5，自动运行 runId=6。','路径相同，来源和执行编号不同。','交接自动任务时引用第 6 次实际结果及对应日志。']}
   ]},
  {id:'linux-schedule-handoff',track:'linux',group:'服务与定时任务',level:'基础',title:'独立验收：重启后的自动巡检交接',
   description:'新现场已具备账号、依赖和计划。独立检查开机设置，重启后验证新自动报告并填写现场读数。',initial:{workload:'host-ops',scheduleTraining:'assessment'},
   recap:'你已能独立验收自动任务。下一项 OPS-002 把账号、软件、服务和计划组合为一张完整接管工单。',
   steps:[{title:'独立接管自动任务',independent:true,goal:'本课 reportbot 读权限和 jq 已准备，实际计划文件已存在。调查 crond 当前运行、开机启用设置和留存报告，保存变更前证据。获准只调整调度服务的启动设置；要求通过模拟重启证明服务自动启动，检查计划与权限仍有效，再取得新一次自动任务的派发、退出结果及报告。使用模拟时间推进，不必等待现实时间。最后填写本次自动报告的读数。',
     checks:[['保存接管前 active/disabled 与旧报告',({events})=>events.some(e=>e.kind==='ops-cron-status'&&!e.pipeline&&!e.fromPeer&&e.boot===1&&e.active&&!e.enabled)&&events.some(e=>e.kind==='ops-artifact'&&!e.failed&&!e.pipeline&&!e.fromPeer&&e.boot===1&&e.artifact.boot===0)],
       ['重启后服务自动启动，已重新核对计划及权限',c=>scheduleBootVerified(c)&&scheduleSaw('ops-schedule-read',e=>!e.failed&&e.installed)(c)&&scheduleSaw('ops-schedule-mode',e=>!e.failed)(c)],
       ['本次启动的新自动任务三层证据齐全',scheduleCurrentReport]],
     readings:[['account','本轮自动报告的 account',()=> 'reportbot'],['source','本轮自动报告的 source',()=> 'cron'],['time','本轮自动报告的 generatedAt（完整值）',m=>m.ops.latest?.generatedAt||''],['run','本轮自动报告的 runId',m=>String(m.ops.latest?.runId||'')],['boot','本轮自动报告的 boot',m=>String(m.boot)]],
     question:'哪项可以写入本轮交接结论？',choices:['见过旧报告，自动任务就永久可靠','服务 active，所以不需要检查脚本','重启后自动启动已验证，本轮定时脚本退出 0，新报告时间、来源和编号匹配；后续继续监测失败与新鲜度'],answer:2,feedback:'结论限定在实际验证的环境与轮次，并保留下一班的检查点。'}]
  }
];
