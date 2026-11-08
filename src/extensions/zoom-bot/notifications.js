// Local meeting capture in the notification center: recording, processing and errors with start/stop actions,
// and scheduled recordings («Петя запишет встречу») with «Отменить» until they start; restored after a reload.
(()=>{
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 function localProgress(state){if(!state||state.phase==='idle')return;const actions=state.busy?[['Остановить и обработать',()=>window.petya.feature('meetingMemory','stopCapture')]]:state.canStart||state.canRetry?[['Записать встречу',()=>window.petya.feature('meetingMemory','startCapture')]]:[];put({id:'local-meeting',title:'Запись встречи',text:state.message,busy:state.busy,version:state.id+':'+state.phase,kind:state.phase==='error'?'error':'info',actions});}
 window.petyaEvents.onLocalMeeting(localProgress);window.petya.feature('meetingMemory','captureStatus').then(localProgress).catch(()=>{});
 // The main process publishes schedule items without functions: the cancel action is added here.
 function scheduled(item){
  if(!item||!String(item.id||'').startsWith('meeting-schedule:'))return;
  const {cancellable,...rest}=item;
  put({...rest,actions:cancellable?[['Отменить',()=>window.petya.feature('zoomBot','cancelSchedule',cancellable).then(list=>list.forEach(scheduled))]]:[]});
 }
 window.petyaEvents.onExtensionInstall(scheduled);
 window.petya.feature('zoomBot','schedules').then(list=>list.forEach(scheduled)).catch(()=>{});
})();
