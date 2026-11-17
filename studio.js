'use strict';
// Presentation only. The simulator, evidence and course state remain owned by their existing modules.
function studioIcon(name, extra = '') {
  return `<svg class="studio-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LAB_ICONS[name] || LAB_ICONS.layers}</svg>`;
}

function studioCourseStyle(course) {
  const text = course.group + course.id;
  if (/网络|network|nic/.test(text)) return { kind:'network', icon:'network', name:'NETWORK SYSTEMS', hue:'blue' };
  if (/存储|磁盘|fio|hba/.test(text)) return { kind:'storage', icon:'hard-drive', name:'STORAGE & I/O', hue:'violet' };
  if (/稳定性|资源|cpu|memory/.test(text)) return { kind:'compute', icon:'activity', name:'COMPUTE & STABILITY', hue:'amber' };
  if (/交付|回归|acceptance/.test(text)) return { kind:'workflow', icon:'workflow', name:'QUALITY ENGINEERING', hue:'mint' };
  return { kind:'system', icon:'cpu', name:'SYSTEM FOUNDATIONS', hue:'lime' };
}

function studioCourseArt(kind) {
  const frame = '<g class="art-grid"><path d="M0 20H340M0 60H340M0 100H340M0 140H340M20 0V160M60 0V160M100 0V160M140 0V160M180 0V160M220 0V160M260 0V160M300 0V160"/></g>';
  let art;
  if (kind === 'network') art = '<path class="art-wire" d="M24 90H90L125 54H205L246 95H317M166 54V126H247"/><g class="art-nodes"><rect x="134" y="31" width="64" height="45" rx="8"/><rect x="43" y="72" width="36" height="36" rx="7"/><rect x="247" y="78" width="36" height="36" rx="7"/><rect x="230" y="113" width="27" height="27" rx="5"/></g><path d="M146 46h39m-39 12h20"/><circle class="signal-dot" cx="90" cy="90" r="4"/>';
  else if (kind === 'storage') art = '<g class="art-isometric"><path d="m100 38 86-22 69 33-85 23Z"/><path d="m100 38 70 34 85-23v22l-85 24-70-34Z"/><path d="m100 76 70 34 85-23v22l-85 24-70-34Z"/><path d="m100 113 70 34 85-23"/><path class="art-highlight" d="m114 54 37 18m-37 20 37 18m34-27 50-14m-50 52 50-14"/></g>';
  else if (kind === 'compute') art = '<path class="art-wire" d="M14 103h44l15-24 16 45 22-81 19 61h29l18-36 14 35h33l14-49 17 76 18-27h54"/><path class="art-baseline" d="M15 134h309"/><g class="art-nodes"><circle cx="112" cy="43" r="5"/><circle cx="238" cy="54" r="5"/></g>';
  else if (kind === 'workflow') art = '<path class="art-wire" d="M42 80h65l28-35h65l28 35h72M107 80l28 35h65l28-35"/><g class="art-nodes"><rect x="26" y="64" width="32" height="32" rx="8"/><rect x="150" y="29" width="32" height="32" rx="8"/><rect x="150" y="99" width="32" height="32" rx="8"/><circle cx="282" cy="80" r="19"/></g><path class="art-highlight" d="m273 80 6 6 12-12"/>';
  else art = '<g class="art-chip"><rect x="119" y="30" width="102" height="102" rx="11"/><rect x="137" y="48" width="66" height="66" rx="5"/><path d="M135 14v16m17-16v16m18-16v16m18-16v16m17-16v16M135 132v16m17-16v16m18-16v16m18-16v16m17-16v16M103 46h16m-16 18h16m-16 18h16m-16 18h16m-16 16h16M221 46h16m-16 18h16m-16 18h16m-16 18h16m-16 16h16"/><path class="art-highlight" d="m157 69-10 11 10 11m26-22 10 11-10 11m-11-24-6 27"/></g>';
  return `<svg viewBox="0 0 340 160" class="course-art" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${frame}${art}</svg>`;
}

