// «Напоминания»: reminders by time («напомни в 16:00 позвонить», «через 2 часа», «каждый понедельник в 10») and by
// event («когда закроют BW-123», «когда Олег появится в сети», «когда начнётся встреча с Машей», «когда соберётся
// билд»). Time is read by code (when.cjs), events by reminder triggers (triggers.cjs) that other apps may provide.
// Reminders belong to the current company, survive restarts and fire as a notification plus a message in the chat
// where they were made. Nothing is written to any service: triggers only read.
// Without this app «напомни …» keeps going to Petya's other handlers (recurring commands, the dialogue).
const path=require('node:path');
const kit=require('../app-kit.cjs');
const when=require('./when.cjs');
const service=require('./service.cjs');
const registry=require('./triggers.cjs');
const {ask}=require('../../input-required.cjs');
const ID='reminders',BY='Напоминания';

// --- Routing ----------------------------------------------------------------------------------------------------
const LEAD=/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:напомни(?:те)?|напоминай(?:те)?|не\s+забудь\s+напомнить|(?:поставь|создай|сделай|заведи|добавь|установи)\s+(?:мне\s+)?напоминани[ея])(?:\s+(?:мне|нам))?(?:\s+пожалуйста)?[,:\s]*/iu;
const LIST=/^(?:петя[,!\s]+)?(?:напоминани\p{L}*(?=\s+на\s)|(?:покажи|открой|выведи)\s+(?:мне\s+)?(?:все\s+|мои\s+)?напоминани\p{L}*|(?:какие|что)\s+(?:у\s+меня\s+)?(?:есть\s+)?напоминани\p{L}*|(?:мои|все)\s+напоминани\p{L}*|список\s+напоминаний)(?:\s+(?:на\s+)?(?:сегодня|завтра))?[?.!\s]*$/iu;
const REMOVE=/^(?:петя[,!\s]+)?(?:удали|отмени|убери|сотри|выключи)\s+напоминани\p{L}*(?:\s+(?:про|о|об|насч[её]т|чтобы)?\s*(.+?))?[.!\s]*$/iu;
const STOP=/^(?:петя[,!\s]+)?не\s+напоминай(?:\s+(?:мне|больше))*(?:\s+(?:про|о|об|насч[её]т))?\s+(.+?)[.!\s]*$/iu;
const MOVE=/^(?:петя[,!\s]+)?(?:перенеси|передвинь|сдвинь|измени\s+время)\s+напоминани\p{L}*(?:\s+(?:про|о|об|насч[её]т)\s+(.+?))?\s+на\s+(.+?)[.!\s]*$/iu;
const SNOOZE=/^(?:петя[,!\s]+)?отложи\s+(?:напоминани\p{L}*\s+)?(?:(?:про|о|об|насч[её]т)\s+(.+?)\s+)?на\s+(.+?)[.!\s]*$/iu;
// «напомни Ивану про отчёт» is a message to a colleague (polite-reminder skill), not a reminder for the user.
const OTHERS=/^(?:команде|всем|коллегам|ребятам|ему|ей|им|ему,|ей,)(?=$|[\s,])/iu;
// «напомни, что мы обсуждали», «напомни, как зовут…» ask Petya to recall, not to remind later.
const RECALL=/^(?:о\s+ч[её]м|как|где|кто|кого|какой|какая|какие|какое|каким|сколько|зачем|почему|чем|куда|откуда|что\s+(?:такое|значит|означает|было|там|у\s+нас|мы|я|он|она|они|вы|ты|важно\p{L}*|обсужда\p{L}*|говорил\p{L}*))(?=$|[\s,?])/iu;
const NOT_PAST=new Set(['числа','дела','села','стола','пола','зла','мыла','сила','шла']);
const past=text=>String(text).toLocaleLowerCase('ru').replace(/ё/g,'е').split(/[^\p{L}]+/u).some(w=>w.length>=4&&!NOT_PAST.has(w)&&/(?:ал|ял|ел|ил|ыл|ул|ла|ли|ло)$/u.test(w));
const LOCATION=/когда\s+(?:я\s+)?(?:приду|приеду|доберусь|вернусь|буду|окажусь|выйду|уйду|подъеду|дойду|зайду)\s+(?:домой|на\s+работу|в\s+офис|из\s+офиса|с\s+работы|дома|на\s+работе|в\s+офисе|в\s+магазин\p{L}*|на\s+вокзал|в\s+аэропорт|к\s+\p{L}+)/iu;
const capital=t=>t?t[0].toLocaleUpperCase('ru')+t.slice(1):t;

