'use strict';

{
  const fileInput=$('ops003-evidence-file'),status=$('ops003-evidence-status'),result=$('ops003-evidence-result');
  const handoff=$('ops003-handoff'),notes=$('ops003-handoff-notes'),exportButton=$('ops003-handoff-export');
  let record=null;
  const references=rows=>rows.map(row=>row.reference);
  const same=(first,second)=>JSON.stringify(first)===JSON.stringify(second);
  const rowValues=rows=>rows.map(row=>[row.reference,row.status,row.amount_cents]);
  const expected=[['LAB-1001','paid',2590],['LAB-1002','ready',4990],['LAB-1003','shipped',8990]];

  function checkArtifact(data){
    const validRows=rows=>Array.isArray(rows)&&rows.every(row=>row&&/^LAB-\d+$/.test(row.reference)&&typeof row.status==='string'&&Number.isInteger(row.amount_cents));
    if(data?.format!=='sit-ops003-evidence'||data.version!==1||!/^\w[\w-]{0,95}$/.test(data.archiveId)||!(/^[a-f0-9]{64}$/).test(data.archiveSha256)||!Number.isFinite(Date.parse(data.recordedAt))||!Number.isFinite(data.restoreSeconds)||data.restoreSeconds<0)return null;
    if(![data.source,data.recovery].every(side=>side&&Number.isInteger(side.http)&&validRows(side.sql)&&validRows(side.api)))return null;
    const gap=references(data.source.sql).filter(ref=>!references(data.recovery.sql).includes(ref));
    const checks=[
      ['原库显示演练故障',same(rowValues(data.source.sql),[expected[0],['LAB-1004','paid',3190]])],
      ['隔离库恢复三条基线记录',same(rowValues(data.recovery.sql),expected)],
      ['两端 API 返回 200，逐条匹配各自 SQL',data.source.http===200&&data.recovery.http===200&&[data.source,data.recovery].every(side=>same(rowValues(side.sql),rowValues(side.api)))],
      ['识别备份之后写入的数据缺口',same(gap,['LAB-1004'])]
    ];
    return {data,gap,checks,verdict:checks.every(([,pass])=>pass)?'PASS':'FAIL'};
  }

  function displayRecord(){
    const {data,gap,checks,verdict}=record;
    status.textContent='导入核对：'+verdict+' · '+data.archiveId+' · '+data.recordedAt;
    const format=rows=>rowValues(rows).map(row=>row.join(' / ')).join('\n')||'无记录';
    result.innerHTML=`<table><thead><tr><th>环境</th><th>HTTP</th><th>SQL 记录</th><th>API 记录</th></tr></thead><tbody>${[['原业务',data.source],['恢复环境',data.recovery]].map(([name,side])=>`<tr><th scope="row">${name}</th><td>${side.http}</td><td><pre>${esc(format(side.sql))}</pre></td><td><pre>${esc(format(side.api))}</pre></td></tr>`).join('')}</tbody></table><p>恢复命令用时：${data.restoreSeconds} 秒（不含故障识别与接口验证）。恢复环境缺少的原库记录：${esc(gap.join('、')||'无')}。</p><ul>${checks.map(([label,pass])=>`<li>${pass?'PASS':'FAIL'} · ${label}</li>`).join('')}</ul>`;
    handoff.hidden=false;
  }

  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];
    if(!file)return;
    record=null;
    result.replaceChildren();
    handoff.hidden=true;
    try{
      if(file.size<=1048576)record=checkArtifact(JSON.parse(await file.text()));
    }catch(_){}
    if(record)displayRecord();
    else status.textContent='无法读取 OPS-003 证据。请选由 verify.mjs 生成、大小不超过 1 MiB 的 JSON 文件。';
  });

  exportButton.addEventListener('click',()=>{
    if(!record)return;
    if(!notes.value.trim()){status.textContent='请先填写交接说明。';notes.focus();return;}
    const {data,gap,checks,verdict}=record;
    const content=['# OPS-003 · 订单服务恢复交接','','## 证据',`- 备份：${data.archiveId}`,`- SHA-256：${data.archiveSha256}`,`- 采集时间：${data.recordedAt}`,`- 导入记录核对：${verdict}`,`- 恢复命令用时（秒）：${data.restoreSeconds}`,`- 恢复环境缺少的原库记录：${gap.join('、')||'无'}`,
      '',...checks.map(([label,pass])=>`- ${label}：${pass?'PASS':'FAIL'}`),'','## 交接说明',notes.value.trim(),'','## 原始证据','```json',JSON.stringify(data,null,2),'```',''].join('\n');
    downloadText('OPS-003-handoff.md',content);
    recordFieldHandoff('ops-003',verdict);
    status.textContent='已导出交接说明。';
  });
}
