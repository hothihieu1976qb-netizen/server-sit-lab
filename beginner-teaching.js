'use strict';

const STARTER_LESSONS=new Set(GUIDED_COURSES.map(course=>course.id));

function starterExplanation(segment){
  const extended=nextCommandExplanation(segment);
  if(extended)return extended;
  const {command,positionals:a,opts}=segment;
  const path=a[0];
  const descriptions={
    whoami:['先认识当前账号','Linux 使用账号区分操作者。whoami 可以分成 who am I，意思是“我是谁”。输入它，就能看到当前执行命令的账号名。','这条只需要写 whoami 一个单词，然后按 Enter。','输出 student 表示当前账号叫 student。以后检查文件权限时，需要知道是哪个账号在操作。'],
    id:['看账号编号和所属组','账号除了名字还有数字编号。组用来把账号组织起来，系统可以按组分配访问权限。主组是账号默认所属的组，补充组是额外加入的组。现在先认识输出里的名字和编号。','直接输入 id，查询当前执行命令的账号。','uid 是用户编号，gid 是主组编号，groups 列出所属的组。1000(student) 表示编号 1000 对应账号 student；sitqa 是它所属的另一个组。'],
    hostnamectl:['确认正在操作哪台计算机','主机名是系统中这台计算机的名字。多人可以使用不同账号登录同一台计算机，因此账号名和主机名要分别查看。','直接输入 hostnamectl。这个单词可以先整体记成“查看主机信息”。','先找 Static hostname 这一行，后面的 sit-server-01 是本机主机名。Operating System 表示操作系统，Kernel 表示内核，下一步再分别学习。'],
    uname:['查看正在运行的内核版本','内核是操作系统中管理硬件、内存和进程的核心程序。查看它的版本，可以让另一位同学知道你实际使用的环境。','uname 是命令名；-r 是选项，要求只显示内核版本。命令与选项之间留一个空格。','把输出的完整字符串作为内核版本记录，保留后面的版本后缀。'],
    pwd:['先知道自己在哪个目录','目录可以理解为文件夹。终端有一个“当前目录”，相对路径会从这里开始查找。','pwd 是 print working directory 的缩写，用来显示当前目录。直接输入 pwd。','输出从 / 开始的一整条路径，就是当前目录的位置。'],
    cd:['切换当前目录','cd 是 change directory，意思是切换目录。后面的路径决定要进入哪里。','cd 后面留空格，再写目录。以 / 开始的是完整路径；logs 这样的名字从当前目录开始查找。','成功时通常没有文字输出。再输入 pwd，可以看到当前目录已经变化。'],
    ls:['查看目录或文件的信息','ls 用来列出目录里的名字，也可以查看权限和归属。属主是拥有这个对象的账号，属组是与它关联的组。先看本条命令要求列出什么。','-l 是小写字母 L，表示长格式；-d 表示看目录本身。-ld 把这两个选项写在一起。后面的路径是要查看的对象。','长格式最左边是权限，随后有属主和属组。例如 root sitqa 表示属主 root、属组 sitqa。末尾是对象路径。以 d 开头表示目录，以 - 开头表示普通文件。'],
    touch:['创建一个空文件，再检查它','这次用 touch 在指定目录里创建一个空文件。空文件还没有文字内容，可以用来验证当前账号是否能创建文件。','touch 后面写文件路径。/mnt/sit/permission-check 表示在 /mnt/sit 目录里创建名为 permission-check 的文件。','成功通常没有文字输出。随后执行 ls -l 文件路径，看到文件名字和属主，才能确认创建结果。'],
    find:['按文件名找位置','find 用来从一个目录往下寻找文件。先找出文件在哪里，再读取内容。','-type f 只找普通文件；-name 后面是文件名条件。双引号中的 *.log 表示名字以 .log 结尾，* 可以代表前面的任意一段名字。','每一行是一个找到的路径。access.log.1 的结尾是 .log.1，因此不符合 *.log 这个条件。'],
    head:['只看文件开头几行','日志可能很长，先看开头，可以认识每一行的格式和最早的时间。','head 是命令名；-n 后面的数字指定行数。head -n 2 表示取文件开头两行；最后写文件路径。','输出保留原文件的前两行。先读时间，再看 INFO、ERROR 和 status 等字段。'],
    tail:['只看文件末尾几行','查看末尾，可以知道日志最后记录了什么。它可能和较早发生的事情不同。','tail -n 2 表示取文件最后两行。-n 后的 2 是行数，文件路径放在最后。','这两行只代表末尾的记录。想知道此前是否发生故障，还要继续读前面的内容。'],
    less:['读文件的完整内容','less 在真实 Linux 中用于逐页阅读文件。这里把全文显示出来，让你先学会对照前后记录。','less 后面留空格，再写要读的文件路径。真实 less 可用方向键滚动，用 q 退出；本课显示一次全文。','按时间先后阅读。先找到失败，再看后面做了什么、是否出现成功请求。'],
    wc:['先看文本，再数行数','wc 来自 word count，意思是字词计数。它可以做几种统计。这次学习 wc -l，用它数文本有多少行。','-l 是短横线加小写 l（字母 L 的小写写法，区别于数字 1），来自 lines（行）。命令里要写 wc、空格、-l、空格、文件路径。','例如输出 3 /tmp/wc-demo.txt，左边的 3 是统计结果，右边是被统计的文件。先把数字和文件名分开读。'],
    grep:['找出包含指定文字的行','grep 从文本中挑出符合条件的整行。ERROR 的意思是错误，所以本次用它找错误记录。','-F 按普通文字查找；-i 忽略英文大小写；-n 在结果前加原文行号。error 或 ERROR 是要找的文字，最后是文件路径。','2: 开头表示这一行来自输入的第 2 行。找到三条错误记录后，还要看 request 编号是否有重复。'],
    systemctl:['查看一个服务是否在运行','这里的 status-app 是在后台提供功能的示例服务。程序启动后的一次运行叫进程，它的编号叫 PID。先查看服务是否正在运行。','systemctl 是服务管理工具；status 表示查看状态；status-app 是要查看的服务名。','Active: active (running) 表示现在正在运行。Main PID 是该服务主进程的编号。随后还要访问它提供的功能。'],
    ss:['查程序正在等待哪个端口的连接','端口是计算机接收某类网络请求的位置。查看监听端口，可以知道客户端应该连接哪里。','-l 只看等待连接的端口；-n 用数字显示地址和端口；-t 选择 TCP；-p 显示进程。-lntp 把它们组合起来。','LISTEN 表示正在等待连接。0.0.0.0:8080 中的 8080 是端口号，进程名可以帮助找到对应服务。'],
    curl:['实际发一次网页请求','curl 可以向一个网址发请求，把服务器回答的内容显示在终端。这里用它检查状态接口 /health。','-i 要求同时显示状态行、响应头和正文；后面的 http://… 是访问地址。127.0.0.1 表示发出这次请求的计算机自己。','HTTP 状态行里的 200 表示这一次请求成功，502 表示网关处理上游响应时遇到问题。再看正文中的 release，确认返回的是哪个应用版本。']
  };
  Object.assign(descriptions,{
    getent:['查看系统保存的组名单','系统保存了组名、组编号和成员名单。getent 可以读出这些资料。','getent 是命令名，group 表示查组，后面的 '+a[1]+' 是这次要查的组名。','输出按冒号分隔。第一段是组名，x 是密码字段占位，第三段是组编号，最后一段列出显式记录的组成员。随后用 id 和实际访问再次核对。'],
    usermod:['给指定账号追加一个组','本课要让 reportbot 获得 hostops 组的访问权限，同时保留它原来的 auditlog 组。','usermod 修改账号资料；-a 表示追加并保留原补充组；-G 后面的 hostops 是组名；最后的 reportbot 是被修改的账号。','成功通常没有输出。用 id reportbot 查看账号资料，再用新进程的 id 和实际读取确认生效。旧会话的组不会自动变化。'],
    chmod:['只改指定对象的权限','chmod 用来改变文件或目录的权限位。先确认要让谁对哪个对象做什么，再按本课批准的范围修改。','第一个参数 '+a[0]+' 是权限模式，第二个 '+a[1]+' 是目标。g 选择属组，+ 表示追加，- 表示移除，r/w/x 分别选择读、写、执行或目录经过权限。','成功通常没有输出。随后用 ls 查看权限位，再以目标账号重做刚才失败的操作；无关账号也应按任务要求复测。'],
    rpm:['先查本机装了什么','RPM 保存本机软件包的安装记录。知道仓库里有这个包以后，还需要单独核对本机是否已经安装。','rpm 是命令名；-q 表示查询；jq 是包名。加 -l 后列出该已安装包的文件，-ql 是两个短选项组合。','jq-1.6-1.lab.x86_64 中，jq 是包名，1.6 是版本，1.lab 是本课打包修订号，x86_64 表示对应 64 位 x86 CPU 架构。not installed 表示本机未安装。-ql 列出的 /usr/bin/jq 是包里程序的路径。'],
    dnf:['核对软件来源，再按批准范围安装','软件源提供可以安装的软件包及其信息，可以来自服务端或本地集合。本课只提供虚构的 ops-approved 软件源，操作不需要联网。','dnf 是软件包管理工具；info 查询信息，install 执行安装；jq 是要查询或安装的包名。需要管理权限的安装命令前加 sudo。','Available Packages 表示仓库可用候选；Installed Packages 表示本机已经安装。Name 是包名，Version 是版本，Release 是打包修订号，Architecture 是目标 CPU 架构；Repository/From repo 标明来源。安装后重新 rpm -q 并实际执行程序。'],
    command:['看看当前终端能找到哪个程序','输入 jq 这样的短名称时，终端需要从搜索目录里找到程序。command -v 用来显示这次会找到的位置。','command 是 Shell 提供的内置命令；-v 表示显示查找结果；jq 是要查的命令名。','有结果时输出程序路径；没有找到时通常没有文字输出，返回 1。再对照包记录、PATH 和程序绝对路径，判断原因。'],
    printenv:['读出当前终端的 PATH','PATH 是一个环境变量。环境变量是带名字的运行设置。PATH 保存一组目录，也就是查找程序时依次查看的文件夹。输入 jq 这种短名称时，终端会去这些目录找程序。','printenv 显示当前终端传给程序的环境设置，后面的 PATH 是要查看的设置名称。请保留 PATH 的大写。','冒号 : 分开各个目录。例如 /usr/bin:/bin 表示依次搜索这两个目录。本课出问题的终端只有 /usr/local/bin，找不到放在 /usr/bin 的 jq。'],
    export:['修改当前终端的搜索目录','先确认程序确实存在，再修正当前终端的 PATH。export 会把设置传给之后从这个终端启动的程序。','export 后面写 PATH=/usr/bin:/bin，等号两侧不加空格。冒号把两个目录分开。这次只修改当前模拟会话。','成功通常没有文字输出。重新执行 printenv PATH、command -v jq 和 jq --version，分别核对环境、查找结果和实际启动。'],
    jq:['实际运行程序，读取它返回的版本','jq 是处理 JSON 格式文本的小工具，课程里的 checks.json 就是一份这样的输入。包记录存在以后，还要启动程序确认它能执行。本课先练版本检查。','jq 是程序名，--version 要求显示版本。/usr/bin/jq --version 则直接指定程序的完整路径，省去按 PATH 搜索的过程。','jq-1.6 表示这次运行的程序返回版本 1.6。接下来还要以任务账号运行巡检脚本，再读取本轮报告。'],
    journalctl:['从服务日志里找具体消息','日志保存程序运行时写下的消息。失败状态说明程序出了问题，日志帮助你知道发生了什么。','journalctl 是读日志的工具；-u 后面指定服务；-b 选择本次启动；-b -1 选择上次启动；-k 只保留内核消息，会过滤掉这里的应用日志。','先核对这次查询的服务和启动轮次，再找与本次失败有关的消息。旧错误会继续留在日志里，修复后要对照新的启动记录和业务访问。'],
    [HOST_REPORT_SCRIPT]:['用任务账号手工运行巡检','这是课程提供的巡检脚本。它读取 checks.json，用 jq 处理输入，再生成 latest.json 报告。','/opt/host-report/bin/collect 是脚本的完整路径。前面的 sudo -u reportbot 让这一次脚本以 reportbot 账号执行。','Wrote 后面是输出报告的路径。还要 cat 读回报告，核对 runId、boot、source 和本轮执行结果。'],
    sim:['认识本课辅助动作','sim 是实验室提供的模拟辅助命令，用来调整本课指定的环境。','session 后面写账号名，打开一个新模拟会话并读入当时的组；app-port 后面写端口号，保存虚拟应用配置。','辅助动作完成后，还要用普通查看命令确认实际状态。改了账号资料、会话或配置后，分别验证身份或运行结果。']
  });
  if(command===PACKAGE_JQ)return descriptions.jq;
  if(command==='id'&&a.length)return ['查看保存的账号资料','id 后面写账号名时，查询的是系统保存的该账号资料。它可以和已经运行的旧会话不同。','这次是 id '+a[0]+'。id 是命令名，'+a[0]+' 是要查询的账号名。','先在 groups 里找目标组名。随后执行不带账号名的 id，或以目标账号启动新命令，对照进程实际使用的组。'];
  if(command==='sim'&&a[0]==='session')return ['打开一个新的模拟账号会话','本课用它模拟重新登录时读取用户和组。打开的会话会保存当时的组信息。','sim 是本课辅助工具，session 表示打开新会话，'+a[1]+' 是账号名。输入后观察提示符中的账号名。','再输入 whoami 和 id，核对当前会话的执行身份。以后只修改账号资料时，这个旧会话的组仍保持原样。'];
  if(command==='sim'&&a[0]==='app-port')return ['保存应用的端口配置','本课用这个辅助动作代替编辑虚拟配置文件。保存后，还要让服务重新读取配置。','sim 是本课辅助工具，app-port 表示设置应用端口，'+a[1]+' 是要保存的端口号。','Saved APP_PORT=… 表示保存成功。用 cat 读配置，再重新启动应用并复测端口和访问。'];
  if(command==='systemctl'&&a[0]==='restart')return ['重新启动指定服务','保存配置之后，程序可能仍在用原来的配置。重启会停止并重新启动服务，让它重新读取配置。','systemctl 是服务管理工具，restart 表示重新启动，'+a[1]+' 是服务名。前面的 sudo 表示本课预授权的管理操作。','成功时可能没有输出。再用 systemctl status、监听端口和实际请求确认。重启仍失败时继续读本次启动日志。'];
  if(command==='cat'){
    if(path===HOST_REPORT_RESULT)return ['读回本轮巡检报告','程序显示已经写出文件以后，打开它确认内容和来源。旧文件可能仍然留在这个位置。','cat 是读取文件，后面的 '+path+' 是报告路径。','generatedAt 是生成时间，boot 是第几次模拟启动，source 是触发来源（manual 手工、cron 计划任务），account 是执行账号，checks 是汇总项数，runId 是本课脚本的运行编号。把这些值和本轮执行对应起来。'];
    if(path===HOST_REPORT_INPUT)return ['读取提供给脚本的输入','这是课程提供给巡检汇总脚本的输入文件。先知道脚本会读取哪些文字，再用目标账号验证能否打开。','cat 后面写输入文件的完整路径。sudo -u reportbot 表示这一次用 reportbot 账号读取。','check 字段给出项目名称，status 字段给出保存的状态。root-filesystem 是根文件系统，network-address 是网络地址，service-units 是服务单元。'];
    if(path==='/tmp/wc-demo.txt')return ['先自己数这三行文字','这是一份练习文件，里面每一行放了一个水果的英文名字。先读内容，用眼睛数一共有几行。','cat 后面留一个空格，再写 /tmp/wc-demo.txt。这个路径是练习文件的位置。','apple、banana、orange 各占一行，所以共有 3 行。下一条 wc -l 会让计算机再数一次。'];
    const os=path==='/etc/os-release';
    return os?['读取操作系统的版本文件','发行版把内核和常用工具组合成可安装的系统。银河麒麟 V10 就是本课使用的发行版。系统把发行版名称和版本保存在这个文件里。','cat 表示读取文件内容；/etc/os-release 是文件的完整路径。cat 和路径之间留一个空格。','NAME 后面是发行版名称，VERSION_ID 后面的 V10 是发行版版本。uname -r 查看的是内核版本，交接时分别记录。']:
      ['先把文件内容显示出来','cat 用来把文件里保存的文字显示到终端。读完内容，再决定需要统计或筛选什么。','cat 后面留一个空格，再写文件路径。路径指定这次要读哪个文件。','输出就是该文件保存的文字。先逐行阅读；配置文件里找设置项，日志文件里看时间和运行记录。'];
  }
  return descriptions[command]||[segment.spec?.purpose||'认识这条命令','先看本条命令要完成什么。','在下面逐项看命令名、选项和目标。','把实际输出与本步需要确认的内容对应。'];
}

