// Asana plugin: quick edits of task cards (done, due date) with undo, and «Реализовать» through the task runner.
const asana=require('./client.cjs');
const key=item=>JSON.stringify(['asana',item.gid]);
const QUICK=['complete','reopen','due','execute'];
function describe(message){
  return (message.extensionData?.asanaItems||[]).map(item=>({key:['asana',item.gid],item,presentationKey:key(item),title:'Asana · '+item.name,subtitle:item.project,
    actions:[{id:'open',label:'Открыть в Asana'},...QUICK.map(id=>({id,label:id,hidden:true}))]}));
}
function remember(row,s,next){
  const list=row.message.extensionData?.asanaItems;const i=list?.findIndex(x=>x.gid===row.item.gid);
  if(i>=0){list[i]={...list[i],...next};s.dialogue.persist();}
}
async function perform(action,row,s,check,args={}){
  const id=row.item.gid;
  if(action==='open'){if(!row.item.url)throw Error('У задачи нет ссылки.');await require('electron').shell.openExternal(row.item.url);return {handled:true,text:'Открыл задачу в Asana.'};}
  if(action==='complete'||action==='reopen'){
    const done=action==='complete',next=await asana.update(s,id,{completed:done});check();remember(row,s,next);
    return {handled:true,text:(done?'Готово: ':'Снова открыта: ')+next.name,item:next,undo:{action:done?'reopen':'complete',args:{}}};
  }
  if(action==='due'){
    const date=args.date===''?null:String(args.date||'');if(date!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Некорректный срок.');
    const before=row.item.due||'';const next=await asana.update(s,id,{due_on:date});check();remember(row,s,next);
    return {handled:true,text:date?'Срок: '+date:'Срок снят',item:next,undo:{action:'due',args:{date:before}}};
  }
  if(action==='execute'){
    if(!s.taskRunner)throw Error('План работ недоступен.');
    const t=await asana.task(s,id);check();
    const bug=/(?:^|\s)(?:баг|ошибк\p{L}*|bug|fix|исправ\p{L}*|почин\p{L}*|вылет\p{L}*|падает|крэш|краш|crash)/iu.test(t.name);
    return s.taskRunner.start({app:'asana',key:'Asana-'+t.gid.slice(-8),title:t.name,type:bug?'bug':'task',description:t.notes,url:t.url});
  }
  throw Error('Неизвестное действие Asana.');
}
module.exports={id:'asana',describe,perform};
