'use strict';

const REAL_PREP={
  'ops-003':['备份是一份确定时刻的数据副本。恢复演练把副本装入独立数据库，再对照业务记录，找出备份之后的新写入。',
    '原业务有 4 条订单，备份时只有 3 条。恢复后得到 3 条时，应把新增那 1 条作为待核对缺口。',
    ['PostgreSQL 是关系数据库。SQL 是查询和修改其中数据的语言。','API 是程序提供的访问入口。本课用 HTTP 请求读取订单。','source-db 与 recovery-db 是原库和隔离恢复库；各自使用独立数据卷。','ARCHIVE_ID 是脚本生成的备份编号，用它替换命令中的占位文字。']],
  'ops-004':['镜像保存程序构建，容器是它的运行实例，数据卷单独保存需要跨实例保留的数据。',
    '换回 v1 后接口恢复，再重建 ledger。如果实例编号变了，而订单标记仍能读到，可用这两项证据检查数据保留。',
    ['gateway 是接收请求的网关；ledger 是保存订单的后端。','liveness 检查进程能否响应，readiness 检查当前是否具备服务条件。','本课数据卷把 ledger 的 /data 与容器运行实例分开保存。']],
  'ops-005':['Prometheus 周期性读取指标，按规则判断是否需要告警。实际业务是否成功仍需发请求验证。',
    'up=1 表示指标端点能被抓取；后端下线时，订单请求仍可能失败，依赖指标与告警会提供另一层证据。',
    ['指标是可记录的数值，例如依赖是否就绪。','pending 表示条件已满足但还在等待持续时长，firing 表示告警已触发。','恢复后需要分别核对指标、告警与实际订单响应。']],
  'ops-006':['Kubernetes 用标签把服务与后端对应。Service 的 Selector 选择 Pod，EndpointSlice 列出相应后端地址。',
    'Pod 显示 Ready，但 Service 选了一个不存在的标签时，可用后端地址仍可能为空。',
    ['Pod 是运行容器的一组工作负载；Deployment 管理它的期望副本和更新。','kind 把实验 Kubernetes 节点放在本地容器中。本课两个 worker 带有不同标签。','context 指 kubectl 操作的集群，namespace 是集群中的资源分组。','port-forward 把本地端口转发到指定资源；本课仍需单独核对 Service 与 EndpointSlice。']],
  'ops-007':['并发请求超过后端同时处理的能力时，一部分请求会排队。总响应时间包含排队与处理。',
    '8 个同时到达的请求，后端只有 2 个工作槽时，部分请求必须等前一批完成。增加工作槽后，用相同并发重新比较。',
    ['并发是同一时段进行的请求数。','P95 是约 95% 请求的耗时不超过的值，用来观察较慢请求。','本课固定 80ms 处理窗口与有限样本，实验结果需按这些条件解释。']]
};

function realPrelude(id){
  const [concept,example,terms]=REAL_PREP[id];
  return '<section class="starter-guide real-prelude"><h3>先理解本课环境与目标</h3><p>'+esc(concept)+'</p><h4>先看一个小例子</h4><p>'+esc(example)+'</p><h4>这些名字分别是什么</h4><ul>'+terms.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><p>本区命令在自己的系统终端执行。网页提供说明，随后读取你选择的证据文件；每个结果以你的实际输出为依据。</p></section>';
}

