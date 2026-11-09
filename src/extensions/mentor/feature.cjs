// «Петя-наставник»: on request («что мне автоматизировать?», «что я делаю руками») or once a week (off until the
// user turns it on; default Friday 17:00) Petya looks through his own local chat history for what the user repeats
// by hand and proposes a recurring command, a skill, an extension idea or a catalog app for each pattern.
// Nothing leaves the computer and nothing is created until «Создать» in the card.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const history=require('./history.cjs');
const proposals=require('./proposals.cjs');
const ID='mentor',BY='Петя-наставник',WEEKS=8;

const ANALYZE=[
 /что\s+(?:мне\s+|бы\s+)?(?:стоит\s+|можно\s+|лучше\s+|надо\s+|нужно\s+)?(?:мне\s+)?автоматизир\p{L}*/iu,
 /что\s+я\s+(?:делаю|повторяю|прошу)\s+(?:руками|вручную|каждый\s+раз|постоянно|снова|одно\s+и\s+то\s+же)/iu,
 /что\s+я\s+(?:постоянно|часто|вс[её]\s+время|каждый\s+день|регулярно)\s+(?:повторяю|прошу|делаю\s+руками)/iu,
 /(?:^|[^\p{L}])петя[- ]наставник\p{L}*/iu,/^наставник[,!:]/iu,/(?:разбор|совет\p{L}*|отч[её]т|рекомендаци\p{L}*)\s+наставника/iu,
 /какие\s+(?:у\s+меня\s+)?(?:мои\s+)?(?:просьбы|запросы|действия)\s+(?:повторяются|можно\s+автоматизировать)/iu,
 /(?:найди|покажи)\s+(?:мои\s+)?(?:повторяющиеся|однообразные|рутинные)\s+(?:просьбы|запросы|действия)/iu,
 /где\s+я\s+(?:теряю|трачу\s+зря)\s+время/iu
];
const WEEKLY=/(?:включи|выключи|отключи|останови|настрой|перенеси)\s+(?:еженедельн\p{L}*\s+)?(?:разбор\p{L}*\s+)?(?:пет[юя][- ])?наставник\p{L}*/iu;
const REPEAT=/^создай\s+повтор:\s*(.{5,400})$/iu;
const DAYS={пн:1,пон:1,вт:2,вто:2,ср:3,сре:3,чт:4,чет:4,пт:5,пят:5,сб:6,суб:6,вс:0,вос:0};
const DAY_NAMES=['воскресеньям','понедельникам','вторникам','средам','четвергам','пятницам','субботам'];

// {kind:'analyze'} | {kind:'weekly', on, day?, time?} | {kind:'repeat', phrase} | null
function route(text){
 const t=String(text||'').trim().replace(/^петя[\s,!:—-]+(?!наставник)/iu,'');
 if(!t||t.length>400)return null;
 const repeat=t.match(REPEAT);if(repeat)return {kind:'repeat',phrase:repeat[1].trim()};
 if(WEEKLY.test(t)){
  const on=!/выключи|отключи|останови/iu.test(t);
  const time=t.match(/(?:^|\s)в\s+(\d{1,2})(?:[:.](\d{2}))?(?=\s|$|[,.!])/u);
  const day=t.toLocaleLowerCase('ru').match(/(?:^|[\s,])(?:по\s+)?(пн|вт|ср|чт|пт|сб|вс|пон\p{L}*|вто\p{L}*|сре\p{L}*|чет\p{L}*|пят\p{L}*|суб\p{L}*|вос\p{L}*)(?=$|[\s,.!])/u);
  return {kind:'weekly',on,...time?{time:String(Math.min(23,Number(time[1]))).padStart(2,'0')+':'+(time[2]||'00')}:{},...day?{day:DAYS[day[1].slice(0,3)]??DAYS[day[1].slice(0,2)]}:{}};
 }
 // «что автоматизировать в сборке / в CI» is about that system, not about the user's own habits.
 if(/автоматизир\p{L}*\s+(?:в|на|для)\s+(?!работе|пете|петю|себе|чате)/iu.test(t))return null;
 return ANALYZE.some(re=>re.test(t))?{kind:'analyze'}:null;
}

