# 维护与贡献

学习者双击 `index.html` 就能打开平台。改动也应保留这个入口和离线运行方式。

| 要改什么 | 从哪里查起 |
|---|---|
| 课程任务、提示、判断题 | `guided-courses.js`、`extended-courses.js`、`lesson-literacy.js` |
| Linux 工单与模拟环境 | 主机运维：`host-ops-course.js`、`host-ops-lab.js`；Web 发布：`linux-work-courses.js`、`linux-work-lab.js`；新增方向见 [路线图](Linux实训路线图.md) |
| 真实容器实训 | `labs/backup-restore/`、`labs/operations-stack/` 存环境和取证脚本；`backup-lab-web.js`、`field-labs-web.js` 导入本地证据 |
| 课程步骤、证据和模拟终端 | `experience.js`、`practice-storage.js`、`coach.js` |
| 命令结果和状态变化 | `practice-engine.js` 与内核、网络、系统模拟文件；文件课程见 `file-lab.js` |
| 独立实验室与工程报告 | `engine-bridge.js`、`app.js`、`training.js` |

加课程时，先写工作目标和验收依据，再准备模拟初始状态、可执行的示例和判断题。实际命令输出必须足以支持题目结论；验收需要识别成功或失败、参数和所在环境，避免仅凭命令名通过。同一设备状态应从模拟机读取，例如百兆协商需要在 `ethtool`、网络测试和链路日志中一致。

反馈问题时请注明课程和步骤、模拟机配置、执行的命令、预期和实际输出，以及刷新后能否复现。提交前用模拟数据替换工作日志中的内部地址、账号、序列号等信息。

## 接着开发 Linux 主线

首页由 `linux-path.js` 的 `LINUX_PATH` 排序。每个阶段写明能独立完成的任务，并引用能打开的课程 ID。共同基础使用独立验收作为阶段出口，直接通过只记录验收成绩，未上的课仍显示未开始。浏览器工单按实际结课记录，真实工单按导出交接时的证据结论记录。沿用已有稳定 ID，旧的课程链接和学习记录才能继续使用。

可运行的样板在 `linux-foundations.js`。可从 `linux-directory` 复制一条完整学习链。写清工作目标，把本步所需概念加入 `LINUX_CONCEPTS`，用 `knowledge` 引用，在 `commands` 里提供可折叠提示。用 `checks` 检查当前步骤的实际事件、目标和输出，最后用判断题区分观察与推断。跨课程复用的预备知识可在 `COURSE_KNOWLEDGE` 登记。需要独立验收时参考 `linux-foundation-check`，设置现场初态、隐藏提示，通过 `readings` 核对学员填写的实测字段。

已接入的日志样板是 `linux-service-logs`。服务的配置值与运行状态分别保存，修复前后使用不同的 revision。失败的 `systemctl status` 同样属于有效现场证据，应检查事件中的 `processExitCode`，命令自己的 `exitCode` 单独记录。本课的 `sim app-port` 是编辑虚拟配置的教学动作，解释随实际命令显示。

文件与日志阶段已完成。`file-lab.js` 提供课程独立的文件树、当前目录与读取/筛选模型；`file-courses.js` 定义定位、阅读、筛选保存和独立交接。`linux-path.js` 单独注册这一阶段，旧基础阶段的验收记录继续有效。原文、快照、计数和请求标识各有检查；验收材料使用不同请求编号。课程中的错误消息留在终端，标准输出才进入管道与目标文件。

账号阶段已完成，`account-lab.js` 复用现有主机工单的追加组操作和组成员状态。账号资料与当前会话组快照分开，`sudo -u` 命令读取新身份。新增 `chmod` 的八进制与属组符号模式，目录经过、文件读取与创建条目按同一权限模型返回证据。`account-courses.js` 包含两节跟练和独立交接，账号变更后的正反验证须匹配当前 accountRevision。

软件包阶段已完成。`package-lab.js` 包装并复用已有 RPM/DNF/巡检操作，只增加当前会话的搜索路径与版本检查。`package-courses.js` 包含两节跟练和一项独立交接。PATH 变更使用 packageRevision 隔离前后证据；巡检脚本为每次运行生成 runId，报告读回必须对应当前启动、当前运行和变更后的环境。旧存档缺少 runOrdinal 时从下一次执行自然开始记录，原有报告仍可查看。

**课程统一教学结构**。所有 40 门同页课程（独立验收隐藏导读）、24 个 SIT 专题和 5 张真实环境工单，都需要按“概念 → 小例子 → 逐条命令 → 参数 → 输出 → 自己操作 → 证据”组织。每个新术语先解释，每个统计先提供能手算的小样本。导读渲染在 `beginner-teaching.js`，专业命令与术语在 `course-teaching.js`，专题例子在 `topic-teaching.js`，真实命令解释在 `real-teaching.js`。新增课程应同时补齐相应的知识内容，不能只堆命令按钮。