function realCommandPurpose(words){
  const raw=words.join(' ');
  if(words[0]==='cd')return ['进入实验文件所在目录','后续命令会从当前目录寻找 compose.yaml 或脚本，先确认位置。','cd 成功通常没有输出，可用 pwd 确认当前目录。'];
  if(words[0]==='curl'||words[0]==='curl.exe')return ['从实际业务入口读取订单','确认接口是否响应，并比较订单编号、状态与金额。','关注 HTTP 成功与否及返回记录。金额字段 amount_cents 的单位是分；核对 reference 订单编号。'];
  if(words[0]==='node')return ['采集并保存本轮证据','脚本把实际数据库、服务或集群输出写成可导入的 JSON 文件。','observe.mjs 按 before/fault/after 保存基线、异常和恢复阶段；verify.mjs 对照订单与备份。看文件路径、逐项检查和退出码。'];
  if(words[0]==='kind')return ['准备本地实验集群或镜像','节点需要先建立，再把实验镜像载入指定集群。','关注集群名称、节点启动或镜像载入结果。准备完成后再用 kubectl 查询实际状态。'];
  if(words[0]==='kubectl'){
    if(words.includes('port-forward'))return ['建立本地访问入口','把本机的一个端口转发到指定工作负载，供本课请求和取证使用。','终端显示转发地址后保持它运行，在另一终端继续。该入口与 Service 的后端匹配分别检查。'];
    if(words.includes('patch'))return ['修改本课指定的服务选择条件','用给定 JSON 调整 Selector，随后观察后端地址与请求结果。','资源更新后，重新查看 Service/EndpointSlice 和实际请求，确认变更影响。'];
    if(words.includes('apply'))return ['创建或更新清单中的实验资源','YAML 文件描述期望的命名空间、工作负载与服务。','看哪些资源 created/configured，再等待部署状态并发起实际请求。'];
    if(words.includes('rollout'))return ['等待部署达到期望状态','先确认工作负载完成部署，再开始业务验证。','关注部署名称、超时或成功消息；继续核对请求响应。'];
    return ['查看集群中的实际资源','把标签、Pod 状态、所在节点和后端地址对应起来。','READY 是就绪容器数，STATUS 是状态，NODE 是节点。EndpointSlice 的地址与端口应对应预期后端。'];
  }
  if(raw.includes(' tools backup'))return ['生成一份独立备份','先建立可核对的备份点，再做故障演练。','记下生成的 ARCHIVE_ID、摘要和完成/失败状态，保留 artifacts 下的原文件。'];
  if(raw.includes(' tools restore'))return ['恢复到隔离数据库','使用同一份备份编号，在独立恢复环境验证恢复能力。','检查恢复退出结果，再用 SQL 与 API 核对恢复出的记录以及备份点后的缺口。'];
  if(raw.includes(' tools list')||raw.includes(' tools verify'))return ['核对已保存备份','检查备份目录或摘要，确认这份文件可供后续恢复。','关注编号、文件目录和摘要检查。失败时保留错误信息，使用上次有效备份继续判断。'];
  if(words.includes('psql'))return ['在实验数据库执行给定 SQL','这些课内 SQL 文件用于写入备份点后的订单或触发演练故障。','ON_ERROR_STOP=1 让 SQL 出错时停止。记录成功/失败，再从订单 API 查询实际变化。'];
  if(raw.includes(' service.py add '))return ['在后端保存一条可辨认的数据','用固定订单标记检查后续重建后数据是否仍在。','记下标记与保存结果，后续恢复阶段重新读取并对照。'];
  if(raw.includes(' compose logs'))return ['查看实验服务的近期日志','把请求错误、依赖状态和发布先后顺序对应起来。','保留完整消息和时间。最后几行是局部样本，需要时再扩大范围。'];
  if(raw.includes(' compose ps'))return ['查看容器服务状态','先知道哪个服务在运行、是否健康以及暴露的端口。','NAME 是实例名，SERVICE 是服务，STATUS 是状态，PORTS 是端口映射。业务仍需发请求确认。'];
  if(raw.includes(' compose stop'))return ['停止实验中指定的服务','按任务制造依赖下线，观察监控与用户请求如何变化。','确认停止的是本课服务，再采故障阶段证据。'];
  if(raw.includes('docker stats'))return ['查看容器资源快照','辅助对照本轮负载期间的 CPU、内存和 I/O。','看容器名、CPU%、MEM USAGE/LIMIT、NET I/O 和 BLOCK I/O，并与同一时段的请求数据对应。'];
  if(raw.includes('docker build'))return ['构建本课应用镜像','把当前实验代码构建成指定标签的镜像。','确认构建结果与标签，再把镜像载入实验集群或创建容器。'];
  return ['按配置启动或重建本课服务','Compose 文件说明镜像、依赖、端口和数据卷；附加文件会覆盖指定配置。','看服务是否启动、健康检查是否通过，再执行探针和业务请求，保存本轮实际结果。'];
}

