// «Дневник дня»: what the user did today, from Petya's own data — chats Petya helped with, messages it sent and tasks
// it created, Jira status changes by the user, commits in the project repository, recorded meetings, reminders, and
// focus sessions when a focus app provides them (journal sources, sources.cjs) — plus the open items that may go to
// tomorrow's plan, a short reflection question and private notes. «Что я сегодня сделал», «итоги недели», «план на
// завтра», «запиши в дневник: …». An evening summary can be scheduled (off by default); tomorrow's plan feeds the
// morning brief. Everything stays on this computer: nothing is posted anywhere, no model is needed.
const path=require('node:path');
const kit=require('../app-kit.cjs');
const sources=require('./sources.cjs');
const storage=require('./store.cjs');
const ID='journal',BY='Дневник дня',DAY=86400000;

// --- Routing ----------------------------------------------------------------------------------------------------
const P='^(?:петя[,!\\s]+)?(?:а\\s+)?(?:покажи\\s+(?:мне\\s+)?)?';
const DAY_RE=new RegExp(P+'(?:что\\s+я\\s+(?:сегодня\\s+|вчера\\s+)?(?:сделал\\p{L}*|успел\\p{L}*|делал\\p{L}*)(?:\\s+(?:сегодня|вчера|за\\s+день))?|(?:мои\\s+)?итоги\\s+(?:дня|сегодня|за\\s+сегодня|вчерашнего\\s+дня)|подведи\\s+итоги\\s+дня|(?:мой\\s+)?дневник(?:\\s+дня|\\s+за\\s+(?:сегодня|вчера))?|(?:мой\\s+)?день\\s+в\\s+цифрах|как\\s+прош[её]л\\s+(?:мой\\s+)?день)[?.!\\s]*$','iu');
const WEEK_RE=new RegExp(P+'(?:(?:мои\\s+)?итоги\\s+(?:недели|за\\s+неделю|этой\\s+недели)|что\\s+я\\s+(?:сделал\\p{L}*|успел\\p{L}*)\\s+за\\s+(?:эту\\s+)?неделю|неделя\\s+в\\s+цифрах|дневник\\s+за\\s+неделю|подведи\\s+итоги\\s+недели)[?.!\\s]*$','iu');
const PLAN_RE=new RegExp(P+'(?:(?:мой\\s+|составь\\s+|какой\\s+(?:у\\s+меня\\s+)?)?план\\s+на\\s+завтра|что\\s+(?:перенести|переносим)\\s+на\\s+завтра)[?.!\\s]*$','iu');
const NOTE_RE=/^(?:петя[,!\s]+)?(?:запиши|добавь|занеси|внеси|отметь)\s+(?:мне\s+)?в\s+(?:мой\s+)?дневник(?:\s+дня)?\s*[:,—-]?\s*([\s\S]+)$/iu;
const EVENING_ON=/^(?:петя[,!\s]+)?(?:присылай|делай|готовь|собирай|включи|подводи)\s+(?:мне\s+)?(?:вечерн\p{L}*\s+)?итоги\s+дня(?:\s+(?:каждый\s+вечер|по\s+вечерам|каждый\s+день))*\s+в\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:вечера|часов|ч))?[.!]*$/iu;
const EVENING_OFF=/^(?:петя[,!\s]+)?(?:не\s+присылай|выключи|отключи|убери|останови)\s+(?:вечерн\p{L}*\s+)?итоги\s+дня[.!]*$/iu;
// Not this app: a game devlog («дневник разработки» → patch notes), log files, changelogs, meeting/sprint results.
const AVOID=/дневник\p{L}*\s+(?:разработ|игры|проекта|для\s+игрок)|devlog|дев-?лог|журнал|(?<!\p{L})лог(?:и|ов|а)?(?=$|[^\p{L}])|чейнджлог|changelog|изменени|патч|релиз|встреч|спринт|созвон|не\s+так|ошибк/iu;
function route(command){
 const text=String(command||'').trim();
 const note=NOTE_RE.exec(text);if(note&&!/дневник\p{L}*\s+разработ/iu.test(text))return {type:'note',text:note[1].trim()};
 if(EVENING_ON.test(text))return {type:'evening',time:EVENING_ON.exec(text)};
 if(EVENING_OFF.test(text))return {type:'evening',off:true};
 if(AVOID.test(text))return null;
 if(WEEK_RE.test(text))return {type:'week'};
 if(PLAN_RE.test(text))return {type:'plan'};
 if(DAY_RE.test(text))return {type:'day',yesterday:/вчера|вчерашн/iu.test(text)};
 return null;
}

