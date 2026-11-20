# OPS-004–007 · 容器与平台运维实训

同一套订单服务分为 `gateway` 和 `ledger`。前端通过 HTTP 调用后端；Compose 中后端用 SQLite 读取命名卷，Prometheus 只抓取前端的 `/metrics`。发布、告警、集群和容量各有独立工单与实证文件。下面的请求、进程、日志、数据库和集群对象都在你启动的实验环境中运行。

**先准备：**Docker Engine（Linux 容器）、Compose、Node.js 20+；OPS-006 还需要 kind 和 kubectl。首次运行会下载镜像。所有对宿主公开的接口绑定 `127.0.0.1`，样本编号与部署仅供实验。在仓库根目录进入 `labs/operations-stack`；以下各工单都从这个目录执行。Windows PowerShell 如需复制 `curl` 示例，请写 `curl.exe`。

| 默认入口 | 针对哪个组件 |
|---|---|
| `http://127.0.0.1:18650` | Compose 订单网关：`/live`、`/ready`、`/orders`、`/metrics` |
| `http://127.0.0.1:18651` | Prometheus：`/targets`、`/alerts` 与查询界面 |
| `http://127.0.0.1:18652` | OPS-006 使用 port-forward 访问网关 Pod |

如果端口冲突，可设 `SIT_GATEWAY_PORT`、`SIT_PROM_PORT`、`SIT_CLUSTER_PORT`；Kubernetes 的 port-forward 端口也应对应修改。每张工单按 `before → fault → after` 运行 `node observe.mjs OPS-00X 阶段`，在 `artifacts/` 生成或更新 JSON。再次运行 `before` 会开始新一轮；重采较早阶段会清除后续记录。双击仓库的 `index.html`，从「真实环境工作台」选择对应工单，导入 JSON 并写交接。`FAIL` 表示采样未满足本工单验收条件，已取得的记录仍可复盘。

<a id="ops-004"></a>

## OPS-004 · 容器发布与回滚

**工单：**v2 刚发布，进程能回应但业务不可用。你要识别实际运行的镜像和依赖错误，回滚到 v1，再证明后端容器重建没有丢失数据。

```text
docker compose up -d --build --wait gateway
docker compose exec -T ledger python /lab/service.py add SIT-OPS004
node observe.mjs OPS-004 before
docker compose -f compose.yaml -f release-v2.yaml up -d --no-deps --build gateway
node observe.mjs OPS-004 fault
docker compose ps
docker compose logs --tail=20 gateway
```

对照三条请求：`/live` 表示进程有响应，`/ready` 表示它能否调用当前依赖，`/orders` 才是这张工单的业务验收。若网关返回 502，日志可显示网关实际访问的上游路径和上游状态。发布实验中的 v2 请求 `/v2/orders`，而后端当前提供 `/v1/orders`。记录镜像标签、返回码与日志；不要只凭容器是 Running 就宣布发布成功。

```text
docker compose up -d --force-recreate --no-deps --wait ledger
docker compose up -d --wait gateway
node observe.mjs OPS-004 after
```

默认配置把网关恢复到 v1。验证新后端实例 ID 与基线不同、卷中的 `SIT-OPS004` 标记和原订单仍在。容器重建与卷重建是不同操作；本工单只重建容器。改进建议应说明上线前如何检查网关与后端的接口契约。

<a id="ops-005"></a>

## OPS-005 · 监控、告警与依赖排查

**工单：**值班收到订单不可用反馈。你要找出是 Prometheus 抓不到网关，还是网关能抓取但依赖失败。先把环境保持在 v1：

```text
docker compose --profile monitoring up -d --build --wait gateway prometheus
node observe.mjs OPS-005 before
docker compose stop ledger
node observe.mjs OPS-005 fault
docker compose logs --tail=20 gateway
docker compose up -d --wait ledger
node observe.mjs OPS-005 after
```

在 Prometheus 查询 `up{job="gateway"}` 和 `sit_gateway_dependency_ready`。脚本会短时间等候规则生效；规则 `for: 6s` 要求条件持续，告警可从 Pending 进入 Firing。网关在后台探测依赖，`/metrics` 读取最近一次结果，避免上游超时拖住抓取。此时 `/live` 和抓取仍可用，但依赖就绪值为 0，业务请求失败。核对告警名 `LedgerDependencyUnavailable`，并解释它为什么与 `GatewayScrapeDown` 不同。恢复后应重新检查订单与告警，而非只回看容器状态。这里验证 Prometheus 告警规则，没有搭建短信或外部通知通道。

<a id="ops-006"></a>

## OPS-006 · Kubernetes 跨节点排障

**工单：**后端 Pod 显示 Ready，但跨节点订单请求失败。练习用 Service、selector、EndpointSlice 与实际业务请求验证转发链路。

