'use strict';

const NEXT_COMMAND_LESSONS={
  dmidecode:['从系统记录读取机型与固件','固件负责机器上电后的初始化。系统可以读取固件提供的设备描述，本课用固定教学资料演示。','dmidecode -t system 选主机信息；-t bios 选 BIOS/UEFI 固件。-t 后面的值决定查询哪一类。','Manufacturer 是厂商，Product Name 是型号，Serial Number 是序列号。固件结果中的 Vendor、Version、Release Date 分别是厂商、版本和发布日期。'],
  lscpu:['数清 CPU 的核心与线程','一个物理核心可以向操作系统提供多个可调度的逻辑 CPU。先分清这两种计数，再分配压力任务。','lscpu 是查看 CPU 信息的命令。本课直接输入 lscpu。','Architecture 是架构；Socket(s) 是处理器插槽数；Core(s) per socket 是每插槽核心数；Thread(s) per core 是每核心线程数；CPU(s) 是逻辑 CPU 总数。本机 1×8×2=16。'],
  free:['查看内存容量与可用量','程序运行需要内存。Linux 也会用内存缓存数据，所以完全空闲的量和估计还能提供给程序的量不同。','-h 用易读的容量单位；-m 用 MiB。观察 Mem 行和 Swap 行。','total 是总量，used 是已用，free 是完全空闲，buff/cache 是缓冲和缓存，available 是估计还能提供的量。Swap 是交换空间，已用量还需结合 vmstat 判断当前是否在换页。'],
  lsblk:['把整盘、分区和文件系统对应起来','整块磁盘可以划分为分区，分区中可以建立文件系统，再把它挂到目录。','lsblk 列设备；-f 增加文件系统信息；-o 后写要显示的列名。','sdb 是整盘，sdb1 是分区。FSTYPE 是文件系统类型，UUID 是它的标识，MOUNTPOINT 是挂载目录。树形缩进表达父子关系。'],
  blkid:['查看文件系统的标识','同一个文件系统可以通过 UUID 标识，在启动配置中用它寻找目标。','直接输入 blkid，读取本课可见设备的标识与类型。','设备名后面的 UUID 和 TYPE 分别是文件系统标识与类型。把 UUID 与 /etc/fstab 的配置逐字符对照。'],
  findmnt:['确认目录实际挂在哪个文件系统上','目录名字无法说明它背后是哪块盘。findmnt 查询当前挂载关系。','findmnt 后写要查的目录，例如 /mnt/sit。','TARGET 是目录，SOURCE 是提供文件系统的设备，FSTYPE 是类型，OPTIONS 是挂载选项。rw 可读写，ro 只读。'],
  mount:['查看或建立挂载关系','挂载把文件系统接到目录。系统认出一块盘之后，还需要检查有没有把正确文件系统挂到正确目录。','不带目标时查看挂载；本课 mount /mnt/sit 按已保存的 fstab 配置尝试挂载。','source on target type … 表示设备、目录与类型。成功后还要 findmnt 复查；准备重启后使用的配置则需要单独核对。'],
  umount:['解除当前挂载关系','卸载后该目录不再提供这个文件系统的内容。操作前要确认没有任务继续使用它。','umount 后写挂载目录。本课只处理 /mnt/sit。','成功通常没有输出。target is busy 表示仍在使用；先查使用者和负载，再按任务允许范围处理。'],
  df:['查看文件系统还剩多少资源','文件内容消耗容量，每个文件也需要文件系统记录它的元数据。容量和 inode 数量都可能用尽。','-h 用易读容量；-T 显示类型；-i 改为查看 inode 数量。inode 是文件系统用于记录文件属性与数据位置的结构。','Filesystem 是设备，Size/Used/Avail 是总量/已用/可用，Use% 是比例，Mounted on 是目录。-i 时看 IUsed/IFree/IUse%，单位是个。'],
  du:['找出目录占用了多少空间','先用 df 看整个文件系统，再用 du 缩小到目录，查哪部分占用多。','du -sh 路径中，-s 只汇总，-h 使用易读容量。','数字对应这个目录的统计占用。与 df 不同，du 面向文件和目录内容，不能用一个目录大小代替整个文件系统余量。'],
  lspci:['先确认设备被系统发现','PCI 是连接设备的一种总线。设备可见、模块加载、驱动绑定与接口创建是需要分别核对的环节。','-n 显示数字标识，重复 -n 同时保留名称；-k 显示驱动信息。-nnk 是组合选项。','行首是 PCI 地址。Kernel driver in use 是实际绑定的驱动，Kernel modules 是候选模块。看到候选名称后还需查加载和初始化。'],
  lsmod:['查看已经加载的驱动模块','模块是可以装入内核的代码。模块存在于磁盘、加载到内核和成功管理设备分别取证。','直接输入 lsmod。','Module 是模块名，Size 是模块大小，Used by 是引用情况。继续用 lspci 看绑定，再查接口和日志。'],
  modinfo:['读取模块文件的版本与匹配信息','模块文件需要与运行内核匹配，还可能依赖固件。先读文件信息，再判断加载结果。','modinfo 后写模块名；-k 后指定要查询的内核版本目录。','filename 是文件路径，version 是模块版本，vermagic 是内核匹配信息，firmware 是依赖固件。它们来自模块元数据，实际加载结果需另查。'],
  modprobe:['按任务加载或卸载模块','加载失败时先读具体错误，成功后也要核对设备是否完成初始化。','modprobe 模块名尝试加载；-r 表示卸载。本课只操作教学模块。','错误可能指向缺包、版本不匹配或初始化失败。加载后用 lsmod、lspci 和日志把各环节对应起来。'],
  ethtool:['查看网卡链路或驱动','链路协商速率描述网卡与对端建立的连接，实际传输还会经过更多设备和软件。','网卡名指定接口；-i 读驱动；-S 读统计；不加这些选项查看链路。','Speed 是协商速率，Duplex Full 是全双工，Link detected yes 表示检测到链路。三项描述不同属性，100Mb/s、Full、yes 可以同时成立。'],
  ping:['先做一次基本网络连通检查','ping 发送 ICMP 请求，观察目标是否响应。服务是否正常还需针对服务端口验证。','-c 后写请求次数，最后写目标地址。','time 是往返耗时，packet loss 是这次请求的丢失比例。ICMP 可能受网络策略影响，应结合地址、路由与实际业务请求判断。'],
  iperf3:['让两台机器配合测网络传输','先由服务端监听，再由客户端连接。先确认角色、目标地址和端口一致，再解释速度。','-s 服务端；-c 后是服务端 IP；-t 是秒数；-P 是并行流数；-p 是端口；-R 反向传输；-u 使用 UDP；-b 是 UDP 目标速率。','Bitrate 是每秒传输的比特数。TCP 的 Retr 是重传次数；UDP 的 Lost/Lost% 是丢失数量/比例，Jitter 是到达时间抖动。目标速率与接收结果分别记录。'],
  fio:['用固定读写方式测量磁盘表现','先确定测试文件落在哪个文件系统，再规定每次读写大小、读写方式、并发和时长。','每个 --参数=值 都约束一种测试条件。下面逐项拆开本条实际命令，先理解它再运行。','IOPS 是每秒操作次数，BW 是每秒传输量，slat 是提交延迟，clat 是完成延迟，lat 是总延迟。P95/P99 表示约 95%/99% 请求的延迟不超过该值。比较结果时同时记录参数和环境。'],
  iostat:['查看磁盘正在忙什么、等多久','性能下降时，需要看真实测试期间的读写与等待，才能判断是否有其他负载竞争。','-x 显示扩展统计，后面的数字是采样间隔；本课返回一次快照。','r/s、w/s 是每秒读写次数，rMiB/s、wMiB/s 是数据量，await 是平均等待毫秒，%util 是统计周期内设备忙碌时间比例。并行设备要结合其他证据判断瓶颈。'],
  smartctl:['读取磁盘健康线索','健康属性帮助观察设备自身的记录，需要与错误日志、控制器和复测一起分析。','-a 读取已实现的全部健康属性；最后写目标设备。','Device Model 是型号，Serial 是序列号，Reallocated 是已重映射扇区，Pending 是待处理扇区。PASSED 是一次总体判断，不能覆盖所有故障路径。'],
  stress:['启动一组可控负载','worker 是执行负载的工作进程。先说明创建几个、各自做什么、持续多久，再观察资源变化。','--cpu 是 CPU worker 数，--vm 是内存 worker 数，--vm-bytes 是每个内存 worker 的大小，--timeout 是最长时长，--io 是 sync 类负载。','例如 2 个内存 worker 各申请 2GiB，总申请 4GiB。用 top、free、vmstat 和日志观察运行中与结束后的状态。'],
  'stress-ng':['启动本课支持的压力负载','本模型实现 CPU、内存及超时这一组兼容选项。按 worker 数和每个 worker 的大小解释申请量。','--cpu 指 CPU worker，--vm 指内存 worker，--vm-bytes 指每个大小，--timeout 指最长时长。','看申请量、实际资源状态及结束原因。本课不把 stress 的 --io 选项自动套到 stress-ng。'],
  top:['找正在占用资源的进程','进程是程序的一次运行。整机负载与单个进程的占用应放在同一时间点对照。','直接输入 top。本课返回一次快照，再执行可取得后续模拟时点的快照。','PID 是进程号，COMMAND 是程序名，%CPU 是进程 CPU 占用，RES 是驻留内存。整机 us/sy/id/wa 是用户态、内核态、空闲和 I/O 等待比例。'],
  ps:['按进程查看占用','想知道是谁在消耗 CPU 或内存，可以先从进程清单缩小范围。','ps aux 中，a 包含其他用户，u 用用户格式，x 包含没有终端的进程。','USER 是执行用户，PID 是进程号，RSS 是驻留内存（本输出为 KiB），STAT 是进程状态，COMMAND 是程序。多时点对照 RSS 才能观察增长。'],
  vmstat:['同时查看排队、内存交换与 CPU','系统变慢可能来自 CPU 排队、I/O 阻塞或内存换页。把这几组信息一起读。','vmstat 1 中的 1 是一秒采样间隔；本模型输出一次快照。','r 是可运行队列，b 是阻塞进程；swpd 是交换区已用，si/so 是当前换入/换出速率；us/sy/id/wa 是 CPU 分项。交换区已用量与当前换页速度分开理解。'],
  dmesg:['读取内核记录的设备消息','驱动初始化、块设备错误与内存异常可能由内核记录，适合与应用层现象关联。','-T 使用可读的时间形式显示消息。','先找设备名、错误类型和先后顺序，再与本次操作对应。日志里有旧消息时，当前恢复状态还需重新检查。'],
  reboot:['在模拟机中重启并复查','保存配置与当前运行状态不同，重启可以检验下一次启动是否使用了预期配置。','本课 reboot 只重启课程模拟机。它会进入新的启动轮次。','重启后重新查询内核、模块、地址、挂载及服务。原启动中的成功输出不能直接充当这次启动的验证。'],
  date:['给日志对上时间和时区','先知道系统当前使用的时间与时区，再把日志、计划和产物放在一条时间线上。','直接输入 date，读取本课的模拟时间。','UTC 和本地时区可能不同。本课 crond 工单使用 UTC，02:15 以该工单时区解释。'],
  install:['把审核过的模板放到目标位置','这里的 install 是文件安装工具，用来复制文件并设置归属和权限。','-o 是属主，-g 是属组，-m 是权限模式；最后两个路径分别是源模板与目标。','成功后读取目标，并用 ls -l 核对属主、属组和权限；随后验证使用这个配置的服务。'],
  stop:['停止本轮模拟负载','出现异常或采样已完成时，结束负载，再看资源与服务是否恢复。','stop 是本实验室提供的负载停止命令。','停止后再查 top、free、vmstat 和相关日志，保留停止时刻及后续状态。'],
  pkill:['停止本课压力进程','本课限定用它结束 stress 或 stress-ng 的模拟进程组。','pkill 后面写目标压力工具名。','结束后确认本轮负载已停，再验证资源是否恢复。'],
  'save-logs':['保存本轮看到的原始输出','把具体命令、时间和返回内容留给后续分析或交接。','save-logs 是本实验室的证据保存辅助命令。','保存后读取虚拟证据文件，核对内容是否属于本次场景与启动轮次。'],
  route:['查看路由选择信息','路由决定向哪个接口、下一跳发送数据。与目标地址和接口地址一起核对。','本课 route 返回路由表快照，也可用 ip route 查询。','Destination 是目标网络，Gateway 是下一跳，Iface 是出口。默认路由用于没有更具体匹配的目标。'],
  traceroute:['观察通往目标的路径线索','逐跳探测可帮助判断路径上的响应情况，具体链路和策略仍需交叉检查。','traceroute 后面写目标地址。','每行对应一跳的探测响应。某一跳不响应还需考虑设备策略，不能只凭星号认定设备损坏。']
};

