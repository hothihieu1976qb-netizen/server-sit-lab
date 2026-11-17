'use strict';

const LAB_DISK_JOB = 'fio --filename=/mnt/sit/test.bin --bs=4k --size=1G --ioengine=libaio --direct=1 --runtime=30 --time_based --numjobs=1 --group_reporting';
const labRead = depth=>LAB_DISK_JOB+' --rw=randread --iodepth='+depth;
const labWrite = LAB_DISK_JOB+' --rw=write --iodepth=1';
const labTCP = 'iperf3 -c '+LAB_PEER+' -t 10 -P 1';
const labUDP = rate=>labTCP+' -u -b '+rate;

function labEvidence(kind, match=e=>!e.failed) {
  return ({events})=>events.some(e=>e.kind===kind&&match(e));
}
function labComparableDisk(e,mode,depth) {
  const c=e.config;
  return c&&c.target==='/mnt/sit/test.bin'&&c.bs==='4k'&&c.rw===mode&&c.depth===depth&&c.engine==='libaio'
    &&c.direct===1&&c.jobs===1&&c.timeBased&&c.runtime===30&&sizeMiB(c.size)===1024;
}
function labDiskEvidence(mode,depth,match=e=>!e.failed) {
  return labEvidence('fio',e=>labComparableDisk(e,mode,depth)&&match(e));
}
function labTCPComparable(e) {
  return e.kind==='transfer'&&!e.failed&&e.target===LAB_PEER&&!e.udp&&!e.reverse&&!e.fromB
    &&e.port===5201&&e.seconds===10&&e.streams===1&&e.offered===null;
}

