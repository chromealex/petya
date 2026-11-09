// «Симуляция баланса»: «сколько дней до 10 уровня у игрока без доната», «что будет с экономикой, если поднять награду
// за победу на 20%», «симулируй прогрессию по текущим конфигам». The economy (sources, sinks, prices, XP curve) is read
// from the project's configs with «Конфиги и баланс»' readers (economy.cjs); the card shows what was found with files
// and lines and the loop (actions per day, win rate, players, days, spending, how the XP table is read) for the user to
// confirm. Only «Запустить симуляцию» runs the seeded Monte Carlo (sim.cjs, ipc `run` by card id, the economy taken
// from the stored card). Every number in the card and in the answer is computed by code; no model is involved.
// «Взять из метрик» reads actions per day and the win rate from a connected metrics source with player journeys
// (AppMetrica in «Метрики игры»); «Выгрузить в Google Таблицы» goes through `spreadsheet-export`.
const path=require('node:path');
const kit=require('../app-kit.cjs');
const E=require('./economy.cjs');
const sim=require('./sim.cjs');
const query=require('./query.cjs');
const ID='balance-sim',BY='Симуляция баланса';
const deps={now:()=>Date.now(),metrics:null,read:null};

const ask=(spec,resume)=>require('../../input-required.cjs').ask(spec,resume);
const ru=(n,d=0)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:d});
const NAMES={gold:'золото',coin:'монеты',gem:'кристаллы',crystal:'кристаллы',diamond:'алмазы',soft:'софт-валюта',hard:'хард-валюта',xp:'опыт',energy:'энергия',token:'жетоны',ticket:'билеты',key:'ключи',star:'звёзды',silver:'серебро',ruby:'рубины',money:'деньги',cash:'деньги'};
const nameOf=r=>NAMES[r]||r;
const TRIGGER={win:'за победу',loss:'за поражение',action:'за каждый бой',daily:'в день'};

function projectRoots(s){try{return require('../localization/find.cjs').projectRoots(s);}catch{return [];}}
function projectName(s){try{const st=s.dialogue.state,t=s.dialogue.active?.();return st.projects?.find(p=>p.id===(t?.projectId||st.activeProjectId))?.name||'';}catch{return '';}}

// --- Defaults of the loop ---------------------------------------------------------------------------------------------
function defaults(economy){
 const h=economy.hints||{};
 const a=h.actionsPerDay&&h.actionsPerDay.value>0&&h.actionsPerDay.value<=500?h.actionsPerDay:null;
 const w=h.winRate&&h.winRate.value>=0&&h.winRate.value<=1?h.winRate:null;
 return {
  params:{actionsPerDay:a?a.value:10,winRate:w?w.value:0.5,players:1000,days:30,seed:42,spend:true,curveKind:economy.curve?.kind||'cumulative'},
  from:{actionsPerDay:a?{kind:'config',file:a.file,line:a.line,field:a.field}:{kind:'default'},winRate:w?{kind:'config',file:w.file,line:w.line,field:w.field}:{kind:'default'}}
 };
}
// The horizon: long enough for the asked milestone at the expected pace (×2 for the slow players), 14–365 days.
function horizon(economy,params,goals,asked){
 if(asked)return Math.min(365,Math.max(1,asked));
 const inc=sim.expected(economy,params);
 let need=0;
 if(goals.levels.length&&economy.curve&&inc.xp>0){const th=E.levels(economy.curve,params.curveKind);const n=Math.max(...goals.levels);if(th&&n<=th.length)need=Math.max(need,th[n-1]/inc.xp);}
 for(const g of goals.earn)if(inc[g.resource]>0)need=Math.max(need,g.amount/inc[g.resource]);
 return need?Math.min(365,Math.max(14,Math.ceil(need*3))):30;
}
function goalsOf(economy,ask2){
 const th=economy.curve?E.levels(economy.curve):null;const max=th?th.length:0;
 let levels=[];
 if(ask2.level&&max)levels=[ask2.level];
 else if(max)levels=[5,10,20,30,50].filter(n=>n<=max).slice(0,3);
 const earn=[];
 if(ask2.earn){const m=query.meaning(ask2.earn.word);const res=m.resource&&m.resource!=='xp'&&economy.currencies.includes(m.resource)?m.resource:economy.main;if(res&&ask2.earn.amount>0)earn.push({resource:res,amount:ask2.earn.amount});}
 return {levels,earn};
}
const modelOf=(economy,params)=>({sources:economy.sources,sinks:economy.sinks,thresholds:E.levels(economy.curve,params.curveKind)});

