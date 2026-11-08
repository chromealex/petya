// Scheduled recordings of Teams events («Петя запишет встречу») in the notification center, with «Отменить» until
// they start; restored after a reload. The recording's own progress is Petya's (src/ui/notifications.js).
(()=>{
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 // The main process publishes schedule items without functions: the cancel action is added here.
 function scheduled(item){
  if(!item||!String(item.id||'').startsWith('meeting-schedule:teams:'))return;
  const {cancellable,...rest}=item;
  put({...rest,actions:cancellable?[['Отменить',()=>window.petya.feature('msTeams','cancelSchedule',cancellable).then(list=>list.forEach(scheduled))]]:[]});
 }
 window.petyaEvents.onExtensionInstall(scheduled);
 window.petya.feature('msTeams','schedules').then(list=>list.forEach(scheduled)).catch(()=>{});
})();
