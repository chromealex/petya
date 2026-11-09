// «Заметки на полях»: an example of the places an app adds to Petya's interface (docs/extensions.md §8a) — its own
// page in the rail and tabs on Petya's pages. The renderers read the notes through this IPC (`uiNotes.list`).
const ID='ui-notes';
let notes=[];
module.exports={name:'uiNotes',defaults:{['extension_'+ID]:'false'},validate(){},
 setup(){
  notes=[{text:'Спросить Олега про сборку для iOS',done:false},{text:'Перенести ретро на пятницу',done:true},{text:'Обновить глоссарий проекта',done:false}];
  return {ipc:{
   list:()=>notes.map(n=>({...n})),
   add(text){const clean=String(text||'').trim().slice(0,200);if(!clean)throw Error('Пустая заметка.');notes.push({text:clean,done:false});return notes.length;}
  }};
 },
 teardown(){notes=[];}};
