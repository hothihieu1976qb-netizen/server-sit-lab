'use strict';

// Shared lesson vocabulary. Each entry explains the idea, a visible field and its use.
const LINUX_CONCEPTS = {
  identity:['登录身份','一个终端会话以某个账号执行命令。系统按 UID 和组成员关系判断它可以访问什么。','whoami 给出当前有效用户名。id 把用户名、数字 UID 和所属组放在同一行。'],
  host:['主机与发行版','主机名标识当前机器。发行版把内核、系统工具和软件包组合为一个可使用的系统。','hostnamectl 的 Static hostname 是主机名。/etc/os-release 的 VERSION_ID 记录发行版版本。'],
  kernel:['运行中的内核','内核管理进程、内存和设备。发行版升级、内核安装和实际启动的内核是三件可分别核验的事。','uname -r 中的 -r 只取正在运行的内核发行号。交接时保留完整后缀。'],
  directory:['路径与目录','以 / 开头的是绝对路径。/mnt/sit 表示从根目录经过 mnt 再到 sit。目录存放名字与文件之间的关系。','ls -ld 中 -l 给出长格式，-d 查看目录本身。首字符 d 表示目录，后九位按属主、属组、其他用户分组。'],
  access:['目录的读、写、进入','目录的 r 允许列出名字，x 允许经过目录查找条目，w 与 x 配合可创建条目。判断权限还需核对执行者属于哪一组。','drwxrwxr-x 的中间 rwx 是属组权限。touch 首次创建空文件，成功通常无输出，随后可用 ls 核对。'],
  process:['进程与服务','运行中的程序有进程号 PID。systemd 用服务单元管理进程，保留它的运行状态。','systemctl status 的 Active 行说明单元现状，Main PID 标识主进程。还需要单独验证它是否响应请求。'],
  exit:['进程退出码','程序主动退出时可以给调用者一个数字结果。0 通常表示成功，其他数值的含义要结合程序约定和日志。','code=exited 表示进程主动退出。status=78/CONFIG 在本课表示应用报告配置错误。systemctl status 自身的返回码与主进程退出码分别记录。'],
  journal:['按服务与启动轮次读日志','系统日志收集进程运行时的消息。同一服务可以在不同启动轮次因不同问题失败，旧错误也会在修复后留存。','journalctl -u status-app -b 选本次启动的服务日志；-b -1 取上次启动；-k 会把范围收窄到内核消息，应用日志可能因此被排除。'],
  config:['保存配置与运行配置','服务通常在启动时读取配置。文件已修改时，原来的进程或失败状态可能继续存在。','cat 读保存的配置，restart 重新启动并读取它。之后用状态、端口和业务请求复查生效情况。本课 sim app-port 代替编辑虚拟配置文件。'],
  socket:['地址与监听端口','客户端用地址找到主机，用端口找到服务。127.0.0.1 指发起请求的机器自己。','ss -lnt 中 -l 选监听套接字，-n 保留数字，-t 选 TCP。0.0.0.0:8080 表示监听本机所有 IPv4 地址的 8080 端口。'],
  http:['网关与 HTTP','用户请求先到网关，网关再连接应用。检查应用本机和用户入口可以把问题范围缩小到不同的一段。','curl -i 同时显示状态行、响应头和正文。200 后要核对业务内容；502 表示网关处理上游响应时遇到了问题。'],
  schedule:['计划任务','调度服务按时启动脚本，账号权限、依赖软件和运行时间都会影响结果。','同一轮派发日志、脚本退出码和新生成的报告可以串起一次运行。'],
  recovery:['备份与恢复点','备份记录某一时刻的数据。恢复到隔离目标后，对照备份之后发生的业务写入才能知道缺了什么。','同时核对数据库记录与业务接口。只看到文件存在或 HTTP 200 不能证明订单齐全。'],
  container:['镜像、容器与卷','镜像提供程序和初始文件，运行实例是容器，数据卷可以在容器重建后保留数据。','记录发布前后的版本和业务数据。用重建后的读取结果验证持久化。'],
  monitor:['采集与业务健康','监控采集成功说明指标端点可读。服务依赖仍可能失败。告警规则通常还要求异常持续一定时间。','分别核对采集目标、依赖指标、告警状态和实际业务响应。'],
  endpoints:['集群服务发现','Service 用标签选择后端。EndpointSlice 记录能接收流量的地址，Pod Ready 表示该 Pod 自身就绪。','对照选择器、Pod 标签与 EndpointSlice 中的地址，再从服务入口发起请求。'],
  queue:['排队与尾延迟','并发请求可能等待可用工作槽。响应时间包含等待与处理。','P95 表示约 95% 的请求耗时不超过这个值。比较调节前后的结果时保持并发数与工作量一致。']
};

