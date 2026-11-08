// Capability «code-fix» of «Программист»: the problem goes to the chat as a coding request; the Programmer works
// in its own branch and nothing reaches the project before the user accepts the diff.
const {isCoding}=require('./intent.cjs');
module.exports={
 label:'Отдать Программисту',
 ready:s=>s.extension_coder==='true',
 async run(services,payload){
  const text=String(payload.text||'').trim().slice(0,4000);if(!text)throw Error('Нет описания проблемы.');
  // A request the Programmer would not recognise as coding work gets an explicit address.
  return {ask:isCoding(text)?text:'Как программист, исправь в коде проекта: '+text,send:true};
 }
};
