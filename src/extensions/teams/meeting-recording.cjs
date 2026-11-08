// Capability «meeting-recording» of «Microsoft Teams»: Petya's local recording (system audio and, if allowed, the
// microphone) of a Teams call on this computer (the desktop app or Teams in a browser). «Записать Петей» starts it
// during the meeting; «Петя запишет встречу» schedules it: from the event's time the recording starts as soon as
// the Teams meeting source sees the call window (src/meeting-schedule.cjs, a cancellable notification). Only Teams
// links fit.
const {recognizeLink}=require('./teams.cjs');
module.exports={
 label:'Записать Петей',order:30,
 ready:s=>['auto','ask'].includes(s.meetingAutoRecord||'auto'),
 fits:c=>!!c.url&&!!recognizeLink(c.url),
 hint:s=>s.meetingAutoRecord==='ask'?'Перед записью Петя спросит':'Запись включится сама, когда откроется окно встречи Teams',
 async run(services,payload,check){
  if(payload.when==='schedule'){
   if(!services.teamsSchedule)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
   check();const item=services.teamsSchedule.add(payload);
   return {scheduled:item,text:'Петя запишет встречу «'+item.title+'»: запись начнётся, когда откроется окно встречи Teams. Отменить можно в уведомлении.'};
  }
  if(!services.meetingRecording)throw Error('Запись встреч ещё загружается. Повторите через минуту.');
  check();const state=await services.meetingRecording('startCapture');
  return {state,text:'Петя записывает встречу. Остановить можно в уведомлении.'};
 }
};
