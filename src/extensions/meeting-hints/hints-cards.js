// «Подсказки на встрече», chat card: the mode as a three-way switch (off / one meeting / every meeting), what the hints
// are built from, and during a recorded meeting a timeline from its start to now with a mark for every hint shown,
// then the hints themselves with their sources. Buttons call the app's ipc and redraw the card in place.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('hints-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('meetingHints',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const KIND={decision:{label:'Прошлое решение',mark:'✓'},promise:{label:'Обещание',mark:'!'},term:{label:'Термин',mark:'≡'}};
 const MODES=[['off','Выключены'],['meeting','На одну встречу'],['always','На всех встречах']];
 const date=at=>{const d=new Date(at),t=document.createElement('time');t.dateTime=d.toISOString();t.dataset.absolute='';t.dataset.noI18n='';t.textContent=d.toLocaleDateString(locale(),{day:'numeric',month:'long'});return t;};
 const minutes=ms=>Math.max(0,Math.round(ms/60000));
 function timeline(k,r){
  const box=k.el('div','mh-timeline');
  const m=r.meeting,now=Date.now(),span=Math.max(60000,now-(m.startedAt||now));
  const track=k.el('div','mh-track');track.setAttribute('role','img');
  track.setAttribute('aria-label','Встреча идёт '+minutes(span)+' мин, подсказок: '+r.hints.length);
  track.append(k.el('div','mh-fill'));
  for(const h of r.hints){const dot=k.el('span','mh-dot kind-'+h.kind,KIND[h.kind]?.mark||'•');dot.style.left=Math.min(100,Math.max(0,h.offset/span*100))+'%';dot.title=(KIND[h.kind]?.label||'')+': '+h.text;track.append(dot);}
  const scale=k.el('div','mh-scale');scale.append(k.el('span',null,'начало'),k.el('span',null,minutes(span)+' мин'));
  box.append(track,scale);return box;
 }
 function hintRow(k,h){
  const li=k.el('li','mh-hint kind-'+h.kind);
  li.append(k.el('span','mh-mark',KIND[h.kind]?.mark||'•'));
  const main=k.el('div','mh-main');
  const head=k.el('div','mh-head');
  if(h.kind==='decision'){head.append(k.el('span',null,'Это уже решали'));if(h.source?.at)head.append(' ',date(h.source.at));}
  else if(h.kind==='promise'){if(h.who){const who=k.el('span',null,h.who);who.dataset.noI18n='';head.append(who,' ',k.el('span',null,'обещал(а)'));}else head.append(k.el('span',null,'Ты обещал'));}
  else{const term=k.el('span',null,h.term||'');term.dataset.noI18n='';head.append(term);}
  const text=k.el('p','mh-text',h.text+(h.due?' · '+h.due:''));text.dataset.noI18n='';
  const source=k.el('small','mh-source');
  source.append(k.el('span',null,h.source?.kind==='glossary'?'Глоссарий':'Источник: '));
  if(h.source?.label){const l=k.el('span',null,(h.source.kind==='glossary'?' · ':'')+h.source.label);l.dataset.noI18n='';source.append(l);}
  main.append(head,text,source);li.append(main);return li;
 }
 function render(parent,r,old){
  const k=window.resultKit;if(!k||!r)return;
  const body=k.el('div','mh-body');
  const modes=k.el('div','mh-modes');modes.setAttribute('role','radiogroup');modes.setAttribute('aria-label','Подсказки на встречах');
  for(const [mode,label] of MODES){
   const b=k.el('button','mh-mode'+(r.mode===mode?' on':''),label);b.type='button';b.dataset.mode=mode;b.setAttribute('role','radio');b.setAttribute('aria-checked',String(r.mode===mode));
   b.onclick=async()=>{if(r.mode===mode)return;b.disabled=true;try{redraw(parent,await call('setMode',mode),card);}catch(e){k.toast(e.message,{error:true});}finally{b.disabled=false;}};
   modes.append(b);
  }
  body.append(modes);
  const sources=k.el('ul','mh-sources');
  const source=(on,label,hint)=>{const li=k.el('li',on?'on':'off');li.append(k.el('span','mh-led'),k.el('span',null,label));if(hint)li.append(k.el('small',null,hint));sources.append(li);};
  source(r.summaries>0,'Решения и обещания из сводок встреч',r.summaries>0?String(r.summaries):'сводок пока нет');
  source(r.glossary,'Термины из «Глоссария»',r.glossary?'':'приложение не добавлено');
  source(r.calendar,'Участники из «Календаря»',r.calendar?'':'не обязательно');
  body.append(sources);
  if(r.meeting){
   const title=k.el('p','mh-meeting');
   title.append(k.el('span',null,r.meeting.paused?'Поток встречи на паузе':'Идёт запись встречи'));
   if(r.meeting.title){const t=k.el('strong',null,' · '+r.meeting.title);t.dataset.noI18n='';title.append(t);}
   if(r.meeting.behind)title.append(k.el('span','mh-lag',' · расшифровка отстаёт на '+Math.round(r.meeting.lag/1000)+' с'));
   body.append(title,timeline(k,r));
   if(r.hints.length){const ul=k.el('ul','mh-hints');for(const h of r.hints.slice(-5).reverse())ul.append(hintRow(k,h));body.append(ul);}
   else body.append(k.el('p','mh-empty',r.mode==='off'?'Подсказки выключены — на этой встрече ничего не показываю.':'Пока подсказывать нечего. Покажу, когда разговор коснётся прошлых решений, обещаний или терминов.'));
  }else body.append(k.el('p','mh-empty',r.mode==='off'?'Подсказки работают только во время записи встречи, которую вы включили.':'Подсказки появятся в углу экрана на записываемой встрече — не чаще раза в 30 секунд.'));
  if(r.muted?.length){const p=k.el('p','mh-muted','Скрыто: '+r.muted.map(x=>KIND[x]?.label||x).join(', '));body.append(p);}
  const status=r.mode==='off'?{label:'выключены',tone:''}:r.meeting?{label:r.meeting.behind?'отстаёт':'на встрече',tone:r.meeting.behind?'alert':'done'}:{label:r.mode==='always'?'на всех встречах':'на следующей встрече',tone:'progress'};
  const actions=[];
  if(r.muted?.length)actions.push({label:'Снова показывать всё',run:async()=>redraw(parent,await call('unmute'),card)});
  if(r.meeting&&r.hidden&&r.mode!=='off')actions.push({label:'Показать панель',run:async()=>redraw(parent,await call('showAgain'),card)});
  actions.push({label:'Обновить',run:async()=>redraw(parent,await call('state'),card)});
  const card=k.card({app:'Подсказки на встрече',initial:'?',color:'#5b6f4a',key:'Подсказки на встрече',status,body,actions,className:'mh-card'});
  card.dataset.mode=r.mode;
  if(old)old.replaceWith(card);else parent.append(card);
 }
 function redraw(parent,r,old){render(parent,r,old);}
 window.renderMeetingHints=(parent,r)=>{if(!window.resultKit||!r||parent.querySelector('.mh-card'))return;render(parent,r,null);};
})();
