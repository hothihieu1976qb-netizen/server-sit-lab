'use strict';

// The terminal, command reference and teaching examples use the same interpretations.
const COMMAND_TEACHING = {
  uname:['确认当前运行的内核与硬件架构。','同一发行版可以启动不同内核。','用 cat /etc/os-release 补上发行版版本。'],
  lscpu:['核对体系结构、逻辑 CPU 和物理核心。','逻辑 CPU 是调度可见的线程，和物理核心数量分开记录。','用插槽数 × 每插槽核心数求物理核心，再乘每核心线程数。'],
  free:['核对可用内存、缓存与交换空间。','free 是完全空闲；available 是可供新负载使用的估计值，包含部分可回收缓存。','用 vmstat 对照换入换出，再查哪个进程在使用内存。'],
  top:['把整机 CPU 和内存现象定位到进程。','整机 CPU 百分比与单进程 %CPU 的口径不同，多线程进程的 %CPU 可以超过 100。','记下 PID 和命令，连续采样观察趋势。'],
  'ps':['按进程核对 CPU 和驻留内存。','一次进程快照有助于定位，单次 RSS 高只能作为线索。','在同样负载条件下多次采样，观察增长与回落。'],
  vmstat:['判断系统在排队、换页还是等待 I/O。','swpd 是已占用的 swap 容量。si、so 是换入与换出速率，单位与占用不同。','分别在空载、负载运行中和结束后采样。'],
  lspci:['确认设备枚举及 PCI 驱动绑定。','Kernel driver in use 指实际绑定，Kernel modules 是候选模块。','用 ip link 或 lsblk 检查设备是否最终出现在系统中。'],
  lsmod:['查看模块是否已装载。','模块可已装载而某设备仍未成功 probe。','用 lspci -nnk 和本次内核日志验证绑定及初始化。'],
  'ip link':['确认接口创建、管理开关和链路状态。','UP 标志表示管理启用，LOWER_UP 表示下层有载波。','查 ip -br addr 看接口 IPv4，再探测对端。'],
  'ip addr':['确认 IPv4 地址和前缀是否配置在目标接口。','lo 上的 127.0.0.1 仅供本机回环。','查 ip route 和对端地址，验证路径。'],
  'ip route':['确认访问目标时可以使用的路由。','带 via 的路由给出下一跳；直连路由可在同一链路查找邻居。','结合目标前缀、出口和源 IP，再做 ping。'],
  'ip neigh':['确认同链路邻居的 IP 到 MAC 映射。','邻居表可因未发流量或缓存过期而为空。','发起对端探测，再观察邻居项是否出现或失败。'],
  ping:['以 ICMP 探测网络连通性和往返时间。','收到响应说明这组 ICMP 探测往返成功。服务监听和应用吞吐还需测量。','端口问题查对端 ss，再用对应客户端重试。'],
  ethtool:['查看物理链路的协商结果。','Speed 是协商速率；Full 表示可同时收发；Link detected 是载波。','用同参数 iperf3 确认实际有效吞吐。'],
  'ethtool -i':['核对网卡接口关联的驱动、固件和 PCI 位置。','版本字段记录的是当前设备所用的相关信息。','与 lspci -nnk 和启动日志核对是不是目标设备。'],
  'ethtool -S':['对照网卡累计计数，检查错误是否持续增长。','单次累计值可能来自较早事件。不同驱动字段和口径可能不同。','在同一业务测试前后各采样一次，比较增量。'],
  ss:['确认所查询主机上的套接字和监听端口。','本机 LISTEN 不代表对端进程正在监听。','双机测试时到目标主机核对端口，并重跑客户端。'],
  lsblk:['从盘、分区和文件系统追到挂载点。','挂载列空白表示没有显示该分区的挂载点，设备仍可能正常识别。','用 findmnt 核对目标目录当前的挂载源。'],
  blkid:['读出块设备上的文件系统签名和 UUID。','这是设备读到的标识；启动配置可能写入了不同 UUID。','和 /etc/fstab 的同一挂载目标逐项核对。'],
  findmnt:['查明当前挂载的源、目标、类型和选项。','无匹配时应继续查设备与配置；目录存在仍可能落在根文件系统上。','目标测试卷得到确认后再运行写入用例。'],
  mount:['观察当前挂载，或按配置挂载指定的模拟目标。','本次配置读取或修改与实际挂载状态是两项证据。','执行 findmnt；若问题由重启触发，重启后再核对。'],
  df:['查看已挂载文件系统的容量和使用率。','Use% 针对文件系统；路径错盘、inode 和配额都可能影响空间判断。','先核对挂载源，再区分容量、配额和目录占用。'],
  'df -i':['查看已挂载文件系统的 inode 占用。','IFree 是剩余的 inode 数量，单位是个。新文件分配 inode 与剩余字节空间是两项限制。','同一挂载行对照 df -hT，再验证新建文件。'],
  ls:['核对目录本身的权限和属主、属组。','目录的 r、w、x 分别对应读取目录项、修改目录项和搜索。创建需要目标目录的写入与搜索许可。','用 id 确认执行身份与组，保留原路径验证。'],
  touch:['在目标路径验证新建或更新时间。','已存在文件可能只变更时间，确认测试路径当前是否已有文件。','对照 ls -l、findmnt 和 df -i 确定失败层。'],
  'ip route get':['查看具体目的地址实际匹配的路由。','表里同时存在多个前缀时，命中项可能与预期不同。','对照返回的 via、dev、src，再验证同一个目的地址可达。'],
  smartctl:['读取指定设备的 SMART 汇总与属性。','总体状态和单项趋势应结合看，并确认对应序列号。','对照内核日志和该盘的实际失败条件。'],
  iostat:['查看块设备在采样区间中的活动与等待。','await 包括排队与设备服务时间。%util 是忙碌比例；并行设备需结合吞吐与延迟。','控制后台负载，同参数重复跑 fio 并记录等待变化。'],
  fio:['通过明确的访问模式与参数测试文件 I/O。','有效比较要固定目标、块大小、访问模式、引擎、direct、作业数、数据集和时长。','重复采样，同时比较 IOPS、带宽和完成延迟百分位。'],
  iperf3:['测量双端点之间的有效传输。','协商速率描述链路。receiver 表示实际收到的有效传输速率。','记录端点、方向、时长、流数和端口。UDP 再记录目标发送、丢包和抖动。'],
  stress:['按 worker 数与时长施加资源压力。','内存请求取决于 worker 数乘每 worker 大小；CPU worker 数也不是百分比。','先采空载，再关联同一作业的运行中和结束后数据。'],
  'stress-ng':['按 worker 数与时长施加资源压力。','本工作区实现常用 CPU、VM 和 timeout 选项。','在负载运行中使用 free、vmstat、top 和日志取样。'],
  dmesg:['读取当前启动的内核消息并查看事件先后。','读取成功时，输出里仍可以存在硬件或负载错误。','结合设备名、事件先后和当时的测试条件，提出可验证的假设。'],
  journalctl:['按启动或服务范围检查日志。','-b -1 取上次启动；-k 选内核日志。当前和上次的证据应分开记录。','先保存异常前后的原始上下文，再做相同触发条件的回归。'],
  'cat /etc/fstab':['查看启动挂载配置。','配置文本说明计划挂什么；findmnt 才确认现在挂载了什么。','用 blkid 对照 UUID，再复查实际挂载。'],
  'cat /etc/os-release':['读取发行版标识与版本。','VERSION_ID 是发行版字段；内核版本由 uname 确认。','和实际内核版本一起记录到环境基线。']
};

