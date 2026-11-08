// Holding back Petya's own non-urgent system notifications during a focus session. Every notification Petya
// shows (chat answers, finished assignments, created tasks, reminders) is an Electron `Notification`, so one
// wrapper around `Notification.prototype.show` is enough: nothing in the application shell changes, and the
// existing «smart notifications» switch keeps deciding what is sent at all — this only delays what it lets through.
// Urgent ones still pass: a decision or answer needed, errors and failures, a meeting about to start.
const URGENT=/нужн\p{L}*\s+(?:ваш\p{L}*\s+)?(?:решени|ответ|внимани|уточн)|требу\p{L}*|ошибк|не\s+удалось|не\s+получилось|сбой|упал|упала|срочн|уточни|ответьте|подтверд|ждёт\s+ответа|ждет\s+ответа|вопрос|встреч\p{L}*\s+(?:через|начина)|через\s+\d+\s+мин\p{L}*\s+встреч|напомина|напоминание/iu;
function urgent(n){
 if(n?.petyaFocus)return true;
 if(String(n?.urgency||'')==='critical')return true;
 return URGENT.test(String(n?.title||'')+' '+String(n?.body||''));
}
// `gate(notification)` returns true to hold it back. Installed once per process; returns whether it is active.
function install(electron,gate){
 const N=electron?.Notification;
 if(!N?.prototype||typeof N.prototype.show!=='function')return false;
 if(N.prototype.show.petyaFocusHold){N.prototype.show.petyaFocusHold.gate=gate;return true;}
 const original=N.prototype.show;
 const state={gate};
 const show=function(...args){
  let hold=false;try{hold=!!state.gate(this);}catch{hold=false;}
  if(hold)return undefined;
  return original.apply(this,args);
 };
 show.petyaFocusHold=state;
 try{N.prototype.show=show;}catch{return false;}
 return N.prototype.show===show;
}
module.exports={install,urgent,URGENT};
