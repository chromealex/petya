// «Подготовка к встрече»: for the next (or a named) meeting — who attends (team directory), what was discussed with
// these people last time (Petya's recorded meetings and their summaries, matched by attendees and title through the
// calendar history), open tasks and undecided questions from those summaries with their status in Jira / Asana
// (read-only), related Slack threads already in Petya's context (no new Slack calls) and three agenda points from
// the local model, each citing the facts it rests on. Needs «Календарь»: without it the answer is the offer to add
// it. The only write — adding the agenda to the event's description — happens from the card after confirmation.
// Optional reminder «Через 10 минут: …» in the notification center (off by default, persisted across restarts).
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const team=require('../../team.cjs');
const {CalendarClient,CalendarError}=require('../calendar/client.cjs');
const {accounts}=require('../calendar/accounts.cjs');
const people=require('../calendar/people.cjs');
const collect=require('./collect.cjs');
const trackers=require('./trackers.cjs');
const {randomUUID}=require('node:crypto');
const ID='meeting-prep',BY='Подготовка к встрече',MIN=60000,DAY=86400000,LEAD=10*MIN;

// --- Routing -------------------------------------------------------------------------------------------------
// Neighbours: the summary of a meeting that happened («сводка встречи», «что решили на встрече») is Petya's own
// meeting summary; the day's meetings and new events («что у меня сегодня», «поставь встречу») are «Календарь»;
// recording («запиши встречу») is the recorder. «Запомни повестку …» is a note, not a preparation.
const AVOID=/^(?:а\s+)?(?:запомни|напомни|что\s+такое|как\s+(?:подключить|настроить))|сводк|протокол|расшифров|транскрип|стенограм|запиши\s+встреч|(?:поставь|создай|запланируй|назначь|перенеси|отмени)\s+(?:\p{L}+\s+)?(?:встреч|созвон|синк)/iu;
const MEET='(?:встреч|созвон|синк|митинг|звонк|планёрк|планерк|дейли|стендап|ретро|1[:-]1|ван[- ]?он[- ]?ван)\\p{L}*';
const PREP=new RegExp('подготов\\p{L}*\\s+(?:меня\\s+|нас\\s+)?(?:к|ко)\\s+(?:[«"]|(?:\\p{L}+\\s+){0,2}?'+MEET+')|подготовк\\p{L}*\\s+(?:к|ко)\\s+(?:\\p{L}+\\s+)?'+MEET,'iu');
// «На прошлой встрече» alone is the last meeting's summary (Petya's own); «в прошлый раз» or a person is this app.
const LAST='(?:в\\s+прошлый\\s+раз|в\\s+последний\\s+раз)';
const HISTORY=new RegExp('(?:что|о\\s+ч[её]м)\\s+(?:мы\\s+)?(?:обсуждали|обсудили|говорили|решили|договорились|договаривались)\\s+(?:(?:с|со)\\s+\\p{L}+(?:\\s+(?:и\\s+)?\\p{Lu}\\p{L}+)*\\s+(?:'+LAST+')?|'+LAST+')','iu');
const NEXT=new RegExp('(?:о\\s+ч[её]м|про\\s+что|что\\s+за)\\s+(?:будет\\s+)?(?:следующ|ближайш)\\p{L}*\\s+'+MEET+'|(?:следующ|ближайш)\\p{L}*\\s+'+MEET+'\\s+(?:о\\s+ч[её]м|про\\s+что)|что\\s+(?:будем\\s+)?(?:обсуждать|обсудим|обсуждаем)\\s+на\\s+(?:следующ|ближайш)\\p{L}*\\s+'+MEET,'iu');
// An agenda for a concrete meeting («повестка на синк», «повестку к завтрашней встрече»). A generic agenda on a topic
// («составь повестку встречи по релизу») is the «meeting-agenda» skill's: it writes from the user's own words.
const AGENDA=new RegExp('повестк\\p{L}*\\s+(?:на|к|для)\\s+(?:\\p{L}+\\s+)?(?:'+MEET+'|завтра|сегодня)|повестк\\p{L}*\\s+(?:следующ|ближайш)\\p{L}*\\s+'+MEET,'iu');
function intent(text){
 const t=String(text||'').trim();
 if(!t||t.length>400||AVOID.test(t))return null;
 // Changes listed inline («повестка: релиз, баги») are the user's own text, not a request to collect facts.
 if(/:\s*\S.{3,}[,;\n]/u.test(t)&&!/[«"]/u.test(t))return null;
 if(PREP.test(t))return 'prep';
 if(HISTORY.test(t)&&(/(?:^|\s)(?:с|со)\s+\p{L}/u.test(t)||new RegExp(LAST,'iu').test(t)))return 'history';
 if(NEXT.test(t))return 'next';
 if(AGENDA.test(t))return 'agenda';
 return null;
}

// --- Calendar ----------------------------------------------------------------------------------------------------
function clientFor(s,account,fetcher){
 const manager=s.mailAccounts?.[account.provider];
 if(!manager)throw Error('Почтовые аккаунты ещё загружаются. Повторите через минуту.');
 return new CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
}
// The calendar «Календарь» uses: the chosen one, the only one with access, or a question.
function pick(s,resume){
 const ready=accounts(s.settings).filter(a=>a.calendar);
 const chosen=ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
 if(chosen)return resume(chosen);
 const label=a=>(a.email||a.label||'аккаунт')+' · '+(a.provider==='microsoft'?'Outlook':'Google');
 return ask({text:'В каком календаре смотреть встречи?',label:'Календарь',options:ready.map(label),strictChoices:true},answer=>{
  const a=ready.find(x=>label(x).toLocaleLowerCase()===String(answer).toLocaleLowerCase());
  return a?resume(a):{handled:true,text:'Такого календаря нет. Повторите запрос.',error:true};
 });
}
const hm=iso=>new Date(iso).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
const dayLabel=(iso,now)=>{const d=new Date(iso),a=new Date(now);a.setHours(0,0,0,0);const diff=Math.round((new Date(d).setHours(0,0,0,0)-a)/DAY);return diff===0?'сегодня':diff===1?'завтра':d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});};