function realTokenMeanings(words){
  const psql=words.indexOf('psql');
  const values={
    '-f':'读取此配置或清单文件；psql 中表示读取 SQL 文件。','--profile':'启用指定 Compose 可选服务组。',
    '--name':'本次实验集群名称。','--config':'读取集群配置文件。','--context':'指定操作的 Kubernetes 集群上下文。',
    '-n':'指定命名空间。','--type':'选择补丁方式，本课 merge 按合并规则更新。','--patch-file':'从此 JSON 文件读取补丁。',
    '--address':'本地监听地址；127.0.0.1 限定本机访问。','-l':'标签选择条件，用它筛选资源。','-t':'构建的镜像标签。',
    '-e':'为本次工具容器传入环境变量。','-U':'数据库用户名。','-v':'psql 变量设置；ON_ERROR_STOP=1 在 SQL 失败时停止。'
  };
  const flags={
    '-d':'后台运行；这条 Compose up 返回后服务继续工作。','--build':'启动前构建本课应用镜像。','--wait':'等待服务运行或达到健康条件。',
    '--no-deps':'仅处理指定服务，避免自动启动其依赖。','--rm':'一次性工具容器结束后移除该实例。',
    '-T':'不分配交互伪终端，适合这里的非交互执行。','--force-recreate':'重新创建指定容器实例。',
    '--no-stream':'只显示一轮资源快照。','-fsS':'curl 组合选项：HTTP 错误时返回失败、隐藏进度、同时显示错误消息。',
    '-i':'curl 同时显示响应状态与响应头。'
  };
  const names={cd:'切换当前目录，后续相对路径从这个位置查找。',build:'构建镜像。',stats:'读取容器资源统计。','--type=merge':'采用 JSON merge patch 合并补丁，更新给定字段。','SIT-OPS004':'写入本课数据卷的固定订单标记，后续用同一个标记验证数据仍在。',docker:'容器管理命令。',compose:'按 Compose 配置管理一组服务。',up:'启动或创建指定服务。',run:'运行一次性工具服务。',
    exec:'在已运行的容器中执行后面的程序。',ps:'列服务状态。',logs:'读服务日志。',stop:'停止指定服务。',node:'运行本地 JavaScript 取证脚本。',
    kind:'管理本地容器化 Kubernetes 实验集群。',kubectl:'读取和管理指定 Kubernetes 资源。',curl:'发起 HTTP 请求。','curl.exe':'Windows 的 curl 程序。',
    before:'采集基线阶段。',fault:'采集故障或高负载阶段。',after:'采集恢复或调优后的阶段。',ARCHIVE_ID:'替换为上一步实际生成的备份编号。',
    gateway:'本课接收请求的网关服务。',ledger:'本课保存订单的后端服务。','source-api':'原业务的订单 API。','source-db':'原业务数据库。',
    'recovery-api':'恢复环境的订单 API。','recovery-db':'隔离恢复数据库。',tools:'本课提供备份/恢复动作的工具服务。',
    prometheus:'本课指标采集与告警服务。',python:'在工具容器中运行 Python 程序。',psql:'PostgreSQL 数据库命令行客户端。',
    backup:'生成备份。',restore:'恢复到隔离环境。',verify:'核对备份摘要。',list:'列备份目录。',add:'添加指定订单标记。',
    apply:'按清单创建或更新资源。',patch:'更新指定资源的一部分字段。',get:'查询资源。',service:'选择 Service 资源。',
    endpointslices:'查询服务可用后端地址集合。',pods:'查询 Pod 实例。',rollout:'管理或查看部署过程。',status:'查询当前操作状态。',
    'port-forward':'建立本机到指定工作负载的端口转发。','-o':'选择输出格式，wide 增加节点等列。',wide:'输出额外列。',
    create:'创建。',cluster:'集群对象。',load:'载入。','docker-image':'把本地镜像载入 kind 节点。','.' :'当前目录作为构建上下文。'
  };
  const rows=[];
  for(let i=0;i<words.length;i++){
    const word=words[i];
    if(word==='-d'&&psql>=0&&i>psql){rows.push([word+' '+words[++i],'数据库名称。']);continue;}
    if(word==='-f'&&i+1<words.length){
      const meaning=psql>=0&&i>psql?'在数据库里执行此 SQL 文件。':words[0]==='kubectl'?'读取此 Kubernetes YAML 清单。':'读取此 Compose 配置文件，后面的配置可覆盖前面的指定项。';
      rows.push([word+' '+words[++i],meaning]);continue;
    }
    if(word==='-e'&&words[i+1]==='PGPASSWORD=invalid'){rows.push([word+' '+words[++i],'为本次工具传入故意错误的数据库口令，观察非零退出与旧备份是否仍有效。']);continue;}
    if(values[word]&&i+1<words.length){rows.push([word+' '+words[++i],values[word]]);continue;}
    let meaning=flags[word]||names[word];
    if(!meaning&&word.startsWith('--tail='))meaning='只查看末尾 '+word.split('=')[1]+' 行日志。';
    if(!meaning&&word.startsWith('--timeout='))meaning='最多等待 '+word.split('=')[1]+'，超时返回失败。';
    if(!meaning&&/^https?:/.test(word))meaning='实际请求的 URL，包含协议、本机端口、资源路径与查询条件。';
    if(!meaning&&word.includes('.mjs'))meaning='本项目的取证脚本路径。';
    if(!meaning&&word.includes('.py'))meaning='本项目容器内的应用脚本。';
    if(!meaning&&word.startsWith('OPS-'))meaning='本次取证的工单编号。';
    if(!meaning&&word.startsWith('deployment/'))meaning='选定的 Deployment 工作负载。';
    if(!meaning&&/^\d+:\d+$/.test(word))meaning='左边是本机端口，右边是工作负载端口。';
    if(!meaning&&word.includes('/'))meaning='本课指定的路径、镜像或资源名；与原命令保持一致。';
    rows.push([word,meaning||'本条命令的课内动作或目标值，按本步骤指定值使用。']);
  }
  return rows;
}

