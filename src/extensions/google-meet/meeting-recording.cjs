// Capability «meeting-recording» of «Google Meet»: Petya's local recording (system audio and, if allowed, the
// microphone) of a Meet call in the browser. «Записать Петей» starts it during the meeting; «Петя запишет встречу»
// schedules it: from the event's time the recording starts as soon as the Google Meet meeting source sees the call's
// tab (src/meeting-schedule.cjs, a cancellable notification). Only Meet links fit.
const {recognizeLink}=require('./meet.cjs');
module.exports={
 label:'Записать Петей',order:20,
 ready:s=>['auto','ask'].includes(s.meetingAutoRecord||'auto'),
 fits:c=>!!c.url&&!!recognizeLink(c.url),
 hint:s=>s.meetingAutoRecord==='ask'?'Перед записью Петя спросит':'Запись включится сама, когда вкладка встречи Google Meet будет открыта',
 async run(services,payload,check){
  if(payload.when==='schedule'){
   if(!services.googleMeetSchedule)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
   check();const item=services.googleMeetSchedule.add(payload);
   return {scheduled:item,text:'Петя запишет встречу «'+item.title+'»: запись начнётся, когда откроется вкладка встречи Google Meet. Отменить можно в уведомлении.'};
  }
  if(!services.meetingRecording)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
  check();const state=await services.meetingRecording('startCapture');
  return {state,text:'Петя записывает встречу. Остановить можно в уведомлении.'};
 }
};
