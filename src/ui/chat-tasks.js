// «Создай задачу по этому обсуждению»: open the usual Jira draft review with the chat as material.
(()=>{
 function install(){
  if(typeof window.showDialogueReply!=='function'||window.showDialogueReply.chatTasks)return;
  const original=window.showDialogueReply;
  const wrapped=async function(result,...rest){const out=await original.call(this,result,...rest);
   if(result?.draftMaterial?.text){try{
    if(currentDraft||draftBusy)throw Error('Сначала заверши текущий черновик.');
    const material=await window.petya.feature('chat-tasks','prepare',result.draftMaterial.title||'Задача из чата',result.draftMaterial.text);
    currentIntent='jira';automaticVoiceCommand=false;commandSnapshot='Создай задачу по обсуждению в чате';voiceReply=null;
    await makeDraft(material,null,{reviewOnly:true});
   }catch(e){notice(e.message,true);}}
   return out;};
  wrapped.chatTasks=true;window.showDialogueReply=wrapped;
 }
 if(document.readyState==='complete')install();else window.addEventListener('load',install);
})();