function nextCommandExplanation(segment){
  const {command,positionals:a,opts,fromB}=segment;
  if(command==='uname'&&opts['-a'])return ['一次读取系统标识','先记录操作系统正在运行的内核、主机名与架构，为之后复测建立版本记录。','uname 是命令，-a 表示显示全部系统标识。','Linux 是内核名称，sit-server-01 是主机名，后面的完整发行号是运行内核版本，x86_64 是 CPU 架构。'];
  if(command==='ip'){
    const sub=a[0]||'link';
    const roles={link:['看接口和链路','接口是系统管理网卡的对象。UP 描述管理状态，LOWER_UP 描述下层链路。','接口名、MAC 地址和状态分别记录；继续查 IP 地址。'],addr:['看接口上的地址','IP 地址用于网络通信，前缀决定地址属于哪个网络。','inet 后是 IPv4 地址，/24 表示前 24 位是网络前缀。本课 .10 和 .20 是同一 /24 的两端。'],route:['看目标怎么到达','路由是发送数据时使用的目标匹配规则。更具体的规则可能覆盖默认路由。','via 是下一跳，dev 是出口，src 是源地址。get 后指定目标可以看实际选择。'],neigh:['看本地网络的邻居记录','同一局域网发送数据需要把对端 IP 对应到链路地址。','lladdr 是对端 MAC；REACHABLE、STALE 等是邻居状态。结合地址、路由和实际请求检查。']};
    const r=roles[sub]||roles.link;
    return [r[0],r[1],'-br 是简洁格式，-s 增加统计；'+sub+' 选择本次查看的对象。后续位置参数用于本课允许的设置或具体目标。',r[2]];
  }
  if(command==='systemctl'){
    const action=a[0],unit=a[1]||'所选单元';
    if(opts['--failed'])return ['列出失败单元','单元是 systemd 管理的对象，服务和挂载都可以是单元。','--failed 只显示当前处于失败状态的单元。','UNIT 是名称，LOAD 是加载状态，ACTIVE/SUB 是总体与细分状态。空清单只说明这次没有匹配的失败单元。'];
    const acts={start:'让服务现在启动',stop:'让服务现在停止',enable:'设置正常开机流程中启用服务',disable:'移除正常开机启用设置','is-active':'查询当前是否运行','is-enabled':'查询开机启用状态','list-units':'列出单元状态'};
    if(acts[action])return [acts[action],unit+' 的“现在运行”和“以后开机启用”是两类状态。',action+' 是操作；'+unit+' 是目标。--now 与 enable/disable 配合，还会立即改变运行状态。','active 表示正在运行，enabled 表示开机启用。disabled 与 active 可以同时成立，随后还需按任务重启复查。'];
    if(action==='status')return ['查看指定服务当前状态','先检查 '+unit+' 是否加载、是否运行，再查它的日志和功能。','status 表示查看，后面是服务名。','Loaded 行给出配置加载与启用信息，Active 行给出现在的状态，Main PID 是主进程编号。failed 时继续查具体退出结果和本次日志。'];
  }
  if(command==='sim'&&a[0]==='release')return ['执行本课的发布动作','版本是一个确定的程序构建。本课比较 v1 与 v2 的监听和用户入口响应。','sim 是实验室辅助工具，release 选择发布，status 查看版本，deploy 后写版本，rollback 回到上一部署版本。','发布动作完成后，用实际服务、端口与请求确认生效。回滚后的恢复和新版缺陷的修复分别记录。'];
  if(command==='sim'&&PRACTICE_ACTIONS[a[0]]&&!['session','app-port'].includes(a[0])){
    const [purpose,values]=PRACTICE_ACTIONS[a[0]];
    return [purpose,'本动作只改变课程允许的模拟条件。先记下当前现象，再改变一项并验证。','sim 是辅助工具；'+a[0]+' 选择动作。'+values,'读取保存的配置和实际运行状态，确认本次操作影响了哪一层。具体参数如下逐项解释。'];
  }
  if(command==='cat'&&[HOST_CRON_FILE,HOST_CRON_TEMPLATE].includes(a[0]))return ['读懂每日计划的一整行','cron 按计划启动命令。系统 cron.d 文件还需要指定执行账号。','cat 读取模板或已安装的计划文件。先区分源模板与 /etc/cron.d 的实际目标。','15 2 * * * 依次是分、时、日、月、星期，表示每天 02:15。reportbot 是执行账号，之后是脚本绝对路径。本课使用 UTC。'];
  if(command==='cat'&&a[0]==='/etc/fstab')return ['读启动时的挂载配置','fstab 是系统启动时寻找和挂载文件系统的一份配置。当前已经挂载和这份配置正确分别核对。','cat 后面写 /etc/fstab。','一行依次有源标识、挂载目录、类型、选项、dump 标记和 fsck 顺序。先把 UUID 与 blkid 对照，再验证挂载与重启。'];
  if(command==='cat'&&a[0]===WEB_PROXY_CONFIG)return ['看网关要把请求交给谁','网关先接收用户请求，再向后端应用建立连接。','sim b 表示去本课主机 B 执行，cat 后面是网关配置文件。','listen 是接收用户请求的端口，proxy_pass 是后端地址和端口。把它与主机 A 的实际监听对照。'];
  const profile=NEXT_COMMAND_LESSONS[command];
  return profile?[...profile.slice(0,2),(fromB?'sim b 前缀表示在主机 B 执行。':'')+profile[2],profile[3]]:null;
}

