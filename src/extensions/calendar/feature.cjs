// «Календарь»: the day's meetings, free time and a slot for several people, from Google Calendar or Outlook
// (Microsoft Graph) through the mail accounts Petya already has. Calendar scopes are asked for separately
// (incremental consent from the extension's settings). Everything is read and computed by code: dates, free/busy,
// ranking; the model is not used. An event is created ONLY by the card's confirm button, never by a chat turn.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const team=require('../../team.cjs');
const when=require('./when.cjs');
const slots=require('./slots.cjs');
const people=require('./people.cjs');
const {CalendarClient,CalendarError,SCOPES}=require('./client.cjs');
const {accounts,connected}=require('./accounts.cjs');
const {Rooms,normalize}=require('./rooms.cjs');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const ID='calendar',BY='Календарь';

// --- Routing -------------------------------------------------------------------------------------------------
// Neighbours: meeting summaries («сводка встречи», «что решили»), meeting recording, Jira due dates, vacations
// and birthdays, cron schedules.
const AVOID=/сводк|итог\p{L}*\s+встреч|протокол|что\s+(?:решили|обсуждали|говорили|обсудили)|о\s+ч[её]м\s+(?:говорили|договорились)|договорил|расшифров|транскрип|стенограм|(?:^|[^\p{L}])(?:по|при|про)?слушай|подключись|присоединись|запиши\s+встреч|срок\p{L}*\s+(?:задач|тикет|issue)|дедлайн|due\s*date|просроч|отпуск|больничн|рождени|днюх|cron|крон/iu;
const DAYWORD='(?:сегодня|завтра|послезавтра|вчера|понедельник\\p{L}*|вторник\\p{L}*|сред[ауеы]|четверг\\p{L}*|пятниц[ауеы]|суббот[ауеы]|воскресень[еяю]|(?:эт\\p{L}*|следующ\\p{L}*)\\s+недел\\p{L}*|неделю|\\d{1,2}(?:\\.\\d{1,2}|\\s+[а-я]+))';
const CREATE=/(?:^|[^\p{L}])(?:поставь|создай|запланируй|назначь|забронируй|организуй|добавь|сделай|заведи)\s+(?:мне\s+|нам\s+)?(?:\p{L}+\s+)?(?:встреч|созвон|звонок|митинг|колл|событи)|добавь\s+в\s+календар/iu;
const FIND=/(?:^|[^\p{L}])(?:найди|подбери|поищи|найти|подобрать|предложи|выбери)\s+(?:мне\s+|нам\s+)?(?:\p{L}+\s+){0,2}?(?:час|время|слот\p{L}*|окн\p{L}*|полчаса|\d+\s*мин\p{L}*)(?=$|[^\p{L}])|когда\s+(?:мы|все|мы\s+все)\s+свобод/iu;
const FREE=/когда\s+я\s+свобод|когда\s+у\s+меня\s+(?:окно|окна|свободн)|(?:есть|будет)\s+(?:ли\s+)?(?:у\s+меня\s+)?(?:окно|окна|свободн\p{L}*\s+(?:время|час|окн))|свобод\p{L}*\s+ли\s+я|(?:я|буду\s+ли\s+я)\s+(?:свободен|свободна|занят|занята)\s+|мо[её]\s+свободное\s+время/iu;
const MEETINGS=/(?:встреч|созвон|митинг|звонк|колл)\p{L}*/iu;
const VIEW=new RegExp('(?:какие|мои|покажи|что\\s+(?:за|по|с)|сколько|есть\\s+ли|список|на\\s+'+DAYWORD+'|'+DAYWORD+')','iu');
const BARE=new RegExp('^(?:а\\s+)?(?:что|чё|че)\\s+(?:у\\s+меня|там)\\s+(?:на\\s+|в\\s+|во\\s+)?'+DAYWORD+'(?:\\s+(?:по\\s+календарю|в\\s+календаре|по\\s+встречам))?\\s*[?.!]*$','iu');
const CALENDAR=/(?:в|по|из|мо[йеё]м?|покажи)\s+(?:мой\s+)?календар\p{L}*|расписани\p{L}*\s+(?:встреч|на\s+(?:сегодня|завтра|неделю))|мо[её]\s+расписани/iu;
function intent(text){
 const t=String(text||'').trim();
 if(!t||t.length>600||AVOID.test(t))return null;
 if(CREATE.test(t))return 'create';
 if(FIND.test(t)&&(/(?:^|\s)(?:с|со)\s+\p{Lu}|@|для\s+встреч|встреч|созвон|когда\s+(?:мы|все)/u.test(t)))return 'find';
 if(FREE.test(t))return 'free';
 if(BARE.test(t)||CALENDAR.test(t)||MEETINGS.test(t)&&VIEW.test(t)&&!/(?:^|\s)(?:с|со)\s+\p{Lu}/u.test(t))return 'agenda';
 // «Найди час на этой неделе» (only the user): a period must be named, «найди время в логах» is not a calendar.
 if(FIND.test(t)&&new RegExp(DAYWORD,'iu').test(t))return 'find';
 return null;
}

