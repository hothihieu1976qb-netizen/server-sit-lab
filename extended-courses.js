'use strict';

function checked(label,kind,match){
  return [label,labEvidence(kind,match)];
}
function stepOf(title,goal,concept,commands,checks,question,choices,answer,feedback,example){
  return {title,goal,concept,commands,checks,question,choices,answer,feedback,example};
}
function observedInOrder(context, ...matches){
  let start=0;
  return matches.every(match=>{
    const index=context.events.findIndex((event,i)=>i>=start&&match(event));
    if(index<0)return false;
    start=index+1;
    return true;
  });
}
const examplePing='ping -c 2 '+LAB_PEER;
const peerPing=e=>e.kind==='ping'&&e.target===LAB_PEER&&!e.failed;
const bootEvent=e=>e.kind==='reboot';
const writeCheck=e=>e.kind==='fio'&&labComparableDisk(e,'write',1);
const cleanDiskRead=e=>e.kind==='fio'&&!e.failed&&labComparableDisk(e,'randread',1);
const createProbe='touch /mnt/sit/permission-check';
const pciDrivers='lspci -nnk';
const logKernel='journalctl -b -k';
const reverseTCP='iperf3 -c '+LAB_PEER+' -t 10 -P 1 -R';

const EXTENDED_GUIDED_COURSES=[
  {
    id:'nic-probe',group:'驱动与启动',level:'进阶',title:'PCI 有网卡，为什么系统没有接口？',
    description:'区分硬件枚举、模块加载、驱动绑定、固件初始化和接口注册。',initial:{nicFirmware:false},
    recap:'建立了从 PCI 识别、模块加载到驱动绑定、接口注册的证据链。修复包在下一次启动应用。',
    challenge:{title:'网卡探测失败复盘',symptom:'PCI 能看到网卡，接口列表里却只有 lo。采集绑定与日志再验证。',initial:{nicFirmware:false}},
    steps:[
      stepOf('确认哪一层成功','对照 PCI、内核模块与接口列表。',
        'lspci 看到硬件表示 PCI 枚举成功；-k 区分正在使用的驱动与候选模块。lsmod 只读已加载模块，无法证明它成功绑定了目标设备。',
        [pciDrivers,'lsmod','ip -br link'],
        [checked('已查看 PCI 的网卡绑定', 'pci',e=>e.withDrivers&&!e.nicBound),checked('确认 simnic 已加载','modules',e=>e.nicLoaded),checked('确认本机未创建接口','link',e=>!e.present&&!e.fromPeer)],
        'PCI 有网卡、lsmod 有 simnic，ip link 没有 enp3s0。当前该定位哪一步？',
        ['直接判定 PCI 设备损坏','继续查驱动绑定与 probe 初始化','先配置静态 IP'],1,'接口缺失发生在地址配置之前。先保留 PCI 和驱动输出。',
        ['把“有设备”与“驱动已绑定”分开','03:00.0 有 Kernel modules: simnic，却没有 Kernel driver in use: simnic；ip -br link 只列出 lo。',
          '模块已加载，当前网卡仍未绑定。设备枚举与接口注册之间还有驱动探测。','查本次启动的 firmware/probe 日志，区分未装载和初始化失败。']),
      stepOf('把失败定位到初始化','对照模块声明的固件与本次启动错误。',
        'modinfo 报告模块文件的元数据，firmware 字段说明依赖；启动日志才记录本次请求固件时出了什么问题。',
        ['modinfo simnic',logKernel,'dmesg -T'],
        [checked('核对模块声明的固件','module-info',e=>e.driver==='simnic'),checked('本次内核日志包含同名固件和 probe 失败','logs',e=>!e.previousBoot&&e.kernelOnly&&/simnic-fw\.bin.*probe failed/.test(e.output))],
        '两条输出都指向 simnic-fw.bin，下一步最合理的是？',
        ['检查与驱动匹配的固件包及部署','修改默认网关','扩大 iperf3 的并行流数'],0,'先修补固件依赖，在同一启动条件下看 probe 是否恢复。',
        ['从日志匹配对应设备','日志 simnic 0000:03:00.0: firmware simnic-fw.bin not found; probe failed (-2)。',
          '地址可与 lspci 对应，文件名与 modinfo 对应。说明本次探测缺少所需依赖。','真实环境记录驱动与固件版本并确认变更范围，测试环境只切换模拟包状态。']),
      stepOf('在同一触发条件下回归','装入模拟固件，重启后查绑定、接口和对端连通。',
        '只写入固件包不等于新驱动实例已初始化。统一在新启动轮次检查，不用旧证据喂给新环境。',
        ['sim nic-fw on','reboot',pciDrivers,'ip -br link',examplePing],
        [['包变更后重启，再核对绑定与连通',ctx=>observedInOrder(ctx,e=>e.kind==='nic-firmware'&&e.enabled,bootEvent,e=>e.kind==='pci'&&e.nicBound&&e.withDrivers,e=>e.kind==='link'&&e.present,peerPing)]],
        '哪份记录能支持本轮回归通过？',['只有包安装成功','只有 lsmod 有驱动','同次重启后绑定正确、接口存在、探测成功'],2,'三条证据覆盖初始化到基本可用的路径，业务吞吐仍要另测。',
        ['把证据标在修复后的启动轮次','Boot 2 的 lspci 显示实际使用 simnic，ip link 有 enp3s0，ping 收到对端响应。',
          '覆盖了此前中断的绑定与接口注册。','报告对端、轮次和覆盖范围，再安排反向与负载回归。'])
    ]
  },{
    id:'hba-compat',group:'驱动与启动',level:'进阶',title:'换内核后，系统启动了却找不到测试盘',
    description:'沿 HBA、内核模块、块设备和文件系统定位版本不兼容。',initial:{hbaCompatible:false},
    recap:'核对了运行内核和模块构建标识，并验证更换匹配模块后测试盘和挂载恢复。',
    steps:[
      stepOf('确认系统盘和测试盘路径','查看块设备及 HBA 的实际驱动绑定。',
        '系统盘和测试盘可以走不同控制器。系统能启动只证明启动盘可用，不能覆盖独立 HBA 的测试盘。',
        ['lsblk -f',pciDrivers,'findmnt /mnt/sit'],
        [checked('确认独立测试盘不可见','block',e=>e.fileSystems&&!e.present),checked('确认 HBA 存在但未绑定','pci',e=>e.withDrivers&&!e.hbaBound),checked('目标卷当前未挂载','mount-state',e=>!e.mounted&&e.target==='/mnt/sit')],
        'sda2 正常且 HBA PCI 条目存在，但 sdb 消失。应查哪个方向？',['先查 HBA 的驱动绑定','先处理测试目录权限','先改 IP 地址'],0,'先恢复控制器路径。端点设备没有枚举时，文件系统检查无法完成。',
        ['控制器和盘是两层','lsblk 仅有 sda2；lspci 有 04:00.0 SAS controller，但没有对应的 driver in use。','证据指向独立 HBA 初始化链路，并未证明测试盘介质坏。','核对模块、内核与本次启动的加载错误。']),
      stepOf('对照模块与运行内核','用 uname、modinfo、lsmod 和内核日志给出版本证据。',
        'vermagic 包含模块构建时的内核标识等信息。模块文件可存在，但因版本不兼容而未被装载。',
        ['uname -a','modinfo simhba','lsmod',logKernel],
        [checked('记录运行内核','kernel'),checked('模块构建标识与当前内核不匹配','module-info',e=>e.driver==='simhba'&&!e.compatible),checked('确认 HBA 模块未装载','modules',e=>!e.hbaLoaded),checked('本次出现版本错误','logs',e=>!e.previousBoot&&/version magic mismatch/.test(e.output))],
        '这里哪个组合能证明版本方向？',['盘名拼错','vermagic 与当前内核不匹配，启动日志有 invalid module format','服务端未监听'],1,'同时留运行内核、模块和日志，便于他人复测。',
        ['按实际值做版本矩阵','uname: 4.19.90-sit.sim；modinfo vermagic: 4.18-sit.sim；内核拒绝加载。','版本标识和错误互相印证。不能用旧内核下的 PASS 覆盖这个组合。','对目标内核使用匹配模块并记录版本，再重新启动。']),
      stepOf('恢复路径并做读回归','应用匹配包、重启、确认挂载原测试卷并读测试文件。',
        '硬件回归需覆盖接口恢复和原业务用途。这里除控制器绑定，还验证读取确实走 /mnt/sit 上的测试盘。',
        ['sim hba-driver match','reboot','lsblk -f','findmnt /mnt/sit',labRead(1)],
        [['匹配包、重启、设备恢复和原路径读成功',ctx=>observedInOrder(ctx,e=>e.kind==='hba-package'&&e.enabled,bootEvent,e=>e.kind==='block'&&e.present&&e.fileSystems,e=>e.kind==='mount-state'&&e.mounted,cleanDiskRead)]],
        '能识别 sdb1 后还要补哪两项？',['确认挂载源和同目标读回归','跑 ping 和 UDP','仅恢复模块文件名即可'],0,'回归记录应包含设备与用例两条证据。',
        ['看见就绪再跑负载','Boot 2 的 findmnt 指向 /dev/sdb1，4 KiB 随机读返回 err=0。','本轮证明固定组合与该测试路径恢复。','记录环境和影响范围，后续可重复多轮启动并加入写与稳定性用例。'])
    ]
  },{
    id:'host-route',group:'网络排查',level:'进阶',title:'IP 都在同网段，为什么流量去了错误网关？',
    description:'用目的路由查询解释 /32 与 /24 的优先关系。',initial:{badRoute:true},
    recap:'观察了错误的精确路由，移除 /32 后重新验证直连出口、邻居和对端通信。',
    steps:[
      stepOf('先排除链路与地址缺失','检查网卡、地址，再复现对端不可达。',
        '接口 UP、有载波、配置 IPv4 只是链路和地址的事实。若同网段地址仍无法探测，继续核对实际路由选择。',
        ['ip -br addr','ethtool enp3s0',examplePing],
        [checked('取得本机已有地址','addr',e=>e.address===LAB_CIDR),checked('查到千兆链路','carrier',e=>e.speed===1000),checked('复现到 B 路由失败','ping',e=>e.target===LAB_PEER&&e.reason==='route')],
        '接口和地址正常，但探测目标失败。哪项最能验证实际经过的路径？',['查看磁盘 inode','查看当前进程 PID','对该目标执行 ip route get'],2,'路由表中的实际匹配项比是否有默认网关更具体。',
        ['先核对端点','A=192.168.10.10/24，B=192.168.10.20/24，链路千兆却无法探测。','二者可在同一网段直接通信，但更具体的路由仍可能改变出口。','保留失败，查询目标地址实际选中的下一跳。']),
      stepOf('发现更具体的路由','对照整表的 /32 条目和目标查询返回。',
        '路由一般按最长前缀匹配。这个模型中精确 /32 命中先于同网段 /24，所以指向了不存在的 192.168.10.254。',
        ['ip route','ip route get 192.168.10.20'],
        [checked('整表显示错误的目标下一跳','route',e=>/192\.168\.10\.254/.test(e.output)),checked('具体目的路由实际选择错误网关','route-lookup',e=>e.wrong)],
        '同一个目的地址同时匹配 /24 与 /32，此场景优先哪个？',['/24 因为覆盖地址更多','/32 因为更具体','由网卡速率决定'],1,'用 route get 采集出口、下一跳和源地址。',
        ['读 via、dev 和 src','192.168.10.20 via 192.168.10.254 dev enp3s0 src 192.168.10.10。','via 是下一跳，dev 是出口，src 是所选的源地址。这里错误的是下一跳。','只撤回误加的主机路由，保留其它配置。']),
      stepOf('撤回变更并验证传播范围','移除错误路由并用相同目标复测。',
        '删掉错误条目后需要重新确认实际匹配。ping 成功后读取邻居项，可补充同链路 IP 到 MAC 的观察。',
        ['sim host-route clear','ip route get 192.168.10.20',examplePing,'ip neigh'],
        [['撤回后直连路由、ICMP 和邻居均有证据',ctx=>observedInOrder(ctx,e=>e.kind==='route-change'&&!e.wrong,e=>e.kind==='route-lookup'&&!e.wrong,peerPing,e=>e.kind==='neigh'&&e.output.includes(LAB_PEER))]],
        '哪项构成最小回归证据？',['清理条目后实际走直连，再用原地址成功探测','只看到命令返回','改用另一台主机来回避原问题'],0,'保留变更前后针对同一目标的输出。',
        ['回归仍用原对端','route get 没有 via，ping 收到响应，ip neigh 报告 B 的 MAC。','结合三个独立输出可复核这次路径恢复。','跨网段业务需另查路由策略和其他转发节点。'])
    ]
  },{
    id:'service-port',group:'服务与日志',level:'基础',title:'服务启动失败，如何走完配置到监听的验证？',
    description:'区分 systemd 状态、服务日志、配置条件、监听和应用探测。',initial:{configuredPort:'abc'},
    recap:'看到了服务失败的具体配置原因。保存、重启、监听和探测均有前后记录。',
    challenge:{title:'启动配置端口错误',symptom:'服务没有监听。确认配置、退出原因与修复后回归。',initial:{configuredPort:'abc'}},
    steps:[
      stepOf('确认故障范围','看失败单元、独立服务状态和实际端口。',
        'systemctl --failed 给出失败清单，status 给出目标服务状态和退出信息，ss 查看当前监听。服务名、协议和端口要同时对上。',
        ['systemctl --failed','systemctl status sit-agent','ss -lnt'],
        [checked('枚举到服务失败','units',e=>e.agentFailed),checked('目标服务有退出状态','service-status',e=>!e.active),checked('确认 9090 未监听','sockets',e=>e.agentPort===0)],
        'Active: failed 表明什么？',['服务当前失败，需查该单元日志','端口一定被防火墙屏蔽','内核一定无法启动'],0,'服务状态只是现象，查看目标单元的日志才能进一步定位。',
        ['服务失败不等于拓扑失败','status 显示 status=2/INVALIDARGUMENT，ss 没有 sit-agent 的 :9090。','这是本机服务未就绪，不是远端防火墙的直接结果。','把日志范围缩到本次启动的 sit-agent 单元。']),
      stepOf('把报错与配置行对应','分别读日志和配置，解释出错值。',
        'journalctl -u 选择特定服务；-b 选择启动。服务解析配置的报错来自用户空间，-k 的内核过滤不适合这里。',
        ['journalctl -u sit-agent -b','cat /etc/sit-agent.conf','sim probe-service 9090'],
        [checked('本次目标单元记录无效端口','logs',e=>e.unit===LAB_AGENT&&!e.previousBoot&&/invalid listen port/.test(e.output)),checked('文件中出现同一个无效值','service-config',e=>e.port==='abc'),checked('本机应用探测确实失败','service-probe',e=>e.failed)],
        '日志和配置都出现 listen_port=abc，处理顺序是什么？',['以合法端口更新配置，再重启服务验证','增大内存','直接判定网卡损坏'],0,'先变更有证据支撑的配置项，再验证运行态。',
        ['对应退出数字和配置文本','日志 invalid listen port "abc"，配置 listen_port=abc。','同一个错误值在两处出现，支持参数解析失败。','修正为合法且可使用的端口，再检查进程实际绑定。']),
      stepOf('验证运行态与应用结果','保存 9090、重启，再查监听和本机探测。',
        '文件内容更新后，老进程不一定重读。重启后状态和监听都应核对。模拟探测读取服务端口，独立于 ss 的展示。',
        ['sim service-port 9090','systemctl restart sit-agent','ss -lnt','sim probe-service 9090'],
        [['配置、重启、监听和同端口探测按序取得',ctx=>observedInOrder(ctx,e=>e.kind==='service-config-change'&&e.port===9090,e=>e.kind==='service-restart'&&e.active,e=>e.kind==='sockets'&&e.agentPort===9090,e=>e.kind==='service-probe'&&!e.failed&&e.port===9090)]],
        '本回归覆盖了什么？',['已覆盖所有外网访问','已覆盖本机配置生效、监听和应用探测','只覆盖文件可读'],1,'如需验证跨机访问，另加远端路径、访问策略和应用测试。',
        ['分层采集修复证据','active (running)、LISTEN :9090、probe connected；三个结果都来自当前运行态。','确认本机服务真实可用的模拟路径。','报告只写验证覆盖的范围，远端访问要额外测试。'])
    ]
  },{
    id:'permission',group:'系统与文件',level:'基础',title:'磁盘可写，但测试账号为什么没有写权限？',
    description:'查身份、组、目录权限与挂载选项，按最小权限验证。',initial:{fileWritable:false},
    recap:'在同一个测试账号下验证目录权限的修正，避免把权限错误误判为磁盘损坏。',
    steps:[
      stepOf('确定谁在执行、目标在哪','查询当前用户、组和挂载模式，再复现写入失败。',
        '有效身份和组决定访问检查。挂载为 rw 是卷层允许写，目录权限还会单独限制创建。',
        ['whoami','id','findmnt /mnt/sit',createProbe],
        [checked('确认 student 属于 sitqa','identity',e=>e.group==='sitqa'),checked('挂载为 rw','mount-state',e=>e.mounted&&!e.readOnly),checked('实际触发 EACCES','file-create',e=>e.reason==='permission')],
        '卷为 rw 但 touch 返回 Permission denied。优先查什么？',['进程身份和目录属组/权限','是否有另一张网卡','fio 块大小'],0,'先确认是谁在什么路径上创建。',
        ['卷层与权限层各有检查','id 显示 student 属于 sitqa；目标挂载为 rw；touch 返回 Permission denied。','证据排除了当前卷只读，指向访问控制。','查看目录本身的权限，再决定最小权限修复。']),
      stepOf('解读目录权限而非文件内容','用 ls -ld 看属主、属组和各组位。',
        '-l 给长格式，-d 标记显示目录本身。目录中的创建通常需要写与搜索权限（w 与 x），不能只看读权限。',
        ['ls -ld /mnt/sit','id'],
        [checked('读取根目录属组位且缺写','file-list',e=>e.directory&&!e.groupWrite),checked('同一账号和组已核对','identity',e=>e.group==='sitqa')],
        'drwxr-xr-x root sitqa 中，sitqa 组缺少哪一位？',['读权限 r','写权限 w','目录搜索权限 x'],1,'该组有 r-x，没有创建所需的写权限。',
        ['拆成三段读','第一个 d 标识目录，随后 rwx / r-x / r-x；root 是属主，sitqa 是属组。','当前组能读和搜索目录，不能在此创建文件。','按批准的目录策略补组权限，并保留执行身份核查。']),
      stepOf('用原账号验证最小变更','模拟授予组写权限，并验证原命令创建了文件。',
        '改变的是指定目录对测试组的权限。回归保持路径和账号一致；查询文件确认实际创建。',
        ['sim access rw','ls -ld /mnt/sit',createProbe,'ls -l /mnt/sit/permission-check'],
        [['权限变更后以原账号创建并观察文件',ctx=>observedInOrder(ctx,e=>e.kind==='access-change'&&e.enabled,e=>e.kind==='file-list'&&e.directory&&e.groupWrite,e=>e.kind==='file-create'&&e.created,e=>e.kind==='file-list'&&!e.directory&&!e.failed)]],
        '怎样让回归反映原账号真正恢复？',['由任意高权限账号执行后结束','用原账号在原目录创建并检查结果','仅记录目录名'],1,'验收使用原触发操作，排除权限绕过造成的假通过。',
        ['目标与身份须一致','目录变为 drwxrwxr-x；空探测文件属主 student。','直接证明测试组在目标目录获得所需权限。','实际工作中再核对其他组权限和回退计划。'])
    ]
  },{
    id:'read-only-fs',group:'存储故障',level:'进阶',title:'测试卷能读取，却为什么不能写？',
    description:'区分 EROFS、权限错误和 I/O 错误，保留只读保护证据。',initial:{readOnly:true},
    recap:'识别了只读挂载及错误码，保留日志并在隔离环境做同参数写回归。',
    steps:[
      stepOf('区分读通与写通','读取文件后用同一挂载上的虚拟作业测写。',
        '只读卷可以读取已有文件。能读取不能推断允许写。EROFS 表示操作被只读文件系统拒绝。',
        ['findmnt /mnt/sit',labRead(1),labWrite],
        [checked('读取挂载选项为 ro','mount-state',e=>e.mounted&&e.readOnly),['读通并取得原写入的 EROFS',ctx=>observedInOrder(ctx,cleanDiskRead,e=>writeCheck(e)&&e.reason==='read-only')]],
        '就算用户拥有目录写权限，卷为 ro 时创建文件会怎样？',['依然会被只读保护拒绝','必然成功','自动转成另外一块盘'],0,'文件系统挂载模式比目录许可更先限制写入。',
        ['在同一卷对照两种作业','findmnt OPTIONS=ro；randread err=0；write err=30。','只读挂载能解释读成写败。此时应保留证据停止追加写负载。','用内核日志判断是预期只读挂载还是异常后的保护行为。']),
      stepOf('关联内核保护与权限证据','查看文件系统消息，并确认目录组权限。',
        '检测到文件系统问题时，系统可能按配置保护性地只读挂载。目录权限和只读保护要分开解释。',
        ['dmesg -T','ls -ld /mnt/sit'],
        [checked('取得只读保护日志','logs',e=>e.kernelOnly&&/remounting filesystem read-only/.test(e.output)),checked('目录权限本身允许写','file-list',e=>e.directory&&e.groupWrite)],
        '日志表明保护性只读，真实工作中下一步应该怎么做？',['直接强制覆盖系统卷','停止写入、保存证据，确认影响与处置计划','仅重启压测'],1,'真实修复动作需要明确卷身份、证据和授权。',
        ['错误的上下文比错误字样更重要','EXT4-fs (sdb1) remounting filesystem read-only。','设备名 sdb1 可与 findmnt 的源核对；单行还不能证明介质根因。','由授权人员按环境处理；本例使用预定的隔离修复操作。']),
      stepOf('验证隔离修复结果','切换模拟修复，确认 rw 后按原参数重测写入。',
        'sim fs-mode rw 表示在本模拟安全处置后恢复。工程验收仍要实际跑原写入，而不是只看 rw 标签。',
        ['sim fs-mode rw','findmnt /mnt/sit',labWrite],
        [['恢复后同目标读写挂载、原写入成功',ctx=>observedInOrder(ctx,e=>e.kind==='fs-mode'&&!e.readOnly,e=>e.kind==='mount-state'&&e.mounted&&!e.readOnly,e=>writeCheck(e)&&!e.failed)]],
        '回归报告应同时保留什么？',['只保留最后一次成功','原 EROFS、处置条件与同参数重测','只保留目录权限'],1,'报告需能重现原失败，并说明修复后的覆盖范围。',
        ['用同一作业验证恢复','挂载行为 rw，原 4 KiB 写入负载 err=0。','当前模拟保护不再阻塞该用例。','继续关注真实长稳和文件系统健康验证，报告中注明未覆盖。'])
    ]
  },{
    id:'inode',group:'存储故障',level:'基础',title:'df 还有空间，新文件却报磁盘满',
    description:'对照文件系统字节容量和 inode，验证小文件创建。',initial:{inodeUsed:1000},
    recap:'用同一挂载点的数据区分字节容量和 inode，恢复后重跑同一个新建文件动作。',
    steps:[
      stepOf('复现空文件创建失败','查目标容量再创建一个空探测文件。',
        '创建新文件需要目录项和文件元数据。ENOSPC 可以由字节容量或 inode 用尽触发，单看 df -h 易漏查。',
        ['df -hT',createProbe],
        [checked('同一挂载的容量有余量','space',e=>e.mounted&&e.usedPercent<100),checked('新建空文件报告 ENOSPC','file-create',e=>e.reason==='no-inodes')],
        '空文件为什么仍可能遇到 ENOSPC？',['空文件无需任何元数据','也需要一个 inode 与目录项','只因为 TCP 连接失败'],1,'检查文件系统对应的 inode 剩余量。',
        ['字节余量和文件对象数量独立','目标盘还有约 211 GiB，touch 却报 No space left on device。','空文件仍涉及文件系统元数据分配。','用 df -i 对同一个挂载行核对 IFree。']),
      stepOf('确认真正耗尽的资源','比较 df -hT 与 df -i 中 /mnt/sit 对应行。',
        'df -i 的 Inodes 是对象总数，IUsed/I/F 指已经占用和空闲的对象数量。容量用 GiB，inode 用个。',
        ['findmnt /mnt/sit','df -hT','df -i'],
        [checked('确认测试目录的挂载源','mount-state',e=>e.mounted),checked('inode 已全部占用','inodes',e=>e.free===0)],
        '哪个字段和这次错误最直接对应？',['IFree=0','熵池统计','某次磁盘总读次数'],0,'同一个挂载点有容量、无 inode，与新建失败一致。',
        ['按列名看单位','/dev/sdb1 Inodes=1000 IUsed=1000 IFree=0 IUse%=100%。','100% 指 inode 使用率，与 GiB 的使用率是两项读数。','核对小文件增长和配额，选择可控的清理验证。']),
      stepOf('恢复余量并重试','在模拟中回收部分 inode，再用原路径创建并复查计数。',
        '只在明确保留策略后清理真实数据。模拟将预置占用降到 950，创建一个文件后 IFree 应从 50 到 49。',
        ['sim inode-usage 950','df -i',createProbe,'df -i','ls -l /mnt/sit/permission-check'],
        [['回收后同操作成功，inode 数据反映新增',ctx=>observedInOrder(ctx,e=>e.kind==='inode-change'&&e.used===950,e=>e.kind==='inodes'&&e.free===50,e=>e.kind==='file-create'&&e.created,e=>e.kind==='inodes'&&e.free===49)]],
        '哪一组证据确认恢复和消耗都发生了？',['看到写入成功且 IFree 50→49','只看剩余 GiB','文件不存在但命令有参数'],0,'把新文件和 IFree 增减一起记录。',
        ['核对回收与新消耗','创建前 IFree=50；创建空文件后 IFree=49。','计数与新增一个 inode 一致。','验证持续增长的来源，不将一次清理视为根因已除。'])
    ]
  },
  {
    id:'smart-health',group:'存储故障',level:'进阶',title:'SMART 写着 PASSED，错误盘还需要排查吗？',
    description:'把设备序列号、异常属性、实际读错误与替代盘的证据关联。',initial:{pendingSectors:12,diskError:true},
    recap:'能把 SMART 总体评估、驱动日志与实际工作负载对应起来，限定换盘后的验证范围。',
    steps:[
      stepOf('核对被测试的具体磁盘','确认测试卷对应 sdb，并保存健康信息。',
        'SMART 输出需关联设备和序列号。总体评估是设备提供的汇总，单个属性的意义和阈值还与型号有关。',
        ['findmnt /mnt/sit','smartctl -a /dev/sdb'],
        [checked('定位正确的挂载源','mount-state',e=>e.mounted&&e.output.includes('/dev/sdb1')),checked('保存旧盘序列号和待处理扇区','smart',e=>e.pending===12&&e.serial==='SIM-DISK-A')],
        'SMART 总体 PASSED、Pending=12，应该如何处理？',['忽略属性，相当于没有风险','保留属性与设备身份，结合日志和 I/O 验证','立即断定控制器坏了'],1,'结合实际异常判断，避免从汇总标签直接得出健康结论。',
        ['读取两类健康信息','同一序列号下有 PASSED 和 Current_Pending_Sector=12。','整体判断与属性可以同时成立。属性异常值得核对负载和错误日志。','保留序列号、完整属性和读作业条件。']),
      stepOf('关联实际读失败','用有限读负载复现错误，并查看设备日志。',
        '介质层错误与控制器超时都可能让应用得到 EIO。设备名与错误描述是区分线索，不能只看退出数字。',
        [labRead(1),'dmesg -T','iostat -x 1'],
        [checked('目标读负载发生 I/O 错误','fio',e=>labComparableDisk(e,'randread',1)&&e.reason==='io-error'),checked('内核报告目标盘介质错误','logs',e=>e.kernelOnly&&/sdb: medium error/.test(e.output))],
        '哪两项支持继续向介质层排查？',['高吞吐和低延迟','sdb 的介质错误加上同盘异常属性','同时发生网络重传'],1,'这些是定向证据，可继续用受控替换验证。',
        ['区分应用错误与底层线索','fio 返回 EIO，较早一行是 sdb: medium error; unrecovered read (UNC)。','前者说明请求失败；后者提示读请求遇到不可恢复错误。','保存控制器、设备和替换条件，避免漏掉路径问题。']),
      stepOf('核对替代盘并按原条件重测','在模拟镜像中替换，确认序列号变了，再复测相同读作业。',
        '替代盘由实验室预制；真实工作需要处理备份、换盘和兼容性。不能把换过硬件的结果描述成原盘通过。',
        ['sim replace-disk sdb','smartctl -a /dev/sdb','findmnt /mnt/sit',labRead(1)],
        [['替代盘属性与同参数读回归均已取得',ctx=>observedInOrder(ctx,e=>e.kind==='disk-replaced',e=>e.kind==='smart'&&e.serial==='SIM-DISK-B'&&e.pending===0,e=>e.kind==='mount-state'&&e.mounted,cleanDiskRead)]],
        '本轮正确的报告范围是？',['两块盘均通过','替代盘同用例恢复，原盘仍保留失败记录','已通过全部可靠性测试'],1,'按数据实际归属写结论。替代盘成功不抹掉原盘异常。',
        ['前后报告必须可区分','SIM-DISK-A 出现介质错误；SIM-DISK-B 当前属性正常且同读负载通过。','证明替换后的教学用例可通过。','正式替换后还要覆盖写入、稳定性和热插拔等范围。'])
    ]
  },{
    id:'fio-time',group:'性能设计',level:'进阶',title:'fio 设置 30 秒，为什么不到 2 秒就结束？',
    description:'区分数据集大小、时长上限和同步引擎的有效队列深度。',initial:{},
    recap:'在同一个文件上区分了结束条件，并用同参数比较 sync 和 libaio 的有效深度。',
    steps:[
      stepOf('验证数据集先跑完','使用同步引擎，64 MiB 数据集，不设置持续运行。',
        'runtime 是运行时间上限。完成指定 I/O 量时，作业可在达到上限前退出。time_based 使作业反复处理数据集直到时限。',
        ['findmnt /mnt/sit','fio --filename=/mnt/sit/test.bin --rw=randread --bs=4k --size=64M --ioengine=sync --iodepth=16 --runtime=30 --direct=1'],
        [checked('目标测试卷已经挂载','mount-state',e=>e.mounted),checked('记录达到数据量后提前结束','fio',e=>!e.failed&&smallTimedJob(e,'sync',false)&&e.metrics.elapsed<30)],
        '--runtime=30 在没有 --time_based 时意味着什么？',['指定上限，数据先跑完可提前结束','必须跑满 30 秒','块大小为 30 KiB'],0,'保存实际耗时，不能只抄参数里的 30 秒。',
        ['分开读取指定量与实际量','64 MiB 随机读约 40 MiB/s，完成这一遍约需 1.6 秒。','30 秒没有被用满，因为数据集先结束。','加 time_based 验证时长控制，再保留实际时间。']),
      stepOf('只改持续运行条件','保持原参数，添加 time_based，再核对实际时间和提交并发。',
        '时间驱动时相同的数据集可以访问多遍。本模型同步引擎即使填写 iodepth=16，每作业也只维持一个在途请求。',
        [timedJob('sync')],
        [checked('同配置开启时间模式且跑满 30 秒','fio',e=>!e.failed&&smallTimedJob(e,'sync',true)&&e.metrics.elapsed===30),checked('看到 sync 有效队列深度 1','fio',e=>smallTimedJob(e,'sync',true)&&e.metrics?.effective===1)],
        '同步引擎的 iodepth=16 在本例能否当作同时发出 16 个请求？',['能','不能，应以有效在途数为准','只要把 64M 改成 4K 就可以'],1,'报告注明引擎、目标队列和有效深度，避免参数名误导。',
        ['参数取值与实际行为分开','runtime=30，实际 30s；请求目标深度 16，effective outstanding I/O≈1。','添加时间模式只改变停止条件。同步提交仍以一次完成再继续为主。','在同样条件下换成异步引擎观察有效并发。']),
      stepOf('控制引擎一项变量并记录结果','改为 libaio，保持数据量、深度、缓存路径与时间一致。',
        '引擎影响提交模式。真实 libaio 的有效队列还受 I/O 类型、direct 设置和环境影响，应读取实际深度分布。',
        [timedJob('libaio')],
        [checked('异步同条件作业完成，记录有效队列变化','fio',e=>!e.failed&&smallTimedJob(e,'libaio',true)&&e.metrics.elapsed===30&&e.metrics.effective===16)],
        '哪个数据适合作为这次实验的结论？',['两组相同运行条件下的有效并发、吞吐和尾延迟','只写引擎名字','只拿最初不足两秒结果作比较'],0,'比较必须覆盖同类时长与缓存条件，并写清观测限制。',
        ['需要比的是后两轮','同为 30 秒、64 MiB 数据集和 direct=1，sync≈1，libaio≈16。','条件清楚时才有依据解释吞吐和尾延迟变化。','真实设备还要重复测量，核查深度分布。'])
    ]
  },{
    id:'network-errors',group:'网络性能',level:'进阶',title:'已经协商千兆，如何查 TCP 重传升高？',
    description:'用同方向测试、接收计数增量和更换链路后的控制对比取证。',initial:{peerPort:5201,crcFault:true},
    recap:'区分了协商速率、接收 CRC 增量与 TCP 重传，并保留同端点、同方向复测。',
    steps:[
      stepOf('固定角色、方向与端口','验证载波和千兆，采集 A 接收方向的测试前计数。',
        '-R 改的是数据方向，B 仍是服务端。A 是数据接收端，在 A 采集本轮 RX CRC 增量。',
        ['ethtool enp3s0','ethtool -S enp3s0','sim peer ss'],
        [checked('当前仍协商千兆','carrier',e=>e.speed===1000),checked('取得负载前的累计 CRC 计数','nic-stats',e=>e.rxErrors===0),checked('核对对端监听','sockets',e=>e.raw==='sim peer ss'&&/:5201/.test(e.output))],
        'A 执行 iperf3 -c B -R，谁向谁发送测试数据？',['A 发送给 B','B 给 A 发，B 仍是服务端','两边自动同时发满'],1,'用 A 的 RX 读数对应本次实际方向。',
        ['写明流量方向','A 作为客户端使用 -R，数据 B → A；A 的 Speed 仍为 1000Mb/s。','速率协商和接收帧质量是不同检查项。','取 A 端采样作为本轮增量基准。']),
      stepOf('把计数差与本轮负载对应','在同端点跑反向 TCP，复查 CRC 并记录重传。',
        '累计计数要看同一测试窗口内的增量。TCP retransmission 还可能由拥塞、丢失或其他因素引起，需要额外证据配合。',
        [reverseTCP,'ethtool -S enp3s0'],
        [['反向重传偏高且本轮之后 CRC 增加',ctx=>observedInOrder(ctx,e=>netReverse(e)&&e.retries>0,e=>e.kind==='nic-stats'&&e.rxErrors>0)]],
        '速度显示千兆但 CRC 和重传在负载期间都上升，怎么写结论？',['继续核对链路误码，并维持参数做对比','已证实一定是网卡芯片损坏','吞吐可视为达标，无需保留证据'],0,'只有实际变化和负载对齐后，才值得沿物理链路排查。',
        ['方向和计数窗口要一致','从 0 到 30 的 rx_crc_errors 增量，同轮 TCP Retr=92。','提示接收路径出现帧错误并伴有重传。','逐项改变线缆、端口等条件，避免一次动多个因素。']),
      stepOf('关闭误码条件，重复原实验','采集关闭前后的累计统计，验证同样负载下不再增长。',
        '有些网卡计数会持续累计。修复后看增量是否停止，而非要求计数回零。',
        ['sim link-errors off','ethtool -S enp3s0',reverseTCP,'ethtool -S enp3s0'],
        [['同方向复跑且 0 重传，前后 CRC 相等',ctx=>{
          const events=ctx.events,off=events.findIndex(e=>e.kind==='crc-change'&&!e.active);
          const test=events.findIndex((e,i)=>i>off&&netReverse(e)&&e.retries===0);
          const before=events.slice(off+1,test).findLast(e=>e.kind==='nic-stats');
          const after=events.slice(test+1).find(e=>e.kind==='nic-stats');
          return off>=0&&test>off&&before&&after&&before.rxErrors===after.rxErrors;
        }]],
        '修复前已累计 30 个 CRC，复测后还显示 30。怎样理解？',['该窗口的 CRC 无新增','修复必然失败','重传一定还是 92'],0,'判断基于同一负载窗口的增量以及独立的 TCP 结果。',
        ['旧计数不能当成新增故障','关闭条件后 CRC 30→30，TCP Retr=0。','本轮固定条件下未再复现。','保留基线、排查动作和验证方向。'])
    ]
  },{
    id:'memory-trend',group:'稳定性',level:'进阶',title:'内存持续增长，怎样验证是不是进程占用？',
    description:'在固定条件下采集进程 RSS 和可用内存趋势，观察重启与长期修复差异。',initial:{leakRate:20},
    recap:'在同一进程和时间轴上关联 RSS 与 available，分别验证释放和停止增长。',
    steps:[
      stepOf('建立版本与空载趋势基线','先采进程 RSS 和内存，然后在相同负载条件下推进时间重复采样。',
        'RSS 指驻留在内存的页面，可能含共享页。单点高只能说明当时驻留多。用同一进程多个时间点观察是否增长。',
        ['ps aux','free -h','sim wait 60'],
        [['同一进程的两次 RSS 和可用量反向变化',ctx=>{
          const p=ctx.events.filter(e=>e.kind==='process'),m=ctx.events.filter(e=>e.kind==='memory');
          return p.length>=2&&m.length>=2&&p.at(-1).sampleTime>p[0].sampleTime&&p.at(-1).workerMiB>p[0].workerMiB&&m.at(-1).available<m[0].available;
        }]],
        '只看一次 top 的高 RES，能否确认内存泄漏？',['能','不能，要在受控条件下看同进程的趋势与回落','用网口速率决定'],1,'先记录多点趋势，再排除负载变大、缓存或共享页等因素。',
        ['对同一进程按时间采样','虚拟时间推进 60 秒，workload-agent 的驻留由 2048 到 3248 MiB，available 下降。','进程增长与整机可用量变化方向一致，值得重点调查。','用相同条件继续采样，并记录有无交换。']),
      stepOf('区分重启释放和修复增长','重启模拟进程读取 RSS，再推进时间，观察是否又开始增长。',
        '重启会释放进程内存，短期恢复不能说明引起增长的机制已消失。',
        ['sim restart-worker','ps aux','sim wait 60'],
        [['重启后低值与后续再次增长已对照',ctx=>observedInOrder(ctx,e=>e.kind==='worker-restart',e=>e.kind==='process'&&e.workerMiB===2048,e=>e.kind==='process'&&e.workerMiB>2048)]],
        '重启后数值降低，但相同条件下再次增长。该怎样判定？',['暂时缓解，增长未消失','已证明修复','旧日志必须丢弃'],0,'区分恢复措施和根因修正，记录复现窗口。',
        ['看回落后是否重现','重启后 RSS 回到 2048 MiB；继续相同负载又上升。','释放和持续增长是两个现象。','应用预制修复，然后复用同样的观察跨度。']),
      stepOf('固定观察时间验证趋势','停止模拟增长并重启，至少间隔 60 模拟秒采两次。',
        '恢复后对比应有明确的时间跨度和相同负载。本模型中 sim leak off 表示已装入预置修复。',
        ['sim leak off','sim restart-worker','ps aux','sim wait 60','free -h'],
        [['同一观察窗口下 RSS 保持稳定',ctx=>{
          const index=ctx.events.findIndex(e=>e.kind==='leak-change'&&e.rate===0);
          const samples=ctx.events.slice(index+1).filter(e=>e.kind==='process');
          return index>=0&&samples.length>=2&&samples.at(-1).sampleTime-samples[0].sampleTime>=60&&samples.at(-1).workerMiB===samples[0].workerMiB;
        }]],
        '这份复测结果可以支持什么？',['在本轮固定条件和时间内未观察到同样增长','所有应用已永久无泄漏','系统所有内存指标都必须为零'],0,'用范围和监控时间限定结论。',
        ['确认修复后比较的条件','两次 RSS 一致，时间相隔 60 模拟秒。','说明这段模拟观察未复现增长。','真实环境需延长窗口并覆盖业务负载波动。'])
    ]
  },{
    id:'cpu-vs-io',group:'资源分析',level:'进阶',title:'服务器变慢，是 CPU 忙还是 I/O 等待？',
    description:'对照 vmstat 的 r/b 与 us/sy/id/wa、进程列表和磁盘统计。',initial:{cpuBackground:95},
    recap:'按不同资源现象选择证据，区分可运行队列高与阻塞、等待高两种情况。',
    steps:[
      stepOf('定位 CPU 忙和可运行队列','采集进程 CPU 和系统调度字段。',
        'vmstat 的 r 统计可运行任务，b 统计不可中断睡眠或阻塞任务。us 和 sy 是用户态与系统态 CPU 时间；高 r 要结合逻辑 CPU 数和负载趋势。',
        ['lscpu','vmstat 1','top'],
        [checked('取得实际逻辑 CPU 数','cpu'),checked('观测到 CPU 忙且可运行任务多','monitor',e=>e.cpu>=90&&e.running>=16&&e.wait===0),checked('定位后台热点进程','process',e=>e.cpu>=90&&/workload-agent/.test(e.output))],
        '16 逻辑 CPU、r≈20 且 us+sy≈95%、wa≈0，优先查什么？',['CPU 侧热点进程与任务并发','只查挂载 UUID','只替换网线'],0,'把 CPU 忙的数据和具体进程连起来，再改负载条件。',
        ['从整机读数转向进程','r 比逻辑 CPU 数大，us+sy 高，top 里 workload-agent 是热点。','初步支持 CPU 侧争用，不能由一次样本认定长期瓶颈。','先降低这项后台负载，观察相同窗口。']),
      stepOf('用另一轮对照 I/O 等待','先降 CPU 背景负载，再打开模拟磁盘繁忙，重新观察。',
        '高 wa 表示有 I/O 等待相关的空闲时间，仍需用阻塞队列和设备等待确认。它不是磁盘速度的直接测量。',
        ['sim cpu-background 3','sim disk-busy on','vmstat 1','iostat -x 1'],
        [['新环境 CPU 使用降低，阻塞、wa 和设备等待上升',ctx=>observedInOrder(ctx,e=>e.kind==='cpu-change'&&e.cpu===3,e=>e.kind==='disk-busy-change'&&e.active,e=>e.kind==='monitor'&&e.wait>0&&e.blocked>0,e=>e.kind==='disk-stats'&&e.busy)]],
        '当 wa、b 和 await 上升而 us+sy 下降，最适合的下一步是？',['盲增 CPU 核心','核对存储路径和后台 I/O 竞争','只看服务器型号'],1,'同一采样窗口的数据更能支持定向排查。',
        ['三条线索来自不同层','vmstat 有阻塞 b、wa 上升，iostat 的目标盘 await 比空载高。','这轮主要变化在 I/O 路径，不应把所有慢都归咎于 CPU。','取消后台 I/O，再核对恢复。']),
      stepOf('用负载撤除验证恢复','关闭磁盘后台任务，观察阻塞和设备等待回落。',
        '控制发起条件并保留原指标，方便对照。模型中的固定示例不能用作真实服务器性能门限。',
        ['sim disk-busy off','vmstat 1','iostat -x 1'],
        [['撤除动作后阻塞、I/O 等待和设备繁忙回落',ctx=>observedInOrder(ctx,e=>e.kind==='disk-busy-change'&&!e.active,e=>e.kind==='monitor'&&e.wait===0&&e.blocked===0&&e.cpu<=10,e=>e.kind==='disk-stats'&&!e.busy)]],
        '正式结论应如何组织？',['性能正常，略','同时记录负载动作、命令结果和恢复范围','只保留恢复结果'],1,'前后证据都需要留下，涉及真实业务时补充响应时延。',
        ['在同一条件下读回归','后台负载关闭后 b 与 wa 回落、目标盘 await 下降。','证据支持本轮模拟争用被消除。','生产场景还要核对采样稳定性、业务延迟和其他资源。'])
    ]
  },{
    id:'acceptance',group:'项目交付',level:'进阶',title:'同一用例的 FAIL、BLOCKED、PASS 怎么写进报告？',
    description:'执行明确验收条件，在可测、不可测和修复后的环境中区分状态。',initial:{diskBusy:true},
    recap:'完成基线不达标、前置条件阻断和恢复通过的三轮证据；未执行的范围保留 NOT RUN。',
    challenge:{title:'磁盘性能验收回归',symptom:'固定基线吞吐偏低。先确认目标条件，再判断是 FAIL、BLOCKED 还是修复后 PASS。',expected:'4 KiB 随机读、深度16、同参数模拟达到教学门限 38000 IOPS。',initial:{diskBusy:true}},
    steps:[
      stepOf('对照验收线记录 FAIL','预期同参数 IOPS ≥38000。先验目标卷正常，再执行用例，记录低结果。',
        'FAIL 表示用例能够执行，但实际结果违反验收条件。报告应写出门限和实际值，以及该轮环境。',
        ['findmnt /mnt/sit','iostat -x 1',labRead(16)],
        [checked('前提满足，目标挂载正确','mount-state',e=>e.mounted),checked('执行成功但低于教学验收线','fio',e=>!e.failed&&labComparableDisk(e,'randread',16)&&e.metrics.iops<38000)],
        '作业完成，结果约 9,500 IOPS，验收线是 38,000。这轮怎么记？',['PASS','FAIL','NOT RUN'],1,'命令返回成功不代表用例达到预期。',
        ['报告展示实际值与预期','同配置测试完成，观测约 9.5k IOPS，低于本课门限 38k。','这是性能 FAIL。观察到的后台竞争另列为可能原因。','保留原命令和指标，避免用另一条件的历史通过覆盖。']),
      stepOf('识别前置条件阻断','切换成挂载失败的环境，再启动原用例，读取阻断信息。',
        'BLOCKED 表示一个已知前提未满足，导致目标断言无法验证。未安排或未执行则用 NOT RUN，二者记录原因不同。',
        ['sim set-fstab UUID=SIM-TEST-99','reboot','findmnt /mnt/sit',labRead(16)],
        [['重启后验证挂载缺失，原用例无法开始',ctx=>observedInOrder(ctx,e=>e.kind==='fstab-change'&&!e.matches,bootEvent,e=>e.kind==='mount-state'&&!e.mounted,e=>e.kind==='fio'&&labComparableDisk(e,'randread',16)&&e.reason==='not-mounted')]],
        '挂载失败导致没有 IOPS 数据，这条性能断言怎么记？',['FAIL，假定 0 IOPS','PASS，因命令有输出','BLOCKED，记录挂载前提和错误'],2,'挂载检查自身可以 FAIL，被阻断的性能用例要单独标记。',
        ['被测对象与前置条件分开','findmnt 无匹配，fio 返回目标未挂载。','性能没有可对比的数值。登记依赖阻断，不虚构 0 IOPS。','恢复挂载后用原负载验证性能。']),
      stepOf('恢复前提再验证 PASS','修复挂载并消除后台干扰，保持原参数复测。未测的网络项保留 NOT RUN。',
        '回归记录要区分环境变更、实际重测和未覆盖项目。不同目标或工作负载的成功不能补齐原用例。',
        ['sim set-fstab UUID=SIM-TEST-01','reboot','findmnt /mnt/sit','sim disk-busy off',labRead(16)],
        [['恢复前提后同一性能用例实际达到验收线',ctx=>observedInOrder(ctx,e=>e.kind==='fstab-change'&&e.matches,bootEvent,e=>e.kind==='mount-state'&&e.mounted,e=>e.kind==='disk-busy-change'&&!e.active,e=>e.kind==='fio'&&labComparableDisk(e,'randread',16)&&!e.failed&&e.metrics.iops>=38000)]],
        '磁盘同参数达标，但本轮没做网络。报告怎样写？',['磁盘 PASS；网络 NOT RUN，注明范围','全平台 PASS','网络 BLOCKED，假定硬件缺失'],0,'验收目的是让读者清楚哪些已被证据覆盖。',
        ['交付能被复核的状态表','磁盘性能三轮分别低于门限、环境阻断、同参数达标。网络没有该轮数据。','旧失败仍有证据，最新验收只覆盖恢复后的组合。','在案例复现中导出带原始记录的报告，并注明未测范围。'])
    ]
  }
];