// --- Text --------------------------------------------------------------------------------------------------------------
const dayWord=n=>kit.plural(n,['день','дня','дней']);
function milestoneText(m,days){
 const what=m.label==='level'?m.level+' уровня':m.label==='earn'?ru(m.amount)+' ('+nameOf(m.resource)+')':'всех покупок';
 if(m.p50===null)return 'до '+what+' за '+days+' '+dayWord(days)+' доходят '+ru(m.reached*100)+'% игроков';
 return 'до '+what+': медиана '+m.p50+' '+dayWord(m.p50)+' (10% игроков — за '+m.p10+' и быстрее, 10% — '+(m.p90===null?'дольше '+days:'за '+m.p90+' и дольше')+')'+(m.reached<1?', за '+days+' '+dayWord(days)+' доходят '+ru(m.reached*100)+'%':'');
}
function answer(card){
 const r=card.result.base,v=card.result.variant,c=card.change;
 const end=x=>x[x.length-1];
 const main=card.economy.main;
 const parts=[];
 if(!v){
  const goal=r.milestones.find(m=>m.label!=='sinks');
  if(goal)parts.push(milestoneText(goal,r.days)+'.');
  if(r.level)parts.push('На '+r.days+'-й день уровень '+end(r.level).p50+' у медианного игрока (от '+end(r.level).p10+' до '+end(r.level).p90+').');
  if(main&&r.currency[main])parts.push(nameOf(main).replace(/^./,ch=>ch.toUpperCase())+' на руках к '+r.days+'-му дню: медиана '+ru(end(r.currency[main]).p50)+'.');
  return 'Симуляция '+r.players+' '+kit.plural(r.players,['игрока','игроков','игроков'])+' без доната на '+r.days+' '+dayWord(r.days)+': '+parts.join(' ');
 }
 const moved=[],same=[];
 r.milestones.forEach((m,i)=>{const n=v.milestones[i];if(!n)return;
  const what=m.label==='level'?m.level+' уровень':m.label==='earn'?ru(m.amount)+' ('+nameOf(m.resource)+')':'все покупки';
  const at=x=>x.p50===null?'не успевают за '+r.days+' '+dayWord(r.days):'медиана '+x.p50+' '+dayWord(x.p50);
  if(m.p50===n.p50&&m.reached===n.reached)same.push(what);else moved.push(what+': '+at(m)+' → '+at(n));});
 if(main&&r.currency[main]){const a=end(r.currency[main]).p50,b=end(v.currency[main]).p50;moved.unshift(nameOf(main)+' на руках к '+r.days+'-му дню: '+ru(a)+' → '+ru(b)+(a>0&&a!==b?' ('+(b>=a?'+':'−')+ru(Math.abs(b/a-1)*100)+'%)':''));}
 return 'Если '+c.text+' ('+c.labels.join(', ')+'), у '+r.players+' '+kit.plural(r.players,['игрока','игроков','игроков'])+' за '+r.days+' '+dayWord(r.days)+': '+moved.join('; ')+'.'+(same.length?' Без изменений: '+same.join(', ')+'.':'');
}

