'use strict';

COMMAND_KB.push(
  ['服务','systemctl is-active crond','查询调度器现在是否运行','区分当前运行和开机启用。','is-active 只查当前状态，不改变服务。','active','active 但 disabled 是否矛盾？','linux-service-lifecycle'],
  ['服务','systemctl is-enabled crond','查询正常开机启用关系','设置与当前进程分开核对。','enable 本身不启动，disable 本身不停止。','disabled','stop 后为什么仍然 enabled？','linux-service-lifecycle'],
  ['计划任务','cat /etc/cron.d/host-report','逐列读取系统每日计划','先确认时间、账号与命令，再核对实际派发。','系统 cron.d 有账号字段；用户 crontab 没有额外账号列。',HOST_CRON_LINE,'看到 CMD 为什么还不能判定成功？','linux-cron-evidence']
);

// Lessons reuse the same crond, clock and report job as OPS-002.
function initializeScheduleLab(machine,variant){
  const ops=machine.ops;
  ops.groupMember=true;
  ops.packageInstalled=variant!=='dispatch';
  machine.scheduleTraining={revision:0};
  if(variant!=='service'){
    ops.runOrdinal=1;
    ops.latest={generatedAt:'2024-12-31T02:15:00Z',boot:0,source:'manual',account:'reportbot',checks:HOST_CHECKS.length,runId:1};
    ops.enabled=variant==='dispatch';
    ops.schedule=variant==='assessment';
    setHostCronActive(machine,true);
  }
}

function scheduleSaw(kind,match=()=>true,live=true){
  return ({events,machine})=>events.some(e=>e.kind===kind&&!e.pipeline&&!e.fromPeer&&e.boot===machine.boot&&(!live||e.scheduleRevision===machine.scheduleTraining.revision)&&match(e));
}

function scheduleCurrentReport({events,machine}){
  const ops=machine.ops,latest=ops.latest;
  if(!ops.active||!ops.enabled||!ops.schedule||ops.reportRevision!==machine.scheduleTraining.revision||!latest||latest.source!=='cron'||latest.boot!==machine.boot||latest.account!=='reportbot'||latest.runId!==ops.runOrdinal)return false;
  const fresh=e=>!e.failed&&!e.pipeline&&!e.fromPeer&&e.boot===machine.boot&&e.scheduleRevision===machine.scheduleTraining.revision;
  const dispatch=events.findLast(e=>fresh(e)&&e.kind==='ops-cron-log'&&e.current&&e.dispatchedAt===latest.generatedAt);
  const job=events.findLast(e=>fresh(e)&&e.kind==='ops-job-log'&&e.entries.some(row=>row.boot===machine.boot&&row.source==='cron'&&row.runId===latest.runId&&row.scheduledAt===latest.generatedAt&&row.exitCode===0));
  const artifact=events.findLast(e=>fresh(e)&&e.kind==='ops-artifact'&&e.artifact.source==='cron'&&e.artifact.boot===machine.boot&&e.artifact.runId===latest.runId&&e.artifact.generatedAt===latest.generatedAt);
  return Boolean(dispatch&&job&&artifact);
}

function scheduleBootVerified(context){
  const {events,machine}=context,ops=machine.ops;
  return ops.autoStartedBoot===machine.boot&&ops.enabled&&ops.active
    &&events.some(e=>e.kind==='reboot'&&!e.failed&&!e.fromPeer&&e.boot===machine.boot&&e.fromBoot<machine.boot)
    &&scheduleSaw('ops-cron-status',e=>!e.failed&&e.action==='status'&&e.enabled&&e.active)(context)
    &&scheduleSaw('ops-cron-log',e=>!e.failed&&e.current&&e.started)(context);
}
