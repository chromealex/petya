// Asana plugin: «мои задачи в Асане» in the chat answers with task cards (message.extensionData.asanaItems).
const asana=require('./client.cjs');
const READ=/(?:^|[\s,.!?«"])(?:asana|асан\p{L}*)(?=$|[\s,.!?»"])/iu;
const WRITE=/(?:^|\s)(?:созда\p{L}*|заведи|завести|добав\p{L}*|удали\p{L}*|измени\p{L}*|поменяй|перенеси|назначь|напиши|отправь)(?=\s|$)/iu;
const word=n=>n%10===1&&n%100!==11?'задача':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'задачи':'задач';
// Asana's IPC (projects, tasks, preview and apply of the Asana page; the spoken «создай задачу в Asana»),
// set up once per company. The channel names are the ones the renderer already calls (src/preload.cjs).
function setup(s){
  const {Asana}=require('./asana.cjs');
  const api=new Asana({settings:()=>s.settings,request:(...args)=>s.request(...args)});
  s.handle('asanaVoicePrepare',async(command,contextId,projectKey='')=>{
    s.modules.assertEnabled(s.settings,'asana');
    command=s.text(command,4000);const context=s.contextFor(contextId);
    return api.prepareVoice(command,context,s.composeDraft,projectKey);
  });
  s.handle('asanaProjects',offset=>api.projects(offset));
  s.handle('asanaTasks',(project,offset)=>api.tasks(project,offset));
  s.handle('asanaTask',id=>api.task(id));
  s.handle('asanaPreview',input=>api.preview(input));
  s.handle('asanaApply',id=>api.apply(id));
  s.handle('asanaContext',async id=>{const task=await api.task(id);return s.addContext({source:'Asana',title:task.name,text:task.name+'\n'+(task.notes||'')});});
  return {};
}
async function turn(s,command){
  const text=String(command||'');
  if(!READ.test(text)||WRITE.test(text)||!/(?:задач|таск|дела|что у меня|что на мне|список)/iu.test(text))return null;
  if(!s.modules.enabled(s.settings,'asana'))return null;
  let items;
  try{s.requestProgress?.report('Читаю задачи Asana');items=await asana.mine(s);}
  catch(e){s.dialogue.rememberAction(text,'Asana · '+e.message);const t=s.dialogue.active();t.messages.at(-1).error=true;s.dialogue.persist();return {handled:true,error:true,text:'Asana · '+e.message,topicId:t.id,messages:t.messages,by:'Asana'};}
  const today=new Date().toISOString().slice(0,10),overdue=items.filter(i=>i.due&&i.due<today).length;
  const reply=items.length?'В Asana на вас '+items.length+' '+word(items.length)+(overdue?', просрочено: '+overdue:'')+'.':'В Asana на вас нет открытых задач.';
  s.dialogue.rememberAction(text,reply);const t=s.dialogue.active(),message=t.messages.at(-1);
  message.by='Asana';if(items.length)message.extensionData={asanaItems:items};
  message.sources=[{title:'Asana · Мои задачи',url:'https://app.asana.com/0/my-tasks'}];s.dialogue.persist();
  return {handled:true,text:reply,topicId:t.id,topicTitle:t.title,messages:t.messages,by:'Asana'};
}
module.exports={name:'asanaCards',setup,turn};