const CORE_GUIDED_COURSES = [
  {
    id:'inventory', group:'环境巡检', level:'基础', title:'拿到一台服务器，先核对什么？',
    description:'从版本和硬件清单出发，记录后续复测能用的环境证据。', initial:{},
    recap:'先记录主机型号、固件、系统、内核，再核对 CPU、内存、设备、驱动和测试目标。环境证据可以复用到报告。',
    steps:[
      {
        title:'建立可复测的版本清单', goal:'记录操作系统、正在运行的内核、服务器型号和 BIOS 版本。',
        concept:'发行版提供用户空间和软件包。uname 查当前加载的内核。dmidecode -t system 查主机型号，-t bios 才查固件版本。重启后可能启动另一个已安装内核，所以要采集实际运行值。',
        sample:'uname -a → 4.19.90-sit.sim\n/etc/os-release → VERSION_ID="V10"\ndmidecode → Product Name: SimRack R200',
        commands:['uname -a','cat /etc/os-release','dmidecode -t system','dmidecode -t bios'],
        checks:[['当前内核',labEvidence('kernel')],['发行版版本',labEvidence('os')],['服务器型号与 BIOS 版本',ctx=>labEvidence('model')(ctx)&&labEvidence('bios')(ctx)]],
        question:'同是 V10，两次测试能否视为同一内核环境？',
        choices:['可以，V10 决定内核版本','先比对两次 uname 输出并记录版本','只比较主机名即可'],answer:1,
        feedback:'同一发行版可以启动不同内核。把两次实际运行的版本都记到报告里。'
      },{
        title:'核对 CPU、内存和驱动', goal:'从命令输出区分物理核心、逻辑 CPU、内存容量和设备实际绑定的驱动。',
        concept:'CPU(s) 是逻辑 CPU 数。插槽 × 每插槽物理核心 × 每核心线程，在本例得到 16。PCI 设备存在和驱动成功绑定是两个检查点，ethtool -i 可再核对接口对应的驱动。',
        sample:'Socket(s): 1 · Core(s) per socket: 8 · Thread(s) per core: 2\nKernel driver in use: simnic',
        commands:['lscpu','free -h','lspci -nnk','ethtool -i enp3s0'],
        checks:[['CPU 拓扑与内存采样',ctx=>labEvidence('cpu')(ctx)&&labEvidence('memory')(ctx)],['PCI 绑定信息与接口驱动',ctx=>labEvidence('pci')(ctx)&&labEvidence('driver')(ctx)]],
        question:'1 个插槽、每插槽 8 个核心、每核 2 线程，对应什么？',
        choices:['16 个物理核心','8 个逻辑 CPU','8 个物理核心和 16 个逻辑 CPU'],answer:2,
        feedback:'逻辑 CPU 可被系统调度，但和物理核心不是同一计数。'
      },{
        title:'确定性能测试目标',goal:'确认 /mnt/sit 指向独立测试盘，再看容量和余量。',
        concept:'lsblk -f 显示块设备、文件系统和挂载关系。findmnt 查询当前挂载。df 的 Use% 来自已挂载文件系统。测试文件路径落在哪块盘，需要用挂载源核实。',
        sample:'/mnt/sit /dev/sdb1 ext4 rw\n/dev/sdb1 … /mnt/sit',
        commands:['lsblk -f','findmnt /mnt/sit','df -hT'],
        checks:[['取得独立盘和文件系统信息',labEvidence('block',e=>e.present&&e.fileSystems)],['挂载源与该文件系统空间已核实',ctx=>labEvidence('mount-state',e=>e.mounted)(ctx)&&labEvidence('space',e=>e.mounted)(ctx)]],
        question:'哪个证据可以直接确认目前 /mnt/sit 由哪个设备提供？',
        choices:['findmnt 显示 SOURCE=/dev/sdb1','目录名包含 sit','系统盘还有空闲'],answer:0,
        feedback:'挂载源与测试目标是一一对应的证据。保存这条输出后再做写入测试。'
      }
    ]
  },{
    id:'mount',group:'存储故障',level:'基础',title:'磁盘识别了，为什么挂不上？',
    description:'对照文件系统 UUID 和 fstab，修复后做挂载和重启回归。',initial:{mounted:false,mountUUID:'SIM-TEST-99'},
    recap:'完成了从块设备识别、实际挂载、启动配置到重启回归的证据链。',
    challenge:{title:'变式 · 启动配置修正后仍未挂载',symptom:'维护后已保存正确启动配置，但当前仍无法访问测试卷。请判断怎样验证即时恢复和重启后的状态。',initial:{mounted:false}},
    steps:[
      {
        title:'区分磁盘存在和已经挂载',goal:'确认 sdb1 有 ext4，再查询 /mnt/sit 实际挂载状态。',
        concept:'设备扫描成功只能确认内核识别了盘和分区。挂载点为空时，路径可能只是根文件系统上的普通目录。本课程对目标未挂载的测试作业返回明确错误。',
        sample:'正常 → sdb1 ext4 SIM-TEST-01 /mnt/sit\n异常 → sdb1 ext4 SIM-TEST-01（挂载列为空）',
        commands:['lsblk -f','findmnt /mnt/sit','df -hT'],
        checks:[['独立盘存在并显示文件系统',labEvidence('block',e=>e.present&&e.fileSystems)],['确认目标目前没有挂载',labEvidence('mount-state',e=>e.target==='/mnt/sit'&&!e.mounted)]],
        question:'lsblk 看到了 sdb1，却没有挂载点。接下来哪一步能核实？',
        choices:['立刻格式化 sdb1','用 findmnt 查询当前挂载源','直接对 /mnt/sit 写入'],answer:1,
        feedback:'先确认路径属于哪个文件系统，避免把针对测试盘的写入落到系统盘。'
      },{
        title:'核对配置里的 UUID',goal:'对比 blkid 和 fstab，并执行一次目标挂载来获取错误。',
        concept:'UUID 指向文件系统。启动时配置指向不存在的 UUID，就无法定位准备挂载的设备。用 journalctl -b 查看系统启动与挂载单元消息。这里需要系统日志，内核消息过滤 -k 会略过挂载单元。',
        sample:'blkid → UUID="SIM-TEST-01"\nfstab → UUID=SIM-TEST-99 /mnt/sit …',
        commands:['blkid','cat /etc/fstab','sudo mount /mnt/sit','journalctl -b'],
        checks:[['采集盘上 UUID 与不匹配的配置',ctx=>labEvidence('uuid',e=>e.present)(ctx)&&labEvidence('fstab',e=>!e.matches)(ctx)],['复现目标挂载失败并读取本轮日志',ctx=>labEvidence('mount-rejected',()=>true)(ctx)&&labEvidence('logs',e=>!e.previousBoot&&/UUID=SIM-TEST-99 not found/.test(e.output))(ctx)]],
        question:'盘的 UUID 是 SIM-TEST-01，fstab 写了 SIM-TEST-99。本例应该优先处理什么？',
        choices:['文件系统的空闲容量','网卡驱动','fstab 中的设备定位配置'],answer:2,
        feedback:'已识别的盘和待挂载配置指向不同标识。保留错误输出，再验证配置修改。'
      },{
        title:'修复并验证下次启动',goal:'写入正确 UUID，挂载后查证，再重启并重新确认挂载源。',
        concept:'sim set-fstab 修改模拟启动配置。mount /mnt/sit 按该配置尝试当前挂载。挂载成功后重启并复查，才能覆盖原来出错的启动路径。',
        commands:['sim set-fstab UUID=SIM-TEST-01','sudo mount /mnt/sit','findmnt /mnt/sit','reboot','journalctl -b'],
        checks:[['配置已正确且手动挂载成功',ctx=>labEvidence('fstab-change',e=>e.matches)(ctx)&&labEvidence('mount-applied')(ctx)],['重启后的当前挂载已复查',({events,machine})=>events.some(e=>e.kind==='reboot'&&e.boot===machine.boot)&&events.some(e=>e.kind==='mount-state'&&e.mounted&&e.target==='/mnt/sit'&&e.boot===machine.boot)]],
        question:'怎样证明这次修复经得住重启？',
        choices:['重启后 findmnt 仍显示 /dev/sdb1 → /mnt/sit','只保存 fstab','只看到第一次 mount 退出成功'],answer:0,
        feedback:'重启后采集的挂载源和启动日志，才覆盖原来失败的触发条件。'
      }
    ]
  },{
    id:'fio',group:'性能对比',level:'进阶',title:'fio 变快了，怎样证明是队列深度的影响？',
    description:'做重复测量、控制变量，再用盘的等待和利用率观察后台干扰。',initial:{},
    recap:'保留每轮 IOPS、带宽与 P99，用一致参数比较队列深度、再独立比较后台负载。单次数字不足以判断真实硬件回归。',
    challenge:{title:'变式 · 同参数 fio 变慢',symptom:'目标盘正常挂载。同样的 4K 随机读结果比维护记录低。请寻找干扰项，再在同参数下复测。',initial:{diskBusy:true}},
    steps:[
      {
        title:'记录可复测的低队列基线',goal:'确认测试目标，重复做两次 4 KiB 随机读，iodepth=1。',
        concept:'对比要固定文件、块大小、rw、引擎、direct、作业数、数据集和运行时间。iodepth 是每作业目标在途 I/O 数。direct=1 代表绕过操作系统页缓存的请求方式，设备内部缓存仍可能生效。',
        sample:'READ: IOPS=10240, BW=40.00MiB/s\n10,240 次/秒 × 4 KiB ≈ 40 MiB/s',
        commands:['findmnt /mnt/sit',labRead(1)],
        checks:[['核实目标盘挂载',labEvidence('mount-state',e=>e.mounted)],['两次同条件深度 1 的有效结果',({events})=>events.filter(e=>e.kind==='fio'&&!e.failed&&!e.diskBusy&&!e.underLoad&&labComparableDisk(e,'randread',1)).length>=2]],
        question:'4 KiB 随机读 10,240 IOPS 约等于多少 MiB/s？',
        choices:['10,240','40','2.5'],answer:1,
        feedback:'用 IOPS 乘单次 I/O 的大小。比较前确认用的是同一种块大小和单位。'
      },{
        title:'只把深度改为 16',goal:'在相同条件完成两轮，比较吞吐与 P99。',
        concept:'并发可以让设备同时处理更多请求，也可能增加排队。clat 的 P99 是完成延迟的第 99 百分位。它适合观察尾部请求，和最大延迟是两回事。',
        commands:[labRead(16)],
        checks:[['同条件深度 16 的两轮结果',({events})=>events.filter(e=>e.kind==='fio'&&!e.failed&&!e.diskBusy&&!e.underLoad&&labComparableDisk(e,'randread',16)).length>=2]],
        question:'如果 IOPS 提高，P99 也变大，应怎么评估？',
        choices:['只取 IOPS 最高值','取最小 P99，把其他轮次忽略','同时对照吞吐基线和业务延迟门限'],answer:2,
        feedback:'吞吐和尾延迟可以向不同方向变化，是否适合取决于业务目标。'
      },{
        title:'复现后台负载干扰',goal:'开启模拟备份、观察等待，按深度 16 重测。停止备份后再次复测。',
        concept:'iostat 的 await 包含排队和服务时间。%util 表示采样期间设备忙碌比例，对并行 SSD，100% 并不必然表示设备性能达到极限。用受控的开关前后对比验证争用。',
        commands:['sim disk-busy on','iostat -x 1',labRead(16),'sim disk-busy off'],
        checks:[['存在后台负载时采样并按原参数重测',ctx=>labEvidence('disk-stats',e=>e.busy)(ctx)&&labDiskEvidence('randread',16,e=>!e.failed&&e.diskBusy&&!e.underLoad)(ctx)],
          ['关闭负载后取得同参数复测',({events})=>{const changed=events.findIndex(e=>e.kind==='disk-busy-change'&&!e.active);return changed>=0&&labDiskEvidence('randread',16,e=>!e.failed&&!e.diskBusy&&!e.underLoad)({events:events.slice(changed+1)});}]],
        question:'背景负载只关掉一项，结果随之恢复。下一步最有价值的是？',
        choices:['记录开关、等待与同参数数据，复测确认相关性','直接认定硬盘损坏','换块大小，证明原结论'],answer:0,
        feedback:'这组命令支持“观察到资源争用”的解释。真实客户环境还需要采样和重复测量。'
      }
    ]
  },{
    id:'throughput',group:'网络性能',level:'进阶',title:'网卡标称千兆，为什么只测到百兆？',
    description:'对照协商和 TCP 吞吐，再观察 UDP 目标速率和接收丢包。',initial:{speed:100,peerPort:5201},
    recap:'核对了连通、链路协商与 TCP 有效吞吐，并用 UDP 对比验证了超出链路容量时的丢包表现。',
    challenge:{title:'变式 · UDP 发送目标高于链路能力',symptom:'B 端已监听，低目标速率 UDP 基本无丢包，高目标速率时出现丢包。请采集协商速率，并用两个发送目标验证。',initial:{speed:100,peerPort:5201}},
    steps:[
      {
        title:'把连通、协商和吞吐分别取证',goal:'取得 ping、ethtool 和基线 TCP 结果。',
        concept:'ping 先确认路径可达。Speed=100Mb/s、Duplex=Full、Link detected=yes 表示当前有载波并协商为百兆全双工。TCP 的接收速率还会受协议开销、端点和路径影响。',
        sample:'Speed: 100Mb/s · Duplex: Full · Link detected: yes\nTCP receiver: 94.0 Mbits/sec',
        commands:['ping -c 2 '+LAB_PEER,'ethtool enp3s0',labTCP],
        checks:[['对端 ICMP 成功',labEvidence('ping',e=>!e.failed&&e.target===LAB_PEER)],['百兆协商与同端点 TCP 流量',ctx=>labEvidence('carrier',e=>e.speed===100)(ctx)&&labEvidence('transfer',e=>labTCPComparable(e)&&e.rate<100)(ctx)]],
        question:'本例 Speed=100Mb/s、Full、yes 表示什么？',
        choices:['当前在线且协商百兆全双工','网卡没载波','已经证明端到端吞吐为 100 MB/s'],answer:0,
        feedback:'Mb/s 是兆比特每秒。链路标称速率也不能直接当成应用有效载荷的吞吐。'
      },{
        title:'改变链路条件并复测',goal:'模拟恢复千兆，先用 ethtool 验证，再用同一 TCP 作业复测。',
        concept:'保持端点、端口、方向、流数和时长一致。sim link 表示改变本实验的物理协商条件。在工作现场，通常结合线缆、交换机与两端配置查证。',
        commands:['sim link 1000','ethtool enp3s0',labTCP],
        checks:[['观察到千兆协商',labEvidence('carrier',e=>e.speed===1000)],['同参数 TCP 收到至少 900 Mb/s',labEvidence('transfer',e=>labTCPComparable(e)&&e.rate>=900)]],
        question:'为什么复测保留相同的方向、流数和端口？',
        choices:['为了让 RTT 变成零','便于将差异与本次链路条件变化对应','TCP 必须以千兆作为固定发送速率'],answer:1,
        feedback:'控制变量让结果可比。仍应记录前后两端配置和实际输出。'
      },{
        title:'理解 UDP 发送速率和丢包',goal:'分别设置 100M 和 1200M 目标带宽，比较接收吞吐、Lost% 与 Jitter。',
        concept:'UDP 的 -b 控制目标发送速率。发送负荷超过路径能力时接收量会受限，丢包率与抖动仍要分开看。并行流下，每条流分别应用 -b。',
        commands:[labUDP('100M'),labUDP('1200M')],
        checks:[['正常目标下取得无丢包样本',labEvidence('transfer',e=>!e.failed&&e.target===LAB_PEER&&e.udp&&e.streams===1&&e.offered===100&&e.loss===0)],
          ['较高目标下观察到丢包',labEvidence('transfer',e=>!e.failed&&e.target===LAB_PEER&&e.udp&&e.streams===1&&e.offered===1200&&e.loss>0)]],
        question:'1200M 是什么？',
        choices:['实测接收值','1.2 GB/s 的文件读取速率','本轮每条流的发送目标'],answer:2,
        feedback:'接收速率看 receiver。丢包和抖动都应记录，接收速度不能替代它们。'
      }
    ]
  },{
    id:'pressure',group:'稳定性',level:'进阶',title:'压力测试出现 OOM，怎样取证和复测？',
    description:'同一轮采样并记录中止原因，通过 worker 与内存大小控制复测。',initial:{},
    recap:'完成了空载基线、受限环境的资源监控、OOM 日志和较小负载的全程复测。',
    challenge:{title:'变式 · 后台业务占用较高',symptom:'启动测试前，已有工作进程占用大量内存。先看可用量，再选择一个可完成的压力用例，留存观察与结束证据。',initial:{resident:12,cpuBackground:48}},
    steps:[
      {
        title:'采集空载快照并定义停止条件',goal:'执行 free、vmstat 和 top，记录开始前的可用内存、换页和 CPU。',
        concept:'可用内存估计包括部分可回收缓存。vmstat 中 swpd 是已使用的交换空间，si 和 so 才反映换入换出速率。出现 OOM、持续换页或业务异常时应按预先约定的条件停止。',
        sample:'Mem: … available 14.0Gi\nvmstat … swpd / si / so',
        commands:['free -h','vmstat 1','top'],
        checks:[['空载可用内存与换页确认',ctx=>labEvidence('memory',e=>!e.loadId)(ctx)&&labEvidence('monitor',e=>!e.loadId)(ctx)],['已取得空载进程快照',labEvidence('process',e=>!e.loadId)]],
        question:'哪个字段最直接用于估计应用还可使用多少物理内存？',
        choices:['MemAvailable / available','swpd','CPU(s)'],answer:0,
        feedback:'看 available 并配合趋势和换页判断，避免把可回收缓存全部理解为压力。'
      },{
        title:'用同一轮数据分析 OOM',goal:'启动受控的模拟负载，采样后推进 10 秒，再读本轮日志。',
        concept:'--vm 指定内存 worker 数，--vm-bytes 指每个 worker 请求的量，本例 4×5 GiB=20 GiB。sim wait 推进虚拟时间。模型在内存与交换容量不足时记录 OOM 并结束该轮模拟负载。',
        commands:['stress --cpu 4 --vm 4 --vm-bytes 5G --timeout 30s','free -h','vmstat 1','sim wait 10','dmesg -T'],
        checks:[['被 OOM 结束的作业有运行中内存和换页采样',({events})=>{return events.some(end=>end.kind==='load-end'&&end.reason==='oom'&&events.some(e=>e.kind==='memory'&&e.loadId===end.loadId&&e.available<1)&&events.some(e=>e.kind==='monitor'&&e.loadId===end.loadId));}],
          ['当前启动日志包含 OOM 证据',labEvidence('logs',e=>!e.previousBoot&&/Out of memory: Killed/.test(e.output))]],
        question:'这次 4 个内存 worker、每个 5 GiB，共请求多少？',
        choices:['5 GiB','20 GiB','16 GiB'],answer:1,
        feedback:'保存作业参数、OOM 日志和同轮资源采样。降低负载后另起一轮复测。'
      },{
        title:'用较小负载跑满并确认恢复',goal:'缩小每 worker 内存，采样后让作业跑满 30 秒，再查看资源恢复。',
        concept:'监控样本必须来自本轮作业。结束后查看资源回到基线，日志中早先那次 OOM 仍会存在，需要按作业号区分。',
        commands:['stress --cpu 4 --vm 2 --vm-bytes 2G --timeout 30s','free -h','vmstat 1','sim wait 30','dmesg -T'],
        checks:[['组合负载跑满且同轮实际采样',({events})=>{return events.some(ended=>ended.kind==='load-end'&&ended.reason==='timeout'&&events.some(e=>e.kind==='load-start'&&e.id===ended.loadId&&e.cpu>0&&e.vm>0&&e.duration>=30)&&['memory','monitor'].every(kind=>events.some(e=>e.kind===kind&&e.loadId===ended.loadId)));}],
          ['结束后观察到可用内存恢复',({events})=>{const end=events.findIndex(e=>e.kind==='load-end'&&e.reason==='timeout');return end>=0&&events.slice(end+1).some(e=>e.kind==='memory'&&!e.loadId&&e.available>=12);}]],
        question:'哪项是本轮稳定性结论的必要证据？',
        choices:['只有开始时的 CPU 截图','历史日志里存在 OOM','达到设定时间、同轮资源采样和结束后恢复'],answer:2,
        feedback:'本轮是否完成和早先异常是两条记录。报告要说明负载条件及未覆盖的正式长稳范围。'
      }
    ]
  },{
    id:'storage-failure',group:'故障与回归',level:'进阶',title:'区分容量用尽与磁盘 I/O 错误',
    description:'分别复现 ENOSPC 和 EIO，检查日志、恢复后复跑原用例，再准备交付。',initial:{diskUsed:100,fileMiB:0},
    recap:'分别记录了 ENOSPC 与 EIO 的表现。完成同参数写入回归后，可用变式案例提交一份带证据的模拟缺陷报告。',
    challenge:{title:'变式 · 有空闲空间但写入失败',symptom:'盘已挂载且仍有空间，测试文件写入失败。判断失败类型，记录日志和修复前后的同参数结果。',initial:{diskError:true}},
    steps:[
      {
        title:'复现空间已满的写入失败',goal:'确认目标挂载、检查占用，并对虚拟测试文件运行写入作业。',
        concept:'ENOSPC 表示无法分配更多空间，本例由文件系统容量用尽触发。在真实现场，空间和 inode 都可能成为限制，也应核对是否有配额或预留空间。',
        sample:'/dev/sdb1 … 0G 100% /mnt/sit\nfio: err=28, No space left on device',
        commands:['findmnt /mnt/sit','df -hT',labWrite,'dmesg -T'],
        checks:[['确认挂载测试卷且使用率为 100%',labEvidence('space',e=>e.mounted&&e.usedPercent===100)],['虚拟写入报告 ENOSPC',labDiskEvidence('write',1,e=>e.reason==='no-space')]],
        question:'这里最直接的失败证据是什么？',
        choices:['挂载已丢失','目标卷无剩余空间，写入返回 ENOSPC','控制器已确认物理损坏'],answer:1,
        feedback:'先记录容量、挂载目标和失败输出。容量证据和块层错误需要分别检查。'
      },{
        title:'观察有空间时的另一类失败',goal:'恢复模拟容量，注入 I/O 异常，用相同写入作业和日志区分 EIO。',
        concept:'EIO 表示 I/O 请求失败。这个场景有 HBA 超时和块设备错误，线索指向存储路径。单个错误码不足以确定介质损坏。',
        commands:['sim space 12','df -hT','sim io-error on',labWrite,'dmesg -T','iostat -x 1'],
        checks:[['已挂载且有剩余容量',labEvidence('space',e=>e.mounted&&e.usedPercent<100)],['相同写入出现 EIO 且采集到控制器日志',ctx=>labDiskEvidence('write',1,e=>e.reason==='io-error')(ctx)&&labEvidence('logs',e=>!e.previousBoot&&/command timeout/.test(e.output))(ctx)]],
        question:'写入返回 EIO，日志显示超时和重置。应该怎样写初步结论？',
        choices:['存在存储路径异常，保留时间线并复核控制器、驱动和盘','一定是空间不足','直接宣布硬盘必须更换'],answer:0,
        feedback:'结论写已观察到的证据，再列出仍待现场确认的原因。'
      },{
        title:'消除异常并对原用例回归',goal:'关闭模拟异常，保持相同参数复跑，检查挂载、容量和日志时间线。',
        concept:'回归复用原触发条件。测试环境不能自动证明真实硬件修复。历史 EIO 日志仍保留，检查故障结束后本轮 fio 的退出状态和写入数据。',
        commands:['sim io-error off',labWrite,'df -hT','journalctl -b -k'],
        checks:[['关掉异常后相同写入成功',({events})=>{const changed=events.findIndex(e=>e.kind==='io-change'&&!e.active);return changed>=0&&labDiskEvidence('write',1)({events:events.slice(changed+1)});}],
          ['核对本轮容量与日志',ctx=>labEvidence('space',e=>e.mounted&&e.usedPercent<100)(ctx)&&labEvidence('logs',e=>!e.previousBoot)(ctx)]],
        question:'回归报告怎样把现象、证据和结论连起来？',
        choices:['只写“已修复”','只保留成功截图','附上原参数、失败日志、变更及同条件通过记录'],answer:2,
        feedback:'这些信息让下一位工程师能重现原问题，也能判断修复验证覆盖了什么。'
      }
    ]
  }
];

