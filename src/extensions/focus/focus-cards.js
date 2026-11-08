// «Фокус», renderer: a ring timer for the session in progress, today's timeline of focus, breaks and meetings,
// the week as bars, tasks of the day and the controls. The newest focus card in the chat stays live (state from
// the `petya-focus` event of focus-chrome.js); older cards keep the snapshot they were answered with.
(()=>{
 // Two cards rendered at once may load this script twice; one copy keeps one live state.
 if(window.renderFocusCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('focus-cards.css',document.currentScript.src).href;document.head.append(style);
 const NS='http://www.w3.org/2000/svg';
 const call=(method,...args)=>window.petya.feature('focusApp',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const hm=t=>new Date(t).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 // Hours and minutes in the interface locale («1 ч 20 мин», «1 hr 20 min»).
 const unit=(n,u)=>{try{return new Intl.NumberFormat(locale(),{style:'unit',unit:u,unitDisplay:'short'}).format(n).replace(/\u00a0/g,' ');}catch{return n+' '+(u==='hour'?'ч':'мин');}};
 const dur=m=>{m=Math.max(0,Math.round(m));const h=Math.floor(m/60),r=m%60;return h?unit(h,'hour')+(r?' '+unit(r,'minute'):''):unit(r,'minute');};
 const clock=ms=>{const s=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(s/60);return (m>=60?Math.floor(m/60)+':'+String(m%60).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s%60).padStart(2,'0');};
 const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const safeHttps=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href.replace(/\/+$/,''):'';}catch{return '';}};
 // The state focus-chrome.js last saw (it loads at startup, this script only with the first card).
 let live=window.petyaFocusState||null,liveOffset=live?Date.now()-live.now:0,seq=0;
 document.addEventListener('petya-focus',event=>{live=event.detail;liveOffset=Date.now()-(event.detail?.now||Date.now());for(const card of document.querySelectorAll('.focus-card'))card.focusRefresh?.();});

 function ring(k){
  const box=k.el('div','focus-ring');
  const R=48,C=2*Math.PI*R;
  const s=svg('svg',{viewBox:'0 0 112 112',width:112,height:112,'aria-hidden':'true'});
  const track=svg('circle',{cx:56,cy:56,r:R,fill:'none','stroke-width':8,class:'focus-ring-track'});
  const arc=svg('circle',{cx:56,cy:56,r:R,fill:'none','stroke-width':8,class:'focus-ring-arc','stroke-dasharray':C,'stroke-dashoffset':C,transform:'rotate(-90 56 56)','stroke-linecap':'round'});
  s.append(track,arc);
  const center=k.el('div','focus-ring-center'),time=k.el('strong','focus-ring-time'),sub=k.el('small','focus-ring-sub');
  center.append(time,sub);box.append(s,center);
  box.set=(left,total,kind,state,subText)=>{arc.setAttribute('stroke-dashoffset',String(C*(1-Math.min(1,Math.max(0,left/total)))));time.textContent=clock(left);sub.textContent=subText;box.dataset.kind=kind;box.dataset.state=state;};
  return box;
 }
 function stats(k,r){
  const grid=k.el('div','focus-stats');
  const cell=(value,label,tone)=>{const c=k.el('div','focus-stat'+(tone?' tone-'+tone:''));c.append(k.el('strong',null,value),k.el('small',null,label));return c;};
  grid.append(cell(dur(r.minutes),'сегодня в фокусе'),cell(String(r.count),'сессии сегодня'),cell(String(r.interruptions),'прервано',r.interruptions?'alert':''),cell(dur(r.weekMinutes),'за неделю'));
  return grid;
 }
 // Today from 08:00 to 20:00 (wider when sessions or meetings fall outside): meetings above, focus and breaks below.
 function timeline(k,r,meetings,now){
  const box=k.el('div','focus-timeline');
  const day=new Date(now);day.setHours(0,0,0,0);
  const times=[...r.timeline.flatMap(x=>[Date.parse(x.start),Date.parse(x.end)]),...meetings.flatMap(m=>[Date.parse(m.start),Date.parse(m.end)]),now];
  const hour=t=>(t-day.getTime())/3600000;
  let from=Math.min(8,Math.floor(Math.min(...times.map(hour)))),to=Math.max(20,Math.ceil(Math.max(...times.map(hour))));
  from=Math.max(0,from);to=Math.min(24,Math.max(to,from+4));
  const x=t=>Math.min(100,Math.max(0,(hour(t)-from)/(to-from)*100));
  const lanes=k.el('div','focus-lanes');
  const lane=(name)=>{const row=k.el('div','focus-lane');row.append(k.el('span','focus-lane-name',name));const track=k.el('div','focus-lane-track');row.append(track);lanes.append(row);return track;};
  const meet=lane('Встречи'),work=lane('Фокус');
  const block=(track,a,b,cls,title)=>{const n=k.el('span','focus-block '+cls);n.style.left=x(a)+'%';n.style.width=Math.max(0.6,x(b)-x(a))+'%';n.title=title;n.dataset.noI18n='';n.setAttribute('aria-label',title);track.append(n);return n;};
  for(const m of meetings)block(meet,Date.parse(m.start),Date.parse(m.end),'is-meeting',hm(m.start)+'–'+hm(m.end)+' · '+m.title);
  for(const s of r.timeline){const cls=s.kind==='break'?'is-break':s.outcome==='stopped'?'is-stopped':s.outcome==='active'?'is-active':'is-focus';block(work,Date.parse(s.start),Date.parse(s.end),cls,hm(s.start)+'–'+hm(s.end)+' · '+(s.kind==='break'?'перерыв':(s.label||s.jira||'фокус')+' · '+dur(s.minutes)));}
  const marker=k.el('span','focus-now');marker.style.left=x(now)+'%';marker.title='Сейчас '+hm(now);
  const axis=k.el('div','focus-axis');
  for(let h=from;h<=to;h+=2){const t=k.el('span',null,String(h).padStart(2,'0')+':00');t.style.left=((h-from)/(to-from)*100)+'%';axis.append(t);}
  const overlay=k.el('div','focus-now-wrap');overlay.append(marker);lanes.append(overlay);
  box.append(lanes,axis);
  const legend=k.el('div','focus-legend');
  for(const [cls,text] of [['is-focus','фокус'],['is-stopped','прервано'],['is-break','перерыв'],['is-meeting','встреча']]){const i=k.el('span');i.append(k.el('i',cls),text);legend.append(i);}
  box.append(legend);
  return box;
 }
 function week(k,r,now){
  const box=k.el('div','focus-week');
  const max=Math.max(60,...r.week.map(d=>d.minutes));
  const today=new Date(now);const key=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  for(const d of r.week){
   const col=k.el('div','focus-bar'+(d.date===key?' is-today':''));
   const value=k.el('small','focus-bar-value',d.minutes?dur(d.minutes):'');
   const bar=k.el('div','focus-bar-track');const fill=k.el('div','focus-bar-fill');fill.style.height=(d.minutes/max*100)+'%';bar.append(fill);
   const name=new Date(d.date+'T12:00').toLocaleDateString(locale(),{weekday:'short'});
   col.append(value,bar,k.el('small','focus-bar-day',name));
   col.title=name+': '+dur(d.minutes)+(d.interruptions?' · прервано '+d.interruptions:'');col.setAttribute('aria-label',col.title);
   box.append(col);
  }
  return box;
 }
 function tasks(k,r,jiraUrl){
  const list=r.tasks.filter(t=>t.label||t.jira);if(!list.length)return null;
  const ul=k.el('ul','focus-tasks');const base=safeHttps(jiraUrl);
  for(const t of list.slice(0,6)){
   const li=k.el('li');
   if(t.jira){const key=base?k.el('a','focus-jira',t.jira):k.el('span','focus-jira',t.jira);if(base){key.href=base+'/browse/'+encodeURIComponent(t.jira);key.target='_blank';key.rel='noopener';}key.dataset.noI18n='';li.append(key);}
   if(t.label){const l=k.el('span','focus-task-label',t.label);l.dataset.noI18n='';li.append(l);}
   li.append(k.el('span','focus-task-time',dur(t.minutes)+(t.count>1?' · '+t.count+' сесс.':'')));
   ul.append(li);
  }
  return ul;
 }

 window.renderFocusCard=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.focus-card'))return;
  let report=d.report,snapshot=d.active,offset=Date.now()-Date.parse(d.now);
  const body=k.el('div','focus-body');
  const top=k.el('div','focus-top'),timer=ring(k),side=k.el('div','focus-side');
  const series=k.el('div','focus-series'),next=k.el('p','focus-next');
  // The meeting title is the user's text; the words around it are translated.
  const title=text=>{const n=k.el('span',null,text);n.dataset.noI18n='';return n;};
  const controls=k.el('div','kit-actions focus-controls');
  const sections=k.el('div','focus-sections');
  top.append(timer,side);body.append(top,controls,sections);
  const statusChip=k.chip({label:'фокус',tone:'progress'});
  const node=k.card({app:'Фокус',initial:'◔',color:'#3f6b4f',key:d.active?.label||d.active?.jira||(d.mode==='report'?(d.period==='week'?'Фокус за неделю':'Фокус за сегодня'):'Фокус'),status:statusChip,body,className:'focus-card'});
  node.dataset.mode=d.mode;
  const keyNode=node.querySelector('.kit-key');if(keyNode&&d.active?.label)keyNode.dataset.noI18n='';
  // The card rendered last (the newest answer) follows the running session; moving nodes does not change it.
  node.focusSeq=++seq;
  const isLive=()=>!!live&&[...document.querySelectorAll('.focus-card')].every(c=>c===node||!(c.focusSeq>node.focusSeq));
  const current=()=>isLive()?{active:live.active,offset:liveOffset}:{active:snapshot,offset};
  const act=(label,fn,primary)=>{const b=k.el('button',primary?'primary':'',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{const r=await fn();if(r){live=r;liveOffset=Date.now()-r.now;report=r.report||report;window.petyaFocusState=r;document.dispatchEvent(new CustomEvent('petya-focus',{detail:r}));}}catch(e){k.toast(e.message,{error:true});}finally{b.disabled=false;}};return b;};
  function paintSections(){
   const meetings=(isLive()&&live.meetings?.length?live.meetings:d.meetings)||[];
   sections.replaceChildren();
   const now=Date.now()-current().offset;
   const head=(text)=>k.el('h5','focus-h',text);
   sections.append(head('Сегодня'),timeline(k,report,meetings,now),head('Неделя'),week(k,report,now));
   const t=tasks(k,report,d.jiraUrl);if(t)sections.append(head('Задачи'),t);
  }
  function paint(){
   if(!node.isConnected&&node.focusPainted)return;
   node.focusPainted=true;
   const {active,offset:off}=current(),now=Date.now()-off;
   const meetings=(isLive()&&live.meetings?.length?live.meetings:d.meetings)||[];
   side.replaceChildren(stats(k,report));
   if(active){
    const left=active.state==='paused'?active.remaining:Math.max(0,active.endsAt-now);
    timer.hidden=false;
    timer.set(left,active.planned,active.kind,active.state,active.state==='paused'?'на паузе':active.kind==='break'?'перерыв':(window.t?window.t('из'):'из')+' '+dur(active.planned/60000));
    statusChip.textContent=active.state==='paused'?'на паузе':active.kind==='break'?'перерыв':'идёт';
    statusChip.className='kit-chip tone-'+(active.state==='paused'?'accent':active.kind==='break'?'progress':'done');
   }else{
    timer.hidden=d.mode!=='session';
    if(d.mode==='session')timer.set(0,1,'focus','done','готово');
    statusChip.textContent=d.mode==='report'?(report.count?dur(report.minutes):'нет сессий'):'завершено';
    statusChip.className='kit-chip tone-'+(d.mode==='report'?'accent':'done');
   }
   series.replaceChildren();
   if(active?.series){for(let i=1;i<=active.series.total;i++){const dot=k.el('i',i<active.series.round||i===active.series.round&&active.kind==='break'?'done':i===active.series.round?'now':'');series.append(dot);}series.append(k.el('small',null,'помидор '+Math.max(1,active.series.round)+' из '+active.series.total));side.append(series);}
   const upcoming=meetings.map(m=>({...m,t:Date.parse(m.start)})).filter(m=>m.t>now).sort((a,b)=>a.t-b.t)[0];
   if(upcoming){next.replaceChildren('Встреча «',title(upcoming.title),'» · '+hm(upcoming.t)+' — через '+dur((upcoming.t-now)/60000)+(active&&active.kind==='focus'&&upcoming.t<now+(active.state==='paused'?active.remaining:active.endsAt-now)?' · раньше конца фокуса':''));next.classList.toggle('is-soon',upcoming.t-now<15*60000);side.append(next);}
   controls.replaceChildren();
   if(active){
    if(active.kind==='focus'){
     controls.append(active.state==='paused'?act('Продолжить',()=>call('resume'),true):act('Пауза',()=>call('pause'),true),act('Стоп',()=>call('stop')),act('Ещё 10 минут',()=>call('extend',10)),act('Перерыв 5',()=>call('breakNow',5)));
    }else controls.append(act('Закончить перерыв',()=>call('stop'),true),act('Ещё 5 минут',()=>call('extend',5)));
   }else{
    controls.append(act('Фокус 25 минут',()=>call('start',{minutes:25}),true),act('Фокус 50 минут',()=>call('start',{minutes:50})),act('Перерыв 5',()=>call('breakNow',5)));
   }
   controls.hidden=!!live&&!isLive();
  }
  node.focusRefresh=()=>{paint();paintSections();};
  paint();paintSections();
  parent.append(node);
  // An older card stops being live (once this one is in the document: the message is attached after rendering).
  const others=()=>{for(const c of document.querySelectorAll('.focus-card'))if(c!==node)c.focusRefresh?.();};
  requestAnimationFrame(others);setTimeout(others,300);
  const timerId=setInterval(()=>{if(!node.isConnected&&node.focusShown){clearInterval(timerId);return;}if(node.isConnected)node.focusShown=true;const a=current().active;if(a&&a.state!=='paused')paint();},1000);
 };
})();