// --- The preparation -----------------------------------------------------------------------------------------------
async function agendaFor(s,facts){
 if(!facts.length)return {points:[],model:false};
 if(s.settings.model){
  s.requestProgress?.report?.('Предлагаю повестку');
  try{
   const r=await kit.modelJSON(s,{system:collect.AGENDA_SYSTEM,user:{facts:facts.map(({id,kind,text,status})=>({id,kind,text,...status?{status}:{}}))},schema:collect.AGENDA_SCHEMA,predict:600,temperature:0.2});
   const points=collect.validAgenda(r?.points,facts);
   if(points.length)return {points,model:true};
  }catch(e){if(/Модель изменилась/.test(e.message))throw e;}
 }
 return {points:collect.fallbackAgenda(facts),model:false};
}
// Who is meant by «с Олегом»: team members with an email, or a clarification.
function personOf(s,text,fixed,resume){
 const {names}=people.mentioned(text);
 if(!names.length)return [];
 let members=[];try{members=team.members(s.settings);}catch{members=[];}
 const out=[];
 for(const name of names){
  if(Object.hasOwn(fixed,name)){if(fixed[name])out.push(fixed[name]);continue;}
  const found=people.candidates(name,members).filter(m=>m.email);
  if(found.length>1){
   const label=m=>m.name+(m.role?' · '+m.role:'');
   return ask({text:'«'+name+'» — кого именно?',label:'Участник',options:found.slice(0,6).map(label),strictChoices:true},answer=>{
    const m=found.find(x=>label(x).toLocaleLowerCase()===String(answer).toLocaleLowerCase());
    return resume({...fixed,[name]:m?{name:m.name,email:m.email.toLowerCase()}:null});
   });
  }
  out.push(found[0]?{name:found[0].name,email:found[0].email.toLowerCase()}:{name,email:''});
 }
 return out;
}

