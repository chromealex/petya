// «Docker», renderer: the container table (status dots, CPU and memory bars, port chips, per-row actions with an
// inline confirmation), compose projects, the logs card (monospace lines coloured by level, a volume timeline,
// search and level filter), «почему падает» (facts, the grounded explanation, the log lines it rests on) and the
// disk card (stacked bar by type, biggest images, dangling images removed only after confirmation).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('docker-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('dockerApp',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const ru=()=>/^ru/i.test(locale());
 const U=unit=>' '+(ru()?unit:({ТБ:'TB',ГБ:'GB',МБ:'MB',КБ:'KB',Б:'B'}[unit]||unit));
 function human(bytes){
  const n=Number(bytes)||0;
  for(const [d,u] of [[1e12,'ТБ'],[1e9,'ГБ'],[1e6,'МБ'],[1e3,'КБ']])if(n>=d)return (n/d).toLocaleString(locale(),{maximumFractionDigits:n/d>=100?0:1})+U(u);
  return n+U('Б');
 }
 // Memory in 1024-based units, as Docker and the OS show it.
 function ram(bytes){
  const n=Number(bytes)||0;
  for(const [d,u] of [[1024**3,'ГБ'],[1024**2,'МБ'],[1024,'КБ']])if(n>=d)return (n/d).toLocaleString(locale(),{maximumFractionDigits:n/d>=100?0:1})+U(u);
  return n+U('Б');
 }
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const button=(k,cls,label,run)=>{const b=k.el('button',cls,label);b.type='button';b.onclick=run;return b;};

 // Docker prints «Up 2 hours (healthy)», «Exited (137) 3 minutes ago»: durations are re-told in the interface locale.
 function duration(text){
  const t=String(text||'').trim();
  if(/^less than a second/i.test(t))return {n:1,unit:'second'};
  const about=/^about an? (\w+)/i.exec(t);if(about)return {n:1,unit:about[1].replace(/s$/,'').toLowerCase()};
  const m=/^(\d+) (second|minute|hour|day|week|month|year)s?/i.exec(t);
  return m?{n:Number(m[1]),unit:m[2].toLowerCase()}:null;
 }
 const unitText=d=>{try{return new Intl.NumberFormat(locale(),{style:'unit',unit:d.unit,unitDisplay:'long'}).format(d.n);}catch{return d.n+' '+d.unit;}};
 const agoText=d=>{try{return new Intl.RelativeTimeFormat(locale(),{numeric:'auto'}).format(-d.n,d.unit);}catch{return unitText(d);}};
 function statusText(c){
  const up=/^Up (.+?)(?: \((?:healthy|unhealthy|health: starting|Paused)\))*$/i.exec(c.status||'');
  if(c.state==='running'&&up){const d=duration(up[1]);return d?'работает '+unitText(d):'работает';}
  if(c.state==='paused')return 'на паузе';
  if(c.state==='restarting')return 'перезапускается';
  if(c.state==='created')return 'создан, не запускался';
  const ex=/^Exited \((-?\d+)\) (.+) ago$/i.exec(c.status||'');
  if(ex){const d=duration(ex[2]);return d?'остановлен '+agoText(d):'остановлен';}
  return c.state==='dead'?'не работает':c.state==='running'?'работает':'остановлен';
 }
 // «5 days ago» from docker images → the interface locale.
 const since=text=>{const m=/^(.+) ago$/i.exec(String(text||''));const d=m&&duration(m[1]);return d?agoText(d):'';};
 const time=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
 const when=iso=>{const d=new Date(iso);return isNaN(d)||d.getFullYear()<2000?'':d.toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
 const DOT={running:'run',restarting:'warn',paused:'warn',created:'idle',exited:'stop',dead:'stop'};
 const bad=c=>c.state==='restarting'||c.state==='dead'||c.state==='exited'&&c.exitCode!==null&&![0,143].includes(c.exitCode)||c.health==='unhealthy';

 function meter(k,value,label,title){
  const box=k.el('span','dk-meter'+(value===null?' empty':''));
  const track=k.el('span','dk-meter-track'),fill=k.el('span','dk-meter-fill');
  const v=value===null?0:Math.max(0,Math.min(100,value));fill.style.width=(value===null?0:Math.max(2,v)).toFixed(1)+'%';
  if(v>=85)fill.classList.add('hot');else if(v>=60)fill.classList.add('warm');
  track.append(fill);box.append(track,raw(k,'span','dk-meter-label',value===null?'—':label));
  box.setAttribute('role','img');box.setAttribute('aria-label',title||label);if(title)box.title=title;
  return box;
 }
 function portChips(k,c){
  const box=k.el('span','dk-ports');
  for(const p of (c.ports||[]).slice(0,3)){const chip=raw(k,'span','dk-port'+(p.host?'':' internal'),p.host?p.host+'→'+p.container.replace('/tcp',''):p.container.replace('/tcp',''));chip.title=(p.bind?p.bind+':':'')+(p.host?p.host+' → ':'')+p.container;box.append(chip);}
  if((c.ports||[]).length>3)box.append(k.el('span','dk-port more','+'+(c.ports.length-3)));
  return box;
 }

 // One confirmation: what exactly will run, then the only button that acts.
 function confirmBox(k,{title,note,label,danger,run}){
  const box=k.el('div','dk-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение');
  box.append(k.el('p','dk-confirm-title',title));
  if(note)box.append(k.el('p','dk-confirm-note',note));
  const go=button(k,'primary'+(danger?' dk-danger':''),label);
  const cancel=button(k,null,'Отмена',()=>box.remove());
  go.onclick=async()=>{go.disabled=cancel.disabled=true;go.setAttribute('aria-busy','true');try{await run();box.remove();}catch(e){k.toast(e.message,{error:true});go.disabled=cancel.disabled=false;}finally{go.removeAttribute('aria-busy');}};
  const bar=k.el('div','dk-confirm-actions');bar.append(go,cancel);box.append(bar);
  return box;
 }
 function attachConfirm(row,box){if(row.nextElementSibling?.classList.contains('dk-confirm'))row.nextElementSibling.remove();row.after(box);box.querySelector('button.primary')?.focus();}

 const VERB={start:'Запустить',stop:'Остановить',restart:'Перезапустить'};
 const VERB_NOTE={start:'Выполнится docker start.',stop:'Выполнится docker stop: процесс получит SIGTERM, через 10 с — SIGKILL.',restart:'Выполнится docker restart: остановка и запуск заново.'};
 function containerRow(k,c){
  const row=k.el('div','dk-row'+(bad(c)?' bad':''));row.dataset.id=c.id;row.setAttribute('role','listitem');
  const dot=k.el('span','dk-dot '+(c.health==='unhealthy'?'warn':DOT[c.state]||'idle'));dot.setAttribute('aria-hidden','true');
  const who=k.el('div','dk-who');
  const name=raw(k,'span','dk-name',c.name);name.title=c.id.slice(0,12);
  const sub=k.el('span','dk-sub');sub.append(raw(k,'span','dk-image',c.image));
  if(c.project)sub.append(raw(k,'span','dk-project',c.project));
  who.append(name,sub);
  const st=k.el('span','dk-state');st.append(k.el('span',null,statusText(c)));
  if(c.exitCode!==null&&c.state!=='running')st.append(raw(k,'span','dk-code'+([0,143].includes(c.exitCode)?'':' alert'),'exit '+c.exitCode));
  if(c.health==='unhealthy')st.append(k.el('span','dk-code alert','нездоров'));
  const cpu=meter(k,c.cpu,c.cpu===null?'':c.cpu.toLocaleString(locale(),{maximumFractionDigits:1})+'%','CPU: '+(c.cpu===null?'—':c.cpu+'%'));
  const mem=meter(k,c.memPercent,c.memUsed===null?'':ram(c.memUsed),c.memUsed===null?'Память: —':'Память: '+ram(c.memUsed)+' из '+ram(c.memLimit));
  const actions=k.el('div','dk-row-actions');
  const open=verb=>attachConfirm(row,confirmBox(k,{title:VERB[verb]+' контейнер '+c.name+'?',note:VERB_NOTE[verb],label:VERB[verb],danger:verb!=='start',
   run:async()=>{const r=await call('container',verb,c.id);k.toast(r.container.name+': '+statusText(r.container));
    const live=r.container.state==='running';row.replaceWith(containerRow(k,{...c,...r.container,cpu:live?c.cpu:null,memUsed:live?c.memUsed:null,memPercent:live?c.memPercent:null}));}}));
  // One compact menu per row: logs, the state changes that fit (each opens the confirmation), «почему падает».
  const verbs=['running','restarting','paused'].includes(c.state)?['restart','stop']:['start'];
  const items=[...(bad(c)?[{id:'why',label:'Почему падает?'}]:[]),{id:'logs',label:'Логи'},...verbs.map(v=>({id:v,label:VERB[v]+'…'}))];
  const menu=k.el('button','dk-mini dk-menu'+(bad(c)?' dk-why':''),'Действия ▾');menu.type='button';
  menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Действия с контейнером '+c.name);
  menu.onclick=event=>{event.stopPropagation();k.menu(menu,async()=>items,async item=>{menu.setAttribute('aria-expanded','false');
   if(item.id==='logs')return k.ask('логи контейнера '+c.name,{send:true});
   if(item.id==='why')return k.ask('почему падает контейнер '+c.name,{send:true});
   open(item.id);});};
  actions.append(menu);
  row.append(dot,who,portChips(k,c),st,cpu,mem,actions);
  row.openConfirm=open;
  return row;
 }
 function containerTable(k,list){
  const box=k.el('div','dk-table');box.setAttribute('role','list');box.setAttribute('aria-label','Контейнеры');
  const head=k.el('div','dk-row dk-head');head.setAttribute('aria-hidden','true');
  head.append(k.el('span'),k.el('span',null,'Контейнер'),k.el('span',null,'Порты'),k.el('span',null,'Состояние'),k.el('span',null,'CPU'),k.el('span',null,'Память'),k.el('span'));
  box.append(head);
  const rows=list.map(c=>containerRow(k,c));
  box.append(...rows.slice(0,12));
  if(rows.length>12){const more=k.el('details','dk-more');more.append(k.el('summary',null,'Ещё контейнеров: '+(rows.length-12)),...rows.slice(12));box.append(more);}
  return box;
 }
 function projectRow(k,p){
  const row=k.el('div','dk-row dk-project-row');row.dataset.project=p.name;
  const dot=k.el('span','dk-dot '+(p.running&&p.running===p.total?'run':p.running?'warn':'stop'));dot.setAttribute('aria-hidden','true');
  const who=k.el('div','dk-who');
  const files=raw(k,'span','dk-sub',(p.files||[]).map(f=>f.split(/[\\/]/).slice(-2).join('/')).join(', '));files.title=(p.files||[]).join('\n');
  who.append(raw(k,'span','dk-name',p.name),files);
  const bar=meter(k,p.total?100*p.running/p.total:0,p.running+' / '+p.total,'Запущено '+p.running+' из '+p.total);
  const actions=k.el('div','dk-row-actions');
  const open=verb=>attachConfirm(row,confirmBox(k,{
   title:verb==='up'?'Поднять compose-проект '+p.name+'?':'Остановить compose-проект '+p.name+'?',
   note:verb==='up'?'Выполнится docker compose up --detach по файлу '+((p.files||[])[0]||'проекта')+'.':'Выполнится docker compose down: контейнеры и сети проекта удаляются, тома и образы остаются.',
   label:verb==='up'?'Поднять':'Остановить проект',danger:verb==='down',
   run:async()=>{const r=await call('compose',verb,p.name);k.toast('Compose '+p.name+': '+(r.project.running?'запущено '+r.project.running:'остановлен'));row.replaceWith(projectRow(k,{...p,...r.project}));}}));
  const verbs=p.running?(p.running<p.total?['up','down']:['down']):['up'];
  for(const verb of verbs){const b=button(k,'dk-mini',verb==='up'?'Поднять':'Остановить',()=>open(verb));b.dataset.verb=verb;actions.append(b);}
  row.append(dot,who,bar,actions);row.openConfirm=open;
  return row;
 }
 function counts(k,o){
  const box=k.el('div','dk-counts');
  const run=o.containers.filter(c=>c.state==='running').length,problems=o.containers.filter(bad).length,stopped=o.containers.length-run;
  const item=(cls,n,label)=>{const s=k.el('span','dk-count '+cls);s.append(k.el('strong',null,String(n)),k.el('span',null,label));return s;};
  box.append(item('run',run,'запущено'),item('stop',stopped,'остановлено'));
  if(problems)box.append(item('bad',problems,'с проблемами'));
  if(o.images){const dangling=o.images.filter(i=>i.dangling);box.append(item('idle',o.images.length,'образов · '+human(o.images.reduce((a,i)=>a+i.size,0))));if(dangling.length)box.append(item('warn',dangling.length,'висячих'));}
  if(o.volumes)box.append(item('idle',o.volumes.length,'томов'));
  return box;
 }

 function missingCard(k,parent){
  const body=k.el('div','dk-body');
  body.append(k.el('p','dk-text','Docker не найден на этом компьютере. Установите Docker Desktop (macOS, Windows) или Docker Engine (Linux) и запустите его. Петя ничего не скачивает сам и работает через установленную команду docker.'));
  parent.append(k.card({app:'Docker',initial:'▣',color:'#2f5f8a',key:'Docker',status:{label:'не установлен',tone:'alert'},body,className:'dk-card',
   actions:[{label:'Проверить снова',run:()=>k.ask('что запущено в докере',{send:true})}]}));
 }

 window.renderDockerContainers=(parent,o)=>{
  const k=window.resultKit;if(!k||!o||parent.querySelector('.dk-card'))return;
  if(o.mode==='missing')return missingCard(k,parent);
  const body=k.el('div','dk-body');
  const paint=data=>{
   body.replaceChildren();
   if(data.mode!=='confirm')body.append(counts(k,data));
   if(data.containers.length)body.append(containerTable(k,data.containers));
   else if(data.mode!=='confirm')body.append(k.el('p','dk-muted','Контейнеров нет.'));
   if(data.statsMissing)body.append(k.el('p','dk-muted','CPU и память не получены: docker stats не ответил вовремя.'));
   if(data.compose?.length){body.append(k.el('div','dk-section','Compose-проекты'));const box=k.el('div','dk-table dk-projects');box.append(...data.compose.map(p=>projectRow(k,p)));body.append(box);}
   if(data.volumes?.length){
    const vols=data.volumes.map(v=>raw(k,'span','dk-volume',v.name.length>28?v.name.slice(0,12)+'…'+v.name.slice(-8):v.name));
    const d=k.el('details','dk-volumes');d.append(k.el('summary',null,'Тома: '+data.volumes.length));const wrap=k.el('div','dk-volume-list');wrap.append(...vols);d.append(wrap);body.append(d);
   }
   // A request from the chat («перезапусти redis») arrives with its confirmation already open.
   const p=data.pending;
   if(p){
    const row=p.type==='compose'?body.querySelector('.dk-project-row[data-project="'+CSS.escape(p.target)+'"]'):body.querySelector('.dk-row[data-id="'+CSS.escape(p.target)+'"]');
    row?.openConfirm?.(p.verb);
   }
  };
  paint(o);
  const all=o.containers||[],run=all.filter(c=>c.state==='running').length,problems=all.filter(bad).length;
  const status=o.mode==='confirm'?{label:'нужно подтверждение',tone:'progress'}:problems?{label:'проблем: '+problems,tone:'alert'}:{label:run+' из '+all.length+' запущено',tone:run?'done':'progress'};
  const at=o.at?new Date(o.at).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):'';
  const actions=[{label:'Обновить',run:async()=>{const fresh=await call('overview');paint(fresh);}},
   {label:'Сколько места занимает',run:()=>k.ask('сколько места занимает докер',{send:true})}];
  parent.append(k.card({app:'Docker',initial:'▣',color:'#2f5f8a',key:o.mode==='confirm'?'Подтверждение':'Контейнеры',status,subtitle:at,body,className:'dk-card',
   meta:['действия выполняются только после подтверждения','в контейнеры Петя не заходит'],actions}));
 };

 // --- Logs ------------------------------------------------------------------------------------------------------
 const LEVELS=[['all','Все'],['error','Ошибки'],['warn','Предупреждения']];
 function timeline(k,lines){
  const stamped=lines.filter(l=>l.time).map(l=>({t:Date.parse(l.time),l}));
  const box=k.el('div','dk-timeline');box.setAttribute('role','img');
  if(stamped.length<2){box.hidden=true;return box;}
  const from=stamped[0].t,to=stamped.at(-1).t,span=Math.max(1,to-from),N=48;
  const buckets=Array.from({length:N},()=>({n:0,err:0,warn:0}));
  for(const {t,l} of stamped){const b=buckets[Math.min(N-1,Math.floor((t-from)/span*N))];b.n++;if(l.level==='error'||l.level==='fatal')b.err++;else if(l.level==='warn')b.warn++;}
  const max=Math.max(...buckets.map(b=>b.n));
  for(const b of buckets){const col=k.el('span','dk-tick'+(b.err?' err':b.warn?' warn':''));col.style.height=(b.n?Math.max(12,100*b.n/max):4).toFixed(0)+'%';box.append(col);}
  const errs=lines.filter(l=>l.level==='error'||l.level==='fatal').length;
  box.setAttribute('aria-label','Строк по времени, с '+time(stamped[0].l.time)+' по '+time(stamped.at(-1).l.time)+'; ошибок: '+errs);
  box.title=time(stamped[0].l.time)+' — '+time(stamped.at(-1).l.time);
  return box;
 }
 function highlight(k,text,needle){
  const box=raw(k,'span','dk-log-text');
  if(!needle){box.textContent=text;return box;}
  const low=text.toLowerCase(),n=needle.toLowerCase();let at=0,i;
  while((i=low.indexOf(n,at))>=0){box.append(text.slice(at,i),k.el('mark',null,text.slice(i,i+n.length)));at=i+n.length;}
  box.append(text.slice(at));return box;
 }
 function logLines(k,lines,{needle='',level='all',evidence=[]}={}){
  const box=k.el('div','dk-log');box.setAttribute('role','log');box.dataset.noI18n='';
  let shown=0;
  for(const l of lines){
   if(level==='error'&&!['error','fatal'].includes(l.level))continue;
   if(level==='warn'&&l.level!=='warn')continue;
   if(needle&&!l.text.toLowerCase().includes(needle.toLowerCase()))continue;
   const row=k.el('div','dk-log-line lv-'+l.level+(evidence.some(q=>l.text.includes(q))?' evidence':''));
   row.append(k.el('span','dk-log-time',l.time?time(l.time):''),highlight(k,l.text,needle));
   box.append(row);shown++;
  }
  if(!shown)box.append(k.el('div','dk-log-empty','Нет строк под этот фильтр'));
  box.shown=shown;return box;
 }
 window.renderDockerLogs=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.dk-logs-card'))return;
  let lines=d.lines||[],level=d.errors?'error':'all',needle='';
  const body=k.el('div','dk-body');
  const tools=k.el('div','dk-log-tools');
  const search=k.el('input','dk-search');search.type='search';search.placeholder='Найти в логах';search.setAttribute('aria-label','Найти в логах');search.value=d.grep||'';needle=search.value;
  const filters=k.el('div','dk-levels');filters.setAttribute('role','group');filters.setAttribute('aria-label','Уровень');
  for(const [id,label] of LEVELS){const b=button(k,'dk-level',label,()=>{level=id;paint();});b.dataset.level=id;filters.append(b);}
  const counter=k.el('span','dk-muted dk-counter');
  tools.append(search,filters,counter);
  const line=timeline(k,lines);
  let box=null;
  function paint(){
   for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.level===level));
   const next=logLines(k,lines,{needle,level});box?box.replaceWith(next):body.append(next);box=next;
   counter.textContent=next.shown+' из '+lines.length;
   requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight;});
  }
  search.oninput=()=>{needle=search.value.trim();paint();};
  body.append(line,tools);paint();
  const c=d.container||{};
  const meta=['последние '+d.tail+' строк'];if(d.since)meta.push('за '+d.since);if(d.grep)meta.push('со словом «'+d.grep+'»');
  const errs=lines.filter(l=>l.level==='error'||l.level==='fatal').length;
  const status=errs?{label:'ошибок: '+errs,tone:'alert'}:{label:c.state==='running'?'работает':'остановлен',tone:c.state==='running'?'done':'progress'};
  const actions=[{label:'Ещё строк',run:async()=>{const r=await call('logs',c.id||c.name,{tail:Math.min(2000,(d.tail||200)*3),since:d.since});lines=r.lines;d.tail=r.tail;paint();line.replaceWith(timeline(k,lines));}},
   {label:'Почему падает?',run:()=>k.ask('почему падает контейнер '+c.name,{send:true})},
   {label:'Скопировать',run:async()=>{try{await navigator.clipboard.writeText(lines.map(l=>(l.time?l.time+' ':'')+l.text).join('\n'));k.toast('Скопировано');}catch{k.toast('Не удалось скопировать',{error:true});}}}];
  parent.append(k.card({app:'Docker',initial:'▣',color:'#2f5f8a',key:'Логи · '+(c.name||''),status,subtitle:c.image||'',body,meta,actions,className:'dk-card dk-logs-card'}));
 };

 // --- Why it stops --------------------------------------------------------------------------------------------------
 window.renderDockerCrash=(parent,f)=>{
  const k=window.resultKit;if(!k||!f||parent.querySelector('.dk-crash-card'))return;
  const body=k.el('div','dk-body');
  const tiles=k.el('div','dk-tiles');
  const tile=(label,value,tone,note)=>{const t=k.el('div','dk-tile'+(tone?' '+tone:''));t.append(k.el('small',null,label),raw(k,'strong',null,value));if(note)t.append(k.el('span','dk-tile-note',note));tiles.append(t);};
  const live=f.running&&!f.restarting;
  tile('Код выхода',live?'—':String(f.exitCode??'—'),!live&&f.exitCode&&![0,143].includes(f.exitCode)?'alert':'',live?'работает':f.meaning||'');
  tile('OOMKilled',f.oomKilled?'да':'нет',f.oomKilled?'alert':'',f.memoryLimit?'лимит '+ram(f.memoryLimit):'без лимита памяти');
  tile('Перезапусков',String(f.restartCount||0),f.restartCount>2?'alert':f.restartCount?'warn':'',f.restartPolicy&&f.restartPolicy!=='no'?'политика '+f.restartPolicy:'без автоперезапуска');
  tile('Health-check',f.health||'нет',f.health==='unhealthy'?'alert':f.health==='healthy'?'ok':'',f.finishedAt&&!f.running?'остановлен '+when(f.finishedAt):f.startedAt?'запущен '+when(f.startedAt):'');
  body.append(tiles);
  const cause=k.el('div','dk-cause');
  cause.append(raw(k,'p','dk-cause-title',f.cause));
  if(f.explanation)cause.append(raw(k,'p','dk-text',f.explanation));
  if(f.steps?.length){const ul=k.el('ul','dk-steps');ul.dataset.noI18n='';for(const s of f.steps)ul.append(k.el('li',null,s));cause.append(ul);}
  cause.append(k.el('small','dk-muted',f.explainedBy==='model'?'Объяснение модели по фактам Docker и строкам логов ниже':'По коду выхода и логам, без модели'));
  body.append(cause);
  if(f.error)body.append(raw(k,'p','dk-docker-error','Docker: '+f.error));
  if(f.lines?.length){body.append(k.el('div','dk-section','Последние строки логов'));body.append(logLines(k,f.lines.slice(-14),{evidence:f.evidence||[]}));}
  const tone=f.oomKilled||f.exitCode&&![0,143].includes(f.exitCode)&&!f.running||f.restarting?'alert':f.running?'done':'progress';
  const status={label:f.oomKilled?'OOMKilled':f.restarting?'перезапускается':f.running?'работает':'exit '+f.exitCode,tone};
  const facts=(f.facts||[]).join('; ');
  const actions=[{label:'Перезапустить…',run:()=>{const at=body.querySelector('.dk-confirm');if(at)return;body.append(confirmBox(k,{title:'Перезапустить контейнер '+f.name+'?',note:VERB_NOTE.restart,label:'Перезапустить',danger:true,run:async()=>{const r=await call('container','restart',f.id);k.toast(r.container.name+': '+statusText(r.container));}}));}},
   {label:'Логи',run:()=>k.ask('логи контейнера '+f.name,{send:true})},
   k.links('task-tracker',{title:'Падает контейнер '+f.name,description:f.cause+(facts?' — '+facts:'')+(f.lines?.length?'\n'+f.lines.slice(-5).map(l=>l.text).join('\n'):''),type:'bug'}),
   k.links('code-fix',{text:'Разберись, почему падает контейнер '+f.name+' (образ '+f.image+'): '+f.cause+'. Факты: '+facts+'. Последние строки логов: '+(f.lines||[]).slice(-8).map(l=>l.text).join(' | ')})];
  parent.append(k.card({app:'Docker',initial:'▣',color:'#2f5f8a',key:'Почему падает · '+f.name,status,subtitle:f.image,body,actions,className:'dk-card dk-crash-card'}));
 };

 // --- Disk ----------------------------------------------------------------------------------------------------------
 const TYPES={images:'Образы',containers:'Контейнеры',volumes:'Тома',cache:'Кэш сборки'};
 window.renderDockerDisk=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.dk-disk-card'))return;
  const body=k.el('div','dk-body');
  const total=d.total||1;
  const stack=k.el('div','dk-stack');stack.setAttribute('role','img');
  stack.setAttribute('aria-label',d.usage.map(u=>TYPES[u.type]+' '+human(u.size)).join(', '));
  for(const u of d.usage.filter(u=>u.size)){const seg=k.el('span','dk-seg t-'+u.type);seg.style.flexGrow=String(u.size/total);seg.title=TYPES[u.type]+': '+human(u.size);
   if(u.reclaimable){const free=k.el('span','dk-seg-free');free.style.width=Math.min(100,100*u.reclaimable/u.size).toFixed(1)+'%';seg.append(free);}stack.append(seg);}
  const legend=k.el('div','dk-legend');
  for(const u of d.usage){const item=k.el('span','dk-legend-item');const sw=k.el('span','dk-swatch t-'+u.type);item.append(sw,k.el('span',null,TYPES[u.type]),raw(k,'strong',null,human(u.size)));if(u.reclaimable)item.append(k.el('span','dk-muted','можно освободить '+human(u.reclaimable)));legend.append(item);}
  body.append(stack,legend);
  if(d.images?.length){
   body.append(k.el('div','dk-section','Самые большие образы'));
   const max=d.images[0].size||1,list=k.el('div','dk-bars');
   for(const i of d.images){const row=k.el('div','dk-bar-row');const track=k.el('span','dk-bar-track'),fill=k.el('span','dk-bar-fill');fill.style.width=Math.max(1,100*i.size/max).toFixed(1)+'%';track.append(fill);
    row.append(raw(k,'span','dk-bar-name',i.repository+(i.tag&&i.tag!=='<none>'?':'+i.tag:'')),track,raw(k,'span','dk-bar-size',human(i.size)));list.append(row);}
   body.append(list);
  }
  const dangling=d.dangling||[];
  const sum=list=>list.reduce((a,i)=>a+i.size,0);
  const danglingBox=k.el('div','dk-dangling');
  function paintDangling(){
   danglingBox.replaceChildren();
   const left=dangling.filter(i=>!i.removed);
   danglingBox.append(k.el('div','dk-section','Висячие образы (без тега): '+left.length+(left.length?' · '+human(sum(left)):'')));
   if(!left.length){danglingBox.append(k.el('p','dk-muted','Висячих образов нет.'));return;}
   const open=k.el('button','dk-prune','Очистить висячие образы…');open.type='button';
   open.onclick=()=>{open.hidden=true;danglingBox.append(pruneBox());danglingBox.querySelector('.dk-confirm button.primary')?.focus();};
   danglingBox.append(open);
   if(d.confirmPrune){d.confirmPrune=false;open.click();}
  }
  function pruneBox(){
   const left=dangling.filter(i=>!i.removed),chosen=new Set(left.map(i=>i.id));
   const box=k.el('div','dk-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение удаления образов');
   box.append(k.el('p','dk-confirm-title','Удалить эти образы? Они не нужны ни одному тегу; образ, который использует контейнер, Docker не удалит.'));
   const ul=k.el('ul','dk-confirm-list');
   const go=k.el('button','primary dk-danger');go.type='button';const total=k.el('strong','dk-confirm-total');
   const sync=()=>{const s=sum(left.filter(i=>chosen.has(i.id)));total.textContent='Итого: '+human(s)+' · выбрано '+chosen.size;go.textContent='Очистить · '+human(s);go.disabled=!chosen.size;};
   for(const i of left){const li=k.el('li'),label=k.el('label'),input=k.el('input');input.type='checkbox';input.checked=true;input.onchange=()=>{input.checked?chosen.add(i.id):chosen.delete(i.id);sync();};
    label.append(input,raw(k,'code',null,i.id.slice(0,12)),k.el('span','dk-muted',since(i.created)),raw(k,'span','dk-bar-size',human(i.size)));li.append(label);ul.append(li);}
   const cancel=button(k,null,'Отмена',()=>{box.remove();danglingBox.querySelector('.dk-prune')?.removeAttribute('hidden');});
   go.onclick=async()=>{go.disabled=cancel.disabled=true;go.setAttribute('aria-busy','true');
    try{const r=await call('removeDangling',[...chosen]);for(const i of dangling)if(r.removed.includes(i.id))i.removed=true;
     k.toast('Удалено образов: '+r.removed.length+' · освобождено '+human(r.freed)+(r.failed.length?' · не удалось: '+r.failed.map(x=>x.id.slice(0,12)+' — '+x.error).join('; '):''),{error:!r.removed.length});paintDangling();}
    catch(e){k.toast(e.message,{error:true});go.disabled=cancel.disabled=false;}finally{go.removeAttribute('aria-busy');}};
   const bar=k.el('div','dk-confirm-actions');bar.append(total,go,cancel);box.append(ul,bar);sync();return box;
  }
  paintDangling();body.append(danglingBox);
  const status={label:human(d.total),tone:d.reclaimable>d.total/3?'progress':'done',title:'Всего занимает Docker'};
  parent.append(k.card({app:'Docker',initial:'▣',color:'#2f5f8a',key:'Место Docker',status,body,className:'dk-card dk-disk-card',
   meta:['образы удаляются только после подтверждения'],
   actions:[{label:'Что запущено',run:()=>k.ask('что запущено в докере',{send:true})}]}));
 };
})();