function realCommandGuide(raw){
  const words=shellWords(raw),[title,why,reading]=realCommandPurpose(words);
  return '<details class="real-command-guide"><summary><code>'+esc(raw)+'</code></summary><div class="starter-guide"><h4>'+esc(title)+'</h4><p>'+esc(why)+'</p><h4>这一条怎样写</h4><pre>'+esc(raw)+'</pre><table><thead><tr><th>命令中的部分</th><th>表示什么</th></tr></thead><tbody>'+realTokenMeanings(words).map(([part,meaning])=>'<tr><td><code>'+esc(part)+'</code></td><td>'+esc(meaning)+'</td></tr>').join('')+'</tbody></table><h4>执行后看什么</h4><p>'+esc(reading)+'</p><p>在系统终端执行后保留原始输出；本页不预填运行结果。结果异常时按本步骤的日志与验证命令继续调查。</p></div></details>';
}

document.addEventListener('DOMContentLoaded',()=>{
  const intro=document.querySelector('#backup-real-lab .real-lab-overview');
  intro.insertAdjacentHTML('afterend',realPrelude('ops-003'));
  for(const step of document.querySelectorAll('#backup-real-lab .real-lab-steps>details')){
    const code=step.querySelector('pre');
    const commands=code.textContent.split('\n').map(line=>line.trim()).filter(Boolean);
    code.outerHTML=commands.map(realCommandGuide).join('');
    step.querySelector('.real-command-guide').open=true;
  }
});
