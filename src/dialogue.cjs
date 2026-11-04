const {randomUUID}=require('node:crypto');
const core=require('./core.cjs');
function actionRequest(text){
 const s=text.trim();
 if(/^(?:[«"“]|не\s|если\s|что\s|почему\s|зачем\s|как\s|объясни\s|дума[юешь])/iu.test(s))return false;
 return core.isDoCommand(s)||/^(?:(?:пожалуйста|можешь|можете)\s*[, ]*)?(?:создай|заведи|оформи|добавь|разбей|декомпозируй|передай|отдай|поручи|найди|покажи|поищи)(?=$|[\s,.!?])/iu.test(s) && (core.isJiraCommand(s)||core.isDocsCommand(s)||/(?:claude|клод|кодекс|codex)/iu.test(s));
}
function discussionOnly(text){return /^(?:а\s+)?(?:не\s|не надо\s|что такое|объясни|почему|как думаешь|что думаешь|как лучше|я думаю|мне кажется|давай обсудим|[«"“])/iu.test(text)||/^(?:\d+|первый|первая|первое|второй|вторая|второе|третий|третья|третье)[.!?]*$/iu.test(text.trim());}
function taskListRequest(text){
 if(require('./personal-tasks.cjs').personalTasks(text))return true;
 return /^(?:(?:а|и|теперь)\s+)?(?:(?:какие|покажи|перечисли|прочитай|посмотри|проверь)\s+(?:там\s+)?(?:таски|задачи)(?:\s+(?:есть|в|по|для)(?:\s+.*)?)?|(?:таски|задачи)\s+какие)[.!?]*$/iu.test(text.trim());
}
function intent(text,active){
 if(taskListRequest(text))return 'tasks';
 if(discussionOnly(text))return 'chat';
 if(/^(?:а\s+)?(?:что такое|объясни|почему|как думаешь|что думаешь|как лучше|я думаю|мне кажется|давай обсудим)/iu.test(text))return 'chat';
 if(/(?:верн|продолж).*(?:баг|bug|жир|jira)/iu.test(text))return 'bugs';
 if(/(?:\banr\b|анр|google play|гугл пл[еэ]й)/iu.test(text))return 'anr';
 if(/(?:баг|bug|ошиб).*(?:верс|релиз|сколько|jira|жир)|(?:сколько|посмотр|провер).*(?:баг|bug)/iu.test(text))return 'bugs';
 // A leading «а» is not evidence that a new subject is a bug/ANR request.
 const continuation=text.trim().replace(/^(?:а|теперь)\s+/iu,'').replace(/[.!?]+$/u,'');
 if(active&&['bugs','anr','tasks'].includes(active.kind)&&(/^(?:в|по|для)\s+проект[еу]?\s+[\p{L}\p{N}][\p{L}\p{N} _-]*$/iu.test(continuation)||/^теперь\s+в\s+[\p{L}\p{N}][\p{L}\p{N} _-]*[.!?]*$/iu.test(text)||/^(?:обнови(?: ответ| данные)?|сколько(?: их)?(?: всего| осталось| открытых| закрытых)?|посмотри ещё|проверь ещё)$/iu.test(continuation)||/^(?:по|за|в|для)\s+(?:эт|предыдущ|последн|прошл|текущ|нов|сегодня|вчера|\d)/iu.test(continuation)))return active.kind;
 return 'chat';
}
function selectChoice(text,options){
 const value=text.toLocaleLowerCase().replace(/[.,!?]/g,'').trim();
 const ordinal={первый:0,первая:0,первое:0,второй:1,вторая:1,второе:1,третий:2,третья:2,третье:2};
 const index=/^\d+$/.test(value)?Number(value)-1:ordinal[value];
 if(Number.isInteger(index))return options[index]?[options[index]]:[];
 return options.filter(o=>[o.id,o.label,o.label.split(' · ')[0].replace(/\s*\([^)]*\)$/,'')].some(n=>{n=String(n).toLowerCase();return value===n||(n.length>=3&&value.includes(n));}));
}
// Each request runs inside a chat scope: within it, «the active chat/project» means the chat the
// request came from, so many chats can be served at once. Outside a scope the values are the
// user's selection. A request that opens another chat moves the user there only if the user is
// still looking at the request's chat.
const {AsyncLocalStorage}=require('node:async_hooks');
const chatScope=new AsyncLocalStorage();
const SCOPED=new Set(['activeId','activeProjectId','newChat']);
const RAW=Symbol('raw state');
function scopedState(dialogue,target){
 if(target&&target[RAW])target=target[RAW];
 const store=()=>{const s=chatScope.getStore();return s&&s.dialogue===dialogue?s:null;};
 const assign=(t,s,key,value)=>{
  const following=t.activeId===s.activeId;
  if(key==='activeId'&&following){if(value===undefined)delete t.activeId;else t.activeId=value;if(value)delete t.newChat;}
  if(key==='activeProjectId'&&following&&value!==undefined)t.activeProjectId=value;
  s[key]=value;
 };
 return new Proxy(target,{
  get(t,key,receiver){if(key===RAW)return t;if(key==='toJSON')return ()=>({...t});const s=SCOPED.has(key)&&store();return s?s[key]:Reflect.get(t,key,receiver);},
  set(t,key,value){const s=SCOPED.has(key)&&store();if(s)assign(t,s,key,value);else t[key]=value;return true;},
  deleteProperty(t,key){const s=SCOPED.has(key)&&store();if(s)assign(t,s,key,undefined);else delete t[key];return true;}
 });
}
class Dialogue {
 get state(){return this._state;}
 set state(value){this._state=scopedState(this,value||{topics:[],activeId:''});}
 // Run work as a request of chat `topicId` (empty for a new chat) in project `projectId`.
 within(topicId,projectId,work){const raw=this.state[RAW];return chatScope.run({dialogue:this,activeId:topicId||'',activeProjectId:projectId||raw.activeProjectId,newChat:!topicId},work);}
 scopedChat(){return chatScope.getStore()?.dialogue===this;}
 // True while a request of chat `id` is running (busy() without id: any chat).
 busyChat(id){return id===undefined?this.running.size>0:this.running.has(id||'new:'+this.state.activeProjectId);}
 get busy(){return this.busyChat(this.active()?.id||'');}
 constructor({state={topics:[],activeId:''},save=()=>{},answer,readers,routeTopic,context=()=>'',days=()=>30,now=Date.now}){Object.assign(this,{state,save,answer,readers,routeTopic,context,days,now});this.running=new Set();this.ensureProjects(true);this.prune();}
 prune(){const oldCount=(this.state.topics||[]).length;const cutoff=this.now()-Number(this.days())*86400000;const expiredRoute=this.state.lastRouting?.at<cutoff;if(expiredRoute)delete this.state.lastRouting;this.state.topics=(this.state.topics||[]).filter(t=>t.at>=cutoff);if(!this.active())this.state.activeId='';if(oldCount!==this.state.topics.length||expiredRoute)this.persist();}
 active(){return this.state.topics.find(t=>t.id===this.state.activeId);}
 ensureProjects(migrate=false){
  this.state.projects ||= [];
  if(!this.state.projects.some(p=>p.id==='general'))this.state.projects.unshift({id:'general',name:'Общее'});
  const general=this.state.projects.find(p=>p.id==='general');general.name='Общее';general.archived=false;delete general.folder;delete general.folders;delete general.memoryId;this.state.projects=[general,...this.state.projects.filter(p=>p.id!=='general')];
  if(!this.state.projects.some(p=>p.id===this.state.activeProjectId))this.state.activeProjectId=this.state.projects[0].id;
  for(const t of this.state.topics)if(!this.state.projects.some(p=>p.id===t.projectId)){t.projectId=migrate?this.state.projects[0].id:this.state.activeProjectId;if(!migrate&&!t.projectMemoryId){const memoryId=this.state.projects.find(p=>p.id===t.projectId)?.memoryId;if(memoryId)t.projectMemoryId=memoryId;}}
  const active=this.active();if(active){this.state.activeProjectId=active.projectId;delete this.state.newChat;}
 }
 persist(){this.ensureProjects();const topic=this.active();if(topic)require('./conversation-archive.cjs').refreshArchive(topic);this.save(this.state[RAW]);}
 scoped(){return this.state.topics.filter(t=>t.projectId===this.state.activeProjectId&&!t.archived);}
 projectName(name){if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('Введите название проекта от 1 до 80 символов.');return name.trim();}
 projectCreate(name){name=this.projectName(name);if(this.state.projects.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Проект с таким названием уже есть.');const project={id:randomUUID(),name};this.state.projects.push(project);this.state.activeId='';this.state.activeProjectId=project.id;this.persist();return this.list();}
 projectSelect(id){if(!this.state.projects.some(p=>p.id===id&&!p.archived))throw Error('Проект не найден или находится в архиве.');this.state.activeId='';this.state.activeProjectId=id;this.state.newChat=true;delete this.state.lastRouting;this.persist();return this.list();}
 projectRename(id,name){if(id==='general')throw Error('Название общего проекта изменить нельзя.');name=this.projectName(name);const project=this.state.projects.find(p=>p.id===id);if(!project)throw Error('Проект не найден.');if(this.state.projects.some(p=>p.id!==id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Проект с таким названием уже есть.');project.name=name;this.persist();return this.list();}
 move(id,projectId){if(this.running.has(id))throw Error('Дождитесь ответа Пети.');const topic=this.state.topics.find(t=>t.id===id);if(!topic||!this.state.projects.some(p=>p.id===projectId))throw Error('Чат или проект не найден.');if(topic.projectId!==projectId){topic.projectId=projectId;topic.projectMemoryId=this.state.projects.find(p=>p.id===projectId).memoryId||'';for(const key of ['jiraProject','versionId','lastData','slackSource','pending','lastChatResult'])delete topic[key];}this.persist();return this.list();}

 archive(kind,id,archived){const row=(kind==='project'?this.state.projects:this.state.topics).find(r=>r.id===id);if(!row)throw Error('Запись не найдена.');if(kind==='project'&&id==='general')throw Error('Общее нельзя архивировать.');row.archived=!!archived;if(archived&&(kind==='project'&&this.state.activeProjectId===id||kind==='chat'&&this.state.activeId===id)){this.state.activeId='';if(kind==='project')this.state.activeProjectId='general';}this.persist();return this.list();}

 pin(id,pinned){const topic=this.state.topics.find(t=>t.id===id);if(!topic)throw Error('Чат не найден.');topic.pinned=!!pinned;this.persist();return this.list();}
 reorder(id,projectId,beforeId=''){const topic=this.state.topics.find(t=>t.id===id),before=beforeId?this.state.topics.find(t=>t.id===beforeId&&t.projectId===projectId):null;if(!topic||beforeId&&!before)throw Error('Чат больше недоступен.');if(beforeId===id)return this.list();this.move(id,projectId);if(before)topic.pinned=!!before.pinned;const rows=this.state.topics.filter(t=>t.projectId===projectId&&t.id!==id).sort((a,b)=>(a.order??-a.at)-(b.order??-b.at));const index=before?rows.findIndex(t=>t.id===beforeId):rows.length;rows.splice(index,0,topic);rows.forEach((t,i)=>t.order=i);this.persist();return this.list();}

 list(){this.prune();return {activeId:this.state.activeId,activeProjectId:this.state.activeProjectId,projects:this.state.projects.map(p=>({...p,count:this.state.topics.filter(t=>t.projectId===p.id).length})),topics:this.scoped().map(({id,title,kind,at,projectId})=>({id,title,kind,at,projectId}))};}
 rename(id,title){const topic=this.state.topics.find(t=>t.id===id);if(!topic)throw Error('Тема больше недоступна.');title=String(title||'').trim().slice(0,160);if(!title)throw Error('Введите название темы.');topic.title=title;this.persist();return this.list();}
 select(id){this.prune();if(id&&!this.state.topics.some(t=>t.id===id))throw new Error('Тема больше недоступна.');this.state.activeId=id;if(!id)this.state.newChat=true;this.persist();return this.active()||null;}
 rememberAction(command,message,project='',receipt=null){
  this.prune();let t=this.active();if(!t){t={id:randomUUID(),title:'Задачи'+(project?' · '+project:''),kind:'work',messages:[],at:this.now()};this.state.topics.push(t);this.state.activeId=t.id;}
  if(project)t.jiraProject=project;if(receipt)require('./action-evidence.cjs').recordReceipt(t,receipt);t.at=this.now();t.messages.push({role:'user',text:command,at:t.at},{role:'assistant',text:message,at:t.at});this.persist();
 }
 clear(){this.state={topics:[],activeId:''};this.persist();}
 actionContext(){const t=this.active();if(!t)return null;return {id:'dialogue-'+t.id,projectMemoryId:t.projectMemoryId,title:t.title,source:'Диалог',at:t.at,text:t.messages.map(m=>(m.role==='user'?'Пользователь: ':'Петя: ')+m.text).join('\n').slice(-30000)};}
 // Speculative classification only: no history writes, readers or user actions.
 prepareRoute(text){
  const active=this.active();
  if(this.state.newChat||discussionOnly(text)||!this.routeTopic||active?.pending||actionRequest(text)||intent(text,active)!=='chat'||/^(?:верн[её]мся|вернись|продолжим|вернуться|новая тема|другая тема|теперь поговорим)/iu.test(text))return null;
  const stateKey=JSON.stringify(this.state),topics=structuredClone(this.scoped()),activeId=active?.id;
  const result=Promise.resolve().then(()=>this.routeTopic(text,topics,activeId)).catch(()=>({unclear:true}));
  return {owner:this,text,stateKey,result};
 }
 greeting(command){
  const text=require('./dialogue-answer.cjs').greetingReply(command);
  if(!text||this.busy||this.active()?.pending)return null;
  this.prune();let topic=this.active();
  if(!topic){topic={id:randomUUID(),title:'Разговор с Петей',kind:'chat',messages:[],at:this.now()};this.state.topics.push(topic);this.state.activeId=topic.id;}
  topic.at=this.now();topic.messages.push({role:'user',text:command,at:topic.at},{role:'assistant',text,at:topic.at,by:'шаблон: приветствие'});this.persist();
  return {handled:true,text,topicId:topic.id,topicTitle:topic.title,messages:topic.messages,topics:this.list()};
 }
 async turn(text,choice,forcedKind,preparedRoute){
  const runningKey=this.active()?.id||'new:'+this.state.activeProjectId;if(this.running.has(runningKey))throw new Error('Дождитесь ответа Пети.');this.running.add(runningKey);
  try{
   this.prune();let active=this.active();
   if(choice){if(!active?.pending||!active.pending.options.some(o=>o.id===choice))throw new Error('Уточнение устарело.');active[active.pending.field]=choice;text=active.pending.field==='versionId'?active.pending.command.replace(/последн[а-я]*|свеж[а-я]*|текущ[а-я]*|предыдущ[а-я]*/giu,''):active.pending.command;forcedKind=active.pending.kind;delete active.pending;}
   else if(active?.pending){const matches=selectChoice(text,active.pending.options);if(matches.length===1){active[active.pending.field]=matches[0].id;text=active.pending.field==='versionId'?active.pending.command.replace(/последн[а-я]*|свеж[а-я]*|текущ[а-я]*|предыдущ[а-я]*/giu,''):active.pending.command;forcedKind=active.pending.kind;delete active.pending;}else {if(/^\d+[.!?]*$/u.test(text.trim()))return {handled:true,text:'Выбери один из предложенных вариантов.',question:true,options:active.pending.options,topicId:active.id};delete active.pending;this.persist();if(/^(?:отмена|отложи|не надо|стоп)[.!?]*$/iu.test(text.trim()))return {handled:true,text:'Отменено.',topicId:active.id};} }
   if(!forcedKind&&/^(?:\d+|первый|первая|первое|второй|вторая|второе|третий|третья|третье)[.!?]*$/iu.test(text.trim()))return {handled:true,text:'Какой вариант ты имеешь в виду? Сейчас нет открытого списка для выбора.',question:true};
   if(!forcedKind&&!taskListRequest(text)&&actionRequest(text)){return {handled:false};}
   let kind=forcedKind||intent(text,active);
   const back=/^(?:верн[её]мся|вернись|продолжим|вернуться)/iu.test(text);
   if(back){const terms=core.words(text).filter(w=>!['вернемся','вернёмся','вернись','продолжим','вернуться','теме','тема','давай'].includes(w));const matches=this.scoped().filter(t=>text.toLowerCase().includes(t.title.toLowerCase())||(kind!=='chat'&&t.kind===kind)||(terms.length&&terms.some(w=>core.words(t.title).some(v=>w.length>=4&&v.startsWith(w.slice(0,Math.min(w.length,5)))))));if(matches.length===1){this.state.activeId=matches[0].id;active=matches[0];kind=active.kind;}else return {handled:true,text:'К какой теме вернуться?',topicChoices:this.list().topics};}
   let newTopic=!!this.state.newChat||/^(?:новая тема|другая тема|теперь поговорим)/iu.test(text);
   let suggestedTitle='',unclear=false;
   if(kind==='chat'&&!discussionOnly(text)&&!forcedKind&&!back&&!newTopic&&this.routeTopic){
    try{const route=await (preparedRoute?.owner===this&&preparedRoute.text===text&&preparedRoute.stateKey===JSON.stringify(this.state)?preparedRoute.result:this.routeTopic(text,this.scoped(),active?.id));unclear=!!route?.unclear;if(['bugs','anr'].includes(route?.kind))kind=route.kind;if(route?.newTopic){newTopic=true;suggestedTitle=String(route.title||text).slice(0,80);}else if(route?.topicId){const found=this.scoped().find(t=>t.id===route.topicId);if(found){active=found;this.state.activeId=found.id;}}}catch{unclear=true;}
   }
   if(newTopic||!active||(kind!=='chat'&&active.kind!==kind)){
    const hint=!newTopic&&active?(active.title+' '+active.messages.slice(-2).map(m=>m.text).join(' ')):'';const previousProject=!newTopic?active?.jiraProject:undefined;const previousVersion=!newTopic?active?.versionId:undefined;
    const same=!newTopic&&this.scoped().filter(t=>t.kind===kind);
    active=same?.length===1?same[0]:{id:randomUUID(),title:kind==='bugs'?'Баги в Jira':kind==='tasks'?'Задачи в Jira':kind==='anr'?'ANR в Google Play':(suggestedTitle||text.slice(0,80)),kind,messages:[],at:this.now(),contextHint:hint,...['bugs','tasks'].includes(kind)&&previousProject?{jiraProject:previousProject,...previousVersion?{versionId:previousVersion}:{}}:{}};
    if(!this.state.topics.includes(active))this.state.topics.push(active);this.state.activeId=active.id;
   }
   const before=structuredClone(active);
   active.at=this.now();active.messages.push({role:'user',text,at:this.now()});this.persist();
   let result;
   try{
    if(back){const last=active.messages.filter(m=>m.role==='assistant').at(-1);result={text:'Вернулись к теме «'+active.title+'». '+(last?'Последний сохранённый ответ от '+new Date(last.at).toLocaleString('ru-RU')+': '+last.text+' Для свежих данных скажите «обнови».':'Что обсудим?')};}
    else if(kind==='bugs'||kind==='anr'||kind==='tasks'){
     result=await this.readers[kind](text,active,active.contextHint||this.context());
     if(result.question){active.pending={command:text,kind,field:result.field,options:result.options||[]};result.text=result.question;}
     result.by=result.by||{bugs:'Jira: баги',anr:'Google Play: ANR',tasks:'Jira: задачи'}[kind];
    }else {const answer=await this.answer(text,active,unclear);result=typeof answer==='string'?{text:answer}:{...answer};if(active.answeredBy&&!result.by)result.by=active.answeredBy;delete active.answeredBy;}
   }catch(error){result={text:'Не удалось проверить данные: '+error.message,error:true};}
   if(result.title && before.lastData && result.title!==before.title){
    const changed={...active,id:randomUUID(),messages:[{role:'user',text,at:this.now()}]};
    Object.assign(active,before);
    active=this.scoped().find(t=>t.title===result.title&&t.kind===kind)||changed;
    if(active!==changed)active.messages.push({role:'user',text,at:this.now()});else this.state.topics.push(active);
    this.state.activeId=active.id;
   }
   if(result.title)active.title=result.title;
   if(result.data)active.lastData=result.data;
   active.messages.push({role:'assistant',text:result.text,sources:result.sources||[],at:this.now(),...(result.by?{by:result.by}:{})});this.persist();
   return {handled:true,...result,topicId:active.id,topicTitle:active.title,messages:active.messages,topics:this.list()};
  }finally{this.running.delete(runningKey);}
 }
}
module.exports={chatScope,RAW,Dialogue,taskListRequest,intent,actionRequest,selectChoice,discussionOnly};
