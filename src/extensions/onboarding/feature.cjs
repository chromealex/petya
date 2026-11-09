// «Онбординг новичка»: a plan for a newcomer's first two weeks («подготовь онбординг для Ани, она бэкенд»). Every item
// has a source (sources.cjs): documents to read from «Поиск по всему» and the semantic index, people to meet from «Кто
// знает» and «Команда» (moved past their absences), starter tasks from Jira's «good first issue» labels and accesses
// from the checklist the user keeps in settings. The plan is a card until «Начать онбординг»; then it is stored on
// this computer (encrypted when possible) and its progress is ticked per day on the card. The welcome message is a
// draft the user edits; it goes through the outgoing review and is sent only by a messenger app's own confirmed flow
// (`share-message`). Nothing about the newcomer goes into another app's prompt; the local model is not used.
// Neighbours: a tutorial or onboarding of players («воронка онбординга», «онбординг в игре») is «Воронки» or nobody;
// finding a page about onboarding in Notion is the knowledge search.
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const text=require('../../people/text.cjs');
const src=require('./sources.cjs');
const storage=require('./store.cjs');
const ID='onboarding',BY='Онбординг новичка';
const deps={now:()=>Date.now(),crypt:undefined,searchAll:null,whoKnows:null};

// --- Routing ---------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/ё/g,'е').trim();
const ONB='(?:онбординг\\p{L}*|onboarding|адаптаци\\p{L}*\\s+(?:для\\s+)?(?:новичк\\p{L}*|нов\\p{L}+\\s+сотрудник\\p{L}*|нов\\p{L}+\\s+(?:коллег|разработчик|бэкендер|человек)\\p{L}*|\\p{Lu}\\p{L}+))';
const AVOID=/(?:^|[^\p{L}])(?:игр\p{L}*|игрок\p{L}*|туториал\p{L}*|tutorial|воронк\p{L}*|ftue|notion|ноушн\p{L}*|confluence|конфлюенс\p{L}*|страниц\p{L}*|найди|поищи|что\s+такое|экран\p{L}*|приложени\p{L}*\s+для\s+пользовател|пользовател\p{L}*|клиент\p{L}*\s+(?:в|на)\s+сервис|ux|юзер\p{L}*)(?=$|[^\p{L}])/iu;
const CREATE=new RegExp('(?:подготов|состав|сдела|собер|наброс|постро|спланиру|распиш|продума|нуж[еня]\\p{L}*|давай)\\p{L}*\\s+(?:мне\\s+|нам\\s+)?(?:план\\s+)?(?:\\p{L}+\\s+)?'+ONB+'|план\\p{L}*\\s+'+ONB+'|'+ONB+'\\s+(?:для\\s+)?(?:новичк|нового\\s+сотрудник|новой\\s+сотрудниц)\\p{L}*|к\\s+нам\\s+(?:выходит|приходит|придет|выйдет)\\s+.{2,80}?(?:онбординг|план\\s+адаптации)','iu');
const SHOW=new RegExp('^(?:а\\s+)?(?:как\\s+(?:идет|проходит|продвигается|дела\\s+с|там)|покажи|прогресс|статус|что\\s+с)\\s+(?:мне\\s+)?(?:по\\s+)?(?:\\p{L}+\\s+)?'+ONB+'(?:\\s+.{0,60})?$|^(?:мои\\s+|наши\\s+|все\\s+)?(?:планы\\s+)?'+ONB+'\\s+(?:новичков|сотрудников)\\s*$','iu');
// {type:'create'|'show', name, role} | null
function route(command){
 const t=clean(command).replace(/[?!.]+$/u,'');
 if(!t||t.length>300||/^\/|(?:^|\s)скилл/iu.test(t)||AVOID.test(t))return null;
 const name=(/(?:^|\s)(?:для|у)\s+(\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?)/u.exec(t)||/(?:выходит|приходит|придет|выйдет)\s+(\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?)/u.exec(t)||new RegExp(ONB+'\\s+(\\p{Lu}[\\p{L}-]+(?:\\s+\\p{Lu}[\\p{L}-]+)?)','u').exec(t))?.slice(-1)[0]||'';
 const roleText=/(?:^|[\s,(])(?:он|она|роль|позици\p{L}*|должност\p{L}*)(?=[\s:—-])\s*[:—-]?\s*(?:у\s+нас\s+)?(?:будет\s+)?(\p{L}[\p{L}\s-]{1,40}?)(?=$|[,.;)]|\s+(?:с|со|в|на|и)\s)/iu.exec(t)?.[1]||'';
 const known=src.ROLES.find(r=>r.re.test(t.replace(name,' ')));
 const role=known?.id||(roleText&&!/^(?:нов\p{L}*|наш\p{L}*|выход\p{L}*|придет|приходит)$/iu.test(roleText)?roleText.trim():'');
 if(SHOW.test(t))return {type:'show',name,role:''};
 if(CREATE.test(t))return {type:'create',name,role};
 return null;
}

