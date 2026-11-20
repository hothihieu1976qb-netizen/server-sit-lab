# OPS-003 · 从备份恢复订单服务

你接手了一起订单数据事件：接口仍返回 HTTP 200，但部分历史订单查不到。保留源库，在隔离库恢复备份，核对订单编号、状态与金额，记录尚未进入该备份的订单。最后检查自动备份失败时的行为，准备交接。

## 环境与启动

本实验用真实的 PostgreSQL、PostgREST 和 Docker Compose，配套的浏览器平台只显示任务、核对本地导入的证据。镜像首次拉取需要联网。确保 Docker 运行的是 Linux 容器；`docker info`、`docker compose version` 应有结果。只有生成浏览器验收文件时才需要 Node.js 20 或以上。

| 环境 | 服务 | 持久数据 |
|---|---|---|
| 模拟企业的原业务（真实容器） | `source-db`、`source-api`，HTTP `127.0.0.1:18743` | 专用 `source-data` 卷 |
| 隔离恢复（真实容器） | `recovery-db`、`recovery-api`，HTTP `127.0.0.1:18744` | 独立 `recovery-data` 卷 |
| 备份与日志 | 单次运行的 `tools`，使用原生 `pg_dump`、`pg_restore`、`psql` | 当前实验目录的 `artifacts/`，不在数据库卷里面 |

数据库端口只在 Compose 网络内使用。实验使用合成记录和固定的训练口令。Linux 上如果当前用户不是 UID/GID 1000，在 Bash 先执行 `export LAB_UID=$(id -u) LAB_GID=$(id -g)`，让备份文件归当前用户所有。Windows PowerShell 的 HTTP 示例请用 `curl.exe`，Linux 和 macOS 用 `curl` 即可。

在仓库根目录打开终端：

```powershell
cd labs/backup-restore
docker compose up -d source-api
docker compose ps
curl.exe -fsS 'http://127.0.0.1:18743/orders?order=reference'
```

刚启动 API 可能还在加载表结构；如果请求失败，运行 `docker compose logs source-api`，待 API 就绪后重试。先记录三条订单的编号、状态和金额。原库、恢复库使用同名数据库 `orders`，区分两端要看**服务名和数据卷**。

## 1. 故障前做一份备份

先走主线：执行自动化备份，记下命令最后输出的目录名（形如 `backup-20251119T120000Z-XXXXXXXX`）。下文的 `ARCHIVE_ID` 要替换为这个目录名。

```powershell
docker compose run --rm --no-deps tools backup
docker compose run --rm --no-deps tools list ARCHIVE_ID
```

检查 `artifacts/ARCHIVE_ID/` 中的 `orders.dump`、`orders.dump.sha256` 和 `manifest.txt`。`list` 会先检查摘要，再用 `pg_restore --list` 查看归档目录。这个检查能确认文件可读和内容未变，业务是否能恢复还要用第二个数据库验证。

想先自己敲一遍备份命令，可以进入工具容器，用未使用的 `manual-001` 目录名执行以下步骤；这份手工备份也能走后续恢复和验收。

```powershell
docker compose run --rm --no-deps --entrypoint bash tools
```

```bash
set -e
mkdir /artifacts/manual-001
cd /artifacts/manual-001
pg_dump -w -h source-db -U lab_owner -d orders -Fc -f orders.dump
sha256sum orders.dump > orders.dump.sha256
pg_restore --list orders.dump
exit
```

`-Fc` 生成 PostgreSQL 自定义归档，`-f` 直接写文件，避免把二进制通过宿主终端重定向。这里练的是单个业务库的逻辑备份，不能用它推断整实例备份或任意时间点恢复已实现。

## 2. 复现事件，先留证

**确认备份完成后**再执行下面两条。前一条模拟正常订单写入，后一条只删除实验源库里的两条指定样本。恢复阶段不要对源库执行写入。

```powershell
docker compose exec -T source-db psql -U lab_owner -d orders -v ON_ERROR_STOP=1 -f /fixtures/late-write.sql
docker compose exec -T source-db psql -U lab_owner -d orders -v ON_ERROR_STOP=1 -f /fixtures/incident.sql
curl.exe -i 'http://127.0.0.1:18743/orders?order=reference'
```

保存删前证据与删后结果：哪两条历史订单消失？哪个订单在本次备份之后写入？HTTP 200 能证明业务无数据丢失吗？

## 3. 恢复到新库，验证业务恢复范围

```powershell
docker compose --profile recovery up -d --wait recovery-db
docker compose run --rm --no-deps tools restore ARCHIVE_ID
docker compose --profile recovery up -d recovery-api
docker compose exec -T recovery-db psql -U lab_owner -d orders -c 'SELECT reference, status, amount_cents FROM api.orders ORDER BY reference;'
curl.exe -i 'http://127.0.0.1:18744/orders?order=reference'
node verify.mjs ARCHIVE_ID
```

恢复脚本只连接 `recovery-db`，若目标已存在业务 schema 就会停止。`pg_restore` 在一个事务内执行；归档出现错误时，恢复事务回滚。恢复后用 SQL 与 HTTP 逐条对比，解释恢复库里为什么没有 `LAB-1004`，并保留源库仍可查到它的证据。这个实验只验收隔离恢复，未执行生产切流或合并数据。

`verify.mjs` 对照备份 SHA-256、恢复回执、两边 SQL 和 API 的实际结果，生成 `artifacts/ARCHIVE_ID/ops003-evidence.json`。回到首页的「真实容器实训」，导入它并写交接。记录的整秒用时仅覆盖恢复命令，耗时不足一秒可能显示 `0`；完整恢复耗时还包括发现、分析与业务验收。数据缺口是本次观察到的结果，不等于已达到任意 RPO 目标。

## 4. 验收自动化失败路径

阅读 `lab.sh`：归档先写到同一目录下的临时目录；导出、摘要和归档目录检查都完成后才重命名为可恢复的目录。日志写到 `artifacts/operations.log`。用错误口令做一次真实故障检查：

```powershell
docker compose run --rm --no-deps -e PGPASSWORD=invalid tools backup
$LASTEXITCODE
docker compose run --rm --no-deps tools verify ARCHIVE_ID
```

Bash 中用 `echo $?` 查看上一条命令的退出码。确认失败时返回非零、日志指向导出失败、没新增已发布的备份目录，上一份有效备份依然通过校验。自动化加练：将一次备份的退出码和目录编号写入自己的值班记录，让另一个人按记录完成独立恢复。

## 交付与收尾

交接应有事件现象、备份标识与摘要、恢复环境、SQL 和接口结果、数据缺口、自动化失败验证、下一步补录与复核建议。停止环境时运行：

```powershell
docker compose --profile recovery down
```

该命令保留数据卷与本地备份。想从初始数据重练，在停掉旧环境后另设 `COMPOSE_PROJECT_NAME`（PowerShell 例：`$env:COMPOSE_PROJECT_NAME='sit-ops003-round2'`），Compose 会建立新卷，`artifacts/` 中的历史备份仍可用于对比。如果要同时运行两轮，可用 `LAB_SOURCE_PORT`、`LAB_RECOVERY_PORT` 设不同的接口端口，验证脚本读取相同的环境变量。

参考：[Compose profiles](https://docs.docker.com/compose/how-tos/profiles/) · [Docker 数据卷](https://docs.docker.com/engine/storage/volumes/) · [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) · [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