const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
const list=(s,key)=>{try{const v=store(s).peek(key);return Array.isArray(v)?v:[];}catch{return [];}};
const weekly=settings=>({enabled:settings?.mentorWeekly==='true',day:Number(settings?.mentorDay??5),time:String(settings?.mentorTime||'17:00')});
const skillRoot=s=>s.skillRoot||path.join(require('electron').app.getPath('userData'),'skill-packages');
const draftRoot=s=>path.join(s.dataRoot,'extensions',ID,'drafts');

// Requests a recurring command or a learned phrase already covers are not proposed again.
function knownCheck(s){
 let repeats=[];try{repeats=(s.recurring?.list?.()||[]).map(r=>history.stems(r.command));}catch{repeats=[];}
 return text=>{
  const own=history.stems(text);
  if(repeats.some(r=>{const x=history.similarity(own,r);return x.shared>=2&&x.score>=0.6;}))return true;
  try{return !!s.learning?.preview?.(text)?.matched;}catch{return false;}
 };
}
// A catalog app that is not added yet and that its own offer says fits the request directly.
function appFinder(s){
 const offers=require('../../features/extension-offers.cjs');
 let all=s.extensionOffers?.offers;if(!all)try{all=offers.load();}catch{all=[];}
 return text=>{
  const d=offers.decide(offers.candidates(text,{offers:all,settings:s.settings||{}}).filter(r=>r.direct));
  const o=d?.one?.offer;return o&&o.id!==ID?{id:o.id,name:o.name,pitch:o.pitch}:null;
 };
}
// The mentor's own commands and the commands of other learning features are not «done by hand».
function skipText(text){
 if(route(text))return true;
 try{if(require('../../features/recurring.cjs').matches(text))return true;}catch{/* optional */}
 try{if(require('../../features/skill-packages.cjs').matches(text))return true;}catch{/* optional */}
 return /^(?:да|нет|ок|ok|спасибо|привет|готово|отмена|ага|угу|ладно)[.!?]*$/iu.test(text.trim());
}

function analyzeNow(s,now=Date.now()){
 const found=history.analyze(s.dialogue.state?.topics||[],{now,weeks:WEEKS,skip:skipText});
 const rows=proposals.rank(found.patterns,{appFor:appFinder(s),known:knownCheck(s),hidden:new Set(list(s,'hidden')),created:new Set(list(s,'created'))});
 const totalSaved=Math.round(rows.reduce((a,r)=>a+r.savedWeek,0)*10)/10;
 return {weeks:WEEKS,requests:found.requests,days:found.days,from:found.from,to:found.to,patterns:rows,totalSaved,method:history.METHOD,weekly:weekly(s.settings),at:new Date(now).toISOString()};
}
const TYPE={schedule:'по расписанию',skill:'скилл',extension:'идея расширения',app:'приложение'};
const fmtMin=m=>m>=10?String(Math.round(m)):String(m).replace('.',',');
function summary(card){
 if(!card.patterns.length)return card.requests<10?'Пока мало истории: за '+card.weeks+' недель всего '+card.requests+' '+kit.plural(card.requests,['запрос','запроса','запросов'])+'. Загляну ещё, когда наберётся больше.'
  :'За '+card.weeks+' недель повторяющихся действий не нашёл — всё, что повторялось, уже автоматизировано или скрыто.';
 const top=card.patterns[0];
 return 'За '+card.weeks+' недель нашёл '+card.patterns.length+' '+kit.plural(card.patterns.length,['повторение','повторения','повторений'])+', можно сэкономить около '+fmtMin(card.totalSaved)+' мин в неделю. Больше всего — «'+top.title.slice(0,80)+'»: '+TYPE[top.proposal.type]+', ~'+fmtMin(top.savedWeek)+' мин в неделю. Ничего не создаю без «Создать».';
}

