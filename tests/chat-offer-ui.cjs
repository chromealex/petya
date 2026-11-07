// A chat with the same subject is offered with a button under the answer; the open chat does not change.
module.exports=async win=>win.webContents.executeJavaScript(`(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 await selectDialogueTopic('');topicSelect.add(new Option('Задачи в Jira','offer-target'));
 const node=renderDialogueMessage({role:'assistant',text:'Задачи в статусе New: 2',chatOffer:{topicId:'offer-target',title:'Задачи в Jira'},at:Date.now()});
 const button=node.querySelector('button.chat-offer');assert(button,'No offer button');assert(button.textContent==='Перейти в чат «Задачи в Jira»',button.textContent);
 assert(topicSelect.value==='','Chat switched by itself');
 assert(!renderDialogueMessage({role:'assistant',text:'x',chatOffer:{topicId:'gone',title:'Старый'},at:Date.now()}).querySelector('button.chat-offer'),'Offer for a removed chat');
 const fresh=renderDialogueMessage({role:'assistant',text:'ok',chatOffer:{newChat:true,command:'план релиза'},at:Date.now()}).querySelector('button.chat-offer');assert(fresh&&fresh.textContent==='Начать новый чат','No new-chat offer');
 const understood=renderDialogueMessage({role:'user',text:'глядь почту раз в полчаса',understoodAs:'проверяй почту каждые 30 минут',at:Date.now()}).querySelector('.understood-as');assert(understood&&understood.textContent==='Понял как: «проверяй почту каждые 30 минут»','No understood-as note');
 [...topicSelect.options].find(o=>o.value==='offer-target').remove();
 return 'Chat offer button passed';
})()`).then(r=>console.log(r));