// --- Known meeting rooms (per company data folder) and cross-app links ---------------------------------------
const roomStores=new Map();
const linksFor=s=>s.appLinks||require('../../features/app-links.cjs').create(s);
// Which meeting service a link belongs to is asked of the providers of added apps (`recognizeLink`).
const recognizer=s=>url=>linksFor(s).recognize?.(url)||null;
function roomsFor(s){
 const file=s.dataRoot?path.join(s.dataRoot,'calendar-rooms.json'):'';
 if(!roomStores.has(file))roomStores.set(file,new Rooms({file}));
 const rooms=roomStores.get(file);rooms.recognize=recognizer(s);
 return rooms;
}
// Events read for a card: meeting links are learned from them, the private details stay out of the chat.
function learned(s,events,account){
 try{roomsFor(s).learn(events.map(e=>({...e,...e.meta})),{self:account.email.toLowerCase()});}catch{/* learning never blocks the answer */}
 return events.map(({meta,...e})=>e);
}
function hours(settings){
 const a=when.minutes(settings.calendarWorkStart),b=when.minutes(settings.calendarWorkEnd);
 return a!==null&&b!==null&&a<b?{workStart:settings.calendarWorkStart,workEnd:settings.calendarWorkEnd}:{workStart:'10:00',workEnd:'19:00'};
}
const defaultDuration=settings=>{const n=Number(settings.calendarDuration);return Number.isInteger(n)&&n>=15&&n<=480?n:60;};

function clientFor(s,account,fetcher){
 const manager=s.mailAccounts?.[account.provider];
 if(!manager)throw Error('Почтовые аккаунты ещё загружаются. Повторите через минуту.');
 return new CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
}
// The calendar to use: the one chosen in settings, the only one with access, or a question.
function pick(s,list,resume){
 const ready=list.filter(a=>a.calendar);
 const chosen=ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
 if(chosen)return chosen;
 const label=a=>(a.email||a.label||'аккаунт')+' · '+(a.provider==='microsoft'?'Outlook':'Google');
 return ask({text:'В каком календаре смотреть? Запомню выбор, его можно изменить в настройках «Календаря».',label:'Календарь',options:ready.map(label),strictChoices:true},answer=>{
  const a=ready.find(x=>label(x).toLocaleLowerCase()===String(answer).toLocaleLowerCase());
  if(!a)return {handled:true,text:'Такого календаря нет. Повторите запрос.',error:true};
  s.saveSettings?.({calendarAccount:a.key});return resume(a);
 });
}

// --- Chat turns ------------------------------------------------------------------------------------------------
const fmt=iso=>when.hm(new Date(iso));
const span=(a,b)=>fmt(a)+'–'+fmt(b);
const dayShort=d=>new Date(d).toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});
const cap=t=>t?t[0].toLocaleUpperCase()+t.slice(1):t;
const meetings=n=>n+' '+kit.plural(n,['встреча','встречи','встреч']);
const timed=events=>events.filter(e=>!e.allDay&&!e.declined);

