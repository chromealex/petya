// «Дневник дня», renderer: totals of the day (meetings, tasks, commits, focus minutes, chats, messages), a week of
// stacked bars, the day's timeline with an icon per source, «Перенести на завтра» with checkboxes, tomorrow's plan,
// the reflection question and private notes. Notes and answers are read from the app on this computer
// (window.petya.feature('journal','private',date)) and never stored in the chat message.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('journal-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('journal',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const svg=d=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
 const ICONS={
  chat:svg('<path d="M5 5h14v10H9l-4 4z"/>'),
  message:svg('<path d="M4 12l16-8-6 16-3-6z"/>'),
  task:svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  commit:svg('<circle cx="12" cy="12" r="3.2"/><path d="M3 12h5.8M15.2 12H21"/>'),
  meeting:svg('<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3"/>'),
  reminder:svg('<path d="M6 10a6 6 0 0 1 12 0c0 4 1.6 5.5 1.6 5.5H4.4S6 14 6 10z"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>'),
  note:svg('<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 13h8M8 16.5h5"/>'),
  focus:svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>'),
  event:svg('<circle cx="12" cy="12" r="3"/>')
 };
 const KINDS=[['meetings','Встречи','meeting'],['tasks','Задачи','task'],['commits','Коммиты','commit'],['focusMinutes','Фокус, мин','focus'],['chats','Чаты с Петей','chat'],['messages','Сообщения','message']];
 // Colors of the week bars (one per part, same as the timeline icons).
 const PARTS=[['meetings','meeting'],['tasks','task'],['commits','commit'],['chats','chat'],['messages','message'],['reminders','reminder'],['focus','focus']];
 const time=ms=>new Date(ms).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const dateOf=key=>new Date(key+'T12:00:00');
 const dayTitle=key=>{const t=dateOf(key).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'});return t[0].toLocaleUpperCase()+t.slice(1);};
 const icon=(k,name)=>{const n=k.el('span','jr-icon jr-'+(ICONS[name]?name:'event'));n.innerHTML=ICONS[name]||ICONS.event;return n;};
 const partsOf=t=>({meetings:t.meetings||0,tasks:t.tasks||0,commits:t.commits||0,chats:t.chats||0,messages:t.messages||0,reminders:t.reminders||0,focus:Math.round((t.focusMinutes||0)/25)});

 function tiles(k,t,focus){
  const box=k.el('div','jr-tiles');
  for(const [key,label,ic] of KINDS){
   if(key==='focusMinutes'&&!focus&&!t.focusMinutes)continue;
   const tile=k.el('div','jr-tile'+(t[key]?'':' zero'));tile.dataset.kind=key;
   const top=k.el('div','jr-tile-top');top.append(k.el('strong','jr-tile-value',String(t[key]||0)),icon(k,ic));
   tile.append(top,k.el('span','jr-tile-label',label));box.append(tile);
  }
  return box;
 }
 // Seven stacked bars, Monday to Sunday; today outlined, days ahead dimmed.
 function week(k,days,current){
  const box=k.el('div','jr-week');box.setAttribute('role','img');
  const sums=days.map(d=>Object.values(partsOf(d.totals)).reduce((a,b)=>a+b,0)),max=Math.max(1,...sums);
  box.setAttribute('aria-label','Неделя: '+days.map((d,i)=>dateOf(d.date).toLocaleDateString(locale(),{weekday:'short'})+' '+sums[i]).join(', '));
  days.forEach((d,i)=>{
   const col=k.el('div','jr-day'+(d.date===current?' current':'')+(d.future?' future':''));col.title=dayTitle(d.date)+': '+sums[i];
   const bar=k.el('div','jr-bar');const stack=k.el('div','jr-stack');stack.style.height=(sums[i]/max*100).toFixed(1)+'%';
   const parts=partsOf(d.totals);
   for(const [key,cls] of PARTS){if(!parts[key])continue;const seg=k.el('span','jr-seg jr-'+cls);seg.style.flexGrow=String(parts[key]);stack.append(seg);}
   bar.append(stack);
   col.append(k.el('span','jr-day-count',sums[i]?String(sums[i]):''),bar,k.el('span','jr-day-name',dateOf(d.date).toLocaleDateString(locale(),{weekday:'short'})));
   box.append(col);
  });
  return box;
 }
 function legend(k){
  const box=k.el('div','jr-legend');
  for(const [label,cls] of [['встречи','meeting'],['задачи','task'],['коммиты','commit'],['чаты','chat'],['сообщения','message'],['напоминания','reminder'],['фокус','focus']]){const s=k.el('span');s.append(k.el('i','jr-dot jr-'+cls),label);box.append(s);}
  return box;
 }
 function timelineRow(k,i,{withDay=false}={}){
  const li=k.el('li','jr-item');li.dataset.kind=i.kind||'';
  li.append(k.el('time','jr-time',withDay?new Date(i.at).toLocaleDateString(locale(),{weekday:'short'})+' '+time(i.at):time(i.at)),icon(k,i.icon));
  const main=k.el('div','jr-item-main');
  const url=k.safeUrl(i.url||'');
  const title=k.el(url?'a':'span','jr-item-title',i.title);if(url){title.href=url;title.target='_blank';title.rel='noopener';}
  if(!i.private)title.dataset.noI18n='';
  main.append(title);
  if(i.detail){const d=k.el('span','jr-item-detail',i.detail);d.dataset.noI18n='';main.append(d);}
  li.append(main);return li;
 }
 function timeline(k,items,{withDay=false}={}){
  if(!items.length)return k.el('p','jr-empty','В данных Пети за этот день ничего нет.');
  const nodes=items.map(i=>timelineRow(k,i,{withDay}));
  const ul=k.el('ul','jr-timeline');const box=k.collapse(nodes,withDay?10:8,'Показать ещё');
  ul.append(...box.childNodes);return ul;
 }

 // «Перенести на завтра»: open items with checkboxes; already planned ones are checked.
 function carry(k,c,refresh){
  const sec=k.el('section','jr-section');sec.append(k.el('h5','jr-h','Перенести на завтра'));
  if(!c.carry.length){sec.append(k.el('p','jr-empty','Открытых пунктов нет.'));return sec;}
  const ul=k.el('ul','jr-carry');const boxes=[];
  for(const item of c.carry){
   const li=k.el('li');const label=k.el('label');const box=k.el('input');box.type='checkbox';box.checked=!!item.planned;box.dataset.id=item.id;boxes.push([box,item]);
   const text=k.el('span','jr-carry-title',item.title);text.dataset.noI18n='';
   label.append(box,text);if(item.detail){const d=k.el('small',null,item.detail);d.dataset.noI18n='';label.append(d);}
   li.append(label);ul.append(li);
  }
  const go=k.el('button','primary','Перенести на завтра');go.type='button';
  go.onclick=async()=>{go.disabled=true;try{
   const add=boxes.filter(([b,i])=>b.checked&&!i.planned).map(([,i])=>({id:i.id,title:i.title,detail:i.detail||'',url:i.url||'',source:i.source||''}));
   const drop=boxes.filter(([b,i])=>!b.checked&&i.planned).map(([,i])=>i.id);
   if(add.length)await call('carry',c.date,add);
   for(const id of drop)await call('unplan',c.tomorrow,id);
   k.toast(add.length||drop.length?'План на завтра обновлён':'Отметьте, что перенести');refresh();
  }catch(e){k.toast(e.message,{error:true});}finally{go.disabled=false;}};
  sec.append(ul,go);return sec;
 }
 function plan(k,c,refresh){
  const sec=k.el('section','jr-section');sec.append(k.el('h5','jr-h',c.brief?'План на сегодня':'План на завтра · '+dateOf(c.tomorrow).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'})));
  if(!c.planned.length){sec.append(k.el('p','jr-empty','Плана пока нет — отметьте пункты ниже.'));return sec;}
  const ul=k.el('ul','jr-plan');
  for(const p of c.planned){
   const li=k.el('li'+'',p.done?'done':'');const label=k.el('label');const box=k.el('input');box.type='checkbox';box.checked=!!p.done;
   box.onchange=async()=>{try{await call('check',c.tomorrow,p.id,box.checked);li.classList.toggle('done',box.checked);}catch(e){box.checked=!box.checked;k.toast(e.message,{error:true});}};
   const t=k.el('span',null,p.title);t.dataset.noI18n='';label.append(box,t);li.append(label);ul.append(li);
  }
  sec.append(ul);return sec;
 }
 // Private part: the reflection question and notes, loaded from this computer.
 function personal(k,c){
  const sec=k.el('section','jr-section jr-private');
  sec.append(k.el('h5','jr-h','Вопрос дня'));
  const q=k.el('p','jr-prompt',c.prompt);sec.append(q);
  const answer=k.el('textarea','jr-answer');answer.rows=2;answer.placeholder='Пара строк для себя — видно только вам';answer.setAttribute('aria-label','Ответ на вопрос дня');
  const saveA=k.el('button',null,'Сохранить ответ');saveA.type='button';
  saveA.onclick=async()=>{saveA.disabled=true;try{await call('reflect',c.date,answer.value);k.toast('Ответ сохранён');}catch(e){k.toast(e.message,{error:true});}finally{saveA.disabled=false;}};
  sec.append(answer,saveA);
  sec.append(k.el('h5','jr-h','Записи'));
  const notes=k.el('ul','jr-notes');sec.append(notes);
  const input=k.el('textarea','jr-note');input.rows=2;input.placeholder='Запись в дневник…';input.setAttribute('aria-label','Запись в дневник');
  const add=k.el('button',null,'Записать');add.type='button';
  const row=k.el('div','jr-note-row');row.append(input,add);sec.append(row);
  const load=async()=>{
   let data;try{data=await call('private',c.date);}catch{return;}
   if(data.reflection?.answer&&!answer.value)answer.value=data.reflection.answer;
   notes.replaceChildren(...data.notes.map(n=>{
    const li=k.el('li');li.append(k.el('time',null,time(n.at)));const t=k.el('span',null,n.text);t.dataset.noI18n='';li.append(t);
    const del=window.deleteButton?window.deleteButton('Удалить запись',null):k.el('button',null,'Удалить');
    del.onclick=async()=>{del.disabled=true;try{await call('removeNote',c.date,n.id);k.toast('Запись удалена',{undo:async()=>{await call('note',c.date,n.text);load();}});load();}catch(e){k.toast(e.message,{error:true});del.disabled=false;}};
    li.append(del);return li;}));
   if(!data.notes.length)notes.append(k.el('li','jr-empty','Записей за этот день нет.'));
  };
  add.onclick=async()=>{if(!input.value.trim())return;add.disabled=true;try{await call('note',c.date,input.value);input.value='';load();}catch(e){k.toast(e.message,{error:true});}finally{add.disabled=false;}};
  load();
  return sec;
 }
 // Evening summary: off by default; a switch and the time.
 function evening(k,c){
  const row=k.el('div','jr-evening');
  const label=k.el('label');const box=k.el('input');box.type='checkbox';box.checked=!!c.evening;
  const at=k.el('input');at.type='time';at.value=c.evening||'19:00';at.disabled=!c.evening;at.setAttribute('aria-label','Время итогов дня');
  label.append(box,'Итоги дня по будням в');row.append(label,at);
  const save=async()=>{try{const v=await call('evening',box.checked?at.value:'');at.disabled=!v;k.toast(v?'Итоги дня будут в '+v:'Итоги дня выключены');}catch(e){k.toast(e.message,{error:true});}};
  box.onchange=save;at.onchange=save;
  return row;
 }

 window.renderJournalCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.journal-card'))return;
  let c=data;const body=k.el('div','jr-body');const status=k.el('span');
  const paint=()=>{
   body.replaceChildren();
   if(c.mode!=='plan')body.append(tiles(k,c.totals||{},c.focus));
   if(c.week?.length&&!c.brief){const w=k.el('section','jr-section');w.append(k.el('h5','jr-h','Неделя'),week(k,c.week,c.date),legend(k));body.append(w);}
   if(c.mode==='day'){const t=k.el('section','jr-section');t.append(k.el('h5','jr-h','День по часам'),timeline(k,c.timeline||[]));body.append(t);}
   if(c.mode==='week'){const t=k.el('section','jr-section');t.append(k.el('h5','jr-h','Главное за неделю'),timeline(k,(c.timeline||[]).filter(i=>i.kind!=='chat'&&i.kind!=='note').slice(-30),{withDay:true}));body.append(t);}
   if(c.mode==='plan'||c.planned?.length)body.append(plan(k,c,refresh));
   if(!c.brief&&c.mode!=='week')body.append(carry(k,c,refresh));
   if(c.errors?.length){const p=k.el('p','jr-errors','Не удалось прочитать: '+c.errors.map(e=>e.source+' ('+e.text+')').join('; '));p.dataset.noI18n='';body.append(p);}
   if(c.mode==='day')body.append(personal(k,c),evening(k,c));
   status.replaceChildren(k.chip(c.mode==='week'?{label:'неделя',tone:'progress'}:c.mode==='plan'?{label:'план',tone:'progress'}:{label:'локально',tone:'done',title:'Всё остаётся на этом компьютере'}));
  };
  async function refresh(){try{const fresh=await call('card',c.brief?'plan':c.mode,c.date);if(fresh)c={...fresh,brief:c.brief};}catch{/* the app may be removed */}paint();}
  paint();
  const key=c.mode==='week'?'Неделя с '+dateOf(c.week?.[0]?.date||c.date).toLocaleDateString(locale(),{day:'numeric',month:'long'}):c.brief?dayTitle(c.tomorrow):dayTitle(c.date);
  const actions=c.mode==='week'?[{label:'Что я сегодня сделал',run:()=>k.ask('Что я сегодня сделал?',{send:true})}]:[{label:'Итоги недели',run:()=>k.ask('Итоги недели',{send:true})},{label:'Запись в дневник…',run:()=>k.ask('Запиши в дневник: ')}];
  const node=k.card({app:'Дневник',initial:'✎',color:'#5a7a6a',key,status,body,actions,className:'journal-card'});
  node.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(node);
 };
})();
