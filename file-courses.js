'use strict';

Object.assign(LINUX_CONCEPTS,{
  path:['绝对路径与相对路径','绝对路径从 / 开始。相对路径从当前目录出发，. 表示当前位置，.. 表示上一级。cd 成功通常无输出。','先 pwd 确定位置，再 ls 查看内容。cd /srv/status 后，logs/access.log 指向 /srv/status/logs/access.log。'],
  names:['按名字查找文件','find 从给定目录向下查找。-name 匹配最后一段名字，-type f 限定普通文件。','find /srv/status -type f -name "*.log" 把模式交给 find。access.log.1 不以 .log 结尾，因此不会匹配。找到路径之后还要读日期和内容。'],
  lines:['文本的每一行','先把文件内容显示出来，看看每行写了什么。head 取开头几行，tail 取结尾几行，less 用于阅读完整内容。','wc -l 用来数行数，-l 是小写字母 L。先用三行水果文本自己数出 3，再对照命令结果。'],
  match:['内容筛选与行号','grep 在输入行中找匹配。-F 按固定字符串，-i 忽略大小写，-n 为匹配行显示输入中的行号。','grep -nF ERROR access.log 的 2: 表示原文件第 2 行。如果先 tail 再 grep -n，行号属于 tail 输出，需保留原文才能回查。'],
  streams:['标准输出与管道','命令的正常结果进入标准输出。| 把前一命令的标准输出交给后一命令。错误消息属于另一条流。','cat 文件 | grep -F ERROR | wc -l 先读全文，再筛选，最后计数。wc 统计筛选结果；空匹配后计数为 0。此模型不支持 2>、&&、变量或完整 Shell 脚本。'],
  redirect:['覆盖与追加','> 创建或截断目标文件，再接收标准输出；>> 把标准输出追加到文件末尾。两种成功操作通常都没有终端输出。','用 cat 或 wc 重新读取目标，确认保存结果。重复追加会产生重复行。读取源文件出错时，> 的目标仍可能已经变空，错误消息仍显示在终端。'],
  scope:['证据范围与结论','日志显示的是记录到的事件。一个请求可能重试或多次记录，因此行数、独立请求数、用户数有不同口径。','保留源路径、时区、筛选条件和原始行。末尾恢复成功只说明采样时的请求结果，仍需实际业务复测来确认当前可用性。']
});

function fileSaw(kind,match=()=>true){
  return ({events})=>events.some(e=>e.kind===kind&&!e.failed&&!e.pipeline&&match(e));
}
function fileSaved(path,mode){
  return ({events,machine})=>{
    const expected=machine.files[FILE_LAB_LOG].content.split('\n').filter(l=>l.includes('ERROR')).join('\n')+'\n';
    return events.some(e=>!e.failed&&e.pipeline&&e.destination===path&&e.redirect===mode&&e.sourcePath===FILE_LAB_LOG&&e.savedContent===expected)
      &&machine.files[path]?.content===expected;
  };
}

