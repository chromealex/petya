// «Напоминания», renderer. One card for every mode: what was just created (how Petya understood the time — in words
// and as an absolute date — with «Изменить»), the list grouped into «Сработали / Сегодня / Позже / По событию» with
// a trigger icon and the next check time, a fired reminder (Готово / Отложить / link to the context) and a deleted
// one («Вернуть»). A strip of today's hours shows where today's reminders fall. Rows are refreshed from the app's
// live state (window.petya.feature('reminders','list')), so an old message never shows a stale status.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('reminder-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('reminders',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const svg=d=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
 const ICONS={
  clock:svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  repeat:svg('<path d="M17 3.5l3 3-3 3"/><path d="M20 6.5H9a5 5 0 0 0-5 5"/><path d="M7 20.5l-3-3 3-3"/><path d="M4 17.5h11a5 5 0 0 0 5-5"/>'),
  task:svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  presence:svg('<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="18.5" cy="7" r="2.2" fill="currentColor" stroke="none"/>'),
  calendar:svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  build:svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
  event:svg('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  edit:svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>')
 };
 const icon=(k,name,label)=>{const n=k.el('span','rem-icon rem-icon-'+name);n.innerHTML=ICONS[name]||ICONS.event;if(label){n.title=label;n.setAttribute('aria-label',label);n.setAttribute('role','img');}return n;};
 const ICON_NAMES={clock:'По времени',repeat:'Повторяется',task:'Задача Jira',presence:'Коллега в сети',calendar:'Встреча',build:'Сборка',event:'Событие'};
 const pad=v=>String(v).padStart(2,'0');
 const time=ms=>new Date(ms).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const day0=ms=>{const d=new Date(ms);d.setHours(0,0,0,0);return d.getTime();};
 // «Сегодня, 16:00», «Завтра, 10:00», «пт, 13 нояб., 10:00».
 function dayTime(ms,now){
  const diff=Math.round((day0(ms)-day0(now))/86400000);
  const label=diff===0?'Сегодня':diff===1?'Завтра':new Date(ms).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});
  return label+', '+time(ms);
 }
 const absolute=ms=>new Date(ms).toLocaleString(locale(),{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
 function repeatText(r){
  const days=r.days||[];const at=pad(r.h)+':'+pad(r.m);
  if(days.length===7)return 'Каждый день · '+at;
  if(days.length===5&&[1,2,3,4,5].every(d=>days.includes(d)))return 'По будням · '+at;
  const names=days.map(d=>new Date(2026,10,8+d).toLocaleDateString(locale(),{weekday:'short'}));
  return 'Повтор: '+names.join(', ')+' · '+at;
 }
 const when=(item,now)=>item.kind==='time'?(item.repeat?repeatText(item.repeat):dayTime(item.at,now)):null;

 // Today's hours with a mark for each reminder due today and a line for now.
 function strip(k,items,now){
  const start=day0(now),todays=items.filter(i=>i.kind==='time'&&i.at>=start&&i.at<start+86400000&&i.group!=='done');
  const box=k.el('div','rem-strip');box.setAttribute('role','img');
  box.setAttribute('aria-label','Сегодня: '+(todays.length?todays.map(i=>time(i.at)).join(', '):'напоминаний нет'));
  const track=k.el('div','rem-strip-track');
  for(let h=0;h<=24;h+=6){const tick=k.el('span','rem-strip-hour'+(h===0?' start':h===24?' end':''),pad(h)+':00');tick.style.left=(h/24*100)+'%';track.append(tick);}
  const past=k.el('span','rem-strip-past');past.style.width=Math.min(100,(now-start)/864000)+'%';track.append(past);
  const line=k.el('span','rem-strip-now');line.style.left=Math.min(100,(now-start)/864000)+'%';line.title=time(now);track.append(line);
  for(const i of todays){const dot=k.el('span','rem-strip-dot'+(i.group==='fired'?' fired':i.at<now?' past':''));dot.style.left=((i.at-start)/864000)+'%';dot.title=time(i.at)+' — '+i.text;dot.dataset.noI18n='';track.append(dot);}
  box.append(track);
  return box;
 }

 function editor(k,item,done){
  const form=k.el('form','rem-edit');form.dataset.noI18n='';
  const text=k.el('input');text.type='text';text.value=item.text;text.maxLength=300;text.setAttribute('aria-label','Текст напоминания');
  form.append(text);
  let at=null;
  if(item.kind==='time'){
   at=k.el('input');
   if(item.repeat){at.type='time';at.value=pad(item.repeat.h)+':'+pad(item.repeat.m);}
   else{at.type='datetime-local';const d=new Date(item.at);at.value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}
   at.setAttribute('aria-label','Когда напомнить');form.append(at);
  }
  const save=k.el('button','primary','Сохранить');save.type='submit';
  const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>done(null);
  form.append(save,cancel);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;
   try{
    const patch={text:text.value};
    if(at){
     if(item.repeat){const [h,m]=at.value.split(':').map(Number);const next=new Date(item.at);next.setHours(h,m,0,0);if(next.getTime()<=Date.now())next.setDate(next.getDate()+1);patch.at=next.getTime();}
     else{const ms=new Date(at.value).getTime();if(ms!==item.at)patch.at=ms;}
    }
    done(await call('edit',item.id,patch));
   }catch(err){k.toast(err.message,{error:true});save.disabled=false;}};
  setTimeout(()=>text.focus(),0);
  return form;
 }

 function snoozeButton(k,item,refresh){
  const b=k.el('button',null,'Отложить ▾');b.type='button';b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');
  b.onclick=e=>{e.stopPropagation();k.menu(b,async()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(9,0,0,0);
   return [{label:'На 10 минут',minutes:10},{label:'На 30 минут',minutes:30},{label:'На час',minutes:60},{label:'До завтра, '+time(tomorrow.getTime()),until:tomorrow.getTime()}];},
   async option=>{try{const v=await call('snooze',item.id,option.until?{until:option.until}:{minutes:option.minutes});k.toast('Отложено: '+dayTime(v.at,Date.now()));refresh();}catch(err){k.toast(err.message,{error:true});}});};
  return b;
 }

 // One reminder row: icon, text, when (or the event and the next check), actions.
 function row(k,item,now,refresh,{focus=false}={}){
  const li=k.el('li','rem-row'+(item.group==='fired'?' fired':'')+(focus?' focus':''));li.dataset.reminder=item.id;
  li.append(icon(k,item.icon,ICON_NAMES[item.icon]));
  const main=k.el('div','rem-main');
  const title=k.el('div','rem-text',item.text);title.dataset.noI18n='';main.append(title);
  const sub=k.el('div','rem-sub');
  if(item.kind==='time'){sub.append(k.el('span','rem-when',when(item,now)));if(item.snoozed)sub.append(k.el('span','rem-tag','отложено'));}
  else if(item.trigger){
   // The event in words, unless the text already says it; then the service that is watched.
   const same=item.trigger.label.toLocaleLowerCase()===item.text.toLocaleLowerCase();
   const label=k.el('span','rem-when',same?item.trigger.name:item.trigger.label);if(!same)label.dataset.noI18n='';sub.append(label);
   if(item.group==='event'&&item.nextCheck)sub.append(k.el('span','rem-check','проверю в '+time(item.nextCheck)));}
  if(item.group==='fired'){sub.append(k.el('span','rem-tag fired','сработало '+(item.firedAt?time(item.firedAt):'')));}
  main.append(sub);
  if(item.firedText&&item.group==='fired'){const p=k.el('div','rem-fired-text',item.firedText);p.dataset.noI18n='';main.append(p);}
  if(item.lastError&&item.group==='event'){main.append(k.el('div','rem-error','Не удалось проверить: '+item.lastError));}
  li.append(main);
  const acts=k.el('div','rem-actions');
  const url=k.safeUrl(item.firedUrl||item.trigger?.url||'');
  if(url){const a=k.el('a','rem-link','Открыть');a.href=url;a.target='_blank';a.rel='noopener';a.title=url;acts.append(a);}
  if(item.group==='fired'){
   const d=k.el('button','primary','Готово');d.type='button';d.onclick=async()=>{d.disabled=true;try{await call('done',item.id);refresh();}catch(err){k.toast(err.message,{error:true});d.disabled=false;}};
   acts.append(d,snoozeButton(k,item,refresh));
  }else{
   const e=k.el('button','rem-edit-button');e.type='button';e.innerHTML=ICONS.edit;e.title='Изменить';e.setAttribute('aria-label','Изменить напоминание');
   e.onclick=()=>{const form=editor(k,item,v=>{form.remove();if(v)refresh();});li.after(form);};
   acts.append(e);
  }
  const del=window.deleteButton?window.deleteButton('Удалить напоминание',null):k.el('button',null,'Удалить');
  del.onclick=async()=>{del.disabled=true;try{const v=await call('remove',item.id);k.toast('Удалено: '+v.text,{undo:async()=>{await call('restore',item.id);refresh();}});refresh();}catch(err){k.toast(err.message,{error:true});del.disabled=false;}};
  acts.append(del);
  li.append(acts);
  return li;
 }

 const GROUPS=[['fired','Сработали'],['today','Сегодня'],['later','Позже'],['event','По событию']];
 function groups(k,items,now,refresh,focus){
  const box=k.el('div','rem-groups');
  for(const [id,label] of GROUPS){
   const rows=items.filter(i=>i.group===id);if(!rows.length)continue;
   const sec=k.el('section','rem-group');sec.dataset.group=id;
   sec.append(k.el('h5','rem-group-title',label+' · '+rows.length));
   const ul=k.el('ul','rem-list');for(const i of rows)ul.append(row(k,i,now,refresh,{focus:i.id===focus}));
   sec.append(ul);box.append(sec);
  }
  if(!box.children.length)box.append(k.el('p','rem-empty','Напоминаний нет. Скажите, например: «напомни в 16:00 позвонить».'));
  return box;
 }

 // How Petya understood the new reminder: the time in words, the absolute date, «Изменить».
 function understood(k,item,now,refresh){
  const box=k.el('div','rem-understood');box.dataset.reminder=item.id;
  box.append(icon(k,item.icon,ICON_NAMES[item.icon]));
  const main=k.el('div','rem-main');
  const t=k.el('div','rem-big',item.text);t.dataset.noI18n='';main.append(t);
  if(item.kind==='time'){
   main.append(k.el('div','rem-when-big',item.repeat?repeatText(item.repeat):dayTime(item.at,now)));
   main.append(k.el('div','rem-absolute',(item.repeat?'Первый раз: ':'')+absolute(item.at)));
  }else if(item.trigger){
   const w=k.el('div','rem-when-big','Когда '+item.trigger.label);w.dataset.noI18n='';main.append(w);
   if(item.nextCheck)main.append(k.el('div','rem-absolute','Проверяю: '+item.trigger.name+' · следующая проверка в '+time(item.nextCheck)));
  }
  if(item.status==='done')main.append(k.el('div','rem-tag','готово'));
  box.append(main);
  const acts=k.el('div','rem-actions');
  if(item.status!=='done'){
   const e=k.el('button',null,'Изменить');e.type='button';e.onclick=()=>{const form=editor(k,item,v=>{form.remove();if(v)refresh();});box.after(form);};acts.append(e);
   const del=window.deleteButton?window.deleteButton('Удалить напоминание',null):k.el('button',null,'Удалить');
   del.onclick=async()=>{del.disabled=true;try{const v=await call('remove',item.id);k.toast('Удалено: '+v.text,{undo:async()=>{await call('restore',item.id);refresh();}});refresh();}catch(err){k.toast(err.message,{error:true});del.disabled=false;}};
   acts.append(del);
  }
  box.append(acts);
  return box;
 }

 window.renderReminderCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.reminder-card'))return;
  const body=k.el('div','rem-body');
  let items=Array.isArray(data.items)?data.items:[];
  const status=k.el('span');const subtitle=k.el('span','kit-subtitle');
  const paint=()=>{
   const now=Date.now();
   body.replaceChildren();
   const focusId=data.created||data.fired||'';
   const focus=items.find(i=>i.id===focusId);
   if(data.mode==='deleted'&&data.deleted){
    const d=data.deleted,box=k.el('div','rem-understood deleted');box.append(icon(k,d.icon,ICON_NAMES[d.icon]));
    const main=k.el('div','rem-main');const t=k.el('div','rem-big',d.text);t.dataset.noI18n='';main.append(t,k.el('div','rem-absolute',items.some(i=>i.id===d.id)?'Возвращено':'Удалено'));box.append(main);
    if(!items.some(i=>i.id===d.id)){const back=k.el('button',null,'Вернуть');back.type='button';back.onclick=async()=>{back.disabled=true;try{await call('restore',d.id);refresh();}catch(err){k.toast(err.message,{error:true});}};const acts=k.el('div','rem-actions');acts.append(back);box.append(acts);}
    body.append(box);
   }else if(data.mode==='created'||data.mode==='fired'){
    if(focus&&focus.status==='done'){
     const box=k.el('div','rem-understood deleted');box.append(icon(k,focus.icon,ICON_NAMES[focus.icon]));
     const main=k.el('div','rem-main');const t=k.el('div','rem-big',focus.text);t.dataset.noI18n='';main.append(t,k.el('div','rem-absolute','Это напоминание уже выполнено или удалено.'));box.append(main);body.append(box);
    }
    else if(focus&&data.mode==='created')body.append(understood(k,focus,now,refresh));
    else if(focus){const ul=k.el('ul','rem-list single');ul.append(row(k,focus,now,refresh,{focus:true}));body.append(ul);}
    else body.append(k.el('p','rem-empty','Это напоминание уже выполнено или удалено.'));
   }
   if(data.mode==='list'||data.mode==='created'&&focus?.kind==='time'&&focus.at<day0(now)+86400000)body.append(strip(k,items,now));
   if(data.mode==='list')body.append(groups(k,items,now,refresh,''));
   else if(data.mode==='created'){
    const others=items.filter(i=>i.id!==focusId);
    if(others.length){const more=k.el('details','rem-more');more.append(k.el('summary',null,'Остальные напоминания · '+others.length));more.append(groups(k,others,now,refresh,''));body.append(more);}
   }
   const open=items.filter(i=>i.group!=='done').length,fired=items.filter(i=>i.group==='fired').length;
   const today=items.filter(i=>i.group==='today').length,event=items.filter(i=>i.group==='event').length;
   status.replaceChildren(k.chip(data.mode==='list'?(fired?{label:'сработало: '+fired,tone:'alert'}:{label:'активных: '+open,tone:open?'done':''})
    :!focus||focus.status==='done'?{label:'готово',tone:'done'}:focus.group==='fired'?{label:'сработало',tone:'alert'}:focus.group==='event'?{label:'жду событие',tone:'progress'}:{label:data.mode==='created'?'поставлено':'отложено',tone:'done'}));
   subtitle.textContent=data.mode==='list'?'на сегодня: '+today+' · по событию: '+event:'';
  };
  // Live state from the app: statuses change after the message was written.
  async function refresh(){try{const live=await call('list');if(Array.isArray(live)){const ids=new Set(live.map(i=>i.id));const gone=items.filter(i=>!ids.has(i.id)&&(i.id===data.created||i.id===data.fired)).map(i=>({...i,group:'done',status:'done'}));items=[...live,...gone];}}catch{/* the app may be removed */}paint();}
  paint();
  const actions=data.mode==='list'?[{label:'Новое напоминание…',run:()=>k.ask('Напомни ')}]:[{label:'Все напоминания',run:()=>k.ask('Какие у меня напоминания?',{send:true})}];
  const node=k.card({app:'Напоминания',initial:'⏰',color:'#6b5a8a',status,body,actions,className:'reminder-card'});node.querySelector('.kit-card-head')?.append(subtitle);parent.append(node);
  if(window.petya?.feature)refresh();
 };
})();