// --- Names ----------------------------------------------------------------------------------------------------------
// «для Ани» names the newcomer in the genitive. A guess of the nominative is only offered in a question, never used
// silently: «Аня» and «Ани» are both choices, and the user may type the name.
function nominative(word){
 const [first,...rest]=String(word||'').trim().split(/\s+/);
 const one=w=>{
  if(/[жшчщкгх]и$/u.test(w))return w.slice(0,-1)+'а';
  if(/[^аеёиоуыэюя]и$/u.test(w))return w.slice(0,-1)+'я';
  if(/[^аеёиоуыэюя]ы$/u.test(w))return w.slice(0,-1)+'а';
  if(/ея$/u.test(w))return w.slice(0,-1)+'й';
  if(/[рл]я$/u.test(w))return w.slice(0,-1)+'ь';
  if(/[бвгдзклмнпрстфхц]а$/u.test(w))return w.slice(0,-1);
  return w;
 };
 const last=w=>/ой$/u.test(w)?w.slice(0,-2)+'а':/(?:ов|ев|ин)а$/u.test(w)?w.slice(0,-1):w;
 return [one(first||''),...rest.map(last)].join(' ').trim();
}

// --- Store and drafts -------------------------------------------------------------------------------------------------
const stores=new Map();
function storeFor(s){
 const dir=s.dataRoot?path.join(s.dataRoot,'onboarding'):'';
 if(!stores.has(dir))stores.set(dir,storage.create({dir,crypt:deps.crypt===undefined?storage.keychain():deps.crypt}));
 return stores.get(dir);
}
const drafts=new Map();
const DRAFT_TTL=6*60*60000;
const DAYS=10;
const plans=s=>storeFor(s).load().plans||[];
const today=()=>src.ymd(deps.now());
// Progress of a stored plan for the card and the reply.
function view(plan){
 const days=src.workdays(plan.start,DAYS),now=today();
 const day=now<days[0]?0:days.filter(d=>d<=now).length;
 return {mode:'plan',planId:plan.id,name:plan.name,role:plan.role,start:plan.start,days,today:now,day,items:plan.items,welcome:plan.welcome||'',at:plan.at};
}
const progress=items=>({done:items.filter(i=>i.done).length,total:items.length});