async function prepare(s,text,account,{fetcher,now,fixed={},eventId=''}){
 const resume=(next,id)=>guard(s,text,()=>prepare(s,text,account,{fetcher,now,fixed:next||fixed,eventId:id||eventId}));
 const kind=intent(text)||'prep';
 const person=personOf(s,text,fixed,next=>resume(next));
 const missing=person.filter(p=>!p.email);
 if(missing.length)return kit.reply(s,text,{by:BY,question:true,text:'«'+missing.map(p=>p.name).join('», «')+'» нет в «Команде» с email — не по чему искать встречи. Добавьте человека в «Команду» или назовите встречу.'});
 const emails=person.map(p=>p.email);
 const self=account.email.toLowerCase();
 const client=clientFor(s,account,fetcher);
 s.requestProgress?.report?.('Читаю календарь');
 const upcoming=await client.events(new Date(+now-15*MIN),new Date(+now+7*DAY));
 const q=collect.query(text);
 let target=eventId?upcoming.find(e=>e.id===eventId)||null:collect.pickTarget(upcoming,{query:q,emails,now});
 if(!target&&q){
  const list=upcoming.filter(e=>!e.allDay&&!e.declined&&Date.parse(e.end)>+now).slice(0,5);
  if(!list.length)return kit.reply(s,text,{by:BY,text:'В ближайшие 7 дней встреч в календаре нет.'});
  const label=e=>e.title+' · '+dayLabel(e.start,now)+' '+hm(e.start);
  return ask({text:'Не нашёл встречу «'+q+'» в ближайшие 7 дней. Какую подготовить?',label:'Встреча',options:list.map(label),strictChoices:true},answer=>{
   const e=list.find(x=>label(x).toLocaleLowerCase()===String(answer).toLocaleLowerCase());
   return e?resume(null,e.id):{handled:true,text:'Такой встречи нет. Повторите запрос.',error:true};
  });
 }
 if(!target&&!emails.length)return kit.reply(s,text,{by:BY,text:'В ближайшие 7 дней встреч в календаре нет — готовить не к чему.'});
 let members=[];try{members=team.members(s.settings);}catch{members=[];}
 const attendeeEmails=target?collect.attendeesOf(target):[self,...emails];
 const attendees=collect.attendees(attendeeEmails.length?attendeeEmails:[self],members,self);
 s.requestProgress?.report?.('Ищу прошлые встречи');
 const past=await client.events(new Date(+now-30*DAY),now);
 const pastEvents=collect.similarEvents(past.filter(e=>!target||e.id!==target.id),{title:target?.title||'',emails:emails.length?emails:attendeeEmails},self,now);
 const memory=(()=>{try{return s.memory?.prune?.()||[];}catch{return [];}})();
 const names=person.length?person.map(p=>p.name):attendees.filter(a=>a.known&&!a.self).map(a=>a.name);
 const history=collect.history({memory,pastEvents,title:target?.title||'',names:person.length?names:[],members,now});
 const tasks=collect.openTasks(history);
 let tracker={systems:[],error:''};
 if(tasks.length){s.requestProgress?.report?.('Проверяю задачи в трекере');tracker=await trackers.status(s,tasks);}
 const slackIds=attendees.map(a=>members.find(m=>String(m.email||'').toLowerCase()===a.email)).filter(Boolean).map(m=>m.slackId||m.accounts?.slack?.id).filter(Boolean);
 const slack=collect.slackThreads(memory,{title:target?.title||'',tasks,slackIds,now:+now});
 const facts=collect.facts({history,tasks,slack});
 const agenda=await agendaFor(s,facts);
 const event=target?{id:target.id,title:target.title,start:target.start,end:target.end,link:target.link||'',url:target.url||'',location:target.location||'',
  organizer:target.meta?.organizer===self,description:!!target.meta?.description}:null;
 const card={prepId:randomUUID(),mode:kind,account:account.key,provider:account.provider,now:now.toISOString(),event,person:person.map(p=>p.name),attendees,history,tasks,slack,
  facts:facts.map(({id,kind:k,text:t,source})=>({id,kind:k,text:t,source})),agenda:agenda.points,agendaModel:agenda.model,trackers:tracker.systems,trackerError:tracker.error,
  remind:s.settings.meetingPrepRemind==='true'};
 return kit.reply(s,text,{by:BY,text:summaryText(card,now),data:{meetingPrep:card}});
}
// The chat text: the meeting, last time, open tasks and the agenda in a few lines.
function summaryText(c,now){
 const lines=[];
 if(c.event)lines.push(c.event.title+' — '+dayLabel(c.event.start,now)+' в '+hm(c.event.start)+', '+c.attendees.length+' '+kit.plural(c.attendees.length,['участник','участника','участников'])+'.');
 else lines.push('Ближайших встреч, где есть '+c.person.join(', ')+', в календаре нет — вот что было раньше.');
 const last=c.history[0];
 if(last)lines.push('В прошлый раз ('+new Date(last.at).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+'): '+(last.decisions.length?'решили — '+last.decisions.slice(0,2).join('; ')+'.':last.recorded?'запись есть, сводки нет.':'встреча была, записи Пети нет.'));
 else lines.push('Прошлых встреч с этими людьми или под этим названием за 30 дней не нашёл.');
 if(c.tasks.length){const done=c.tasks.filter(t=>t.tracker?.category==='done').length;lines.push('Открытых задач с прошлых встреч: '+c.tasks.length+(c.trackers.length?' (в трекере готово: '+done+')':'')+'.');}
 if(c.agenda.length)lines.push('Предлагаю обсудить:\n'+c.agenda.map((p,i)=>(i+1)+'. '+p.text).join('\n'));
 return lines.join('\n');
}
async function guard(s,text,work){try{return await work();}catch(e){if(e.name==='InputRequired'||e.name==='AbortError')throw e;if(e instanceof CalendarError)return kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message});return kit.failure(s,text,BY,e);}}

