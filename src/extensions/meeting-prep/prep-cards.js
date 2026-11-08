// «Подготовка к встрече», renderer: the meeting (time, title, join link), attendees with team photos and roles,
// a «В прошлый раз» timeline of past meetings with their decisions, open tasks with tracker status chips, related
// Slack threads, and «Предлагаю обсудить» — each point with chips naming the facts it rests on. Actions: open the
// call, record the meeting (meeting-recording link), send the agenda to the attendees (share-message link) and,
// for the organizer, add it to the event's description after an explicit confirmation in the card.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('prep-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('meetingPrep',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const time=iso=>new Date(iso).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const date=iso=>new Date(iso).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});
 const short=iso=>new Date(iso).toLocaleDateString(locale(),{day:'numeric',month:'short'});
 // Service, user and model content is left alone by the UI translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const TONE={done:'done',progress:'progress',new:'accent'};
 const section=(k,title,count)=>{const box=k.el('section','mp-section');const h=k.el('h5','mp-head');h.append(k.el('span',null,title));if(count!==undefined)h.append(k.el('small',null,String(count)));box.append(h);return box;};
 function when(k,c){
  const e=c.event,box=k.el('div','mp-when');
    const clock=k.el('div','mp-clock');clock.append(k.el('strong',null,time(e.start)),k.el('span',null,time(e.end)));
  const info=k.el('div','mp-when-info');
  info.append(k.el('span','mp-date',date(e.start)));
  if(e.location)info.append(raw(k.el('span','mp-loc',e.location)));
  box.append(clock,info);
  return box;
 }
 function attendees(k,c){
  const box=section(k,'Участники',c.attendees.length),row=k.el('ul','mp-people');
  for(const a of c.attendees.slice(0,12)){
   const li=k.el('li','mp-person'+(a.self?' self':''));li.title=a.email;
   const text=k.el('div','mp-person-text');text.append(a.self?k.el('span','mp-person-name','Вы'):raw(k.el('span','mp-person-name',a.name)));
   text.append(a.role?raw(k.el('small',null,a.role)):k.el('small',null,a.known||a.self?'':'нет в «Команде»'));
   const face=k.avatar(a.self?a.email:a.name,{size:30});if(a.self&&!face.querySelector('img'))face.textContent='Я';li.append(face,text);row.append(li);
  }
  if(c.attendees.length>12)row.append(k.el('li','mp-more','+'+(c.attendees.length-12)));
  box.append(row);return box;
 }
 function timeline(k,c,ask){
  const box=section(k,'В прошлый раз',c.history.length||undefined);
  if(!c.history.length){box.append(k.el('p','mp-empty','Прошлых встреч с этими людьми или под этим названием за 30 дней нет.'));return box;}
  const list=k.el('ol','mp-timeline');
  for(const h of c.history){
   const li=k.el('li','mp-past'+(h.decisions.length?' has-summary':h.recorded?' recorded':''));
   const top=k.el('div','mp-past-top');
   top.append(k.el('span','mp-past-date',short(new Date(h.at).toISOString())),raw(k.el('span','mp-past-title',h.title)));
   top.append(k.el('span','mp-badge',h.decisions.length||h.tasks.length?'сводка':h.recorded?'запись без сводки':'без записи'));
   li.append(top);
   if(h.decisions.length){const ul=k.el('ul','mp-decisions');for(const d of h.decisions.slice(0,3))ul.append(raw(k.el('li',null,d)));if(h.decisions.length>3)ul.append(k.el('li','mp-dim','ещё решений: '+(h.decisions.length-3)));li.append(ul);}
   if(h.open?.length){const p=k.el('p','mp-open');p.append(k.el('span',null,'Не обсудили: '),raw(k.el('span',null,h.open.slice(0,2).join('; '))));li.append(p);}
   if(h.recorded&&!h.decisions.length&&!h.tasks.length&&h.sessionId){
    const b=k.el('button','mp-inline','Собрать сводку');b.type='button';b.title='Петя соберёт сводку этой записи локальной моделью';
    b.onclick=async ev=>{ev.stopPropagation();b.disabled=true;try{await window.petya.feature('meetingSummary','summarize',h.sessionId);k.toast('Сводка собрана',{action:{label:'Обновить подготовку',run:ask}});}catch(e){k.toast(e.message,{error:true});}finally{b.disabled=false;}};
    li.append(b);
   }
   list.append(li);
  }
  box.append(list);return box;
 }
 function tasks(k,c){
  if(!c.tasks.length)return null;
  const done=c.tasks.filter(t=>t.tracker?.category==='done').length;
  const box=section(k,'Открытые задачи',c.trackers.length?done+' из '+c.tasks.length+' готово':c.tasks.length);
  if(c.trackers.length&&c.tasks.length){const bar=k.el('div','mp-progress');bar.setAttribute('role','img');bar.setAttribute('aria-label','Готово '+done+' из '+c.tasks.length);
   for(const cat of ['done','progress','new','none']){const n=c.tasks.filter(t=>(t.tracker?.category||'none')===cat).length;if(!n)continue;const seg=k.el('span','mp-seg '+cat);seg.style.flexGrow=String(n);bar.append(seg);}box.append(bar);}
  const ul=k.el('ul','mp-tasks');
  for(const t of c.tasks){
   const li=k.el('li','mp-task');
   const text=k.el('div','mp-task-text');text.append(raw(k.el('span',null,t.what)));
   const meta=k.el('small','mp-task-from','с встречи '+short(new Date(t.from.at).toISOString()));text.append(meta);
   const chips=k.el('div','kit-chips');
   if(t.who)chips.append(raw(k.chip({label:t.who,who:t.who})));
   if(t.due)chips.append(k.chip({label:'Срок: '+t.due,tone:'progress'}));
   if(t.tracker){
    const chip=k.chip({label:(t.tracker.key?t.tracker.key+' · ':'')+t.tracker.status,tone:TONE[t.tracker.category]||'',title:t.tracker.title});raw(chip);
    const url=k.safeUrl(t.tracker.url);
    if(url){const a=k.el('a','mp-chip-link');a.href=url;a.target='_blank';a.rel='noopener';a.append(chip);chips.append(a);}else chips.append(chip);
   }else if(c.trackers.length)chips.append(k.chip({label:'нет в трекере',title:'Не нашлось похожей задачи в '+c.trackers.map(x=>x==='jira'?'Jira':'Asana').join(', ')}));
   li.append(text,chips);ul.append(li);
  }
  box.append(ul);
  if(c.trackerError)box.append(raw(k.el('p','mp-warn',c.trackerError)));
  return box;
 }
 function slack(k,c){
  if(!c.slack.length)return null;
  const box=section(k,'Треды Slack',c.slack.length),ul=k.el('ul','mp-threads');
  for(const t of c.slack){
   const li=k.el('li');const url=k.safeUrl(t.url);
   const head=url?k.el('a','mp-thread-title',t.title):k.el('span','mp-thread-title',t.title);if(url){head.href=url;head.target='_blank';head.rel='noopener';}
   li.append(raw(head),k.el('small',null,short(new Date(t.at).toISOString())));
   if(t.excerpt)li.append(raw(k.el('p','mp-excerpt',t.excerpt)));
   ul.append(li);
  }
  box.append(ul);return box;
 }
 function agenda(k,c){
  const box=section(k,'Предлагаю обсудить');
  if(!c.agenda.length){box.append(k.el('p','mp-empty','Фактов для повестки нет: прошлых решений, задач и тредов не нашлось.'));return box;}
  const facts=new Map(c.facts.map(f=>[f.id,f]));
  const ol=k.el('ol','mp-agenda');
  for(const p of c.agenda){
   const li=k.el('li');li.append(raw(k.el('span','mp-point',p.text)));
   const refs=k.el('span','mp-refs');
   for(const id of p.sources){const f=facts.get(id);if(!f)continue;const r=k.el('span','mp-ref '+f.kind,f.source.split(' · ')[0]);r.title=f.source+'\n'+f.text;r.tabIndex=0;r.setAttribute('aria-label','Источник: '+f.source+'. '+f.text);refs.append(r);}
   li.append(refs);ol.append(li);
  }
  box.append(ol);
  box.append(k.el('small','kit-meta',c.agendaModel?'Предложила локальная модель по фактам выше; наведите на источник, чтобы увидеть факт.':'Собрано по правилам из открытых задач и вопросов — без модели.'));
  return box;
 }
 // Two steps: the exact text the description will get, then «Подтвердить».
 function describe(k,c,body){
  return {label:'В описание встречи',title:'Добавить повестку в описание события — участники получат обновление',run:async()=>{
   if(body.querySelector('.mp-confirm'))return;
   const r=await call('preview',c.prepId);
   const box=k.el('div','mp-confirm');box.append(k.el('p',null,'Добавить в описание «'+r.title+'» этот текст? Участники получат обновление события.'));
   box.append(raw(k.el('pre','mp-preview',r.text)));
   const yes=k.el('button','primary','Подтвердить');yes.type='button';const no=k.el('button',null,'Отмена');no.type='button';
   no.onclick=()=>box.remove();
   yes.onclick=async()=>{yes.disabled=no.disabled=true;try{const done=await call('addAgenda',c.prepId);c.agendaAdded=done.added;box.replaceChildren(k.el('p','mp-done',done.already||done.added?.already?'Эта повестка уже есть в описании.':'Повестка добавлена в описание встречи.'));}catch(e){box.append(k.el('p','mp-warn',e.message));yes.disabled=no.disabled=false;}};
   const row=k.el('div','mp-confirm-actions');row.append(yes,no);box.append(row);body.append(box);yes.focus();
  }};
 }
 window.renderMeetingPrep=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.mp-card'))return;
  // The card repeats the text answer: keep only its first line.
  for(const node of [...parent.querySelectorAll(':scope>p,:scope>ol,:scope>ul')].slice(1))node.remove();
  const again=()=>k.ask(c.event?'Подготовь меня к встрече «'+c.event.title+'»':'Что обсуждали с '+c.person.join(', ')+' в прошлый раз',{send:true});
  const body=k.el('div','mp-body');
  if(c.event)body.append(when(k,c));
  body.append(attendees(k,c),timeline(k,c,again));
  for(const node of [tasks(k,c),slack(k,c)])if(node)body.append(node);
  body.append(agenda(k,c));
  const actions=[];
  const link=c.event&&k.safeUrl(c.event.link);
  if(link)actions.push({label:'Открыть звонок',primary:true,run:()=>window.open(link,'_blank','noopener')});
  if(c.event&&Date.parse(c.event.end)>Date.now()){
   const live=Date.now()>=Date.parse(c.event.start)-10*60000;
   actions.push(k.links('meeting-recording',{when:live?'now':'schedule',title:c.event.title,start:c.event.start,end:c.event.end},{context:{url:link||''},label:'Записать встречу',title:live?'Петя запишет встречу на этом компьютере':'Петя начнёт запись, когда встреча начнётся'}));
  }
  if(c.agenda.length){
   const points=c.agenda.map((p,i)=>(i+1)+') '+p.text).join('; ');
   actions.push(k.links('share-message',{text:'посмотреть повестку встречи «'+(c.event?.title||'встреча')+'»'+(c.event?' ('+date(c.event.start)+', '+time(c.event.start)+')':'')+': '+points+'.'},{label:'Отправить повестку участникам',title:'Петя покажет сообщение и канал перед отправкой'}));
   if(c.event?.organizer&&!c.agendaAdded)actions.push(describe(k,c,body));
  }
  actions.push({label:'Обновить',title:'Собрать подготовку заново',run:again});
  const mins=c.event?Math.round((Date.parse(c.event.start)-Date.now())/60000):0;
  const status=!c.event?{label:'история встреч',tone:''}:mins>0&&mins<=180?{label:'через '+mins+' мин',tone:'progress'}:mins<=0?{label:'идёт сейчас',tone:'done'}:{label:date(c.event.start),tone:'accent'};
  const card=k.card({app:'Подготовка',initial:'◷',color:'#5b6f9a',key:c.event?.title||'Прошлые встречи: '+c.person.join(', '),href:c.event?.url,status,body,actions,className:'mp-card'});
  raw(card.querySelector('.kit-key'));
  parent.append(card);
 };
})();
