// Fired reminders in the notification center: «Открыть чат», «Отложить на 10 мин», «Готово». The main process
// publishes them without functions (src/extensions/reminders/service.cjs); the actions are added here, and fired
// reminders that are not marked yet are restored after a reload. A reminder fired into the chat that is open now
// reloads that chat so its message appears.
(()=>{
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 const call=(method,...args)=>window.petya.feature('reminders',method,...args);
 async function openChat(r){
  if(r.projectId&&typeof topicSelect!=='undefined'&&r.projectId!==topicSelect.dataset.projectId)await window.petya.chatProjectSelect(r.projectId);
  if(typeof selectDialogueTopic==='function'&&r.topicId)await selectDialogueTopic(r.topicId);
  if(typeof view==='function')view('home');
 }
 // The one-time note that Petya's own reminders moved into this app: «Открыть» shows them on «Навыки».
 function moved(item){
  put({...item,actions:[['Открыть',()=>{if(typeof view==='function')view('learning');window.petyaTabs?.select('learning',window.petyaTabs.key('Напоминания'));}]]});
  call('noteSeen').catch(()=>{});
 }
 function shown(item,live=true){
  if(item?.moved)return moved(item);
  if(!item||!String(item.id||'').startsWith('reminder:')||!item.reminder)return;
  const {reminder:r,...rest}=item;
  const settled=text=>put({...rest,text,kind:'success',version:'settled:'+Date.now(),actions:[]});
  put({...rest,actions:[
   ['Открыть чат',()=>openChat(r)],
   ['Отложить на 10 мин',async()=>{const v=await call('snooze',r.id,{minutes:10});settled('Отложено: '+v.text);}],
   ...(r.repeat?[]:[['Готово',async()=>{await call('done',r.id);settled('Готово: '+rest.text);}]])
  ]});
  // The message went into the open chat: show it now.
  if(live)try{if(typeof topicSelect!=='undefined'&&topicSelect.value===r.topicId&&!document.getElementById('home')?.hidden&&!window.chatStartPending&&!(typeof commandProgress!=='undefined'&&commandProgress.busy))selectDialogueTopic(r.topicId,{internal:true}).catch(()=>{});}catch{/* the chat is busy: it shows the message next time */}
 }
 window.petyaEvents.onExtensionInstall(item=>shown(item));
 call('notices').then(list=>list.forEach(item=>shown(item,false))).catch(()=>{});
})();