// --- Turn --------------------------------------------------------------------------------------------------------------
async function simTurn(s,text,kind){
 const roots=projectRoots(s);
 if(!roots.length)return kit.reply(s,text,{by:BY,question:true,text:'Где проект с конфигами экономики? Подключите папку проекта в контексте чата — Петя найдёт награды, цены и кривую опыта в ScriptableObject, JSON и CSV.'});
 s.requestProgress?.report?.('Читаю экономику из конфигов');
 const {economy}=await (deps.read||E.read)(roots);
 if(!economy.sources.length)return kit.reply(s,text,{by:BY,question:true,text:'В конфигах проекта не нашёл наград: полей вроде winReward, lossGold, dailyBonus с валютой или опытом. Где лежат конфиги экономики? Подключите их папку в контексте чата.'});
 const a=query.parse(text);
 let change=null;
 if(kind==='whatif'){
  const c=a.change||query.change(text);
  if(!c||c.missing)throw ask({text:'На сколько изменить «'+(c?.words||'это')+'»?',label:'Изменение',options:['На +20%','На −20%','В 2 раза']},answer2=>simTurn(s,text.replace(/\s*$/,' на '+String(answer2||'').replace(/^на\s+/iu,'').replace(/^\+/,'').replace('−','-')),kind));
  let hit=query.targets(economy,c.words);
  if(!hit.length){
   const options=economy.sources.slice(0,5).map(x=>x.label+' ('+TRIGGER[x.trigger]+')');
   throw ask({text:'Не понял, что изменить: «'+c.words+'». Какое значение из конфигов?',label:'Значение',options,strictChoices:true},answer2=>{
    const pick=economy.sources.find(x=>String(answer2||'').startsWith(x.label));if(!pick)return kit.reply(s,text,{by:BY,question:true,text:'Не нашёл такого значения в конфигах.'});
    return finish(s,text,kind,economy,a,{...c,ids:[pick.id],labels:[pick.label]});});
  }
  change={...c,ids:hit.map(x=>x.id),labels:hit.map(x=>x.label+(x.object?' · '+x.object:''))};
 }
 return finish(s,text,kind,economy,a,change);
}
function finish(s,text,kind,economy,a,change){
 const d=defaults(economy);
 const goals=goalsOf(economy,a);
 const params={...d.params,players:a.players?Math.min(5000,Math.max(10,a.players)):d.params.players};
 // Only what was asked sets the horizon; the default levels are shown within it.
 params.days=horizon(economy,params,{levels:a.level?goals.levels:[],earn:goals.earn},a.days);
 const card={id:require('node:crypto').randomUUID(),state:'confirm',project:projectName(s),question:String(text).slice(0,300),
  economy:{...economy,sinks:economy.sinks.slice(0,120)},params,from:d.from,goals,
  change:change?{text:change.text,words:change.words,op:change.op,value:change.value,ids:change.ids,labels:change.labels}:null,
  paying:a.paying,canCalibrate:metricsSources(s).length>0,at:deps.now()};
 const src=economy.sources.length,sk=economy.sinks.length;
 let lead='Нашёл в конфигах '+src+' '+kit.plural(src,['награду','награды','наград'])+(sk?', '+sk+' '+kit.plural(sk,['цену','цены','цен']):'')+(economy.curve?' и кривую опыта на '+economy.curve.levels+' '+kit.plural(economy.curve.levels,['уровень','уровня','уровней']):', кривой опыта нет')+'.';
 if(change)lead+=' Изменение: '+change.labels.join(', ')+' '+(change.op==='set'?'= '+ru(change.value,2):'× '+ru(change.value,2))+'.';
 if(a.paying)lead+=' Покупки за деньги симуляция не моделирует — только бесплатный игрок.';
 const text2=lead+' Проверьте модель цикла — '+ru(params.actionsPerDay,1)+' '+kit.plural(Math.round(params.actionsPerDay),['действие','действия','действий'])+' в день, побед '+ru(params.winRate*100)+'% — и нажмите «Запустить симуляцию».';
 return kit.reply(s,text,{by:BY,text:text2,data:{simCard:card}});
}
async function turn(s,command){
 const text=String(command||'');
 const kind=query.about(text);
 if(!kind||!kit.installed(s,ID))return null;
 try{return await simTurn(s,text,kind);}
 catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

// --- Card calls ----------------------------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.simCard?.id===id)return {topic,message:m,card:m.extensionData.simCard};
 return null;
}
function cleanParams(p,base){
 const n=(v,lo,hi,d)=>{const x=Number(v);return Number.isFinite(x)?Math.min(hi,Math.max(lo,x)):d;};
 return {actionsPerDay:Math.round(n(p?.actionsPerDay,0,500,base.actionsPerDay)*10)/10,winRate:Math.round(n(p?.winRate,0,1,base.winRate)*1000)/1000,
  players:Math.round(n(p?.players,10,5000,base.players)),days:Math.round(n(p?.days,1,365,base.days)),seed:Math.round(n(p?.seed,1,2**31-1,base.seed)),
  spend:p?.spend===undefined?base.spend:!!p.spend,curveKind:p?.curveKind==='per-level'||p?.curveKind==='cumulative'?p.curveKind:base.curveKind};
}
// «Запустить симуляцию»: the economy comes from the stored card, the loop from the page (checked and clamped).
// The run itself goes to a worker thread so the window stays responsive; one run per card at a time.
const running=new Set();
function simulate(model,params,goals,change){
 return new Promise((resolve,reject)=>{
  const {Worker}=require('node:worker_threads');
  const w=new Worker(path.join(__dirname,'sim-worker.cjs'),{workerData:{model,params,goals,change}});
  w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('Симуляция прервалась.'));});
 });
}
async function run(s,id,params){
 const hit=findCard(s,String(id||''));
 if(!hit)throw Error('Карточка симуляции не найдена. Повторите вопрос в чате.');
 if(running.has(hit.card.id))throw Error('Симуляция уже считается.');
 const {card}=hit;
 const p=cleanParams(params,card.params);
 const model=modelOf(card.economy,p);
 running.add(card.id);
 let result;try{result=await simulate(model,p,card.goals,card.change?{ids:card.change.ids,op:card.change.op,value:card.change.value}:null);}finally{running.delete(card.id);}
 const next={...card,state:'done',params:p,result,ranAt:deps.now()};
 hit.message.extensionData={...hit.message.extensionData,simCard:next};
 hit.message.text=answer(next);
 s.dialogue.persist?.();
 return next;
}