// What to remind about: the rest of the request without the lead, time words and joining words.
function subject(rest){
 return capital(String(rest||'').replace(/^[\s,:;—-]+|[\s,.!;:—-]+$/gu,'').replace(/^(?:что\s+(?:нужно|надо|необходимо|пора)\s+|чтобы\s+(?:я\s+)?|что\s+|о\s+том,?\s+что\s+|про\s+|насч[её]т\s+|о\s+|об\s+)/iu,'').replace(/\s{2,}/g,' ').trim()).slice(0,300);
}
// Classifies a request: {type:'list'|'remove'|'move'|'snooze'|'create', ...} | null.
function route(command){
 const text=String(command||'').trim();
 if(LIST.test(text))return {type:'list'};
 let m=MOVE.exec(text);if(m)return {type:'move',words:m[1]||'',time:m[2]};
 m=SNOOZE.exec(text);if(m)return {type:'snooze',words:m[1]||'',time:m[2]};
 m=REMOVE.exec(text);if(m)return {type:'remove',words:m[1]||''};
 m=STOP.exec(text);if(m)return {type:'remove',words:m[1]||''};
 const lead=LEAD.exec(text);if(!lead)return null;
 const rest=text.slice(lead[0].length).trim();
 if(!/(?:^|\s)(?:мне|нам)(?=$|[\s,])/iu.test(lead[0])&&(OTHERS.test(rest)||/^\p{Lu}\p{Ll}+(?:[уеюи]|ой|ею)(?=$|[\s,])/u.test(rest)&&!/^(?:В|Во|Через|Завтра|Сегодня|Послезавтра|Каждый|Каждую|Каждое|По|Когда|Про|О|Об|Что|Чтобы)(?=$|[\s,])/u.test(rest)))return null;
 if(RECALL.test(rest))return null;
 if(/^что\s/iu.test(rest)&&past(rest))return null;
 return {type:'create',rest,original:text};
}

// --- Chat replies ---------------------------------------------------------------------------------------------------
const registries=new WeakMap();
function triggersFor(s){if(s.reminders?.triggers)return s.reminders.triggers;if(!registries.has(s))registries.set(s,registry.create(s));return registries.get(s);}
function svc(s){if(!s.reminders?.service)throw Error('Напоминания ещё загружаются. Повторите через минуту.');return s.reminders.service;}
const now=s=>s.reminders?.now?.()||Date.now();
const cardOf=(s,mode,extra={})=>({reminderCard:{mode,now:now(s),items:svc(s).list(),...extra}});
const topicIds=s=>{const t=s.dialogue.active?.();return {topicId:t?.id||'',projectId:t?.projectId||s.dialogue.state?.activeProjectId||'general'};};
const OPTIONS=['Через час','Вечером в 19:00','Завтра в 10:00'];

