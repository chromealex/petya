// «Идеи для ивентов»: live-ops event ideas, each with its evidence and cost — upcoming holidays of the regions
// (holidays.cjs, computed by code), competitors' recent events (release-note lines «Конкуренты» stored, quoted as
// written), our own past events with their DAU and revenue against the two weeks before (a connected metrics source),
// and the economy from the configs (the cost in currency and how many days of an average player's income it gives
// away). «запланируй ивент …» shows the plan; a task is created only through the cross-app kind `task-tracker` (Jira or
// Asana preview and confirm it), and the event is kept in the project's plan only on a button. The local model, when
// there is one, may only add a one-line pitch without numbers.
const kit=require('../app-kit.cjs');
const H=require('./holidays.cjs');
const I=require('./ideas.cjs');
const query=require('./query.cjs');
const store=require('./store.cjs');
const ID='event-ideas',BY='Идеи для ивентов';
const deps={now:()=>Date.now(),metrics:null,economy:null,competitors:null};
const ask=(spec,resume)=>require('../../input-required.cjs').ask(spec,resume);
const today=()=>new Date(deps.now()).toISOString().slice(0,10);
const ru=d=>{const [y,m,dd]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,dd)).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});};
const NAMES={gold:'золото',coin:'монеты',gem:'кристаллы',crystal:'кристаллы',diamond:'алмазы',soft:'софт-валюта',hard:'хард-валюта'};
const money=(v,res)=>Math.round(v).toLocaleString('ru-RU').replace(/[  ]/g,' ')+' ('+(NAMES[res]||res)+')';

// --- Evidence sources ----------------------------------------------------------------------------------------------------
async function economyOf(s){
 if(deps.economy)return deps.economy;
 let roots=[];try{roots=require('../localization/find.cjs').projectRoots(s);}catch{roots=[];}
 if(!roots.length)return null;
 try{const {economy}=await require('../balance-sim/economy.cjs').read(roots);return economy.sources.length?economy:null;}catch{return null;}
}
// Release notes «Конкуренты» stored for this project, the last 60 days: one row per new text.
function competitorNotes(s){
 if(deps.competitors)return deps.competitors;
 if(s.settings.extension_competitors!=='true')return [];
 try{
  const h=require('../competitors/history.cjs'),st=h.store(s),from=H.shift(today(),-60);
  const out=[];
  for(const item of h.list(st,h.projectOf(s))){let last='';for(const row of h.history(st,item.key)){if(row.notes&&row.notes!==last&&row.day>=from)out.push({name:item.name,store:item.store,day:row.day,notes:row.notes,url:item.url||''});last=row.notes||last;}}
  return out;
 }catch{return [];}
}
function metricsSources(s){
 if(deps.metrics)return deps.metrics;
 try{return require('../metrics/sources.cjs').create(s).ready();}catch{return [];}
}
// DAU and revenue during an event against the 14 days before it (averages per day).
async function uplift(s,ev){
 const src=metricsSources(s)[0];if(!src)return null;
 const from=H.shift(ev.start,-14),to=ev.end;
 const answer=await src.source.fetch(s,{from,to,metrics:['dau','revenue'],platform:null,version:null,app:null});
 const series=require('../metrics/sources.cjs').normalize(src.id,answer);
 const avg=(metric,a,b)=>{const pts=(series.find(x=>x.metric===metric)?.series||[]).filter(p=>p.date>=a&&p.date<=b);return pts.length?pts.reduce((n,p)=>n+p.value,0)/pts.length:null;};
 const ch=m=>{const before=avg(m,from,H.shift(ev.start,-1)),during=avg(m,ev.start,ev.end);return before>0&&during!==null?Math.round((during/before-1)*1000)/1000:null;};
 return {dau:ch('dau'),revenue:ch('revenue'),source:src.name};
}
async function pastEvents(s){
 let rows=[];try{rows=s.dataRoot?store.list(s):[];}catch{rows=[];}
 const past=rows.filter(e=>e.end<today()).slice(0,6);
 const out=[];
 for(const e of past){let u=null;try{u=await uplift(s,e);}catch{u=null;}out.push({...e,uplift:u?{dau:u.dau,revenue:u.revenue}:null,source:u?.source||null});}
 return out;
}
const loopOf=economy=>{const h=economy?.hints||{};return {actionsPerDay:h.actionsPerDay?.value>0?h.actionsPerDay.value:10,winRate:h.winRate?.value>=0?h.winRate.value:0.5};};