function publish(s,item){try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',item);}catch{/* window closed */}}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
// The weekly review is due: enabled, the chosen weekday, the time passed (within 6 hours), not done today.
function due(s,now=new Date()){
 const w=weekly(s.settings);if(!w.enabled||now.getDay()!==w.day)return false;
 const [h,m]=w.time.split(':').map(Number),at=new Date(now);at.setHours(h,m,0,0);
 let last='';try{last=store(s).peek('weeklyDay')||'';}catch{last='';}
 return now>=at&&now-at<6*3600000&&last!==ymd(now);
}
// Prepares the weekly review in the chat «Петя-наставник» with a notification; quiet when there is nothing.
function weeklyRun(s,now=new Date()){
 store(s).set('weeklyDay',ymd(now));
 const card=analyzeNow(s,now.getTime());
 if(!card.patterns.length)return null;
 const state=s.dialogue.state;
 let topic=state.topics.find(t=>t.mentor&&!t.archived);
 if(!topic){topic={id:randomUUID(),projectId:'general',title:BY,kind:'chat',mentor:true,messages:[],at:Date.now()};state.topics.push(topic);}
 const text=summary(card);
 topic.messages.push({role:'assistant',text,at:Date.now(),by:BY,extensionData:{mentorCard:card}});
 topic.at=Date.now();topic.unread=(topic.unread||0)+1;s.dialogue.persist();
 publish(s,{id:'mentor:weekly',title:BY,text:'Разбор недели готов: можно сэкономить около '+fmtMin(card.totalSaved)+' мин в неделю.',busy:false,kind:'success',version:ymd(now)});
 try{const {Notification}=require('electron');if(Notification?.isSupported?.())new Notification({title:BY,body:text.slice(0,180)}).show();}catch{/* no notifications */}
 return {topic,card};
}

function setup(s){
 const shown=new Map();
 const remember=card=>{for(const p of card.patterns)shown.set(p.key,{...p,company:s.companyId});while(shown.size>200)shown.delete(shown.keys().next().value);};
 const find=key=>{const p=shown.get(String(key||''));if(!p||p.company!==s.companyId)throw Error('Обновите разбор: эта карточка устарела.');return p;};
 const mark=(name,key)=>{const items=list(s,name);if(!items.includes(key))store(s).set(name,[...items,key].slice(-500));};
 let running=false;
 const tick=async(now=new Date())=>{
  if(running||!kit.installed(s,ID)||!due(s,now))return null;running=true;
  try{const r=weeklyRun(s,now);if(r)remember(r.card);return r;}
  catch(e){publish(s,{id:'mentor:weekly',title:BY,text:'Разбор недели не получился: '+e.message,busy:false,kind:'error',version:'error:'+ymd(now)});return null;}
  finally{running=false;}
 };
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>{tick().catch(()=>{});},60000);timer.unref?.();}
 // «Создать»: what it makes depends on the proposal; each runs only from the card button.
 async function create(key){
  const p=find(key),proposal=p.proposal;
  if(proposal.type==='schedule'){mark('created',key);return {ask:'Создай повтор: '+proposal.phrase};}
  if(proposal.type==='app'){
   const offer=s.extensionOffers?.prerequisite?.(proposal.app.id,proposal.example);
   if(!offer)throw Error('Приложение «'+proposal.app.name+'» сейчас нельзя добавить отсюда — найдите его в каталоге.');
   return {offer};
  }
  if(proposal.type==='skill'){
   const installed=require('../../skill-library/installed.cjs');
   const root=skillRoot(s);
   const taken=new Set([...require('../../skill-library/index.cjs').BUILTIN.map(x=>x.name),...(s.instructionSkills?.list?.()||[]).map(x=>x.name),...installed.list(root).map(x=>x.name)]);
   let name=proposal.name;for(let i=2;taken.has(name)&&i<50;i++)name=proposal.name.slice(0,58)+'-'+i;
   const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'petya-mentor-skill-'));
   try{
    fs.writeFileSync(path.join(dir,'SKILL.md'),proposal.skillMd.replace(/^name: .*$/m,'name: '+name));
    const skill=installed.install(root,dir,taken);
    mark('created',key);
    return {text:'Скилл «'+skill.name+'» создан. Посмотреть, поправить или удалить — на странице «Скиллы».'};
   }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  if(proposal.type==='extension'){
   const dir=path.join(draftRoot(s),proposal.manifest.id);
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   const file=path.join(dir,'extension.json');
   fs.writeFileSync(file,proposal.json+'\n',{mode:0o600});
   mark('created',key);
   return {text:'Черновик extension.json сохранён. Это заготовка: код расширения (feature.cjs, карточка) ещё нужно написать.',path:file};
  }
  throw Error('Неизвестное предложение.');
 }
 function hide(key){find(key);mark('hidden',key);return {text:'Скрыл. Это повторение больше не предложу.'};}
 function reveal(file){
  const target=path.resolve(String(file||''));
  if(!target.startsWith(draftRoot(s)+path.sep)||!fs.existsSync(target))throw Error('Черновик не найден.');
  require('electron').shell.showItemInFolder(target);return true;
 }
 return {mentor:{tick,remember,analyze:now=>analyzeNow(s,now)},ipc:{create,hide,reveal,status:()=>weekly(s.settings)}};
}

