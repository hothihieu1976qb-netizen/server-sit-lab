'use strict';

const PACKAGE_DEFAULT_PATH='/usr/bin:/bin';
const PACKAGE_SHORT_PATH='/usr/local/bin';
const PACKAGE_JQ='/usr/bin/jq';
const PACKAGE_FILES=[PACKAGE_JQ,'/usr/share/doc/jq/README'];

Object.assign(COMMAND_SPECS,{
  command:{purpose:'使用当前普通终端的命令搜索规则查找程序。',options:{'-v':['显示会被找到的命令路径；本课支持 jq。']},positional:'要查找的命令名 {v}。',memory:'command -v 查搜索结果，绝对路径查指定程序。'},
  printenv:{purpose:'读取当前课程终端导出的环境变量。',positional:'本课支持 PATH，当前参数为 {v}。',fields:[['PATH','/usr/|/bin','冒号分隔的目录，按从左到右的顺序搜索没有斜杠的外部命令。']],memory:'先看环境，再判断命令从哪里来。'},
  export:{purpose:'设置当前课程终端及其子进程的导出变量。',positional:'本课只支持 PATH=目录列表。本次赋值为 {v}。',memory:'export 改当前会话，重新登录的设置还需单独验证。'},
  jq:{purpose:'验证课内 jq 程序是否能启动并返回版本。',options:{'--version':['打印运行中程序的版本。本课只实现版本检查。']},fields:[['jq version','^jq-','实际启动程序返回的版本；仍需运行使用它的任务并检查产物。']],memory:'装包后查版本，任务跑完查产物。'}
});
COMMAND_SPECS[PACKAGE_JQ]=COMMAND_SPECS.jq;
PRACTICE_COMMAND_SPECS.rpm.options['-l']=['与 -q 一起列出已安装包的文件清单。'];
COMMAND_TEACHING.command=['检查当前终端会从哪里找到命令。','没有找到可能来自 PATH，也可能来自程序缺失。','对照 printenv PATH、rpm -ql 与绝对路径的版本检查。'];
COMMAND_TEACHING.printenv=['查看本次终端的导出环境。','交互终端、sudo 和调度任务的环境可能不同。','分别记录环境，核对任务脚本使用绝对路径还是依赖 PATH。'];
COMMAND_TEACHING.export=['修改当前课程终端的导出环境。','此课只实现 PATH；export 不会安装软件，也不自动写入登录配置。','设置后重新查找并执行命令；重新登录的环境需要另行验证。'];
COMMAND_TEACHING.jq=['实际启动 jq 并确认版本。','本课只模拟 --version；版本正确还不能证明巡检任务成功。','以任务账号运行脚本，读回本轮产物及退出结果。'];
COMMAND_TEACHING[PACKAGE_JQ]=COMMAND_TEACHING.jq;
COMMAND_KB.push(
  ['软件包','rpm -ql jq','列出已安装包的文件','把包名与程序路径对应。','-q 查询，-l 列文件。',PACKAGE_FILES.join('\n'),'为什么装包后命令仍可能找不到？','linux-package-basics'],
  ['环境','command -v jq','查找当前会使用的程序','解释不带路径的命令查找。','按当前课程终端 PATH 搜索。',PACKAGE_JQ,'没有输出是否一定没有安装？','linux-command-path'],
  ['环境','printenv PATH','查看导出的搜索路径','比较程序文件位置与 PATH。','目录以冒号分隔。',PACKAGE_DEFAULT_PATH,'交互环境能直接代替定时任务环境吗？','linux-command-path']
);

function initializePackageLab(machine,variant){
  const installed=variant!=='install';
  machine.ops.groupMember=true;
  machine.ops.packageInstalled=installed;
  machine.packageTraining={revision:0,path:installed?PACKAGE_SHORT_PATH:PACKAGE_DEFAULT_PATH};
  if(variant==='assessment'){
    machine.ops.runOrdinal=1;
    machine.ops.latest={generatedAt:'2024-12-31T02:15:00Z',boot:0,source:'cron',account:'reportbot',checks:HOST_CHECKS.length,runId:1};
  }
}