async function turn(s,command,{fetcher=globalThis.fetch,now=new Date()}={}){
 const text=String(command||'');
 if(!intent(text)||!kit.installed(s,ID))return null;
 // «Календарь» is required: the same offer card as when the talk enters its subject.
 if(s.settings.extension_calendar!=='true'){
  const offer=s.extensionOffers?.prerequisite?.('calendar',text);
  return kit.reply(s,text,{by:BY,question:true,text:'Для подготовки к встрече нужно расширение «Календарь»: из него я беру встречу, участников и прошлые встречи с ними. Подключить?',...offer?{data:{extensionOffer:offer}}:{}});
 }
 const list=accounts(s.settings);
 if(!list.some(a=>a.calendar))return kit.reply(s,text,{by:BY,question:true,text:'Нужен доступ к календарю: откройте «Настройки → Календарь» и подключите Google или Microsoft с доступом к календарю, потом повторите запрос.'});
 return guard(s,text,()=>pick(s,account=>guard(s,text,()=>prepare(s,text,account,{fetcher,now}))));
}

// --- Reminders: «Через 10 минут: Синк по релизу — открыть подготовку» ---------------------------------------------------
// The state lives in settings (survives restarts): upcoming meetings of the next hour and the reminders already
// shown, so a meeting is announced once even if Petya restarts in between, and a reminder due while the calendar
// cannot be read still comes from the saved list.
function parseState(v){try{const x=JSON.parse(v||'{}');return {next:Array.isArray(x?.next)?x.next.filter(e=>e&&typeof e.key==='string'):[],shown:x?.shown&&typeof x.shown==='object'&&!Array.isArray(x.shown)?x.shown:{},fetched:Number(x?.fetched)||0};}catch{return {next:[],shown:{},fetched:0};}}
function reminders(s,{now=()=>Date.now(),fetcher=globalThis.fetch,publish=()=>{},refresh=5*MIN}={}){
 const state=()=>parseState(s.settings.meetingPrepReminders);
 const save=v=>s.saveSettings?.({meetingPrepReminders:JSON.stringify(v)},true);
 const enabled=()=>s.settings.meetingPrepRemind==='true'&&kit.installed(s,ID)&&s.settings.extension_calendar==='true';
 const note=item=>({id:'meeting-prep:'+item.key,title:'Подготовка к встрече',text:item.text,kind:'attention',version:item.key,prep:item.title});
 let busy=false;
 async function tick(){
  if(busy||!enabled())return;busy=true;
  try{
   const t=now(),v=state();let changed=false;
   if(t-v.fetched>=refresh){
    const account=accounts(s.settings).filter(a=>a.calendar).find(a=>a.key===s.settings.calendarAccount)||accounts(s.settings).find(a=>a.calendar);
    if(account){
     try{
      const events=await clientFor(s,account,fetcher).events(new Date(t),new Date(t+60*MIN));
      v.next=events.filter(e=>!e.allDay&&!e.declined&&Date.parse(e.start)>t).slice(0,10).map(e=>({key:e.id+'@'+e.start,title:e.title,start:e.start}));
      v.fetched=t;changed=true;
     }catch{/* the saved list still serves the reminder */}
    }
   }
   for(const e of v.next){
    const lead=Date.parse(e.start)-t;
    if(lead>LEAD||lead<=-MIN||v.shown[e.key])continue;
    const minutes=Math.max(1,Math.round(lead/MIN));
    const item={key:e.key,title:e.title,start:e.start,text:'Через '+minutes+' '+kit.plural(minutes,['минуту','минуты','минут'])+': '+e.title+' — открыть подготовку',at:t};
    v.shown[e.key]=item;changed=true;publish(note(item));
   }
   for(const [k,x] of Object.entries(v.shown))if(t-(Number(x?.at)||0)>2*DAY){delete v.shown[k];changed=true;}
   v.next=v.next.filter(e=>Date.parse(e.start)>t-MIN);
   if(changed)save(v);
  }finally{busy=false;}
 }
 // Reminders still relevant (until 10 minutes after the start), for the notification center after a reload.
 const active=()=>{const t=now();return Object.values(state().shown).filter(x=>x&&Date.parse(x.start)+10*MIN>t).map(note);};
 return {tick,active};
}

