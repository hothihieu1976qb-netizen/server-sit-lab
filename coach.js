'use strict';
// One shared description table drives command parsing, option validation and teaching.
const COMMAND_SPECS={
 uname:{purpose:'查看内核、主机与架构。',options:{'-a':['输出全部系统标识信息。']},fields:[['Linux / release','Linux |4\\.19','内核名称与版本；它与发行版版本分别记录。'],['x86_64','x86_64','64位x86架构。']],memory:'uname看内核，os-release看发行版。',mistake:'uname不能代替发行版检查。'},
 cat:{purpose:'读取指定虚拟文件的内容。',positional:'文件路径；本次读取的是 {v}。',fields:[['NAME / PRETTY_NAME','NAME=','发行版名称。'],['VERSION / VERSION_ID','VERSION','发行版版本标识。'],['UUID / TYPE','UUID|TYPE=|ext4','文件系统身份与类型，要和blkid核对。'],['配置键值','^[\\w-]+=','读取文件中的实际设置；不是执行设置。']],memory:'cat读文件，路径先看全。',mistake:'读配置不等于配置已经生效。'},
 lscpu:{purpose:'查看CPU架构、型号、插槽、核心和逻辑线程。',fields:[['Architecture','^Architecture:','CPU指令集架构。'],['CPU op-mode(s)','^CPU op-mode','支持的32/64位运行模式。'],['CPU(s)','^CPU\\(s\\):','逻辑CPU总数；本机为16，不是16个物理核心。'],['On-line CPU(s) list','^On-line','当前在线逻辑CPU编号。'],['Thread(s) per core','^Thread','每个物理核心提供的逻辑线程数。'],['Core(s) per socket','^Core','每个插槽的物理核心数。'],['Socket(s)','^Socket','CPU插槽数。'],['Model name','^Model','处理器型号。'],['CPU MHz','^CPU MHz','当前/模拟频率，单位MHz。'],['NUMA node(s)','^NUMA','非统一内存访问节点数。']],memory:'核心乘线程，再乘插槽，核对逻辑CPU。',mistake:'CPU(s)是逻辑CPU，不等于物理核心数。'},
 free:{purpose:'查看内存容量、使用量、可用内存和swap。',options:{'-h':['以KiB/MiB/GiB等易读单位输出。'],'-m':['以MiB输出。']},fields:[['total / used / free / shared / buff/cache / available','Mem:|total','总量、已用、完全空闲、共享、缓存，以及估计可用量。available不等于free。'],['Swap total / used / free','Swap:','交换区总量、已用和空闲。已用swap不等于此刻持续换页。']],memory:'内存先看total，压力重点看available和swap。',mistake:'used高不自动证明泄漏，需看缓存、RSS和趋势。'},
 top:{purpose:'查看CPU、内存、进程和负载快照。',fields:[['load average','load average','1/5/15分钟负载均值，不是CPU百分比。'],['Tasks','Tasks:','进程总量和运行状态。'],['us / sy / id / wa','%Cpu','用户态、内核态、空闲、I/O等待占比。'],['Mem / Swap','Mem|Swap','内存和交换空间用量。'],['PID / %CPU / RES / COMMAND','PID|student','进程号、CPU占用、驻留内存和命令。进程CPU可超过100%。']],memory:'top找热点，日志找原因。',mistake:'本模拟输出单次快照，重复执行刷新。'},
 uptime:{purpose:'查看开机时长、在线用户与负载均值。',fields:[['up / user / load average','up |load average','运行时间、用户数、1/5/15分钟负载；需结合逻辑CPU数。']],memory:'uptime看运行多久、排队多少。',mistake:'负载均值不等于CPU使用率。'},
 hostnamectl:{purpose:'查看主机和操作系统元信息。',fields:[['Static hostname / Chassis','hostname|Chassis','主机名与机箱类型，不是硬件型号认证。'],['Operating System / Kernel / Architecture','Operating|Kernel|Architecture','发行版、内核与架构。']],memory:'hostnamectl看主机身份。'},
 whoami:{purpose:'显示当前有效用户名。',fields:[['username','student','当前用户身份。']],memory:'whoami问我是谁。'},
 id:{purpose:'查看用户ID、组ID与所属组。',fields:[['uid / gid / groups','uid=','用户ID、主组和补充组，用于权限排查。']],memory:'whoami看名字，id看用户和组。'},
 date:{purpose:'查看当前时间，关联日志时间线。',fields:[['日期 / 时间 / 时区','.','记录时间和时区；本页面使用Asia/Shanghai。']],memory:'先对时，再对日志。'},
 history:{purpose:'查看本终端输入过的命令。',fields:[['序号 / command','^\\s*\\d','历史序号及原始命令；历史不等于执行成功的证据。']],memory:'history追参数，原始日志留证据。'},
 nproc:{purpose:'查看可用逻辑处理器数量。',fields:[['count','^16','当前可用逻辑CPU数。']],memory:'nproc先数核，再分配worker。'},
 dmidecode:{purpose:'查看模拟DMI固件表。',options:{'-t':['选择DMI信息类型。','value',v=>v==='bios'?'bios：BIOS/UEFI固件信息。':v==='system'?'system：服务器厂商、型号和序列号。':'当前只模拟system和bios。']},fields:[['Manufacturer / Product Name / Serial','Manufacturer|Product|Serial','厂商、服务器型号、序列号。'],['Vendor / Version / Release Date','Vendor|Version|Release Date','固件厂商、版本和日期。']],memory:'dmidecode核对服务器和BIOS。'},
 ps:{purpose:'查看进程快照，定位CPU或RSS热点。',positional:'aux：a包含其他用户，u按用户格式，x包含无终端进程。',fields:[['USER / PID / %CPU / %MEM / RSS / COMMAND','USER|student|root','用户、进程号、CPU%、内存%、驻留内存KiB和命令。']],memory:'ps定位进程，RSS跨时间比较。'},
 lsblk:{purpose:'查看块设备、分区与文件系统映射。',options:{'-f':['显示文件系统、UUID和挂载信息。'],'-o':['选择输出列。','value',v=>'本次列：'+v+'。模型支持NAME,SIZE,MODEL（其他列不模拟）。']},fields:[['NAME / SIZE / MODEL / TYPE','NAME|sda|sdb','设备名、容量、型号、磁盘或分区；树形缩进表达父子关系。'],['FSTYPE / UUID / MOUNTPOINT','FSTYPE|SIM-','文件系统类型、身份及挂载点。设备存在不代表已经挂载。']],memory:'lsblk认设备，-f认文件系统。'},
 df:{purpose:'查看已挂载文件系统的容量和使用率。',options:{'-h':['以易读容量显示。'],'-T':['显示文件系统类型。']},fields:[['Filesystem / Type / Size / Used / Avail / Use% / Mounted on','Filesystem|/dev/','设备、类型、总量、已用、可用、使用率与挂载点。']],memory:'lsblk看盘，df看空间。',mistake:'df只统计挂载的文件系统；ENOSPC不等于磁盘物理坏。'},
 du:{purpose:'估算虚拟目录中文件占用。',options:{'-s':['只显示汇总。'],'-h':['以易读单位显示。']},positional:'要统计的虚拟目录 {v}。',fields:[['size / path','G\\s|M\\s','目录占用量及目录名，区别于df的文件系统可用空间。']],memory:'du看谁占空间，df看还剩多少。'},
 mount:{purpose:'只读查看挂载关系。',fields:[['source on target type options',' on ','源设备、目录、文件系统类型和选项；rw表示可读写。']],memory:'mount串起盘和目录。',mistake:'本模拟不执行真实挂载或修复操作。'},
 findmnt:{purpose:'查看目标目录对应的挂载源。',positional:'查询挂载目标 {v}。',fields:[['TARGET / SOURCE / FSTYPE / OPTIONS','TARGET|/mnt','目录、源设备、文件系统与选项。'],['not mounted','not mounted','没有挂载，不能把目录存在当成测试盘已就绪。']],memory:'findmnt确认文件落在哪块盘。'},
 blkid:{purpose:'读取设备的UUID与文件系统签名。',fields:[['device / UUID / TYPE','UUID=','设备路径、唯一标识和文件系统类型，用来核对fstab。']],memory:'blkid找UUID，fstab逐个对。'},
 fdisk:{purpose:'只读查看磁盘容量和分区表。',options:{'-l':['列出磁盘和分区，不写分区。']},fields:[['Disk / partition / type','Disk|/dev/','磁盘型号、容量、分区和类型；不是格式化结果。']],memory:'fdisk -l只查看，不改盘。'},
 smartctl:{purpose:'读取模拟磁盘健康属性。',options:{'-a':['输出全部已模拟的健康属性。']},positional:'健康检查目标设备 {v}。',fields:[['Device Model / Capacity','Model|Capacity','设备型号与用户容量。'],['overall-health / Reallocated / Pending','health|Sector','总体自检状态、重映射与待处理扇区。PASSED不能排除控制器或全部介质问题。']],memory:'SMART作线索，日志和控制器一起看。'},
 iostat:{purpose:'查看存储负载与等待统计快照。',options:{'-x':['显示扩展I/O统计。']},positional:'采样间隔 {v} 秒；本模型返回一次快照。',fields:[['r/s / w/s / rMiB/s / wMiB/s','r/s|sdb','每秒读写次数、每秒读写数据量。'],['await / %util','await|sdb','平均等待毫秒、统计周期设备忙碌时间占比；并行设备不能只凭util断言已达上限。']],memory:'iostat看忙等，fio看负载性能。'},
 ip:{purpose:'查看接口、地址、路由与邻居。',options:{'-br':['以brief简洁格式输出。'],'-s':['增加收发统计。']},positional:'{v}：'+ 'link看接口，addr看地址，route看路由，neigh看邻居。',fields:[['interface / UP / LOWER_UP / state','enp|state','接口名、管理启用、物理载波与运行状态。UP与LOWER_UP是不同层次。'],['mtu / link/ether / inet','mtu|link/ether|inet |/24','最大传输单元、MAC地址、IPv4及前缀。'],['default / via / dev / src','via |dev |src ','默认路由、下一跳、出口接口和源IP。'],['RX/TX / errors / dropped','RX:|TX:|errors','收发计数、错误、丢弃，结合日志与重传判断。'],['lladdr / REACHABLE / FAILED','lladdr|FAILED','邻居MAC映射及可达状态。']],memory:'link看接口，addr看地址，route看路径，neigh看邻居。'},
 ping:{purpose:'发送有限ICMP探测，检查模拟连通性。',options:{'-c':['指定探测次数。','value',v=>'发送 '+v+' 个探测包；不是运行'+v+'秒。']},positional:'探测目标 {v}。',fields:[['icmp_seq / ttl / time','icmp_seq','序号、剩余生存跳数和往返时间ms。'],['transmitted / received / loss','transmitted','发送、收到与丢包比例。']],memory:'ping测连通，不替代吞吐。'},
 ethtool:{purpose:'检查网卡协商、驱动或设备统计。',options:{'-i':['查看驱动与固件信息。'],'-S':['查看网卡驱动统计计数，大写S。']},positional:'目标网络接口 {v}。',fields:[['Supported / Advertised','Supported|Advertised','支持能力与向对端通告的能力，不等于当前实际速率。'],['Speed','Speed:','当前协商速率；100Mb/s是百兆，1000Mb/s是千兆。'],['Duplex','Duplex:','Full为全双工，可同时发送和接收；单方向上限不会因此翻倍。'],['Auto-negotiation','Auto-negotiation','是否启用自动协商。'],['Link detected','Link detected','有无物理载波；yes不保证IP、路由或应用可用。'],['driver / version / firmware / bus-info','driver:|version:|bus-info','驱动、驱动版本、固件版本和PCI地址。'],['CRC / dropped / timeout','errors:|dropped:|timeout:','CRC、丢弃和超时累计计数，需对比增长趋势。']],memory:'Speed看快慢，Duplex看双工，Link看载波。'},
 iperf3:{purpose:'模拟两台主机之间的TCP/UDP吞吐测试。',options:{'-s':['服务端模式，先监听等待客户端。'],'-c':['客户端模式并指定服务端。','value',v=>v+' 是服务端IP，不是本机绑定地址。'],'-t':['设置模拟测试时长。','value',v=>v+'秒，墙钟时间在本模型中压缩。'],'-P':['设置并行流数量。','value',v=>v+'条连接；大写P不同于端口-p。'],'-R':['反向测试，服务端发送、客户端接收；服务端身份不变。'],'-u':['使用UDP；默认TCP。'],'-b':['设置每条流的目标发送带宽。','value',v=>v+'，K/M/G为十进制bit/s单位；目标不等于接收保证。'],'-p':['设置监听/连接端口，两端须一致。','value',v=>'端口'+v+'；不是并行连接数。']},fields:[['Bitrate / Mbits/sec','Mbits/sec','接收吞吐，单位兆比特每秒，区别于MiB/s字节单位。'],['MBytes / Transfer','MBytes','传输数据量，约等于速率×时长÷8。'],['Retr','Retr=','TCP发送端重传次数，不能独立认定网卡坏。'],['Lost / Total / Lost%','Lost/Total|Lost%','UDP丢失包数、总包数与丢包百分比。'],['Jitter','Jitter=','UDP包传输时延变化的估计值，单位ms，不是平均时延。'],['Direction','Direction:','本次实际发送端→接收端，-R会交换方向。']],memory:'先-s再-c，-P并行-p端口，-R反向-u UDP。',mistake:'服务未启动、端口不匹配或链路错误都会阻止连接。'},
 ss:{purpose:'查看模拟监听套接字与进程。',options:{'-t':['TCP套接字。'],'-u':['UDP套接字。'],'-l':['仅监听。'],'-n':['地址和端口用数字显示。'],'-p':['显示进程信息。']},fields:[['Netid / State / Local Address:Port / Process','Netid|LISTEN','协议、状态、监听地址端口和进程。0.0.0.0表示所有IPv4本地地址。']],memory:'ss先看服务有没有监听。'},
 traceroute:{purpose:'查看模拟网络逐跳路径。',positional:'目的地址 {v}。',fields:[['hop / address / ms / *','^\\d|unreachable','跳数、路由节点、响应时间、超时；星号也可能是中间设备不回探测。']],memory:'traceroute按跳找路径。'},
 route:{purpose:'查看传统路由表（本模型用ip route风格表示同一路由）。',options:{'-n':['使用数字地址，不做名称解析。']},fields:[['via / dev / src','via |dev ','下一跳、出口和源IP，优先匹配更具体的目的路由。']],memory:'有IP还得有正确路径。'},
 lspci:{purpose:'查看PCI设备及驱动绑定。',options:{'-n':['显示PCI数字ID；重复-n同时保留名称和数字ID。'],'-k':['查看实际绑定驱动与候选模块。']},fields:[['PCI address / class / vendor:device','[0-9a-f]{2}:[0-9a-f]{2}\\.','总线地址、设备类别、厂商设备ID。'],['Kernel driver in use','Kernel driver in use','实际绑定的驱动；none表示尚未绑定。'],['Kernel modules','Kernel modules','候选模块，存在不代表已经加载或绑定。']],memory:'lspci认硬件，in use看绑定。'},
 lsmod:{purpose:'查看已加载内核模块。',fields:[['Module / Size / Used by','Module|simnic|simhba|ext4','模块名、模块字节数和引用信息。加载不代表初始化成功。']],memory:'模块加载看lsmod，绑定还要lspci。'},
 modinfo:{purpose:'读取指定模块元数据。',positional:'查询模块 {v} 的文件信息，不是加载它。',fields:[['filename / version / description / license','filename|version|description|license','模块路径、版本、描述和许可。'],['firmware / vermagic','firmware|vermagic','固件要求与模块构建时内核标识，需要匹配目标环境。']],memory:'modinfo看来历，不证明已加载。'},
 dmesg:{purpose:'读取本次内核缓冲区日志。',options:{'-T':['将内核时间转为易读时间；模拟日志只提供构造的时间线。']},fields:[['device / probe / firmware / timeout','simnic|simhba|probe|firmware|timeout','设备和初始化事件；要按先后顺序分析，保留上下文。'],['I/O error / Out of memory','I/O error|Out of memory','存储错误或OOM线索，需要结合设备映射和资源状态。']],memory:'dmesg先后看，第一条异常很关键。'},
 journalctl:{purpose:'读取指定启动或服务的系统日志。',options:{'-b':['选择启动记录，省略值表示当前。','optional',v=>v==='-1'?'上一次启动；不是错误等级。':v===null?'当前启动。':v+'对应的启动索引（本模型只支持当前0和上次-1）。'],'-k':['只看内核日志。'],'-u':['选择服务单元。','value',v=>'本次服务为'+v+'。']},fields:[['boot / service / kernel events','simnic|simhba|sit-agent|process|port|Started|previous','本次所选启动或服务的事件；根据-b、-u判断范围。']],memory:'-b选启动，-k选内核，-u选服务。'},
 grep:{purpose:'在虚拟日志或上游输出中筛选匹配行。',options:{'-i':['忽略大小写。']},positional:'第一个位置参数是匹配文本，其后是虚拟文件；本模型按文本匹配。',fields:[['matching line','.+','命中的原始行；没有命中不等于没有问题。']],memory:'grep缩范围，上下文别丢。'},
 tail:{purpose:'查看虚拟文件末尾的行。',options:{'-n':['指定末尾行数。','value',v=>'最后'+v+'行，不是'+v+'秒。']},positional:'读取虚拟文件 {v}。',fields:[['last lines','.+','末尾日志快照，可能不包含最早根因。']],memory:'tail看最近，根因还要往前。'},
 less:{purpose:'查看虚拟日志全文快照。',positional:'读取虚拟文件 {v}；真实less是分页器，本模型只展示一次。',fields:[['file lines','.+','日志按原顺序展示；真实less用q退出。']],memory:'less读上下文，真实环境q退出。'},
 systemctl:{purpose:'查看服务或系统单元状态。',options:{'--failed':['只列失败单元。']},positional:'status查看单元状态；list-units列运行单元；服务名选定目标。',fields:[['UNIT / LOAD / ACTIVE / SUB','UNIT|loaded','单元、是否加载、总体与详细状态。'],['Active / PID / exit status','Active:|PID|status=','运行状态、进程号、退出码；failed不是根因。'],['0 loaded units listed','0 loaded','本次筛选未发现失败单元，不代表全部硬件测试通过。']],memory:'status看状态，journal -u找原因。'},
 fio:{purpose:'按指定文件和负载模拟存储I/O。',options:{
 '--name':['作业名称。','value',v=>v+'只是任务名，不决定读写模式。'],'--filename':['测试目标文件。','value',v=>v+'是本次虚拟文件；应位于独立测试盘，裸设备不支持。'],'--rw':['访问模式。','value',v=>({read:'顺序读',write:'顺序写',randread:'随机读',randwrite:'随机写',rw:'顺序混合读写',randrw:'随机混合读写',trim:'丢弃/TRIM；本模型只解释，不运行'})[v]||'当前模型未实现该模式。'],'--bs':['单次I/O块大小。','value',v=>v+'采用二进制KiB/MiB单位；不是文件总大小。'],'--size':['每个作业的数据集大小。','value',v=>v+'是每作业数据集；与bs不同。'],'--runtime':['模拟运行时间上限。','value',v=>v+'秒；未启用time_based时可能先完成数据集而提前结束。'],'--time_based':['循环数据集直到运行时间上限。','bool',v=>v==='0'?'关闭持续时间模式。':'开启持续时间模式。'],'--iodepth':['每个作业目标在途I/O数量。','value',v=>v+'个未完成请求；sync引擎有效深度通常为1。'],'--numjobs':['并行作业数。','value',v=>v+'个作业；总在途约有效深度×作业数。'],'--direct':['是否绕过操作系统页缓存。','value',v=>v==='1'?'1：直接I/O，不等于绕过磁盘内部缓存。':v==='0'?'0：使用缓存I/O，不可与direct=1简单比较。':'仅支持0或1。'],'--ioengine':['I/O引擎。','value',v=>v==='libaio'?'libaio：本模拟采用异步I/O模型。':v==='sync'?'sync：同步I/O，每作业有效深度1。':v==='io_uring'?'io_uring：本教学配置仅在5.10和6.6启用；是否可用仍受内核配置及工具构建影响。':'此引擎尚未实现。'],'--rwmixread':['混合模式中的读百分比。','value',v=>v+'%读、'+(100-Number(v))+'%写，仅rw/randrw生效。'],'--group_reporting':['将并行作业统计汇总显示。','bool',v=>v==='0'?'关闭分组汇总，按每作业等分模型展示。':'开启作业组汇总，不会凭此增加吞吐。']},fields:[['READ / WRITE / IOPS','READ:|WRITE:','读写方向与每秒操作次数，混合模式分方向。'],['BW / MiB / sec','BW=','带宽、总传输量与模拟运行时间；BW≈IOPS×块大小。'],['slat','^\\s*slat','提交延迟；本输出单位为ms。'],['clat','^\\s*clat \\(msec','提交到完成的延迟，含排队。'],['lat','^\\s*lat ','总延迟，近似slat+clat。'],['P50 / P95 / P99','50.00th|95.00th|99.00th','完成延迟百分位；P99表示99%请求不超过该值，不是最大值。'],['effective outstanding / runtime','effective|runtime=','实际模型在途数、时间上限与是否循环数据集。']],memory:'rw定方式，bs定块，深度乘作业；次数、带宽、延迟一起看。',mistake:'增大并发可能提高IOPS，也会增加排队；短测和缓存条件不同不直接比较。'},
 stress:{purpose:'以worker数量模拟CPU、内存及sync类I/O压力。',options:{'--cpu':['CPU worker数量。','value',v=>v+'个忙worker；16逻辑线程上的平均CPU不一定是'+v+'%。'],'--vm':['内存worker数量。','value',v=>v+'个内存worker；总申请量=个数×每个大小。'],'--vm-bytes':['每个内存worker的申请量。','value',v=>v+'为每个worker，不是所有worker的总量。'],'--io':['重复sync类I/O worker数量。','value',v=>v+'个sync类worker；不等于fio磁盘带宽测试，也不写真实盘。'],'--timeout':['最长模拟时长。','value',v=>v+'：s为秒、m为分钟；到时停止。']},fields:[['dispatching / requested','dispatching|memory requested','各类worker数与总内存请求；请求不保证成功分配。'],['exit / elapsed','elapsed=|exit','结束方式与实际模拟时长。'],['error / OOM','error|Out of memory','异常需停止、保留参数、查内核日志。']],memory:'CPU数worker，内存按每个乘，io非基准，timeout控时长。'},
 vmstat:{purpose:'查看调度、内存、交换、I/O和CPU快照。',positional:'采样间隔 {v} 秒；此模拟器只输出一次快照。',fields:[['r / b',' r b','可运行队列与阻塞进程数。'],['swpd / free / buff / cache','swpd|^ \\d','交换区已用及空闲、缓冲、缓存，内存计数单位KiB。'],['si / so','si so','每秒换入/换出KiB；不等于交换区已用容量。'],['bi / bo','bi bo','块设备输入/输出统计。'],['us / sy / id / wa','us sy id wa','用户态、内核态、空闲与I/O等待占比。']],memory:'r看排队，b看阻塞，si/so看换页，wa看等盘。'}
};
COMMAND_SPECS['stress-ng']={...COMMAND_SPECS.stress,options:Object.fromEntries(Object.entries(COMMAND_SPECS.stress.options).filter(([k])=>k!=='--io')),purpose:'本模型仅模拟stress-ng中CPU、VM和timeout这一兼容子集。其他stress-ng选项未实现，--io仅在stress中模拟。'};
COMMAND_SPECS.hostname={purpose:'显示主机名。',fields:[['hostname','sit-server','当前模拟主机名。']],memory:'hostname看主机名。'};
COMMAND_SPECS.pwd={purpose:'显示当前虚拟工作目录。',fields:[['directory','^/','当前目录路径。']],memory:'pwd问现在在哪。'};
for(const name of ['clear','stop','pkill','save-logs','reboot','help','sim'])COMMAND_SPECS[name]={purpose:({clear:'清空当前终端显示，不删除历史或证据。',stop:'停止模拟负载。',pkill:'本模型仅支持停止stress进程组。','save-logs':'将已收集输出保存在虚拟日志文件。',reboot:'模拟重新启动，不重启真实电脑。',help:'查看模拟器支持的命令。',sim:'实验室辅助操作，区别于真实Linux命令。'})[name],fields:[['status','.+','本次模拟动作的状态；不对真实硬件生效。']],memory:'模拟动作在本地，结果与证据要核对。'};