预览使用克隆模拟机，正式验收只依据实际事件。真实工单不生成虚构的输出预览，必须标明在学员系统终端执行；网页只导入取证文件。独立验收隐藏命令提示和解析，旧阶段记录保持有效。

**服务与定时任务阶段已接入**。`schedule-lab.js` 只设置课程初态与证据规则，沿用 `host-ops-lab.js` 的 crond、模拟时钟、巡检和日志。`schedule-courses.js` 有两节跟练与独立交接，先区分 start/enable/stop，再核对系统计划七个部分，最后对照派发、脚本退出与本轮产物。服务、计划、依赖或启动轮次变化会递增 scheduleRevision；产物保留生成时的环境版本，重新读取旧报告不能充当变更后的自动运行。手工覆盖自动产物后也需重新派发。每步只读自己的实际事件；新增阶段独立出口不影响旧阶段成绩。

**下一批：网络寻址与连通基础**。复用已有 ip link/addr/route、ping、ss 与 curl 模型。先解释网卡接口、IP/前缀、本机回环和下一跳，再用小规模两台主机场景区分链路、路由、端口与业务响应。各课提供逐条导读和独立交接。DNS 应在相应解析状态模型就绪后单独加入，避免用固定成功输出代替诊断。

新阶段说明核对 [systemctl 的启用与运行语义](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) 和 [Cronie crontab 格式](https://man7.org/linux/man-pages/man5/crontab.5.html)。本课只模拟 UTC 固定每日计划，没有实现完整 crontab 编辑、夏令时、补跑或 systemd timer。

服务日志课程核对了 [journalctl 启动筛选](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html) 与 [systemd 进程退出码](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)。

## 浏览器冒烟检查

维护者需要 Node.js 和 Playwright。使用已经安装的 Edge 时，在 PowerShell 中运行：

```powershell
npm install --no-save --package-lock=false playwright
$env:SIT_BROWSER_CHANNEL = 'msedge'
node smoke.mjs
```

没有 Edge 时可用 `npx playwright install chromium` 安装测试用 Chromium，取消 `SIT_BROWSER_CHANNEL` 环境变量，再运行 `node smoke.mjs`。检查会打开本地 `index.html`，走过基础、文件日志交接、原 SIT 课程首步及两张 Linux 工单，验证发布回滚、重启与任务触发、刷新续学、会话隔离和交接导出。新增调度阶段检查运行与启用、失败派发、手工与旧报告排除、变更失效及独立交接；同时遍历全部同页课程、专题与真实工单入口，检查导读覆盖、解析和独立验收隔离。浏览器和 Playwright 仅供维护检查使用。

真实容器工单按 [OPS-003 运行手册](labs/backup-restore/README.md) 验证。在运行网页冒烟检查前设置 `SIT_BACKUP_EVIDENCE` 指向生成的 `ops003-evidence.json`，可附带验证证据导入与交接导出。Docker 验证与浏览器冒烟是两个检查项。

OPS-004–007 的操作见 [容器运维手册](labs/operations-stack/README.md)。可选 `SIT_PLATFORM_EVIDENCE` 指向包含 `ops-007-evidence.json` 的目录，验证容量图、交接和跨工单隔离。原生服务检查可用 `node labs/operations-stack/smoke-native.mjs`，它不会启动 Docker 或 Kubernetes。


文件课程的命令说明核对了 [grep 手册](https://man7.org/linux/man-pages/man1/grep.1.html) 与 [wc 手册](https://man7.org/linux/man-pages/man1/wc.1.html)。`wc -l` 统计换行符；grep 无匹配返回 1。筛选规则实现一次，由文件读取与管道共同调用。


账号课程核对了 [进程凭据](https://man7.org/linux/man-pages/man7/credentials.7.html)、[路径解析权限](https://man7.org/linux/man-pages/man7/path_resolution.7.html) 与 [chmod 语义](https://man7.org/linux/man-pages/man1/chmod.1.html)。本课模拟普通权限、预授权 sudo、固定 umask 和有限对象；ACL、SELinux、特殊位及完整 sudo 策略尚需对应专题。


软件课程核对了 [DNF 查询与安装语义](https://dnf.readthedocs.io/en/latest/command_ref.html) 和 [RPM 查询/文件清单](https://rpm.org/docs/4.20.x/man/rpm.8.html)。课内软件源、版本和执行结果均为固定教学模型；当前只提供 jq 的版本检查与有限 PATH 配置，完整 Shell、程序解析、符号链接与真实安装事务继续按专题扩充。


教学复核至少包含实际阅读页面和实际输入。检查示例路径、账号名和主机名与当前模型一致，缩写与选项先解释，输出的数字和字段能在页面找到说明。`beginner-teaching.js` 按本步实际命令生成导读，预览只运行在克隆机器上；不能用预览推进正式进度。同页跟练和专业案例均已接入；专题课与真实工单另有配套讲解。wc 用三行小文件起步，已有存档会补充缺少的示例文件。