// --- Setup: agenda into the event's description (confirmed in the card), reminders -----------------------------
function setup(s,{fetcher=globalThis.fetch,now=()=>Date.now()}={}){
 const publish=item=>{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);};
 const remind=reminders(s,{now,fetcher,publish});
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>remind.tick().catch(()=>{}),30000);timer.unref?.();}
 const writing=new Set();
 function locate(prepId){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.meetingPrep;if(card?.prepId===prepId)return card;}
  return null;
 }
 const agendaText=card=>'Повестка (подготовил Петя):\n'+card.agenda.map((p,i)=>(i+1)+'. '+p.text).join('\n');
 // The exact text the description will get, for the confirmation step in the card.
 function preview(prepId){const card=locate(String(prepId||''));if(!card)throw Error('Подготовка устарела или удалена. Повторите запрос в чате.');return {text:agendaText(card),title:card.event?.title||''};}
 async function addAgenda(prepId){
  const card=locate(String(prepId||''));if(!card)throw Error('Подготовка устарела или удалена. Повторите запрос в чате.');
  if(card.agendaAdded)return {added:card.agendaAdded,already:true};
  if(card.agendaUnknown)throw Error('Не знаю, сохранилась ли повестка в прошлый раз (календарь не ответил). Проверьте описание встречи, прежде чем добавлять снова.');
  if(!card.event?.id)throw Error('У подготовки нет встречи в календаре.');
  if(!card.event.organizer)throw Error('Описание может менять только организатор встречи. Отправьте повестку участникам сообщением.');
  if(!card.agenda.length)throw Error('Повестки нет.');
  if(writing.has(prepId))throw Error('Уже добавляю повестку.');
  const account=accounts(s.settings).find(a=>a.key===card.account);
  if(!account?.calendar)throw Error('Нет доступа к календарю. Разрешите его в настройках «Календаря».');
  writing.add(prepId);
  try{
   const r=await clientFor(s,account,fetcher).appendDescription(card.event.id,agendaText(card));
   card.agendaAdded={at:new Date(now()).toISOString(),url:r.url,already:!!r.already};s.dialogue.persist();
   return {added:card.agendaAdded};
  }catch(e){if(e.unknown){card.agendaUnknown=true;s.dialogue.persist();}throw e;}
  finally{writing.delete(prepId);}
 }
 const status=()=>({remind:s.settings.meetingPrepRemind==='true',calendar:s.settings.extension_calendar==='true',connected:accounts(s.settings).some(a=>a.calendar),trackers:trackers.connected(s)});
 return {ipc:{preview,addAgenda,reminders:()=>remind.active(),status,tick:()=>remind.tick()}};
}
function validate(next){
 if(next.meetingPrepRemind!==undefined&&!['true','false'].includes(String(next.meetingPrepRemind)))throw Error('Проверьте настройку напоминаний о встречах.');
}
module.exports={name:'meetingPrep',defaults:{['extension_'+ID]:'false',meetingPrepRemind:'false',meetingPrepReminders:'{}'},validate,setup,turn,intent,reminders,summaryText};
