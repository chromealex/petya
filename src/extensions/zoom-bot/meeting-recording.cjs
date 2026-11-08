// Capability «meeting-recording» of «Петя в Zoom»: the local capture (system audio and, if allowed, the microphone)
// of a Zoom meeting on this computer. No bot joins anything. «Записать сейчас» starts the capture during the
// meeting; «Петя запишет встречу» schedules the start at the event's time (a persisted timer with a notification
// that can be cancelled). Meet/Teams in a browser are not detected by the capture, so only Zoom links fit.
const {parseJoinURL}=require('./meeting-link.cjs');
module.exports={
 label:'Записать Петей',
 ready:s=>['auto','ask'].includes(s.zoomBotMode||'auto'),
 fits:c=>!c.url||!!parseJoinURL(c.url),
 hint:s=>s.zoomBotMode==='ask'?'Перед записью Петя спросит':'Запись включится сама, когда вы войдёте во встречу Zoom',
 async run(services,payload,check){
  if(payload.when==='schedule'){
   if(!services.meetingSchedule)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
   check();const item=services.meetingSchedule.add(payload);
   return {scheduled:item,text:'Петя запишет встречу «'+item.title+'»: запись начнётся, когда она начнётся в Zoom. Отменить можно в уведомлении.'};
  }
  if(!services.meetingRecording)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
  check();const state=await services.meetingRecording('startCapture');
  return {state,text:'Петя записывает встречу. Остановить можно в уведомлении.'};
 }
};
