// The evening summary in the notification center with «Открыть дневник»: the main process publishes it without
// functions (src/extensions/journal/feature.cjs), the action is added here.
(()=>{
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 async function open(j){
  if(j.projectId&&typeof topicSelect!=='undefined'&&j.projectId!==topicSelect.dataset.projectId)await window.petya.chatProjectSelect(j.projectId);
  if(typeof selectDialogueTopic==='function'&&j.topicId)await selectDialogueTopic(j.topicId);
  if(typeof view==='function')view('home');
 }
 window.petyaEvents.onExtensionInstall(item=>{
  if(item?.id!=='journal-evening'||!item.journal)return;
  const {journal:j,...rest}=item;
  put({...rest,actions:[['Открыть дневник',()=>open(j)]]});
 });
})();