const COURSE_TERMS={
  'I/O':'Input/Output，输入与输出。本课磁盘场景主要指读取或写入一块数据。',
  IOPS:'每秒完成的 I/O 操作次数。4KiB 请求每秒完成 1000 次，就是 1000 IOPS。',
  BW:'每秒传输的数据量，也叫吞吐量。1000 次/秒 × 每次 4KiB = 4000KiB/s，约 3.91MiB/s。',
  延迟:'一次请求从开始到完成所花的时间。平均值描述整体，P95/P99 帮助观察较慢的请求。',
  队列深度:'希望同时处于进行中的 I/O 数。并发增加可能提高吞吐，也可能增加排队时间。',
  驱动:'系统中管理设备的软件。设备可见、驱动加载、绑定成功与接口可用分别检查。',
  固件:'设备或平台初始化所需的程序或数据。版本和加载结果都可能影响设备工作。',
  UUID:'文件系统的标识，用于把启动配置和实际文件系统对应起来。',
  inode:'文件系统记录文件属性与数据位置的结构。容量尚有余量时，可用 inode 也可能用完。',
  RAID:'把多个磁盘组织成阵列的方式。不同级别对容量、冗余和性能有不同取舍。',
  HBA:'把主机连接到存储设备的适配器。应核对控制器、驱动和后面的设备路径。',
  NUMA:'不同 CPU 到不同内存区域的访问距离可能不同的一种组织方式。',
  libaio:'Linux 传统异步 I/O 接口。本课用它演示排队深度，实际效果还需结合 direct 与工作负载。',
  io_uring:'Linux 的一种异步 I/O 接口。本课是否可用取决于所选教学内核配置。',
  TCP:'提供有序可靠字节流的传输协议。重传能弥补丢失，也可能影响性能。',
  UDP:'按数据报发送的传输协议。它自身不负责确认重传，测试要观察丢包与抖动。',
  回归:'修复或变更后，重做原失败条件和相关功能，判断是否恢复以及是否引入其他问题。',
  基线:'后续比较用的已记录环境、参数与结果。对比前先确认条件一致。',
  矩阵:'按行列组合测试条件的表。例如两个内核与两个驱动版本共有四种组合。',
  假设:'对原因的待验证解释。每条假设都要给出能观察到的预测。',
  BLOCKED:'测试被前置条件挡住。记录阻塞条件，条件恢复后再实际执行。',
  P95:'把请求耗时从短到长排列，约 95% 请求不超过的值。最大值还需单独记录。',
  兼容性:'检查设备、驱动、操作系统或应用的特定组合能否按要求一起工作。',
  稳定性:'在指定负载和时间内持续观察错误、资源与功能，结束后检查恢复情况。',
  回滚:'把程序或配置恢复到记录过的先前版本，随后重新验证功能。',
  中位数:'把数值排序后取中间位置。1000、1100、900 排序后为 900、1000、1100，中位数为 1000。'
};

