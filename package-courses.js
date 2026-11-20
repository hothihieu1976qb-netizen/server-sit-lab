'use strict';

Object.assign(LINUX_CONCEPTS,{
  packages:['软件包与已安装状态','软件包包含程序文件及元数据。rpm -q jq 查询本机 RPM 数据库；查询没有安装并不说明仓库没有可用包。','rpm -ql jq 在查询已安装包的同时列出文件。找到 /usr/bin/jq 后，还需要启动程序并验证实际任务。'],
  repositories:['软件源与候选包','DNF 可以根据已启用仓库提供的信息查询软件和安装依赖。Available Packages 描述候选，Installed Packages 描述已安装的信息。','本课只提供虚构的 ops-approved 仓库和固定版本，不需要联网。实际工作应使用组织批准的源并核对来源。'],
  dependencies:['依赖程序与失败层次','脚本依赖其他程序处理输入。读取权限不足、依赖缺失和数据有误，是不同的失败环节。','本课脚本使用绝对路径 /usr/bin/jq，缺少程序时退出 127。先保留失败消息，再核对包、文件与可执行版本。'],
  searchpath:['PATH 与程序路径','输入不带斜杠的外部命令时，Shell 按 PATH 中的目录顺序搜索。输入绝对路径时直接指定程序文件。','command -v jq 查询本课普通终端的搜索结果。rpm 已安装、绝对路径可执行但相对命令找不到时，应核对 PATH。实际 sudo 的环境由其策略决定。'],
  exportpath:['导出变量与会话范围','export PATH=目录列表 修改当前会话及随后子进程的导出环境。它不会安装软件，也不会自动写入登录配置。','本课允许 /usr/local/bin、/usr/bin 和 /bin。浏览器刷新会续接当前模拟会话；模拟重启会重新建立默认 PATH。'],
  freshartifact:['本轮产物与留存结果','文件存在或某次运行成功，并不能自动证明当前任务已完成。把本轮执行结果与产物的来源关联。','本课报告带 runId、boot、source、account 和 checks。用本轮运行编号、启动轮次、退出结果及读回内容核对；source=manual 仍需后续调度验收。']
});

function packageSaw(kind,match=()=>true,live=false){
  return ({events,machine})=>events.some(e=>e.kind===kind&&!e.failed&&!e.pipeline&&(!live||e.packageRevision===machine.packageTraining.revision)&&match(e));
}
function currentPackageReport({events,machine}){
  const latest=machine.ops.latest,revision=machine.packageTraining.revision;
  if(!latest||latest.boot!==machine.boot||latest.source!=='manual'||latest.runId!==machine.ops.runOrdinal)return false;
  const run=events.find(e=>e.kind==='ops-collect'&&!e.failed&&!e.pipeline&&e.packageRevision===revision&&e.runId===latest.runId&&e.boot===machine.boot);
  if(!run)return false;
  return events.some(e=>e.kind==='ops-artifact'&&!e.failed&&!e.pipeline&&e.packageRevision===revision&&e.seq>run.seq&&e.artifact.runId===latest.runId&&e.artifact.boot===machine.boot&&e.artifact.account==='reportbot');
}

