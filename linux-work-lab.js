'use strict';

const WEB_RELEASES={v1:8080,v2:8081};
const WEB_UNIT='status-app.service';
const WEB_PROXY_CONFIG='/etc/nginx/conf.d/status.conf';
const WEB_APP_CONFIG='/etc/status-app.env';
const WEB_PROXY_URL='http://'+LAB_PEER+'/health';
const WEB_LOCAL_URL=port=>'http://127.0.0.1:'+port+'/health';

function createWebWorkload(){
  return {current:null,previous:null,upstreamPort:8080,revision:0,proxyJournal:[{message:'nginx: listening on 0.0.0.0:80'}]};
}

function logWebAppStart(machine){
  const version=machine.web.current;
  const web=machine.web;
  if(web.configPort!==undefined){
    web.revision++;
    web.failed=!/^\d+$/.test(web.configPort)||Number(web.configPort)<1||Number(web.configPort)>65535;
    web.exitCode=web.failed?78:0;
    web.runningPort=web.failed?0:Number(web.configPort);
    if(web.failed){
      appendLabLog(machine,'status-app: invalid APP_PORT="'+web.configPort+'"; expected integer 1..65535','system',WEB_UNIT);
      appendLabLog(machine,'systemd: status-app.service: Main process exited, code=exited, status=78/CONFIG','system',WEB_UNIT);
      return;
    }
  }
  appendLabLog(machine,'status-app: release='+version+' listening on 0.0.0.0:'+(web.runningPort??WEB_RELEASES[version]),'system',WEB_UNIT);
}