function teachingTerms(text){
  return Object.entries(COURSE_TERMS).filter(([term])=>text.toLowerCase().includes(term.toLowerCase()));
}
function renderTerms(text){
  const rows=teachingTerms(text);
  return rows.length?'<section class="teaching-terms"><h3>先把本课用到的词说明白</h3>'+rows.map(([term,meaning])=>'<details open><summary>'+esc(term)+'</summary><p>'+esc(meaning)+'</p></details>').join('')+'</section>':'';
}

function measurementExample(segment){
  const tool=segment.command;
  if(tool==='cat'&&[HOST_CRON_TEMPLATE,HOST_CRON_FILE].includes(segment.positionals[0])){
    const fields=[['15','分钟','每小时的第 15 分钟'],['2','小时','一天中的 02 时（24 小时制）'],['*','日','不限定当月哪一天'],['*','月','不限定月份'],['*','星期','不限定星期几'],['reportbot','执行账号','脚本以该账号的权限运行'],[HOST_REPORT_SCRIPT,'命令','脚本的绝对路径']];
    return '<section class="starter-demo"><h4>把计划行拆成七个部分</h4><pre>'+esc(HOST_CRON_LINE)+'</pre><table><thead><tr><th>写的值</th><th>字段</th><th>表示什么</th></tr></thead><tbody>'+fields.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>连起来读：每天 02:15，使用 reportbot 账号执行 collect。星号允许该字段的任意值。这里是系统 cron.d 格式；用户自己的 crontab 不添加执行账号列。</p><p>本机按 UTC 调度。初始 01:55 到 02:15 相差 20 分钟，也就是 1200 秒。先执行 date 确认本机时间。sim next-cron 只推进这台模拟机的时钟，不改变电脑时间。</p></section>';
  }
  if(tool==='fio'){
    const block=segment.opts['--bs']||'4k',mib=sizeMiB(block);
    return '<section class="starter-demo"><h4>先用小数字读懂指标</h4><p>下面是计算示例。假设每次读 '+esc(block)+'，每秒完成 1000 次，那么 IOPS=1000，BW 约为 '+(1000*mib).toFixed(2)+' MiB/s。</p><p>次数乘每次大小得到传输量。延迟表示每次请求用了多久，接下来从实际输出同时读取这三类数据。示例数字不计入本轮测试结果。</p></section>';
  }
  if(tool==='iperf3')return '<section class="starter-demo"><h4>先分清大小写单位</h4><p>1 byte（字节）=8 bit（比特）。800 Mb/s 表示每秒 800 兆比特，按十进制换算约为 100 MB/s。网络输出读 Mb/s，文件吞吐的 MiB/s 还使用不同的换算基数。</p><p>先记服务端地址和端口，再读发送/接收方向以及实际结果。</p></section>';
  if(['stress','stress-ng'].includes(tool))return '<section class="starter-demo"><h4>先算一遍申请量</h4><p>例如 --vm 2 --vm-bytes 2G 表示两个内存 worker，每个申请 2GiB，总申请 4GiB。worker 是执行负载的工作进程。</p><p>CPU worker 的个数与整机使用率分别记录。运行后用监控命令查看实际状态，结束后重新采样。</p></section>';
  return '';
}
