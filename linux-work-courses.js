'use strict';

const WEB_HANDOFF_FIELDS=[
  ['impact','影响与现象','用户从哪个入口看到什么？哪个版本上线后出现？'],
  ['diagnosis','定位依据','上游配置与应用监听各是什么？哪几条输出能证明？'],
  ['recovery','恢复验证','回退到哪个版本？从本机和用户入口分别验证到了什么？'],
  ['followup','后续处理','下一次上线前要验证什么？问题交给谁继续跟进？']
];

function webEvidence(kind,match=()=>true){
  return ({events,machine})=>events.some(event=>event.kind===kind&&!event.failed&&!event.pipeline&&event.webRevision===machine.web.revision&&match(event));
}

const webResponse=(version,viaProxy,status)=>webEvidence('web-http',event=>event.version===version&&event.viaProxy===viaProxy&&event.status===status&&event.headers);
const webChange=(version,rollback,previous)=>webEvidence('web-release',event=>event.version===version&&event.rollback===rollback&&event.previous===previous);

const WEB_WORK_COURSES=[{
  id:'linux-web-release',track:'linux',group:'应用发布与故障处理',level:'进阶',title:'接管与发布：Web 上线后出现 502',
  description:'同一张工单贯穿主机接管、建立发布基线、定位代理故障、回滚与交接。',
  initial:{workload:'status-web'},
  workOrder:{id:'OPS-001',role:'应用值班工程师',service:'状态查询 API · GET /health',
    hosts:[['A · 应用主机',LAB_LOCAL,'运行 status-app，负责业务响应。'],['B · Nginx 网关',LAB_PEER,'接收用户请求，再转发给应用主机。']],
    acceptance:'从 B 的入口取得 HTTP 200，并核对响应体中的版本。发布前后各保留一份证据，异常时按工单回滚。',
    fields:WEB_HANDOFF_FIELDS,
    rows:(run,events)=>[
      {label:'恢复验证',status:'PASS'},
      ...events.filter(event=>event.kind==='web-http'&&event.status===200&&event.headers&&!event.pipeline&&event.webRevision===run.machine.web.revision).map(event=>({label:`${event.viaProxy?'用户入口':'应用本机'}：HTTP ${event.status}，版本 ${event.version}`,refs:[event.seq]})),
      {label:'v2 重新发布验证',status:'NOT RUN'}
    ]},
  recap:'已完成两台主机的发布与恢复验证。交接报告包含你的判断、验收结果、发布记录和原始命令输出，可用来复盘和设计下一次上线检查。',
  steps:[
    {
      title:'接管环境',goal:'核对 A 的主机身份、网络地址与文件系统余量，确定 B 正在接收用户请求，然后确认当前发布状态。',
      concept:'接到变更工单先认清目标。主机在线、网关在监听，只能证明基础条件，不能当成应用可用证据。',
      commands:['hostnamectl','ip -br addr','df -hT','sim b ss -lnt','sim release status'],
      checks:[['主机名、A 的地址和文件系统余量',({events,machine})=>!machine.web.current&&['hostname','addr','space'].every(kind=>events.some(event=>event.kind===kind&&!event.failed&&!event.pipeline&&!event.fromPeer))],
        ['B 的 HTTP 监听与应用尚未部署',context=>webEvidence('web-sockets',event=>event.fromPeer&&event.port===80)(context)&&webEvidence('web-release-status',event=>!event.version)(context)]],
      question:'网关已经监听 80，应用还没有部署。这时能关闭工单吗？',
      choices:['能，80 已监听就表示业务可用','不能，还要实际部署，用用户入口验证响应和版本','能，只要 A 可以 ping 通 B'],answer:1,
      feedback:'预检查确认可以开始作业。监听是一个基础条件，从用户入口取得正确响应才算业务验证。',
      example:['把监听和实际响应分开','ss 中出现 LISTEN 和 :80。','这说明端口有监听进程；它可能正常响应，也可能连接不上上游。','发布后从用户入口取得 HTTP 状态行，再核对响应体里的版本。']
    },{
      title:'发布 v1 并建立基线',goal:'部署首版 v1，核对服务状态，分别验证应用本机健康检查和网关入口。',
      concept:'sim release 是实验室的发布工具替身，完成制品切换并重启模拟服务。真实工作按团队的发布系统和变更单执行。',
      commands:['sim release deploy v1','systemctl status status-app','curl -i '+WEB_LOCAL_URL(8080),'curl -i '+WEB_PROXY_URL],
      checks:[['完成 v1 初始部署并确认服务运行',context=>webChange('v1',false,null)(context)&&webEvidence('web-app-status',event=>event.version==='v1')(context)],
        ['同一次发布下，本机与入口均返回 HTTP 200、版本 v1',context=>webResponse('v1',false,200)(context)&&webResponse('v1',true,200)(context)]],
      question:'哪份基线最适合日后判断用户入口是否恢复？',
      choices:['网关入口返回 HTTP 200 且响应体显示 v1，同时保存本机健康检查供对照','systemctl 显示 active，未请求网关','只记住部署工具提示成功'],answer:0,
      feedback:'保留同一次发布下的本机和入口结果。回滚后用同样路径复测。',
      example:['读响应状态和版本','HTTP/1.1 200 OK 与 JSON 中的 release 都被保存。','200 说明该请求成功，release 用来确认返回结果的是哪一版。','本机和用户入口都测一次，建立两条可重复的探测路径。']
    },{
      title:'发布 v2 并确认异常',goal:'工单已批准发布 v2。部署后立即从同一个网关入口复测，保留原始 HTTP 状态。',
      concept:'发布工具报告制品切换完成，只证明变更动作成功。复测出现异常时，先记录版本、请求路径与状态码，再动配置。',
      commands:['sim release deploy v2','curl -i '+WEB_PROXY_URL],
      checks:[['完成从 v1 到 v2 的发布',webChange('v2',false,'v1')],['从同一用户入口取得 HTTP 502',webResponse('v2',true,502)]],
      question:'发布结束后用户入口出现 502，现阶段可以确认什么？',
      choices:['可以确认应用进程已经退出','可以确认 DNS 查询错误','用户入口在发布后失败，根因还需要日志和分层验证'],answer:2,
      feedback:'保存原始 HTTP 结果。收到 502 说明请求到达了网关，还需要核对网关到应用这一段。',
      example:['HTTP 错误和连接失败不是同一件事','收到 HTTP 状态行，与 curl 报 Connection refused 的现象不同。','前者说明有 HTTP 服务作出了响应；后者说明客户端没有成功建立这次连接。','分开记录请求目标、是否有响应和具体状态码。']
    },{
      title:'用证据定位 502',goal:'在修改前查找哪一段连接失效。对照网关配置和日志，再验证应用实际监听与本机健康。',
      concept:'把用户到网关、网关到上游、应用进程分开看。本工单把网关错误日志送到服务日志；实际环境也可能写到独立的 error_log 文件。',
      commands:['sim b journalctl -u nginx -b','sim b cat '+WEB_PROXY_CONFIG,'ss -lnt','journalctl -u status-app -b','cat '+WEB_APP_CONFIG,'curl -i '+WEB_LOCAL_URL(8081)],
      checks:[['网关出错日志和实际转发配置相互印证',context=>webEvidence('web-proxy-log',event=>event.fromPeer&&event.mismatch)(context)&&webEvidence('web-upstream',event=>event.upstreamPort===8080)(context)],
        ['核对 A 的实际监听，并直接请求当前应用取得 v2 的 HTTP 200',context=>webEvidence('web-sockets',event=>!event.fromPeer&&event.port===8081)(context)&&webResponse('v2',false,200)(context)]],
      question:'哪组证据最能解释这次 502？',
      choices:['代理转发到 A:8080，但 v2 监听 A:8081，本机直连 8081 健康','A 上看到 active，所以代理也健康','入口报 502，因此用户机器的 DNS 一定异常'],answer:0,
      feedback:'变更后的应用监听端口与代理上游不匹配。工单要求先恢复旧版；重新发布前再评审端口契约。',
      example:['两端端口必须对应','代理记录自己尝试连接的上游地址，应用主机可以查询实际监听。','配置写了一个目标，并不代表目标真的在监听。','核对地址和端口后，直连实际监听的端口验证应用能否应答。']
    },{
      title:'回滚、复测与交接',goal:'按回滚方案恢复 v1，从本机与用户入口复测。提交影响、定位依据、验证结果和后续处理。',
      concept:'回滚切换完成与用户可用是两个检查点。交接里写明做到哪一步、凭什么得出结论，以及谁继续跟进。',
      commands:['sim release rollback','sim release status','curl -i '+WEB_LOCAL_URL(8080),'curl -i '+WEB_PROXY_URL],
      checks:[['从 v2 执行回滚并恢复 v1',webChange('v1',true,'v2')],['回滚后本机与用户入口均返回 HTTP 200、版本 v1',context=>webResponse('v1',false,200)(context)&&webResponse('v1',true,200)(context)]],
      question:'回滚后两个探测都恢复，可以怎样交接？',
      choices:['宣布 v2 已修复并直接再发','报告 v1 已恢复并附证据，v2 端口契约仍需处理','只汇报模拟发布工具显示 rollback 完成'],answer:1,
      feedback:'当前验证支持 v1 的这个健康检查已恢复；v2 仍待处理。把回滚与后续修复的结论分开写。',
      handoff:true,
      example:['恢复与修复分开记录','回滚后用户入口响应恢复。','这个结果只支持当前健康检查，不代表新版缺陷已修复，也不代表所有请求都正常。','附回滚前后的输出和待跟进项，保留下一轮验证的依据。']
    }
  ]
}];