function runPackageLabCommand(machine,segment){
  if(!machine.packageTraining)return null;
  const state=machine.packageTraining,{command,positionals:a,opts}=segment;
  if(segment.fromB)return modelError(command+': package exercise is on host A','package-command','unavailable');
  const result=(output,kind,extra={})=>modelResult(output,kind,{packageRevision:state.revision,installed:machine.ops.packageInstalled,...extra});
  if(command==='printenv'){
    if(a.length!==1||a[0]!=='PATH')return modelError('printenv: this exercise supports PATH','package-environment','arguments');
    return result(state.path,'package-environment',{path:state.path});
  }
  if(command==='export'){
    if(a.length!==1||!a[0].startsWith('PATH='))return modelError('export: supported form is PATH=/usr/bin:/bin','package-environment','arguments');
    const path=a[0].slice(5),dirs=path.split(':');
    if(dirs.some(dir=>!['/usr/local/bin','/usr/bin','/bin'].includes(dir)))return modelError('export: this exercise supports /usr/local/bin, /usr/bin and /bin','package-environment','arguments');
    if(path!==state.path){state.path=path;state.revision++;}
    return result('','package-environment-change',{path});
  }
  if(command==='command'){
    if(!opts['-v']||a.length!==1||a[0]!=='jq')return modelError('command: supported form is command -v jq','package-lookup','arguments');
    const resolved=machine.ops.packageInstalled&&state.path.split(':').includes('/usr/bin');
    return {...result(resolved?PACKAGE_JQ:'','package-lookup',{path:state.path,resolved:Boolean(resolved),programPath:resolved?PACKAGE_JQ:null}),failed:!resolved,exitCode:resolved?0:1,reason:resolved?null:'command-search'};
  }
  if(command==='jq'||command===PACKAGE_JQ){
    if(a.length||!opts['--version'])return modelError('jq: this simulator implements --version only','package-version','arguments',2);
    const absolute=command===PACKAGE_JQ;
    if(!machine.ops.packageInstalled||!absolute&&!state.path.split(':').includes('/usr/bin')){
      return {...modelError(absolute?PACKAGE_JQ+': No such file or directory':'jq: command not found','package-version','command-search',127),packageRevision:state.revision,installed:machine.ops.packageInstalled,absolute};
    }
    return result('jq-1.6','package-version',{programPath:PACKAGE_JQ,version:'1.6',absolute});
  }
  if(command==='rpm'&&opts['-l']){
    if(!opts['-q']||a.length!==1||a[0]!=='jq')return modelError('rpm: supported file query is rpm -ql jq','package-files','arguments');
  }
  if(command==='ls'&&PACKAGE_FILES.includes(a[0])){
    if(a.length!==1)return modelError('ls: expected one package path','package-files','arguments');
    if(!machine.ops.packageInstalled)return modelError('ls: '+a[0]+': No such file or directory','package-files','no-file',2);
    return result((opts['-l']?(a[0]===PACKAGE_JQ?'-rwxr-xr-x':'-rw-r--r--')+' 1 root root 4096 ':'')+a[0],'package-file',{programPath:a[0]});
  }
  const opsCommand=['rpm','dnf',HOST_REPORT_SCRIPT].includes(command)
    ||['cat','tail'].includes(command)&&[HOST_REPORT_RESULT,HOST_REPORT_LOG,HOST_REPORT_INPUT].includes(a[0]);
  if(opsCommand){
    const installed=machine.ops.packageInstalled;
    const value=runHostOpsCommand(machine,segment);
    if(installed!==machine.ops.packageInstalled)state.revision++;
    return {...value,packageRevision:state.revision,installed:machine.ops.packageInstalled};
  }
  return null;
}
