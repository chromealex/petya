// «Логи сервера», renderer: the query that ran, numbers, a histogram over time (errors stacked on all lines), error
// signatures with counts, a share bar and first/last seen, «Почему?» (the model's answer grounded in the lines,
// asked from the card), «Создать задачу» through the task tracker link, and the entries table coloured by level
// with a level filter. «Открыть в Grafana/Kibana» when the source has such a link. All data goes in as text.
(()=>{
 if(window.renderLogsCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('logs-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('logsApp',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';n.classList.add('selectable');return n;};
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const clock=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
 const tick=(iso,step)=>{const d=new Date(iso);if(isNaN(d))return '';return step>=86400e3?d.toLocaleDateString(locale(),{day:'numeric',month:'short'}):step>=3*3600e3?d.toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});};
 const moment=iso=>{if(window.timeElement)return window.timeElement(iso);const t=document.createElement('time');t.dateTime=iso;t.textContent=new Date(iso).toLocaleString(locale());return t;};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 const LEVEL={fatal:{label:'FATAL',tone:'alert'},error:{label:'ERROR',tone:'alert'},warn:{label:'WARN',tone:'progress'},info:{label:'INFO',tone:''},debug:{label:'DEBUG',tone:''}};
 const LANG={logql:'LogQL',kql:'KQL',text:'текст'};
 function span(spec){
  const ms=new Date(spec.range.to)-new Date(spec.range.from),m=Math.round(ms/60e3),h=Math.round(ms/3600e3);
  if(m<60)return 'за '+m+' '+plural(m,['минуту','минуты','минут']);
  if(h<48)return 'за '+h+' '+plural(h,['час','часа','часов']);
  const d=Math.round(h/24);return 'за '+d+' '+plural(d,['день','дня','дней']);
 }

 function histogram(k,h){
  const box=k.el('div','lg-hist');
  const head=k.el('div','lg-hist-head');
  const errs=h.buckets.reduce((a,b)=>a+b.errors,0),all=h.buckets.reduce((a,b)=>a+b.total,0);
  head.append(k.el('span',null,h.exact?'Строк по времени':'Строк по времени (из показанных)'));
  const legend=k.el('span','lg-legend');legend.append(k.el('i','lg-key all'),k.el('span',null,'все'),k.el('i','lg-key err'),k.el('span',null,'ошибки'));
  head.append(legend);
  const bars=k.el('div','lg-bars');bars.setAttribute('role','img');bars.setAttribute('aria-label','Строк: '+fmt(all)+', ошибок: '+fmt(errs));
  const top=Math.max(1,...h.buckets.map(b=>b.total));
  for(const b of h.buckets){
   const col=k.el('span','lg-col');col.title=tick(b.t,h.step)+' — '+fmt(b.total)+' '+plural(b.total,['строка','строки','строк'])+(b.errors?', ошибок '+fmt(b.errors):'');
   const bar=k.el('span','lg-bar');bar.style.height=(b.total?Math.max(4,100*b.total/top):0)+'%';
   const err=k.el('span','lg-bar-err');err.style.height=(b.total?100*b.errors/b.total:0)+'%';
   bar.append(err);col.append(bar);bars.append(col);
  }
  const axis=k.el('div','lg-axis');
  const pick=[0,Math.floor((h.buckets.length-1)/2),h.buckets.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  for(const i of pick)axis.append(k.el('span',null,tick(h.buckets[i].t,h.step)));
  box.append(head,bars,axis);
  return box;
 }

 function groupRow(k,g,c,top){
  const row=k.el('div','lg-group'+(g.level==='fatal'||g.level==='error'?' err':' warn'));
  const count=k.el('div','lg-count');count.append(k.el('strong',null,fmt(g.count)),k.el('small',null,plural(g.count,['раз','раза','раз'])));
  const main=k.el('div','lg-group-main');
  const sig=raw(k,'code','lg-sig',g.signature);sig.title=g.samples?.[0]||g.signature;
  const share=k.el('span','lg-share');const fill=k.el('span');fill.style.width=Math.max(3,100*g.count/top)+'%';share.append(fill);
  const meta=k.el('div','lg-meta');
  if(g.services?.length)meta.append(raw(k,'span','lg-svc',g.services.join(', ')));
  if(g.first){const f=k.el('span');f.append('впервые ',moment(g.first));meta.append(f);}
  if(g.last&&g.last!==g.first){const l=k.el('span');l.append('последний раз ',moment(g.last));meta.append(l);}
  main.append(sig,share,meta);
  const actions=k.el('div','lg-group-actions');
  const answer=k.el('div','lg-why');answer.hidden=true;
  const why=k.el('button','lg-mini','Почему?');why.type='button';
  why.onclick=async()=>{
   if(why.disabled)return;why.disabled=true;why.setAttribute('aria-busy','true');answer.hidden=false;answer.replaceChildren(k.el('p','lg-muted','Смотрю на строки…'));
   const context=(c.entries||[]).filter(e=>e.level==='error'||e.level==='fatal').slice(0,20).map(e=>e.message);
   try{
    const r=await call('why',g,context);
    answer.replaceChildren();
    answer.append(raw(k,'p','lg-cause',r.cause));
    if(r.explanation)answer.append(raw(k,'p','lg-explain',r.explanation));
    if(r.evidence?.length){const ul=k.el('ul','lg-evidence');for(const q of r.evidence)ul.append(raw(k,'li',null,q));answer.append(k.el('small','lg-muted','Опирается на строки:'),ul);}
    else answer.append(k.el('small','lg-muted','Модель не процитировала строк — проверьте вывод сами.'));
    if(r.steps?.length){const ol=k.el('ol','lg-steps');for(const s of r.steps)ol.append(raw(k,'li',null,s));answer.append(ol);}
    group.dataset.explained='1';
   }catch(e){answer.replaceChildren(k.el('p','lg-muted error',e.message));}
   finally{why.disabled=false;why.removeAttribute('aria-busy');}
  };
  const lines=k.el('button','lg-mini','Строки');lines.type='button';
  const samples=k.el('div','lg-samples');samples.hidden=true;
  for(const s of g.samples||[])samples.append(raw(k,'pre','lg-sample',s));
  lines.onclick=()=>{samples.hidden=!samples.hidden;lines.setAttribute('aria-expanded',String(!samples.hidden));};
  const where=c.source?.name+(g.services?.length?' · '+g.services.join(', '):'');
  actions.append(why,lines,k.links('task-tracker',()=>({title:'Ошибка в логах: '+g.signature.slice(0,120),
   description:'Источник: '+where+'\nПовторов: '+g.count+' '+span(c.spec)+'\nВпервые: '+(g.first||'—')+'\nПоследний: '+(g.last||'—')+'\n\nПримеры строк:\n'+(g.samples||[]).slice(0,3).join('\n')+(c.spec.query?'\n\nЗапрос ('+(LANG[c.spec.language]||c.spec.language)+'): '+c.spec.query:''),
   link:c.explore?.url||'',type:'bug'}),{label:'Создать задачу'}));
  row.append(count,main,actions);
  const group=k.el('div','lg-group-box');group.append(row,samples,answer);
  return group;
 }

 function entriesTable(k,c){
  const box=k.el('div','lg-entries');
  const bar=k.el('div','lg-filter');bar.setAttribute('role','group');bar.setAttribute('aria-label','Уровень строк');
  const counts={all:c.entries.length,error:c.entries.filter(e=>e.level==='error'||e.level==='fatal').length,warn:c.entries.filter(e=>e.level==='warn').length};
  let mode='all',shown=40;
  const list=k.el('div','lg-lines');list.setAttribute('role','list');
  const more=k.el('button','lg-more');more.type='button';
  const paint=()=>{
   const rows=c.entries.filter(e=>mode==='all'||(mode==='error'?e.level==='error'||e.level==='fatal':e.level==='warn'));
   list.replaceChildren(...rows.slice(0,shown).map(e=>{
    const li=k.el('div','lg-line lv-'+e.level);li.setAttribute('role','listitem');
    const t=k.el('time','lg-time',clock(e.ts));t.dateTime=e.ts;t.dataset.absolute='';t.title=new Date(e.ts).toLocaleString(locale());
    const lv=k.el('span','lg-level',LEVEL[e.level]?.label||e.level);
    const svc=raw(k,'span','lg-line-svc',e.service||'');svc.title=Object.entries(e.labels||{}).map(([a,b])=>a+'='+b).join('\n');
    const msg=raw(k,'span','lg-msg',e.message);msg.title='Нажмите, чтобы развернуть';msg.onclick=()=>li.classList.toggle('open');
    li.append(t,lv,svc,msg);return li;
   }));
   more.hidden=rows.length<=shown;more.textContent='Ещё строк: '+(rows.length-shown);
   for(const b of bar.children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  };
  for(const [id,label] of [['all','Все'],['error','Ошибки'],['warn','Предупреждения']]){
   const b=k.el('button','lg-tab');b.type='button';b.dataset.mode=id;b.append(k.el('span',null,label),k.el('small',null,fmt(counts[id])));
   b.disabled=!counts[id]&&id!=='all';b.onclick=()=>{mode=id;shown=40;paint();};bar.append(b);
  }
  more.onclick=()=>{shown+=80;paint();};
  box.append(bar,list,more);paint();
  return box;
 }

 window.renderLogsCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.spec||parent.querySelector('.lg-card'))return;
  const body=k.el('div','lg-body');
  const q=k.el('div','lg-query');
  q.append(k.el('span','lg-lang',LANG[c.spec.language]||c.spec.language),raw(k,'code','lg-q',c.spec.query||'—'));
  if(c.by==='model')q.title='Запрос составила локальная модель; Петя проверил и ограничил его';
  body.append(q);
  const errors=c.histogram?.exact?c.histogram.buckets.reduce((a,b)=>a+b.errors,0):c.entries.filter(e=>e.level==='error'||e.level==='fatal').length;
  const tiles=k.el('div','lg-tiles');
  const tile=(value,label,tone='')=>{const t=k.el('div','lg-tile'+(tone?' '+tone:''));t.append(k.el('strong',null,value),k.el('span',null,label));tiles.append(t);};
  tile(fmt(c.total)+(c.truncated&&c.total<=c.entries.length?'+':''),plural(c.total,['строка','строки','строк']));
  tile(fmt(errors),plural(errors,['ошибка','ошибки','ошибок']),errors?'alert':'done');
  tile(fmt(c.groups.length),plural(c.groups.length,['вид ошибки','вида ошибок','видов ошибок']));
  if(c.spec.filters?.services?.length){const t=k.el('div','lg-tile');t.append(raw(k,'strong',null,c.spec.filters.services.join(', ')),k.el('span',null,'сервис'));tiles.append(t);}
  body.append(tiles);
  if(c.histogram?.buckets?.length)body.append(histogram(k,c.histogram));
  if(c.groups.length){
   body.append(k.el('div','lg-section',c.groups[0].level==='warn'?'Частые предупреждения':'Частые ошибки'));
   const top=c.groups[0].count;
   body.append(k.collapse(c.groups.map(g=>groupRow(k,g,c,top)),4,'Ещё виды ошибок'));
  }
  if(c.entries.length){
   body.append(k.el('div','lg-section','Строки'+(c.entries.length<c.total?' — последние '+fmt(c.entries.length)+' из '+fmt(c.total):'')));
   body.append(entriesTable(k,c));
  }else body.append(k.el('p','lg-muted','Ничего не нашлось за этот период. Попробуйте период длиннее или другой сервис.'));
  for(const n of c.notes||[])body.append(raw(k,'p','lg-note',n));
  const actions=[];
  if(c.explore?.url){const a=k.el('a','lg-explore',c.explore.label||'Открыть');a.href=k.safeUrl(c.explore.url);a.target='_blank';a.rel='noopener';
   a.onclick=e=>{if(window.openChatBrowser&&!e.metaKey&&!e.ctrlKey){e.preventDefault();window.openChatBrowser(c.explore.url);}};actions.push(a);}
  if(errors&&!(c.spec.filters?.levels||[]).includes('error'))actions.push({label:'Только ошибки',run:()=>k.ask('Только ошибки в логах '+(c.spec.filters?.services?.length?'сервиса '+c.spec.filters.services[0]+' ':'')+span(c.spec),{send:true})});
  if(new Date(c.spec.range.to)-new Date(c.spec.range.from)<20*3600e3)actions.push({label:'За сутки',run:()=>k.ask('Логи '+(c.spec.filters?.services?.length?'сервиса '+c.spec.filters.services[0]+' ':'сервера ')+'за сутки'+((c.spec.filters?.levels||[]).includes('error')?', только ошибки':''),{send:true})});
  const status=errors?{label:'ошибок: '+fmt(errors),tone:'alert'}:{label:c.entries.length?'без ошибок':'пусто',tone:c.entries.length?'done':''};
  parent.append(k.card({app:'Логи сервера',initial:'≡',color:'#3e5568',key:c.source?.name||'Логи',status,subtitle:span(c.spec),body,actions,className:'lg-card'}));
 };
})();