const PRACTICE_COMMAND_SPECS={
    ls:{purpose:'查看目录本身或虚拟文件的权限和归属。',options:{'-l':['长格式显示权限、属主与属组。'],'-d':['显示目录本身，不列目录内容。']}},
    touch:{purpose:'在测试卷创建一个空的虚拟探测文件。',positional:'创建或更新时间的虚拟路径 {v}。'},
    df:{...COMMAND_SPECS.df,options:{...COMMAND_SPECS.df.options,'-i':['显示 inode 数量、已用与可用，单位是个。']}}
};

function shellWords(raw){return (raw.match(/(?:[^\s"'|>]+|"[^"]*"|'[^']*')+|[|>]/g)||[]).map(t=>t.replace(/["']/g,''));}
function analyseInput(raw,{practice=true}={}){
  const words=shellWords(raw),segments=[],operators=[],issues=[];let list=[];
  for(const word of words){if(word==='|'||word==='>'){if(list.length)segments.push(parseSegment(list,practice));list=[];operators.push(word);}else list.push(word);}
  if(list.length)segments.push(parseSegment(list,practice));
  if(operators.includes('>')){const target=segments.pop();if(!target||target.words.length!==1||!/^\/tmp\/[\w.-]+$/.test(target.words[0]))issues.push('重定向仅支持虚拟 /tmp/文件名。');else operators.push(target.words[0]);}
  segments.forEach(s=>issues.push(...s.issues));
  if(operators.includes('|')&&(segments.length!==2||segments[1].command!=='grep'))issues.push('本模拟只实现“命令 | grep [-i] 文本”这一管道。');
  return {raw,segments,operators,issues};
}
function parseSegment(input,practice=false){
  const words=[...input],parts=[],issues=[],opts={},positionals=[];let fromB=false;
  if(words[0]==='sudo'){parts.push({token:words.shift(),meaning:'以提权语义执行；本模型不改变真实权限。'});}
  if(words[0]==='sim'&&words[1]==='b'){words.splice(0,2);fromB=true;parts.push({token:'sim b',meaning:'实验室辅助前缀：在B端网络子系统运行后续命令，不是真实Linux选项。'});}
  const command=words[0]||'';
  const spec=practice&&command==='mount'&&words.length>1
    ?{...COMMAND_SPECS.mount,purpose:'按模拟 fstab 挂载指定目标。',positional:'要挂载的目标 {v}。'}
    :practice&&PRACTICE_COMMAND_SPECS[command]||COMMAND_SPECS[command];
  const optionSpecs=spec?.options||{};
  parts.push({token:command,meaning:spec?.purpose||'当前模拟器尚未实现此命令。',unsupported:!spec});
  if(!spec)issues.push('尚未实现命令 '+command);
  function addOption(flag,value,desc){
    opts[flag]=value===null?true:value;
    parts.push({token:flag+(value===null?'':' '+value),meaning:desc[0]+(desc[2]?' '+desc[2](value):''),parameter:flag,value});
    if(desc[1]==='value'&&(value===null||value===''))issues.push(flag+' 缺少参数值。');
    if(desc[1]==='bool'&&value!==null&&!['0','1'].includes(value))issues.push(flag+' 只支持0/1。');
  }
  for(let i=1;i<words.length;i++){
    const word=words[i];
    if(word==='--help'){parts.push({token:word,meaning:'显示本模拟器实现的选项帮助，不运行负载。'});opts['--help']=true;continue;}
    if(word.startsWith('-')){
      const equal=word.indexOf('='),flag=equal>=0?word.slice(0,equal):word,desc=optionSpecs[flag];
      if(desc){let value=equal>=0?word.slice(equal+1):null;
        if(value===null&&desc[1]==='value'&&words[i+1]&&!words[i+1].startsWith('-'))value=words[++i];
        if(value===null&&desc[1]==='optional'&&/^(-1|0)$/.test(words[i+1]||''))value=words[++i];
        if(equal>=0&&!desc[1])issues.push(flag+' 不接收参数值。');addOption(flag,value,desc);
      }else if(/^-[a-zA-Z]+$/.test(word)&&word.slice(1).split('').every(c=>optionSpecs['-'+c]&&!optionSpecs['-'+c][1])){
        parts.push({token:word,meaning:'组合短选项：'+word.slice(1).split('').map(c=>'-'+c).join('、')+'。'});word.slice(1).split('').forEach(c=>addOption('-'+c,null,optionSpecs['-'+c]));
      }else{parts.push({token:word,meaning:'当前模拟器尚未实现此选项，未执行；不会猜测其含义。',unsupported:true});issues.push('尚未实现选项 '+word);}
    }else{positionals.push(word);parts.push({token:word,meaning:(spec?.positional||'位置参数 {v}。').replace('{v}',word)});}
  }
  const supportedPositionals={ip:['link','addr','route','neigh'],systemctl:['status','list-units','sit-agent','sit-agent.service','NetworkManager','NetworkManager.service'],ps:['aux'],modinfo:['simnic','simhba'],pkill:['stress','stress-ng']};
  const hasLabAction=command==='ip'&&practice&&['addr','link'].includes(positionals[0])&&positionals.length>1;
  const routeLookup=command==='ip'&&practice&&positionals[0]==='route'&&positionals[1]==='get'&&positionals.length===3;
  const restart=command==='systemctl'&&practice&&positionals[0]==='restart'&&positionals.length===2&&['sit-agent','sit-agent.service'].includes(positionals[1]);
  if(routeLookup){
    parts.at(-2).meaning='按具体目的地址查询实际选择的路由。';
    parts.at(-1).meaning='要解析下一跳和出口的对端 IPv4 地址。';
  }
  if(restart)parts.at(-2).meaning='停止并重新启动指定虚拟服务，读取已保存配置。';
  if(supportedPositionals[command]&&!hasLabAction&&!routeLookup&&!restart&&positionals.some(v=>!supportedPositionals[command].includes(v)))issues.push(command+' 的该位置参数尚未实现。');
  if(hasLabAction){
    const actionParts=parts.slice(-positionals.length+1);
    const meanings=positionals[0]==='addr'
      ? [positionals[1]==='add'?'向当前接口添加临时地址。':'删除当前接口的临时地址。','IPv4 地址及其网络前缀长度，用于确定直连子网。','指定要操作的接口。','目标接口名称。']
      : ['修改当前接口的状态。','指定要操作的接口。','目标接口名称。',positionals.at(-1)==='up'?'启用接口。':'停用接口。'];
    if(actionParts.length===meanings.length)actionParts.forEach((part,i)=>{part.meaning=meanings[i];});
  }
  if(['uname','lscpu','free','top','uptime','hostnamectl','whoami','id','date','history','nproc','lsmod','df','mount','ss','route'].includes(command)&&positionals.length&&!(command==='mount'&&practice&&positionals.length===1&&positionals[0]==='/mnt/sit'))issues.push(command+' 不支持本次位置参数。');
  if(['blkid','lsblk','lspci','fdisk','dmidecode'].includes(command)&&positionals.length)issues.push(command+' 当前不实现设备筛选位置参数。');
  if(['cat','smartctl','modinfo','ping','ethtool','traceroute','tail','less','ls','touch'].includes(command)&&!positionals.length&&!opts['--help'])issues.push(command+' 缺少目标文件、设备或地址。');
  if(opts['-o']&&opts['-o']!=='NAME,SIZE,MODEL')issues.push('lsblk -o 当前只实现NAME,SIZE,MODEL。');
  if(command==='free'&&opts['-h']&&opts['-m'])issues.push('free 当前请选择-h或-m一种显示单位。');
  if(command==='dmidecode'&&!opts['--help']&&!['system','bios'].includes(opts['-t']))issues.push('dmidecode -t 仅支持system/bios。');
  if(command==='journalctl'&&opts['-u']&&!['sit-agent','sit-agent.service'].includes(opts['-u']))issues.push('当前只模拟sit-agent服务日志。');
  if(fromB&&!['iperf3','ip'].includes(command))issues.push('B端只模拟ip和iperf3网络子系统。');
  if(['vmstat','iostat'].includes(command)&&positionals.some(v=>!/^\d+$/.test(v)||Number(v)<1))issues.push('采样间隔必须为正整数；本模型输出单次快照。');
  if(['cat','du','findmnt','smartctl','modinfo','ping','traceroute','tail','less'].includes(command)&&positionals.length>1)issues.push(command+' 当前仅支持单个目标。');
  if(command==='fio'&&positionals.some(v=>!['/mnt/sit/low.fio','/mnt/sit/fixed.fio'].includes(v)))issues.push('当前只实现low.fio与fixed.fio这两个虚拟作业文件。');
  if(command==='journalctl'&&positionals.length)issues.push('journalctl 当前仅实现-b [0/-1]、-k及-u sit-agent。');
  if(practice&&command==='sim'&&PRACTICE_ACTIONS[positionals[0]]){
    const [purpose,value]=PRACTICE_ACTIONS[positionals[0]];
    if(parts[1])parts[1].meaning=purpose;
    if(parts[2])parts[2].meaning=value;
  }
  if(command==='stress-ng'&&opts['--io'])issues.push('stress-ng的--io未实现；本模型只在stress中提供该选项。');
  if(command==='sim'&&positionals[0]==='kernel'){
    const descriptions=['操作模拟启动内核。',({list:'列出教学配置。',select:'仅选择下次启动版本，需 reboot 生效。',rollback:'将下次启动设为上一运行版本，需 reboot。'})[positionals[1]]||'未实现的内核操作。',KERNEL_PROFILES[positionals[2]]?'目标 '+KERNEL_PROFILES[positionals[2]].release+'，不代表官方发行版支持。':'尚未实现的教学版本。'];
    parts.slice(-positionals.length).forEach((p,i)=>p.meaning=descriptions[i]||'未实现的位置参数。');
  }
  if(command==='sim'&&positionals[0]==='driver'){
    const descriptions=['管理模拟驱动包。','install：安装包，不自动加载。',positionals[2]+'：目标模块名。',positionals[3]+'：包所属的教学内核目录。'];
    parts.slice(-positionals.length).forEach((p,i)=>p.meaning=descriptions[i]||'未实现的位置参数。');
  }
  const sub=['ip','systemctl'].includes(command)?positionals[0]||'default':'';
  return {command,words,input,fromB,spec,parts,opts,positionals,issues,key:command+(sub?' '+sub:'')};
}
function outputFields(parsed,output){
  const segment=parsed.segments[0],spec=segment?.spec;if(!spec)return [];
  const lines=output.split('\n'),rows=[];
  for(const [field,pattern,meaning] of spec.fields||[]){const matches=lines.filter(line=>new RegExp(pattern,'i').test(line));if(matches.length)rows.push({field,actual:matches.slice(0,3).join('\n'),meaning});}
  return rows;
}
function knowledgeFor(segment){
  const matching=COMMAND_KB.filter(k=>shellWords(k[1])[0]===segment.command);let best=matching[0],score=-1;
  for(const row of matching){const points=shellWords(row[1]).filter(w=>segment.words.includes(w)).length;if(points>score){score=points;best=row;}}
  return best;
}
function terminalOutput(raw,output,parsed){
  const cmd=parsed.segments[0]?.command||'simulator';
  if(parsed.issues.length)return cmd+': unsupported simulated syntax: '+parsed.issues.map(x=>x.match(/--?[A-Za-z_-]+/)?.[0]||cmd).join(', ');
  if(cmd==='clear')return '';
  if(parsed.operators.includes('>'))return 'Output saved to virtual '+parsed.operators.at(-1);
  if(cmd==='help'||parsed.segments[0]?.opts['--help'])return 'Supported simulator commands/options:\n'+(cmd==='help'?Object.keys(COMMAND_SPECS).join('  '):cmd+' '+Object.keys(COMMAND_SPECS[cmd].options||{}).join(' '));
  if(cmd==='stop'||cmd==='pkill')return output.includes('无运行')?'stress: no active workers':'stress: workers stopped (simulated)';
  if(cmd==='save-logs')return S.saved?'Saved virtual evidence: /tmp/sit-evidence.log':'save-logs: no captured output';
  if(cmd==='reboot')return 'Reboot completed (simulated), boot='+S.boot;
  let cleaned=output.split('\n').filter(line=>!/^\[(?:模拟|以上|教学)[^\]]*\].*[\u4e00-\u9fff]/.test(line)).join('\n').replace(/\[(?:模拟[^\]]*|虚构[^\]]*|页面时钟)\]/g,'').replace(/\((?:虚构教学 CPU)\)/g,'(simulated)')
    .replace(/测试盘未挂载（本模拟拒绝误写系统盘目录）/g,'Test volume is not mounted')
    .replace(/top - 模拟资源快照/g,'top - 09:30:00')
    .replace(/PRETTY_NAME="银河麒麟高级服务器操作系统 V10（模拟）"/g,'PRETTY_NAME="Kylin Linux Advanced Server V10 (Simulated)"')
    .replace(/\[无IPv4地址\]/g,'')
    .replace(/Cannot assign requested address: A端无有效IPv4/g,'Cannot assign requested address: no IPv4 on server A')
    .replace(/Network is unreachable \(enp3s0 不存在\)/g,'Network is unreachable')
    .replace(/未实现的模拟命令[^\n]*/g,'command not found (simulator)');
  const chineseErrors=/参数无效|参数超出|用法|未指定|不存在|只允许|不支持|尚未|缺少|无运行/.test(cleaned);
  cleaned=cleaned.split('\n').filter(line=>!/^\[模拟监控\]/.test(line)).map(line=>line.replace(/[\u4e00-\u9fff].*$/,'').replace(/\(\s*$/,'').trimEnd()).filter(line=>/[a-zA-Z0-9/]/.test(line)).join('\n').trim();
  if(cleaned&&cleaned!==cmd+':'&&cleaned!==cmd)return cleaned;
  if(cmd==='sim')return 'sim: action completed (virtual lab)';
  return cmd+(chineseErrors?': invalid argument or unsupported simulated target':': simulation status unavailable');
}
function lessonForRun(raw,output,parsed,failed,event=null){
  const main=parsed.segments[0], kb=main&&knowledgeFor(main), topic=commandTeaching(main);
  const fields=teachingRows(main,output,event);
  const secondary=outputFields(parsed,output);
  const inferredReason = parsed.issues.length?'syntax'
    :/No space left/i.test(output)?'no-space'
    :/Input\/output error/i.test(output)?'io-error'
    :/volume is not mounted/i.test(output)?'not-mounted'
    :/Connection refused/i.test(output)?'no-listener':null;
  const failure=failed?TEACHING_FAILURES[event?.reason||inferredReason]:null;
  const purpose=main?.spec?.purpose||'查看本次命令的执行状态。';
  return {
    raw,output,parsed,failed,event,at:event?.at||stamp(),fields,secondary,purpose,
    headline:failure?.[0]|| (failed?'本次没有取得所请求的结果。':topic?.[0]||purpose),
    limits:topic?.[1]||main?.spec?.mistake||'本次输出只说明当前环境中已观察到的结果。',
    next:failure?.[1]||topic?.[2]||kb?.[3]||'结合当前任务，确定还需要哪一条证据。',
    usage:kb?.[3]||topic?.[2]||'根据当前任务验证输出。', interview:[topic?.[0]||purpose,topic?.[1],topic?.[2]].filter(Boolean).join(' '),
    mnemonic:main?.spec?.memory||'先观察，再验证。'
  };
}

