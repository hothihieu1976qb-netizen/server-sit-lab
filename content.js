'use strict';
// Offline teaching content. The simulator in app.js supplies live outputs.
const EXTRA_CASES = {
  mount:{title:'硬盘识别但无法挂载',desc:'lsblk 能看到测试盘，但 /mnt/sit 没有挂载。应用找不到测试文件。',steps:[['block','查看设备与文件系统'],['mount','查看实际挂载关系'],['config','核对 fstab'],['current','检查挂载日志']],commands:['lsblk -f','findmnt /mnt/sit','cat /etc/fstab','journalctl -b -k'],options:['文件系统不存在，需直接格式化','fstab 的 UUID 与 blkid 不一致','CPU 核心不足'],answer:2,hints:['先区分“设备存在”和“已挂载”。','用 blkid 对比 /etc/fstab 中的 UUID。'],analysis:'sdb1 的 ext4 与 UUID=SIM-TEST-01 存在，但 fstab 写成 SIM-TEST-99，导致启动挂载失败。建议核对 UUID 后修正挂载配置；不要因挂载失败就格式化。模拟修复版更正 UUID。回归用 findmnt、lsblk -f 检查映射，再以专用文件做 fio。',regression:[['mount','确认 /mnt/sit 挂载'],['block','确认文件系统映射'],['fiotest','完成测试盘 fio']]},
  full:{title:'文件系统空间不足',desc:'测试文件写入失败；设备仍可识别。确认空间与文件系统后再决定处理方式。',steps:[['space','检查文件系统容量'],['block','确认分区与挂载'],['kernel','查看错误记录']],commands:['df -hT','lsblk -f','dmesg -T'],options:['测试文件系统已满','网卡半双工','内核未识别 CPU'],answer:1,hints:['先检查 df 的 Use% 与 Avail。','ENOSPC 与硬件 I/O error 是不同现象。'],analysis:'sdb1 可正常识别和挂载，但使用率为 100%，日志为 No space left on device。核对测试文件与日志占用，在保留证据和授权前提下清理无用数据或扩容，然后复测。修复版释放模拟空间，不能把这种问题直接定为磁盘物理损坏。',regression:[['space','重新核对可用空间'],['fiotest','重新执行文件 I/O']]},
  noip:{title:'接口存在但没有 IP',desc:'enp3s0 存在且有载波，应用却无法连接对端。',steps:[['interface','检查接口状态'],['address','查看 IP'],['ethtool','检查物理链路'],['route','检查路由']],commands:['ip link','ip addr','ethtool enp3s0','ip route'],options:['PCI 设备未识别','接口未配置 IPv4 地址','测试盘未挂载'],answer:2,hints:['接口 UP 只说明接口层状态。','对比 ip link 和 ip addr；没有地址时不能靠重跑 iperf3 解决。'],analysis:'链路 UP、1000Mb/s Full，但 enp3s0 没有 IPv4。确认地址规划后配置地址、掩码和路由，再验证对端可达。修复版恢复静态地址。',regression:[['address','确认 IPv4 恢复'],['route','确认路由'],['nettest','验证双机吞吐']]},
  driver:{title:'网卡驱动没有加载',desc:'PCI 仍可见网卡，但系统中没有对应接口。与固件加载失败场景进行区分。',steps:[['pci','查看 PCI 绑定'],['module','检查模块'],['driver','核对模块信息'],['kernel','查看内核初始化日志']],commands:['lspci -nnk','lsmod','modinfo simnic','dmesg -T'],options:['网卡模块未加载，设备没有绑定驱动','仅网线断开','网卡已绑定且有 IP'],answer:1,hints:['lsmod 中是否有 simnic？','modinfo 查模块元数据，不能证明模块已经加载。'],analysis:'PCI 可见，Kernel driver in use 为 none，lsmod 无 simnic，而 modinfo 能查到模块文件。重点检查模块自动加载配置、黑名单和版本匹配。本场景为模块被 blacklist 禁止自动加载。修复版恢复加载；回归检查模块、绑定、接口及吞吐。',regression:[['module','确认模块加载'],['pci','确认驱动绑定'],['interface','确认接口'],['nettest','验证网络']]},
  netpersist:{title:'重启后网络配置丢失',desc:'本次启动后接口仍在，但之前设置的静态地址消失。',steps:[['address','确认本次地址'],['previous','对比上次启动'],['config','检查持久配置'],['current','查看本次配置日志']],commands:['ip addr','journalctl -b -1 -k','cat /etc/sysconfig/network-scripts/ifcfg-enp3s0','journalctl -b -k'],options:['网卡物理损坏','仅使用临时 IP，未保存持久配置','内存不足使 IP 消失'],answer:2,hints:['比较当前接口与上次启动日志。','查看持久网络配置文件是否包含静态地址。'],analysis:'本次接口存在但无地址，上次记录了临时配置，持久配置未包含 IPADDR。临时 ip addr 配置不会自动跨重启保留。本模拟用 ifcfg 展示原理，真实系统应以网络管理工具和版本为准。修复版写入持久配置；回归必须重新启动后验证地址、路由与吞吐。',regression:[['reboot','重启修复版'],['address','检查重启后的地址'],['route','检查路由'],['nettest','检查吞吐']]},
  slowdown:{title:'磁盘 I/O 突然下降',desc:'相同 fio 作业变慢，平均延迟上升。参数正确是否就能认定磁盘损坏？',steps:[['baseline','核对性能基线'],['fiotest','复现测试盘 fio'],['iostat','查看存储负载'],['process','检查后台进程'],['kernel','检查日志']],commands:['cat /mnt/sit/baseline.txt','fio /mnt/sit/fixed.fio','iostat -x 1','ps aux','dmesg -T'],options:['后台备份争用测试盘带宽','立刻格式化','必须提高队列到最大'],answer:1,hints:['同参数还需要同负载条件。','结合 iostat 的 await/%util 与 ps 中的备份进程。'],analysis:'作业参数一致，sim-backup 后台进程持续占用 sdb，iostat 的 await 高且 %util 接近满载，无介质错误。先协调后台任务并复测，再决定是否需要存储层分析。%util 在并行设备上不能单独代表性能上限。修复版停止冲突备份。',regression:[['process','确认后台任务结束'],['iostat','查看盘负载'],['fiotest','同基线 fio 重测']]},
  cpu:{title:'CPU 长时间高使用率',desc:'未主动施压时系统仍持续高 CPU，响应变慢。',steps:[['monitor','查看 top/vmstat'],['process','定位占用进程'],['kernel','检查异常日志']],commands:['top','vmstat 1','ps aux','dmesg -T'],options:['sim-index 进程忙循环','硬盘空间不足导致 CPU 消失','网线降百兆'],answer:1,hints:['先区分用户态、内核态和 I/O 等待。','top 与 ps 是否都指向 sim-index？'],analysis:'用户态 CPU 持续高，sim-index 多线程忙循环，无 OOM 或 I/O 错误。保留进程、负载和触发条件，建议排查任务逻辑并在授权范围内停止或修复。修复版消除忙循环，回归观察空闲及压力结束后的资源恢复。',regression:[['monitor','确认 CPU 恢复'],['process','确认进程状态']]},
  leak:{title:'内存使用率持续增长',desc:'同一工作负载下内存不断增长。观察多次快照，区分泄漏、缓存与可用内存。',steps:[['memory','查看 free'],['trend','间隔取样观察趋势'],['process','检查进程 RSS'],['kernel','检查 OOM/日志']],commands:['free -h','sim wait 30','free -h','ps aux','dmesg -T'],options:['只看 used 高就证明泄漏','sim-cache RSS 持续增长且 available 下降，疑似泄漏','网卡丢失'],answer:2,hints:['第一次 free 是起点，不是趋势。','用 sim wait 30 推进模拟时间，再比 RSS 和 available。'],analysis:'sim-cache 的 RSS 随模拟时间增长，available 同步下降，证据支持疑似泄漏；单次 used 高或 buff/cache 高不能证明泄漏。保存多时点快照，交给开发进一步检查分配释放和对象生命周期。修复版内存稳定，回归要跨两个时点比较。',regression:[['memory','记录修复版内存'],['trend','推进时间后复查'],['process','确认进程 RSS']]},
  bootdriver:{title:'启动时存储驱动加载失败',desc:'启动日志出现驱动错误，独立测试盘不见了；系统盘仍可启动。',steps:[['block','检查块设备'],['pci','查看 HBA 与绑定'],['module','检查模块'],['current','查看启动日志']],commands:['lsblk','lspci -nnk','lsmod','journalctl -b -k'],options:['simhba 与当前内核版本不匹配，加载失败','测试盘已满','只有地址配置错误'],answer:1,hints:['系统盘与测试盘不一定接在同一控制器上。','搜索 invalid module format 或 version magic。'],analysis:'系统盘走独立启动控制器，sdb 通过 simhba HBA。日志有 version magic mismatch/invalid module format，HBA 未绑定，simhba 未加载，因此 sdb 不出现。建议使用与目标内核匹配的驱动包；修复版更换匹配模块。',regression:[['module','确认 simhba 加载'],['pci','确认 HBA 绑定'],['block','确认测试盘'],['fiotest','验证读写']]},
  service:{title:'服务启动失败',desc:'systemctl 报告 sit-agent.service failed，采集代理不可用。',steps:[['service','检查失败服务和状态'],['current','检查服务日志'],['config','检查服务配置']],commands:['systemctl --failed','systemctl status sit-agent','journalctl -u sit-agent -b','cat /etc/sit-agent.conf'],options:['启动配置端口字段不是数字','网卡一定损坏','必须重装系统'],answer:1,hints:['status 的 Exit status 只说明失败，还需看具体日志。','对比配置项与服务日志中的 invalid port。'],analysis:'sit-agent 配置 listen_port=abc，日志指出 invalid port，退出码 2。本场景是服务配置错误。建议更正字段、重新启动后验证状态、监听端口和日志。修复版将其设为 9090。',regression:[['service','确认服务 active'],['sockets','确认监听端口'],['current','查看修复后服务日志']]}
};

