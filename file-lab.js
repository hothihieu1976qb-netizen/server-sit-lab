'use strict';

Object.assign(COMMAND_SPECS,{
  cd:{purpose:'切换本课终端的当前目录。',positional:'目录 {v}；. 表示当前目录，.. 表示上级目录。省略时回到 /home/student。',memory:'pwd 定位置，cd 换位置。'},
  find:{purpose:'从指定目录向下查找路径。',options:{'-name':['按文件或目录的名字匹配，支持 * 与 ?；引号让模式交给 find。','value',v=>'本次名字模式为 '+v+'。'],'-type':['限制对象类型。','value',v=>v==='f'?'f 表示普通文件。':v==='d'?'d 表示目录。':'本模拟支持 f 与 d。']},positional:'查找的起始目录 {v}。',fields:[['匹配路径','^/','输出是符合条件的路径；查找名字不会读取日志内容。']],memory:'find 找路径，grep 找内容。'},
  head:{purpose:'读取文件或输入流开头的若干行。',options:{'-n':['选择开头行数。','value',v=>'本次取前 '+v+' 行。']},positional:'输入文件 {v}；在管道中省略文件时读取前一条命令的输出。',memory:'head 看开头，tail 看结尾。'},
  wc:{purpose:'按选项数文本行数（-l）或字节数（-c）。',options:{'-l':['小写字母 L，来自 lines（行）。按行统计，准确说是数换行符。'],'-c':['按字节统计文件大小。中文字符可能占多个字节。']},positional:'这次要统计的文件是 {v}。管道中省略文件时，统计前一条命令传来的文字。',fields:[['结果数字与文件名','^\\s*\\d','先读左边的结果数字，再读右边被统计的文件路径。']],memory:'wc -l 数文本行，先看内容再核对数字。'}
});
Object.assign(COMMAND_SPECS.grep.options,{'-F':['把模式按固定字符串处理。'],'-n':['为命中行加输入中的行号，从 1 开始。']});
COMMAND_SPECS.grep.mistake='本模型实现固定字符串匹配。正则表达式尚未实现；带元字符的文本请显式使用 -F。';
PRACTICE_COMMAND_SPECS.ls.purpose='列出虚拟目录内容，或用 -ld 检查目录本身。';
COMMAND_TEACHING.cd=['切换当前目录，为相对路径提供起点。','cd 成功通常没有输出，pwd 可以确认位置。','再次执行相对路径命令，核对它实际解析到哪里。'];
COMMAND_TEACHING.find=['按路径和名字缩小查找范围。','找到文件名后，还需要读取内容并确认日期、用途与时间范围。','找到当前日志后再用 head、tail 或 grep 读取。'];
COMMAND_TEACHING.head=['用少量开头内容识别文件格式。','头部样本无法代表整份日志。','用 tail 检查末尾，再按明确条件筛选。'];
COMMAND_TEACHING.wc=['用 wc -l 数文本有多少行。','-l 是小写字母 L。结果左边是数字，右边是被统计的文件。','先 cat 读文件，自己数一遍，再和命令结果对照。'];
COMMAND_KB.push(
  ['文件','pwd','显示当前目录','在文件与日志课程确认相对路径的起点。','输出是当前工作目录的绝对路径。','/home/student','cd 成功后怎样确认位置？','linux-find-files'],
  ['文件','cd /srv/status','切换工作目录','进入课程提供的应用目录。','成功通常不输出；随后 pwd 确认。','','相对路径从哪里开始？','linux-find-files'],
  ['文件','find /srv/status -type f -name "*.log"','按名字查找日志','从应用目录找到本轮候选文件。','-type f 选普通文件，-name 匹配名字。','/srv/status/logs/access.log','为什么 access.log.1 不符合这个模式？','linux-find-files'],
  ['日志','head -n 2 /srv/status/logs/access.log','读取开头样本','先确认文件格式与时间范围。','-n 2 是两行。','2026-11-19T09:00:00Z INFO request=r100 path=/health status=200','开头样本能够代表整份日志吗？','linux-read-logs'],
  ['日志','grep -niF error /srv/status/logs/access.log','保留行号筛选文本','在原始日志里定位失败记录。','-n 行号，-i 忽略大小写，-F 固定字符串。','2:2026-11-19T09:00:05Z ERROR request=r101 path=/orders status=502','无输出、返回 1 时能得出什么结论？','linux-filter-save'],
  ['日志','wc -l /srv/status/logs/access.log','统计换行符','为计数结论说明统计对象。','有换行结尾的八条记录计为 8。','8 /srv/status/logs/access.log','日志条数与独立请求数有什么区别？','linux-read-logs']
);

