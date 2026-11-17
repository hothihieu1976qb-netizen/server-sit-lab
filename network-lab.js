'use strict';

// A deliberately small, deterministic two-host network. No real network calls.
const LAB_LOCAL = '192.168.10.10';
const LAB_PEER = '192.168.10.20';
const LAB_CIDR = LAB_LOCAL + '/24';
const LAB_IFACE = 'enp3s0';
const LAB_NETWORK = { address: LAB_CIDR, savedAddress: LAB_CIDR, up: true, speed: 1000, badRoute: false, peerPort: 0 };

function readLabCidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 32) return null;
  const octets = match[1].split('.').map(Number);
  if (octets.some(n => n > 255)) return null;
  const ip = octets.join('.');
  if (ip === LAB_PEER || ip === '192.168.10.1' || octets[0] === 0 || octets[0] === 127 || octets[0] >= 224) return null;
  return { ip, prefix: Number(match[2]) };
}

function labAddressNumber(ip) {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function labSubnet(address) {
  const block = 2 ** (32 - address.prefix);
  const network = Math.floor(labAddressNumber(address.ip) / block) * block;
  return [24, 16, 8, 0].map(shift => (network >>> shift) & 255).join('.') + '/' + address.prefix;
}

function startLabNetworkBoot(machine) {
  appendLabLog(machine, 'kernel: boot '+machine.boot+' Linux '+kernelRelease(machine),'kernel');
  if(!machine.nicBound)return;
  appendLabLog(machine, 'simnic: '+LAB_IFACE+' registered; '+(machine.speed?'link up '+machine.speed+' Mbps Full Duplex':'carrier lost'),'kernel');
  if (!machine.up) appendLabLog(machine, `network: ${LAB_IFACE} administratively DOWN`);
  appendLabLog(machine, `network: ${LAB_IFACE}: ${machine.address ? 'configured ' + machine.address : 'no IPv4 address configured'}`);
  if (machine.badRoute) appendLabLog(machine, `network: host route ${LAB_PEER}/32 via 192.168.10.254`);
}

function labNetworkState(machine) {
  const address = machine.nicBound?readLabCidr(machine.address):null;
  return {
    missing: !machine.nicBound, up: machine.up, carrier: machine.nicBound&&Boolean(machine.speed), ip: address?.ip || null,
    prefix: address?.prefix, subnet: address && labSubnet(address), speed: machine.speed,
    route: !machine.badRoute, fixed: false, networkFault: machine.speed ? 'none' : 'cable',
    customRoute: true, neighbor: machine.neighbor, rxErrors:machine.rxErrors,stats:machine.netStats
  };
}

function labPath(machine, target, fromPeer = false) {
  if(fromPeer&&target===LAB_PEER)return {ok:true,local:true};
  const address = readLabCidr(machine.address);
  if (machine.nicBound&&!fromPeer && address?.ip === target) return { ok: true, local: true };
  if (!machine.nicBound) return {ok:false,reason:'no-interface'};
  if (!machine.up) return { ok: false, reason: 'interface-down' };
  if (!machine.speed) return { ok: false, reason: 'no-carrier' };
  if (!address) return { ok: false, reason: 'no-ip' };
  if ((fromPeer && target !== address.ip) || (!fromPeer && target !== LAB_PEER)) return { ok: false, reason: 'unknown-peer' };
  const forwardMatches = labSubnet(address) === labSubnet({ ip: LAB_PEER, prefix: address.prefix });
  const returnMatches = labSubnet({ ip: address.ip, prefix: 24 }) === '192.168.10.0/24';
  if (machine.badRoute || !forwardMatches || !returnMatches) return { ok: false, reason: 'route' };
  return { ok: true };
}

const LAB_PATH_ERRORS = {
  'no-interface':'Network is unreachable',
  'interface-down': 'Network is down',
  'no-carrier': 'Destination Host Unreachable',
  'no-ip': 'Network is unreachable',
  'unknown-peer': 'Destination Host Unreachable',
  route: 'Destination Host Unreachable'
};

function runLabNetworkCommand(machine, segment) {
  const {command, positionals: args, opts, fromB} = segment;
  const net = labNetworkState(machine);
  const bad = message => ({ output: message, failed: true });
  const ok = (output, kind) => ({ output, kind });
  if (command === 'ip') {
    const [sub, action, value, dev, name] = args;
    if(!fromB&&sub==='route'&&action==='get'&&value===LAB_PEER&&args.length===3){
      if(!net.ip||!machine.up)return bad('RTNETLINK answers: Network is unreachable');
      const path=labPath(machine,LAB_PEER);
      const hop=machine.badRoute?' via 192.168.10.254':'';
      if(!path.ok&&!hop)return bad('RTNETLINK answers: Network is unreachable');
      return {...ok(LAB_PEER+hop+' dev '+LAB_IFACE+' src '+net.ip,'route-lookup'),wrong:machine.badRoute};
    }
    if (args.length === 1 && ['link', 'addr', 'route', 'neigh'].includes(sub)) {
      const endpoint = fromB ? {...LAB_NETWORK, ip:LAB_PEER, prefix:24, subnet:'192.168.10.0/24', carrier:true, route:true, customRoute:true} : net;
      return {...ok(ipOutput(segment.words.slice(1), fromB, endpoint, false), fromB ? undefined : sub),present:!endpoint.missing};
    }
    if (fromB) return bad('ip: peer configuration is read-only');
    if(!machine.nicBound)return bad('Cannot find device enp3s0');
    if (sub === 'addr' && ['add', 'del'].includes(action) && args.length === 5 && dev === 'dev' && name === LAB_IFACE) {
      const addr = readLabCidr(value);
      if (!addr) return bad('ip: invalid or reserved IPv4 address/prefix');
      const cidr = addr.ip + '/' + addr.prefix;
      if (action === 'add' && machine.address) return bad('RTNETLINK answers: virtual interface already has an IPv4 address; delete it first');
      if (action === 'del' && machine.address !== cidr) return bad('RTNETLINK answers: Cannot assign requested address');
      machine.address = action === 'add' ? cidr : '';
      machine.neighbor = '';
      appendLabLog(machine, `ip: ${LAB_IFACE}: ${action === 'add' ? 'added ' : 'removed '}${cidr} (runtime only)`);
      return ok('', 'runtime-change');
    }
    if (sub === 'link' && action === 'set' && value === 'dev' && dev === LAB_IFACE && ['up', 'down'].includes(name) && args.length === 5) {
      machine.up = name === 'up';
      machine.neighbor = '';
      appendLabLog(machine, `ip: ${LAB_IFACE}: admin state ${name.toUpperCase()}`);
      return ok('', 'link-change');
    }
    return bad('ip: unsupported simulated action; see command examples');
  }
  if (command === 'ethtool') {
    if (args[0] !== LAB_IFACE||!machine.nicBound) return bad('Cannot get device settings: No such device');
    if(opts['-S'])return {...ok('NIC statistics:\n     rx_packets: '+machine.netStats.rxPackets+'\n     tx_packets: '+machine.netStats.txPackets+'\n     rx_crc_errors: '+machine.rxErrors+'\n     rx_dropped: '+machine.netStats.rxDropped,'nic-stats'),rxErrors:machine.rxErrors};
    if(opts['-i'])return {...ok('driver: simnic\nversion: 1.0\nfirmware-version: simnic-fw-1.0\nbus-info: 0000:03:00.0\nbuild-id: '+machine.loadedDriverBuilds.simnic,'driver')};
    return {...ok(ethtoolOutput(segment.words.slice(1), net, false), opts['-i'] ? 'driver' : opts['-S'] ? 'nic-stats' : 'carrier'),speed:machine.speed};
  }
  if (command === 'ping') {
    const count = Number(opts['-c'] || 4);
    if (!Number.isInteger(count) || count < 1 || count > 10) return bad('ping: invalid count (simulated range 1-10)');
    const target = args[0], path = labPath(machine, target);
    if (!path.ok) return { ...bad('ping: ' + LAB_PATH_ERRORS[path.reason]), kind: 'ping', target, reason: path.reason };
    if (!path.local) machine.neighbor = LAB_PEER+' dev enp3s0 lladdr 02:51:54:00:10:20 REACHABLE';
    return { ...ok(`PING ${target}\n` + Array.from({ length: count }, (_, i) => `64 bytes from ${target}: icmp_seq=${i + 1} ttl=64 time=0.30 ms`).join('\n') + `\n${count} packets transmitted, ${count} received, 0% packet loss`, 'ping'), target };
  }
  if (command === 'iperf3') {
    const port = Number(opts['-p'] || 5201);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return bad('iperf3: invalid port');
    if (opts['-s'] && !opts['-c']) {
      if (opts['-u'] || opts['-R'] || opts['-t'] || opts['-P'] || opts['-b']) return bad('iperf3: client-only options cannot be used with -s');
      if(!fromB&&machine.servicePort===port)return bad('iperf3: unable to listen: Address already in use');
      machine[fromB ? 'peerPort' : 'localPort'] = port;
      appendLabLog(machine, `iperf3: ${fromB ? 'B' : 'A'} listening on TCP port ${port}`);
      return ok(`Server listening on ${port} (host ${fromB ? 'B' : 'A'})`, 'listen');
    }
    const target = opts['-c'];
    if (!target || opts['-s']) return bad('iperf3: use -s or -c IP');
    const seconds = Number(opts['-t'] || 10), streams = Number(opts['-P'] || 1);
    if (!numberIn(seconds, 1, 3600) || !Number.isInteger(streams) || !numberIn(streams, 1, 16)) return bad('iperf3: invalid duration or stream count');
    const path = labPath(machine, target, fromB), listener = path.local?(fromB?machine.peerPort:machine.localPort):fromB?machine.localPort:machine.peerPort;
    if (!path.ok) return { ...bad('iperf3: ' + LAB_PATH_ERRORS[path.reason]), kind: 'transfer', target, reason: path.reason };
    if (!path.local) machine.neighbor = LAB_PEER+' dev enp3s0 lladdr 02:51:54:00:10:20 REACHABLE';
    if (listener !== port) return { ...bad('iperf3: Connection refused'), kind: 'transfer', target, reason: 'no-listener' };
    const udp=Boolean(opts['-u']), targetRate=opts['-b'] ? netMbps(opts['-b']) : udp?1:null;
    if(opts['-b']&&(!targetRate||targetRate>100000))return bad('iperf3: invalid target bitrate');
    const pathSpeed=Math.min(machine.speed,machine.pathLimit||1000);
    const cap=path.local?4200:pathSpeed*.94, offered=targetRate===null?null:targetRate*streams;
    const tcpCap=path.local?cap:Math.min(pathSpeed*.95,cap+(streams-1)*1.5);
    const affected=machine.crcFault&&!path.local&&(fromB!==Boolean(opts['-R']));
    const retries=udp?0:!path.local&&machine.tcpFault?280:affected?92:0;
    const rate=(udp?Math.min(offered,cap):offered===null?tcpCap:Math.min(offered,tcpCap))*(affected?.76:1)*(!path.local&&machine.tcpFault&&!udp?.62:1)*(!path.local&&machine.udpFault&&udp?.92:1);
    if(affected)machine.rxErrors+=Math.ceil(seconds*3);
    const total=udp?Math.round(seconds*offered*1e6/(1460*8)):0, lost=udp?Math.round(total*(1-rate/offered)):0;
    const loss=total?Number((lost/total*100).toFixed(2)):0;
    if(!path.local){
      const receive=fromB!==Boolean(opts['-R']),side=receive?'rx':'tx';
      machine.netStats[side+'Bytes']+=Math.round(rate*seconds*1e6/8);machine.netStats[side+'Packets']+=Math.round(rate*seconds*1e6/(1460*8));
      if(receive&&machine.udpFault)machine.netStats.rxDropped+=lost;
      machine.netStats.tcpRetrans+=retries;
      if(retries||loss)appendLabLog(machine,'network-monitor: '+(udp?'UDP receiver loss='+loss+'%':'TCP retransmissions='+retries));
    }
    const source=fromB?LAB_PEER:net.ip, direction=opts['-R']?target+' -> '+source:source+' -> '+target;
    const summary=udp?'UDP offered: '+offered+' Mbits/sec\nUDP: Lost/Total='+lost+'/'+total+', Lost%='+loss+'%, Jitter='+(lost?1.82:.12)+' ms':'TCP: Retr='+retries+', parallel='+streams;
    const output='Connecting to host '+target+', port '+port+'\n[SUM] 0.00-'+seconds.toFixed(2)+' sec '+(rate*seconds/8).toFixed(1)+' MBytes '+rate.toFixed(1)+' Mbits/sec receiver\n'+summary+'\nDirection: '+direction;
    advanceMachineTime(machine,seconds);
    return {...ok(output,'transfer'),direction,local:Boolean(path.local),total,lost,jitter:udp?(lost?1.82:.12):0,target,rate,udp,offered,loss,retries,port,seconds,streams,reverse:Boolean(opts['-R']),fromB};
  }
  if (command === 'ss' || command === 'sim' && args[0] === 'peer' && args[1] === 'ss' && args.length === 2) {
    const port = command === 'ss' ? machine.localPort : machine.peerPort;
    const agent=command==='ss'&&machine.servicePort?'\ntcp LISTEN 0.0.0.0:'+machine.servicePort+' sit-agent':'';
    return {...ok('Netid State Local Address:Port Process'+(port?'\ntcp LISTEN 0.0.0.0:'+port+' iperf3':'')+agent,'sockets'),agentPort:command==='ss'?machine.servicePort:undefined};
  }
  if (command === 'sim' && args[0] === 'peer' && args[1] === 'stop' && args.length === 2) {
    machine.peerPort = 0;
    appendLabLog(machine, 'iperf3: B listener stopped');
    return ok('Stopped virtual iperf3 server on host B', 'listener-stop');
  }
  if (command === 'sim' && args[0] === 'save-ip' && args.length === 2) {
    const addr = readLabCidr(args[1]);
    if (!addr && args[1] !== 'none') return bad('sim: supply IPv4/prefix or none');
    machine.savedAddress = addr ? addr.ip + '/' + addr.prefix : '';
    appendLabLog(machine, `config: saved ${machine.savedAddress || 'empty IPv4 configuration'} for next boot`);
    return ok('Persistent IPv4 configuration saved (applies on reboot)', 'save-ip');
  }
  if (command === 'cat' && args[0] === '/etc/sysconfig/network-scripts/ifcfg-enp3s0') {
    const addr = readLabCidr(machine.savedAddress);
    return ok('DEVICE=enp3s0\nONBOOT=yes\nBOOTPROTO=none' + (addr ? `\nIPADDR=${addr.ip}\nPREFIX=${addr.prefix}` : ''), 'config');
  }
  if (command === 'reboot' && !args.length) {
    const boot=rebootPracticeMachine(machine);
    return ok('Reboot completed (simulated), boot=' + boot, 'reboot');
  }
  if (command === 'dmesg' || command === 'journalctl') {
    const previousBoot=opts['-b']==='-1';
    const kernelOnly=command==='dmesg'||Boolean(opts['-k']);
    const all=previousBoot?machine.previous:machine.journal;
    const unit=opts['-u']?LAB_AGENT:null;
    const entries=all.filter(entry=>(!kernelOnly||entry.transport==='kernel')&&(!unit||entry.unit===unit)).map(entry=>entry.message);
    return {...ok(entries.join('\n') || '-- No entries --', 'logs'),previousBoot,kernelOnly,unit};
  }
  if (command === 'uname') return ok('Linux sit-server-01 4.19.90-sit.sim x86_64 GNU/Linux','kernel');
  if (command === 'clear' || command === 'help') return ok('');
  return bad(command + ': unavailable in this simulator; see help');
}
