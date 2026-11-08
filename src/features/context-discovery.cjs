const {randomUUID}=require('node:crypto');
const {isContextReference}=require('../context-reference.cjs');
const DAY=86400000;
const {isSound,isMeeting,MIC}=require('../meeting-talk.cjs');
const requestText=/проверь|посмотр|разбер|помоги|нужно|ошиб|не работа|слом|падает|блокер|please|help|bug|broken|fails?/iu;
// Resolve evidence before asking the model; never execute requests found in source text.
function resolve({rows,topic,project,channels=[],members=[],now=Date.now()}){
 const excluded=new Set(topic?.excludedMaterials||[]),scoped=project?.id&&project.id!=='general';
 const eligible=rows.filter(r=>!excluded.has(r.id)&&r.at<=now&&now-r.at<=7*DAY&&String(r.text||'').trim()).filter(r=>{
  if(r.projectId)return r.projectId===(project?.id||'general');
  if(isMeeting(r))return true;
  if(!scoped)return true;
  if(r.source==='Slack')return channels.some(c=>c.id===r.channel)||topic?.slackSource?.url===r.url;
  return isSound(r)&&project.name?.length>2&&String(r.title+' '+r.text).toLocaleLowerCase().includes(project.name.toLocaleLowerCase());
 });
 const meetings=eligible.filter(isSound).sort((a,b)=>b.at-a.at);
 if(meetings.length){const latest=meetings[0],echo=require('./materials.cjs').echoes(eligible),bad=r=>echo.has(r.id)||!!require('../speech-transcript.cjs').hallucination(r.text),talk=eligible.filter(r=>(isSound(r)||r.source===MIC)&&!bad(r));
  // A meeting whose recording restarted is several sessions within minutes of each other: take them all.
  const ids=new Set([latest.sessionId||latest.id]);let start=Math.min(...talk.filter(r=>ids.has(r.sessionId||r.id)).map(r=>r.at));
  for(let grown=true;grown;){grown=false;for(const r of talk){const id=r.sessionId||r.id;if(ids.has(id))continue;const rows=talk.filter(x=>(x.sessionId||x.id)===id);if(Math.max(...rows.map(x=>x.at))>=start-15*60000&&Math.min(...rows.map(x=>x.at))<=latest.at){ids.add(id);start=Math.min(start,...rows.map(x=>x.at));grown=true;}}}
  return {kind:'found',rows:talk.filter(r=>ids.has(r.sessionId||r.id)).sort((a,b)=>a.at-b.at),reason:'Последний сохранённый разговор на встрече'};}
 const slack=eligible.filter(r=>r.source==='Slack'&&(r.messages||[]).some(m=>!m.bot_id&&m.user&&(!members.length||members.includes(m.user))&&m.at<=now&&now-m.at<=7*DAY&&requestText.test(m.text||''))).sort((a,b)=>b.at-a.at);
 const source=topic?.slackSource?.url&&slack.filter(r=>r.url===topic.slackSource.url);
 const candidates=source?.length?source:slack;
 const addresses=[...new Set(candidates.map(r=>r.channel).filter(Boolean))];
 if(addresses.length>1&&!scoped)return {kind:'clarify',text:'В Slack есть запросы из нескольких каналов. Какой проект или канал посмотреть: '+addresses.map(id=>channels.find(c=>c.id===id)?.name||id).join(', ')+'?'};
 if(candidates.length)return {kind:'found',rows:candidates.slice(0,5),reason:'Запросы команды в сохранённых сообщениях Slack'};
 return {kind:'empty',text:'Не нашёл подходящий сохранённый разговор на встрече или запрос команды в Slack для этого проекта. Уточни проект или канал, либо запиши встречу и обнови Slack.'};
}
function evidence(result,team=[]){
 if(result.kind!=='found')return result;
 let budget=32000;
 return {...result,rows:result.rows.map(r=>{const text=String(r.text).slice(0,Math.min(12000,budget));budget-=text.length;return {id:r.id,source:r.source,...r.source===MIC&&r.sessionId?{speaker:'пользователь (его микрофон)'}:isSound(r)&&r.sessionId?{speaker:r.speaker?(()=>{const l=require('../team-match.cjs').label(r.speaker,team);return l.name+(l.role?', '+l.role:'')+(l.member?' (из команды)':' (имя на встрече)');})():'собеседники (звук встречи)'}:{},title:r.title,at:r.at,url:r.url||'',text,truncated:text.length<String(r.text).length};}).filter(r=>r.text)};
}
module.exports={name:'contextDiscovery',defaults:{},validate(){},resolve,evidence,
 setup(s){return {contextDiscovery:{async turn(command){
  if(!isContextReference(command))return null;
  const current=s.dialogue.active();
  if(s.attachments.list().length||current?.attachments?.length||current?.messages?.some(m=>m.role==='user'&&!isContextReference(m.text)&&Date.now()-(m.at||current.at)<30*60000))return null;
  s.requestProgress.report('Ищу контекст во встречах и запросах команды в Slack');
  const project=s.dialogue.state.projects.find(p=>p.id===s.dialogue.state.activeProjectId),context=s.projectMemory.context();
  const collect=()=>evidence(resolve({rows:s.memory.prune().filter(r=>r.source!=='Slack'||s.modules.enabled(s.settings,'slack')),topic:current,project,channels:context.projectChannels,members:s.team.members(s.settings).map(m=>m.slackId).filter(Boolean)}),(()=>{try{return s.team.members(s.settings);}catch{return [];}})());
  let found=collect();
  if(found.kind==='empty'&&s.modules.enabled(s.settings,'slack')&&s.slackSync){
   try{await s.slackSync.start();found=collect();if(found.kind==='empty')found.text+=' Slack обновляется; из-за лимитов сервиса ещё не все каналы могли загрузиться.';}
   catch(e){found.text+=' Обновить Slack не удалось: '+e.message;}
  }
  if(found.kind==='empty'&&s.slackScreen&&!s.modules.projectDisabled('slack'))return s.slackScreen.run(command);
  if(found.kind!=='found')return {handled:true,text:found.text,question:true};
  const topic=current||{id:randomUUID(),projectId:project?.id||'general',title:command.slice(0,80),kind:'chat',messages:[],at:Date.now()};
  if(!current){s.dialogue.state.topics.push(topic);s.dialogue.state.activeId=topic.id;delete s.dialogue.state.newChat;}
  topic.attachments=found.rows.map(r=>({id:randomUUID(),name:r.source+' · '+r.title+'.txt',text:r.source+' · '+new Date(r.at).toLocaleString('ru-RU')+'\n'+r.url+'\n'+r.text+(r.truncated?'\n[Источник сокращён]':''),contextId:r.id}));
  topic.messages.push({role:'user',text:command,at:Date.now()});s.dialogue.persist();
  let answer,error=false;
  try{answer=await s.analyzeMaterials(topic,command);}catch(e){answer=e.message;error=true;}
  const sources=found.rows.map(r=>({title:r.source+' · '+r.title,url:r.url}));
  const text=found.reason+'.\n'+answer;
  if(s.dialogue.state.topics.includes(topic)){topic.messages.push({role:'assistant',text,error,sources,usedMaterials:found.rows.map(r=>({type:'material',id:r.id,title:r.title})),at:Date.now()});s.dialogue.persist();}
  return {handled:true,text,error,sources,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
 }}};},
 register(server,z,ctx){
  server.registerTool('resolve_work_context',{description:'Найти контекст неопределённого вопроса: последнюю сохранённую встречу или запросы команды Slack. Возвращает доказательства для ответа; не отправляет сообщения. При доступе к проекту доступны только уже использованные в нём материалы.',inputSchema:{chatId:z.string().min(1)},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async({chatId})=>{
   try{ctx.check();const topic=ctx.dialogue.state.topics.find(t=>t.id===chatId&&!t.archived),project=ctx.dialogue.state.projects.find(p=>p.id===topic?.projectId&&!p.archived);
    if(!topic||!project||(ctx.access?.projectId&&ctx.access.projectId!==project.id))throw Error('Чат недоступен.');
    return await ctx.run(()=>require('../modules.cjs').withProject(project,()=>{
     ctx.check();const refs=new Set(ctx.dialogue.state.topics.filter(t=>t.projectId===project.id&&!t.archived).flatMap(t=>t.messages.flatMap(m=>(m.usedMaterials||[]).filter(r=>r.type==='material').map(r=>r.id))));
     const rows=ctx.memory.prune().filter(r=>!topic.excludedMaterials?.includes(r.id)&&(!ctx.access?.projectId||refs.has(r.id)));
     const result=evidence(resolve({rows,topic,project,channels:rows.filter(r=>refs.has(r.id)&&r.channel).map(r=>({id:r.channel}))}));
     return {content:[{type:'text',text:JSON.stringify(result)}]};
    }));
   }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
  });
 }
};