// Knowledge points use multiple semantic groups, rather than one keyword per answer.
// A point earns partial credit for naming it and full credit for explaining it.
const INTERVIEW_BANK = [
 ['Linux 基础','CPU 如何检查？',[['命令',['lscpu']],['架构',['架构','architecture']],['核心与线程',['核心','线程','core']],['负载',['top','vmstat']]],'用 lscpu 核对架构、型号、核心、线程与插槽，nproc 看可用逻辑处理器。核对配置清单，再用 top/vmstat 看负载；识别正确不等于压力下稳定。','核心数和逻辑线程数有什么不同？'],
 ['Linux 基础','内存如何检查？',[['容量',['free','容量']],['可用内存',['available','可用']],['交换空间',['swap','交换']],['趋势和日志',['趋势','oom','日志']]],'用 free -h 核对 total、available 和 swap，用多时点快照区分缓存与持续增长，结合 ps RSS、vmstat si/so 及 OOM 日志判断压力。不能只因 used 高就判断内存不足。','为什么 used 很高不一定说明内存不足？'],
 ['Linux 基础','磁盘如何检查？',[['识别',['lsblk','fdisk']],['映射',['文件系统','挂载','findmnt']],['健康',['smartctl','健康']],['日志',['dmesg','日志']]],'lsblk 看设备与容量，lsblk -f/blkid 看文件系统和 UUID，findmnt/df 看挂载及容量，smartctl 读取模拟健康信息，结合内核日志和控制器信息。真实 RAID 需要控制器工具，SMART 正常也不能排除全部问题。','硬盘能识别但不能挂载，你查哪一层？'],
 ['Linux 基础','网卡如何检查？',[['接口和地址',['ip link','ip addr','ip -br']],['协商',['ethtool','speed']],['绑定',['lspci','驱动']],['连通',['ping','iperf']]],'按接口、地址路由、物理链路、设备绑定、实际连通逐层检查。ip link/addr/route、ethtool、lspci -nnk、ping 与 iperf3 分别提供不同证据。','接口 UP 是否一定能访问对端？'],
 ['Linux 基础','驱动问题怎么看？',[['PCI绑定',['lspci','绑定']],['模块',['lsmod','modinfo']],['初始化日志',['probe','firmware','日志']],['版本匹配',['内核','版本','匹配']]],'先用 lspci -nnk 看 PCI 和实际绑定，lsmod 看加载，modinfo 看模块元数据与内核版本匹配，再查 dmesg/journalctl 的 probe、firmware、reset。模块文件存在、加载成功和绑定成功是三件事。','lsmod 有模块就证明设备可用吗？'],
 ['Linux 基础','日志怎么看？',[['内核',['dmesg','journalctl -k']],['启动对比',['-b','上次','启动']],['定位服务',['-u','服务']],['过滤与时间',['grep','时间','tail']]],'dmesg -T 查看内核环形缓冲；journalctl -b -k 查本次内核，-b -1 -k 查上一轮（需保留日志），-u 查服务。记录时间，按错误关键字过滤并保留上下文，不只截取一行结论。','为什么还要保留错误前后的日志？'],
 ['fio','fio 是什么？',[['目的',['存储','磁盘','i/o']],['负载',['随机','顺序']],['指标',['iops','吞吐','延迟']],['目标',['文件','授权']]],'fio 是存储 I/O 负载与性能测试工具。设定目标、顺序/随机及读写负载，测 IOPS、带宽和延迟。使用确认过的专用测试文件，记录环境与基线，模拟结果不能当作真实硬件能力。','测试前为什么必须确认 filename？'],
 ['fio','IOPS 是什么？',[['次数',['次数','请求数']],['每秒',['每秒','/s']],['块大小',['块大小','4k','bs']],['延迟',['延迟','耗时']]],'IOPS 是每秒完成的 I/O 次数，常用于随机小块负载。必须同时记录块大小、模式、队列和延迟；高 IOPS 不等于每个请求都响应快。','为什么随机 4K 更关注 IOPS？'],
 ['fio','吞吐量是什么？',[['数据量',['数据量','字节']],['单位时间',['每秒','单位时间']],['单位',['mib','mb/s','bw']],['块大小',['块大小','1m']]],'吞吐量是单位时间完成的数据量，fio 常用 MiB/s。BW 约等于 IOPS 乘块大小；顺序大块传输常关注带宽。MiB/s 为字节单位，网络 Mbps 为比特单位，要注意换算。','为什么顺序 1M 更关注吞吐量？'],
 ['fio','slat、clat、lat 和 P99 是什么？',[['提交',['slat','提交']],['完成',['clat','完成']],['总延迟',['lat','总']],['百分位',['99%','百分位','尾延迟']]],'slat 是提交开销，clat 是提交到完成的等待时间，lat 近似两者之和。P99 是 99% 请求延迟不超过的值，不是最大值。观察平均值和尾延迟，不能只看吞吐。','如果 IOPS 很高但 P99 也很高，你怎么分析？'],
 ['fio','bs 是什么？',[['单次',['单次','每次']],['大小',['块','大小']],['负载',['随机','顺序']],['可比性',['相同','一致','基线']]],'bs 表示每次 I/O 请求块大小，如 4K、64K、1M。改变它会改变操作次数、数据量和设备访问特征；比较基线时要保持块大小与负载一致。','同样 10000 IOPS，4K 和 1M 的 BW 一样吗？'],
 ['fio','iodepth 是什么？',[['未完成请求',['未完成','在途','队列']],['异步',['异步','libaio']],['收益',['并发','iops','吞吐']],['代价',['延迟','饱和']]],'iodepth 是每个作业希望维持的未完成 I/O 数，需要异步引擎和环境支持。增加并发可能填满设备能力，提高 IOPS；达到瓶颈后收益递减，排队延迟甚至上升。sync 不能靠提高 iodepth 达到相同异步深度。','iodepth=64 一定比 16 更好吗？'],
 ['fio','顺序与随机读写有什么区别？',[['位置',['连续','位置','分散']],['模式',['read','randread','randrw']],['指标',['iops','吞吐']],['场景',['数据库','备份','业务']]],'顺序 I/O 访问连续位置，适合大文件传输和备份，常看 BW；随机 I/O 访问分散位置，类似部分数据库访问，常看小块 IOPS 与延迟。读写模式和业务比例必须按需求选定。','为什么机械盘随机性能通常比顺序差很多？'],
 ['iperf3','iperf3 如何使用？',[['服务',['-s','监听']],['客户端',['-c','连接']],['参数',['-t','-p','-r']],['指标',['重传','丢包','吞吐']]],'一端 iperf3 -s -p 5201，另一端 -c 服务端IP -p 5201。-t 设置时长，-P 并发，-R 反向；UDP 用 -u -b。确认服务、端口和网络，再看 TCP 吞吐/重传或 UDP 丢包/Jitter。','服务端端口与客户端不一致会怎样？'],
 ['iperf3','为什么网络测试需要两台服务器？',[['端点',['发送','接收']],['路径',['链路','网络','路径']],['瓶颈',['两端','cpu','瓶颈']],['回环',['回环','本机']]],'两台主机让数据经过真实收发端与网络路径，从而评估端到端能力。两端 CPU、驱动、网卡和交换路径都可能成为瓶颈；本机回环不代表物理链路性能。','反向测试能帮助发现什么？'],
 ['iperf3','TCP 与 UDP 有什么区别？',[['TCP',['可靠','重传','连接']],['UDP',['无连接','不保证','数据报']],['指标',['丢包','jitter']],['场景',['业务','场景']]],'TCP 面向连接，提供可靠、有序字节流及重传和拥塞控制；UDP 是无连接数据报，不保证交付和顺序。TCP 测吞吐/重传，UDP 按目标带宽发送并观察丢包和抖动，选择取决于业务。','UDP 发送 2Gbps 能证明千兆网卡变快了吗？'],
 ['iperf3','Retr 是什么？',[['重传',['重传']],['TCP',['tcp']],['原因',['丢包','拥塞','错误']],['定位',['错误包','路径','cpu']]],'Retr 是 TCP 发送端重传统计。升高可能与丢包、拥塞、错误包或路径有关，不能单凭它认定网卡坏。结合接口计数、两端 CPU、链路和正反向结果定位。','Retr 高时为什么要同时看 ip -s link？'],
 ['iperf3','Jitter 是什么？',[['变化',['变化','波动']],['时延',['时延','延迟']],['UDP',['udp']],['区别',['平均','丢包','不同']]],'Jitter 表示数据包传输时延变化程度，iperf3 UDP 结果以 ms 展示。它不同于平均延迟，也不同于丢包率；实时业务既关心丢包也关心时延稳定性。','Jitter 低是否就证明完全不丢包？'],
 ['iperf3','千兆为什么只跑到百兆？',[['协商',['ethtool','speed']],['状态',['duplex','link detected','双工']],['物理配置',['网线','端口','自协商']],['路径',['iperf','cpu','重传']]],'先看 ethtool：Speed=100Mb/s、Duplex=Full、Link detected=yes 是已连通、全双工、百兆协商，不是千兆。查线对、接头、交换机和两端自协商。若 Speed=1000 而吞吐低，再查 CPU、参数、错误包与路径。','Speed=1000 但吞吐只有 90Mbps，你接下来查什么？'],
 ['stress','stress 是什么？',[['资源',['cpu','内存']],['稳定性',['稳定','压力']],['控制',['时长','timeout','可控']],['监控',['日志','top','vmstat']]],'stress 对 CPU、内存等施加可控负载，用于观察稳定性与资源行为。需要控制 worker、大小和时长，监控资源和日志；它不是专业磁盘 IOPS 基准，存储性能用 fio。','为什么压力测试必须设置停止条件？'],
 ['stress','如何对 CPU 施压？',[['命令',['--cpu']],['时限',['--timeout','时间']],['核心',['核心','线程','nproc']],['监控',['top','vmstat']]],'先确认可用核数和范围，再用 stress --cpu 8 --timeout 60s 施压。worker 数不等于 CPU 百分比；16 逻辑线程下 8 个忙 worker 的平均使用率可能约一半，结合 top/vmstat 和日志观察。','为什么 8 个 worker 在这台服务器上不一定是 100%？'],
 ['stress','如何对内存施压？',[['worker',['--vm']],['每个大小',['--vm-bytes','每个']],['可用与交换',['available','swap']],['异常',['oom','停止']]],'stress --vm 2 --vm-bytes 2G --timeout 60s 表示两个内存 worker，每个 2GiB，合计约 4GiB。先留系统余量，用 free available、swap、vmstat si/so 和 OOM 日志监控，异常时停止或降载。','--vm 4 --vm-bytes 4G 是总共 4G 吗？'],
 ['stress','如何监控压力测试？',[['CPU',['top','vmstat']],['内存',['free','available','swap']],['日志',['dmesg','journalctl']],['记录',['时间','参数','停止']]],'用 top 看进程和 CPU，free 看 available/swap，vmstat 看 r、b、si/so、wa，dmesg/journalctl 查内核、OOM、I/O 错误。记录命令、开始时间、异常时间与停止条件，结束后检查资源是否恢复。','CPU 不高但系统慢，为什么还要看 wa 和 swap？'],
 ['stress','出现 I/O Error 怎么处理？',[['先停止',['停止','降载']],['证据',['日志','时间','参数']],['定位',['lsblk','控制器','驱动']],['闭环',['bug','回归','缺陷']]],'先停止或降载，记录时间、命令、目标和步骤。保存工具输出及 dmesg/journalctl，用 lsblk/df 确认设备映射，区分磁盘、文件系统、控制器和驱动方向。不要直接格式化；提交 Bug 并在修复版做原步骤与相关功能回归。','只有一条 I/O error 能确认硬盘损坏吗？'],
 ['SIT 项目','拿到服务器后如何开始测试？',[['范围',['需求','范围','标准']],['环境',['型号','版本','配置']],['基础',['识别','驱动','日志']],['专项闭环',['性能','缺陷','回归','报告']]],'先确认需求、范围和通过标准，核对硬件、BIOS、系统、内核、驱动与固件版本。安装后做基础识别、网络和存储检查，再按用例执行性能/稳定性，记录证据、提交缺陷、修复回归并汇总报告。','为什么不能先跑性能、最后补环境？'],
 ['SIT 项目','什么是兼容性测试？',[['组合',['组合','协同']],['层次',['系统','硬件','驱动','固件']],['覆盖',['安装','启动','功能']],['边界',['版本','矩阵','范围']]],'兼容性测试验证特定操作系统、内核、硬件、驱动、固件组合能否正确协同，覆盖安装、启动、识别和功能。结论限定在已测版本与配置矩阵内，不能用一个组合推断所有设备。','识别成功是否就能声明兼容性全部通过？'],
 ['SIT 项目','什么是稳定性测试？',[['持续',['持续','长时间']],['负载',['负载','压力']],['异常',['卡死','日志','错误']],['恢复',['恢复','停止']]],'稳定性测试在规定时长和负载下观察卡死、重启、错误、泄漏与性能衰退，并检查停止负载后的恢复。先规定资源余量和停止条件，保留连续监控与日志。短时模拟不能证明真实长稳能力。','短跑 60 秒能证明 72 小时稳定吗？'],
 ['SIT 项目','如何提交 Bug？',[['环境',['环境','版本']],['复现',['步骤','频率']],['对比',['预期','实际']],['证据影响',['日志','证据','影响']]],'标题写条件和现象，正文写环境版本、前置条件、可复现步骤、预期与实际、发生频率、时间、日志和影响。结论区分已证实事实与待确认方向，不编造频率或直接猜根因。','别人按你的 Bug 无法复现，你会补什么？'],
 ['SIT 项目','什么是回归测试？',[['修复版',['版本','修复']],['原步骤',['原步骤','复现步骤']],['相关功能',['相关','功能']],['记录',['证据','结果','记录']]],'在明确的修复版本上重跑原复现步骤，确认问题消失，并验证相关功能未被改动破坏。记录版本、步骤、实际结果和证据；未测不能写通过，失败要重新打开缺陷。','修复网卡消失后只看到接口出现就能关单吗？'],
 ['SIT 项目','如何编写测试报告？',[['环境范围',['环境','范围']],['执行状态',['未执行','阻塞','通过','失败']],['数据',['性能','数据','参数']],['问题结论',['bug','回归','风险','结论']]],'报告写目标、环境与版本、范围、用例执行状态、参数和性能数据、缺陷与回归、遗留问题及最终结论。依据实际记录区分通过、失败、阻塞、未执行，不能把缺失数据自动填成通过。','还有未执行项目时最终结论怎么写？']
];