async function agenda(s,text,account,{fetcher,now}){
 const range=when.range(text,now)||{from:when.startOfDay(now),to:when.addDays(when.startOfDay(now),1),label:'сегодня',single:true};
 const client=clientFor(s,account,fetcher);
 s.requestProgress?.report?.('Читаю календарь');
 const events=learned(s,await client.events(range.from,range.to),account);
 const base={account:account.key,accountEmail:account.email,provider:account.provider,...hours(s.settings),now:now.toISOString()};
 if(range.single){
  const list=timed(events),upcoming=list.find(e=>Date.parse(e.end)>+now);
  const reply=list.length?cap(range.label)+' '+meetings(list.length)+': '+list.slice(0,6).map(e=>fmt(e.start)+' '+e.title).join('; ')+(list.length>6?' и ещё '+(list.length-6):'')+'.'+(upcoming&&when.ymd(range.from)===when.ymd(now)?' Ближайшая — '+upcoming.title+' в '+fmt(upcoming.start)+'.':''):cap(range.label)+' встреч нет.';
  return kit.reply(s,text,{by:BY,text:reply,data:{calendarCard:{mode:'day',date:when.ymd(range.from),label:range.label,events,...base}}});
 }
 const days=[];for(let d=new Date(range.from);d<range.to;d=when.addDays(d,1)){const day=when.ymd(d);days.push({date:day,events:events.filter(e=>when.ymd(new Date(e.start))===day||e.allDay&&new Date(e.start)<=d&&new Date(e.end)>d)});}
 const total=timed(events).length,busiest=[...days].sort((a,b)=>timed(b.events).length-timed(a.events).length)[0];
 const summary=total?cap(range.label)+' '+meetings(total)+(busiest&&timed(busiest.events).length>1?', больше всего — '+dayShort(busiest.date)+' ('+timed(busiest.events).length+')':'')+'.':cap(range.label)+' встреч нет.';
 return kit.reply(s,text,{by:BY,text:summary,data:{calendarCard:{mode:'week',label:range.label,days,...base}}});
}

async function free(s,text,account,{fetcher,now}){
 const range=when.range(text,now)||{from:when.startOfDay(now),to:when.addDays(when.startOfDay(now),1),label:'сегодня',single:true};
 const client=clientFor(s,account,fetcher);
 s.requestProgress?.report?.('Смотрю свободное время');
 const events=learned(s,await client.events(range.from,range.to),account);
 const busy=events.filter(e=>!e.allDay&&!e.declined&&!e.free);
 const h=hours(s.settings),wins=slots.windows(range,{...h,now});
 const gaps=slots.gaps(busy,wins);
 const base={account:account.key,accountEmail:account.email,provider:account.provider,...h,now:now.toISOString()};
 if(range.single){
  const reply=!wins.length?cap(range.label)+' рабочий день уже закончился.':gaps.length?cap(range.label)+' свободно: '+gaps.map(g=>span(g.start,g.end)).join(', ')+'.':cap(range.label)+' свободных окон в рабочее время ('+h.workStart+'–'+h.workEnd+') нет.';
  return kit.reply(s,text,{by:BY,text:reply,data:{calendarCard:{mode:'day',date:when.ymd(range.from),label:range.label,events,free:gaps,...base}}});
 }
 const days=wins.map(w=>({date:w.day,events:events.filter(e=>when.ymd(new Date(e.start))===w.day),free:gaps.filter(g=>when.ymd(new Date(g.start))===w.day)}));
 const reply=gaps.length?cap(range.label)+' свободно: '+days.filter(d=>d.free.length).map(d=>dayShort(d.date)+' '+d.free.map(g=>span(g.start,g.end)).join(', ')).join('; ')+'.':cap(range.label)+' свободных окон в рабочее время нет.';
 return kit.reply(s,text,{by:BY,text:reply,data:{calendarCard:{mode:'week',label:range.label,days,...base}}});
}

