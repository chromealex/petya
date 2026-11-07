// Feature: «Важно» — the user marks a message or a part of it as important. Chat-level marks go into
// every answer of that chat (and of agents it starts); project-level marks into every chat of the project.
const {randomUUID}=require('node:crypto');
const LIMIT=4000,ITEM=1000;
const SAY=/^(?:петя[,!\s]+)?(?:запомни|отметь|сохрани)\s+(?:это\s+)?как\s+важное(?:\s+для\s+(?:всего\s+)?(проекта))?\s*[:,—-]?\s*([\s\S]+)$/iu;
const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,ITEM);
const words=v=>String(v||'').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.]{2,}/gu)||[];
const key=w=>/\d/.test(w)?w.replace(/\.$/,''):w.slice(0,5);
const significant=w=>w.length>=4||/\d/.test(w);
const related=(text,mark)=>{const asked=new Set(words(text).filter(significant).map(key));return words(mark).some(w=>significant(w)&&asked.has(key(w)));};
function collect(state,topic,command=''){
 if(!topic)return [];
 const parent=topic.agentOf?state.topics.find(t=>t.id===topic.agentOf):null;
 const project=state.projects?.find(p=>p.id===topic.projectId);
 // The topic router may have moved the question to a new chat: marks from other chats of the project
 // that the question is about still count («Когда релиз 1.19?» after the mark in another chat).
 const nearby=command?state.topics.filter(t=>t!==topic&&t!==parent&&!t.archived&&t.projectId===topic.projectId).flatMap(t=>(t.highlights||[]).filter(h=>related(command,h.text))):[];
 const rows=[...(topic.highlights||[]),...(parent?.highlights||[]),...(project?.highlights||[]),...nearby];
 const out=[];let size=0;for(const h of rows){const text=clean(h.text);if(!text||out.includes(text))continue;if(size+text.length>LIMIT)break;out.push(text);size+=text.length;}
 return out;
}
function list(state,topicId){const topic=state.topics.find(t=>t.id===topicId);const project=topic&&state.projects?.find(p=>p.id===topic.projectId);return {chat:(topic?.highlights||[]).map(h=>({...h,scope:'chat'})),project:(project?.highlights||[]).map(h=>({...h,scope:'project'})),projectName:project?.name||''};}
function owner(state,topicId,scope){const topic=state.topics.find(t=>t.id===topicId);if(!topic)throw Error('Чат не найден.');if(scope==='project'){const project=state.projects?.find(p=>p.id===topic.projectId);if(!project)throw Error('Проект не найден.');return project;}return topic;}
function find(state,id){for(const holder of [...state.topics,...(state.projects||[])]){const i=(holder.highlights||[]).findIndex(h=>h.id===id);if(i>=0)return {holder,i};}throw Error('Отметка не найдена.');}
const RECALL=/^(?:петя[,!\s]+)?(?:а\s+)?(?:что|какие|покажи|напомни)(?=[\s,]).{0,40}?(?:важн\p{L}*\s+(?:не\s+забыть|помнить)|отмеча\p{L}*\s+(?:как\s+)?важн|отметк\p{L}*(?!\p{L})|важное(?!\p{L})\s*(?:$|[?.!]|в\s|по\s|из\s|для\s)|важные\s+(?:отметки|пункты|моменты))/iu;
module.exports={matches:t=>{t=String(t||'').trim();return SAY.test(t)||RECALL.test(t);},
 name:'highlights',
 collect,
 setup(s){
  const state=()=>s.dialogue.state,save=()=>s.dialogue.persist();
  require('../dialogue-request.cjs').important=(topic,command)=>collect(state(),topic,command);
  // A question about something the user marked stays in that chat instead of starting a new topic.
  const keep=(text,topic)=>{const marks=collect(state(),topic);if(!marks.length)return false;const asked=new Set(words(text).filter(w=>w.length>=4||/\d/.test(w)).map(key));return marks.some(m=>words(m).some(w=>(w.length>=4||/\d/.test(w))&&asked.has(key(w))));};
  s.dialogue.keepTopic=keep;
  const add=(topicId,{text,messageIndex=null,scope='chat',wholeMessage=false}={})=>{
   const topic=state().topics.find(t=>t.id===topicId);
   if(wholeMessage&&(!Number.isInteger(messageIndex)||topic?.messages[messageIndex]?.text!==text))throw Error('Сообщение изменилось. Откройте его заново.');
   const value=wholeMessage?String(text):clean(text);if(value.length>100000)throw Error('Сообщение слишком большое для отметки.');if(value.length<2)throw Error('Выделите текст, который нужно отметить.');
   const holder=owner(state(),topicId,scope==='project'?'project':'chat');holder.highlights=holder.highlights||[];
   const existing=holder.highlights.find(h=>h.text===value);if(existing){if(wholeMessage){Object.assign(existing,{wholeMessage:true,messageIndex,topicId});save();}return list(state(),topicId);}
   const total=holder.highlights.reduce((n,h)=>n+clean(h.text).length,0);if(total+clean(value).length>LIMIT)throw Error('Важного уже много — около '+LIMIT+' символов. Снимите старые отметки.');
   holder.highlights.push({id:randomUUID(),text:value,wholeMessage:!!wholeMessage,topicId,messageIndex:Number.isInteger(messageIndex)?messageIndex:null,at:Date.now()});save();return list(state(),topicId);
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
  // «Что важно не забыть?», «Что я отмечал как важное?» — the marks themselves, not a model guess or a Jira query.
  // Marks of this chat and project first; when there are none, marks of the project's other chats from the last day.
  const recall=command=>{if(!RECALL.test(String(command).trim()))return null;const topic=s.dialogue.active();
   let marks=topic?collect(state(),topic):[];
   if(!marks.length){const since=Date.now()-86400000,home=topic?.projectId||state().activeProjectId;marks=state().topics.filter(t=>t!==topic&&!t.archived&&t.projectId===home).flatMap(t=>(t.highlights||[]).filter(h=>(h.at||0)>=since).map(h=>clean(h.text)));marks=[...new Set(marks)];}
   const text=marks.length?'Отмечено как важное:\n'+marks.map(m=>'• '+m).join('\n'):'Важных отметок пока нет. Выдели текст в ответе и нажми «Важно» или скажи «Запомни как важное: …».';
   s.dialogue.rememberAction(command,text);const t=s.dialogue.active();const last=t?.messages?.at(-1);if(last?.role==='assistant')last.by='важное';save();
   return {handled:true,text,by:'важное',topicId:t?.id,topicTitle:t?.title,messages:t?.messages};};
  // Voice: «Запомни как важное: релиз 20 ноября», «… для проекта: тестирует Полина».
  const turn=command=>{const m=SAY.exec(String(command).trim());if(!m)return recall(command);let topic=s.dialogue.active();
   if(!topic){topic={id:randomUUID(),projectId:state().activeProjectId||'general',title:'Важное',kind:'chat',messages:[],at:Date.now()};state().topics.push(topic);state().activeId=topic.id;delete state().newChat;}
   const scope=m[1]?'project':'chat';add(topic.id,{text:m[2],scope});
   const text='Отметил как важное'+(scope==='project'?' для всего проекта':' для этого чата')+': «'+clean(m[2])+'». Буду учитывать это в ответах.';
   s.dialogue.rememberAction(command,text);const last=topic.messages.at(-1);if(last?.role==='assistant')last.by='важное';save();
   return {handled:true,text,by:'важное',topicId:topic.id,topicTitle:topic.title,messages:topic.messages,highlightsChanged:true};};
  return {highlights:{turn,keep,collect:topic=>collect(state(),topic)},ipc};
 }
};