const foundationEvidence=(kind,match=()=>true)=>labEvidence(kind,e=>!e.failed&&!e.pipeline&&!e.fromPeer&&match(e));
const userGroup=foundationEvidence('identity',e=>e.command==='id'&&e.group==='sitqa');
const osVersion=foundationEvidence('os',e=>e.output.includes('VERSION_ID='));
const runningKernel=foundationEvidence('kernel',e=>e.output.includes(e.environment.kernel));
const appRunning=webEvidence('web-app-status',e=>e.port>0);
const appListening=webEvidence('web-sockets',e=>!e.fromPeer&&e.port>0&&e.output.includes(':'+e.port));
const localHealthy=webEvidence('web-http',e=>!e.viaProxy&&e.headers&&e.status===200);
const entryStatus=status=>webEvidence('web-http',e=>e.viaProxy&&e.headers&&e.status===status);

const FOUNDATION_COURSES=[
  {id:'linux-first-login',track:'linux',group:'Linux 共同基础',level:'基础',title:'第一次登录，认清账号和系统',
    description:'从第一次输入命令开始，认识当前账号、计算机名字和系统版本。每条命令都先拆开讲，再亲手执行。',initial:{},
    recap:'你已经可以把账号、主机名、发行版和运行内核分别写入交接记录。',
    steps:[
      {title:'确认当前身份',goal:'本步认识三条命令。先用 whoami 查看当前账号名，再用 id 看账号编号和所属组，最后用 hostnamectl 找到这台计算机的名字。点击下方命令标签，逐条学习。',
       knowledge:['identity','host'],concept:'终端是用文字操作计算机的窗口。输入框前的 student@sit-server-01:~$ 是提示符。只输入命令本身，按 Enter，下面返回的文字就是命令输出。',commands:['whoami','id','hostnamectl'],
       checks:[['执行 whoami，读到当前账号名',foundationEvidence('identity',e=>e.command==='whoami')],['执行 id，读到账号编号和所属组',userGroup],['执行 hostnamectl，找到主机名',foundationEvidence('hostname')]],
       question:'另一位同学登录同一台机器，哪项最可能随账号改变？',choices:['静态主机名','有效用户名和所属组','内核发行号'],answer:1,feedback:'账号决定执行身份，多人登录同一主机时应分别记录。',
       example:['读一条身份记录','uid=1002(lee) gid=1002(lee) groups=1002(lee),2010(ops)','lee 是用户名，ops 是此账号的补充组。','用当前终端的 id 输出核对自己的组。']},
      {title:'区分两种版本',goal:'先读系统保存的版本文件，找到 VERSION_ID 后面的 V10；再执行 uname -r，记录运行内核的完整版本。',knowledge:['host','kernel'],concept:'发行版包含内核和常用工具，例如本课的银河麒麟 V10。内核是其中管理硬件和进程的核心程序。两条命令分别查看这两种版本。',commands:['cat /etc/os-release','uname -r'],
       checks:[['读取发行版的版本字段',osVersion],['取得实际运行的内核发行号',runningKernel]],
       question:'同事问“相同发行版的两台主机，当前运行的内核是否一样”，应比较哪项？',choices:['两边的 uname -r 输出','两个用户名','两个主机名'],answer:0,feedback:'对照完整内核发行号，同时把发行版作为另一项背景记录。',
       example:['把版本写进两列','示例主机的 VERSION_ID="12"，uname -r 输出 6.1.0-example。','前者来自发行版文件，后者来自运行内核。','以本机输出填写自己的记录。']}
    ]},
  {id:'linux-directory',track:'linux',group:'Linux 共同基础',level:'基础',title:'在共享目录里交付第一个文件',
    description:'组里给了你一个目录。先判断写入权限，再用一个空文件验证并核对属主。',initial:{fileWritable:true},
    recap:'你已经能连起执行账号、目录属组、权限位和文件创建结果。',
    steps:[{title:'判断权限，再验证创建',goal:'在模拟共享目录 /mnt/sit 判断 student 是否能创建文件，然后创建 permission-check，复查文件属主。',
      knowledge:['identity','directory','access'],concept:'按当前账号所属组解释权限，再用最小的实际操作验证。',commands:['id','ls -ld /mnt/sit','touch '+LAB_PROBE,'ls -l '+LAB_PROBE],
      checks:[['读取账号组和目录权限',c=>userGroup(c)&&foundationEvidence('file-list',e=>e.directory&&e.groupWrite)(c)],['成功创建后取得该文件的属主记录',({events})=>{const made=events.find(e=>e.kind==='file-create'&&e.target===LAB_PROBE&&!e.failed&&!e.pipeline);return made&&events.some(e=>e.seq>made.seq&&e.kind==='file-list'&&!e.failed&&!e.pipeline&&e.target===LAB_PROBE&&/^-\S+\s+\d+\s+student\s/.test(e.output));}]],
      question:'目录属主是 root，student 为什么仍能在这里创建文件？',choices:['所有绝对路径都可写','能列出名字就一定能创建','student 属于目录的属组，该组有写和进入权限'],answer:2,feedback:'交接时给出组成员记录、目录权限和新文件的属主。',
      example:['从左到右读权限','drwxr-x--- 2 root editors … /srv/drafts','editors 成员可以进入和列出目录，但属组权限没有 w。','换成你实际看到的权限位，判断写入结果并验证。']}]},
  {id:'linux-service-basics',track:'linux',group:'Linux 共同基础',level:'基础',title:'从运行进程查到网站响应',
    description:'一项已上线的状态服务交给你值班。分开核对服务进程、监听端口和用户入口。',initial:{workload:'status-web',initialRelease:'v1'},
    recap:'你已经从进程、套接字和应用响应三层验证了网站，下一次可以独立判断异常发生在哪一段。',
    steps:[{title:'找到服务的门牌号',goal:'应用主机 A 上运行着 status-app。找到主进程和它监听的 TCP 端口。',knowledge:['process','socket'],
      concept:'服务端口与进程号有不同用途。先确认进程，再去套接字表看监听地址。',commands:['systemctl status status-app','ss -lntp'],checks:[['查到 status-app 的运行状态',appRunning],['取得应用主机的监听记录',appListening]],
      question:'Main PID 和监听端口各用来做什么？',choices:['都用来识别主机','PID 标识进程，端口供客户端建立连接','客户端连接 PID，系统用端口标识进程'],answer:1,feedback:'同一进程可有多个监听套接字。继续验证业务返回。',
      example:['分开读两行','Main PID: 412；LISTEN … 0.0.0.0:9000','412 是进程号，9000 是示例服务的 TCP 端口。','在本机端口表对应行查找程序名。']},
      {title:'用请求走完访问路径',goal:'先从 A 访问本机 /health，再访问网关 '+LAB_PEER+' 的 /health。核对两份响应的状态和版本。',knowledge:['socket','http'],
       concept:'本机请求验证应用，经过网关的请求验证用户入口。',commands:['curl -i '+WEB_LOCAL_URL(8080),'curl -i '+WEB_PROXY_URL],checks:[['取得应用本机的状态行和响应体',localHealthy],['取得网关入口的成功响应',entryStatus(200)]],
       question:'本机成功，用户仍报告故障。应优先补充哪项证据？',choices:['从用户所用入口复测同一路径','再查一次用户名','只记录进程仍在运行'],answer:0,feedback:'两个观察位置分别验证应用与入口。保留请求地址、状态和响应内容。',
       example:['看见请求经过哪里','http://127.0.0.1:9000/health 与 http://网关地址/health','两条请求可能经过不同的转发链。','分别看状态行和响应体中的业务字段。']}]},
  {id:'linux-service-logs',track:'linux',group:'Linux 共同基础',level:'基础',title:'服务退出后，从哪里找到原因',
    description:'网站入口失败。区分本次配置错误与旧的权限错误，修正后用端口和业务请求确认恢复。',
    initial:{workload:'status-web',initialRelease:'v1',appConfigFault:true},
    recap:'你已经把退出码、服务日志、配置与业务复测连成证据链。历史错误可以保留；恢复结论要依靠变更后的运行和请求结果。',
    steps:[
      {title:'先记录失败现场',goal:'用户报告状态页打不开。查看 status-app 的状态、A 的 TCP 监听和用户入口。先记录，再处理。',
       knowledge:['process','exit','socket','http'],concept:'failed 说明单元失败。退出码提示方向，具体原因仍需日志支持。',
       commands:['systemctl status status-app','ss -lntp','curl -i '+WEB_PROXY_URL],
       checks:[['取得本轮失败状态及应用退出码',({events,machine})=>events.some(e=>e.kind==='web-app-status'&&e.webRevision===machine.web.revision&&!e.pipeline&&e.failed&&e.processExitCode===78)],
         ['确认应用未监听，用户入口失败',c=>webEvidence('web-sockets',e=>!e.fromPeer&&e.port===0)(c)&&entryStatus(502)(c)]],
       question:'Main PID 行显示 status=78/CONFIG，此刻能确认什么？',choices:['网线一定损坏','应用报告配置相关退出，还需日志定位具体配置项','所有服务都必须用 78 表示失败'],answer:1,feedback:'本课应用选择 78 表示配置错误；同时记录它输出的具体消息。',
       example:['读退出结果','Active: failed (Result: exit-code)；Main PID: … (code=exited, status=78/CONFIG)','这是被管理进程退出后的状态，PID 可能属于已经退出的进程。','确认日志范围，查同一个服务本次启动的消息。']},
      {title:'把当前错误和旧错误分开',goal:'分别查询本次与上次启动的服务日志，再读取应用配置。找到支持本次故障判断的字段。',
       knowledge:['journal','exit','config'],concept:'先核对日志属于哪次启动和哪个服务，再关联配置内容。用 -k 会过滤掉这里的用户态应用消息。',
       commands:['journalctl -u status-app -b -1','journalctl -u status-app -b','cat '+WEB_APP_CONFIG],
       checks:[['读取上次启动与本次启动的服务日志',c=>webEvidence('web-app-log',e=>e.previousBoot&&!e.kernelOnly&&e.output.includes('Permission denied'))(c)&&webEvidence('web-app-log',e=>!e.previousBoot&&!e.kernelOnly&&e.output.includes('invalid APP_PORT'))(c)],
         ['读取当前 APP_PORT 的配置值',webEvidence('web-app-config',e=>e.configPort==='eight-thousand')]],
       question:'哪组证据支持本次的原因判断？',choices:['上次的 Permission denied，所以先改目录权限','本次 invalid APP_PORT 与配置中的非数字值吻合','只要任意日志出现 error 就重装系统'],answer:1,feedback:'把本次 APP_PORT 报错与保存的值对应起来。旧权限错误属于另一轮启动。',
       example:['查询范围决定看到什么','journalctl -u example.service -b -1','-u 选单元，-b -1 选上一次启动。日志文件需有相应历史记录才能查到。','把命令范围和消息一起写入记录。']},
      {title:'修正配置，重新启动并复测',goal:'获准把虚拟 APP_PORT 恢复为 8080。保存后先查看状态，再重启应用，最后复测本机和用户入口。',
       knowledge:['config','journal','http'],concept:'本课 sim app-port 只修改模拟文件。真实工作使用批准的配置变更方式，保存后再通过服务管理和业务验证生效。',
       commands:['sim app-port 8080','cat '+WEB_APP_CONFIG,'systemctl status status-app','sudo systemctl restart status-app','systemctl status status-app','ss -lntp','journalctl -u status-app -b','curl -i '+WEB_LOCAL_URL(8080),'curl -i '+WEB_PROXY_URL],
       checks:[['保存后观察到尚未恢复的运行状态',({all})=>all.some(e=>e.kind==='web-app-status'&&e.failed&&all.some(c=>c.kind==='web-config'&&c.seq<e.seq&&c.webRevision===e.webRevision&&c.configPort==='8080'))],
         ['重新启动后核对当前状态和监听端口',c=>webEvidence('web-restart',e=>e.active)(c)&&appRunning(c)&&appListening(c)],
         ['保留启动记录及两处成功响应',c=>webEvidence('web-app-log',e=>!e.previousBoot&&!e.kernelOnly&&e.output.includes('listening on 0.0.0.0:8080'))(c)&&localHealthy(c)&&entryStatus(200)(c)]],
       question:'修复后日志里仍有 invalid APP_PORT，应怎样判断？',choices:['删除日志就代表恢复','任何旧错误都会让应用继续失败','对照新启动记录、当前状态和业务响应判断'],answer:2,feedback:'历史保留便于解释经过。用变更后重新采集的证据确认恢复。',
       example:['文件与运行状态','APP_PORT=8080 已保存，但 Active 仍显示 failed。','保存和启动是先后发生的两个动作。','重新启动后查监听，最后请求用户入口。']},
      {title:'独立交接恢复结果',independent:true,goal:'交接前重新采集应用状态、当前启动日志、监听端口和两处 /health 响应。填写应用退出码（成功启动记 0）和本轮 HTTP 状态，再判断是否恢复。',
       checks:[['本步重新取得状态、端口与当前服务日志',c=>appRunning(c)&&appListening(c)&&webEvidence('web-app-log',e=>!e.previousBoot&&!e.kernelOnly&&e.output.includes('listening'))(c)],
         ['本步取得应用和用户入口的成功响应',c=>localHealthy(c)&&entryStatus(200)(c)]],
       readings:[['port','应用监听的 TCP 端口',()=> '8080'],['exit','应用启动退出码',m=>String(m.web.exitCode)],['local','本机 HTTP 状态码',()=> '200'],['gateway','网关 HTTP 状态码',()=> '200']],
       question:'哪条交接结论与本轮证据一致？',choices:['已恢复：保存配置后重启成功，本机和用户入口均响应；保留前后日志','已恢复：仅因为文件已保存','未恢复：旧启动的权限错误仍留在日志里'],answer:0,feedback:'交接说明关联原因、变更、生效和用户入口复测。'}
    ]},
  {id:'linux-foundation-check',track:'linux',group:'Linux 共同基础',level:'基础',title:'独立验收：值班交接',
    description:'换一台课程模拟机。独立核对主机、共享目录和状态服务，把本地与入口结果交给下一班。',initial:{workload:'status-web',initialRelease:'v2',fileWritable:false},
    recap:'你用本轮证据核对了运行环境、共享目录权限和服务访问路径。接下来可以练习主机日常维护。',
    steps:[{title:'提交现场观察',independent:true,goal:'在主机 A 核对当前账号组、运行内核、/mnt/sit 的目录权限，以及 status-app 的监听端口。在 A 请求本机应用和网关 '+LAB_PEER+' 的 /health，记录两处 HTTP 状态。只采集现场，不修改服务。',
      checks:[['保持交接时的应用版本',({machine})=>machine.web.revision===0],['身份、目录与运行内核',c=>userGroup(c)&&foundationEvidence('file-list',e=>e.directory&&!e.groupWrite)(c)&&runningKernel(c)],['取得本机应用端口、两处 HTTP 状态',c=>appListening(c)&&localHealthy(c)&&entryStatus(502)(c)]],
      readings:[
        ['kernel','运行内核的完整发行号',m=>kernelRelease(m)],['group','/mnt/sit 的属组',()=>'sitqa'],['port','应用监听的 TCP 端口',m=>String(WEB_RELEASES[m.web.current])],
        ['local','本机 HTTP 状态码',()=>'200'],['gateway','网关 HTTP 状态码',()=>'502']
      ],question:'按照这一轮观察，可以向下一班确认什么？',choices:['网关返回失败，说明主机必然关机','应用本机有响应，用户入口失败，还应查网关到上游的转发','收到任意 HTTP 响应即可宣布恢复'],answer:1,feedback:'本机和入口的结果划出了调查范围。具体原因仍需网关配置与日志支持。'}]}
];
