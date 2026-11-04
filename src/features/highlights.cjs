// Feature: «Важно» — the user marks a message or a part of it as important. Chat-level marks go into
// every answer of that chat (and of agents it starts); project-level marks into every chat of the project.
const {randomUUID}=require('node:crypto');
const LIMIT=4000,ITEM=1000;
const SAY=/^(?:петя[,!\s]+)?(?:запомни|отметь|сохрани)\s+(?:это\s+)?как\s+важное(?:\s+для\s+(?:всего\s+)?(проекта))?\s*[:,—-]?\s*([\s\S]+)$/iu;
const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,ITEM);
function collect(state,topic){
 if(!topic)return [];
 const parent=topic.agentOf?state.topics.find(t=>t.id===topic.agentOf):null;
 const project=state.projects?.find(p=>p.id===topic.projectId);
 const rows=[...(topic.highlights||[]),...(parent?.highlights||[]),...(project?.highlights||[])];
 const out=[];let size=0;for(const h of rows){const text=clean(h.text);if(!text||out.includes(text))continue;if(size+text.length>LIMIT)break;out.push(text);size+=text.length;}
 return out;
}
function list(state,topicId){const topic=state.topics.find(t=>t.id===topicId);const project=topic&&state.projects?.find(p=>p.id===topic.projectId);return {chat:(topic?.highlights||[]).map(h=>({...h,scope:'chat'})),project:(project?.highlights||[]).map(h=>({...h,scope:'project'})),projectName:project?.name||''};}
function owner(state,topicId,scope){const topic=state.topics.find(t=>t.id===topicId);if(!topic)throw Error('Чат не найден.');if(scope==='project'){const project=state.projects?.find(p=>p.id===topic.projectId);if(!project)throw Error('Проект не найден.');return project;}return topic;}
function find(state,id){for(const holder of [...state.topics,...(state.projects||[])]){const i=(holder.highlights||[]).findIndex(h=>h.id===id);if(i>=0)return {holder,i};}throw Error('Отметка не найдена.');}
module.exports={
 name:'highlights',
 collect,
 setup(s){
  const state=()=>s.dialogue.state,save=()=>s.dialogue.persist();
  require('../dialogue-request.cjs').important=topic=>collect(state(),topic);
  const add=(topicId,{text,messageIndex=null,scope='chat'}={})=>{
   const value=clean(text);if(value.length<2)throw Error('Выделите текст, который нужно отметить.');
   const holder=owner(state(),topicId,scope==='project'?'project':'chat');holder.highlights=holder.highlights||[];
   if(holder.highlights.some(h=>clean(h.text)===value))return list(state(),topicId);
   const total=holder.highlights.reduce((n,h)=>n+h.text.length,0);if(total+value.length>LIMIT)throw Error('Важного уже много — около '+LIMIT+' символов. Снимите старые отметки.');
   holder.highlights.push({id:randomUUID(),text:value,topicId,messageIndex:Number.isInteger(messageIndex)?messageIndex:null,at:Date.now()});save();return list(state(),topicId);
  };
  const ipc={
   list:topicId=>list(state(),topicId),
   add,
   remove:(topicId,id)=>{const {holder,i}=find(state(),id);holder.highlights.splice(i,1);save();return list(state(),topicId);},
   update:(topicId,id,{text,scope}={})=>{const {holder,i}=find(state(),id);const h=holder.highlights[i];
    if(typeof text==='string'){const value=clean(text);if(value.length<2)throw Error('Пустая отметка.');h.text=value;}
    if(scope&&['chat','project'].includes(scope)){const target=owner(state(),topicId,scope);if(target!==holder){holder.highlights.splice(i,1);target.highlights=target.highlights||[];target.highlights.push(h);}}
    save();return list(state(),topicId);}
  };
  // Voice: «Запомни как важное: релиз 20 ноября», «… для проекта: тестирует Полина».
  const turn=command=>{const m=SAY.exec(String(command).trim());if(!m)return null;let topic=s.dialogue.active();
   if(!topic){topic={id:randomUUID(),projectId:state().activeProjectId||'general',title:'Важное',kind:'chat',messages:[],at:Date.now()};state().topics.push(topic);state().activeId=topic.id;delete state().newChat;}
   const scope=m[1]?'project':'chat';add(topic.id,{text:m[2],scope});
   const text='Отметил как важное'+(scope==='project'?' для всего проекта':' для этого чата')+': «'+clean(m[2])+'». Буду учитывать это в ответах.';
   s.dialogue.rememberAction(command,text);const last=topic.messages.at(-1);if(last?.role==='assistant')last.by='важное';save();
   return {handled:true,text,by:'важное',topicId:topic.id,topicTitle:topic.title,messages:topic.messages,highlightsChanged:true};};
  return {highlights:{turn,collect:topic=>collect(state(),topic)},ipc};
 }
};