const PACKAGE_COURSES=[
  {id:'linux-package-basics',track:'linux',group:'软件包与运行环境',level:'基础',title:'软件源里有包，本机就能运行吗',
   description:'先定位缺失的 jq 依赖，再从批准的软件源安装，核对包文件、程序版本和本轮巡检报告。',
   initial:{workload:'host-ops',packageTraining:'install'},
   recap:'你能分别核对仓库候选、本机安装、程序文件和任务产物。手工试跑完成后仍需验收调度。',
   steps:[
     {title:'分别查询本机和软件源',goal:'本课已准备好 reportbot 的读取权限。先查询 jq 的本机安装状态与仓库信息，再用巡检账号试跑脚本，定位失败环节。',
      knowledge:['packages','repositories','dependencies'],concept:'这门课先固定权限条件，让你只观察软件依赖这一层。先调查再安装。',
      commands:['rpm -q jq','dnf info jq','sudo -u reportbot '+HOST_REPORT_SCRIPT],
      checks:[['记录本机没有安装 jq',({events})=>events.some(e=>e.kind==='ops-package-query'&&e.failed&&e.installed===false&&!e.pipeline)],
        ['核对可用候选和脚本缺失依赖的失败',c=>packageSaw('ops-package-repo',e=>e.output.includes('Available Packages')&&e.output.includes('ops-approved'))(c)&&c.events.some(e=>e.kind==='ops-collect'&&e.failed&&e.reason==='missing-package'&&e.exitCode===127)]],
      question:'DNF 显示 Available Packages，RPM 提示 not installed，可以判断什么？',choices:['候选包可查询，但当前本机尚未安装','任务一定已经成功运行','必须修改输入目录权限'],answer:0,feedback:'把来源与本机状态分开记录，再按批准范围安装。',
      example:['对照两个查询','仓库中有 parser，rpm 查询本机未安装。','候选存在与已经安装描述不同位置的状态。','保留脚本的具体失败消息，再选择处理。']},
     {title:'安装后逐层验证',goal:'获准安装 jq。核对安装版本和包内路径，实际运行 jq 版本检查，再以 reportbot 试跑巡检并读回本轮报告。',
      knowledge:['packages','dependencies','freshartifact'],concept:'安装成功、程序能启动和任务完成分别取证。jq 的完整 JSON 处理语法由后续专题补充，本课只模拟 --version。',
      commands:['sudo dnf install jq','rpm -q jq','rpm -ql jq','jq --version','sudo -u reportbot '+HOST_REPORT_SCRIPT,'cat '+HOST_REPORT_RESULT,'tail -n 3 '+HOST_REPORT_LOG],
      checks:[['安装成功并重新核对本机包与文件',c=>packageSaw('ops-package-install',e=>e.installed)(c)&&packageSaw('ops-package-query',e=>e.installed,true)(c)&&packageSaw('package-files',e=>e.paths.includes(PACKAGE_JQ),true)(c)],
        ['实际启动程序并读回同次运行的报告',c=>packageSaw('package-version',e=>!e.absolute&&e.version==='1.6',true)(c)&&currentPackageReport(c)]],
      question:'读回的报告 source=manual，可以得出什么结论？',choices:['以后每天都能自动运行','本轮手工试跑产物已核对，调度与重启仍需后续验证','所有依赖程序都永远不会失败'],answer:1,feedback:'这门课通过手工基线，后续工单继续处理服务、计划与重启。',
      example:['关联同一次执行','运行返回成功，报告 runId=7、source=manual。','读回时应对应本轮的编号和启动轮次。','记录依赖版本，再验收自动运行。']}
   ]},
  {id:'linux-command-path',track:'linux',group:'软件包与运行环境',level:'基础',title:'已经安装，为什么 command not found',initial:{workload:'host-ops',packageTraining:'path'},
   description:'对照包内文件、绝对路径与当前 PATH。恢复普通终端的命令搜索，再区分终端环境与脚本环境。',
   recap:'你能用不同来源判断命令找不到的原因，验证当前会话变更，并解释脚本为什么可能表现不同。',
   steps:[
     {title:'找不到命令，先核对证据',goal:'先直接运行 jq，再分别查询已安装包、包内文件、当前 PATH 和命令查找结果。最后直接执行 /usr/bin/jq 的版本检查。',
      knowledge:['packages','searchpath'],concept:'这一门课的普通终端 PATH 只包含 /usr/local/bin。用实际证据证明差异。',
      commands:['jq --version','rpm -q jq','rpm -ql jq','printenv PATH','command -v jq',PACKAGE_JQ+' --version'],
      checks:[['记录程序搜索失败与已安装信息',c=>c.events.some(e=>e.kind==='package-version'&&e.failed&&e.exitCode===127&&!e.absolute)&&packageSaw('ops-package-query',e=>e.installed)(c)&&packageSaw('package-files',e=>e.paths.includes(PACKAGE_JQ))(c)],
        ['对照环境、搜索结果和绝对路径',c=>packageSaw('package-environment',e=>e.path===PACKAGE_SHORT_PATH)(c)&&c.events.some(e=>e.kind==='package-lookup'&&e.resolved===false&&!e.pipeline)&&packageSaw('package-version',e=>e.absolute&&e.programPath===PACKAGE_JQ)(c)]],
      question:'绝对路径能打印版本，直接输入 jq 却找不到，优先检查什么？',choices:['重新给所有目录放开写权限','当前命令搜索路径及环境来源','立刻重装操作系统'],answer:1,feedback:'已经有程序可执行的证据，接下来核对当前普通终端的搜索规则。',
      example:['相同程序，两种写法','/opt/tool/bin/parser 能启动，parser 找不到。','绝对路径指定了程序，短名称还依赖搜索环境。','核对 PATH 是否包含对应目录。']},
     {title:'恢复会话搜索并验证任务',goal:'获准把当前 PATH 设为 /usr/bin:/bin。重新查看环境、搜索结果和实际版本，然后用巡检账号运行脚本并读回本轮报告。',
      knowledge:['exportpath','searchpath','dependencies','freshartifact'],concept:'巡检脚本固定使用 /usr/bin/jq。普通终端的短命令搜索故障，不自动代表使用绝对路径的脚本也会失败。',
      commands:['export PATH=/usr/bin:/bin','printenv PATH','command -v jq','jq --version','sudo -u reportbot '+HOST_REPORT_SCRIPT,'cat '+HOST_REPORT_RESULT],
      checks:[['当前会话的环境与短命令均已复测',c=>c.machine.packageTraining.path===PACKAGE_DEFAULT_PATH&&packageSaw('package-environment',e=>e.path===PACKAGE_DEFAULT_PATH,true)(c)&&packageSaw('package-lookup',e=>e.resolved,true)(c)&&packageSaw('package-version',e=>!e.absolute,true)(c)],
        ['变更后的手工任务及产物相符',currentPackageReport]],
      question:'export 后，这次终端能找到 jq，接下来该怎样说明范围？',choices:['只修改了当前环境，登录与调度环境仍要分别验证','已经写入所有用户的登录配置','已经证明 crond 会按时启动'],answer:0,feedback:'准确记录本次改动作用的会话范围。',
      example:['普通终端与任务','交互终端使用 PATH，脚本写了某程序的绝对路径。','它们的命令查找过程可能不同。','核对任务内容和执行环境，再解释不同结果。']}
   ]},
  {id:'linux-package-handoff',track:'linux',group:'软件包与运行环境',level:'基础',title:'独立验收：依赖与本轮产物交接',initial:{workload:'host-ops',packageTraining:'assessment'},
   description:'新环境留下旧报告。独立定位命令查找问题，复核依赖来源和本轮执行结果。',
   recap:'你已能对照包、程序、搜索环境及本轮产物，接下来在新的主机接管工单中完成完整调度验收。',
   steps:[{title:'独立核对依赖与运行环境',independent:true,goal:'本课已具备 reportbot 的输入读取权限。调查普通终端无法执行 jq 的原因，先记录包和文件、批准来源、PATH、查找失败及绝对路径检查。读取留下的 latest.json，判断它是否属于本次启动。获准把当前普通终端 PATH 设置为 /usr/bin:/bin，复测短命令后以 reportbot 手工执行巡检。读回新报告，关联本轮运行与退出结果。此时只验收手工基线。',
     checks:[['保留环境调查与旧报告的证据',c=>packageSaw('ops-package-query',e=>e.installed)(c)&&packageSaw('package-files',e=>e.paths.includes(PACKAGE_JQ))(c)&&packageSaw('ops-package-repo',e=>e.output.includes('ops-approved'))(c)&&packageSaw('package-environment',e=>e.path===PACKAGE_SHORT_PATH)(c)&&c.events.some(e=>e.kind==='package-lookup'&&!e.resolved&&!e.pipeline)&&packageSaw('package-version',e=>e.absolute)(c)&&packageSaw('ops-artifact',e=>e.artifact.boot!==c.machine.boot)(c)],
       ['在当前环境重新核对搜索与程序',c=>c.machine.packageTraining.path===PACKAGE_DEFAULT_PATH&&packageSaw('package-environment',e=>e.path===PACKAGE_DEFAULT_PATH,true)(c)&&packageSaw('package-lookup',e=>e.resolved,true)(c)&&packageSaw('package-version',e=>!e.absolute,true)(c)],
       ['本轮执行与读回的报告相符',currentPackageReport]],
     readings:[['program','实际程序的绝对路径',()=> PACKAGE_JQ],['version','程序返回的版本号（不含 jq-）',()=> '1.6'],['source','本轮报告的 source 值',()=> 'manual'],['run','本轮报告的 runId',m=>String(m.ops.latest?.runId||'')],['boot','本轮报告的 boot',m=>String(m.boot)]],
     question:'哪项交接结论与本课证据相符？',choices:['本机已有依赖，修复了当前终端搜索；新手工产物已核对，自动调度待后续验收','因为目录里有旧报告，所有测试都已通过','安装信息存在就说明所有工作环境都一致'],answer:0,feedback:'带着清晰的手工运行基线进入主机接管工单。'}
   ]}
];