function timedJob(engine){
  return 'fio --filename=/mnt/sit/test.bin --rw=randread --bs=4k --size=64M --ioengine='+engine+' --iodepth=16 --runtime=30 --direct=1 --time_based';
}
function smallTimedJob(e,engine,timeBased){
  const c=e.config;
  return c?.target==='/mnt/sit/test.bin'&&c.bs==='4k'&&c.rw==='randread'&&c.engine===engine&&c.depth===16&&c.runtime===30&&
    c.direct===1&&c.jobs===1&&sizeMiB(c.size)===64&&c.timeBased===timeBased;
}
function netReverse(e){
  return e.kind==='transfer'&&!e.failed&&e.target===LAB_PEER&&!e.udp&&e.reverse&&!e.fromB&&e.seconds===10&&e.streams===1&&e.port===5201&&e.offered===null;
}

const GUIDED_COURSES_BY_ID=new Map([...CORE_GUIDED_COURSES,NETWORK_GUIDED_COURSE,...EXTENDED_GUIDED_COURSES].map(course=>[course.id,course]));
const GUIDED_COURSES=[
  'inventory','permission','mount','inode','network','service-port',
  'nic-probe','hba-compat','host-route','read-only-fs','storage-failure','smart-health',
  'fio','fio-time','throughput','network-errors','pressure','memory-trend','cpu-vs-io','acceptance'
].map(id=>GUIDED_COURSES_BY_ID.get(id));
