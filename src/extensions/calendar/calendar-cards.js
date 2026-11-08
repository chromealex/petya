// «Календарь», renderer: a day timeline (hours, event blocks, free gaps, the «сейчас» line), a compact week strip,
// and for a slot search the ranked candidates with everyone's busy time as lanes and the chosen slot highlighted.
// «Поставить встречу» opens a confirm step (editable title, time, attendees, «Видеозвонок»: the video-meeting
// providers of added apps that fit this calendar, known rooms ranked for this meeting, a typed link or none); only «Создать в
// календаре» writes. Events with a link that a meeting-recording provider fits get «Записать Петей» (now, during the
// meeting) or «Петя запишет встречу» (scheduled local recording).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('calendar-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const time=iso=>new Date(iso).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const span=(a,b)=>time(a)+'–'+time(b);
 const dayName=iso=>new Date(iso).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});
 const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const localDay=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d);};
 const mins=hm=>{const m=/^(\d{1,2}):(\d{2})$/.exec(hm||'');return m?+m[1]*60+ +m[2]:null;};
 const minuteOf=iso=>{const d=new Date(iso);return d.getHours()*60+d.getMinutes();};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 // Month names in the genitive, for follow-up requests Petya parses (not for display).
 const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
 const spoken=date=>{const d=localDay(date);return d.getDate()+' '+MONTHS[d.getMonth()];};
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.setAttribute('data-no-i18n','');return n;};
 const timed=list=>(list||[]).filter(e=>!e.allDay);

 // Overlapping events side by side: greedy columns inside each cluster of overlaps.
 function columns(events){
  const sorted=[...events].sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end));
  let cluster=[],end='';const out=new Map();
  const flush=()=>{const cols=[];for(const e of cluster){let i=cols.findIndex(c=>c<=e.start);if(i<0){i=cols.length;cols.push('');}cols[i]=e.end;out.set(e,{col:i});}for(const e of cluster)out.get(e).of=cols.length;cluster=[];};
  for(const e of sorted){if(cluster.length&&e.start>=end)flush();cluster.push(e);if(e.end>end)end=e.end;}
  flush();return out;
 }
 function bounds(c,events,extra=[]){
  let a=mins(c.workStart)??600,b=mins(c.workEnd)??1140;
  for(const e of [...timed(events),...extra]){a=Math.min(a,minuteOf(e.start));const m=minuteOf(e.end)||1440;b=Math.max(b,m<minuteOf(e.start)?1440:m);}
  return [Math.floor(a/60)*60,Math.min(1440,Math.ceil(b/60)*60)];
 }

 function dayTimeline(k,c){
  // TOP/BOTTOM leave room for the first and last hour labels.
  const PX=46/60,TOP=10,[from,to]=bounds(c,c.events,c.free||[]);
  const wrap=k.el('div','cal-day');
  const allDay=(c.events||[]).filter(e=>e.allDay);
  if(allDay.length){const row=k.el('div','cal-allday');for(const e of allDay)row.append(raw(k,'span','cal-allday-chip',e.title));wrap.append(row);}
  const grid=k.el('div','cal-grid');grid.style.height=Math.round((to-from)*PX)+TOP*2+'px';
  grid.setAttribute('role','list');grid.setAttribute('aria-label','Расписание дня');
  const ws=mins(c.workStart)??600,we=mins(c.workEnd)??1140;
  if(ws>from){const off=k.el('div','cal-off');off.style.top=TOP+'px';off.style.height=(ws-from)*PX+'px';grid.append(off);}
  if(we<to){const off=k.el('div','cal-off');off.style.top=TOP+(we-from)*PX+'px';off.style.height=(to-we)*PX+'px';grid.append(off);}
  for(let m=from;m<=to;m+=60){const line=k.el('div','cal-hour');line.style.top=TOP+(m-from)*PX+'px';line.append(k.el('span',null,String(m/60).padStart(2,'0')+':00'));grid.append(line);}
  const place=(node,s,e)=>{const a=Math.max(from,minuteOf(s)),b0=minuteOf(e)||1440,b=Math.min(to,b0<minuteOf(s)?1440:b0);node.style.top=TOP+(a-from)*PX+'px';node.style.height=Math.max(22,(b-a)*PX-2)+'px';if(b-a<30)node.classList.add('short');return b-a;};
  for(const g of c.free||[]){const f=k.el('div','cal-free');place(f,g.start,g.end);f.append(k.el('span',null,'свободно '+span(g.start,g.end)));grid.append(f);}
  const list=timed(c.events),cols=columns(list);
  for(const e of list){
   const pos=cols.get(e),b=k.el('div','cal-event'+(e.declined?' declined':'')+(e.tentative?' tentative':'')+(e.free?' transparent':''));
   b.setAttribute('role','listitem');
   const length=place(b,e.start,e.end);
   b.style.left='calc(52px + (100% - 56px) * '+pos.col+' / '+pos.of+')';b.style.width='calc((100% - 56px) / '+pos.of+' - 4px)';
   const head=k.el('div','cal-event-head');head.append(raw(k,'strong',null,e.title),k.el('span','cal-event-time',span(e.start,e.end)));b.append(head);
   if(length>=40||pos.of===1){
    const meta=k.el('div','cal-event-meta');
    if(e.location)meta.append(raw(k,'span','cal-loc',e.location));
    const link=k.safeUrl(e.link);if(link){const a=k.el('a','cal-join','Подключиться');a.href=link;a.target='_blank';a.rel='noopener';meta.append(a);meta.append(recordLink(k,e,link));}
    if(e.declined)meta.append(k.el('span','cal-tag','отклонено'));else if(e.tentative)meta.append(k.el('span','cal-tag','под вопросом'));
    if(meta.childNodes.length)b.append(meta);
   }
   const url=k.safeUrl(e.url);if(url){b.tabIndex=0;b.title=e.title;b.onclick=ev=>{if(ev.target.closest('a,button'))return;window.open(url,'_blank','noopener');};}
   b.setAttribute('aria-label',e.title+', '+span(e.start,e.end)+(e.location?', '+e.location:''));
   grid.append(b);
  }
  const now=new Date();
  if(c.date===ymd(now)){const m=now.getHours()*60+now.getMinutes();if(m>=from&&m<=to){const line=k.el('div','cal-now');line.style.top=TOP+(m-from)*PX+'px';line.append(k.el('span',null,'сейчас'));grid.append(line);}}
  wrap.append(grid);
  if(!list.length&&!allDay.length&&!(c.free||[]).length)wrap.append(k.el('p','kit-meta','Встреч нет.'));
  return wrap;
 }

 // Local recording of an event: «Записать Петей» while it runs, «Петя запишет встречу» before it starts.
 function recordLink(k,e,link){
  const start=Date.parse(e.start),end=Date.parse(e.end),now=Date.now();
  if(e.declined||!(end>now))return k.el('span');
  const live=now>=start-10*60000;
  const node=k.links('meeting-recording',{when:live?'now':'schedule',title:e.title,start:e.start,end:e.end},{context:{url:link},className:'cal-record',label:live?'Записать Петей':'Петя запишет встречу',
   onDone:r=>{if(r?.scheduled||r?.state)node.replaceChildren(k.el('span','cal-tag',r.scheduled?'запись запланирована':'идёт запись'));}});
  return node;
 }

 function weekStrip(k,c){
  const strip=k.el('div','cal-week');strip.style.setProperty('--days',String(c.days.length));
  const ws=mins(c.workStart)??600,we=mins(c.workEnd)??1140,H=112,today=ymd(new Date());
  for(const d of c.days){
   const col=k.el('button','cal-week-day'+(d.date===today?' today':''));col.type='button';
   const date=localDay(d.date),n=timed(d.events).filter(e=>!e.declined).length;
   const head=k.el('div','cal-week-head');head.append(k.el('span',null,date.toLocaleDateString(locale(),{weekday:'short'})),k.el('strong',null,String(date.getDate())));
   const bar=k.el('div','cal-week-bar');bar.style.height=H+'px';
   const y=m=>Math.max(0,Math.min(H,(m-ws)/(we-ws)*H));
   for(const g of d.free||[]){const f=k.el('div','cal-week-free');f.style.top=y(minuteOf(g.start))+'px';f.style.height=Math.max(2,y(minuteOf(g.end))-y(minuteOf(g.start)))+'px';bar.append(f);}
   for(const e of timed(d.events)){const s=minuteOf(e.start),t=minuteOf(e.end)||1440;if(t<=ws||s>=we)continue;const ev=k.el('div','cal-week-event'+(e.declined?' declined':''));ev.style.top=y(s)+'px';ev.style.height=Math.max(3,y(t)-y(s)-1)+'px';ev.title=time(e.start)+' '+e.title;ev.setAttribute('data-no-i18n','');bar.append(ev);}
   const count=k.el('small','cal-week-count',n?n+' '+plural(n,['встреча','встречи','встреч']):'нет встреч');
   col.append(head,bar,count);
   col.setAttribute('aria-label',date.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'})+': '+count.textContent);
   col.onclick=()=>k.ask('Что у меня '+spoken(d.date),{send:true});
   strip.append(col);
  }
  return strip;
 }

 // Busy lanes for the day of the chosen slot, the slot as a band across all of them.
 function lanes(k,c,slot){
  const day=ymd(new Date(slot.start));
  const extra=[slot];
  let [from,to]=bounds({workStart:c.workStart,workEnd:c.workEnd},[],extra);
  const range=to-from,pct=m=>Math.max(0,Math.min(100,(m-from)/range*100));
  const box=k.el('div','cal-lanes');
  const axis=k.el('div','cal-lane cal-axis');axis.append(k.el('span','cal-lane-name',dayName(slot.start)));const ticks=k.el('div','cal-track');
  for(let m=from;m<=to;m+=60){const t=k.el('span','cal-tick',String(m/60));t.style.left=pct(m)+'%';ticks.append(t);}
  axis.append(ticks);box.append(axis);
  for(const p of c.people){
   const row=k.el('div','cal-lane'+(p.error?' unknown':'')+(slot.busy?.includes(p.email)?' conflict':''));
   const name=k.el('span','cal-lane-name');name.append(k.avatar(p.self?'Вы':p.name,{size:18}),p.self?k.el('span',null,'Вы'):raw(k,'span',null,p.name));name.title=p.email;
   const track=k.el('div','cal-track');
   if(p.error){track.append(k.el('span','cal-lane-error',p.error));}
   for(const b of p.busy||[]){
    const s=new Date(b.start),e=new Date(b.end);if(ymd(s)!==day&&ymd(e)!==day)continue;
    const a=ymd(s)===day?minuteOf(b.start):0,z=ymd(e)===day?minuteOf(b.end):1440;if(z<=from||a>=to)continue;
    const node=k.el('div','cal-busy');node.style.left=pct(a)+'%';node.style.width=Math.max(0.8,pct(z)-pct(a))+'%';node.title=span(b.start,b.end);track.append(node);
   }
   const band=k.el('div','cal-band');band.style.left=pct(minuteOf(slot.start))+'%';band.style.width=(pct(minuteOf(slot.end)||1440)-pct(minuteOf(slot.start)))+'%';track.append(band);
   row.append(name,track);box.append(row);
  }
  return box;
 }

 // «Видеозвонок» of the confirm step: providers, known rooms with the reason they fit, a typed link, none.
 // The default is a room that clearly fits this meeting, else the last choice, else the first provider (providers
 // come in their own order), else none.
 function videoChoice(k,c){
  const box=k.el('fieldset','cal-video');box.append(k.el('legend',null,'Видеозвонок'));
  const list=k.el('div','cal-video-list');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','Видеозвонок');
  const custom=k.el('input','cal-video-url');custom.type='url';custom.placeholder='https://…';custom.hidden=true;custom.setAttribute('aria-label','Ссылка на встречу');
  // A provider that needs its link once (a personal room) asks for it here.
  const linkBox=k.el('div','cal-video-ask');linkBox.hidden=true;let asking='';
  const linkNote=k.el('p','cal-warn');const linkInput=k.el('input','cal-video-url');linkInput.type='url';linkInput.placeholder='https://…';linkInput.setAttribute('aria-label','Ссылка на встречу');linkBox.append(linkNote,linkInput);
  box.append(list,custom,linkBox);
  const name='cal-video-'+c.draftId;let current='none';
  const option=(value,title,hint,{raw:own=false}={})=>{
   const row=k.el('label','cal-video-option');row.dataset.value=value;
   const radio=k.el('input');radio.type='radio';radio.name=name;radio.value=value;
   const text=k.el('span','cal-video-text');const head=own?raw(k,'span','cal-video-title',title):k.el('span','cal-video-title',title);text.append(head);if(hint)text.append(k.el('small',null,hint));
   row.append(radio,text);radio.onchange=()=>pick(value);list.append(row);return row;
  };
  const pick=value=>{current=value;for(const r of list.querySelectorAll('input'))r.checked=r.value===value;custom.hidden=value!=='custom';if(value!==asking)linkBox.hidden=true;if(value==='custom')custom.focus();};
  const fill=({providers=[],rooms=[],strong=''}={})=>{
   list.replaceChildren();
   for(const p of providers)option('p:'+p.id,p.label,p.hint||'');
   for(const r of rooms)option('r:'+r.key,r.name,r.reason,{raw:true});
   option('custom','Своя ссылка…','Ссылка на любую видеовстречу, начиная с https://');
   option('none','Без звонка','');
   const values=[...list.querySelectorAll('input')].map(i=>i.value),last=k.store.get('calendar-video','');
   pick(strong&&values.includes('r:'+strong)?'r:'+strong:values.includes(last)?last:values.find(v=>v.startsWith('p:'))||'none');
  };
  list.append(k.el('small','kit-meta','Загружаю варианты…'));
  window.petyaCalendar.videoChoices(c.draftId).then(fill).catch(()=>fill({}));
  return {node:box,
   value(){
    if(current==='none')return {video:'none'};
    if(current==='custom'){const url=custom.value.trim();if(!/^https:\/\/\S+$/i.test(url)){custom.focus();throw Error('Вставьте ссылку на встречу, начиная с https://');}return {video:{url}};}
    if(current.startsWith('r:'))return {video:{room:current.slice(2)}};
    return {video:current.slice(2),...current===asking&&linkInput.value.trim()?{link:linkInput.value.trim()}:{}};
   },
   askLink(r){asking=current;linkNote.textContent=r.text;if(r.placeholder)linkInput.placeholder=r.placeholder;linkInput.setAttribute('aria-label',r.field||'Ссылка на встречу');linkBox.hidden=false;linkInput.focus();},
   remember(){if(current!=='custom')k.store.set('calendar-video',current);}};
 }

 function slotsView(k,c,cardOf){
  const body=k.el('div','cal-body');
  let chosen=Math.min(Number(c.chosen)||0,Math.max(0,c.slots.length-1));
  const list=k.el('div','cal-slots');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','Варианты времени');
  const lanesBox=k.el('div');
  const paint=()=>{
   list.querySelectorAll('.cal-slot').forEach((b,i)=>{b.classList.toggle('chosen',i===chosen);b.setAttribute('aria-checked',String(i===chosen));});
   lanesBox.replaceChildren(c.slots[chosen]?lanes(k,c,c.slots[chosen]):k.el('span'));
  };
  c.slots.forEach((slot,i)=>{
   const b=k.el('button','cal-slot'+(slot.busy?.length?' conflict':''));b.type='button';b.setAttribute('role','radio');b.dataset.index=String(i);
   const rank=k.el('span','cal-rank',String(i+1));
   const when=k.el('span','cal-slot-when');when.append(k.el('strong',null,dayName(slot.start)),k.el('span',null,span(slot.start,slot.end)));
   const note=k.el('span','cal-slot-note',slot.note||'');
   b.append(rank,when,note);if(slot.requested)b.append(k.el('span','cal-tag','запрошено'));
   b.onclick=()=>{if(c.created)return;chosen=i;paint();};
   list.append(b);
  });
  if(!c.slots.length)body.append(k.el('p','kit-meta','Подходящего времени нет. Попробуйте другой период или короче встречу.'));
  body.append(list,lanesBox);paint();
  const flow=k.el('div','cal-flow');body.append(flow);
  const done=created=>{
   flow.replaceChildren();
   const box=k.el('div','cal-created');box.append(k.el('strong',null,'Встреча создана'),raw(k,'span',null,created.title+' · '+dayName(created.start)+' '+span(created.start,created.end)));
   const links=k.el('div','cal-links');
   const url=k.safeUrl(created.url);if(url){const a=k.el('a',null,'Открыть в календаре');a.href=url;a.target='_blank';a.rel='noopener';links.append(a);}
   const join=k.safeUrl(created.link);if(join){const a=k.el('a',null,'Ссылка на видеозвонок');a.href=join;a.target='_blank';a.rel='noopener';links.append(a);}
   if(links.childNodes.length)box.append(links);
   // Petya records the meeting locally when it starts (offered only by a meeting-recording provider that fits the link).
   if(join){
    const record=k.links('meeting-recording',{when:'schedule',title:created.title,start:created.start,end:created.end},{context:{url:join},label:'Петя запишет встречу',className:'cal-record',
     onDone:r=>{if(r?.scheduled)record.replaceChildren(k.el('span','cal-tag','запись запланирована'));}});
    const row=k.el('div','cal-links');row.append(record);box.append(row);
   }
   flow.append(box);
   const card=cardOf();if(card){card.querySelector(':scope>.kit-actions')?.remove();const chip=card.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent='создано';chip.className='kit-chip tone-done';}}
  };
  if(c.created)done(c.created);
  else if(c.unknown)flow.append(k.el('p','cal-warn','Сервис не ответил при создании — проверьте календарь, прежде чем ставить снова.'));
  const confirm=()=>{
   if(c.created||!c.slots[chosen])return;
   const slot=c.slots[chosen];
   flow.replaceChildren();
   const main=cardOf()?.querySelector(':scope>.kit-actions');if(main)main.hidden=true;
   const form=k.el('div','cal-confirm');
   const label=k.el('label',null,'Название');const input=k.el('input');input.type='text';input.maxLength=200;input.value=c.title||'';input.setAttribute('data-no-i18n','');label.append(input);
   const whenLine=k.el('p','cal-confirm-when',dayName(slot.start)+', '+span(slot.start,slot.end)+' · '+c.duration+' мин');
   const who=k.el('p','cal-confirm-who');who.append(k.el('span',null,'Участники: '));
   who.append(raw(k,'span',null,[c.accountEmail,...(c.attendees||[]).map(a=>a.name&&a.name!==a.email?a.name+' <'+a.email+'>':a.email)].join(', ')));
   const video=videoChoice(k,c);
   const warn=slot.busy?.length?k.el('p','cal-warn','В это время заняты: '+slot.busy.join(', ')):null;
   const row=k.el('div','kit-actions');
   const ok=k.el('button','primary','Создать в календаре');ok.type='button';
   const cancel=k.el('button',null,'Отмена');cancel.type='button';
   let busy=false;
   ok.onclick=async()=>{
    if(busy)return;busy=true;ok.disabled=cancel.disabled=true;ok.setAttribute('aria-busy','true');
    const again=()=>{ok.disabled=cancel.disabled=false;busy=false;ok.removeAttribute('aria-busy');};
    try{
     const r=await window.petya.feature('calendarApp','create',{draftId:c.draftId,slot:chosen,title:input.value,...video.value()});
     // A provider's link (a personal room) is not known yet: ask for it right here, nothing was created.
     if(r.needLink){video.askLink(r);again();return;}
     video.remember();c.created=r.created;c.chosen=chosen;done(r.created);k.toast(r.already?'Эта встреча уже создана':'Встреча создана, приглашения отправлены');
    }
    catch(e){k.toast(e.message,{error:true});again();}
   };
   cancel.onclick=()=>{flow.replaceChildren();if(main)main.hidden=false;};
   row.append(ok,cancel);
   form.append(label,whenLine,who,video.node,...warn?[warn]:[],row);flow.append(form);input.focus();input.select();
  };
  return {body,confirm};
 }

 // Calls of the card that UI tests may replace with fixtures.
 window.petyaCalendar={videoChoices:draftId=>window.petya.feature('calendarApp','videoChoices',draftId),...window.petyaCalendar};
 window.renderCalendarCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.cal-card'))return;
  const n=timed(c.events||c.days?.flatMap(d=>d.events)||[]).filter(e=>!e.declined).length;
  let body,status,actions=[],key;
  const label=c.label?c.label[0].toLocaleUpperCase()+c.label.slice(1):'';
  if(c.mode==='slots'){
   key=c.title||'Встреча';
   const free=c.slots.length&&!c.slots[0].busy?.length;
   status=c.created?{label:'создано',tone:'done'}:c.slots.length?{label:free?'все свободны':'есть конфликты',tone:free?'done':'alert'}:{label:'нет времени',tone:'alert'};
   let node=null;
   const view=slotsView(k,c,()=>node);body=view.body;
   if(!c.created&&c.slots.length)actions.push({label:'Поставить встречу',primary:true,run:()=>view.confirm()});
   const others=(c.attendees||[]).map(a=>a.email).join(', ');
   if(!c.created)actions.push({label:'Другое время',run:()=>k.ask(others?'Найди другое время с '+others+' на следующей неделе':'Найди другое время на следующей неделе')});
   node=k.card({app:'Календарь',initial:'▦',color:'#3f6e8c',key,status,subtitle:c.duration+' мин · '+(c.label||''),body,actions,className:'cal-card'});
   node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
   parent.append(node);
   return;
  }
  if(c.mode==='week'){
   key=label||'Неделя';body=k.el('div','cal-body');body.append(weekStrip(k,c));
   status={label:n?n+' '+plural(n,['встреча','встречи','встреч']):'нет встреч',tone:n?'accent':'done'};
  }else{
   key=label||dayName(c.date);body=k.el('div','cal-body');body.append(dayTimeline(k,c));
   status=c.free?{label:c.free.length?'есть окна':'нет окон',tone:c.free.length?'done':'alert'}:{label:n?n+' '+plural(n,['встреча','встречи','встреч']):'нет встреч',tone:n?'accent':'done'};
   if(c.free?.length)actions.push({label:'Найти время с коллегами',run:()=>k.ask('Найди час '+spoken(c.date)+' с ')});
  }
  const subtitle=c.accountEmail||'';
  parent.append(k.card({app:'Календарь',initial:'▦',color:'#3f6e8c',key,status,subtitle,body,actions,className:'cal-card'}));
 };
})();