function renderFieldRows(rows){
  return rows.map(f=>`<div class="output-field"><b>${esc(f.field)}</b><pre>${esc(f.actual)}</pre><p>${esc(f.meaning)}</p></div>`).join('');
}

function renderCommandLesson(){
  const host=$('command-lesson'),lesson=S.lastLesson,c=S.coach,exam=assessmentActive();
  $('coach-layout').classList.toggle('lesson-collapsed',c.hidden||exam);
  $('lesson-toggle').textContent=c.hidden?'展开命令解析':'折叠命令解析';
  $('lesson-toggle').disabled=exam;
  if(exam){host.replaceChildren();return;}
  if(!lesson){
    host.innerHTML='<div class="empty-state"><h3>执行一条命令后从这里读结果</h3><p>查看命令查了什么、输出说明什么，以及下一步需要验证什么。</p></div>';
    return;
  }
  const args=lesson.parsed.segments.flatMap(s=>s.parts);
  const source=lesson.origin&&SIT_COURSE.find(l=>l.id===lesson.origin.lessonId);
  const context=lesson.event?.seq?'记录 #'+lesson.event.seq+' · 启动 '+lesson.event.boot+' · '+lesson.at:lesson.at;
  const evidence=lesson.fields.length?renderFieldRows(lesson.fields):renderFieldRows(lesson.secondary.slice(0,3));
  const moreFields=lesson.fields.length?lesson.secondary:lesson.secondary.slice(3);
  const kind=lesson.failed?'返回异常或未执行':'已返回结果';
  const issues=lesson.parsed.issues.length?'<ul class="coach-issues">'+lesson.parsed.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':'';
  const related=source?' · '+source.title:'';
  host.innerHTML=`<div class="lesson-command"><span>本次命令</span><code>${esc(lesson.raw)}</code><small>${esc(context+related)} · ${kind}</small></div>
    <div class="coach-interpretation ${lesson.failed?'failure':''}"><b>${esc(lesson.headline)}</b><p>${esc(lesson.limits)}</p><p><strong>下一项验证</strong> ${esc(lesson.next)}</p></div>
    ${lesson.effects?'<p class="coach-effects"><strong>状态变化</strong> '+esc(lesson.effects)+'</p>':''}
    ${evidence?'<h3>本次输出怎么读</h3>'+evidence:lesson.output&&lesson.failed?'<div class="output-field"><b>原始返回</b><pre>'+esc(lesson.output)+'</pre></div>':''}
    ${moreFields.length?'<details class="coach-detail"><summary>查看其余字段</summary>'+renderFieldRows(moreFields)+'</details>':''}
    <details class="coach-detail" ${issues?'open':''}><summary>命令结构、参数与取值</summary><p>${esc(lesson.purpose)}</p>${issues}
    <table><thead><tr><th>实际输入</th><th>作用与取值</th></tr></thead><tbody>${args.map(r=>`<tr class="${r.unsupported?'different':''}"><td><code>${esc(r.token)}</code></td><td>${esc(r.meaning)}</td></tr>`).join('')}${lesson.parsed.operators.map(op=>`<tr><td>${esc(op)}</td><td>${op==='|'?'传给后续 grep 筛选。':op==='>'?'输出到模拟文件。':'模拟目标文件。'}</td></tr>`).join('')}</tbody></table></details>
    <details class="coach-detail coach-practice-more"><summary>记忆与技术复盘</summary><p>${esc(lesson.mnemonic)}</p><div id="memory-check" class="memory-check"></div><button class="spaced" data-action="operation-followup">练习相关追问 →</button></details>`;
  renderMemoryCheck();
}

