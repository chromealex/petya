// Capability «document-export» of «Google Диск»: a card's text ({title, text (Markdown), app?}) goes to the chat as a
// request to save it; the confirmation card there previews the document, lets the user fix the title and creates the
// Google Doc only on «Создать документ».
const drafts=require('./drafts.cjs');
const auth=require('./auth.cjs');
module.exports={
 label:'Сохранить в Google Документы',
 ready:settings=>auth.connected(settings),
 hint:settings=>auth.writable(settings)?'Петя покажет документ и создаст его после подтверждения':'Сначала разрешите создавать документы в настройках «Google Диск»',
 async run(services,payload){
  if(!auth.writable(services.settings||{}))return {settings:'google-drive',text:'Чтобы сохранять, разрешите создавать документы в настройках «Google Диск».'};
  const id=drafts.put(payload);
  return {ask:'Сохрани в Google Документы «'+String(payload.title||'Документ Пети').replace(/[«»#]/g,'').replace(/\s+/g,' ').trim().slice(0,100)+'» · #'+id,send:true};
 }
};