const FOLLOWUPS = [
 ['为什么随机 4K 更关注 IOPS？',[['请求',['请求','次数']],['小块',['小块','4k']],['业务',['数据库','随机','业务']]],'随机小块负载常受每秒可完成请求数与请求延迟限制，IOPS 便于描述能力；仍要结合 BW、尾延迟和业务需求。'],
 ['为什么顺序 1M 更关注吞吐量？',[['连续',['连续','顺序']],['大块',['大块','1m']],['数据量',['数据量','带宽','吞吐']]],'顺序大块更接近大文件传输，单位时间搬运的数据量更直观；同样 IOPS 下大块产生更高 BW，不能跨 bs 直接比较 IOPS。'],
 ['如果 IOPS 很高但延迟也很高，你怎么分析？',[['排队',['排队','队列','iodepth']],['尾延迟',['p99','尾延迟']],['对比',['降低','基线','业务']]],'高并发可以提高整体 IOPS，同时增加排队时间。对比 iodepth、numjobs、平均/P99 和业务时延要求，逐步降低并发观察，不能只按吞吐宣告通过。']
];
const FOLLOWUP_BY_CATEGORY = {
  'Linux 基础':[
    ['lsmod有模块，为什么还要看lspci和日志？',[['层次',['加载','绑定']],['初始化',['probe','初始化','固件']],['证据',['lspci','日志']]],'lsmod只说明模块已加载；lspci看实际设备绑定，日志看probe和固件初始化。三层结果结合，才能判断设备是否可用。'],
    ['free的used很高，怎样区分缓存与疑似内存泄漏？',[['可用',['available','可用']],['趋势',['趋势','持续']],['进程',['rss','进程']]],'结合available、buff/cache与多时点RSS；缓存可回收，RSS持续增长且available下降才是继续调查泄漏的线索，仍需开发证据确认。']
  ],
  'iperf3':[
    ['Speed=1000但吞吐约90Mbps，还能直接怪网线吗？',[['协商',['1000','千兆']],['路径',['限速','交换机','路径']],['两端',['cpu','参数','重传']]],'不能直接认定线缆问题。确认链路已千兆后，查交换机策略和路径限速、两端CPU、iperf3参数与重传，结合正反向和接口计数复测。'],
    ['UDP丢包很高，调大-b为什么可能更差？',[['目标',['目标','发送']],['容量',['容量','瓶颈']],['丢包',['丢包','队列']]],'-b是发送目标而非接收保证，超过链路或接收端能力会造成排队或丢弃。逐步调整目标，观察实际接收、Lost%和Jitter。']
  ],
  'stress':[
    ['--vm 4 --vm-bytes 4G会申请多少？该如何监控？',[['总量',['16g','16 g','16gi']],['余量',['余量','available']],['异常',['swap','oom','日志']]],'4个worker每个4GiB，总申请约16GiB，尚未包含系统本身，容易触发换页或OOM。先降低配置预留系统余量，用free、vmstat、日志监控。'],
    ['停止压力后资源不恢复，你还会查什么？',[['进程',['进程','ps','top']],['内存',['rss','available','swap']],['日志',['日志','dmesg']]],'核对作业是否确实结束，再看残留进程、RSS/available趋势、swap和日志；不能只凭used仍高判断内存泄漏，缓存与回收行为也要考虑。']
  ],
  'SIT 项目':[
    ['修复网卡消失后，接口出现就能关闭Bug吗？',[['原步骤',['重启','原步骤']],['相关',['速率','链路','吞吐']],['记录',['版本','证据','记录']]],'需要在明确修复版本重新执行原重启步骤，再验证驱动绑定、IP、链路、速率和吞吐等相关功能，保存证据，不能只凭接口出现就关闭。'],
    ['还有未执行项，测试报告应该怎么写？',[['状态',['未执行','阻塞']],['范围',['范围','风险']],['结论',['不能','限制','结论']]],'如实标注未执行或阻塞，解释原因和风险，限定结论范围，并说明补测计划。没有数据不能自动填通过，更不能把模拟结果说成真实认证。']
  ]
};