// Each course owns its tree. These paths never touch the host filesystem.
const FILE_LAB_ROOT='/srv/status';
const FILE_LAB_LOG=FILE_LAB_ROOT+'/logs/access.log';
const FILE_LAB_LINES=[
  '2026-11-19T09:00:00Z INFO request=r100 path=/health status=200',
  '2026-11-19T09:00:05Z ERROR request=r101 path=/orders status=502 upstream=127.0.0.1:8080',
  '2026-11-19T09:00:06Z INFO request=r102 path=/health status=200',
  '2026-11-19T09:00:07Z ERROR request=r103 path=/orders status=502 upstream=127.0.0.1:8080',
  '2026-11-19T09:00:08Z WARN request=r104 retry=1',
  '2026-11-19T09:00:09Z ERROR request=r103 path=/orders status=502 upstream=127.0.0.1:8080',
  '2026-11-19T09:01:00Z INFO release=v1 rollback=complete',
  '2026-11-19T09:01:02Z INFO request=r105 path=/orders status=200'
];

function initializeFileLab(machine,variant='lesson'){
  machine.fileTraining={variant,cwd:'/home/student',revision:0};
  const content=variant==='assessment'
    ?FILE_LAB_LINES.map(line=>line.replace('09:','10:').replace('r101','q201').replace('r103','q203').replace('r104','q204')).join('\n')+'\n'
    :FILE_LAB_LINES.join('\n')+'\n';
  const add=(path,text)=>machine.files[path]={content:text,sizeMiB:new TextEncoder().encode(text).length/1048576,owner:'root',group:'root',mode:'rw-r--r--'};
  add(FILE_LAB_LOG,content);
  add(FILE_LAB_ROOT+'/logs/access.log.1','2026-11-18T08:00:00Z ERROR request=old1 status=503\n');
  add(FILE_LAB_ROOT+'/config/app.conf','APP_PORT=8080\nLOG_PATH='+FILE_LAB_LOG+'\n');
  add(FILE_LAB_ROOT+'/README.txt','Status service exercise\nTimes are UTC. Read access.log for the current incident.\n');
  ensureWcDemo(machine);
}

function ensureWcDemo(machine){
  if(!machine.files['/tmp/wc-demo.txt'])machine.files['/tmp/wc-demo.txt']={content:'apple\nbanana\norange\n',sizeMiB:20/1048576,owner:'student',group:'student',mode:'rw-r--r--'};
}

function fileLabPath(machine,input='.'){
  const parts=(input.startsWith('/')?input:((machine.fileTraining?.cwd||'/home/student')+'/'+input)).split('/');
  const resolved=[];
  for(const part of parts){
    if(!part||part==='.')continue;
    if(part==='..')resolved.pop();else resolved.push(part);
  }
  return '/'+resolved.join('/');
}

function fileLabDirectories(machine){
  const dirs=new Set(['/','/home','/home/student','/tmp','/mnt','/mnt/sit']);
  for(const file of Object.keys(machine.files)){
    let parent=file.slice(0,file.lastIndexOf('/'));
    while(parent){dirs.add(parent);parent=parent.slice(0,parent.lastIndexOf('/'));}
  }
  return dirs;
}

function textLines(text){
  if(!text)return [];
  const lines=text.split('\n');
  if(lines.at(-1)==='')lines.pop();
  return lines;
}

function filterLabText(segment,text){
  const {command,opts,positionals:a}=segment;
  const lines=textLines(text);
  if(command==='grep'){
    const term=a[0];
    if(term===undefined)return modelError('grep: missing pattern','text-filter','arguments',2);
    if(!opts['-F']&&/[.*+?^$[\]{}()|\\]/.test(term))return modelError('grep: this simulator supports fixed strings; use -F for literal metacharacters','text-filter','unsupported-pattern',2);
    const pattern=opts['-i']?term.toLowerCase():term;
    const matches=lines.flatMap((line,index)=>{
      const found=(opts['-i']?line.toLowerCase():line).includes(pattern);
      return found?[(opts['-n']?(index+1)+':':'')+line]:[];
    });
    return {output:matches.length?matches.join('\n')+'\n':'',kind:'text-filter',filter:command,pattern:term,matches:matches.length,numbered:Boolean(opts['-n']),ignoreCase:Boolean(opts['-i']),exitCode:matches.length?0:1,failed:matches.length===0,reason:matches.length?null:'no-match'};
  }
  if(command==='head'||command==='tail'){
    const n=Number(opts['-n']??10);
    if(!/^\d+$/.test(String(opts['-n']??10))||!Number.isSafeInteger(n))return modelError(command+': invalid number of lines','text-filter','arguments',2);
    const chosen=command==='head'?lines.slice(0,n):n?lines.slice(-n):[];
    return modelResult(chosen.length?chosen.join('\n')+(text.endsWith('\n')||command==='head'&&chosen.length<lines.length?'\n':''):'','text-filter',{filter:command,limit:n,selectedLines:chosen.length});
  }
  if(command==='wc'){
    if(!opts['-l']&&!opts['-c'])return modelError('wc: this simulator supports -l and -c','text-filter','arguments',2);
    const newlineCount=(text.match(/\n/g)||[]).length,bytes=new TextEncoder().encode(text).length;
    return modelResult([opts['-l']?newlineCount:null,opts['-c']?bytes:null].filter(v=>v!==null).join(' ')+'\n','text-filter',{filter:command,newlineCount,bytes});
  }
  return modelError(command+': unsupported input filter','text-filter','arguments',2);
}