function starterPermissions(output){
  const match=output.match(/^([d-])([rwx-]{9})\s+\d+\s+(\S+)\s+(\S+)/);
  if(!match)return '';
  const [,type,bits,owner,group]=match;
  return '<div class="starter-flow"><h4>把这一行权限分成三组读</h4><p>开头的 <code>'+type+'</code> 表示'+(type==='d'?'目录':'普通文件')+'。接下来的九个位置，每三个组成一组。</p><table><thead><tr><th>三个位置</th><th>对应谁</th></tr></thead><tbody><tr><td><code>'+bits.slice(0,3)+'</code></td><td>属主 '+esc(owner)+(owner==='root'?'；root 是管理员账号。':'。')+'</td></tr><tr><td><code>'+bits.slice(3,6)+'</code></td><td>属组 '+esc(group)+' 的成员。</td></tr><tr><td><code>'+bits.slice(6)+'</code></td><td>其余用户。</td></tr></tbody></table><p>'+ (type==='d'?'目录的 r 允许列出名字，w 允许创建或删除条目（还需 x），x 允许经过目录查找里面的文件。':'文件的 r 允许读内容，w 允许改内容，x 允许把它作为程序执行。')+'横线 - 表示没有这一项权限。用 id 的 groups 对照目录属组，可以判断自己属于哪一类。</p><p>整行从左到右是权限、链接数、属主、属组、大小（字节）和路径。目录这里的大小描述目录自身，目录里文件的内容大小需要另外查看。</p></div>';
}