// --- Turns ------------------------------------------------------------------------------------------------------------
async function build(s,command,{name,role}){
 const r=src.role(role);
 const start=src.nextWorkday(deps.now()),days=src.workdays(start,DAYS);
 s.requestProgress?.report?.('Ищу вводные документы и людей: '+r.id);
 const [d,p,t]=await Promise.all([
  src.docs(s,r,{deps}).catch(e=>({items:[],gaps:['Документы: '+e.message]})),
  src.people(s,r,{newcomer:name,from:days[0],to:days.at(-1),deps}).catch(e=>({items:[],gaps:['Люди: '+e.message]})),
  src.tasks(s,r).catch(e=>({items:[],gaps:['Задачи: '+e.message]}))]);
 const a=src.accesses(s,r);
 const items=src.schedule({docs:d.items,people:p.items,tasks:t.items,accesses:a.items},days);
 const gaps=[...a.gaps,...d.gaps,...p.gaps,...t.gaps].slice(0,8);
 const draftId=randomUUID();
 const card={mode:'draft',draftId,name,role:r.id,start,days,today:today(),items:items.map(i=>({...i,done:false})),gaps,welcome:src.welcome({name,role:r.id,items}),...t.link?{tasksLink:t.link}:{}};
 drafts.set(draftId,{company:s.companyId||'',name,role:r.id,items:card.items,welcome:card.welcome,at:Date.now()});
 for(const [k,v] of drafts)if(Date.now()-v.at>DRAFT_TTL)drafts.delete(k);
 const count=k=>items.filter(i=>i.kind===k).length;
 const parts=[count('doc')&&'документов: '+count('doc'),count('person')&&'знакомств: '+count('person'),count('task')&&'стартовых задач: '+count('task'),count('access')&&'доступов: '+count('access')].filter(Boolean);
 const reply='Онбординг · '+name+' ('+r.id+'): план на две недели — '+(parts.join(', ')||'пунктов нет')+'.'+(gaps.length?' Пробелов: '+gaps.length+' — они на карточке.':'')+' План сохранится только после «Начать онбординг».';
 return kit.reply(s,command,{by:BY,text:reply,data:{onboardingCard:card}});
}
function createTurn(s,command,{name,role}){
 // The newcomer: a member of «Команда» by any case of the name, else confirmed by the user.
 const withRole=n=>{
  if(role)return build(s,command,{name:n,role});
  const team=[...new Set((s.people?.members?.()||[]).map(m=>String(m.role||'').trim()).filter(Boolean))];
  const options=[...new Set([...src.ROLES.slice(0,6).map(r=>r.id),...team])].slice(0,10);
  return ask({text:'Какая роль у новичка ('+n+')? По ней подберу документы, людей и задачи.',label:'Роль',options},answer=>{const v=String(answer||'').trim();return v.length>=2?build(s,command,{name:n,role:v.slice(0,40)}):kit.reply(s,command,{by:BY,question:true,text:'Роль не названа — план не составлен.'});});
 };
 if(!name)return ask({text:'Как зовут новичка?',label:'Имя',placeholder:'Аня Смирнова'},answer=>{const v=String(answer||'').trim();return /^\p{L}[\p{L}\s-]{1,60}$/u.test(v)?withRole(v):kit.reply(s,command,{by:BY,question:true,text:'Имя не названо — план не составлен.'});});
 // A colleague only when the first name matches too: «Ани Смирновой» is not «Олег Смирнов».
 const found=s.people?.find?.(name);
 if(found?.member&&text.member(name.split(/\s+/)[0],[found.member]))return withRole(found.member.name);
 const guess=nominative(name);
 if(guess===name)return withRole(name);
 return ask({text:'Как записать имя новичка?',label:'Имя',options:[guess,name]},answer=>{const v=String(answer||'').trim();return /^\p{L}[\p{L}\s-]{1,60}$/u.test(v)?withRole(v):kit.reply(s,command,{by:BY,question:true,text:'Имя не названо — план не составлен.'});});
}
function showTurn(s,command,{name}){
 const list=plans(s);
 if(!list.length)return kit.reply(s,command,{by:BY,question:true,text:'Сохранённых планов онбординга нет. Скажите, например: «подготовь онбординг для Ани, она бэкенд».'});
 const names=list.map(p=>({name:p.name}));
 const one=name?text.member(name,names)||text.member(nominative(name),names)||list.find(p=>p.name===name):null;
 const plan=one?list.find(p=>p.name===one.name):list.length===1?list[0]:null;
 if(name&&!plan)return kit.reply(s,command,{by:BY,question:true,text:'Плана онбординга для «'+name+'» нет. Есть: '+list.map(p=>p.name).join(', ')+'.'});
 if(plan){
  const v=view(plan),pr=progress(plan.items),late=plan.items.filter(i=>!i.done&&i.day<=v.day).length;
  return kit.reply(s,command,{by:BY,text:'Онбординг · '+plan.name+': '+(v.day?'день '+Math.min(v.day,DAYS)+' из '+DAYS:'начнётся '+new Date(plan.start+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))+', сделано '+pr.done+' из '+pr.total+(late?', ждут отметки: '+late:'')+'.',data:{onboardingCard:v}});
 }
 const rows=list.map(p=>{const v=view(p);return {planId:p.id,name:p.name,role:p.role,start:p.start,day:v.day,...progress(p.items)};});
 return kit.reply(s,command,{by:BY,text:'Онбординги: '+rows.map(r=>r.name+' — '+r.done+' из '+r.total).join('; ')+'.',data:{onboardingCard:{mode:'list',today:today(),plans:rows}}});
}

