// «Учёт времени», renderer: the period's total split by category (a stacked bar), the day's timeline (activity
// colored by category, meetings from «Календарь» and focus sessions of «Фокус» above it) or the week as stacked day
// columns, the top apps / projects / tasks with bars and an editable category, CSV export and «Записать время в
// Jira» with a preview the user ticks and confirms (nothing is written before that).
(()=>{
 if(window.renderTimeCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('time-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('timeTracking',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const hm=t=>new Date(t).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const unit=(n,u)=>{try{return new Intl.NumberFormat(locale(),{style:'unit',unit:u,unitDisplay:'short'}).format(n).replace(/\u00a0/g,' ');}catch{return n+' '+(u==='hour'?'ч':'мин');}};
 const dur=ms=>{const m=Math.max(0,Math.round(ms/60000)),h=Math.floor(m/60),r=m%60;return h?unit(h,'hour')+(r?' '+unit(r,'minute'):''):unit(r,'minute');};
 const IDS=['work','meetings','communication','other'];
 const open=url=>{if(typeof window.openChatBrowser==='function')window.openChatBrowser(url);else window.open(url,'_blank','noopener');};

 // The total split by category: one stacked bar and a legend with durations.
 function split(k,c){
  const box=k.el('div','time-split');
  const head=k.el('div','time-total');const what=k.el('small',null,c.app?c.app.query:'учтено');if(c.app)what.dataset.noI18n='';head.append(k.el('strong',null,dur(c.total)),what);
  const bar=k.el('div','time-bar');bar.setAttribute('role','img');
  const legend=k.el('div','time-legend');
  const parts=[];
  for(const id of IDS){
   const x=c.categories.find(v=>v.id===id);if(!x||!x.ms)continue;
   const seg=k.el('span','time-seg');seg.style.width=(x.ms/Math.max(1,c.total)*100)+'%';seg.style.background=c.colors[id];seg.title=c.labels[id]+' · '+dur(x.ms);bar.append(seg);
   const item=k.el('span','time-key');const dot=k.el('i');dot.style.background=c.colors[id];item.append(dot,k.el('span',null,c.labels[id]),k.el('b',null,dur(x.ms)));legend.append(item);
   parts.push(c.labels[id]+' '+dur(x.ms));
  }
  bar.setAttribute('aria-label',parts.join(', '));
  box.append(head,bar,legend);return box;
 }
 // The day from 08:00 to 20:00 (wider when activity falls outside): meetings, focus, then activity by category.
 function timeline(k,c){
  const box=k.el('div','time-timeline');
  const day=new Date(c.period.from);
  const hour=t=>(t-day.getTime())/3600000;
  const times=[...c.timeline.flatMap(b=>[b.start,b.end]),...c.meetings.flatMap(m=>[m.start,m.end]),...c.focus.flatMap(f=>[f.start,f.end])];
  let from=times.length?Math.min(8,Math.floor(Math.min(...times.map(hour)))):8,to=times.length?Math.max(20,Math.ceil(Math.max(...times.map(hour)))):20;
  from=Math.max(0,from);to=Math.min(24,Math.max(to,from+4));
  const x=t=>Math.min(100,Math.max(0,(hour(t)-from)/(to-from)*100));
  const lanes=k.el('div','time-lanes');
  const lane=name=>{const row=k.el('div','time-lane');row.append(k.el('span','time-lane-name',name));const track=k.el('div','time-lane-track');row.append(track);lanes.append(row);return track;};
  const block=(track,a,b,color,title,cls='')=>{const n=k.el('span','time-block'+(cls?' '+cls:''));n.style.left=x(a)+'%';n.style.width=Math.max(0.4,x(b)-x(a))+'%';if(color)n.style.background=color;n.title=title;n.dataset.noI18n='';track.append(n);return n;};
  if(c.calendar||c.meetings.length){const t=lane('Встречи');for(const m of c.meetings)block(t,m.start,m.end,'','',' is-meeting').title=hm(m.start)+'–'+hm(m.end)+' · '+m.title;}
  if(c.focus.length){const t=lane('Фокус');for(const f of c.focus)block(t,f.start,f.end,'','',' is-focus').title=hm(f.start)+'–'+hm(f.end)+(f.label?' · '+f.label:'');}
  const act=lane('Активность');act.classList.add('is-main');
  for(const b of c.timeline)block(act,b.start,b.end,c.colors[b.category],hm(b.start)+'–'+hm(b.end)+' · '+c.labels[b.category]+' · '+b.label);
  if(!c.timeline.length)act.append(k.el('span','time-empty','Нет данных за этот день'));
  const today=Date.now();
  if(today>=c.period.from&&today<c.period.to&&hour(today)>=from&&hour(today)<=to){const wrap=k.el('div','time-now-wrap');const m=k.el('span','time-now');m.style.left=x(today)+'%';m.title='Сейчас '+hm(today);wrap.append(m);lanes.append(wrap);}
  const axis=k.el('div','time-axis');
  for(let h=from;h<=to;h+=2){const t=k.el('span',null,String(h).padStart(2,'0')+':00');t.style.left=((h-from)/(to-from)*100)+'%';axis.append(t);}
  box.append(lanes,axis);return box;
 }
 // The week or month: one stacked column per day.
 function columns(k,c){
  const box=k.el('div','time-days');
  const max=Math.max(1,...c.days.map(d=>Object.values(d.by).reduce((a,b)=>a+b,0)));
  const compact=c.days.length>10;
  for(const d of c.days){
   const sum=Object.values(d.by).reduce((a,b)=>a+b,0);
   const col=k.el('div','time-day'+(compact?' compact':''));
   const stack=k.el('div','time-stack');stack.title=new Date(d.from).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'})+' · '+dur(sum);
   for(const id of IDS){if(!d.by[id])continue;const seg=k.el('span');seg.style.height=(d.by[id]/max*100)+'%';seg.style.background=c.colors[id];stack.append(seg);}
   col.append(k.el('small','time-day-sum',sum?dur(sum).replace(/ \d+ мин$/,''):''),stack,k.el('small','time-day-name',new Date(d.from).toLocaleDateString(locale(),compact?{day:'numeric'}:{weekday:'short',day:'numeric'})));
   box.append(col);
  }
  return box;
 }
 // Top rows: name, bar, duration; for apps a category chip that changes the user's mapping.
 function rows(k,c,repaint){
  const list=k.el('ul','time-rows'+(c.mode==='app'&&!c.app?' with-cats':''));
  const max=Math.max(1,...c.rows.map(r=>r.ms));
  for(const r of c.rows){
   const li=k.el('li','time-row');
   const name=k.el(r.url?'a':'span','time-name',r.key);name.dataset.noI18n='';
   if(r.url){name.href=r.url;name.onclick=e=>{e.preventDefault();open(r.url);};}
   const label=k.el('div','time-label');label.append(name);
   const sub=r.top||r.detail;if(sub){const s=k.el('small',null,sub);if(r.top||c.mode!=='app')s.dataset.noI18n='';label.append(s);}
   const bar=k.el('div','time-row-bar');const fill=k.el('span');fill.style.width=(r.ms/max*100)+'%';fill.style.background=c.colors[r.category]||c.colors.other;bar.append(fill);
   li.append(label,bar,k.el('span','time-dur',dur(r.ms)));
   if(c.mode==='app'&&!c.app){
    const chip=k.chip({label:c.labels[r.category],title:'Категория приложения',menu:async()=>[...IDS.map(id=>({label:c.labels[id],id,current:id===r.category})),{label:'По умолчанию',id:'auto'}],
     pick:async o=>{await call('setCategory',r.key,o.id);k.toast(o.id==='auto'?'Категория по умолчанию вернётся в следующем ответе':'Новая категория для '+r.key+': '+c.labels[o.id]);if(o.id!=='auto'){r.category=o.id;repaint();}}});
    chip.classList.add('time-cat');chip.style.setProperty('--cat',c.colors[r.category]);li.append(chip);
   }
   list.append(li);
  }
  return list;
 }
 // «Записать время в Jira»: the preview with checkboxes, then one confirmed write.
 async function worklog(k,c,box){
  box.replaceChildren(k.el('small','kit-meta','Готовлю предпросмотр…'));box.hidden=false;
  let p;try{p=await call('worklogPreview',c.period.from,c.period.to);}catch(e){box.replaceChildren(k.el('p','time-warn',e.message));return;}
  box.replaceChildren();
  box.append(k.el('h5','time-h','Записать время в Jira — предпросмотр'));
  if(!p.rows.length){box.append(k.el('p','kit-meta','Задач Jira в заголовках окон за этот период не нашлось (меньше 5 минут не предлагается).'));return;}
  const chosen=new Set(p.rows.filter(r=>!r.done).map(r=>r.id));
  const ul=k.el('ul','time-wl');
  const confirm=k.el('button','primary');confirm.type='button';
  const sync=()=>{const sec=p.rows.filter(r=>chosen.has(r.id)).reduce((n,r)=>n+r.seconds,0);confirm.textContent='Записать в Jira: '+dur(sec*1000);confirm.disabled=!chosen.size;};
  for(const r of p.rows){
   const li=k.el('li');li.dataset.row=r.id;
   const box2=k.el('input');box2.type='checkbox';box2.checked=chosen.has(r.id);box2.disabled=r.done;box2.setAttribute('aria-label','Записать '+r.key);
   box2.onchange=()=>{box2.checked?chosen.add(r.id):chosen.delete(r.id);sync();};
   const key=k.el('b',null,r.key);key.dataset.noI18n='';
   const title=k.el('span','time-wl-title',r.title||'');title.dataset.noI18n='';
   li.append(box2,key,title,k.el('span','time-wl-day',new Date(r.day+'T12:00:00').toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'})),k.el('span','time-dur',dur(r.seconds*1000)));
   if(r.done)li.append(k.el('small','time-wl-state','уже записано'));
   ul.append(li);
  }
  const row=k.el('div','kit-actions');
  const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>{box.hidden=true;box.replaceChildren();};
  confirm.onclick=async()=>{
   confirm.disabled=true;cancel.disabled=true;confirm.setAttribute('aria-busy','true');
   try{
    const results=await call('worklogWrite',p.id,[...chosen]);
    for(const res of results){const li=ul.querySelector('[data-row="'+CSS.escape(res.id)+'"]');if(!li)continue;li.querySelector('input').disabled=true;li.append(k.el('small','time-wl-state '+(res.ok?'ok':'bad'),res.ok?'записано':res.error||'ошибка'));}
    const ok=results.filter(r=>r.ok).length;k.toast(ok===results.length?'Время записано в Jira':'Записано в Jira: '+ok+' / '+results.length,{error:ok!==results.length});
    confirm.remove();cancel.textContent='Закрыть';cancel.disabled=false;
   }catch(e){k.toast(e.message,{error:true});confirm.disabled=false;cancel.disabled=false;}
   finally{confirm.removeAttribute('aria-busy');}
  };
  row.append(confirm,cancel);sync();
  box.append(ul,k.el('small','kit-meta','Длительность округлена до 5 минут; в комментарий ворклога попадёт заголовок окна. Без нажатия «Записать» ничего не отправляется.'),row);
 }

 window.renderTimeCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.time-card'))return;
  const body=k.el('div','time-body');
  const paint=()=>{
   body.replaceChildren();
   if(!c.tracking.enabled){
    const note=k.el('div','time-off');
    note.append(k.el('p',null,'Учёт времени выключен. Если включить, Петя будет запоминать, какое приложение и окно на переднем плане, — только на этом компьютере. Заголовки окон менеджеров паролей, банков и приватных вкладок не сохраняются.'));
    const on=k.el('button','primary','Включить учёт');on.type='button';
    on.onclick=async()=>{on.disabled=true;try{await window.petya.feature('activity','enable',true);c.tracking.enabled=true;k.toast('Учёт времени включён');paint();}catch(e){k.toast(e.message,{error:true});on.disabled=false;}};
    note.append(on);body.append(note);
    if(!c.total)return;
   }
   body.append(split(k,c));
   if(c.period.kind==='day')body.append(timeline(k,c));else if(c.days.length)body.append(columns(k,c));
   if(c.rows.length){
    body.append(k.el('h5','time-h',c.mode==='task'?'По задачам':c.mode==='project'?'По проектам':c.app?'Окна':'Приложения'));
    body.append(rows(k,c,paint));
    if(c.untagged>60000)body.append(k.el('small','kit-meta',(c.mode==='task'?'Без задачи: ':'Без проекта: ')+dur(c.untagged)));
   }else if(c.total&&(c.mode==='task'||c.mode==='project'))body.append(k.el('p','kit-meta',c.mode==='task'?'Задач Jira (ключей вида BW-123) в заголовках окон не нашлось.':'Проектов в заголовках окон редакторов не нашлось.'));
   body.append(wl);
  };
  const wl=k.el('div','time-worklog');wl.hidden=true;
  paint();
  const status=!c.tracking.enabled?{label:'учёт выключен',tone:'alert'}:c.tracking.paused?{label:'на паузе',tone:'progress'}:{label:'учёт идёт',tone:'done'};
  const actions=[];
  if(c.total)actions.push({label:'Скачать CSV',primary:!!c.exportReady,run:async()=>{const r=await call('exportCsv',c.period.from,c.period.to,c.period.label);if(r?.path)k.toast('Сохранено строк: '+r.rows);}});
  if(c.jira&&c.total)actions.push({label:'Записать время в Jira',primary:!!c.worklog,run:()=>worklog(k,c,wl)});
  if(c.mode!=='task'&&c.total)actions.push({label:'По задачам',run:()=>k.ask('Время по задачам за '+(c.period.kind==='day'?c.period.label:'неделю'),{send:true})});
  if(c.mode!=='project'&&c.total)actions.push({label:'По проектам',run:()=>k.ask('Время по проектам за '+(c.period.kind==='day'?c.period.label:'неделю'),{send:true})});
  const label=c.period.kind==='day'?new Date(c.period.from).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'}):new Date(c.period.from).toLocaleDateString(locale(),{day:'numeric',month:'short'})+' – '+new Date(c.period.to-1).toLocaleDateString(locale(),{day:'numeric',month:'short'});
  const card=k.card({app:'Учёт времени',initial:'⏱',color:'#4f6f63',key:label,status,body,actions,className:'time-card'});
  parent.append(card);
  if(c.worklog&&c.jira&&c.total)worklog(k,c,wl);
 };
})();