// Title: «…» in quotes, «на тему …», «про …»; otherwise «Встреча с Машей и Олегом» style from the names.
function title(text,attendees){
 const quoted=/[«"]([^»"]{2,120})[»"]/u.exec(text)?.[1];if(quoted)return quoted.trim();
 const topic=/(?:на\s+тему|по\s+теме|по\s+поводу|про|насч[её]т)\s+(.{2,80}?)(?=\s+(?:с|со|в|во|на|завтра|сегодня|послезавтра)\s|[.,;!?]|$)/iu.exec(text)?.[1];if(topic)return cap(topic.trim());
 return attendees.length?'Встреча: '+attendees.map(people.short).join(', '):'Встреча';
}
// People of the request → [{name,email}], or a clarification for the first unclear name.
function attendeesOf(s,text,fixed,resume){
 const {names,emails}=people.mentioned(text);
 let members=[];try{members=team.members(s.settings);}catch{members=[];}
 const {resolved,problem}=people.resolve(names,members,fixed);
 if(problem){
  const n=problem.name;
  if(problem.kind==='ambiguous'){
   const label=m=>m.name+(m.email?' · '+m.email:' · без email');
   return ask({text:'«'+n+'» — кого именно?',label:'Участник',options:problem.options.map(label),strictChoices:true},answer=>{
    const m=problem.options.find(x=>label(x).toLocaleLowerCase()===String(answer).toLocaleLowerCase());
    if(m&&!m.email)return resume({...fixed},n,m.name);
    return resume({...fixed,[n]:m?{name:m.name,email:m.email.toLowerCase()}:null});
   });
  }
  const who=problem.member?.name||n;
  const q=problem.kind==='noemail'?'У «'+who+'» нет email в «Команде». Напишите адрес — или продолжу без него.':'«'+n+'» нет в «Команде». Напишите email или другое имя — или продолжу без него.';
  return ask({text:q,label:'Email участника',placeholder:'name@company.com',options:['Без «'+who+'»']},answer=>{
   const value=String(answer).trim(),email=value.match(people.EMAIL)?.[0];
   if(email)return resume({...fixed,[n]:{name:problem.member?.name||n,email:email.toLowerCase()}});
   if(/^без(?:\s|$)/iu.test(value))return resume({...fixed,[n]:null});
   return resume({...fixed},n,value);
  });
 }
 const all=[...resolved,...emails.filter(e=>!resolved.some(r=>r.email===e.toLowerCase())).map(e=>({name:e,email:e.toLowerCase()}))];
 return all.filter((p,i)=>all.findIndex(q=>q.email===p.email)===i);
}

async function schedule(s,command,account,{fetcher,now},kind,fixed={},text=command){
 // A clarification resumes this same step: fixed answers carry over, a retyped name replaces the unclear one.
 const resume=(next,name,replacement)=>guard(s,command,()=>schedule(s,command,account,{fetcher,now},kind,next,replacement?text.replace(name,String(replacement).replace(/(^|\s)(\p{Ll})/gu,(m,a,b)=>a+b.toLocaleUpperCase())):text));
 const invited=attendeesOf(s,text,fixed,resume).filter(p=>p.email!==account.email.toLowerCase());
 const duration=when.duration(text)||defaultDuration(s.settings);
 const h=hours(s.settings);
 const at=when.time(text);
 let range=when.range(text,now);
 if(kind==='create'&&at!==null&&!range){const today=when.startOfDay(now);const day=when.at(today,at)>now?today:when.addDays(today,1);range={from:day,to:when.addDays(day,1),label:when.dayLabel(day,now),single:true,explicit:true};}
 if(!range){
  // «Найди час с Машей» without a day: the rest of this week, or the next one at the end of the week.
  range=when.range('на этой неделе',now);
  if(slots.windows(range,{...h,now}).length===0){const from=when.addDays(when.weekStart(now),7);range={from,to:when.addDays(from,7),label:'на следующей неделе',single:false};}
 }
 const client=clientFor(s,account,fetcher);
 s.requestProgress?.report?.('Смотрю занятость '+(invited.length?'участников':'в календаре'));
 const self={name:'Вы',email:account.email.toLowerCase(),self:true};
 const rows=await client.busy([self.email,...invited.map(p=>p.email)],range.from,range.to);
 const lanes=[self,...invited].map(p=>({...p,...rows.find(r=>r.email===p.email)||{busy:[],error:'нет данных'}}));
 const requested=kind==='create'&&at!==null&&range.single?slots.check(lanes,when.at(range.from,at),duration):null;
 if(requested&&new Date(requested.start)<now)return kit.reply(s,command,{by:BY,question:true,text:'Это время уже прошло. Назовите другое — например, «завтра в '+fmt(requested.start)+'».'});
 const found=slots.find(lanes,range,{duration,...h,now,limit:requested?3:5});
 const list=requested?[{...requested,requested:true,note:requested.busy.length?'заняты: '+requested.busy.map(e=>lanes.find(l=>l.email===e)?.name||e).join(', '):'свободны все'},...found.slots.filter(x=>x.start!==requested.start)].slice(0,4):found.slots;
 const name=title(text,invited);
 const card={mode:'slots',draftId:randomUUID(),account:account.key,accountEmail:account.email,provider:account.provider,title:name,duration,label:range.label,
  people:lanes.map(l=>({name:l.name,email:l.email,self:!!l.self,error:l.error||'',busy:(l.busy||[]).map(b=>({start:b.start,end:b.end}))})),
  attendees:invited,slots:list,chosen:0,requested:!!requested,...h,now:now.toISOString()};
 const who=invited.length?' с '+invited.map(people.short).join(', '):'';
 let reply;
 if(!list.length)reply='Не нашёл '+duration+' мин'+who+' '+range.label+' в рабочее время ('+h.workStart+'–'+h.workEnd+'). Попробуйте другой период или короче встречу.';
 else if(requested)reply=(requested.busy.length?'В '+dayShort(requested.start)+' '+span(requested.start,requested.end)+' '+list[0].note+'. Ниже — свободные варианты рядом. ':'Готово к созданию: «'+name+'», '+dayShort(requested.start)+' '+span(requested.start,requested.end)+who+'. ')+'Встреча создаётся только после «Поставить встречу» в карточке.';
 else reply='Нашёл '+list.length+' '+kit.plural(list.length,['вариант','варианта','вариантов'])+' на '+duration+' мин'+who+' '+range.label+'. Лучший — '+dayShort(list[0].start)+' '+span(list[0].start,list[0].end)+' ('+list[0].note+').';
 const unknown=lanes.filter(l=>l.error);
 if(unknown.length)reply+=' Не видно календарь: '+unknown.map(l=>l.name+' — '+l.error).join('; ')+'.';
 return kit.reply(s,command,{by:BY,text:reply,data:{calendarCard:card}});
}