```text
kind create cluster --name sit-ops006 --config cluster/kind.yaml
docker build -t sitlab/ops-platform:v1 .
kind load docker-image sitlab/ops-platform:v1 --name sit-ops006
kubectl --context kind-sit-ops006 apply -f cluster/workloads.yaml
kubectl --context kind-sit-ops006 -n sit-ops006 rollout status deployment/gateway --timeout=120s
kubectl --context kind-sit-ops006 -n sit-ops006 get pods -o wide
```

在**另一个终端**启动并保持以下转发，再回到原终端采样：

```text
kubectl --context kind-sit-ops006 -n sit-ops006 port-forward deployment/gateway 18652:8080 --address 127.0.0.1
```

```text
node observe.mjs OPS-006 before
kubectl --context kind-sit-ops006 -n sit-ops006 patch service ledger --type=merge --patch-file cluster/selector-fault.json
kubectl --context kind-sit-ops006 -n sit-ops006 get pods -o wide
kubectl --context kind-sit-ops006 -n sit-ops006 get service ledger -o yaml
kubectl --context kind-sit-ops006 -n sit-ops006 get endpointslices -l kubernetes.io/service-name=ledger
node observe.mjs OPS-006 fault
```

可选的分层检查：在网关 Pod 内运行 `python -c "import socket; print(socket.gethostbyname('ledger'))"`（经 `kubectl exec deployment/gateway --`），再对照 Service 的 ClusterIP。DNS 解析到服务地址并不保证有后端 Endpoint。Pod Ready、Service Selector 和 EndpointSlice 是三份证据；port-forward 直接通向前端 Pod，只用于观测其处理请求的结果，不验证外部 Ingress。kind 的两个 worker 是同一台机器上的不同容器节点，不代表两台物理主机。

```text
kubectl --context kind-sit-ops006 -n sit-ops006 patch service ledger --type=merge --patch-file cluster/selector-fix.json
node observe.mjs OPS-006 after
```

确认后端 Pod 仍在原节点，Endpoint 重新出现且订单恢复。此工单用 `emptyDir` 存训练样本；持久化判据在 OPS-004 的命名卷工单，集群持久化不由这个练习验收。练完关闭 port-forward，再执行 `kind delete cluster --name sit-ops006`，只清理本实训集群。

<a id="ops-007"></a>

## OPS-007 · 性能定位与容量对比

**工单：**低并发正常，并发增加后 P95 超过实验目标 210 ms。请确定是单次处理耗时变长，还是等待后端工作槽的时间变长，并提出可复测的容量建议。

```text
docker compose up -d --build --wait gateway
node observe.mjs OPS-007 before
node observe.mjs OPS-007 fault
docker stats --no-stream
docker compose -f compose.yaml -f capacity.yaml up -d --no-deps --wait ledger
node observe.mjs OPS-007 after
```

- 基线：并发 1，请求 16 个；故障与调优后各请求 32 个，并发同为 8。负载由本地脚本发往订单接口，有限次，并采集实际 HTTP 耗时和退出结果。
- 依赖服务每个订单请求固定有 80 ms 的教学处理窗口。故障前与故障阶段后端并发槽都为 2。调优只改为 4 槽，镜像、请求路径、处理窗口和高并发请求数相同。
- 比较 P95、后端队列 P95、成功吞吐和失败数。这里的成功吞吐是单位实际时间内成功响应数。本工单以同一轮实验中是否改善验收；目标是否达到仍看最后的 P95。这个短样本不用于承诺生产容量。
- 可进阶查看 `docker compose exec -T ledger cat /sys/fs/cgroup/cpu.stat`（Linux cgroup v2），对比采样期间 CPU 节流计数是否增加；用 `docker stats` 对照内存与 CPU。队列升高本身不足以断言 CPU 不足。若条件不支持，就在报告标记该层证据未采集。

练完用 `docker compose --profile monitoring down` 停止 Compose 环境，保留卷与证据。复练若发现容量阶段遗留 4 槽，重新从不带 `capacity.yaml` 的默认配置启动。

## 交接与维护验证

交接写清：受影响的业务、降级或故障的可见证据、操作与验证结果、当前边界和下一步。建议附上证据 JSON 与关键日志；容量工单说明差异是否可归因于一次变量调整，以及样本与环境限制。

维护者没有 Docker 时，可运行 `node smoke-native.mjs`，用本机 Python 在临时目录验证服务版本、SQLite 持久化和容量数据；如已获得 Prometheus 原生可执行文件，从环境变量 `SIT_PROM_BIN` 提供它的绝对路径，可一起验证告警。它不代替真实 Compose/集群验证。

资料：[Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) · [Prometheus 告警规则](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) · [kind 多节点配置](https://kind.sigs.k8s.io/docs/user/configuration/) · [Kubernetes EndpointSlice](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
