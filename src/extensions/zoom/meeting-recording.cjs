// Capability «meeting-recording» of «Zoom»: Petya's local recording (system audio and, if allowed, the microphone)
// of a Zoom meeting on this computer. No bot joins anything. «Записать Петей» starts the recording during the
// meeting; «Петя запишет встречу» schedules it: at the event's time the recording starts as soon as the Zoom meeting
// source sees the meeting (a persisted timer with a notification that can be cancelled). Only Zoom links fit.
const {parseJoinURL}=require('./meeting-link.cjs');
module.exports={
 label:'Записать Петей',order:10,
 ready:s=>['auto','ask'].includes(s.meetingAutoRecord||'auto'),
 fits:c=>!c.url||!!parseJoinURL(c.url),
 hint:s=>s.meetingAutoRecord==='ask'?'Перед записью Петя спросит':'Запись включится сама, когда вы войдёте во встречу Zoom',
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