const TEACHING_FAILURES = {
  'command-search':['当前环境没有找到请求的程序。','分别核对 RPM 安装记录、程序文件路径与 PATH；用绝对路径复测后再确定原因。'],
  'no-match':['本次筛选没有命中，grep 返回 1。','先核对源文件、大小写与筛选范围。这类结果不能证明整台系统没有问题。'],
  'unsupported-pattern':['本模型没有执行这次正则筛选。','本课用固定字符串练习，包含元字符的文本请显式加 -F。'],
  'module-not-found':['当前运行内核的目录里没有该模拟模块包。','先用 uname -r 确认实际版本，再用 modinfo -k 版本 模块核对包；安装匹配包后加载并复查设备。'],
  'vermagic':['模块构建标识与本次运行内核不匹配。','保存版本与失败日志，使用匹配构建的模块或回退到已验证组合；不能通过改版本字符串证明兼容。'],
  'firmware':['模块已加载，但设备初始化所需固件失败。','对照 lsmod、lspci 和本次内核日志，区分模块加载与 probe，修复后验证接口。'],
  'engine-unavailable':['所选教学内核配置没有启用这个 I/O 引擎能力。','先确认内核和配置，再选择已实现引擎。真实环境还需要检查 fio 构建与运行权限。'],
  'busy':['当前对象仍在使用中。','先停止访问该卷的模拟负载，核对挂载状态，再重试卸载或卸载模块。'],
  'no-ip':['本机接口没有可用的 IPv4。','接口及载波可能仍在。先用 ip -br addr 核对，再读持久配置。'],
  'interface-down':['接口的管理状态是关闭。','先查 ip link；启用后重新核对地址和连通。'],
  'no-carrier':['缺少物理载波。','先查 ethtool 的 Link detected，再检查线缆与对端端口。'],
  'route':['往返路径在当前模拟配置下无法建立。','对照双方地址与前缀，查看 ip route 的出口和具体路由。'],
  'unknown-peer':['目的端点不在这个双机环境的可达范围。','核对目标 IP 是否输入成 B 端地址。'],
  'no-listener':['网络已经到达目标，但目标端口拒绝连接。','到目标主机查看监听端口。连接目标和 -p 必须与服务端一致。'],
  'not-mounted':['目标测试卷没有挂载，作业未进入测试文件。','先看 findmnt 和 lsblk。确认挂载源后，才适合重跑同一负载。'],
  'no-device':['测试盘在模拟机上不可见。','先验证 lsblk 和控制器状态，恢复设备识别后再继续文件层检查。'],
  'no-interface':['本次模拟启动没有注册目标网卡接口。','对照 PCI、驱动绑定和本轮 probe 日志。'],
  'no-inodes':['新文件需要的 inode 分配失败，返回 ENOSPC。','查看目标挂载的 df -i，并与 df -hT 对照。'],
  'read-only':['写操作被只读文件系统拒绝。','通过 findmnt 与挂载消息核实 rw/ro，保留导致保护模式的证据。'],
  permission:['本次操作被权限检查拒绝。','核对执行身份、属组和目录权限，并确认是否还存在其他访问限制。'],
  'missing-package':['本机缺少所需的软件包。','先查批准的仓库和变更范围，再安装并用 RPM 确认。'],
  disabled:['此服务未设置开机启用。','用 is-active 单独检查当前是否运行；两项需分别核对。'],
  inactive:['本次查询时服务未运行。','查 systemctl status 和本次启动日志，区分未启动与启动失败。'],
  'service-failed':['目标服务当前处于失败状态。','读取当前启动中该单元的日志，核对配置和实际监听。'],
  'no-space':['向测试文件分配空间时返回 ENOSPC。','核对 df 的挂载目标、Avail 和 Use%。真实现场还要查 inode 与配额。'],
  'io-error':['测试 I/O 已发出，返回 EIO。','保留同次 dmesg 中设备与超时的前后顺序。错误本身不足以指出哪个部件损坏。'],
  'too-short':['准备好的虚拟文件小于本次读取要求。','核对 --size 与预置文件长度，再用可比较参数复测。'],
  oom:['本轮压力遇到内存不足，模拟 OOM 结束了作业。','在日志中按作业号核实，并对照运行中 available、swap 和 si/so。'],
  syntax:['命令或参数超出当前解析范围。','展开输入拆解，查看具体位置或取值。'],
  operator:['本工作区未执行这条管道或重定向。','先直接运行单条命令，并在终端或记录中查看输出。'],
  unavailable:['当前实训模型未提供该命令。','在本工作区输入 help 查看可用命令。']
};