// --- Days, totals, reflection ----------------------------------------------------------------------------------------
const pad=v=>String(v).padStart(2,'0');
const ymd=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const dayStart=ms=>{const d=new Date(ms);d.setHours(0,0,0,0);return d.getTime();};
const addDays=(ms,n)=>{const d=new Date(ms);d.setDate(d.getDate()+n);return d.getTime();};
const weekStart=ms=>{const d=new Date(dayStart(ms));return addDays(d.getTime(),-((d.getDay()+6)%7));};
const plural=kit.plural;
// What a day amounts to, counted from its items' kinds.
function totals(items){
 const t={meetings:0,meetingMinutes:0,tasks:0,commits:0,focusMinutes:0,chats:0,messages:0,reminders:0,notes:0};
 for(const i of items){
  if(i.kind==='meeting'){t.meetings++;t.meetingMinutes+=Number(i.minutes)||0;}
  else if(i.kind==='transition'||i.kind==='task')t.tasks++;
  else if(i.kind==='commit')t.commits++;
  else if(i.kind==='focus')t.focusMinutes+=Number(i.minutes)||0;
  else if(i.kind==='chat')t.chats++;
  else if(i.kind==='message')t.messages++;
  else if(i.kind==='reminder')t.reminders++;
  else if(i.kind==='note')t.notes++;
 }
 return t;
}
const PROMPTS=['Что сегодня получилось лучше всего?','Что отняло больше времени, чем вы думали?','Что вы сделаете завтра первым делом?','Что сегодня мешало сосредоточиться?','За что сегодня можно себя похвалить?','Что стоит делегировать или бросить?','Чему вы сегодня научились?'];
const prompt=key=>PROMPTS[Math.floor(Date.parse(key+'T12:00:00Z')/DAY)%PROMPTS.length];
function summary(t,{label='Сегодня'}={}){
 const parts=[];
 if(t.meetings)parts.push(t.meetings+' '+plural(t.meetings,['встреча','встречи','встреч']));
 if(t.tasks)parts.push(t.tasks+' '+plural(t.tasks,['задача','задачи','задач'])+' в Jira');
 if(t.commits)parts.push(t.commits+' '+plural(t.commits,['коммит','коммита','коммитов']));
 if(t.focusMinutes)parts.push(t.focusMinutes+' мин фокуса');
 if(t.chats)parts.push(t.chats+' '+plural(t.chats,['чат','чата','чатов'])+' с Петей');
 if(t.messages)parts.push(t.messages+' '+plural(t.messages,['сообщение','сообщения','сообщений'])+' через Петю');
 if(t.reminders)parts.push(t.reminders+' '+plural(t.reminders,['напоминание','напоминания','напоминаний']));
 return parts.length?label+': '+parts.join(', ')+'.':label+' в данных Пети ничего не отмечено.';
}

