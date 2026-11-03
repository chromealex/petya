const {randomUUID}=require('node:crypto');
const core=require('./core.cjs');
function actionRequest(text){
 const s=text.trim();
 if(/^(?:[«"“]|не\s|если\s|что\s|почему\s|зачем\s|как\s|объясни\s|дума[юешь])/iu.test(s))return false;
 return core.isDoCommand(s)||/^(?:(?:пожалуйста|можешь|можете)\s*[, ]*)?(?:создай|заведи|оформи|добавь|разбей|декомпозируй|передай|отдай|поручи|найди|покажи|поищи)(?=$|[\s,.!?])/iu.test(s) && (core.isJiraCommand(s)||core.isDocsCommand(s)||/(?:claude|клод|кодекс|codex)/iu.test(s));
}
function intent(text,active){
 if(/^(?:а\s+)?(?:что такое|объясни|почему|как думаешь|что думаешь|как лучше|я думаю|мне кажется|давай обсудим)/iu.test(text))return 'chat';
 if(/(?:верн|продолж).*(?:баг|bug|жир|jira)/iu.test(text))return 'bugs';
 if(/(?:\banr\b|анр|google play|гугл пл[еэ]й)/iu.test(text))return 'anr';
 if(/(?:баг|bug|ошиб).*(?:верс|релиз|сколько|jira|жир)|(?:сколько|посмотр|провер).*(?:баг|bug)/iu.test(text))return 'bugs';
 if(active&&['bugs','anr'].includes(active.kind)&&/^(?:а\s|сколько|посмотри|проверь|обнови|за\s|по\s|предыдущ)/iu.test(text))return active.kind;
 return 'chat';
}
function selectChoice(text,options){
 const value=text.toLocaleLowerCase().replace(/[.,!?]/g,'').trim();
 const ordinal={первый:0,первая:0,первое:0,второй:1,вторая:1,второе:1,третий:2,третья:2,третье:2};
 const index=/^\d+$/.test(value)?Number(value)-1:ordinal[value];
 if(Number.isInteger(index))return options[index]?[options[index]]:[];
 return options.filter(o=>[o.id,o.label,o.label.split(' · ')[0].replace(/\s*\([^)]*\)$/,'')].some(n=>{n=String(n).toLowerCase();return value===n||(n.length>=3&&value.includes(n));}));
}
class Dialogue {
 constructor({state={topics:[],activeId:''},save=()=>{},answer,readers,routeTopic,context=()=>'',days=()=>30,now=Date.now}){Object.assign(this,{state,save,answer,readers,routeTopic,context,days,now});this.busy=false;this.prune();}
 prune(){const oldCount=(this.state.topics||[]).length;const cutoff=this.now()-Number(this.days())*86400000;const expiredRoute=this.state.lastRouting?.at<cutoff;if(expiredRoute)delete this.state.lastRouting;this.state.topics=(this.state.topics||[]).filter(t=>t.at>=cutoff).slice(-50);if(!this.active())this.state.activeId='';if(oldCount!==this.state.topics.length||expiredRoute)this.persist();}
 active(){return this.state.topics.find(t=>t.id===this.state.activeId);}
 persist(){this.save(this.state);}
 list(){this.prune();return {activeId:this.state.activeId,topics:this.state.topics.map(({id,title,kind,at})=>({id,title,kind,at}))};}
 select(id){this.prune();if(id&&!this.state.topics.some(t=>t.id===id))throw new Error('Тема больше недоступна.');this.state.activeId=id;this.persist();return this.active()||null;}
 rememberAction(command,message,project=''){
  this.prune();let t=this.active();if(!t){t={id:randomUUID(),title:'Задачи'+(project?' · '+project:''),kind:'work',messages:[],at:this.now()};this.state.topics.push(t);this.state.activeId=t.id;}
  if(project)t.jiraProject=project;t.at=this.now();t.messages.push({role:'user',text:command,at:t.at},{role:'assistant',text:message,at:t.at});t.messages=t.messages.slice(-40);this.persist();
 }
 clear(){this.state={topics:[],activeId:''};this.persist();}
 actionContext(){const t=this.active();if(!t)return null;return {id:'dialogue-'+t.id,title:t.title,source:'Диалог',at:t.at,text:t.messages.map(m=>(m.role==='user'?'Пользователь: ':'Петя: ')+m.text).join('\n').slice(-30000)};}
 async turn(text,choice,forcedKind){
  if(this.busy)throw new Error('Дождитесь ответа Пети.');this.busy=true;
  try{
   this.prune();let active=this.active();
   if(choice){if(!active?.pending||!active.pending.options.some(o=>o.id===choice))throw new Error('Уточнение устарело.');active[active.pending.field]=choice;text=active.pending.field==='versionId'?active.pending.command.replace(/последн[а-я]*|свеж[а-я]*|текущ[а-я]*|предыдущ[а-я]*/giu,''):active.pending.command;forcedKind=active.pending.kind;delete active.pending;}
   else if(active?.pending){const matches=selectChoice(text,active.pending.options);if(matches.length===1){active[active.pending.field]=matches[0].id;text=active.pending.field==='versionId'?active.pending.command.replace(/последн[а-я]*|свеж[а-я]*|текущ[а-я]*|предыдущ[а-я]*/giu,''):active.pending.command;forcedKind=active.pending.kind;delete active.pending;}else if(/^(?:отмена|отложи|другая тема)/iu.test(text)){delete active.pending;} }
   if(!forcedKind&&actionRequest(text)){return {handled:false};}
   let kind=forcedKind||intent(text,active);
   const back=/^(?:верн[её]мся|вернись|продолжим|вернуться)/iu.test(text);
   if(back){const terms=core.words(text).filter(w=>!['вернемся','вернёмся','вернись','продолжим','вернуться','теме','тема','давай'].includes(w));const matches=this.state.topics.filter(t=>text.toLowerCase().includes(t.title.toLowerCase())||(kind!=='chat'&&t.kind===kind)||(terms.length&&terms.some(w=>core.words(t.title).some(v=>w.length>=4&&v.startsWith(w.slice(0,Math.min(w.length,5)))))));if(matches.length===1){this.state.activeId=matches[0].id;active=matches[0];kind=active.kind;}else return {handled:true,text:'К какой теме вернуться?',topicChoices:this.list().topics};}
   let newTopic=/^(?:новая тема|другая тема|теперь поговорим)/iu.test(text);
   let suggestedTitle='',unclear=false;
   if(kind==='chat'&&!forcedKind&&!back&&!newTopic&&this.routeTopic){
    try{const route=await this.routeTopic(text,this.state.topics,active?.id);unclear=!!route?.unclear;if(['bugs','anr'].includes(route?.kind))kind=route.kind;if(route?.newTopic){newTopic=true;suggestedTitle=String(route.title||text).slice(0,80);}else if(route?.topicId){const found=this.state.topics.find(t=>t.id===route.topicId);if(found){active=found;this.state.activeId=found.id;}}}catch{unclear=true;}
   }
   if(newTopic||!active||(kind!=='chat'&&active.kind!==kind)){
    const hint=!newTopic&&active?(active.title+' '+active.messages.slice(-2).map(m=>m.text).join(' ')):'';const previousProject=!newTopic?active?.jiraProject:undefined;
    const same=!newTopic&&this.state.topics.filter(t=>t.kind===kind);
    active=same?.length===1?same[0]:{id:randomUUID(),title:kind==='bugs'?'Баги в Jira':kind==='anr'?'ANR в Google Play':(suggestedTitle||text.slice(0,80)),kind,messages:[],at:this.now(),contextHint:hint,...kind==='bugs'&&previousProject?{jiraProject:previousProject}:{}};
    if(!this.state.topics.includes(active))this.state.topics.push(active);this.state.activeId=active.id;
   }
   const before=structuredClone(active);
   active.at=this.now();active.messages.push({role:'user',text,at:this.now()});active.messages=active.messages.slice(-40);this.persist();
   let result;
   try{
    if(back){const last=active.messages.filter(m=>m.role==='assistant').at(-1);result={text:'Вернулись к теме «'+active.title+'». '+(last?'Последний сохранённый ответ от '+new Date(last.at).toLocaleString('ru-RU')+': '+last.text+' Для свежих данных скажите «обнови».':'Что обсудим?')};}
    else if(kind==='bugs'||kind==='anr'){
     result=await this.readers[kind](text,active,active.contextHint||this.context());
     if(result.question){active.pending={command:text,kind,field:result.field,options:result.options||[]};result.text=result.question;}
    }else {const answer=await this.answer(text,active,unclear);result=typeof answer==='string'?{text:answer}:answer;}
   }catch(error){result={text:'Не удалось проверить данные: '+error.message,error:true};}
   if(result.title && before.lastData && result.title!==before.title){
    const changed={...active,id:randomUUID(),messages:[{role:'user',text,at:this.now()}]};
    Object.assign(active,before);
    active=this.state.topics.find(t=>t.title===result.title&&t.kind===kind)||changed;
    if(active!==changed)active.messages.push({role:'user',text,at:this.now()});else this.state.topics.push(active);
    this.state.activeId=active.id;
   }
   if(result.title)active.title=result.title;
   if(result.data)active.lastData=result.data;
   active.messages.push({role:'assistant',text:result.text,sources:result.sources||[],at:this.now()});active.messages=active.messages.slice(-40);this.persist();
   return {handled:true,...result,topicId:active.id,topicTitle:active.title,messages:active.messages,topics:this.list()};
  }finally{this.busy=false;}
 }
}
module.exports={Dialogue,intent,actionRequest,selectChoice};
