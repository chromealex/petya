const {localEndpoint}=require('../core.cjs');
function create(s){
 const status=()=>s.modelRuntime.invoke('status');
 const ownReady=()=>{const state=status();return state.releaseAvailable&&state.phase==='ready'&&state.model==='petya-v1';};
 const topicFor=id=>{status();const topic=s.dialogue.state.topics.find(t=>t.id===id&&!t.archived);if(!topic||!s.dialogue.state.projects.some(p=>p.id===topic.projectId&&!p.archived))throw Error('Чат недоступен.');return topic;};
 const current=t=>typeof t.model==='string'?t.model:'';
 async function ollama(){
  const base=new URL(localEndpoint(s.settings.ollamaUrl));
  const tags=await s.directRequest(new URL('/api/tags',base).href,{signal:AbortSignal.timeout(3000)});
  return (Array.isArray(tags?.models)?tags.models:[]).filter(m=>typeof m.name==='string'&&m.name!=='petya-v1'&&!/cloud|embed/i.test(m.name)&&!m.remote_host&&!m.remote_model).map(m=>({name:m.name,size:Number(m.size)||0})).sort((a,b)=>a.size-b.size);
 }
 function capture(id,verify){
  verify();const topic=topicFor(id),projectId=topic.projectId,version=topic.versionIndex||0,previous=current(topic);
  const check=()=>{verify();if(topicFor(id)!==topic||topic.projectId!==projectId||(topic.versionIndex||0)!==version||current(topic)!==previous)throw Error('Чат или выбранная модель изменились. Обнови список.');};
  return {topic,previous,check};
 }
 const list=async(id,verify=()=>{})=>{
  const {topic,check}=capture(id,verify);let models=[],error='';
  try{models=await ollama();}catch(e){error='Ollama недоступна: '+e.message;}
  check();if(ownReady())models.unshift({name:'petya-v1',size:0,provider:'petya'});
  return {chatId:id,models,current:current(topic),defaultModel:s.settings.model||'',error:models.some(m=>m.provider==='petya')?'':error};
 };
 const set=async(id,model,previous,verify=()=>{})=>{
  if(typeof model!=='string'||model.length>200||typeof previous!=='string')throw Error('Некорректная модель.');
  const captured=capture(id,verify);if(captured.previous!==previous)throw Error('Модель уже изменена. Обнови список.');
  if(model==='petya-v1'){if(!ownReady())throw Error('Допущенная модель Пети ещё не готова.');}
  else if(model&&!(await ollama()).some(m=>m.name===model))throw Error('Модель не найдена в Ollama.');
  captured.check();if(model==='petya-v1'&&!ownReady())throw Error('Модель Пети остановлена. Повтори запуск.');
  if(model)captured.topic.model=model;else delete captured.topic.model;
  s.dialogue.persist();return {current:current(captured.topic),defaultModel:s.settings.model||''};
 };
 return {list,set};
}
function setup(s){
 const shared=create(s);
 s.handle('chatModels',()=>{const topic=s.dialogue.active();if(!topic)return {models:[],current:'',defaultModel:s.settings.model||'',error:'Открой чат.'};return shared.list(topic.id,()=>{if(s.dialogue.active()!==topic)throw Error('Открыт другой чат.');});});
 s.handle('chatModelSet',(model,id,previous)=>{const topic=s.dialogue.active();if(!topic||id!==topic.id)throw Error('Открыт другой чат. Обнови список моделей.');return shared.set(id,model,previous,()=>{if(s.dialogue.active()!==topic)throw Error('Открыт другой чат.');});});
 return {chatModels:shared};
}
function register(server,z,ctx){
 for(const [name,method] of [['list_chat_models','list'],['set_chat_model','set']])server.registerTool(name,{
  description:method==='list'?'Доступные локальные модели указанного чата. petya-v1 доступна только после допуска и готовности собственного сервиса.':'Выбрать локальную модель чата. Передай current из list_chat_models как previous. Нужны права edit на проект; ничего не загружает и не запускает.',
  inputSchema:{chatId:z.string().min(1).max(200),...(method==='set'?{model:z.string().max(200),previous:z.string().max(200)}:{})},annotations:{readOnlyHint:method==='list',destructiveHint:false,openWorldHint:false}
 },async({chatId,model,previous})=>{try{
  const check=()=>{ctx.check();const t=ctx.dialogue.state.topics.find(t=>t.id===chatId&&!t.archived);if(!t||!ctx.dialogue.state.projects.some(p=>p.id===t.projectId&&!p.archived)||ctx.access?.projectId&&ctx.access.projectId!==t.projectId||method==='set'&&ctx.access?.mode!=='edit')throw Error('Чат или права недоступны.');};
  check();return await ctx.run(async()=>{check();const result=await ctx.chatModels(method,...(method==='list'?[chatId,check]:[chatId,model,previous,check]));check();if(method==='set')ctx.changed?.({owner:chatId,name});return {content:[{type:'text',text:JSON.stringify(result)}]};});
 }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
}
module.exports={name:'chatModels',defaults:{},validate(){},create,setup,register};