function created(s,command,item,{note='',defaulted=false}={}){
 const time=item.kind==='time';
 const what=time||item.text!==capital(item.words)?': «'+item.text+'»':'';
 const text=(time?'Напомню '+item.words+(item.repeat?'':' ('+item.absolute+')'):'Напомню, когда '+item.words)+what+'.'+(defaulted?' Время вы не назвали — поставил 10:00, поменять можно кнопкой «Изменить».':'')+(note?' '+note:'');
 return kit.reply(s,command,{by:BY,text,data:cardOf(s,'created',{created:item.id})});
}
// A time phrase after «на»: «на 10 минут», «на 17:00», «на завтра», «на вечер», «на час».
function timeOf(phrase,at){
 const p=String(phrase||'').trim();
 let t=when.parse(p,at);if(t&&!t.needTime&&!t.error)return t;
 if(/^\d{1,2}(?:[:.]\d{2})?$/.test(p))return when.parse('в '+p,at);
 return when.parse('через '+p,at)||t;
}
// Asks when to remind and creates the reminder from the answer (the shared question panel keeps the request).
function askTime(s,command,what,{text,date=null}={}){
 return ask({text:text||'Когда напомнить: «'+what+'»?',label:'Когда напомнить',options:OPTIONS,placeholder:'например, в 17:30 или завтра утром'},answer=>{
  const t=when.answer(answer,now(s),date);
  if(!t||t.needTime)return askTime(s,command,what,{text:'Не понял время. Назовите его, например «в 17:30», «через 2 часа» или «завтра в 9».',date});
  if(t.error)return askTime(s,command,what,{text:t.error+' Когда напомнить?',date});
  return created(s,command,svc(s).add({text:what,original:command,...topicIds(s),time:t}),{defaulted:t.defaulted});
 });
}
function askWhat(s,command,time){
 return ask({text:'О чём напомнить '+time.words+'?',label:'О чём напомнить',placeholder:'например, позвонить в банк'},answer=>{
  const what=subject(answer);if(!what)return askWhat(s,command,time);
  return created(s,command,svc(s).add({text:what,original:command,...topicIds(s),time}),{defaulted:time.defaulted});
 });
}
async function createTurn(s,command,{rest,original}){
 // Location is not known to Petya: say so and offer a time instead.
 if(LOCATION.test(rest)){
  const what=subject(rest.replace(LOCATION,''))||'то, о чём просили';
  return askTime(s,command,what,{text:'Напомнить по месту — «когда приду домой или на работу» — не могу: Петя не знает, где вы находитесь. Могу напомнить в определённое время. Когда?'});
 }
 const triggers=triggersFor(s),event=triggers.match(rest);
 if(event)return eventTurn(s,command,rest,event,original);
 const t=when.parse(rest,now(s));
 if(!t){
  // No time and no event: «напомни купить хлеб» asks when; «напомни, когда у нас релиз» is a question to Petya.
  if(/(?:^|[\s,])когда(?=$|[\s,])/iu.test(rest))return null;
  const what=subject(rest);if(!what)return null;
  return askTime(s,command,what);
 }
 const what=subject(t.rest);
 if(t.needTime)return askTime(s,command,what||'напоминание',{text:'Во сколько напомнить'+(what?': «'+what+'»':'')+'?',date:t.date});
 if(t.error)return t.past?askTime(s,command,what||'напоминание',{text:t.error+' Когда напомнить?'}):kit.reply(s,command,{by:BY,question:true,text:t.error});
 if(!what)return askWhat(s,command,t);
 return created(s,command,svc(s).add({text:what,original,...topicIds(s),time:t}),{defaulted:t.defaulted});
}
async function eventTurn(s,command,rest,event,original){
 const what=subject(rest.replace(/[,\s]*(?<!\p{L})когда(?!\p{L}).*$/u,''))||'';
 if(!event.ready){
  return askTime(s,command,what||rest.replace(/^[,\s]*/,''),{text:'Чтобы напомнить, когда это случится, нужно подключить «'+event.name+'». '+event.connect+' Пока могу напомнить в определённое время — когда?'});
 }
 s.requestProgress?.report?.('Проверяю: '+event.name);
 const x=triggersFor(s).get(event.id);
 let prepared;
 try{prepared=await x.trigger.prepare(s,event.params,{now:now(s)});}
 catch(e){
  if(e.name==='InputRequired')throw e;
  if(e.name==='TriggerError'&&e.code==='unsupported')return askTime(s,command,what||rest,{text:e.message+' Пока могу напомнить в определённое время — когда?'});
  if(e.name==='TriggerError'&&e.code==='already')return kit.reply(s,command,{by:BY,text:e.message+' Напоминание не нужно.',sources:e.url?[{title:event.name,url:e.url}]:[]});
  if(e.name==='TriggerError')return kit.reply(s,command,{by:BY,question:true,text:e.message});
  return kit.failure(s,command,BY,e);
 }
 const label=prepared.label;
 const item=svc(s).add({text:what||capital(label),original,...topicIds(s),trigger:{id:event.id,name:event.name,icon:event.icon,params:prepared.params,label,url:prepared.url||'',fireAt:prepared.fireAt||null}});
 return created(s,command,item,{note:prepared.note||''});
}
function pickOne(s,command,words,verb,act){
 const found=svc(s).search(words);
 if(!found.length)return kit.reply(s,command,{by:BY,text:words?'Не нашёл напоминания «'+words+'».':'Напоминаний нет.',data:cardOf(s,'list')});
 if(found.length===1)return act(found[0]);
 const label=i=>i.text+' · '+service.view(i,now(s)).words;
 return ask({text:'Какое напоминание '+verb+'?',label:'Напоминание',options:found.slice(0,6).map(label),strictChoices:true},answer=>{
  const item=found.find(i=>label(i)===answer);if(!item)return kit.reply(s,command,{by:BY,text:'Такого напоминания нет. Повторите запрос.',error:true});
  return act(item);
 });
}
async function turn(s,command){
 const r=route(command);
 if(!r||!kit.installed(s,ID))return null;
 if(s.attachments?.list?.().length)return null;
 if(r.type==='list'){
  const items=svc(s).list();
  const today=items.filter(i=>i.group==='today').length,event=items.filter(i=>i.group==='event').length,fired=items.filter(i=>i.group==='fired').length;
  const text=items.length?'Напоминаний: '+items.length+(today?', на сегодня — '+today:'')+(event?', по событию — '+event:'')+(fired?', сработали и ждут отметки — '+fired:'')+'.':'Напоминаний нет. Скажите, например: «напомни в 16:00 позвонить».';
  return kit.reply(s,command,{by:BY,text,data:cardOf(s,'list')});
 }
 if(r.type==='remove')return pickOne(s,command,r.words,'удалить',item=>{const v=svc(s).remove(item.id);return kit.reply(s,command,{by:BY,text:'Удалил напоминание «'+v.text+'». Вернуть можно кнопкой в карточке.',data:cardOf(s,'deleted',{deleted:v})});});
 if(r.type==='move'||r.type==='snooze'){
  const t=timeOf(r.time,now(s));
  if(!t||t.error||t.needTime)return kit.reply(s,command,{by:BY,question:true,text:(t?.error||'Не понял время.')+' Скажите, например: «отложи на 10 минут» или «перенеси напоминание на 17:00».'});
  const words=r.words;
  const target=()=>{if(words||r.type==='move')return null;const fired=svc(s).items().filter(i=>i.status==='fired').sort((a,b)=>b.firedAt-a.firedAt);return fired[0]||null;};
  const act=item=>{
   const v=r.type==='snooze'||item.status==='fired'||item.kind==='event'?svc(s).snooze(item.id,{until:t.at}):svc(s).edit(item.id,{at:t.at});
   return kit.reply(s,command,{by:BY,text:(r.type==='snooze'?'Отложил':'Перенёс')+' «'+v.text+'» на '+v.words+'.',data:cardOf(s,'created',{created:v.id})});
  };
  const one=target();if(one)return act(one);
  return pickOne(s,command,words,r.type==='snooze'?'отложить':'перенести',act);
 }
 return createTurn(s,command,r);
}