// --- Text ------------------------------------------------------------------------------------------------------------------
function costText(c){return c?money(c.total,c.currency)+' на игрока — '+String(c.incomeDays).replace('.',',')+' '+kit.plural(Math.round(c.incomeDays),['день','дня','дней'])+' дохода':'стоимость не посчитана';}
function summary(card){
 if(!card.ideas.length)return 'Не нашёл поводов для ивентов '+periodText(card)+'. Попробуйте другой регион или период.';
 const lines=card.ideas.map((i,n)=>(n+1)+'. '+i.title+' ('+ru(i.start)+' – '+ru(i.end)+'): '+costText(i.cost)+'.');
 return 'Идеи ивентов '+periodText(card)+(card.regions.length?' (регионы: '+card.regions.map(r=>H.REGION_NAMES[r]||r).join(', ')+')':'')+':\n'+lines.join('\n')+
  (card.economy?'':'\nСтоимость в валюте не посчитана: подключите папку проекта с конфигами экономики.')+'\nЧтобы завести задачу, скажите «запланируй ивент 1» или нажмите «Запланировать» в карточке.';
}
const periodText=card=>'с '+ru(card.from)+' по '+ru(card.to);
// Optional pitch lines from the model: words only (a line with digits is dropped — numbers are code's).
async function pitches(s,ideas){
 if(!s.settings.model||!ideas.length)return;
 try{
  const r=await kit.modelJSON(s,{system:'Ниже идеи ивентов для мобильной игры: механика и повод. Для каждой — одна короткая фраза по-русски (до 14 слов), чем ивент зацепит игроков. Без чисел, без дат, без выдумок о фактах.',
   user:{ideas:ideas.map(i=>({id:i.id,mechanic:I.MECHANICS[i.mechanic].name,occasion:i.holidayName||i.title}))},schema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{id:{type:'string'},line:{type:'string'}},required:['id','line']}}},required:['items']},predict:400,temperature:0.3});
  for(const x of r?.items||[]){const i=ideas.find(y=>y.id===x.id);const line=String(x.line||'').replace(/\s+/g,' ').trim();if(i&&line.length>=8&&line.length<=160&&!/\d/.test(line))i.pitch=line;}
 }catch{/* no pitch */}
}