function commandTeaching(segment){
  if(!segment)return null;
  const {command,key,opts,positionals}=segment;
  const specific=command==='ethtool'?(opts['-i']?'ethtool -i':opts['-S']?'ethtool -S':key)
    :command==='df'&&opts['-i']?'df -i':key==='ip route'&&positionals[1]==='get'?'ip route get'
    :command==='cat'?'cat '+positionals[0]:key;
  return COMMAND_TEACHING[specific]||COMMAND_TEACHING[command];
}

function teachingRows(segment,output,event){
  const lines=output.split('\n'), rows=[];
  const line=(pattern)=>lines.find(v=>pattern.test(v));
  const add=(field,actual,meaning)=>{if(actual)rows.push({field,actual,meaning});};
  if(!segment)return rows;
  const {command,key,positionals}=segment;
  if(event?.kind==='package-environment'||event?.kind==='package-environment-change')add('当前导出 PATH',event.path,'目录以冒号分隔。普通终端的 export 只作用于当前会话及其子进程，本课不自动写登录配置。');
  if(event?.kind==='package-lookup')add('本次搜索结果',event.programPath||'未找到 · exit 1','没有搜索到与没有安装需分别核对。结合包内文件和当前 PATH 判断。');
  if(event?.kind==='package-files'&&event.paths)add('包内文件',event.paths.join('\n'),'rpm -ql 把本机包记录和文件路径对应；实际可执行性还需启动程序验证。');
  if(event?.kind==='package-version'&&!event.failed)add('实际执行的程序',event.programPath+' · jq-'+event.version,event.absolute?'指定绝对路径，绕过普通命令的 PATH 搜索。':'当前普通终端找到了程序，版本由该程序返回。');
  if(event?.kind==='ops-collect'&&event.runId)add('本轮运行',String(event.runId)+' · exit '+event.exitCode,'把这次执行与日志和产物的 runId 对应。旧文件仍可能存在，需核对本次结果。');
  if(event?.kind==='ops-artifact'&&event.artifact?.runId)add('报告的运行来源','runId='+event.artifact.runId+' · boot='+event.artifact.boot+' · source='+event.artifact.source,'对照本轮运行编号、启动轮次与执行账号。manual 表示手工触发，不能代替调度验收。');
  if(event?.kind==='account-identity'){
    add('本次命令的执行者',event.account,'sudo -u 只为这一条命令指定执行账号，当前终端会话不会因此切换。');
    add('身份来源',event.identitySource==='database'?'账号资料查询':'本次执行进程','id 用户名查询账号数据库；不带用户名的 id 反映当前进程继承的身份。');
    if(event.members)add('本次所属组',event.members.join('、'),'主组和补充组均参与属组权限判断。旧会话保留它创建时的组，新进程要重新验证。');
  }
  if(event?.kind==='account-mode')add('本次权限变更',event.target+' · '+event.previous+' → '+event.mode,'这是该对象的权限位。修改后需要用目标账号验证实际读写或经过能力。');
  if(event?.kind==='account-list'&&event.mode)add('对象权限',event.mode+' · '+(event.owner||'root')+':'+(event.group||'hostops'),'三类权限从左到右对应属主、属组和其他。目录与普通文件的同一权限位有不同用途。');
  if(event?.account&&event.failed&&event.reason==='permission')add('本次执行身份与失败层次',event.account+' · '+event.layer,'directory-search 是经过目录，directory-write 是新建条目，file-read 是读取文件；结合目录和文件的权限定位。');
  if(event?.kind==='account-create'&&!event.failed)add('创建后的复核',event.target,'使用 ls -l 核对属主、主组和权限。本课固定 umask 0027，目录没有 setgid 位。');
  if(event?.workingDirectory)add('本次命令的起点',event.workingDirectory,'相对路径从这个目录解析。cd 改变本课工作目录，pwd 核对实际位置。');
  if(event?.kind==='file-find')add('查找结果',event.paths.join('\n')||'无匹配','-name 看名字，-type 看对象类型。没有匹配仍是一次正常查找。');
  if(event?.kind==='text-filter'&&!event.pipeline){
    if(event.filter==='grep')add('匹配结果',event.matches+' 行 · exit '+event.exitCode,'-n 行号属于本次输入。固定字符串匹配保留完整原始行；没有匹配返回 1。');
    if(event.filter==='wc'){
      if(segment.opts['-l'])add('这次数出的行数',event.newlineCount+' 行','-l 是小写字母 L。本课文本每行末尾都有换行，数字表示这些文本行。一个请求可能记录多行，判断请求数量还要看 request 编号。');
      if(segment.opts['-c'])add('这次统计的字节数',event.bytes+' 字节','-c 按字节计数。它描述文本大小，中文字符可能占多个字节。');
    }
    if(event.filter==='head'||event.filter==='tail')add('本次截取',event.filter+' -n '+event.limit+' · 实际 '+event.selectedLines+' 行','这是文件的一部分，继续查看另一端和完整上下文。');
  }
  if(event?.pipeline){
    add('输入来源',event.sourcePath||segment.command,'管道读取本轮前一命令的标准输出。错误消息单独显示。');
    for(const filter of event.filters||[])add('流经 '+filter.command,filter.pattern!==undefined?'匹配文本 '+filter.pattern:filter.newlineCount!==undefined?'统计 '+filter.newlineCount+' 个换行符':'截取 '+filter.selectedLines+' 行','后续命令处理上游输出。行号从它收到的输入重新计算。');
    if(event.destination)add('写入虚拟文件',event.destination+(event.redirect==='>>'?' · 追加':' · 覆盖'),'终端无正常输出时，读回目标确认内容。> 会先截断目标，读取源出错也可能留下空目标。');
  }
  if(event?.kind==='web-upstream')add('proxy_pass',line(/proxy_pass/),'网关将请求发送到这个上游地址和端口。与应用主机的 ss 监听对照。');
  if(event?.kind==='web-proxy-log')add('connect() / upstream',lines.findLast(value=>value.includes('while connecting to upstream')),'这行记录网关连接哪个上游，以及连接失败的原因。故障发生在网关到应用这一段。');
  if(event?.kind==='web-app-config')add('APP_PORT',line(/^APP_PORT=/),'应用配置中的监听端口；用 ss 验证进程当前实际监听的端口。');
  if(event?.kind==='web-app-status'){
    add('Active',line(/Active:/),'服务当前运行状态。failed 是结果，需结合应用消息判断原因。');
    add('Main PID / status',line(/Main PID:/),event.failed?'这条记录描述已经退出的应用进程。本课 78/CONFIG 是应用报告的配置错误；查询状态命令自身返回 3。':'当前主进程正在运行，继续查看端口并请求业务入口。');
  }
  if(event?.kind==='web-app-log'){
    add('本次查询范围',event.previousBoot?'上一次启动 · status-app':'当前启动 · status-app','-u 选服务，-b 选当前启动，-b -1 选上次启动。同一轮中也可能同时保留修复前后的消息。');
    add('应用消息',lines.findLast(value=>/invalid APP_PORT|listening on|Permission denied/.test(value)),'对照配置、启动先后顺序和业务复测。历史消息保留，不会因为修复而自动删除。');
  }
  if(event?.kind==='ops-schedule-read')add('计划行：分 时 日 月 星期 用户 命令',line(/^15 2 /),'每天按主机时区于 02:15 启动。cron.d 的用户字段指定 reportbot，命令使用绝对路径。');
  if(event?.kind==='ops-cron-log')add('CROND / CMD',lines.findLast(value=>value.includes(' CMD ')),'调度器已经派发命令。脚本是否完成还要查退出结果和新生成的文件。');
  if(event?.kind==='ops-job-log'){
    add('source / exit / run',lines.findLast(value=>value.includes('exit=')),'source 区分 manual 手工与 cron 定时。exit 是脚本的退出码；run 是运行编号。exit=0 还需匹配新报告；127 在本课表示依赖缺失。读取日志的 tail 自身可以成功，日志中的脚本仍可能失败。');
  }
  if(event?.kind==='ops-cron-status'){
    add('当前运行 / 开机启用',(event.active?'active':'inactive')+' / '+(event.enabled?'enabled':'disabled'),'这是两项状态：start/stop 改现在，enable/disable 改正常开机启用关系。enable 本身不启动。对本课 crond，inactive 查询返回 3，disabled 查询返回 1，是查询结果，不自动代表硬件故障。');
  }
  if(event?.kind==='ops-artifact')add('generatedAt / boot / source',lines.filter(value=>/"(generatedAt|boot|source)"/.test(value)).join('\n'),'用时间、启动轮次和生成方式排除旧报告或手工试跑。');
  if(command==='lscpu'){
    const count=label=>Number(lines.find(l=>l.startsWith(label+':'))?.split(':')[1]);
    const sockets=count('Socket(s)'),cores=count('Core(s) per socket'),threads=count('Thread(s) per core'),total=count('CPU(s)');
    if([sockets,cores,threads,total].every(Number.isFinite)){
      add('CPU 拓扑',sockets+' × '+cores+' = '+sockets*cores+' 个物理核心；'+sockets*cores+' × '+threads+' = '+sockets*cores*threads+' 个逻辑 CPU',
        '将计算值和 CPU(s)='+total+' 对照。线上还可能有离线 CPU 或非对称拓扑，应继续查在线列表。');
    }
  }
  if(command==='free'){
    const memory=line(/^Mem:/)?.trim().split(/\s+/);
    if(memory?.length>=7){
      add('total / free / available',memory[1]+' / '+memory[3]+' / '+memory[6],
        '从 Mem 行分别读取总量、完全空闲量和估计可用量。这三个值在同一条输出里使用同一单位。');
    }
    const swap=line(/^Swap:/)?.trim().split(/\s+/);
    if(swap?.length>=4)add('Swap used',swap[2],'这里是已占用容量。需要 vmstat 的 si/so 才能判断当前是否持续换页。');
  }
  if(key==='ip link'){
    const device=line(/enp3s0.*\b(?:UP|DOWN|LOWER_UP)\b/);
    if(device)add('enp3s0 的标志',device,device.includes('LOWER_UP')?'网卡已报告下层载波。还需要另外验证 IP 和端口。':'这里没有 LOWER_UP 标志，下一步核对管理状态与物理链路。');
  }
  if(key==='ip addr'&&!event?.fromPeer){
    const device=line(/^\s*enp3s0\s/)||line(/^\s*inet .*enp3s0/);
    if(device&&/\/\d+\b/.test(device))add('enp3s0 当前 IPv4',device,'斜杠后的数字是前缀长度，用来确定直连网段。核对对端是否位于同一网段。');
    else if(event?.kind==='addr'&&!event.address)add('enp3s0 当前 IPv4','No global IPv4 address','只查当前接口。lo 的 127.0.0.1 不能用来访问另一台服务器。');
  }
  if(command==='findmnt'&&event?.kind==='mount-state'&&!event.mounted&&event.target==='/mnt/sit'){
    add('/mnt/sit 当前挂载','无匹配行（退出码 1）','该查询没有发现目标挂载。下一步区分盘未识别与盘已识别但未挂载。');
  }
  if(command==='cat'&&positionals[0]==='/etc/fstab'){
    add('测试盘启动配置',line(/^\s*UUID=.*\/mnt\/sit/),'UUID 定位文件系统，/mnt/sit 是目标目录，ext4 是类型，末两列是 dump 和 fsck 顺序。');
  }
  if(command==='cat'&&positionals[0]?.includes('ifcfg-enp3s0')){
    const ip=line(/^IPADDR=/);
    add('启动时使用的 IPv4',ip?ip+'\n'+(line(/^PREFIX=/)||''):'IPADDR is absent', '启动配置和当前地址属于不同来源。用 ip addr 读取运行状态，并在重启后复查。');
  }
  if(command==='fio'&&event?.metrics){
    const {config:c,metrics:m}=event;
    add('本次实际负载',c.rw+' · '+c.bs+' · '+c.engine+' · iodepth='+c.depth+' · numjobs='+c.jobs,
      'iodepth 是单个作业的目标深度。sync 模型每作业有效深度为 1；direct 影响操作系统页缓存路径。');
    add('IOPS 与带宽',m.iops+' IOPS × '+c.bs+' ≈ '+m.bw+' MiB/s','固定块大小时两项相互关联。混合读写请先确认是汇总值还是单方向值。');
    add('完成延迟',m.clat+' ms 平均 · '+m.p99+' ms P99','P99 表示约 99% 的请求不超过该完成延迟。对比吞吐时同时记录尾部响应。');
  }
  if(command==='iperf3'&&event?.kind==='transfer'&&!event.failed){
    add('对端与实际方向',line(/^Direction:/),'-c 决定服务端地址。-R 交换数据发送与接收方向，服务端身份维持不变。');
    add('接收端结果',event.rate+' Mb/s × '+event.seconds+' 秒 ÷ 8 ≈ '+(event.rate*event.seconds/8).toFixed(1)+' MB',
      '先统一 Mb/s（比特）与 MB（字节）的口径。它和 ethtool 中的协商速率描述不同对象。');
    if(event.udp)add('UDP 目标与实际丢包','目标 '+event.offered+' Mb/s；Lost '+event.loss+'%', '目标速率可以高于路径容量。丢包比例、接收速率和 Jitter 需要分别记录。');
  }
  if(event?.kind==='load-start'){
    add('本轮负载和资源请求','作业 #'+event.id+' · '+event.cpu+' CPU worker · '+event.vm+' VM worker · 请求 '+event.memory+' GiB',
      '总内存是每 worker 请求量的乘积。先采样，再用 sim wait 推进虚拟时间观察结束原因。');
  }
  if(command==='dmesg'||command==='journalctl'){
    const clue=lines.find(l=>/failed to load|Out of memory|command timeout|UUID=.*not found|ENOSPC/i.test(l));
    add('日志内出现异常线索',clue,'日志查询已返回。把这一行与相邻时间、设备名和触发条件关联，随后验证假设。');
  }
  return rows;
}
