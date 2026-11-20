import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const archiveId=process.argv[2]||'';
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(archiveId)){
  console.error('Usage: node verify.mjs ARCHIVE_ID');
  process.exit(2);
}
const artifactRoot=process.env.LAB_ARTIFACT_DIR?pathToFileURL(resolve(process.env.LAB_ARTIFACT_DIR)+sep):new URL('./artifacts/',import.meta.url);
const directory=new URL(`${archiveId}/`,artifactRoot);
const cwd=fileURLToPath(new URL('./',import.meta.url));
const sourcePort=process.env.LAB_SOURCE_PORT||'18743';
const recoveryPort=process.env.LAB_RECOVERY_PORT||'18744';
if(![sourcePort,recoveryPort].every(port=>/^\d{1,5}$/.test(port)&&Number(port)>0&&Number(port)<=65535))throw Error('Invalid API port');

const query="SELECT COALESCE(json_agg(row_to_json(orders) ORDER BY reference), '[]'::json) FROM (SELECT reference,status,amount_cents FROM api.orders) orders";
const expected=[
  {reference:'LAB-1001',status:'paid',amount_cents:2590},
  {reference:'LAB-1002',status:'ready',amount_cents:4990},
  {reference:'LAB-1003',status:'shipped',amount_cents:8990}
];
const normalize=rows=>rows.map(({reference,status,amount_cents})=>({reference,status,amount_cents}));
const same=(first,second)=>JSON.stringify(first)===JSON.stringify(second);
const loadArchiveFile=filename=>readFile(new URL(filename,directory));

function sqlRows(service){
  const args=['compose','exec','-T',service,'psql','-XAt','-U','lab_owner','-d','orders','-v','ON_ERROR_STOP=1','-c',query];
  return normalize(JSON.parse(execFileSync('docker',args,{cwd,encoding:'utf8',timeout:15000})));
}

async function apiRows(port){
  const endpoint=`http://127.0.0.1:${port}/orders?select=reference,status,amount_cents&order=reference`;
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error(`${endpoint} returned HTTP ${response.status}; check compose logs and retry once the API is ready`);
  return {status:response.status,rows:normalize(await response.json())};
}

const [archive,checksum,rawReceipt]=await Promise.all([loadArchiveFile('orders.dump'),loadArchiveFile('orders.dump.sha256'),loadArchiveFile('restore-receipt.txt')]);
const receipt=Object.fromEntries(rawReceipt.toString().trim().split(/\r?\n/).map(line=>line.split('=')));
const digest=createHash('sha256').update(archive).digest('hex');
if(checksum.toString().trim().split(/\s+/)[0]!==digest||receipt.sha256!==digest||receipt.target!=='recovery-db')throw Error('The archive, checksum, and recovery receipt do not match');
const elapsed=(Date.parse(receipt.completed_at)-Date.parse(receipt.started_at))/1000;
if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid recovery times in receipt');

const [sourceApi,recoveryApi]=await Promise.all([apiRows(sourcePort),apiRows(recoveryPort)]);
const sourceSql=sqlRows('source-db'),recoverySql=sqlRows('recovery-db');
const recoveredReferences=new Set(recoverySql.map(row=>row.reference));
const gap=sourceSql.filter(row=>!recoveredReferences.has(row.reference)).map(row=>row.reference);
const checks={
  sourceIncident:same(sourceSql,[expected[0],{reference:'LAB-1004',status:'paid',amount_cents:3190}]),
  restoredRecords:same(recoverySql,expected),
  apiMatchesSql:same(sourceSql,sourceApi.rows)&&same(recoverySql,recoveryApi.rows),
  backupBoundary:same(gap,['LAB-1004'])
};
const report={format:'sit-ops003-evidence',version:1,archiveId,archiveSha256:digest,recordedAt:new Date().toISOString(),
  source:{http:sourceApi.status,sql:sourceSql,api:sourceApi.rows},recovery:{http:recoveryApi.status,sql:recoverySql,api:recoveryApi.rows},
  missingFromBackup:gap,restoreSeconds:elapsed,checks,verdict:Object.values(checks).every(Boolean)?'PASS':'FAIL'};
const output=new URL('ops003-evidence.json',directory);
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(`${report.verdict}: ${fileURLToPath(output)}`);
if(report.verdict==='FAIL')process.exitCode=1;