// --- Card data -----------------------------------------------------------------------------------------------------
async function build(s,{mode='day',date},j=s.journal){
 const now=j.now(),key=ymd(date??now),from=dayStart(date??now);
 const week=weekStart(from),end=Math.min(addDays(week,7),Math.max(addDays(from,1),dayStart(now)+DAY));
 const got=await j.sources.collect({from:week,to:end,now});
 const store=j.store();
 // Notes are journal items too (their text stays private: only the moment and «запись» are shown).
 const all=[...got.items];
 for(let d=week;d<end;d=addDays(d,1))for(const n of store.peek(ymd(d))?.notes||[])all.push({at:n.at,icon:'note',kind:'note',source:'journal',title:'Запись в дневнике',private:true});
 const days=[];
 for(let d=week;d<addDays(week,7);d=addDays(d,1)){const items=all.filter(i=>i.at>=d&&i.at<addDays(d,1));days.push({date:ymd(d),future:d>dayStart(now),totals:totals(items)});}
 const today=all.filter(i=>i.at>=from&&i.at<addDays(from,1)).sort((a,b)=>a.at-b.at);
 const dayTotals=totals(today);
 store.totals(key,dayTotals);
 const tomorrow=ymd(addDays(from,1));
 // Tomorrow's candidates: what sources say is open, and today's plan items not done yet.
 const own=(store.peek(key)?.plan||[]).filter(p=>!p.done).map(p=>({id:p.id,title:p.title,detail:p.detail||'из плана на сегодня',url:p.url,source:p.source||'journal'}));
 const planned=store.peek(tomorrow)?.plan||[];
 const seen=new Set();const carry=[...own,...got.carry].filter(c=>!seen.has(c.id)&&seen.add(c.id)).slice(0,20).map(c=>({...c,planned:planned.some(p=>p.id===c.id)}));
 const weekTotals=totals(all);
 return {mode,date:key,now,tomorrow,timeline:mode==='week'?all.sort((a,b)=>a.at-b.at).slice(-60):today,totals:mode==='week'?weekTotals:dayTotals,week:days,carry,
  planned:planned.map(p=>({id:p.id,title:p.title,detail:p.detail,url:p.url,done:p.done,source:p.source})),
  prompt:prompt(key),reflected:!!store.peek(key)?.reflection?.answer,evening:s.settings.journalEvening||'',
  errors:got.errors,sources:got.sources,focus:got.sources.some(x=>/focus|фокус/i.test(x.id+' '+x.name))};
}