async function turn(s,command){
 const r=route(command);
 if(!r||!kit.installed(s,ID))return null;
 try{
  if(r.type==='show')return showTurn(s,command,r);
  return await createTurn(s,command,r);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

// --- IPC: the only writes ------------------------------------------------------------------------------------------
function setup(s){
 const need=()=>{if(!kit.installed(s,ID))throw Error('Приложение «Онбординг новичка» не добавлено.');};
 const id=v=>{if(typeof v!=='string'||!/^[\w-]{1,80}$/.test(v))throw Error('Некорректная запись.');return v;};
 const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&src.ymd(new Date(v+'T12:00:00'))===v;
 const st=()=>storeFor(s);
 return {ipc:{
  // «Начать онбординг»: the plan as the user left it (unchecked items dropped, the first day chosen).
  save(draftId,{start,skip=[],welcome}={}){
   need();id(draftId);
   const saved=plans(s).find(p=>p.draft===draftId);if(saved)return {ok:true,planId:saved.id,text:'Уже сохранено'};
   const d=drafts.get(draftId);
   if(!d||d.company!==(s.companyId||'')||Date.now()-d.at>DRAFT_TTL)throw Error('Карточка устарела — повторите запрос в чате.');
   if(start!==undefined&&!day(start))throw Error('Некорректная дата первого дня.');
   const drop=new Set(Array.isArray(skip)?skip.map(String):[]);
   const items=d.items.filter(i=>!drop.has(i.id)).map(i=>({...i,done:false,doneAt:0}));
   if(!items.length)throw Error('В плане не осталось пунктов.');
   const plan={id:randomUUID(),name:d.name,role:d.role,start:start||src.nextWorkday(deps.now()),items,welcome:String(welcome??d.welcome).slice(0,2000),draft:draftId,at:deps.now()};
   st().update(data=>{data.plans=[...(data.plans||[]).filter(p=>p.name!==plan.name),plan].slice(-30);});
   drafts.delete(draftId);
   return {ok:true,planId:plan.id,plan:view(plan),text:'План онбординга сохранён: пунктов — '+items.length};
  },
  state(draftId){id(draftId);return plans(s).some(p=>p.draft===draftId)?'saved':drafts.has(draftId)?'pending':'expired';},
  check(planId,itemId,done){
   need();id(planId);id(itemId);
   return st().update(data=>{
    const plan=(data.plans||[]).find(p=>p.id===planId);if(!plan)throw Error('Этого плана уже нет.');
    const item=plan.items.find(i=>i.id===itemId);if(!item)throw Error('Этого пункта уже нет.');
    item.done=done!==false;item.doneAt=item.done?deps.now():0;
    const pr=progress(plan.items);return {ok:true,done:item.done,count:pr.done,total:pr.total};
   });
  },
  welcome(planId,value){need();id(planId);return st().update(data=>{const plan=(data.plans||[]).find(p=>p.id===planId);if(!plan)throw Error('Этого плана уже нет.');plan.welcome=String(value||'').slice(0,2000);return {ok:true};});},
  // The red trash on a plan card; «Отменить» puts it back.
  remove(planId){need();id(planId);return st().update(data=>{const plan=(data.plans||[]).find(p=>p.id===planId);if(!plan)throw Error('Этого плана уже нет.');data.plans=data.plans.filter(p=>p!==plan);return {ok:true,plan};});},
  restore(plan){
   need();if(!plan||typeof plan!=='object'||!Array.isArray(plan.items)||!day(plan.start))throw Error('Нечего вернуть.');id(plan.id);
   return st().update(data=>{if(!(data.plans||[]).some(p=>p.id===plan.id))data.plans=[...(data.plans||[]),{id:plan.id,name:String(plan.name).slice(0,80),role:String(plan.role||'').slice(0,40),start:plan.start,items:plan.items.slice(0,80),welcome:String(plan.welcome||'').slice(0,2000),draft:String(plan.draft||'').slice(0,80),at:Number(plan.at)||deps.now()}];return {ok:true};});
  },
  status(){const list=plans(s);return {plans:list.length,items:list.reduce((n,p)=>n+p.items.length,0),encrypted:st().encrypted()};},
  wipe(){st().wipe();drafts.clear();return {ok:true,plans:0};}
 }};
}
module.exports={name:'onboarding',defaults:{['extension_'+ID]:'false',onboardingAccesses:'',onboardingLabels:''},
 validate(next){if(next.onboardingAccesses!==undefined&&String(next.onboardingAccesses).length>8000)throw Error('Чек-лист доступов слишком длинный.');if(next.onboardingLabels!==undefined&&String(next.onboardingLabels).length>400)throw Error('Слишком длинный список меток.');},
 setup,turn,route,nominative,drafts,deps,teardown(){drafts.clear();stores.clear();}};