// --- Turns -------------------------------------------------------------------------------------------------------------------
async function ideasCard(s,text,{only=null}={}){
 const t=today();
 const days=query.horizon(text,t),regions=query.regions(text);
 s.requestProgress?.report?.('Собираю поводы для ивентов');
 const economy=await economyOf(s);
 const competitors=competitorNotes(s);
 const past=await pastEvents(s);
 let ideas=I.build({today:t,days:only?370:days,regions,economy,loop:loopOf(economy),competitors,past,limit:only?40:6});
 if(only)ideas=ideas.filter(i=>i.holiday===only).slice(0,1);
 await pitches(s,ideas);
 return {id:require('node:crypto').randomUUID(),mode:'ideas',from:t,to:H.shift(t,days),days,regions,ideas,
  economy:economy?{main:economy.main,files:economy.files?.length||0,loop:loopOf(economy)}:null,
  sources:{competitors:s.settings.extension_competitors==='true'||!!deps.competitors,competitorNotes:competitors.length,metrics:metricsSources(s).map(x=>x.name),past:past.length},
  project:store.project(s).name,at:deps.now()};
}
const lastIdeas=s=>{const ms=s.dialogue?.active?.()?.messages||[];for(let i=ms.length-1;i>=0;i--){const c=ms[i].extensionData?.eventCard;if(c?.mode==='ideas'&&c.ideas.length)return c;}return null;};
function pickIdea(card,text){
 const num=/(?:ивент|иде[юя]|номер|№)\s*(\d{1,2})(?=$|[^\d])/iu.exec(text);if(num)return card.ideas[Number(num[1])-1]||null;
 const q=query.quoted(text)?.toLowerCase();
 if(q){const hit=card.ideas.find(i=>i.title.toLowerCase().includes(q)||(i.holidayName||'').toLowerCase().includes(q));if(hit)return hit;}
 const h=query.named(text);if(h)return card.ideas.find(i=>i.holiday===h)||null;
 return null;
}
async function planTurn(s,text){
 const last=lastIdeas(s);
 let idea=last?pickIdea(last,text):null;
 if(!idea){
  const h=query.named(text)||(query.quoted(text)&&query.named(query.quoted(text)));
  if(h){const card=await ideasCard(s,text,{only:h});idea=card.ideas[0]||null;}
 }
 if(!idea){
  const options=(last?.ideas||[]).slice(0,4).map(i=>'«'+i.title+'»');
  return ask({text:last?'Какой ивент запланировать?':'Какой ивент запланировать? Назовите праздник или попросите идеи: «какой ивент провести в декабре».',label:'Ивент',options,strictChoices:false},
   answer=>planTurn(s,'запланируй ивент '+(/^«/.test(String(answer||''))?String(answer):'«'+String(answer||'').trim()+'»')));
 }
 const card={id:require('node:crypto').randomUUID(),mode:'plan',idea,project:store.project(s).name,at:deps.now(),saved:false};
 const text2='План: «'+idea.title+'», '+ru(idea.start)+' – '+ru(idea.end)+' ('+idea.days+' '+kit.plural(idea.days,['день','дня','дней'])+'). '+I.MECHANICS[idea.mechanic].pitch.replace(/^./,c=>c.toUpperCase())+'. Стоимость: '+costText(idea.cost)+'. Задача создаётся только после подтверждения — кнопкой «Создать задачу» в карточке.';
 return kit.reply(s,text,{by:BY,text:text2,data:{eventCard:card}});
}
async function pastTurn(s,text){
 const name=query.quoted(text);
 const d=query.dates(text,today());
 if(!name)return ask({text:'Как назывался ивент?',label:'Название',placeholder:'Хэллоуин 2025'},answer=>pastTurn(s,text.replace(/ивент\p{L}*/iu,m=>m+' «'+String(answer||'').replace(/[«»"]/g,'').trim()+'»')));
 const [start,end]=d[0]<=d[1]?[d[0],d[1]]:[d[1],d[0]];
 if(end>=today())return kit.reply(s,text,{by:BY,question:true,text:'Ивент «'+name+'» ещё не закончился — метрики «после» считать рано. Запишите его, когда он пройдёт.'});
 const ev={name,start,end,holiday:query.named(text)||query.named(name),mechanic:I.mechanicOf(text)};
 let u=null,error='';try{u=await uplift(s,ev);}catch(e){error=e.message;}
 const card={id:require('node:crypto').randomUUID(),mode:'past',event:ev,uplift:u,error,project:store.project(s).name,saved:false,at:deps.now()};
 const pct=v=>(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v*1000)/10).toLocaleString('ru-RU')+'%';
 const text2='Ивент «'+name+'», '+ru(start)+' – '+ru(end)+': '+(u?[u.dau!==null?'DAU '+pct(u.dau):'',u.revenue!==null?'выручка в день '+pct(u.revenue):''].filter(Boolean).join(', ')+' к двум неделям до ('+u.source+').':error?'метрики не прочитались: '+error+'.':'метрики не подключены — «Метрики игры» с AppMetrica покажут DAU и выручку.')+' Нажмите «Запомнить ивент», чтобы учитывать его в идеях.';
 return kit.reply(s,text,{by:BY,text:text2,data:{eventCard:card}});
}
async function turn(s,command){
 const text=String(command||'');
 const kind=query.about(text);
 if(!kind||!kit.installed(s,ID))return null;
 try{
  if(kind==='plan')return await planTurn(s,text);
  if(kind==='past')return await pastTurn(s,text);
  const only=query.named(text);
  const card=await ideasCard(s,text,{only:null});
  if(only){const hit=card.ideas.filter(i=>i.holiday===only);if(!hit.length){const one=await ideasCard(s,text,{only});card.ideas=one.ideas;}else card.ideas=hit.concat(card.ideas.filter(i=>i.holiday!==only)).slice(0,6);}
  return kit.reply(s,text,{by:BY,text:summary(card),data:{eventCard:card}});
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

// --- Card calls ---------------------------------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.eventCard?.id===id)return {message:m,card:m.extensionData.eventCard};
 return null;
}
// «Сохранить в план» / after «Создать задачу»: the event into the project's list (idempotent per card).
function planned(s,id){
 const hit=findCard(s,String(id||''));if(!hit||hit.card.mode!=='plan')throw Error('Карточка плана не найдена.');
 if(hit.card.saved)return {saved:true,already:true,project:hit.card.project};
 const i=hit.card.idea;const row=store.save(s,{name:i.title,start:i.start,end:i.end,mechanic:i.mechanic,holiday:i.holiday,planned:true});
 hit.card.saved=true;s.dialogue.persist?.();return {saved:true,project:row.project};
}
function remember(s,id){
 const hit=findCard(s,String(id||''));if(!hit||hit.card.mode!=='past')throw Error('Карточка ивента не найдена.');
 if(hit.card.saved)return {saved:true,already:true,project:hit.card.project};
 const row=store.save(s,{...hit.card.event,planned:false});hit.card.saved=true;s.dialogue.persist?.();return {saved:true,project:row.project};
}
function setup(s){return {ipc:{planned:id=>planned(s,id),remember:id=>remember(s,id),events:()=>store.list(s)}};}
// Dashboards: ideas only read (planning and recording wait for buttons).
const dashboard={accepts:text=>query.about(String(text||''))==='ideas',widgets:[{title:'Идеи для ивентов',command:'Какие ивенты провести в ближайшие два месяца?'}]};
module.exports={name:'eventIdeas',dashboard,defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,ideasCard,planned,remember,deps,teardown(){}};