// --- Background: timer, chat message, notifications -----------------------------------------------------------------
function setup(s,{now:clock=()=>Date.now(),interval=15000}={}){
 const company=s.companyId,file=path.join(s.dataRoot||'.','extensions',ID,'reminders.json');
 const publish=item=>{try{if(company===s.companyId&&s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{/* window closing */}};
 // The fired reminder in the chat it was made in (or a «Напоминания» chat of the general project).
 function post(item,row){
  const d=s.dialogue;if(!d?.state)return;
  let topic=d.state.topics.find(t=>t.id===item.topicId&&!t.archived);
  if(!topic){
   topic=d.state.topics.find(t=>t.reminders&&!t.archived);
   if(!topic){topic={id:require('node:crypto').randomUUID(),projectId:d.state.projects.some(p=>p.id==='general')?'general':(d.state.projects[0]?.id||'general'),title:'Напоминания',kind:'chat',reminders:true,messages:[],at:clock()};d.state.topics.push(topic);}
   item.topicId=topic.id;item.projectId=topic.projectId;
  }
  const text='⏰ '+(row.missed?'Пропущенное напоминание':'Напоминание')+': '+item.text+(item.firedText?'\n'+item.firedText:'')+(item.repeat?'\nСледующий раз — '+when.describe(item,clock())+'.':'');
  topic.messages.push({role:'assistant',text,at:clock(),by:BY,extensionData:{reminderCard:{mode:'fired',now:clock(),items:[row],fired:row.id}},...(item.firedUrl?{sources:[{title:item.trigger?.name||BY,url:item.firedUrl}]}:{})});
  topic.at=clock();topic.unread=(topic.unread||0)+1;d.persist();
 }
 function system(item){
  const {Notification}=require('electron');if(!Notification?.isSupported?.())return;
  const n=new Notification({title:'Петя · напоминание',body:item.text+(item.firedText?' — '+item.firedText:'')});
  n.on?.('click',()=>{try{s.win?.show?.();s.win?.focus?.();}catch{}});n.show();
 }
 const triggers=registry.create(s);
 const reminders=service.create({s,file,now:clock,triggers,publish,post,system});
 let timer=null;
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){
  timer=setInterval(()=>{if(company!==s.companyId){clearInterval(timer);return;}reminders.tick().catch(e=>console.error('Reminders:',e.message));},interval);timer.unref?.();
  setTimeout(()=>{if(company===s.companyId)reminders.tick().catch(()=>{});},5000).unref?.();
  try{require('electron').powerMonitor?.on?.('resume',()=>{if(company===s.companyId)reminders.tick().catch(()=>{});});}catch{/* tests */}
 }
 const ipc={
  list:()=>reminders.list(),
  done:id=>reminders.done(String(id)),
  snooze:(id,options)=>reminders.snooze(String(id),options&&typeof options==='object'?options:{minutes:Number(options)||10}),
  edit:(id,patch)=>reminders.edit(String(id),patch&&typeof patch==='object'?patch:{}),
  remove:id=>reminders.remove(String(id)),
  restore:id=>reminders.restore(String(id)),
  checkNow:id=>reminders.checkNow(String(id)),
  notices:()=>reminders.notices(),
  now:()=>clock()
 };
 return {reminders:{service:reminders,now:clock,triggers},ipc};
}
module.exports={name:'reminders',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,route,subject};