function studioServerArt() {
  const tier = (y, key, label, color) => `<g class="rack-tier rack-${key}" style="--tier-color:${color}"><path class="rack-top" d="M124 ${y} 310 ${y-74} 498 ${y-6} 312 ${y+72}Z"/><path class="rack-face" d="M124 ${y} 312 ${y+72} 312 ${y+108} 124 ${y+36}Z"/><path class="rack-side" d="M312 ${y+72} 498 ${y-6} 498 ${y+30} 312 ${y+108}Z"/><path class="rack-edge" d="m124 ${y} 188 72 186-78"/><g class="rack-vents">${Array.from({length:11},(_,i)=>`<path d="m${141+i*11} ${y+14+i*4.2}v13"/>`).join('')}</g><path class="rack-slot" d="m339 ${y+74} 54-22v11l-54 22Z"/><path class="rack-slot" d="m406 ${y+46} 54-22v11l-54 22Z"/><circle class="rack-led" cx="479" cy="${y+12}" r="3"/><path class="rack-board" d="m209 ${y-6} 99-39 99 36-99 41Z"/><path class="rack-board-in" d="m253 ${y-6} 55-22 54 20-54 23Z"/><text class="rack-word" transform="translate(281 ${y-9}) rotate(21)">${label}</text></g>`;
  return `<div class="server-scene" id="server-scene"><div class="scene-top"><span><i class="status-dot"></i> SIMULATED INFRASTRUCTURE</span><button data-studio="explode" class="scene-toggle" aria-pressed="false">${studioIcon('layers')}<span>拆解视图</span></button></div><div class="scene-orbit"></div><div class="server-tilt"><svg class="server-blueprint" viewBox="0 0 620 440" fill="none" aria-label="模拟服务器架构：计算、存储与网络三层"><defs><linearGradient id="rack-top-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#333e42"/><stop offset="1" stop-color="#131c22"/></linearGradient><linearGradient id="rack-face-fill"><stop stop-color="#19242b"/><stop offset="1" stop-color="#0b1216"/></linearGradient><radialGradient id="rack-glow"><stop stop-color="#bded72" stop-opacity=".2"/><stop offset="1" stop-color="#bded72" stop-opacity="0"/></radialGradient></defs><ellipse cx="313" cy="315" rx="235" ry="104" fill="url(#rack-glow)"/><g class="floor-grid"><path d="m0 290 320-130 300 110M0 330l320-130 300 110M0 370l320-130 300 110M0 410l320-130 300 110M90 440 0 405m0-160 500 195M80 210l540 197M160 177l460 168M250 144l370 135"/></g><path class="rack-floor" d="m110 287 200-78 204 77-202 84Z"/>${tier(233,'network','LINK','#78b8f8')}${tier(177,'storage','I/O','#b8a1f8')}${tier(121,'compute','CPU','#c6f68b')}<g class="rack-callouts"><path d="M135 126H57v-32M486 205h81v-32M124 271H55v39"/><circle cx="135" cy="126" r="3"/><circle cx="486" cy="205" r="3"/><circle cx="124" cy="271" r="3"/><text x="28" y="83">COMPUTE</text><text x="520" y="160">STORAGE</text><text x="25" y="328">NETWORK</text></g></svg></div><div class="scene-foot"><span>KYLIN V10 <i>/</i> x86_64</span><span>架构示意 · 非实时监控</span></div></div>`;
}

