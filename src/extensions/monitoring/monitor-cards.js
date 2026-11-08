// «Мониторинг», renderer: the health board (status dots, since, sparklines of error rate / p95 latency / RPS),
// alerts with severity and age, incidents of the week on a 7-day strip, uptime per check with a 30-day strip and
// TLS warnings; the silence confirmation card; the endpoint discovery card (grouped addresses with environments,
// provenance and placeholders, «Следить за выбранными» → proposals → confirmed checks, «Скопировать список»).
// Built only with window.resultKit; service and code content is marked data-no-i18n and never set as HTML.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('monitor-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=(v,d=1)=>Number(v).toLocaleString(locale(),{maximumFractionDigits:d});
 const pct=v=>v==null?'—':(Math.floor(v*10000)/100).toLocaleString(locale(),{maximumFractionDigits:2})+'%';
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const feature=(method,...args)=>window.petya.feature('monitoring',method,...args);
 const STATUS={ok:{label:'работает',tone:'done'},warn:{label:'есть проблемы',tone:'progress'},critical:{label:'не работает',tone:'alert'},unknown:{label:'нет данных',tone:''}};
 const SEVERITY={critical:{label:'critical',tone:'alert'},warning:{label:'warning',tone:'progress'},info:{label:'info',tone:''}};
 const ENV={prod:'prod',staging:'staging',dev:'dev'};
 const time=iso=>{if(!iso)return document.createTextNode('—');if(typeof window.timeElement==='function')return window.timeElement(iso);const t=document.createElement('time');t.dateTime=iso;t.textContent=new Date(iso).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});return t;};
 const dur=ms=>{const m=Math.max(1,Math.round(ms/60000));return m<60?m+' мин':m<1440?num(m/60,1)+' ч':num(m/1440,1)+' дн';};

 function sparkline(points,{w=84,h=24,cls=''}={}){
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('class','mon-spark '+cls);svg.setAttribute('aria-hidden','true');
  const vals=(points||[]).map(p=>p[1]).filter(v=>Number.isFinite(v));
  if(vals.length<2){const l=document.createElementNS(SVG,'line');l.setAttribute('x1',0);l.setAttribute('x2',w);l.setAttribute('y1',h-2);l.setAttribute('y2',h-2);l.setAttribute('class','empty');svg.append(l);return svg;}
  const max=Math.max(...vals),min=Math.min(0,...vals),span=max-min||1,step=w/(vals.length-1);
  const pts=vals.map((v,i)=>[+(i*step).toFixed(1),+(h-2-(h-4)*(v-min)/span).toFixed(1)]);
  const area=document.createElementNS(SVG,'polygon');area.setAttribute('points',[...pts,[w,h],[0,h]].map(p=>p.join(',')).join(' '));area.setAttribute('class','area');
  const line=document.createElementNS(SVG,'polyline');line.setAttribute('points',pts.map(p=>p.join(',')).join(' '));line.setAttribute('class','line');
  const dot=document.createElementNS(SVG,'circle');dot.setAttribute('cx',pts.at(-1)[0]);dot.setAttribute('cy',pts.at(-1)[1]);dot.setAttribute('r','2');dot.setAttribute('class','dot');
  svg.append(area,line,dot);return svg;
 }
 const SIGNALS=[['errorRate','ошибки',v=>pct(v)],['latencyP95','p95',v=>v<1?num(v*1000,0)+' мс':num(v,2)+' с'],['rps','RPS',v=>num(v,v<10?1:0)]];

 function serviceRow(k,x,c){
  const li=k.el('li','mon-svc');li.dataset.status=x.status;
  const head=k.el('div','mon-svc-head');
  const dot=k.el('span','mon-dot');dot.setAttribute('role','img');dot.setAttribute('aria-label',STATUS[x.status]?.label||x.status);dot.title=STATUS[x.status]?.label||'';
  const name=raw(k.el('button','mon-svc-name',x.name));name.type='button';name.title='Почему так — подробнее';
  name.onclick=e=>{e.stopPropagation();k.ask('Почему '+(x.status==='critical'?'лежит ':x.status==='warn'?'тормозит ':'так себя ведёт ')+x.name,{send:true});};
  head.append(dot,name);
  if(x.since&&x.status!=='ok'){const s=k.el('small','mon-since');s.append(document.createTextNode('началось '),time(x.since));head.append(s);}
  if(x.note)head.append(raw(k.el('small','mon-note',x.note)));
  const sig=k.el('div','mon-signals');
  for(const [key,label,format] of SIGNALS){
   const box=k.el('div','mon-signal');box.dataset.signal=key;
   const v=x.signals?.[key];
   box.append(sparkline(x.series?.[key],{cls:key}),k.el('span','mon-signal-label',label),k.el('b',null,v==null?'—':format(v)));
   if(v==null&&!x.series?.[key])box.classList.add('none');
   sig.append(box);
  }
  li.append(head,sig);return li;
 }
 function alertRow(k,a,c){
  const li=k.el('li','mon-alert'+(a.silenced?' silenced':''));li.dataset.severity=a.severity;
  const sev=SEVERITY[a.severity]||SEVERITY.info;
  const top=k.el('div','mon-alert-top');
  top.append(k.chip({label:sev.label,tone:sev.tone}),raw(k.el('b','mon-alert-name',a.name)));
  if(a.service)top.append(raw(k.el('span','mon-alert-svc',a.service)));
  if(a.state==='pending')top.append(k.chip({label:'ожидает',tone:''}));
  if(a.silenced)top.append(k.chip({label:'заглушён',tone:''}));
  const age=k.el('small','mon-age');if(a.startsAt){age.append(document.createTextNode(a.state==='pending'?'появился ':'загорелся '),time(a.startsAt));}top.append(age);
  li.append(top);
  const summary=a.annotations?.summary||a.annotations?.description;
  if(summary)li.append(raw(k.el('p','mon-alert-text',summary)));
  const actions=k.el('div','mon-row-actions');
  if(c.canSilence&&!a.silenced&&a.state==='firing'){const b=k.el('button',null,'Заглушить…');b.type='button';b.dataset.action='silence';b.onclick=e=>{e.stopPropagation();k.ask('Заглуши алерт '+a.name+(a.service?' сервиса '+a.service:''),{send:true});};actions.append(b);}
  const url=k.safeUrl(a.url);if(url){const b=k.el('button',null,'Открыть');b.type='button';b.onclick=e=>{e.stopPropagation();window.open(url,'_blank','noopener');};actions.append(b);}
  if(actions.children.length)li.append(actions);
  return li;
 }
 // Incidents of the week: a strip of 7 days with a mark per incident, then the list.
 function incidents(k,list,now){
  const box=k.el('div','mon-incidents');
  const strip=k.el('div','mon-week');strip.setAttribute('aria-hidden','true');
  const day0=new Date(now);day0.setHours(0,0,0,0);
  for(let i=6;i>=0;i--){
   const a=day0.getTime()-i*86400000,b=a+86400000;
   const col=k.el('div','mon-day');
   const n=list.filter(e=>{const s=Date.parse(e.from),f=e.to?Date.parse(e.to):now;return s<b&&f>=a;});
   col.dataset.count=String(n.length);
   const bar=k.el('span','mon-day-bar');bar.style.height=Math.min(100,n.length*28)+'%';if(n.some(e=>e.status==='critical'))bar.classList.add('critical');
   col.append(bar,k.el('small',null,new Date(a).toLocaleDateString(locale(),{weekday:'short'})));
   col.title=n.length?n.map(e=>e.title).join(', '):'';
   strip.append(col);
  }
  box.append(strip);
  const rows=list.map(e=>{const li=k.el('li','mon-incident');li.dataset.kind=e.kind;
   const kind=k.chip({label:e.kind==='uptime'?'проверка':'алерт',tone:e.status==='critical'?'alert':'progress'});
   const t=k.el('small','mon-age');t.append(time(e.from),document.createTextNode(' · '+(e.to?dur(e.ms):'идёт '+dur(e.ms))));
   li.append(kind,raw(k.el('span','mon-incident-title',e.title)),e.service?raw(k.el('span','mon-alert-svc',e.service)):'',t);return li;});
  const ul=k.el('ul','mon-list');ul.append(k.collapse(rows,4,'Ещё инциденты'));box.append(ul);
  return box;
 }
 function uptimeRow(k,u){
  const li=k.el('li','mon-uptime');li.dataset.status=u.status;
  const head=k.el('div','mon-uptime-head');
  const dot=k.el('span','mon-dot');dot.title=STATUS[u.status]?.label||'';
  head.append(dot,raw(k.el('b','mon-uptime-name',u.name)),k.el('span','mon-uptime-pct',pct(u.periodPercent??u.percent)));
  if(u.last?.ms!=null)head.append(k.el('small','mon-ms',num(u.last.ms,0)+' мс'));
  if(u.tlsDays!=null)head.append(k.chip({label:u.tlsDays<0?'сертификат истёк':'TLS: '+u.tlsDays+' дн.',tone:u.tlsDays<7?'alert':u.tlsDays<21?'progress':'',title:'До окончания сертификата'}));
  const strip=k.el('div','mon-strip');strip.setAttribute('role','img');strip.setAttribute('aria-label','Доступность за 30 дней');
  (u.strip||[]).forEach((p,i)=>{const cell=k.el('span','mon-cell');cell.dataset.level=p==null?'none':p>=0.999?'ok':p>=0.98?'warn':'bad';cell.title=(p==null?'нет данных':pct(p))+' · '+(30-i)+' дн. назад';strip.append(cell);});
  li.append(head,strip);
  if(u.last&&!u.last.ok&&u.last.error)li.append(raw(k.el('p','mon-alert-text',u.last.error)));
  return li;
 }
 function section(k,title,count,node,cls=''){const s=k.el('section','mon-section '+cls);const h=k.el('h4','mon-head',title);if(count!=null)h.append(k.el('small',null,String(count)));s.append(h,node);return s;}

 window.renderMonitorCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.mon-card'))return;
  const body=k.el('div','mon-body');
  const services=c.services||[],now=Number(c.now)||Date.now();
  // «почему лежит X»: the alerts and incidents of that service only.
  const alerts=(c.alerts||[]).filter(a=>!c.focus||a.service===c.focus.service),incidentList=(c.incidents||[]).filter(e=>!c.focus||e.service===c.focus.service);
  for(const x of (c.sources||[]).filter(x=>x.error))body.append(raw(k.el('p','mon-error',x.name+': '+x.error)));
  if(c.focus){
   const f=k.el('div','mon-focus');f.dataset.status=c.focus.status;
   const h=k.el('div','mon-focus-head');h.append(k.el('span','mon-dot'),raw(k.el('b',null,c.focus.service)),k.chip({label:STATUS[c.focus.status]?.label||'',tone:STATUS[c.focus.status]?.tone||''}));
   if(c.focus.since&&c.focus.status!=='ok'){const s=k.el('small','mon-since');s.append(document.createTextNode('началось '),time(c.focus.since));h.append(s);}
   f.append(h);
   if(c.focus.reasons?.length){const ul=k.el('ul','mon-reasons');for(const r of c.focus.reasons)ul.append(raw(k.el('li',null,r)));f.append(ul);}
   else f.append(k.el('p','mon-empty','Явных причин в метриках и алертах не видно.'));
   body.append(f);
  }
  const svcList=k.el('ul','mon-list mon-board');
  const shown=c.focus?services.filter(x=>x.name===c.focus.service):services;
  svcList.append(k.collapse(shown.map(x=>serviceRow(k,x,c)),c.mode==='overview'?8:4,'Ещё сервисы'));
  const alertList=k.el('ul','mon-list');alertList.append(k.collapse(alerts.map(a=>alertRow(k,a,c)),c.mode==='alerts'?10:4,'Ещё алерты'));
  const uptime=c.uptime||[];
  const upList=k.el('ul','mon-list');upList.append(k.collapse(uptime.map(u=>uptimeRow(k,u)),c.mode==='uptime'?10:4,'Ещё проверки'));
  const parts={
   board:shown.length?section(k,'Сервисы',shown.length,svcList,'mon-services'):null,
   alerts:alerts.length||c.mode==='alerts'?section(k,'Алерты',alerts.filter(a=>!a.silenced).length,alerts.length?alertList:k.el('p','mon-empty','Алертов нет.'),'mon-alerts'):null,
   incidents:incidentList.length||c.mode==='incidents'?section(k,'Инциденты недели',incidentList.length,incidentList.length?incidents(k,incidentList,now):k.el('p','mon-empty','Инцидентов не было.'),'mon-week-box'):null,
   uptime:uptime.length||c.mode==='uptime'?section(k,'Аптайм · '+(c.mode==='uptime'?c.period?.label||'':'30 дней'),uptime.length,uptime.length?upList:k.el('p','mon-empty','Проверок доступности нет.'),'mon-uptime-box'):null
  };
  const order={alerts:['alerts','board','incidents','uptime'],uptime:['uptime','incidents','board','alerts'],incidents:['incidents','alerts','board','uptime'],why:['board','alerts','incidents','uptime']}[c.mode]||['board','alerts','incidents','uptime'];
  for(const key of order)if(parts[key])body.append(parts[key]);
  if(c.tls?.length){const p=k.el('p','mon-tls');p.append(k.el('span',null,'Сертификаты скоро истекают: '));for(const t of c.tls)p.append(k.chip({label:t.name+' — '+(t.days<0?'истёк':t.days+' дн.'),tone:t.days<7?'alert':'progress'}));body.append(p);}
  // The service the actions are about: the one asked about, else the worst one.
  const subject=c.focus?.service&&c.focus.found?c.focus.service:(services.find(x=>x.status==='critical')||services.find(x=>x.status==='warn'))?.name||'';
  const actions=[];
  if(subject&&c.logs){const b={label:'Логи этого сервиса',run:()=>k.ask('логи сервиса '+subject+' за последний час',{send:true})};actions.push(b);}
  if(subject){
   const svc=services.find(x=>x.name===subject),firing=alerts.filter(a=>a.service===subject&&!a.silenced);
   const facts=[svc?'Статус: '+(STATUS[svc.status]?.label||svc.status)+(svc.since?' с '+new Date(svc.since).toLocaleString(locale()):''):'',svc?.note||'',...firing.slice(0,3).map(a=>'Алерт '+a.name+' ('+a.severity+')'),...(c.focus?.reasons||[]).slice(0,3)].filter(Boolean).join('. ');
   actions.push(k.links('task-tracker',{title:'Инцидент: '+subject+' — '+(STATUS[svc?.status]?.label||'проблемы'),description:facts,type:'bug'},{label:p=>'Создать инцидент-задачу · '+p.name}));
   actions.push(k.links('share-message',{text:'сервис '+subject+': '+(STATUS[svc?.status]?.label||'проблемы')+'. '+facts},{label:p=>'Сообщить в канал · '+p.name}));
  }
  if(c.mode!=='alerts'&&alerts.length)actions.push({label:'Только алерты',run:()=>k.ask('Какие алерты горят',{send:true})});
  if(c.mode!=='uptime'&&uptime.length)actions.push({label:'Аптайм за неделю',run:()=>k.ask('Аптайм за неделю',{send:true})});
  const down=services.filter(x=>x.status==='critical').length,warn=services.filter(x=>x.status==='warn').length,firing=alerts.filter(a=>!a.silenced&&a.state==='firing').length;
  const status=down?{label:down+' '+plural(down,['не работает','не работают','не работают']),tone:'alert'}:warn||firing?{label:'есть проблемы',tone:'progress'}:{label:'всё работает',tone:'done'};
  const card=k.card({app:'Мониторинг',initial:'◉',color:'#2f4a3e',key:(c.sources||[]).map(x=>x.name).join(' + '),status,subtitle:c.period?.label||'',body,actions,className:'mon-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  card.dataset.mode=c.mode||'overview';
  parent.append(card);
 };

 // --- Silence confirmation --------------------------------------------------------------------------------------
 window.renderMonitorSilence=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.mon-silence'))return;
  const body=k.el('div','mon-body');
  const top=k.el('div','mon-alert-top');top.append(k.chip({label:(SEVERITY[d.alert?.severity]||SEVERITY.info).label,tone:(SEVERITY[d.alert?.severity]||SEVERITY.info).tone}),raw(k.el('b','mon-alert-name',d.alert?.name||'')));
  if(d.alert?.service)top.append(raw(k.el('span','mon-alert-svc',d.alert.service)));
  body.append(top);
  const m=k.el('div','mon-matchers');m.append(k.el('span','mon-label','Условия:'));
  for(const x of d.matchers||[])m.append(raw(k.el('code','mon-matcher',x.name+(x.isEqual===false?'!':'')+(x.isRegex?'=~':'=')+'"'+x.value+'"')));
  body.append(m);
  const facts=k.el('p','mon-silence-facts');
  facts.append(k.el('span',null,'Срок: '),raw(k.el('b',null,d.label||'')),k.el('span',null,' · совпадает алертов сейчас: '+(d.affected??1)+' · где: '),raw(k.el('b',null,d.sourceName||d.source)));
  body.append(facts);
  const state=k.el('p','mon-silence-state');state.setAttribute('role','status');body.append(state);
  const done=r=>{card.dataset.state='done';state.replaceChildren(document.createTextNode('Заглушено до '),time(r.until));const url=k.safeUrl(r.url);if(url){const a=k.el('a',null,' · открыть в Alertmanager');a.href=url;a.target='_blank';a.rel='noopener';state.append(a);}button.disabled=true;button.dataset.keep='1';};
  const button=k.el('button','primary','Заглушить на '+(d.label||''));button.type='button';button.dataset.action='confirm-silence';
  button.onclick=async e=>{e.stopPropagation();if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');
   try{const r=await feature('silence',d.id);done(r);k.toast('Алерт заглушён');}catch(err){k.toast(err.message,{error:true});button.disabled=false;}finally{button.removeAttribute('aria-busy');}};
  const card=k.card({app:'Мониторинг',initial:'◉',color:'#2f4a3e',key:'Тишина для алерта',status:{label:d.created?'заглушено':'ждёт подтверждения',tone:d.created?'done':'progress'},body,actions:[button],className:'mon-card mon-silence'});
  card.dataset.state=d.created?'done':'draft';
  if(d.created)done(d.created);
  parent.append(card);
 };

 // --- Endpoint discovery --------------------------------------------------------------------------------------------
 const GROUPS=[['own','Свои серверы'],['cdn','CDN и хранилища'],['third','Сторонние SDK']];
 const TYPES={analytics:'аналитика',ads:'реклама',payments:'платежи',attribution:'атрибуция',crash:'крэши',push:'пуши',backend:'бэкенд-сервис',multiplayer:'мультиплеер',platform:'платформа',store:'магазин',cdn:'CDN'};
 function sourceLink(k,c,s){
  const b=raw(k.el('button','mon-src',s.file.split('/').pop()+':'+s.line));b.type='button';b.title=s.file+':'+s.line+(s.snippet?'\n'+s.snippet:'');
  b.onclick=async e=>{e.stopPropagation();try{await feature('openSource',c.id,s.file);}catch(err){k.toast(err.message,{error:true});}};
  return b;
 }
 function platformsText(active){
  const parts=[];
  for(const [cond,a] of Object.entries(active||{})){
   if(!a)continue;
   const on=Object.entries(a.platforms||{}).filter(([,v])=>v).map(([p,v])=>p+(v==='development'?' (dev-сборка)':''));
   parts.push('#if '+cond+' → '+(on.length?on.join(', '):'не собирается')+(a.editor?' · редактор':''));
  }
  return parts;
 }
 function addressRow(k,a,c,picked){
  const li=k.el('li','mon-addr');li.dataset.category=a.category;li.dataset.env=(a.envs||[]).join(' ');li.dataset.key=a.key;li.dataset.host=a.host;
  const top=k.el('div','mon-addr-top');
  if(a.category!=='third'&&!a.partial&&/^https?$/.test(a.scheme)&&!a.display.includes('@')){
   const box=k.el('input');box.type='checkbox';box.className='mon-pick';box.setAttribute('aria-label','Следить за '+a.host);box.checked=picked.has(a.key);
   box.onchange=()=>{box.checked?picked.add(a.key):picked.delete(a.key);c._update?.();};
   top.append(box);
  }else top.append(k.el('span','mon-pick-gap'));
  const url=raw(k.el('code','mon-url selectable',a.display));top.append(url);
  for(const env of a.envs||[]){const chip=k.chip({label:ENV[env]||env,tone:env==='prod'?'alert':env==='staging'?'progress':'',title:'Окружение: '+(a.envWhy||[]).join(', ')});chip.dataset.env=env;if(a.envGuessed)chip.classList.add('guessed');top.append(chip);}
  if(a.category==='third'&&a.vendor)top.append(raw(k.el('span','mon-vendor',a.vendor+(a.type?' · ':''))),k.el('span','mon-vendor',TYPES[a.type]||''));
  li.append(top);
  const meta=k.el('div','mon-addr-meta');
  for(const s of (a.sources||[]).slice(0,4))meta.append(sourceLink(k,c,s));
  if((a.sources||[]).length>4)meta.append(k.el('small',null,'и ещё '+(a.sources.length-4)));
  const via=[...new Set((a.sources||[]).map(s=>s.via).filter(Boolean))].slice(0,3);
  if(via.length)meta.append(raw(k.el('small','mon-via',via.join(', '))));
  li.append(meta);
  for(const h of a.holes||[]){const p=k.el('p','mon-hole');p.append(raw(k.el('code',null,h.name)),k.el('span',null,h.why==='runtime'?' задаётся в рантайме: ':' не вычисляется: '),raw(k.el('span',null,(h.file||'').split('/').pop()+(h.line?':'+h.line:''))));li.append(p);}
  for(const line of platformsText(a.active))li.append(raw(k.el('p','mon-cond',line)));
  if(!a.active)for(const cond of a.conditions||[])li.append(raw(k.el('p','mon-cond','#if '+cond)));
  if(a.overriddenBy?.length){const p=k.el('p','mon-override');p.append(k.el('span',null,'Значение по умолчанию; в сцене или префабе задано другое: '));for(const o of a.overriddenBy)p.append(raw(k.el('code',null,o.value+' ')),raw(k.el('small',null,o.file.split('/').pop()+':'+o.line+' ')));li.append(p);}
  return li;
 }
 window.renderMonitorEndpoints=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.mon-endpoints'))return;
  const addresses=c.addresses||[];
  const picked=new Set();
  const body=k.el('div','mon-body');
  const tiles=k.el('div','mon-tiles');
  const hosts=new Set(addresses.filter(a=>a.category==='own'&&!a.host.startsWith('{')).map(a=>a.host));
  for(const [v,l] of [[hosts.size,plural(hosts.size,['свой хост','своих хоста','своих хостов'])],[c.counts?.cdn||0,'CDN и хранилища'],[c.counts?.third||0,'сторонние SDK'],[c.stats?.files||0,plural(c.stats?.files||0,['файл просмотрен','файла просмотрено','файлов просмотрено'])]]){const t=k.el('div','mon-tile');t.append(k.el('b',null,num(v,0)),k.el('span',null,l));tiles.append(t);}
  body.append(tiles);
  // Environment filter.
  let env='all';
  const filter=k.el('div','mon-filter');filter.setAttribute('role','group');filter.setAttribute('aria-label','Окружение');
  const envs=['all',...['prod','staging','dev'].filter(e=>addresses.some(a=>(a.envs||[]).includes(e)))];
  const lists=[];
  const apply=()=>{for(const b of filter.children)b.setAttribute('aria-pressed',String(b.dataset.env===env));for(const li of body.querySelectorAll('.mon-addr'))li.hidden=env!=='all'&&!li.dataset.env.split(' ').includes(env);
   for(const h of body.querySelectorAll('.mon-host'))h.hidden=![...body.querySelectorAll('.mon-addr')].some(li=>li.dataset.host===h.dataset.host&&!li.hidden);};
  for(const e of envs){const b=k.el('button',null,e==='all'?'Все окружения':ENV[e]);b.type='button';b.dataset.env=e;b.onclick=()=>{env=e;apply();};filter.append(b);}
  if(envs.length>2)body.append(filter);
  for(const [cat,title] of GROUPS){
   const own=addresses.filter(a=>a.category===cat);if(!own.length)continue;
   // Own servers: grouped under their host («api.mygame.com · 8»), so one server's endpoints read together.
   const nodes=[];let last='';
   for(const a of own){
    if(cat==='own'&&a.host!==last){last=a.host;const n=own.filter(b=>b.host===a.host).length;const h=k.el('li','mon-host');h.append(a.host.startsWith('{')?k.el('b',null,'Адрес задаётся в рантайме'):raw(k.el('b',null,a.host)));if(n>1)h.append(k.el('small',null,String(n)));h.dataset.host=a.host;nodes.push(h);}
    nodes.push(addressRow(k,a,c,picked));
   }
   const ul=k.el('ul','mon-list mon-addrs');ul.append(k.collapse(nodes,cat==='own'?14:5,'Ещё адреса'));
   const s=section(k,title,own.length,ul,'mon-group');s.dataset.category=cat;body.append(s);lists.push(ul);
  }
  if(!addresses.length)body.append(k.el('p','mon-empty','Адресов серверов не нашлось.'));
  if(c.healthPaths?.length){const p=k.el('p','mon-note-line');p.append(k.el('span',null,'Пути проверки здоровья в коде: '),raw(k.el('code',null,c.healthPaths.join(', '))));body.append(p);}
  const proposals=k.el('div','mon-proposals');proposals.hidden=true;body.append(proposals);
  const watch={label:'Следить за выбранными',run:async()=>{
   if(!picked.size){k.toast('Отметьте адреса, за которыми следить.',{error:true});return;}
   const list=await feature('proposeChecks',c.id,[...picked]);
   proposals.hidden=false;proposals.replaceChildren(k.el('h4','mon-head','Проверки доступности'));
   const usable=list.filter(p=>p.ok&&!p.exists);
   const ul=k.el('ul','mon-list');
   for(const p of list){const li=k.el('li','mon-proposal');li.append(raw(k.el('code','mon-url',p.url)),k.chip({label:p.exists?'уже есть':!p.ok?'нельзя':p.from==='code'?'путь из кода':p.from==='guess'?'путь угадан':'корень сайта',tone:p.exists||!p.ok?'':p.from==='code'?'done':'progress',title:p.error||''}));ul.append(li);}
   proposals.append(k.el('p','mon-note-line','Петя будет раз в 5 минут делать GET на эти адреса — без тела и без ваших данных.'),ul);
   const row=k.el('div','kit-actions');
   const add=k.el('button','primary',usable.length?'Добавить проверки: '+usable.length:'Нечего добавлять');add.type='button';add.disabled=!usable.length;add.dataset.action='confirm-checks';
   add.onclick=async e=>{e.stopPropagation();add.disabled=true;try{const r=await feature('addChecks',usable);k.toast('Добавлено проверок: '+r.added);add.textContent='Добавлено: '+r.added;proposals.dataset.state='added';}catch(err){k.toast(err.message,{error:true});add.disabled=false;}};
   const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=e=>{e.stopPropagation();proposals.hidden=true;proposals.replaceChildren();};
   row.append(add,cancel);proposals.append(row);
  }};
  const copy={label:'Скопировать список',run:async()=>{
   const lines=[];for(const [cat,title] of GROUPS){const own=addresses.filter(a=>a.category===cat);if(!own.length)continue;lines.push((window.t?window.t(title):title)+':');for(const a of own)lines.push('  '+a.display+(a.envs?.length?' ['+a.envs.join(', ')+']':'')+(a.vendor?' — '+a.vendor:'')+' — '+(a.sources||[]).slice(0,3).map(s=>s.file+':'+s.line).join(', '));}
   await navigator.clipboard.writeText(lines.join('\n'));k.toast(window.t?window.t('Список скопирован'):'Список скопирован');
  }};
  const card=k.card({app:'Мониторинг',initial:'◉',color:'#2f4a3e',key:'Адреса серверов в проекте',status:{label:addresses.length+' '+plural(addresses.length,['адрес','адреса','адресов']),tone:addresses.length?'accent':''},subtitle:(c.roots||[]).map(r=>r.split(/[\\/]/).pop()).join(', '),body,actions:[watch,copy],className:'mon-card mon-endpoints'});
  const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  apply();
  parent.append(card);
 };
})();