function renderStarterGuide(target='starter-guide',options={}){
  const host=$(target);
  if(!host)return;
  const course=options.lesson||currentGuidedCourse(),run=options.run||getGuidedRun();
  const commands=options.commands||course.steps[run.step].commands;
  const selected=options.index??(run.walkthrough?.step===run.step?Math.min(run.walkthrough.index,commands.length-1):0);
  const raw=commands[selected],parsed=analyseInput(raw),segment=parsed.segments[0];
  const [title,why,structure,generalReading]=starterExplanation(segment);
  const outputVocabulary=renderTerms([title,why,generalReading,raw].join(' '));
  // Preview only a cloned machine. It must never advance actual practice evidence.
  const example=simulatePracticeCommand({machine:structuredClone(run.machine),events:[],sequence:0},parsed);
  const compound=parsed.segments.length>1||parsed.operators.length;
  let reading=segment.command==='wc'&&example.newlineCount!==undefined?'这一次左边的 '+example.newlineCount+' 是数出的行数；右边的 '+segment.positionals[0]+' 是被统计的文件。先读这个文件的内容，再核对数字。':generalReading;
  if(segment.command==='whoami'&&!example.failed)reading='输出 '+example.output.trim()+'，表示这一次命令正在以 '+example.output.trim()+' 账号执行。';
  if(segment.command==='id'&&example.members)reading='本条查的是 '+example.queried+(example.identitySource==='database'?' 的账号资料。':' 的当前执行进程。')+'uid 是用户编号，gid 是主组编号，groups 列出所属组。本次所属的组为 '+example.members.join('、')+'；把这次结果与账号资料、新进程和旧会话分别对照。';
  if(segment.command==='tail'&&segment.positionals[0]===HOST_REPORT_LOG)reading='每行前面是时间和执行账号。source=manual 表示手工触发，source=cron 表示计划触发；exit=0 表示该次脚本成功结束；run 是运行编号。用它对照报告的 runId。';
  if(segment.command==='systemctl'&&example.kind==='web-app-status'&&example.failed)reading='Active: failed 表示服务失败。Main PID 这行记录已退出的进程，status=78/CONFIG 是本课程序报告的配置错误；查询状态命令自身返回 3。下一步读本次启动的服务日志，找具体原因。';
  const fields=[...teachingRows(segment,example.output,example),...outputFields(parsed,example.output)];
  const definitions=fields.length?'<details class="starter-fields" open><summary>对照本次输出，逐项读字段</summary><table><thead><tr><th>字段</th><th>本次值</th><th>表示什么</th></tr></thead><tbody>'+fields.filter((field,index)=>fields.findIndex(f=>f.field===field.field)===index).map(f=>'<tr><td>'+esc(f.field)+'</td><td><code>'+esc(f.actual)+'</code></td><td>'+esc(f.meaning)+'</td></tr>').join('')+'</tbody></table></details>':'';
  const permissions=segment.command==='ls'&&segment.opts['-l']?starterPermissions(example.output):'';
  const pipe=compound?'<div class="starter-flow"><h4>这一长条命令按顺序做什么</h4><ol>'+parsed.segments.map(s=>'<li><code>'+esc(s.words.join(' '))+'</code> — '+esc(starterExplanation(s)[0])+'</li>').join('')+'</ol><p>竖线 <code>|</code> 把前一步的文字结果交给后一步。<code>&gt;</code> 把结果覆盖保存到文件，<code>&gt;&gt;</code> 把结果追加到末尾。</p></div>':'';
  const wc=segment.command==='wc'?'<div class="starter-demo"><h4>先用三行文字看懂 wc -l</h4><pre>apple\nbanana\norange</pre><p>自己数，这里有 3 行。输入 <code>cat /tmp/wc-demo.txt</code> 可以读到这三行；再输入 <code>wc -l /tmp/wc-demo.txt</code>，结果应是 <code>3 /tmp/wc-demo.txt</code>。</p><div class="inline-actions">'+practiceCommandButtons(['cat /tmp/wc-demo.txt','wc -l /tmp/wc-demo.txt'])+'</div><details><summary>理解行数以后，再了解换行符的细节</summary><p>准确地说，wc -l 统计换行符。这个示例每行末尾都有换行，所以结果是 3。一个文件如果最后一行没有换行，wc -l 的数值可能比肉眼看到的行数少 1。</p></details></div>':'';
  const log=['head','tail','less','grep'].includes(segment.command)&&example.output.includes('request=')?'<details class="starter-log" open><summary>日志里的英文和数字怎么读</summary><p>日志是程序按时间写下的运行记录。<code>2026-11-19T09:00:05Z</code> 是 UTC 时间；<code>INFO</code> 是普通信息，<code>WARN</code> 是提醒，<code>ERROR</code> 是错误。</p><p><code>request=r101</code> 是这次请求的编号；<code>path=/orders</code> 是请求的网址路径；<code>status=502</code> 是这次请求的 HTTP 状态。编号相同的多行可能属于同一个请求。</p><p><code>upstream=127.0.0.1:8080</code> 是代理要连接的后端地址和端口；<code>retry=1</code> 表示一次重试；<code>release=v1 rollback=complete</code> 是程序记录已经回滚到版本 v1。</p></details>':'';
  host.innerHTML='<p class="section-kicker">先学会一条，再做下一条</p><div class="starter-tabs" role="group" aria-label="逐条学习本步命令">'+commands.map((cmd,i)=>'<button type="button" data-starter-index="'+i+'" aria-pressed="'+(i===selected)+'">'+esc(cmd)+'</button>').join('')+'</div><h3>'+esc(title)+'</h3><p>'+esc(why)+'</p>'+outputVocabulary+measurementExample(segment)+wc+'<h4>这次怎样写</h4><pre class="starter-command">'+esc(raw)+'</pre><p>'+esc(structure)+'</p>'+pipe+'<details open><summary>逐个查看命令里的各部分</summary><table><thead><tr><th>写的部分</th><th>表示什么</th></tr></thead><tbody>'+parsed.segments.flatMap(s=>s.parts).map(p=>'<tr><td><code>'+esc(p.token)+'</code></td><td>'+esc(p.meaning)+'</td></tr>').join('')+'</tbody></table></details><h4>当前模拟机的输出预览</h4><pre class="starter-output">'+esc(example.output||(example.reason==='no-match'?'（本次没有匹配行，grep 返回 1）':example.failed?'（本次未取得结果，请执行后查看右侧解析）':'（成功时通常没有文字输出）'))+'</pre><p>'+esc(reading)+'</p>'+definitions+permissions+log+'<div class="starter-do"><h4>现在自己做一次</h4><p>点击下面的命令按钮会填入终端。按 Enter 执行，观察终端回答，再回到下方的“本步证据”与理解题。上面的预览只供阅读，正式进度由你的实际操作产生。</p>'+'<button type="button" data-practice-command="'+esc(raw)+'">把这条命令填入终端</button>'+(selected+1<commands.length?'<button type="button" data-starter-index="'+(selected+1)+'">阅读下一条命令 →</button>':'')+'</div>';
  if(options.lesson){
    host.innerHTML=host.innerHTML.replaceAll('data-starter-index','data-academy-guide-index').replaceAll('data-practice-command','data-course-id="'+esc(options.lesson.id)+'" data-course-fill');
  }
}