// Fields: category, example, purpose, use case, key output, sample output, follow-up.
const COMMAND_KB = [
 ['系统','uname -a','查看内核与架构','安装后核对内核和驱动目标版本','release、x86_64','Linux sit-server-01 4.19.90-sit.sim x86_64','为什么发行版版本与内核版本不同？'],
 ['系统','cat /etc/os-release','查看发行版','确认麒麟版本','NAME、VERSION_ID','VERSION_ID="V10"','uname 能代替 os-release 吗？'],
 ['系统','hostnamectl','查看主机与系统元信息','记录环境身份','Hostname、OS、Kernel','Static hostname: sit-server-01\nOperating System: Kylin V10 (模拟)','主机名能证明硬件型号吗？'],
 ['系统','dmidecode -t system','查看固件提供的服务器信息','核对服务器型号','Manufacturer、Product Name','Product Name: SimRack R200','dmidecode 与 lscpu 各看哪一层？'],
 ['系统','dmidecode -t bios','查看 BIOS/UEFI 版本','兼容性环境确认','Vendor、Version、日期','Version: SimUEFI 2.6.0','为什么要记录 BIOS 版本？'],
 ['系统','lscpu','查看处理器拓扑','核对 CPU 清单','架构、插槽、核心、线程','CPU(s): 16\nCore(s) per socket: 8\nThread(s) per core: 2','核心与逻辑线程有什么区别？'],
 ['系统','nproc','查看可用处理器数','规划 CPU worker','可用逻辑 CPU','16','容器或亲和性会影响结果吗？'],
 ['系统','free -h','查看内存与交换','压力前后核对余量','available、swap','Mem: 16Gi total, 2.1Gi used\nSwap: 2Gi total, 0 used','used 高就代表不足吗？'],
 ['系统','top','进程与资源快照','定位 CPU/内存热点','CPU us/sy/id/wa、RSS','%Cpu: 1 us, 2 sy, 97 id\nPID 601 system-monitor','进程 %CPU 能超过100吗？'],
 ['系统','vmstat 1','资源与调度统计','压力监控','r/b、si/so、wa','r b si so us sy id wa\n1 0 0 0 1 2 97 0','wa 高与 us 高有什么不同？'],
 ['系统','whoami','查看有效用户名','确认操作身份','用户名','student','root 与普通用户权限有何区别？'],
 ['系统','id','查看用户和组','解释权限问题','uid、gid、groups','uid=1000(student) gid=1000(student)','所属组如何影响设备访问？'],
 ['系统','ps aux','查看进程快照','定位长期高 CPU 或 RSS','PID、%CPU、%MEM、RSS','student 601 1.0 0.4 65536 system-monitor','如何区别缓存与进程泄漏？'],
 ['系统','uptime','运行时长和负载均值','检查重启及积压','load average 对照 CPU数','up 2:10, load average: 0.25, 0.20, 0.16','load average 等于 CPU 使用率吗？'],
 ['系统','date','查看当前时间','关联错误时间线','时区与时间','2026-10-31 20:00:00 CST [示例]','为什么两端时间应对齐？'],
 ['系统','history','查看会话命令历史','回溯测试参数','实际输入的命令','1 uname -a\n2 lscpu','历史命令能代替完整日志吗？'],
 ['磁盘','lsblk','查看块设备拓扑','区分系统盘和测试盘','设备、容量、挂载','sda 120G SimBoot120\nsdb 240G SimSSD240','设备存在是否等于已挂载？'],
 ['磁盘','lsblk -f','查看文件系统与 UUID','挂载排查','FSTYPE、UUID、MOUNTPOINT','sdb1 ext4 SIM-TEST-01 /mnt/sit','为什么挂载配置使用 UUID？'],
 ['磁盘','df -hT','查看文件系统空间','排查 ENOSPC','Use%、Avail、Type','/dev/sdb1 ext4 240G 12G 228G 5% /mnt/sit','df 与 lsblk 容量有什么区别？'],
 ['磁盘','mount','查看挂载表','核对文件落在哪块盘','source on target type','/dev/sdb1 on /mnt/sit type ext4 (rw)','未挂载时写目录可能落到哪里？'],
 ['磁盘','fdisk -l','只读查看分区表','核对盘与分区','Disk、Start、End、Type','Disk /dev/sdb: 240 GiB\n/dev/sdb1 Linux filesystem','分区表与文件系统是同一层吗？'],
 ['磁盘','blkid','读取文件系统签名','对比 fstab UUID','UUID、TYPE','/dev/sdb1: UUID="SIM-TEST-01" TYPE="ext4"','UUID 不匹配如何排查？'],
 ['磁盘','findmnt /mnt/sit','查询挂载树','确认测试目录有独立盘','SOURCE、TARGET、FSTYPE','/mnt/sit /dev/sdb1 ext4 rw,relatime','findmnt 无输出代表什么？'],
 ['磁盘','smartctl -a /dev/sdb','读取模拟健康数据','初步存储健康调查','health、reallocated、errors','SMART overall-health: PASSED\nReallocated_Sector_Ct: 0','PASSED 能排除控制器错误吗？'],
 ['磁盘','iostat -x 1','I/O 扩展统计快照','排查磁盘忙与 await','r/s、w/s、await、%util','sdb r/s=100 w/s=80 await=0.4 util=12','%util=100 是否总能证明设备达到极限？'],
 ['网络','ip link','查看接口与载波','接口消失或 DOWN 排查','UP、LOWER_UP、state','enp3s0: <UP,LOWER_UP> state UP','UP 和 LOWER_UP 有何区别？'],
 ['网络','ip addr','查看地址','接口有但无法通信','IPv4 地址与前缀','enp3s0 UP inet 192.168.10.10/24','没有 IP 会影响什么？'],
 ['网络','ip route','查看路由选择','排查网关与目的路径','default、connected route','default via 192.168.10.1 dev enp3s0','同网段通信是否一定依赖默认网关？'],
 ['网络','ip -s link','查看接口收发错误','重传与丢包调查','errors、dropped','RX packets 72500 errors 0 dropped 0','TCP Retr 与网卡 errors 一一对应吗？'],
 ['网络','ip neigh','查看邻居缓存','同网段地址解析排查','MAC、REACHABLE/FAILED','192.168.10.20 lladdr 02:51:54:00:10:20 REACHABLE','邻居 FAILED 可能有哪些原因？'],
 ['网络','ethtool enp3s0','查看链路协商','吞吐只有百兆','Speed、Duplex、Link detected','Speed: 1000Mb/s\nDuplex: Full\nLink detected: yes','100Mb/s Full yes 的准确含义？'],
 ['网络','ethtool -i enp3s0','查看网卡驱动元信息','记录版本与总线','driver、version、firmware','driver: simnic\nversion: 1.0','驱动与固件有何区别？'],
 ['网络','ethtool -S enp3s0','查看驱动统计计数','定位收发错误','CRC、drop、timeout','rx_crc_errors: 0\nrx_dropped: 0','CRC 错误增加应查哪里？'],
 ['网络','ping -c 4 192.168.10.20','ICMP 连通探测','功能检查','丢包、rtt','4 transmitted, 4 received, 0% loss','ping 通就证明吞吐正常吗？'],
 ['网络','ss -tulnp','查看监听套接字','确认服务与端口','LISTEN、端口、进程','tcp LISTEN 0 128 0.0.0.0:5201 iperf3','有监听就一定能从远端连上吗？'],
 ['网络','traceroute 192.168.20.20','查看模拟路径','路由故障调查','逐跳地址、超时','1 192.168.10.1 0.5ms\n2 192.168.20.20 1.0ms','星号一定表示链路故障吗？'],
 ['网络','route -n','传统路由表查看','对照 ip route','Destination、Gateway、Iface','0.0.0.0 192.168.10.1 enp3s0','目的路由与默认路由如何选择？'],
 ['驱动','lspci -nnk','PCI 硬件与绑定','硬件/驱动分层定位','Kernel driver in use','SimNIC G1 [1abc:1001]\nKernel driver in use: simnic','Kernel modules 就是实际绑定吗？'],
 ['驱动','lsmod','查看已加载模块','模块是否装载','Module、Used by','simnic 98304 1\nsimhba 163840 2','Used by 为0是否总是故障？'],
 ['驱动','modinfo simnic','模块元数据','核对版本、固件、vermagic','filename、firmware、vermagic','firmware: simnic-fw.bin\nvermagic: 4.19.90-sit.sim','查得到 modinfo 就证明模块已加载吗？'],
 ['服务','systemctl --failed','列出失败单元','安装后健康检查','failed unit','0 loaded units listed.','没有 failed 就证明所有硬件正常吗？'],
 ['服务','systemctl status sit-agent','查看单元状态','服务启动失败','Active、Exit status','Active: active (running)','failed 后如何获取具体原因？'],
 ['服务','systemctl list-units','列出单元运行状态','核对依赖服务','LOAD、ACTIVE、SUB','NetworkManager.service loaded active running','enabled 与 active 是否相同？'],
 ['日志','dmesg -T','查看内核缓冲日志','驱动初始化/IO错误','probe、firmware、timeout','simnic: enp3s0 registered','为什么不能只看最后一行错误？'],
 ['日志','journalctl -b -k','本次启动内核日志','安装后检查','boot ID、错误上下文','simhba: controller ready','journal 与 dmesg 数据来源有何不同？'],
 ['日志','journalctl -b -1 -k','上次启动内核日志','重启前后对照','正常与异常差异','previous boot: enp3s0 registered','上次日志不存在可能是什么原因？'],
 ['日志','journalctl -u sit-agent -b','服务专属日志','启动失败调查','服务自己的错误消息','sit-agent: listening on 9090','内核日志能解释所有应用错误吗？'],
 ['日志','grep -i error /var/log/messages','过滤虚拟日志','缩小线索范围','匹配行及上下文','[示例] 无匹配行','grep 无输出就代表系统无故障吗？'],
 ['日志','tail -n 10 /var/log/messages','查看虚拟日志末尾','快速查看近期消息','最近行','simnic enp3s0: Link is Up','为什么 tail 可能遗漏最早原因？'],
 ['日志','less /var/log/messages','查看日志快照','阅读错误上下文','整段时间顺序','[模拟有限快照，不进入真实分页器]','如何退出真实 less？'],
 ['性能','fio --filename=/mnt/sit/test.bin --bs=4k --rw=randread --iodepth=16 --numjobs=1 --ioengine=libaio --direct=1 --size=1G --runtime=60 --time_based','构造存储负载','磁盘性能与延迟测量','IOPS、BW、slat/clat/lat、P99','READ: IOPS≈41000 BW≈160MiB/s clat≈0.39ms','参数与基线不一致为什么不能直接判失败？'],
 ['性能','iperf3 -c 192.168.10.20 -p 5201 -t 10 -P 4','双机网络负载','吞吐与方向比较','BW、Retr、Lost、Jitter','[SUM] 10 sec 1175 MBytes 940 Mbits/sec','服务端未启动会是什么结果？'],
 ['性能','stress --cpu 8 --vm 1 --vm-bytes 2G --timeout 60s','可控资源压力','CPU/内存稳定性观察','资源、异常日志与恢复','dispatching hogs: 8 cpu, 1 vm','worker数量与内存总申请量怎么计算？']
];