async function dayTurn(s,command,{yesterday=false}={}){
 s.requestProgress?.report?.('Собираю день: чаты, задачи, коммиты, встречи');
 const date=yesterday?addDays(s.journal.now(),-1):s.journal.now();
 const card=await build(s,{mode:'day',date});
 const t=card.totals;
 let text=summary(t,{label:yesterday?'Вчера':'Сегодня'});
 if(card.carry.length)text+=' Открытых пунктов, которые можно перенести на завтра: '+card.carry.length+'.';
 if(card.errors.length)text+=' Не удалось прочитать: '+card.errors.map(e=>e.source).join(', ')+'.';
 text+=' Вопрос дня: '+card.prompt;
 return kit.reply(s,command,{by:BY,text,data:{journalCard:card}});
}
async function weekTurn(s,command){
 s.requestProgress?.report?.('Собираю неделю');
 const card=await build(s,{mode:'week'});
 const busiest=[...card.week].filter(d=>!d.future).sort((a,b)=>score(b.totals)-score(a.totals))[0];
 let text=summary(card.totals,{label:'За неделю'});
 if(busiest&&score(busiest.totals))text+=' Самый насыщенный день — '+new Date(busiest.date+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'long'})+'.';
 if(card.errors.length)text+=' Не удалось прочитать: '+card.errors.map(e=>e.source).join(', ')+'.';
 return kit.reply(s,command,{by:BY,text,data:{journalCard:card}});
}
const score=t=>t.meetings+t.tasks+t.commits+t.chats+t.messages+t.reminders+Math.round(t.focusMinutes/25);
async function planTurn(s,command){
 const card=await build(s,{mode:'plan'});
 const text=card.planned.length?'План на завтра: '+card.planned.map(p=>p.title).slice(0,5).join('; ')+(card.planned.length>5?' и ещё '+(card.planned.length-5):'')+'.':
  card.carry.length?'Плана на завтра пока нет. Отметьте в карточке, что перенести: '+card.carry.length+' '+plural(card.carry.length,['открытый пункт','открытых пункта','открытых пунктов'])+'.':'Плана на завтра пока нет, и открытых пунктов не нашёл.';
 return kit.reply(s,command,{by:BY,text,data:{journalCard:card}});
}
async function turn(s,command){
 const r=route(command);
 if(!r||!kit.installed(s,ID))return null;
 if(s.attachments?.list?.().length)return null;
 if(!s.journal)return kit.reply(s,command,{by:BY,error:true,text:'Дневник ещё загружается. Повторите через минуту.'});
 try{
  if(r.type==='note'){
   const key=ymd(s.journal.now());s.journal.store().note(key,r.text,s.journal.now());
   const n=(s.journal.store().peek(key)?.notes||[]).length;
   return kit.reply(s,command,{by:BY,text:'Записал в дневник за сегодня (записей: '+n+'). Записи видны только вам — на этом компьютере.'});
  }
  if(r.type==='evening'){
   if(r.off){s.saveSettings({journalEvening:''});return kit.reply(s,command,{by:BY,text:'Выключил вечерние итоги дня. Спросить можно в любой момент: «что я сегодня сделал».'});}
   const time=pad(Math.min(23,Number(r.time[1])+(Number(r.time[1])<12&&/вечера/iu.test(command)?12:0)))+':'+pad(Math.min(59,Number(r.time[2]||0)));
   s.saveSettings({journalEvening:time});
   return kit.reply(s,command,{by:BY,text:'Хорошо: по будням в '+time+' соберу итоги дня в чате «Дневник» — ничего никуда не отправляю.'});
  }
  if(r.type==='week')return await weekTurn(s,command);
  if(r.type==='plan')return await planTurn(s,command);
  return await dayTurn(s,command,r);
 }catch(e){if(e.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

// --- Background: evening summary, morning brief, IPC -------------------------------------------------------------------
const instances=new Map();
function setup(s,{now:clock=()=>Date.now(),encrypt,decrypt}={}){
 const company=s.companyId,file=path.join(s.dataRoot||'.','extensions',ID,'journal.json');
 if(encrypt===undefined)try{const {safeStorage}=require('electron');if(safeStorage?.isEncryptionAvailable?.()){encrypt=t=>safeStorage.encryptString(t);decrypt=b=>safeStorage.decryptString(b);}}catch{/* plain file with 0600 */}
 let store=null;const storeOf=()=>store||(store=storage.create(file,{encrypt,decrypt}));
 const registry=sources.create(s);
 const journal={now:clock,store:storeOf,sources:registry};
 const publish=item=>{try{if(company===s.companyId&&s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{/* window closing */}};
 // The evening summary: a message with the day's card in the «Дневник» chat of the general project.
 async function evening(){
  const card=await build(s,{mode:'day'},journal);
  const d=s.dialogue;let topic=d.state.topics.find(t=>t.journal&&!t.archived);
  if(!topic){topic={id:require('node:crypto').randomUUID(),projectId:d.state.projects.some(p=>p.id==='general')?'general':(d.state.projects[0]?.id||'general'),title:'Дневник',kind:'chat',journal:true,messages:[],at:clock()};d.state.topics.push(topic);}
  const text='Итоги дня. '+summary(card.totals)+(card.carry.length?' Можно перенести на завтра: '+card.carry.length+'.':'')+' Вопрос дня: '+card.prompt;
  topic.messages.push({role:'assistant',text,at:clock(),by:BY,extensionData:{journalCard:card}});topic.at=clock();topic.unread=(topic.unread||0)+1;d.persist();
  publish({id:'journal-evening',title:'Дневник дня',text:'Итоги дня готовы: '+summary(card.totals).replace(/^Сегодня: /,''),kind:'success',version:'evening:'+card.date,journal:{topicId:topic.id,projectId:topic.projectId}});
  return topic.id;
 }
 function due(now=clock()){
  const time=s.settings.journalEvening;if(!time)return false;
  const [h,m]=time.split(':').map(Number);const d=new Date(now),day=d.getDay();
  if(day===0||day===6)return false;
  const key=ymd(now);if(storeOf().meta('lastEvening')===key)return false;
  const at=new Date(now);at.setHours(h,m,0,0);
  return now>=at.getTime()&&now<at.getTime()+3*3600000?key:false; // not hours late after the computer slept
 }
 async function tick(){const key=due();if(!key)return null;storeOf().meta('lastEvening',key);try{return await evening();}catch(e){console.error('Journal evening:',e.message);publish({id:'journal-evening',title:'Дневник дня',text:'Не удалось собрать итоги дня: '+e.message,kind:'error',version:'error:'+key});return null;}}
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){
  const timer=setInterval(()=>{if(company!==s.companyId){clearInterval(timer);return;}tick().catch(()=>{});},60000);timer.unref?.();
 }
 // Tomorrow's plan in the morning brief (src/features/morning-brief.cjs): the plan saved yesterday for today.
 try{require('../../features/morning-brief.cjs').addPart(ID,(services)=>{
  if(services.settings?.['extension_'+ID]!=='true')return null;
  const own=instances.get(services.companyId);if(!own)return null;
  const key=ymd(own.now()),plan=own.store().peek(key)?.plan||[];if(!plan.length)return null;
  return {by:BY,text:'План на сегодня из дневника:\n'+plan.map(p=>(p.done?'✓ ':'• ')+p.title).join('\n'),data:{journalCard:{mode:'plan',date:ymd(addDays(own.now(),-1)),tomorrow:key,now:own.now(),planned:plan,carry:[],week:[],timeline:[],totals:totals([]),errors:[],sources:[],brief:true}}};
 });}catch{/* no morning brief in this build */}
 journal.evening={tick,due,run:evening};
 instances.set(company,journal);
 const valid=key=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))throw Error('Некорректная дата.');return String(key);};
 const ipc={
  card:(mode,key)=>build(s,{mode:['day','week','plan'].includes(mode)?mode:'day',date:key?Date.parse(valid(key)+'T12:00:00'):undefined},journal),
  // The private part of a day: notes and the reflection, read only by the card on this computer.
  private:key=>{const d=storeOf().peek(valid(key));return {notes:d?.notes||[],reflection:d?.reflection||null,prompt:prompt(key)};},
  note:(key,text)=>storeOf().note(valid(key),text,clock()),
  removeNote:(key,id)=>{storeOf().removeNote(valid(key),String(id));return true;},
  reflect:(key,answer)=>storeOf().reflect(valid(key),prompt(key),answer,clock()),
  carry:(key,items)=>{if(!Array.isArray(items))throw Error('Выберите, что перенести.');return storeOf().plan(ymd(addDays(Date.parse(valid(key)+'T12:00:00'),1)),items);},
  unplan:(key,id)=>storeOf().unplan(valid(key),String(id)),
  check:(key,id,done)=>storeOf().check(valid(key),String(id),!!done),
  evening:time=>{const v=String(time||'');if(v&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error('Время в формате ЧЧ:ММ.');s.saveSettings({journalEvening:v});return v;},
  runEvening:()=>evening()
 };
 return {journal,ipc};
}
module.exports={name:'journal',defaults:{['extension_'+ID]:'false',journalEvening:''},
 validate(next){if(next.journalEvening&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.journalEvening))next.journalEvening='';},
 setup,turn,route,totals,summary,build,instance:company=>company?instances.get(company):[...instances.values()].at(-1)};