const GUIDED_STEPS = [
  {
    title: '先看正常时是什么样',
    goal: '确认网卡、物理链路和到对端的连通性。对端是 192.168.10.20。',
    concept: '网卡是系统里能操作的接口。LOWER_UP 和 Link detected: yes 表示下层链路有载波。到对端是否可达，需要一次实际探测。',
    commands: ['ip -br link', 'ethtool enp3s0', 'ping -c 2 192.168.10.20'],
    question: '看到 LOWER_UP，可以直接判断什么？',
    choices: ['下层链路有载波', '目标服务正在监听', '已经验证端到端连通'], answer: 0,
    feedback: 'LOWER_UP描述下层链路。后续的ping才提供到对端的连通证据。'
  }, {
    title: '重启并定位丢失的地址',
    goal: '模拟维护重启。确认接口有无变化、IPv4 是否还在、对端是否可达。',
    concept: '同一个接口可以在链路正常时没有 IPv4。先比较接口和地址证据，再查连通失败发生在哪一层。',
    commands: ['reboot', 'ip -br link', 'ip -br addr', 'ping -c 2 192.168.10.20'],
    question: '根据本次输出，哪一项发生了变化？',
    choices: ['以太网接口消失了', '接口仍在，IPv4 地址丢失', '对端的 iperf3 进程关闭'], answer: 1,
    feedback: '接口仍有载波，地址查询显示 enp3s0 没有 IPv4。先重建地址，再验证可达性。'
  }, {
    title: '临时恢复通信',
    goal: '给接口加回地址，验证通信，并读取保存的启动配置。',
    concept: 'ip addr add 改变内核当前的地址状态。系统启动时读取另一份配置。像本实验这样的同网段双机，需要双方的本地路由都能覆盖对方。',
    commands: ['sudo ip addr add 192.168.10.10/24 dev enp3s0', 'ping -c 2 192.168.10.20', 'cat /etc/sysconfig/network-scripts/ifcfg-enp3s0'],
    question: '现在通了，启动配置仍没有 IPADDR，再重启会怎样？',
    choices: ['网卡驱动会卸载', 'ping 成功会自动保存地址', '临时地址会消失'], answer: 2,
    feedback: '本次在线修改没有写入启动配置。用重启前后的证据验证这个推断。'
  }, {
    title: '验证修复能否跨重启',
    goal: '先重启并复现，再保存配置，第二次重启后重新检查地址和连通性。',
    concept: '回归要触发原来的失败条件。这里的失败条件是重启。sim save-ip 代表保存模拟机的启动配置，实际现场需核对发行版使用的网络配置工具。',
    commands: ['reboot', 'ping -c 2 192.168.10.20', 'sim save-ip 192.168.10.10/24', 'ip -br addr', 'journalctl -b -1'],
    question: '哪组证据足以确认这次地址恢复在重启后生效？',
    choices: ['保存配置后重启，地址仍在且对端 ping 成功', '地址刚加上时 ping 成功', '看到 Link detected: yes'], answer: 0,
    feedback: '修复后重演了相同的触发条件，并采集了本轮启动的地址与连通证据。'
  },
  {
    title: '区分网络可达与服务可用',
    goal: '先尝试连接，再在对端检查和启动监听，最后用同一目标和端口重试。',
    concept: 'ping 使用 ICMP。iperf3 客户端还依赖对端有进程监听对应的 TCP 端口。本机 ss 只显示本机套接字，sim peer ss 用来查看这个实验的 B 端。',
    commands: ['iperf3 -c 192.168.10.20 -t 5', 'sim peer ss', 'sim b iperf3 -s', 'sim peer stop'],
    question: '本例 ping 成功、iperf3 返回 Connection refused，对端 ss 没有监听。接下来先做什么？',
    choices: ['更换网线', '在对端启动监听，核对端口后重试', '把客户端地址改成对端地址'], answer: 1,
    feedback: '在这个受控场景里，连通证据、监听状态与重新连接的结果共同支持判断。'
  }
];