function studioPageChanged() {
  document.body.dataset.workspace = S.page;
  document.body.classList.remove('nav-open');
  document.querySelector('.sidebar-scrim').hidden = true;
  document.querySelector('.menu-toggle').setAttribute('aria-expanded','false');
  document.querySelectorAll('.sidebar-tools [data-go]').forEach(b => b.classList.toggle('active',b.dataset.go===S.page));
  studioSceneObserver.disconnect();
  const scene=document.getElementById('server-scene');
  if(scene&&S.page==='home')studioSceneObserver.observe(scene);
  const view = document.getElementById('view-'+S.page);
  if (!document.body.classList.contains('motion-off') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    view.getAnimations().forEach(a=>a.cancel());
    view.animate([{opacity:.2,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.3,1)'});
  }
}

const studioSceneObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>entry.target.classList.toggle('scene-paused',!entry.isIntersecting));
},{threshold:0});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('page-idle',document.hidden));

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=studioIcon(el.dataset.icon));
  const dialog=document.getElementById('studio-search'), input=document.getElementById('studio-search-input');
  let returnFocus=null, selected=0, results=[];
  const saved=localStorage.getItem('sit-studio-motion');
  let motionOff=saved===null?matchMedia('(prefers-reduced-motion: reduce)').matches:saved==='off';
  function updateMotion(){
    document.body.classList.toggle('motion-off',motionOff);
    const b=document.querySelector('[data-studio="motion"]');
    b.setAttribute('aria-pressed',String(motionOff));
    b.title=motionOff?'开启动效':'关闭装饰动效';b.setAttribute('aria-label',b.title);
    b.innerHTML=studioIcon(motionOff?'pause':'sparkles');
  }
  updateMotion();
  function paintResults(){
    const q=input.value.trim().toLowerCase();
    const courses=GUIDED_COURSES.map(c=>({label:c.title,note:c.group+' · '+(c.level==='基础'?'初级':'中级'),id:c.id,course:true,icon:studioCourseStyle(c).icon}));
    const tools=navItems.filter(n=>!['home','lesson'].includes(n[0])).map(n=>({label:n[2],note:'工作空间',id:n[0],icon:n[0]==='terminal'?'terminal':'arrow-up-right'}));
    results=[...courses,...tools].filter(x=>(x.label+' '+x.note+' '+x.id).toLowerCase().includes(q)).slice(0,12);
    selected=0;
    document.getElementById('studio-search-results').innerHTML=results.length?results.map((r,i)=>`<button data-search-index="${i}" class="search-item ${i===0?'selected':''}">${studioIcon(r.icon)}<span>${esc(r.label)}<small>${esc(r.note)}</small></span>${studioIcon('arrow-up-right')}</button>`).join(''):'<div class="search-empty">没有找到匹配内容。试试“网络”“存储”或“fio”。</div>';
  }
  function openSearch(){
    if(assessmentActive()){toast('独立考核中暂不开放课程搜索；交卷后可使用。');return;}
    returnFocus=document.activeElement;input.value='';paintResults();dialog.showModal();input.focus();
  }
  function chooseResult(index){
    const r=results[index];if(!r)return;
    dialog.close();r.course?startGuided(false,r.id):showPage(r.id);
  }
  input.addEventListener('input',paintResults);
  dialog.addEventListener('close',()=>returnFocus?.focus({preventScroll:true}));
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('[data-search-index]');if(b)chooseResult(Number(b.dataset.searchIndex));
    if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}
  });
  dialog.addEventListener('keydown',e=>{
    if(['ArrowDown','ArrowUp'].includes(e.key)&&results.length){
      e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;
      dialog.querySelectorAll('[data-search-index]').forEach((b,i)=>b.classList.toggle('selected',i===selected));
      dialog.querySelector(`[data-search-index="${selected}"]`).scrollIntoView({block:'nearest'});
    }
    if(e.key==='Enter'&&e.target===input){e.preventDefault();chooseResult(selected);}
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():openSearch();}
    if(e.key==='Escape'&&document.body.classList.contains('nav-open'))document.querySelector('[data-studio="menu-close"]').click();
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-studio]');if(!b)return;
    switch(b.dataset.studio){
      case 'search':openSearch();break;
      case 'motion':motionOff=!motionOff;localStorage.setItem('sit-studio-motion',motionOff?'off':'on');updateMotion();break;
      case 'focus':{
        const on=document.body.classList.toggle('studio-focus');b.setAttribute('aria-pressed',String(on));b.title=on?'退出专注布局':'进入专注布局';b.setAttribute('aria-label',b.title);b.innerHTML=studioIcon(on?'minimize':'expand');break;
      }
      case 'menu':case 'menu-close':{
        const on=b.dataset.studio==='menu'&&!document.body.classList.contains('nav-open');
        document.body.classList.toggle('nav-open',on);document.querySelector('.sidebar-scrim').hidden=!on;document.querySelector('.menu-toggle').setAttribute('aria-expanded',String(on));break;
      }
      case 'explode':{
        const on=document.getElementById('server-scene').classList.toggle('exploded');b.setAttribute('aria-pressed',String(on));b.innerHTML=studioIcon('layers')+'<span>'+(on?'合拢机架':'拆解视图')+'</span>';break;
      }
      case 'catalog':document.getElementById('course-catalog').scrollIntoView({behavior:motionOff?'instant':'smooth',block:'start'});break;
      case 'clear-filter':document.getElementById('catalog-search').value='';document.getElementById('catalog-level').value='';document.getElementById('catalog-topic').value='';S.ui.catalogLevel='';S.ui.catalogTopic='';filterGuidedCatalog();break;
    }
  });
  document.addEventListener('input',e=>{if(e.target.id==='catalog-search')filterGuidedCatalog();});
  // Pointer effects only update the hovered visual; there is no global animation loop.
  let pointerFrame=0;
  document.addEventListener('pointermove',e=>{
    if(motionOff||e.pointerType!=='mouse'||pointerFrame)return;
    const scene=e.target.closest('.server-scene'),card=e.target.closest('.guided-card');
    if(!scene&&!card)return;
    pointerFrame=requestAnimationFrame(()=>{
      pointerFrame=0;const el=scene||card,r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      if(scene){scene.style.setProperty('--rx',((.5-y)*7)+'deg');scene.style.setProperty('--ry',((x-.5)*9)+'deg');}
      else{card.style.setProperty('--mx',(x*100)+'%');card.style.setProperty('--my',(y*100)+'%');}
    });
  },{passive:true});
  document.addEventListener('pointerout',e=>{
    const scene=e.target.closest('.server-scene');if(scene&&!scene.contains(e.relatedTarget)){scene.style.setProperty('--rx','0deg');scene.style.setProperty('--ry','0deg');}
  });
});