const FILE_COURSES=[
  {id:'linux-find-files',track:'linux',group:'文件与日志取证',level:'基础',title:'从目录定位当前日志',initial:{fileTraining:'lesson'},
   description:'接班说明只给了应用目录。先认识当前位置和相对路径，再从当前日志与轮转日志里找到正确材料。',
   recap:'你可以从目录出发找文件，解释相对路径的起点，并区分名字匹配与日志内容判断。',
   steps:[
     {title:'确认位置，再沿目录移动',goal:'从自己的工作目录进入 /srv/status，查看应用目录。再通过相对路径进入 logs，并确认最终位置。',
      knowledge:['directory','path'],concept:'目录决定相对路径的含义。操作前后用 pwd 核对。',
      commands:['pwd','cd /srv/status','ls -l /srv/status','cd logs','pwd','ls -l .'],
      checks:[['记录起始工作目录',fileSaw('file-cwd',e=>e.command==='pwd'&&e.cwd==='/home/student')],['列出应用目录并核对日志目录位置',c=>fileSaw('file-list',e=>e.target===FILE_LAB_ROOT&&e.paths.includes(FILE_LAB_ROOT+'/logs'))(c)&&fileSaw('file-cwd',e=>e.command==='pwd'&&e.cwd===FILE_LAB_ROOT+'/logs')(c)]],
      question:'在 /srv/status/logs 中，../config/app.conf 指向哪里？',choices:['/srv/config/app.conf','/srv/status/config/app.conf','/home/student/config/app.conf'],answer:1,feedback:'.. 返回一层，再沿 config/app.conf 查找。',
      example:['路径需要一个起点','pwd 显示 /opt/demo；读取 config/app.conf','相对路径从 /opt/demo 出发。','把相对路径换成绝对路径核对同一个对象。']},
     {title:'按名字查找，再识别文件用途',goal:'从 /srv/status 找到 .log 文件，读 README 和配置里的日志路径，确认本次要读哪一份。保留 access.log.1 供历史对照。',
      knowledge:['names','lines'],concept:'文件名是筛选条件。README、配置和内容时间范围一起支持选择。',
      commands:['find /srv/status -type f -name "*.log"','cat /srv/status/README.txt','cat /srv/status/config/app.conf'],
      checks:[['按普通文件和 .log 名字模式找到当前日志',fileSaw('file-find',e=>e.root===FILE_LAB_ROOT&&e.entryType==='f'&&e.pattern==='*.log'&&e.paths.length===1&&e.paths[0]===FILE_LAB_LOG)],
        ['读取用途说明与配置中的日志路径',c=>fileSaw('file-read',e=>e.target===FILE_LAB_ROOT+'/README.txt')(c)&&fileSaw('file-read',e=>e.target===FILE_LAB_ROOT+'/config/app.conf'&&e.output.includes(FILE_LAB_LOG))(c)]],
      question:'为什么 access.log.1 没有出现在 -name "*.log" 的结果里？',choices:['它一定没有错误','它不是普通文件','它的名字以 .log.1 结尾，与本次名字模式不符'],answer:2,feedback:'find 的名字模式不会检查日志是否有错误。',
      example:['解释名字模式','find /opt/demo -type f -name "*.conf"','* 可以匹配一段名字，但 .conf 必须位于末尾。','读取匹配文件，继续核对用途。']}
   ]},
  {id:'linux-read-logs',track:'linux',group:'文件与日志取证',level:'基础',title:'先读范围，再判断日志',initial:{fileTraining:'lesson'},
   description:'对比当前与轮转日志，读开头、结尾和上下文。解释最新成功与整段故障之间的关系。',
   recap:'你能说明当前日志的时间范围、历史文件的用途，以及少量样本能支持什么判断。',
   steps:[
     {title:'对比开头和结尾',goal:'查看当前日志的前两行与最后两行，再看轮转日志的开头。读清时间和 Z 时区标记。',
      knowledge:['lines','scope'],concept:'Z 表示 UTC。日志末尾的状态与较早的失败描述不同时间点。',
      commands:['head -n 2 '+FILE_LAB_LOG,'tail -n 2 '+FILE_LAB_LOG,'head -n 2 '+FILE_LAB_LOG+'.1'],
      checks:[['读到当前日志的开头和结尾',c=>fileSaw('text-filter',e=>e.filter==='head'&&e.limit===2&&e.target===FILE_LAB_LOG)(c)&&fileSaw('text-filter',e=>e.filter==='tail'&&e.limit===2&&e.target===FILE_LAB_LOG)(c)],
        ['对照轮转日志的日期',fileSaw('text-filter',e=>e.filter==='head'&&e.target===FILE_LAB_LOG+'.1'&&e.output.includes('2026-11-18'))]],
      question:'最后一条记录是 status=200，可以立即断言什么？',choices:['整段时间内都正常','这个记录时刻的请求成功，仍需完整时间范围与当前复测','所有用户都已恢复'],answer:1,feedback:'你已经读到了开头与结尾。接下来先用三行小文件练习数行，再回到日志。',
      example:['尾部样本的范围','09:05:00Z request=x9 status=200','这条记录针对 x9 及它的时间。','回查此前异常，并重新从用户入口请求。']},
     {title:'先用三行文字学会 wc -l',goal:'先读 /tmp/wc-demo.txt 里的三行水果名，自己数出 3，再用 wc -l 验证。看懂结果左边的数字和右边的文件名后，再对日志做同样的统计。',
      knowledge:['lines','scope'],concept:'wc 来自 word count（字词计数）。这次加 -l，只数行数。-l 是短横线加小写 l，来自 lines（行）；请区分字母 l 和数字 1。',
      commands:['cat /tmp/wc-demo.txt','wc -l /tmp/wc-demo.txt','less '+FILE_LAB_LOG,'wc -l '+FILE_LAB_LOG],
      checks:[['读到三行水果名，并用 wc -l 得到 3',c=>fileSaw('file-read',e=>e.target==='/tmp/wc-demo.txt')(c)&&fileSaw('text-filter',e=>e.target==='/tmp/wc-demo.txt'&&e.filter==='wc'&&e.newlineCount===3)(c)],['阅读全文，保留回滚前后的记录',fileSaw('file-read',e=>e.command==='less'&&e.target===FILE_LAB_LOG&&e.output.includes('rollback=complete'))],['用同样的方法数出日志有 8 行',fileSaw('text-filter',e=>e.filter==='wc'&&e.target===FILE_LAB_LOG&&e.newlineCount===8)]],
      question:'日志有 8 行，这能直接解释成 8 个独立请求吗？',choices:['能，每行都是新请求','不能，里面有重试和发布记录，要按请求标识核对','能，因为 wc 自动去重'],answer:1,feedback:'wc -l 数出的是文本行。这 8 行里有请求、重试和发布记录，独立请求数量要根据 request 编号另行核对。',
      example:['计数前先定义对象','一行发布记录，另两行记录同一个请求','三行日志描述的对象并不相同。','先明确统计记录、请求还是用户。']}
   ]},
  {id:'linux-filter-save',track:'linux',group:'文件与日志取证',level:'基础',title:'筛选故障记录并保存证据',initial:{fileTraining:'lesson'},
   description:'按行号筛选错误，串接命令计数，把结果保存到虚拟文件，再亲自验证覆盖与追加。',
   recap:'你会筛选、计数并核对证据文件，能解释管道、重定向、空匹配和重复追加。',
   steps:[
     {title:'按内容筛选，保留原始行号',goal:'忽略大小写查找 error，为命中行带上原始行号。对照 request 字段，区分错误记录数和独立请求数。',
      knowledge:['match','scope'],concept:'grep -n 的数字是输入行号。日志中的 request 字段用来关联同一个请求。',
      commands:['grep -niF error '+FILE_LAB_LOG,'grep -F NOT_PRESENT '+FILE_LAB_LOG],
      checks:[['取得带原始行号的三条错误记录',fileSaw('text-filter',e=>e.filter==='grep'&&e.target===FILE_LAB_LOG&&e.pattern==='error'&&e.ignoreCase&&e.numbered&&e.matches===3)],
        ['观察空匹配的结果',({events})=>events.some(e=>e.filter==='grep'&&e.target===FILE_LAB_LOG&&e.pattern==='NOT_PRESENT'&&e.exitCode===1&&e.reason==='no-match')]],
      question:'grep 没有输出，返回 1，说明什么？',choices:['这次条件没有匹配行，仍需核对文件和条件','磁盘损坏','日志肯定没有问题'],answer:0,feedback:'grep 的 1 表示无匹配；读取或参数错误通常是另一类结果。',
      example:['行号和请求号分开','2:… request=z7 …；5:… request=z7 …','同一个请求可以出现在多行。','保留行号回原文，按 request 关联上下文。']},
     {title:'把筛选结果传给计数与文件',goal:'先用管道统计 ERROR 记录。再把筛选结果保存到 /tmp/errors.log，重新读取并核对行数。',
      knowledge:['streams','redirect','scope'],concept:'管道中的 wc 统计上游输出。保存成功通常无终端输出，读回是必要验证。',
      commands:['cat '+FILE_LAB_LOG+' | grep -F ERROR | wc -l','cat '+FILE_LAB_LOG+' | grep -F ERROR > /tmp/errors.log','cat /tmp/errors.log','wc -l /tmp/errors.log'],
      checks:[['用筛选管道得到三条记录',({events})=>events.some(e=>e.pipeline&&!e.failed&&e.sourcePath===FILE_LAB_LOG&&e.filters?.some(f=>f.command==='grep'&&f.pattern==='ERROR')&&e.filters.at(-1)?.command==='wc'&&e.output.trim()==='3')],
        ['保存正确内容，并读回和核对',c=>fileSaved('/tmp/errors.log','>')(c)&&fileSaw('file-read',e=>e.target==='/tmp/errors.log')(c)&&fileSaw('text-filter',e=>e.target==='/tmp/errors.log'&&e.filter==='wc'&&e.newlineCount===3)(c)]],
      question:'正常重定向后终端没有结果，应该怎样确认？',choices:['默认文件已正确生成','读取目标并核对行数、内容和源路径','重新启动主机'],answer:1,feedback:'确认文件中的记录就是本轮源日志筛选出的内容。',
      example:['看输出流向','cat /tmp/a.log | grep -F WARN > /tmp/warn.log','命中内容进入 warn.log。','用 cat 读回，并核对采集条件。']},
     {title:'追加的后果与覆盖的边界',goal:'把相同错误记录追加一次，读到 6 行。再按同样条件覆盖生成，确认回到 3 行，原始日志仍有 8 行。',
      knowledge:['redirect','scope'],concept:'追加保留旧内容。重复采集可能制造重复证据。先明确要保留历史还是生成本轮快照。',
      commands:['grep -F ERROR '+FILE_LAB_LOG+' >> /tmp/errors.log','wc -l /tmp/errors.log','grep -F ERROR '+FILE_LAB_LOG+' > /tmp/errors.log','wc -l /tmp/errors.log','wc -l '+FILE_LAB_LOG],
      checks:[['观察追加后的六行结果',fileSaw('text-filter',e=>e.target==='/tmp/errors.log'&&e.filter==='wc'&&e.newlineCount===6)],
        ['重新覆盖为三行并复核原文',c=>fileSaved('/tmp/errors.log','>')(c)&&fileSaw('text-filter',e=>e.target==='/tmp/errors.log'&&e.newlineCount===3)(c)&&fileSaw('text-filter',e=>e.target===FILE_LAB_LOG&&e.newlineCount===8)(c)]],
      question:'采集同一个时间窗口两次，用 >> 累积后得到 6 行，能说失败翻倍了吗？',choices:['可以，行数翻倍代表新故障','可以，>> 会自动去重','不可以，先排除重复追加并确认时间窗口'],answer:2,feedback:'采集方式会影响产物。交接时保留源文件、筛选条件和生成方式。',
      example:['一份本轮快照','第一次保存 4 行，重复追加相同 4 行','文件里有 8 行，但新增故障尚未得到证明。','明确时间窗口，重新生成并对照原始记录。']}
   ]},
  {id:'linux-log-handoff',track:'linux',group:'文件与日志取证',level:'基础',title:'独立验收：交付故障日志证据',initial:{fileTraining:'assessment'},
   description:'给定新的现场日志，独立找到文件、筛选当前错误、保存快照，并向下一班说明统计口径。',
   recap:'你能独立从目录找到本轮材料，保存可追溯的错误快照，核对行号、时间和请求数量，并说明仍需要的验证。',
   steps:[{title:'独立取证并交接',independent:true,goal:'在 /srv/status 查找当前 .log 文件，核对开头、结尾和总行数。筛选 ERROR，保留一次带原文行号的观察，将不带行号的错误记录保存到 /tmp/incident.log，并重新读取核对。填写本轮现场值，不修改原始日志。',
     checks:[['定位当前日志并读清范围',c=>fileSaw('file-find',e=>e.paths.includes(FILE_LAB_LOG)&&e.entryType==='f')(c)&&fileSaw('text-filter',e=>e.target===FILE_LAB_LOG&&e.filter==='head')(c)&&fileSaw('text-filter',e=>e.target===FILE_LAB_LOG&&e.filter==='tail')(c)&&fileSaw('text-filter',e=>e.target===FILE_LAB_LOG&&e.newlineCount===8)(c)],
       ['取得原文行号并保存本轮快照',c=>fileSaw('text-filter',e=>e.filter==='grep'&&e.target===FILE_LAB_LOG&&e.numbered&&e.matches===3)(c)&&fileSaved('/tmp/incident.log','>')(c)],
       ['读回证据并核对数量',c=>fileSaw('file-read',e=>e.target==='/tmp/incident.log')(c)&&fileSaw('text-filter',e=>e.target==='/tmp/incident.log'&&e.newlineCount===3)(c)]],
     readings:[['source','本轮源日志的绝对路径',()=>FILE_LAB_LOG],['count','ERROR 记录行数',()=> '3'],['requests','ERROR 中不同 request 的数量',()=> '2'],['first','首条 ERROR 的 request 值',()=> 'q201'],['status','日志最后一次请求的状态码',()=> '200']],
     question:'哪条交接说明与这轮材料一致？',choices:['找到三条错误记录，涉及两个请求；保留了采集条件，当前可用性还要业务复测','当前全部用户都恢复了，因为最后一行成功','三条错误就是三位用户遇到故障'],answer:0,feedback:'以原文、范围和采集过程支持交接结论。'}
   ]}
];