function parameterQuiz(segment,flag,value){
  const cmd=segment.command,id=segment.key+':'+flag,v=String(value===true?'1':value);
  const numbered=n=>['(?<!\\d)'+n+'(?!\\d)'];
  if(cmd==='iperf3'&&flag==='-c'){
    return {id,parameter:true,prompt:'-c 后面的 '+v+' 指向哪一端？',answer:'要连接的服务端 IP。即使使用 -R，-c 指向的服务端也不变。',choices:['本机客户端的地址','要连接的服务端地址','网卡的默认网关'],correctChoice:1,groups:[['服务端']]};
  }
  if(cmd==='fio'){
    const table={
      '--bs':['bs='+v+'代表什么？',v+'是单次I/O块大小（k/m采用KiB/MiB），不是文件大小。',[['单次','每次','请求块','块大小'],[v.toLowerCase(),String(parseFloat(v))]]],
      '--iodepth':['iodepth='+v+'代表什么？','每个作业希望维持'+v+'个未完成I/O请求；实际受引擎与环境影响。',[['未完成','在途','队列'],numbered(v)]],
      '--numjobs':['numjobs='+v+'与iodepth有什么区别？',v+'是并行作业数，iodepth是每个作业的在途I/O深度。',[['作业','任务'],numbered(v),['每个','队列','深度']]],
      '--direct':['direct='+v+'是否绕过硬盘内部缓存？',v==='1'?'绕过操作系统页缓存，不等于绕过硬盘内部缓存。':'0表示缓存I/O；1绕过操作系统页缓存。',[['操作系统','os','页缓存'],['不等于','不是','不代表','0','缓存io']]],
      '--rw':['rw='+v+'是什么负载？',COMMAND_SPECS.fio.options['--rw'][2](v),[[v.startsWith('rand')?'随机':'顺序'],[v.includes('read')?'读':v.includes('write')?'写':'混合|读写']]],
      '--runtime':['runtime='+v+'一定会跑满这段时间吗？','它是'+v+'秒上限；未启用time_based时可能先跑完数据集。',[['秒','时间'],['time_based','不一定','可能','上限']]],
      '--time_based':['time_based与runtime如何配合？','启用后循环数据集，按runtime时间上限运行。',[['循环','持续'],['runtime','时间']]],
      '--size':['size='+v+'和bs有什么区别？','size是每作业数据集大小，bs是单次I/O大小。',[['数据集','文件'],['单次','每次']]],
      '--ioengine':['本次'+v+'如何影响队列深度？',v==='sync'?'同步引擎每作业有效深度通常为1。':'libaio是异步模型，可以维持多个未完成I/O。',[[v==='sync'?'同步':'异步'],['深度','队列','未完成']]],
      '--rwmixread':['rwmixread='+v+'代表什么？','混合模式中读占'+v+'%，写占'+(100-Number(v))+'%。',[['读'],numbered(v)]],
      '--group_reporting':['group_reporting会提高磁盘性能吗？','不会，它汇总作业统计，只改变报告展示。',[['汇总','合并'],['不会','不改变','不是','不提高']]],
      '--filename':['filename指定什么？','虚拟测试文件路径，先确认它位于预期测试盘。',[['文件','路径'],['测试盘','目标','确认']]],
      '--name':['name会决定测试的读写模式吗？','不会，name只是作业名，模式由rw决定。',[['名称','名字','作业名','任务名'],['rw','不会','不决定']]]
    };if(table[flag]){const [prompt,answer,groups]=table[flag];return {id,parameter:true,prompt,answer,groups};}
  }
  if(cmd==='iperf3'){
    const table={
      '-c':['-c '+v+'里的地址是谁？','要连接的服务端IP。',[['服务端','服务器端','server']]],
      '-s':['为什么要先-s？','先让服务端监听，再由客户端连接。',[['服务端','监听'],['先','连接']]],
      '-t':['-t '+v+'代表什么？',v+'秒模拟测试时长。',[['秒','时长'],numbered(v)]],
      '-P':['-P '+v+'与-p的区别？','大写P是'+v+'条并行流，小写p是端口。',[['并行','连接','流'],['端口']]],
      '-p':['两端-p '+v+'需要满足什么？','服务端监听端口与客户端目标端口要一致。',[['端口'],['一致','相同','匹配']]],
      '-R':['-R后谁发送？','服务端发送、客户端接收；服务端身份不变。',[['服务端'],['发送']]],
      '-u':['-u切换到什么协议，关注哪些指标？','UDP，观察丢包和Jitter。',[['udp'],['丢包'],['jitter','抖动']]],
      '-b':['-b '+v+'等于实际接收带宽吗？','不等于，它是每条流的目标发送带宽，超过容量可能丢包。',[['目标','发送'],['不等于','不是','不能','丢包']]]
    };if(table[flag]){const [prompt,answer,groups]=table[flag];return {id,parameter:true,prompt,answer,groups};}
  }
  if(cmd==='stress'||cmd==='stress-ng'){
    const table={
      '--cpu':['--cpu '+v+'是CPU使用率'+v+'%吗？','不是，它指定'+v+'个CPU worker，使用率还取决于逻辑CPU数量。',[['worker','工作者','线程','进程'],['不是','不等于','数量']]],
      '--vm':['--vm '+v+'与--vm-bytes如何计算总量？','worker数×每个worker的申请量。',[['乘','×','*'],['每个','worker']]],
      '--vm-bytes':['--vm-bytes '+v+'是所有worker的总量吗？','不是，是每个内存worker的申请量。',[['每个'],['内存','worker']]],
      '--io':['--io能替代fio测磁盘IOPS吗？','不能；它产生sync类压力，不是专业存储性能基准。',[['不能','不是'],['sync','同步','基准']]],
      '--timeout':['为什么要设置--timeout '+v+'？','限制压力运行时长，达到时限后停止。',[['时间','时长','时限'],['停止','结束']]]
    };if(table[flag]){const [prompt,answer,groups]=table[flag];return {id,parameter:true,prompt,answer,groups};}
  }
  const desc=segment.spec.options[flag],phrase=desc[0].replace(/[。；].*$/,'');
  const clues={ '-br':['简洁','brief'], '-f':['文件系统','uuid'], '-h':['易读','人类','单位'], '-T':cmd==='df'?['类型','文件系统']:['时间'], '-k':cmd==='lspci'?['驱动','绑定']:['内核'], '-i':cmd==='ethtool'?['驱动']:['大小写'], '-S':['统计','计数'], '-b':['启动'], '-u':['服务','单元'], '-n':cmd==='tail'?['行']:['数字','名称'], '--failed':['失败'], '-a':['全部','所有'], '-o':['列','字段'], '-t':['类型'], '-s':['统计','汇总'], '-l':['列出','监听'], '-x':['扩展']};
  return {id,parameter:true,prompt:'本次'+flag+(value===true?'':' '+v)+'有什么作用？',answer:desc[0]+(desc[2]?' '+desc[2](value===true?null:v):''),groups:[clues[flag]||[phrase.slice(0,4),phrase.slice(2,6)]]};
}
function makeMemoryQuiz(lesson){
  const s=lesson.parsed.segments[0];if(!s?.spec||s.opts['--help']||lesson.failed||['help','clear','sim','save-logs','stop','reboot','pkill'].includes(s.command))return null;
  const params=Object.entries(s.opts).filter(([flag])=>s.spec.options?.[flag]);
  if(params.length){const selected=params.find(([flag])=>!S.coach.mastered[s.key+':'+flag])||params[S.coach.quizCycle++%params.length];return {...parameterQuiz(s,...selected),command:lesson.raw};}
  const defaults={
    lscpu:['CPU(s)与Core(s) per socket有何区别？','CPU(s)是逻辑CPU数；Core(s) per socket是每个插槽的物理核心数。',[['逻辑'],['物理','核心']]],
    ethtool:['Speed字段代表什么？','当前链路协商速率，不是实际应用吞吐。',[['协商','链路'],['速率','速度']]],
    free:['available和free为什么不同？','free是完全空闲，available估计可供应用使用的内存，包含可回收部分。',[['空闲'],['可用','回收']]],
    ip:['UP和LOWER_UP分别说明什么？','UP是管理启用；LOWER_UP是下层物理载波。',[['管理','启用'],['载波','物理']]],
    lsblk:['设备存在就一定已挂载吗？','不一定，要看MOUNTPOINT或findmnt确认挂载源。',[['不一定','不是','不能'],['挂载','mountpoint','findmnt']]],
    lspci:['Kernel driver in use表示什么？','设备实际绑定的驱动，不是候选模块。',[['绑定'],['驱动']]],
    lsmod:['模块已加载就说明绑定成功吗？','不一定，需用lspci确认绑定并看probe日志。',[['不一定','不是','不能'],['绑定','lspci','probe']]],
    vmstat:['si/so与swpd有什么区别？','si/so是换入换出速率，swpd是已用交换区容量。',[['速率','换入','换出'],['容量','已用']]],
    top:['wa代表什么？','CPU统计中的I/O等待占比，需结合I/O、日志判断。',[['i/o','io','输入输出'],['等待']]],
    df:['Avail与Use%分别是什么？','文件系统可用容量与使用率。',[['可用'],['使用率']]]
  };
  const item=defaults[s.command]||[s.command+'在本次工作中查看什么？',s.spec.purpose,[(knowledgeFor(s)?.[4]||s.spec.purpose).split(/[、，；/ ]/).filter(x=>x.length>1).slice(0,3)]];
  return {id:s.key+':output',parameter:false,prompt:item[0],answer:item[1],groups:item[2],command:lesson.raw};
}
function quizMatches(quiz,text){
  if(quiz.choices)return String(quiz.correctChoice)===text.trim();
  const answer=text.trim().toLowerCase();if(answer.length<2)return false;
  if(/^(不懂|不知道|不会|随便|不知道什么意思)$/.test(answer))return false;
  return quiz.groups.every(group=>group.some(pattern=>new RegExp(pattern,'i').test(answer)));
}
function memoryAnswerInput(q,id){
  if(!q.choices)return '<input id="'+id+'" aria-label="复盘回答" placeholder="先用自己的话回答，再对照解释">';
  return '<select id="'+id+'" aria-label="选择回答"><option value="">请选择</option>'+q.choices.map((choice,i)=>'<option value="'+i+'">'+esc(choice)+'</option>').join('')+'</select>';
}
function renderMemoryCheck(){
  const host=$('memory-check');if(!host)return;const q=S.currentMemoryQuiz;
  if(!q){host.innerHTML='<p class="muted">本次先理解错误或执行状态，下一条正常命令再进行记忆检查。</p>';return;}
  host.innerHTML=`<span class="tag">可跳过的记忆检查</span><h3>${esc(q.prompt)}</h3>${memoryAnswerInput(q,'memory-answer')}<div class="inline-actions"><button data-action="check-memory" class="primary">检查回答</button><button data-action="skip-memory">暂时跳过</button></div><div id="memory-feedback" aria-live="polite"></div>`;
}
function answerMemory(q,text,feedbackId){
  if(!text.trim()){toast('先写一句回答，或选择跳过。');return;}
  if(!q.choices){
    const feedback=$(feedbackId);
    feedback.innerHTML='<div class="info-box">对照参考解释复核你的回答。<br><b>参考解释：</b>'+esc(q.answer)+'</div>';
    if(feedbackId==='memory-feedback')feedback.insertAdjacentHTML('beforeend','<button data-action="memory-review-later" type="button">加入待复习</button>');
    else feedback.insertAdjacentHTML('beforeend','<button data-action="memory-reviewed" data-review-id="'+esc(q.id)+'" type="button">我已对照订正</button>');
    return;
  }
  const correct=quizMatches(q,text),c=S.coach;
  if(correct){c.mastered[q.id]={at:stamp(),command:q.command,parameter:q.parameter};if(c.mistakes[q.id])c.mistakes[q.id].resolved=true;}
  else {
    delete c.mastered[q.id];
    c.mistakes[q.id]={...q,response:q.choices[Number(text)],at:stamp(),resolved:false,attempts:(c.mistakes[q.id]?.attempts||0)+1};
  }
  persist();$(feedbackId).innerHTML=`<div class="info-box${correct?'':' warn'}">${correct?'已通过本次规则检查，记为已掌握。':'尚未覆盖关键含义，已记录到错题本。'}<br><b>正确解释：</b>${esc(q.answer)}<br><small>按知识点判定，不能完整理解所有同义表达；可改写后重答。</small></div>`;renderCoachStats();
}
function renderCoachStats(){
  const c=S.coach,learned=Object.keys(c.learned),mastered=Object.values(c.mastered),wrong=Object.values(c.mistakes).filter(q=>!q.resolved),notMastered=learned.filter(key=>!Object.keys(c.mastered).some(id=>id.startsWith(key+':')));
  $('learning-stats').innerHTML=`<span>已学习命令 <b>${learned.length}</b></span><span>已掌握参数 <b>${mastered.filter(q=>q.parameter).length}</b></span><span>待巩固命令 <b>${notMastered.length}</b></span><span>未订正错题 <b>${wrong.length}</b></span>`;
}
function renderMistakes(){
  const c=S.coach,rows=Object.values(c.mistakes),remaining=Object.keys(c.learned).filter(key=>!Object.keys(c.mastered).some(id=>id.startsWith(key+':')));
  $('mistake-board').innerHTML=`<div class="panel"><h2>命令记忆与复习</h2><p class="muted">已学习指实际执行并生成过解析；已掌握指通过本地知识点检查，不代表真实项目熟练度。可选检查不会阻止继续操作。</p><div class="info-box">待巩固命令：${remaining.map(esc).join('、')||'暂无'}<br>需要复习：${rows.filter(q=>!q.resolved).map(q=>esc(q.prompt)).join('；')||'暂无未订正错题'}</div></div>${rows.map((q,i)=>`<div class="panel spaced"><div class="panel-title"><h2>${esc(q.prompt)}</h2><span class="tag">${q.resolved?'已订正':'待复习'}</span></div><div class="code-preview">${esc(q.command)}</div><p class="muted">上次回答：${esc(q.response)} · 错答次数${q.attempts}</p>${memoryAnswerInput(q,'review-answer-'+i)}<button class="spaced" data-review="${esc(q.id)}" data-review-index="${i}">再次检查</button><div id="review-feedback-${i}"></div><details class="spaced"><summary>需要时再看正确解释</summary><p>${esc(q.answer)}</p></details></div>`).join('')}`;
}