function runWebWorkCommand(machine,segment){
  const {command,positionals:args,opts,fromB}=segment;
  const [action,target,value]=args;
  const web=machine.web;
  const releaseCommand=command==='sim'&&action==='release';
  const appUnit=['status-app',WEB_UNIT];
  const webCommand=releaseCommand||command==='sim'&&action==='app-port'||command==='curl'||command==='systemctl'&&appUnit.includes(target)||command==='journalctl'&&[...appUnit,'nginx','nginx.service'].includes(opts['-u'])||command==='cat'&&[WEB_PROXY_CONFIG,WEB_APP_CONFIG].includes(action)||fromB&&['ss','cat','journalctl'].includes(command);
  if(!web)return webCommand?modelError(command+': target unavailable in this workspace','web-unavailable','unavailable'):null;
  const version=web.current,port=version?(web.runningPort??WEB_RELEASES[version]):0;
  const result=(output,kind,extra)=>modelResult(output,kind,{webRevision:web.revision,version,...extra});
  if(command==='systemctl'&&(opts['--failed']||action==='list-units')){
    const rows=[];
    if(machine.serviceStatus==='failed'||!opts['--failed'])rows.push('sit-agent.service loaded '+(machine.serviceStatus==='failed'?'failed failed':'active running'));
    if(version&&(web.failed||!opts['--failed']))rows.push(WEB_UNIT+' loaded '+(web.failed?'failed failed':'active running'));
    if(!machine.mounted&&machine.journal.some(entry=>entry.message.includes('/mnt/sit: UUID=')))rows.push('mnt-sit.mount loaded failed failed');
    return result('UNIT LOAD ACTIVE SUB\n'+rows.join('\n')+'\n'+rows.length+' loaded units listed','units');
  }
  if(command==='sim'&&action==='app-port'&&args.length===2&&web.configPort!==undefined){
    if(!/^\d+$/.test(target)||Number(target)<1||Number(target)>65535)return modelError('app-port: expected integer 1..65535','web-config','arguments');
    web.configPort=target;
    web.revision++;
    return result('Saved APP_PORT='+target,'web-config',{configPort:target});
  }
  if(command==='systemctl'&&action==='restart'&&appUnit.includes(target)&&args.length===2){
    if(!version)return modelError('Unit '+WEB_UNIT+' could not be found.','web-restart','unit-not-found',4);
    logWebAppStart(machine);
    return {...result(web.failed?'Job for status-app.service failed because the control process exited with error code.':'','web-restart',{processExitCode:web.exitCode||0,active:!web.failed}),failed:Boolean(web.failed),exitCode:web.failed?1:0};
  }
  if(releaseCommand){
    if(target==='status'&&args.length===2)return result('current: '+(version||'none')+'\nprevious: '+(web.previous||'none'),'web-release-status');
    const rollback=target==='rollback'&&args.length===2;
    const deploy=target==='deploy'&&args.length===3&&Object.hasOwn(WEB_RELEASES,value);
    if(!rollback&&!deploy)return modelError('usage: sim release status | deploy v1 | deploy v2 | rollback','web-release','arguments');
    const next=rollback?web.previous:value;
    if(!next)return modelError('release: no previous deployment','web-release','no-previous-release');
    if(next===version)return modelError('release: '+version+' is already running','web-release','same-release');
    web.previous=version;
    web.current=next;
    web.revision++;
    logWebAppStart(machine);
    return modelResult((rollback?'Rolled back to ':'Deployed ')+next+'; '+WEB_UNIT+' restarted','web-release',{version:next,previous:version,rollback,webRevision:web.revision});
  }
  if(command==='systemctl'&&action==='status'&&appUnit.includes(target)&&args.length===2){
    if(web.failed)return {...result('● '+WEB_UNIT+' - Status API\n   Loaded: loaded (/etc/systemd/system/'+WEB_UNIT+'; enabled)\n   Active: failed (Result: exit-code)\n   Main PID: '+(810+web.revision)+' (code=exited, status='+web.exitCode+'/CONFIG)','web-app-status',{port:0,active:false,processExitCode:web.exitCode}),failed:true,exitCode:3};
    return version?result('● '+WEB_UNIT+' - Status API\n   Loaded: loaded (/etc/systemd/system/'+WEB_UNIT+'; enabled)\n   Active: active (running)\n   Main PID: '+(810+web.revision)+' (status-app)','web-app-status',{port})
      :{...modelError('Unit '+WEB_UNIT+' could not be found.','web-app-status','unit-not-found',4),webRevision:web.revision,version};
  }
  if(command==='ss'){
    const rows=['State  Recv-Q Send-Q Local Address:Port Peer Address:Port'];
    if(!opts['-l']||opts['-u']&&!opts['-t'])return result(rows.join('\n'),'web-sockets',{port:0});
    const listen=(tcpPort,queue,process)=>rows.push('LISTEN 0      '+queue+'    0.0.0.0:'+tcpPort+'       0.0.0.0:*'+(opts['-p']?' users:(("'+process+'"))':''));
    if(fromB)listen(80,511,'nginx');
    else{
      if(machine.servicePort)listen(machine.servicePort,128,'sit-agent');
      if(port)listen(port,128,'status-app');
    }
    const iperfPort=fromB?machine.peerPort:machine.localPort;
    if(iperfPort)listen(iperfPort,4096,'iperf3');
    return result(rows.join('\n'),'web-sockets',{port:fromB?80:port});
  }
  if(command==='cat'&&action===WEB_PROXY_CONFIG&&fromB){
    return result('server {\n    listen 80;\n    location / {\n        proxy_pass http://'+LAB_LOCAL+':'+web.upstreamPort+';\n    }\n}','web-upstream',{upstreamPort:web.upstreamPort});
  }
  if(command==='cat'&&action===WEB_APP_CONFIG&&!fromB){
    return version?result('APP_PORT='+(web.configPort??port)+'\nAPP_RELEASE='+version,'web-app-config',{port,configPort:web.configPort??String(port)})
      :modelError('cat: '+WEB_APP_CONFIG+': No such file or directory','web-app-config','no-file');
  }
  if(command==='journalctl'&&opts['-u']){
    const unit=opts['-u'];
    const previous=opts['-b']==='-1',kernelOnly=Boolean(opts['-k']);
    if(fromB&&['nginx','nginx.service'].includes(unit)){
      const lines=previous||kernelOnly?[]:web.proxyJournal;
      const mismatch=lines.some(entry=>entry.refused&&entry.revision===web.revision);
      return result(lines.map(entry=>entry.message).join('\n')||'-- No entries --','web-proxy-log',{mismatch});
    }
    if(!fromB&&appUnit.includes(unit)){
      const lines=(previous?machine.previous:machine.journal).filter(entry=>entry.unit===WEB_UNIT&&!kernelOnly).map(entry=>entry.message);
      return result(lines.join('\n')||'-- No entries --','web-app-log',{previousBoot:previous,kernelOnly});
    }
  }
  if(command==='curl'){
    const local=[8080,8081].find(candidate=>action===WEB_LOCAL_URL(candidate));
    const viaProxy=action===WEB_PROXY_URL;
    if(!viaProxy&&!local)return modelError('curl: supported simulated target is /health on the application host or gateway','web-http','unsupported-target',3);
    if(viaProxy){
      const frontPath=labPath(machine,LAB_PEER);
      if(!frontPath.ok)return modelError('curl: (7) Failed to connect to '+LAB_PEER+': '+LAB_PATH_ERRORS[frontPath.reason],'web-http',frontPath.reason,7);
      const backPath=labPath(machine,LAB_LOCAL,true);
      if(!backPath.ok||port!==web.upstreamPort){
        const reason=backPath.ok?'(111: connection refused)':'(113: no route to host)';
        web.proxyJournal.push({message:'nginx: connect() failed '+reason+' while connecting to upstream, request: "GET /health HTTP/1.1", upstream: "http://'+LAB_LOCAL+':'+web.upstreamPort+'/health"',refused:backPath.ok,revision:web.revision});
        if(web.proxyJournal.length>40)web.proxyJournal.shift();
        const body='<html><title>502 Bad Gateway</title><h1>502 Bad Gateway</h1></html>';
        return result((opts['-i']?'HTTP/1.1 502 Bad Gateway\nServer: nginx\nContent-Type: text/html\n\n':'')+body,'web-http',{viaProxy,status:502,headers:Boolean(opts['-i'])});
      }
    }else if(local!==port){
      return modelError('curl: (7) Failed to connect to 127.0.0.1 port '+local+': Connection refused','web-http','no-listener',7);
    }
    const body=JSON.stringify({status:'ok',release:version});
    return result((opts['-i']?'HTTP/1.1 200 OK\nContent-Type: application/json\n\n':'')+body,'web-http',{viaProxy,status:200,port,headers:Boolean(opts['-i'])});
  }
  return webCommand?modelError(command+': target unavailable on this host','web-unavailable','unavailable'):null;
}