const TERMS = [
 ['IOPS','每秒完成 I/O 次数；与块大小、队列、模式和延迟一起解读。'],['BW','Bandwidth，单位时间数据量；fio 常用 MiB/s，iperf3 常用 Mbit/s。'],['Latency','请求耗时；平均值与 P95/P99 尾延迟共同描述响应。'],['IO Depth','未完成 I/O 请求数；fio iodepth 通常按每个作业设置。'],['Block Size','单次请求块大小；不是磁盘总容量。'],['TCP','可靠、有序的面向连接传输；有重传和拥塞控制。'],['UDP','无连接数据报，不保证交付与顺序；关注丢包和时延变化。'],['Retr','TCP 重传统计；不能单独认定硬件故障。'],['Jitter','包传输时延变化，区别于平均时延和丢包。'],['Driver','操作系统与设备之间的驱动；装载、绑定、初始化分别检查。'],['Kernel','管理资源与设备的内核；与发行版版本分开记录。'],['RAID','多个磁盘组成的阵列，性能、冗余与策略取决于级别和实现。'],['HBA','主机总线适配器，连接主机与存储；不等同于一定提供硬件 RAID。'],['SIT','系统集成测试，验证指定系统、硬件、驱动和软件组合协同。'],['Regression','回归测试，在修复版本重跑原步骤及相关功能，记录证据。']
];
const LESSONS = [
 ['Linux 基础','先识别，再诊断','系统版本、硬件、接口、驱动、日志是不同层次。先确认“设备是否在”，再问“是否绑定与可用”。','参数：-a 完整信息，-h 易读容量，-f 文件系统，-nnk PCI标识及驱动。','lspci -nnk','Kernel driver in use: simnic','安装后检查、兼容性矩阵确认。','网卡重启消失：对比 PCI、模块与两次启动日志。','lsmod 有模块就能断言网卡可用吗？'],
 ['fio','让负载与业务和基线一致','随机小块关注操作率和请求延迟，顺序大块关注带宽。磁盘类型、控制器、固件、缓存和后台任务都会影响结果。','bs 单次块；size 每作业数据集；runtime 时间上限；time_based 持续运行；iodepth 每作业在途数；numjobs 作业数；direct 页缓存；ioengine 引擎；rwmixread 混合读比例。', 'fio /mnt/sit/fixed.fio','READ: IOPS≈41000 BW≈160MiB/s\nslat≈0.01ms clat≈0.39ms lat≈0.40ms','比较同一目标、模式、缓存、并发及运行条件。','队列增大可能提高吞吐，也可能增加排队与 P99。短时结果会波动，需重复。','IOPS 很高但延迟高，业务就一定满意吗？'],
 ['iperf3','分清物理协商与端到端吞吐','链路速率只是上限，应用吞吐受两端和路径影响。Speed=100Mb/s、Full、Link detected=yes 是百兆全双工且有载波。','-s 服务端；-c 目的IP；-p 两端同端口；-t 时长；-P 流数；-R 反向；-u UDP；-b 每条流的目标带宽。','iperf3 -c 192.168.10.20 -t 10 -P 1','TCP: 940 Mbits/sec Retr=0\nUDP: Lost%=0 Jitter=0.12ms','网络功能、带宽、双向差异和丢包调查。','Speed100 查线缆/端口/配置；Speed1000但BW低再查CPU、路径、重传。','为什么 ping 通不等于吞吐正常？'],
 ['stress','施压、监控、停止、复查','worker 只是负载数量。内存大小按每个 worker 计算，压力大时 available 下降，swap 可能增长，超过可用资源可能 OOM。','--cpu 工作者数量；--vm 内存worker；--vm-bytes 每个内存worker的大小；--timeout 时限。','stress --cpu 8 --vm 2 --vm-bytes 2G --timeout 60s','8 cpu, 2 vm → 请求约4GiB内存\n用 top/free/vmstat/日志监控','稳定性、资源异常和结束后的恢复检查。','发生 I/O error、OOM、卡死时先降载或停止，保留时间、参数与上下文。','CPU不高但系统慢，你会看swap和wa吗？'],
 ['SIT 项目','用证据完成测试闭环','测试先确认范围和标准。未执行、阻塞、失败、通过要分开。兼容性结论限定版本与设备组合。','环境→基础检查→磁盘→网络→压力→故障→缺陷与回归→报告。','systemctl --failed','0 failed（只代表单元状态，不能替代硬件测试）','服务器适配与集成验证、面试中的项目方法描述。','Bug写可复现事实；修复后重跑原步骤和相关功能，不能只相信“已修复”。','没有企业项目经验，怎样如实介绍模拟练习？']
];