// «Взять из метрик»: actions per day and the win rate from the player journeys of a metrics source (last 7 days).
const ACTION_EVENT=/^(?:battle|match|fight|round|game|level|stage|mission|run)[_ .-]?(?:end|ended|finish|finished|complete|completed|result|over|done)$|^(?:battle|match|fight)$/i;
const WIN_EVENT=/(?:^|[_ .-])(?:win|won|victory)(?:$|[_ .-])/i,LOSE_EVENT=/(?:^|[_ .-])(?:lose|lost|loss|defeat|fail|failed)(?:$|[_ .-])/i;
function metricsSources(s){
 if(deps.metrics)return deps.metrics;
 try{return require('../metrics/sources.cjs').create(s).ready().filter(x=>typeof x.source.events==='function'&&typeof x.source.journeys==='function');}catch{return [];}
}
async function calibrate(s,id){
 const hit=findCard(s,String(id||''));if(!hit)throw Error('Карточка симуляции не найдена.');
 const src=metricsSources(s)[0];
 if(!src)throw Error('Нет источника метрик с событиями игроков. Подключите AppMetrica в «Метриках игры».');
 const day=t=>new Date(t).toISOString().slice(0,10);
 const now=deps.now(),to=day(now-86400000),from=day(now-7*86400000);
 const names=(await src.source.events(s,{from,to,app:null,platform:null})||[]).map(e=>String(e.name||'')).filter(Boolean);
 const wins=names.filter(n=>WIN_EVENT.test(n)),losses=names.filter(n=>LOSE_EVENT.test(n)&&!WIN_EVENT.test(n)),actions=names.filter(n=>ACTION_EVENT.test(n));
 if(!actions.length&&!(wins.length&&losses.length))throw Error('В событиях '+src.name+' не нашёл боёв: нужны события вроде battle_end или battle_win и battle_lose.');
 const wanted=[...new Set([...actions,...wins,...losses])].slice(0,6);
 const j=await src.source.journeys(s,{from,to,app:null,platform:null,events:wanted,install:false});
 const perDay=new Map();let w=0,l=0;
 for(const p of j?.journeys||[]){
  const count=list=>{for(const e of list)for(const t of p.times?.[e]||[]){const k=p.user+'|'+day(t);perDay.set(k,(perDay.get(k)||0)+1);}};
  count(actions.length?actions:[...wins,...losses]);
  for(const e of wins)w+=(p.times?.[e]||[]).length;
  for(const e of losses)l+=(p.times?.[e]||[]).length;
 }
 if(!perDay.size)throw Error('За неделю в '+src.name+' нет боёв игроков.');
 const values=[...perDay.values()];
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 const out={actionsPerDay:Math.round(mean*10)/10,winRate:w+l>=20?Math.round(w/(w+l)*1000)/1000:null,
  source:src.name,events:wanted,playerDays:perDay.size,players:new Set([...perDay.keys()].map(k=>k.split('|')[0])).size,battles:values.reduce((a,b)=>a+b,0),from,to,truncated:!!j?.truncated};
 hit.card.calibration=out;s.dialogue.persist?.();
 return out;
}
function setup(s){return {ipc:{run:(id,params)=>run(s,id,params),calibrate:id=>calibrate(s,id)}};}
module.exports={name:'balanceSim',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,run,calibrate,answer,horizon,deps,teardown(){}};