const NETWORK_GUIDED_COURSE = {
  id:'network',group:'网络排查',level:'基础',title:'网卡存在，为什么无法通信？',
  description:'比较正常与故障输出，区分临时地址、持久配置和服务监听。',
  initial:{savedAddress:''},steps:GUIDED_STEPS,
  recap:'你已用命令区分接口、地址、连通与端口，并验证地址配置能跨重启保留。',
  challenge:{title:'独立练习 · 共享测试机无法通信',symptom:'维护结束后，从 A 无法 ping 通 B。请排查并让双机 TCP 测试通过。',initial:{up:false}}
};



const localPing = e=>e.target===LAB_PEER&&!e.failed;
const missingLabIP = e=>e.target===LAB_PEER&&e.reason==='no-ip';
const hasLocal = (kind,match=e=>!e.failed)=>({events,machine})=>events.some(e=>e.kind===kind&&e.boot===machine.boot&&!e.fromPeer&&match(e));
const networkChecks = [
  [['取得本机接口状态',hasLocal('link')],['取得物理链路证据',hasLocal('carrier')],['取得到 B 端的 ping 成功结果',hasLocal('ping',localPing)]],
  [['完成本步重启',hasLocal('reboot')],['重查本机接口',hasLocal('link')],['确认本轮启动没有 IPv4',hasLocal('addr',e=>!e.address)],['观察到缺少地址时 ping 失败',hasLocal('ping',missingLabIP)]],
  [['为目标接口添加临时地址',hasLocal('runtime-change',e=>e.address===LAB_CIDR)],['用临时地址验证通信',hasLocal('ping',e=>e.address===LAB_CIDR&&localPing(e))],
    ['读到启动配置尚未保存 IPv4',hasLocal('config',e=>!e.savedAddress)]],
  [['保存配置前，重启触发临时地址丢失',({events})=>{
    const boot=events.findIndex(e=>e.kind==='reboot'&&!e.address);
    const save=events.findIndex(e=>e.kind==='save-ip');
    return boot>=0&&events.slice(boot+1,save<0?undefined:save).some(e=>e.kind==='ping'&&missingLabIP(e));
  }],['保存正确的启动配置',labEvidence('save-ip',e=>e.savedAddress===LAB_CIDR)],
  ['保存后再次重启并验证地址与连通',({events,machine})=>{
    const saved=events.findIndex(e=>e.kind==='save-ip'&&e.savedAddress===LAB_CIDR);
    const boot=events.findIndex((e,i)=>i>saved&&e.kind==='reboot'&&e.boot===machine.boot&&e.address===LAB_CIDR);
    const current=events.slice(boot+1);
    return saved>=0&&boot>=0&&current.some(e=>e.kind==='addr'&&!e.fromPeer&&e.address===LAB_CIDR)
      &&current.some(e=>e.kind==='ping'&&localPing(e));
  }]],
  [['观察到连接拒绝并查到 B 无监听',({events,machine})=>{
    const step=events.filter(e=>e.boot===machine.boot);
    const rejected=step.findIndex(e=>e.kind==='transfer'&&e.target===LAB_PEER&&e.reason==='no-listener');
    return rejected>=0&&step.slice(rejected+1).some(e=>e.kind==='sockets'&&e.raw==='sim peer ss'&&!e.output.includes('LISTEN'));
  }],['启动对端监听后重试成功',({events,machine})=>{
    const current=events.filter(e=>e.boot===machine.boot), refused=current.findIndex(e=>e.kind==='transfer'&&e.target===LAB_PEER&&e.reason==='no-listener');
    if(refused<0)return false;
    const attempt=current.slice(refused+1),listen=attempt.findIndex(e=>e.kind==='listen'&&e.fromPeer);
    return listen>=0&&attempt.slice(listen+1).some(e=>e.kind==='transfer'&&e.target===LAB_PEER&&!e.fromPeer&&!e.failed);
  }]]
];
NETWORK_GUIDED_COURSE.steps.forEach((step,index)=>{step.checks=networkChecks[index];});