async function turn(s,command){
 const text=String(command||'');
 const want=route(text);
 if(!want||!kit.installed(s,ID))return null;
 if(want.kind==='repeat'){
  const recurring=require('../../features/recurring.cjs');
  const parsed=recurring.parse(want.phrase);
  if(!parsed||parsed.error||!s.recurring?.turn)return kit.reply(s,command,{by:BY,error:true,text:parsed?.error||'Не понял расписание. Скажите, например: «Проверь почту каждый день в 09:30».'});
  const r=s.recurring.turn(want.phrase);
  // The recurring command records the phrase itself; the chat keeps the user's own words.
  const t=s.dialogue.active(),user=t?.messages?.at(-2);if(user?.role==='user'&&user.text===want.phrase){user.text=command;s.dialogue.persist();}
  return r?{...r,by:BY}:null;
 }
 if(want.kind==='weekly'){
  const patch={mentorWeekly:String(want.on),...want.day!==undefined?{mentorDay:String(want.day)}:{},...want.time?{mentorTime:want.time}:{}};
  s.saveSettings?.(patch);
  const w=weekly({...s.settings,...patch});
  return kit.reply(s,command,{by:BY,text:w.enabled?'Хорошо: по '+DAY_NAMES[w.day]+' в '+w.time+' разберу, что вы повторяете руками, и пришлю итог в чат «'+BY+'». Ничего не создаю без вашего «Создать».':'Еженедельный разбор выключен. Спросить можно в любой момент: «что мне автоматизировать?»'});
 }
 s.requestProgress?.report('Смотрю историю чатов на этом компьютере');
 const card=analyzeNow(s);
 s.mentor?.remember?.(card);
 return kit.reply(s,command,{by:BY,text:summary(card),data:{mentorCard:card}});
}

function validate(next){
 if(next.mentorWeekly!==undefined&&!['true','false'].includes(String(next.mentorWeekly)))throw Error('Еженедельный разбор: включён или выключен.');
 if(next.mentorDay!==undefined&&!/^[0-6]$/.test(String(next.mentorDay)))throw Error('День разбора — от воскресенья (0) до субботы (6).');
 if(next.mentorTime!==undefined&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(next.mentorTime)))throw Error('Время разбора — от 00:00 до 23:59.');
}
module.exports={name:'mentor',defaults:{['extension_'+ID]:'false',mentorWeekly:'false',mentorDay:'5',mentorTime:'17:00'},validate,setup,turn,route,summary,analyzeNow,due,weeklyRun};