async function run(s,text,kind,deps){
 const list=accounts(s.settings);
 const go=account=>guard(s,text,()=>kind==='agenda'?agenda(s,text,account,deps):kind==='free'?free(s,text,account,deps):schedule(s,text,account,deps,kind));
 return go(pick(s,list,go));
}
// Service failures are told in the chat under the app's name; a clarification passes through.
// A CalendarError already says what to do (allow calendar access, enable the API), so it is shown as is.
async function guard(s,text,work){try{return await work();}catch(e){if(e.name==='InputRequired')throw e;if(e instanceof CalendarError)return kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message});return kit.failure(s,text,BY,e);}}

async function turn(s,command,{fetcher=globalThis.fetch,now=new Date()}={}){
 const text=String(command||'');
 const kind=intent(text);
 if(!kind||!kit.installed(s,ID))return null;
 const list=accounts(s.settings);
 if(!list.length)return kit.reply(s,text,{by:BY,question:true,text:'Календарь работает через аккаунт Google или Microsoft. Подключите его в «Настройки → Календарь» («Подключить Google» или «Подключить Microsoft») — Петя попросит доступ к календарю. Потом повторите запрос.'});
 if(!list.some(a=>a.calendar))return kit.reply(s,text,{by:BY,question:true,text:(list.length===1?'Аккаунт '+(list[0].email||list[0].label):'Аккаунты '+list.map(a=>a.email).join(', '))+' '+(list.length===1?'подключён':'подключены')+' только для почты. Откройте «Настройки → Календарь» и нажмите «Разрешить доступ к календарю», затем повторите запрос.'});
 return run(s,text,kind,{fetcher,now});
}