function assessmentActive(){return !!S.coach?.exam?.active;}

function renderWorkMode(){
  const exam=assessmentActive(),lesson=SIT_COURSE.find(l=>l.id===S.academy.activeLesson);document.body.classList.toggle('assessment-active',exam);document.body.classList.toggle('free-practice',!lesson&&!exam);
  $('lesson-toggle').disabled=exam;$('session-kind').textContent=exam?'独立考核':lesson?'课程实训':'自由实训';
  $('work-task').innerHTML=exam?'<span class="tag">独立考核</span><b>按任务书独立执行，交卷前隐藏教学解析</b><button data-go="assessment">返回考核任务书</button>':lesson?academyPracticeCard():'<span class="tag">自由实训</span><b>当前未绑定课程，操作记录只进入本工程</b><p>可以自由使用工具；要计入课程产物，请先从学习路径开始该课任务。</p><button data-go="academy">选择学习任务</button>';
  const practice=currentPractice();
  if(practice)$('session-kind').textContent=S.page==='lesson'?'本课模拟终端':'案例模拟终端';
  $('command').placeholder=practice?'输入命令，按 Enter 执行':'输入命令，如 lscpu，然后按 Enter';
  renderCoachStats();
}
function afterCommand(raw,output,parsed,failed,underLoad,operationContext){
  const c=S.coach,seg=parsed.segments[0],event={environment:operationContext.environment,environmentKey:operationContext.environmentKey,projectId:operationContext.projectId,lessonId:operationContext.lessonId,attemptId:operationContext.attemptId,loadId:operationContext.loadId,seq:++c.seq,raw,at:stamp(),command:seg?.command||'',key:seg?.key||'',opts:seg?.opts||{},failed,helpOnly:Boolean(seg?.opts['--help']),fromB:seg?.fromB,issues:parsed.issues,output,underLoad,kind:'command'};
  if(seg?.command==='fio'&&!failed&&S.lastFio)event.fio=S.lastFio;
  if(seg?.command==='iperf3'&&!failed&&!seg.opts['-s']&&S.lastNet)event.net=S.lastNet;
  c.events.push(event);storeCourseEvent(event);if(c.events.length>300)c.events.shift();
  S.lastLesson=lessonForRun(raw,output,parsed,failed,S.lastCoreResult?.raw===raw?S.lastCoreResult:null);
  S.lastLesson.origin={projectId:operationContext.projectId,lessonId:operationContext.lessonId};
  if(!assessmentActive()){
    if(seg?.spec&&!failed&&!event.helpOnly)c.learned[seg.key]={at:stamp(),last:raw};
    S.currentMemoryQuiz=makeMemoryQuiz(S.lastLesson);
  }
  persist();renderCommandLesson();renderWorkMode();if(S.page==='mistakes')renderMistakes();
}
function allowWorkPage(page){return !assessmentActive()||['project','terminal','bugs','assessment'].includes(page);}
function startAssessment(){
  if(assessmentActive())return;const previousCourse=S.academy.activeLesson||(S.coach.exam?.previousProject?S.coach.exam.previousCourse:null);stopStress();const previousSession=S.coach.exam?.previousSession||sessionSnapshot();endScenario();S.academy.activeLesson=null;
  const c=S.coach,previousProject=c.exam?.previousProject||S.project;c.mode='assessment';c.hidden=false;
  if(c.exam?.result){c.examHistory=c.examHistory||[];c.examHistory.push({projectId:c.exam.projectId,started:c.exam.started,result:c.exam.result});}
  c.exam={previousCourse,previousSession,active:true,started:stamp(),startSeq:c.seq,previousProject,responses:{},analysis:'',advice:'',injected:false,fixed:false,faultEvidence:[],snapshot:null,result:null};
  S.project={id:'ASSESS-'+Date.now(),started:stamp(),observations:{},fio:[],network:[],stress:[],cases:[],reportAt:null};c.exam.projectId=S.project.id;S.report=null;S.localServer=false;S.peerServer=false;S.freeMode=true;
  $('bug-scene').innerHTML='<option value="">尚未领取故障工单</option>';persist();renderWorkMode();renderCommandLesson();showPage('assessment');toast('独立考核已开始，原项目已保留。');
}
function injectAssessmentFault(){
  const exam=S.coach.exam;if(!exam?.active||exam.injected)return;
  const ids=['nic','link','mount'];exam.caseId=ids[Math.floor(Math.random()*ids.length)];exam.injected=true;
  startScenario(exam.caseId);$('bug-scene').innerHTML='<option value="'+exam.caseId+'">当前未知故障工单</option>';
  showPage('terminal');persist();
}
function captureAssessmentBeforeFix(){const exam=S.coach.exam;if(exam?.active&&S.scene===exam.caseId){exam.faultEvidence=[...S.evidence];exam.fixed=true;}}
function syncCoachSnapshot(){
  const exam=S.coach?.exam;if(exam?.active)exam.snapshot={scene:S.scene,fixed:S.fixed,ioError:S.ioError,evidence:[...S.evidence],saved:S.saved,netFault:S.netFault,boot:S.boot,stressInterrupted:!!S.stress};
}
function renderAssessmentBoard(targetId='project-board'){
  const exam=S.coach.exam;
  $(targetId).innerHTML=`<div class="panel project-intro"><span class="tag">INDEPENDENT ASSESSMENT</span><h2>银河麒麟V10兼容性与稳定性 · 独立项目考核</h2><p class="muted">只评本轮新工程：${esc(S.project.id)}。原项目保留。当前已记录${S.coach.seq-exam.startSeq}次命令操作。${exam.restoreWarning?'<br>'+exam.restoreWarning:''}</p><div class="info-box">任务：确认硬件/系统/固件环境，完成基础巡检、五类磁盘负载、双机TCP/UDP、CPU+内存压力与监控；领取并定位故障，提交Bug、应用修复、回归；提交基于实际结果的报告。<br>验收范围：测试盘4K随机读基线38000–45000IOPS（libaio/深度16/单作业/direct1/1G/60秒持续模式），千兆TCP≥900Mbps、Retr≤10；UDP关注丢包与抖动；压力至少60模拟秒且有资源/日志监控。这里不给执行命令或排查答案。</div><div class="inline-actions"><button class="primary" data-go="terminal">进入终端独立操作</button><button data-action="inject-exam-fault" ${exam.injected?'disabled':''}>${exam.injected?'已领取故障工单':'领取故障工单'}</button><button data-go="bugs">填写Bug与回归</button></div></div><div class="panel spaced"><h2>输出理解记录</h2><p class="muted">填写你从本轮实际输出读到的事实与含义。交卷后才显示核对结果；只输入命令不会自动得到理解分。</p>${[['cpu','CPU(s)的数值与含义，和物理核心数有何区别？'],['memory','内存total是多少？available为什么不同于free？'],['speed','本次Speed是多少、代表什么？Full和Link detected=yes是否证明吞吐正常？'],['fio','IOPS、BW、块大小怎样关联？P99是否是最大延迟？'],['udp','本次UDP的Lost%与Jitter分别说明什么？']].map(([key,label])=>`<label>${label}<textarea data-exam-response="${key}" rows="2">${esc(exam.responses[key]||'')}</textarea></label>`).join('')}</div><div class="panel spaced"><h2>工单结论与处理建议</h2><p class="muted">${exam.injected?esc(scenarios[exam.caseId].desc):'先完成基础与性能任务，再领取故障工单。'}</p><label>基于哪些输出，定位到什么原因？<textarea data-exam-text="analysis" rows="3">${esc(exam.analysis)}</textarea></label><label>处理建议与修复后验证方法<textarea data-exam-text="advice" rows="2">${esc(exam.advice)}</textarea></label><div class="inline-actions"><button data-action="generate-report">记录本轮测试报告</button><button class="primary" data-action="finish-assessment">交卷并统一评分</button></div><p class="muted">未完成也可以交卷，会标注遗漏与未执行，不会默认通过。交卷前不展示解析、参考答案或评分过程。</p></div>`;
}
function gradeAssessment(){
  const exam=S.coach.exam,p=currentProjectData(),events=S.coach.events.filter(e=>e.seq>exam.startSeq&&e.projectId===(exam.projectId||S.project.id)),valid=events.filter(e=>!e.failed),details=[];
  function item(name,got,max,missing){details.push({name,got:Math.round(got*10)/10,max,missing});}
  const env=ENV_CHECKS.filter(([key])=>p.observations[key]?.ok);item('环境确认',15*env.length/ENV_CHECKS.length,15,ENV_CHECKS.filter(([key])=>!p.observations[key]?.ok).map(([,label])=>label));
  const basic=BASIC_CHECKS.filter(([key])=>p.observations[key]?.ok);item('基础检查',10*basic.length/BASIC_CHECKS.length,10,BASIC_CHECKS.filter(([key])=>!p.observations[key]?.ok).map(([,label])=>label));
  const modes=['read','write','randread','randwrite','mixed'],missingModes=modes.filter(mode=>!p.fio.some(r=>!r.error&&r.config.target.startsWith('/mnt/sit/')&&(mode==='mixed'?['rw','randrw'].includes(r.config.rw):r.config.rw===mode)));item('磁盘参数与负载覆盖',(5-missingModes.length)*4,20,missingModes);
  const tcp=p.network.some(r=>!r.error&&!r.local&&!r.udp&&r.throughput>=900&&r.retrans<=10),udp=p.network.some(r=>!r.error&&!r.local&&r.udp&&r.total>0);item('双机网络',5*Number(tcp)+5*Number(udp),10,[...(!tcp?['同基线TCP']:[]),...(!udp?['UDP接收/丢包记录']:[])]);
  const load=p.stress.some(r=>!r.error&&r.cpu>0&&r.vm>0&&r.duration>=60&&r.elapsed>=r.duration),monitors=['top','free','vmstat'].every(cmd=>valid.some(e=>e.command===cmd&&e.underLoad))&&valid.some(e=>['dmesg','journalctl'].includes(e.command)&&e.underLoad);item('压力与监控',5*Number(load)+5*Number(monitors),10,[...(!load?['跑满组合压力']:[]),...(!monitors?['负载期间CPU/内存/换页/日志取样']:[])]);
  const c=exam.caseId&&scenarios[exam.caseId],ev=new Set(exam.fixed?exam.faultEvidence:[...S.evidence]),evidence=c?c.steps.filter(([key])=>ev.has(key)).length/c.steps.length:0,diagnosis=!!c&&freeDiagnosisMatches(exam.caseId,exam.analysis)&&exam.advice.trim().length>=6;item('故障证据与原因分析',5*evidence+5*Number(diagnosis),10,[...(!c?['未领取工单']:[]),...(evidence<1?['跨层证据不足']:[]),...(!diagnosis?['原因或处理建议不足']:[])]);
  const bugs=projectBugs(),submitted=bugs.some(b=>b.logs.trim()&&b.steps.trim()&&b.frequency.trim()),regressed=bugs.some(b=>b.status==='已关闭'&&b.regressions.some(r=>r.verdict==='已解决'&&r.evidence));item('Bug与回归',4*Number(submitted)+6*Number(regressed),10,[...(!submitted?['可复现缺陷单']:[]),...(!regressed?['修复版原步骤与相关功能回归']:[])]);
  item('实际记录报告',p.reportAt?5:0,5,p.reportAt?[]:['未生成报告']);
  const readings=[
    ['cpu','lscpu',[['逻辑'],['16'],['物理','核心']],'CPU(s)=16逻辑CPU；每插槽8核心、每核2线程。'],
    ['memory','free',[['16'],['可用','回收'],['空闲']],'total=16GiB；available估计可用含可回收部分，free是完全空闲。'],
    ['speed','ethtool',[['协商','链路速率'],['不保证','不代表','不等于','不能']],'Speed是本次协商速率；Full是全双工；有载波不保证IP/路由或吞吐。'],
    ['fio','fio',[['块','bs'],['乘','×','*'],['百分位','99%','99％'],['不是最大','不等于最大','非最大']],'BW≈IOPS×块大小；P99是99%完成延迟不超过的值，不是最大延迟。'],
    ['udp','iperf3',[['丢包'],['时延变化','抖动','延迟变化']],'Lost%为丢包比例，Jitter是包时延变化，不能相互代替。']
  ].map(([key,command,groups,reference])=>{
    const patterns={cpu:/CPU\(s\):/,memory:/Mem:/,speed:/Speed:/,fio:/IOPS=/,udp:/Lost/},sample=valid.filter(e=>e.command===command&&patterns[key].test(e.output)).at(-1);
    if(key==='speed'&&sample){const value=sample.output.match(/Speed:\s*(\d+)/)?.[1];if(value)groups=[...groups,['(?<!\\d)'+value+'(?!\\d)']];}
    const answered=!!sample&&quizMatches({groups},exam.responses[key]||'');return {key,reference:reference+(sample?' 本轮证据：'+sample.output.split('\n').filter(line=>patterns[key].test(line)).join('；'):''),answer:exam.responses[key]||'未填写',ok:answered};
  });
  item('实际输出理解',readings.filter(r=>r.ok).length*2,10,readings.filter(r=>!r.ok).map(r=>r.key+'解释不足或未取样'));
  return {score:Math.round(details.reduce((sum,d)=>sum+d.got,0)),at:stamp(),details,readings,trace:events.map(e=>({command:e.raw,at:e.at,failed:e.failed,issues:e.issues,opts:e.opts})),diagnosis};
}
function finishAssessment(){
  if(!assessmentActive())return;if(S.stress)stopStress();const exam=S.coach.exam;exam.result=gradeAssessment();exam.active=false;S.coach.mode='free';
  if(exam.result.diagnosis)S.project.cases.push({id:exam.caseId,title:scenarios[exam.caseId].title,at:stamp(),analysis:exam.analysis,advice:exam.advice,free:true,commands:exam.result.trace.map(t=>t.command)});
  if(S.project.reportAt)generateReport();S.freeMode=false;S.currentMemoryQuiz=S.lastLesson?makeMemoryQuiz(S.lastLesson):null;persist();renderWorkMode();renderCommandLesson();showPage('assessment');
}
function renderAssessmentResult(){
  const exam=S.coach.exam,r=exam?.result;if(!r)return '';
  return `<div class="panel assessment-result"><div class="panel-title"><h2>独立项目考核 · ${r.score}/100</h2><span class="tag">${esc(r.at)}</span></div><p class="muted">本地操作与知识点规则评分。评分不等于真实服务器资质或真实项目经验。</p><table><thead><tr><th>能力</th><th>得分</th><th>遗漏/待复核</th></tr></thead><tbody>${r.details.map(d=>`<tr><td>${d.name}</td><td>${d.got}/${d.max}</td><td>${esc(d.missing.join('、')||'本轮规则已覆盖')}</td></tr>`).join('')}</tbody></table><h3>输出理解复盘</h3>${r.readings.map(q=>`<div class="output-field"><b>${q.ok?'✓':'待复习'} ${q.key}</b><p>你的理解：${esc(q.answer)}</p><p>核对：${esc(q.reference)}</p></div>`).join('')}<details><summary>使用过的命令与参数检查</summary>${r.trace.map(t=>`<div class="code-preview">${esc(t.command)}<br>${t.failed?'FAIL / 参数或执行未完成':'已返回输出；不代表该项测试一定PASS'} ${esc(t.issues.join('；'))}<br>实际参数：${esc(JSON.stringify(t.opts))}</div>`).join('')}</details><h3>标准工作流程</h3><p class="muted">环境/版本与范围确认 → 硬件、接口、地址、绑定、日志 → 同参数磁盘与双机网络 → 可控组合压力、监控、停止复查 → 故障跨层取证 → 写Bug、修复版重跑原步骤和相关功能 → 按PASS/FAIL/BLOCKED/NOT RUN生成报告。</p>${exam.caseId?'<details><summary>查看本轮故障解析</summary><p class="muted">'+esc(scenarios[exam.caseId].analysis)+'</p></details>':''}<div class="inline-actions">${exam.previousProject?'<button data-action="restore-project">恢复考核前的课程与项目</button>':'<span class="muted">先前工程已恢复，成绩作为历史记录保留。</span>'}<button data-action="start-assessment">再做一轮独立考核</button></div></div>`;
}

