module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  const before=await window.petya.teamList(),settings=await window.petya.settings();
  try {
   await window.petya.saveSettings({model:''});await window.petya.teamSave({members:[],notes:''});
   await processCommand('Петя, заполни команду: Полина — тестирование');
   let saved=await window.petya.teamList();if(saved.members.length!==1||saved.members[0].name!=='Полина')throw Error('Voice team fill did not save: '+document.getElementById('notice').textContent);
   for(let i=0;i<30&&!document.querySelector('#team-list [data-field="name"]');i++)await new Promise(r=>setTimeout(r,10));
   if(document.querySelector('#team-list [data-field="name"]')?.value!=='Полина')throw Error('Team view not refreshed');
   await processCommand('Заполни команду: Полина — релизы');
   if(!voiceReply)throw Error('No voice conflict reply');
   await voiceTurn.dispatch('замени',Date.now());saved=await window.petya.teamList();
   if(saved.members[0].responsibilities!=='Релизы')throw Error('Voice conflict selection not saved');
   await processCommand('Заполни команду: Полина — релизы');
   if((await window.petya.teamList()).members.length!==1)throw Error('Duplicate team member');
  } finally {
   await window.petya.teamSave(before);await window.petya.saveSettings({model:settings.model});
   voiceReply=null;voiceTurn.reset();document.dispatchEvent(new Event('petya-team-updated'));
  }
 })()`);
};