// --- Setup: confirm-and-create, incremental consent, status -----------------------------------------------------
function setup(s,{fetcher=globalThis.fetch,now=()=>new Date(),poll=1000}={}){
 const creating=new Set();
 let operation=null,watching=null;
 function publish(text,busy,kind='info'){operation={id:'calendar-connect',title:'Календарь',text,busy,kind};if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',operation);}
 // The card lives in a chat message: the event is created from the data Petya stored there, not from the page.
 function locate(draftId){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.calendarCard;if(card?.draftId===draftId)return {topic,message,card};}
  return null;
 }
 // The video call of a new event. `video`: true (the calendar's own Meet/Teams, the old default), false or 'none',
 // a provider id ('google-meet', 'teams' or another app's), {room:key} (a known room) or {url} (a link the user
 // typed). `link` is what the user pasted when a provider asked for its link ({needLink}).
 async function videoFor(video,{account,summary,card,link}){
  if(video===false||video==='none'||video?.kind==='none')return null;
  const links=linksFor(s);
  const id=video===true||video===undefined?(account.provider==='microsoft'?'teams':'google-meet'):typeof video==='string'?video:video?.kind==='provider'?String(video.id||''):'';
  if(id){
   const r=await links.run('video-meeting',id,{calendar:account.provider,title:summary,attendees:(card.attendees||[]).map(a=>a.email),link});
   if(r?.needLink)return {needLink:true,text:r.text,placeholder:r.placeholder||'https://…',field:r.field||'Ссылка на встречу'};
   return r?.native?{patch:r.patch,query:r.query,provider:r.provider}:{url:r.url,provider:r.provider||id};
  }
  if(video?.room!==undefined||video?.kind==='room'){const room=roomsFor(s).get(String(video.room??video.key));if(!room)throw Error('Эта комната больше не в списке. Выберите другую.');return {url:room.url,provider:room.kind,room:room.key};}
  if(video?.url!==undefined||video?.kind==='custom'){const n=normalize(String(video.url||''),{any:true,recognize:recognizer(s)});if(!n)throw Error('Нужна ссылка https:// на встречу.');return {url:n.url,provider:n.kind,custom:true};}
  throw Error('Выберите видеозвонок.');
 }
 // Choices for «Видеозвонок» in the confirm step: providers (other apps' rooms, Meet/Teams of this calendar) and
 // known rooms ranked for this meeting. A due 60-day look-back of the calendar refreshes the rooms first.
 async function videoChoices(draftId){
  const found=locate(String(draftId||''));if(!found)throw Error('Подбор устарел или удалён. Повторите запрос в чате.');
  const card=found.card,rooms=roomsFor(s);
  const account=accounts(s.settings).find(a=>a.key===card.account);
  if(account?.calendar&&rooms.due()){
   try{const to=now(),from=new Date(+to-require('./rooms.cjs').LOOKBACK*86400000);learned(s,await clientFor(s,account,fetcher).events(from,to),account);rooms.refreshed();}catch{/* the known rooms stay as they are */}
  }
  const providers=linksFor(s).available('video-meeting',{calendar:card.provider});
  const ranked=rooms.rank({title:card.title,attendees:(card.attendees||[]).map(a=>a.email)});
  return {providers,rooms:ranked,strong:ranked[0]?.strong?ranked[0].key:''};
 }
 async function create({draftId,slot=0,title:name,video=true,link}={}){
  if(typeof draftId!=='string'||!draftId)throw Error('Нет данных встречи.');
  const found=locate(draftId);if(!found)throw Error('Подбор устарел или удалён. Повторите запрос в чате.');
  const card=found.card;
  if(card.created)return {created:card.created,already:true};
  if(card.unknown)throw Error('Не знаю, создалась ли встреча в прошлый раз (сервис не ответил). Проверьте календарь, прежде чем ставить снова.');
  if(creating.has(draftId))throw Error('Уже создаю эту встречу.');
  const choice=card.slots?.[Number(slot)];if(!choice)throw Error('Выберите время.');
  if(Date.parse(choice.start)<+now())throw Error('Это время уже прошло. Выберите другое.');
  const account=accounts(s.settings).find(a=>a.key===card.account);
  if(!account?.calendar)throw Error('Нет доступа к календарю '+(card.accountEmail||'')+'. Разрешите его в настройках «Календаря».');
  const summary=String(name??card.title).replace(/\s+/g,' ').trim().slice(0,200)||card.title;
  creating.add(draftId);
  try{
   // The link is resolved before anything is written: a provider's missing link is a question, not a failure.
   const meeting=await videoFor(video,{account,summary,card,link});
   if(meeting?.needLink)return {needLink:true,text:meeting.text,placeholder:meeting.placeholder,field:meeting.field};
   const people=(card.attendees||[]).map(a=>a.email);
   const result=await clientFor(s,account,fetcher).create({title:summary,start:choice.start,end:choice.end,attendees:card.attendees||[],meeting});
   card.created={...result,title:summary,start:choice.start,end:choice.end,attendees:people,video:meeting?.provider||'',at:now().toISOString()};card.chosen=Number(slot);
   s.dialogue.persist();
   try{if(meeting?.room)roomsFor(s).use(meeting.room,{title:summary,attendees:people});else if(meeting?.custom)roomsFor(s).remember(meeting.url,{title:summary,attendees:people});}catch{/* the event exists; the room list is a convenience */}
   return {created:card.created};
  }catch(e){
   // No answer from the service: the event may exist. Never offer to repeat it blindly.
   if(e.unknown){card.unknown=true;s.dialogue.persist();}
   throw e;
  }finally{creating.delete(draftId);}
 }
 // Incremental consent: the same Google/Microsoft OAuth client, mail scope kept, calendar scopes added.
 async function connect(provider,key){
  if(!['google','microsoft'].includes(provider))throw Error('Неизвестный сервис.');
  const manager=s.mailAccounts?.[provider];if(!manager)throw Error('Почтовые аккаунты ещё загружаются.');
  const account=key?accounts(s.settings).find(a=>a.key===key&&a.provider===provider):null;
  const before=new Set(accounts(s.settings).filter(a=>a.calendar).map(a=>a.key));
  await manager.start({scopes:SCOPES[provider],email:account?.email||''});
  publish('Подтвердите доступ к календарю в браузере'+(account?.email?' для '+account.email:'')+'.',true);
  if(watching)clearInterval(watching);
  const started=+now();
  watching=setInterval(()=>{
   const login=manager.login;if(login?.pending&&+now()-started<310000)return;
   clearInterval(watching);watching=null;
   const after=accounts(s.settings).filter(a=>a.calendar&&a.provider===provider);
   const fresh=after.find(a=>!before.has(a.key))||after.find(a=>a.key===key);
   if(login?.lastError)publish(login.lastError,false,'error');
   else if(fresh){publish('Календарь '+(fresh.email||'')+' подключён.',false,'success');if(!s.settings.calendarAccount)s.saveSettings?.({calendarAccount:fresh.key});}
   else publish('Доступ к календарю не выдан. Отметьте разрешение на календарь на странице входа и повторите.',false,'error');
  },poll);
  watching.unref?.();
  return status();
 }
 function status(){
  const conf=p=>{try{return !!s.mailAccounts?.[p]?.status().configured;}catch{return false;}};
  return {accounts:accounts(s.settings).map(({key,provider,email,label,calendar})=>({key,provider,email,label,calendar})),configured:{google:conf('google'),microsoft:conf('microsoft')},
   chosen:s.settings.calendarAccount||'',...hours(s.settings),duration:defaultDuration(s.settings),operation};
 }
 const rooms={list:()=>roomsFor(s).list(),rename:(key,name)=>{roomsFor(s).rename(String(key||''),name);return roomsFor(s).list();},forget:key=>roomsFor(s).forget(String(key||''))};
 return {ipc:{create,videoChoices,rooms:rooms.list,renameRoom:rooms.rename,forgetRoom:rooms.forget,connect,status,cancel(){if(watching)clearInterval(watching);watching=null;for(const p of ['google','microsoft'])s.mailAccounts?.[p]?.login?.stop?.();publish('Подключение отменено.',false);return status();}}};
}

function validate(next){
 for(const key of ['calendarWorkStart','calendarWorkEnd'])if(next[key]!==undefined&&next[key]!==''&&when.minutes(next[key])===null)throw Error('Рабочие часы календаря — в формате ЧЧ:ММ.');
 if(next.calendarWorkStart&&next.calendarWorkEnd&&when.minutes(next.calendarWorkStart)>=when.minutes(next.calendarWorkEnd))throw Error('Начало рабочего дня должно быть раньше конца.');
 if(next.calendarDuration!==undefined&&next.calendarDuration!==''&&!/^(?:15|30|45|60|90|120)$/.test(String(next.calendarDuration)))throw Error('Длительность встречи: 15, 30, 45, 60, 90 или 120 минут.');
 if(next.calendarAccount!==undefined&&next.calendarAccount!==''&&!/^(?:google|microsoft):[\w-]{1,80}$/.test(next.calendarAccount))throw Error('Некорректный календарь.');
}
module.exports={name:'calendarApp',defaults:{['extension_'+ID]:'false',calendarAccount:'',calendarWorkStart:'10:00',calendarWorkEnd:'19:00',calendarDuration:'60'},validate,setup,turn,intent,accounts,connected,title};