function failedSimulation(parsed,output){
  if(parsed.issues.length||/场景已切换|旧作业取消|execution error/.test(output))return true;const cmd=parsed.segments[0]?.command;
  if(cmd==='fio')return /err=[1-9]|参数|只允许|不实现|不存在|作业在运行/.test(output);
  if(cmd==='iperf3')return /refused|unreachable|Network is down|No carrier|Cannot assign|参数无效|参数不正确|必须是|作业正在运行|用法/i.test(output);
  if(['stress','stress-ng'].includes(cmd))return /已有|必须|用法|CPU 0/.test(output);
  return /未实现的模拟命令|虚拟文件不存在|虚拟日志不存在|尚无已保存|No such device|不支持本次位置参数|invalid count|No such virtual|Destination Host Unreachable|100% packet loss/.test(output);
}
function workVerdict(state,index){
  if(state==='已完成'||state==='已生成')return 'PASS';if(state==='未执行'||state==='未生成')return 'NOT RUN';
  const item=index===2?(latestDiskBaseline()?.error?latestDiskBaseline():['read','write','randread','randwrite','mixed'].map(latestDiskMode).find(run=>run?.error)):index===3?S.project.network.at(-1):null;
  if(item?.error&&/refused|Network is down|No carrier|unreachable|No such device|not mounted|未挂载|Cannot assign/i.test(item.output))return 'BLOCKED';
  return state==='发现异常'?'FAIL':'BLOCKED';
}
function detailedResultRows(){
  const p=currentProjectData(),rows=[];
  for(const mode of ['read','write','randread','randwrite','mixed']){
    const r=latestDiskMode(mode);
    rows.push(['fio '+mode,!r?'NOT RUN':r.error?/No such|not mounted|未挂载/.test(r.output)?'BLOCKED':'FAIL':'PASS',!r?'没有实际执行记录':r.error?r.output:'负载已完成；'+r.iops+' IOPS / '+r.bw+'MiB/s。不同模式性能仅记录，未声明基线时不作性能通过结论。']);
  }
  const baseline=latestDiskBaseline();
  rows.push(['fio 4K 随机读基线',!baseline?'NOT RUN':baseline.error&&/No such|not mounted|未挂载/.test(baseline.output)?'BLOCKED':baselinePass(baseline)?'PASS':'FAIL',!baseline?'未执行可比较的基线作业':baseline.error?baseline.output:baseline.iops+' IOPS / 教学范围 38,000–45,000 IOPS / '+(baseline.scene||'正常环境')+' v'+baseline.version]);
  for(const udp of [false,true]){const r=p.network.filter(r=>r.udp===udp&&!r.local).at(-1);rows.push(['iperf3 '+(udp?'UDP':'TCP'),!r?'NOT RUN':r.error?'BLOCKED':udp?r.loss===0?'PASS':'FAIL':r.throughput>=900&&r.retrans<=10?'PASS':'FAIL',!r?'未取得接收结果':r.error?r.output:r.output]);}
  return rows;
}
function handleCoachClick(b){
  const action=b.dataset.action;
  if(action==='check-memory'){answerMemory(S.currentMemoryQuiz,$('memory-answer').value,'memory-feedback');return true;}
  if(action==='memory-review-later'){
    const q=S.currentMemoryQuiz,c=S.coach,prior=c.mistakes[q.id];
    c.mistakes[q.id]={...q,response:$('memory-answer').value,at:stamp(),resolved:false,attempts:(prior?.attempts||0)+1};
    persist();renderCoachStats();b.textContent='已加入待复习';b.disabled=true;return true;
  }
  if(action==='memory-reviewed'){
    const q=S.coach.mistakes[b.dataset.reviewId];if(q){q.resolved=true;persist();renderMistakes();renderCoachStats();}
    return true;
  }
  if(action==='skip-memory'){$('memory-feedback').innerHTML='<p class="muted">本次已跳过，不计为已掌握，也不计错题。</p>';return true;}
  if(b.dataset.review){const q=S.coach.mistakes[b.dataset.review],index=b.dataset.reviewIndex;answerMemory(q,$('review-answer-'+index).value,'review-feedback-'+index);return true;}
  if(action==='start-assessment'){startAssessment();return true;}
  if(action==='inject-exam-fault'){injectAssessmentFault();return true;}
  if(action==='finish-assessment'){finishAssessment();return true;}
  if(action==='restore-project'){if(!assessmentActive()&&S.coach.exam?.previousProject){stopStress();endScenario();S.project=S.coach.exam.previousProject;S.coach.exam.previousProject=null;S.academy.activeLesson=S.coach.exam.previousCourse||null;S.report=null;restoreSession(S.coach.exam.previousSession);S.coach.exam.previousSession=null;persist();refresh();toast('已恢复考核前项目；考核成绩仍保留。');}return true;}
  if(action==='operation-followup'){
    const s=S.lastLesson?.parsed.segments[0];if(!s)return true;const category=['fio','iperf3'].includes(s.command)?s.command:['stress','stress-ng'].includes(s.command)?'stress':'Linux 基础';
    S.operationFollowups=operationFollowups(S.lastLesson);S.operationCommand=S.lastLesson.raw;S.followup=0;$('interview-category').value=category;S.q=questions.findIndex((_,i)=>questionCategory(i)===category);renderQuestion();showPage('interview');return true;
  }
  return false;
}
function operationFollowups(lesson){
  const s=lesson.parsed.segments[0],quiz=makeMemoryQuiz(lesson),field=lesson.fields[0];
  return [
    [quiz?.prompt||'本次命令的关键参数是什么？',(quiz?.groups||[['参数','目标']]).map((group,i)=>['本次参数知识点'+(i+1),group.flatMap(word=>word.startsWith('(?<!')?[word.match(/\d+/)?.[0]||word]:word.split('|'))]),quiz?.answer||lesson.purpose],
    ['本次输出的'+(field?.field||'错误状态')+'说明什么？',[['输出含义',[field?.field.split(' / ')[0]||'状态','输出','含义']],['证据边界',['不能','还需','结合','不等于']]],field?field.actual+'。'+field.meaning+'。还需结合其他层次证据判断。':'本次命令未取得正常结果，先排查前置条件与参数。'],
    ['如果本次检查发现异常，你按什么流程继续？',[['确认现象',['现象','复现']],['定位取证',['日志','驱动','路径','参数']],['工作闭环',['bug','回归','报告']]],'先确认现象与范围，保存实际命令、参数和输出，跨层检查与对照基线，整理Bug，修复后重跑原步骤和相关功能并记录报告。']
  ];
}
function initCoach(){
  const c=S.coach;
  COMMAND_KB.push(['磁盘','du -sh /var/log','汇总目录占用','空间不足时定位占用来源','size、path','512M /var/log','du与df有什么区别？'],['性能','stress-ng --cpu 2 --vm 1 --vm-bytes 512M --timeout 60s','模拟stress-ng兼容子集','资源压力练习','worker、资源、退出状态','dispatching hogs: 2 cpu, 1 vm','为什么不能把压力工具当成fio？']);
  $('lesson-toggle').addEventListener('click',()=>{if(assessmentActive())return;c.hidden=!c.hidden;persist();renderCommandLesson();});
  document.addEventListener('input',event=>{if(!assessmentActive())return;const el=event.target;if(el.dataset.examResponse){c.exam.responses[el.dataset.examResponse]=el.value;persist();}if(el.dataset.examText){c.exam[el.dataset.examText]=el.value;persist();}});
  // Extend, rather than replace, the existing interview follow-up pools.
  FOLLOWUP_BY_CATEGORY['Linux 基础'].push(
    ['ip link和ethtool有什么区别？',[['接口',['接口','管理状态']],['链路',['协商','载波','速率']]],'ip link看系统接口、管理状态、MTU等；ethtool看协商速率、双工、物理载波及驱动信息。接口UP不证明地址、路径和应用性能正确。'],
    ['Speed、Duplex和Link detected分别表示什么？',[['速率',['协商','速率']],['双工',['全双工','双工']],['载波',['载波','物理链路']]],'Speed是当前协商速率，Duplex是双工方式，Link detected表示物理载波。100Mb/s Full yes是百兆全双工且有载波，不是千兆。'],
    ['Speed=100Mb/s时，下一步怎么查？',[['物理',['网线','线对','接头']],['端口',['交换机','端口']],['配置',['两端','自协商']]],'检查网线线对、接头和交换机端口能力，核对双方自协商/强制配置；修复后再核对协商和同参数吞吐。']
  );
  if(c.exam?.active){const snapshot=c.exam.snapshot;if(snapshot){S.scene=snapshot.scene;S.fixed=snapshot.fixed;S.ioError=snapshot.ioError;S.evidence=new Set(snapshot.evidence);S.saved=snapshot.saved;S.netFault=snapshot.netFault;S.boot=snapshot.boot;if(snapshot.stressInterrupted)c.exam.restoreWarning='页面刷新已停止上一轮模拟压力；该轮未形成完成成绩，请重新执行。';}S.freeMode=true;$('bug-scene').innerHTML=c.exam.injected?'<option value="'+c.exam.caseId+'">当前未知故障工单</option>':'<option value="">尚未领取故障工单</option>';updateResourceState();}
  renderWorkMode();renderCommandLesson();renderMistakes();
}

function duOutput(args){
  const path=args.find(v=>v.startsWith('/'))||'/home/student';
  if(path==='/var/log')return '512M\t/var/log';
  if(path.startsWith('/mnt/sit'))return (storageState().full?'240G':'12G')+'\t'+path;
  if(['/root','/home/student'].includes(path))return '1.0G\t'+path;
  return 'du: cannot access '+path+': No such virtual directory';
}
function smartOutput(args){
  const device=args.find(v=>v.startsWith('/'));
  if(!['/dev/sda','/dev/sdb'].includes(device))return 'smartctl: No such virtual device';
  if(device==='/dev/sdb'&&!storageState().present)return 'smartctl: No such device';
  return `Device Model: ${device==='/dev/sda'?'SimBoot120':'SimSSD240'}\nUser Capacity: ${device==='/dev/sda'?120:240} GiB\nSMART overall-health self-assessment: PASSED\nReallocated_Sector_Ct: 0\nCurrent_Pending_Sector: 0`;
}