function runFileLabCommand(machine,segment){
  if(!machine.fileTraining)return null;
  const {command,opts,positionals:a}=segment;
  const cwd=machine.fileTraining.cwd;
  const path=fileLabPath(machine,a[0]||'.'),dirs=fileLabDirectories(machine);
  if(command==='pwd')return modelResult(cwd+'\n','file-cwd',{cwd});
  if(command==='cd'){
    if(a.length>1)return modelError('cd: too many arguments','file-cwd','arguments');
    const next=a.length?path:'/home/student';
    if(!dirs.has(next))return modelError('cd: '+next+': Not a directory','file-cwd','not-directory');
    machine.fileTraining.cwd=next;
    return modelResult('','file-cwd',{cwd:next});
  }
  if(command==='find'){
    if(a.length!==1||!dirs.has(path))return modelError('find: expected one virtual directory','file-find','arguments');
    if(opts['-type']&&!['f','d'].includes(opts['-type']))return modelError('find: -type supports f or d','file-find','arguments');
    const name=opts['-name'];
    if(name&&/[^a-zA-Z0-9._*?-]/.test(name))return modelError('find: unsupported name pattern','file-find','arguments');
    const glob=name?new RegExp('^'+name.replace(/\./g,'\\.').replace(/\*/g,'.*').replace(/\?/g,'.')+'$'):null;
    const entries=[...(!opts['-type']||opts['-type']==='d'?[...dirs]:[]),...(!opts['-type']||opts['-type']==='f'?Object.keys(machine.files):[])];
    const matches=entries.filter(p=>(p===path||p.startsWith(path==='/'?'/':path+'/'))&&(!glob||glob.test(p.split('/').at(-1)))).sort();
    return modelResult(matches.join('\n')+(matches.length?'\n':''),'file-find',{root:path,pattern:name||'',entryType:opts['-type']||'',paths:matches});
  }
  if(command==='ls'){
    if(a.length>1)return modelError('ls: expected one path','file-list','arguments');
    const file=machine.files[path];
    if(!file&&!dirs.has(path))return modelError('ls: '+path+': No such file or directory','file-list','no-file',2);
    const isDir=dirs.has(path),long=Boolean(opts['-l']);
    const format=p=>{
      const f=machine.files[p],mode=f?'-'+f.mode:p==='/mnt/sit'?(machine.fileWritable?'drwxrwxr-x':'drwxr-xr-x'):'drwxr-xr-x';
      return long?mode+' 1 '+(f?.owner||'root')+' '+(f?.group||(p==='/mnt/sit'?'sitqa':'root'))+' '+(f?Math.round(f.sizeMiB*1048576):4096)+' '+p:p.split('/').at(-1)||'/';
    };
    const paths=isDir&&!opts['-d']?[...new Set([...dirs,...Object.keys(machine.files)])].filter(p=>p!==path&&p.slice(0,p.lastIndexOf('/'))===(path==='/'?'':path)).sort():[path];
    return modelResult(paths.map(format).join('\n')+(paths.length?'\n':''),'file-list',{target:path,directory:isDir,groupWrite:isDir&&path==='/mnt/sit'&&machine.fileWritable,paths});
  }
  if(['cat','less','head','tail','grep','wc'].includes(command)){
    const source=command==='grep'?a[1]:a[0];
    if(!source)return modelError(command+': specify a virtual file or pipe input','file-read','arguments',2);
    const target=fileLabPath(machine,source),file=machine.files[target];
    if(!file){
      if(!target.startsWith(FILE_LAB_ROOT+'/')&&!target.startsWith('/tmp/'))return null;
      return modelError(command+': '+target+': No such file','file-read','no-file',2);
    }
    const fault=virtualFileError(machine,target);
    if(fault&&!target.startsWith(FILE_LAB_ROOT+'/'))return modelError(command+': '+fault[1],'file-read',fault[0]);
    const text=file.content||'';
    const result=['cat','less'].includes(command)?modelResult(text,'file-read'):filterLabText(segment,text);
    if(command==='wc')result.output=result.output.trimEnd()+' '+source+'\n';
    return {...result,target,inputLines:textLines(text).length};
  }
  return null;
}
