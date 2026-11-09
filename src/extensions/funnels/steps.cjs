// «Воронки»: from a preset («туториал», «онбординг», «от установки до первой покупки») to concrete events of the
// game, chosen by code from the events the source reports (names and how many players sent them). Nothing is
// guessed by a model: when the events do not fit, the user is asked which events are the steps.
// The install step is a pseudo-event `$install` (installations, not an event the game sends) when the source has it.
const INSTALL='$install';
const RE={
 install:/^(?:install|installs|installation|app_install|first_open|first_launch|firstlaunch|first_start|установка)$/i,
 tutorial:/tutor|обуч|ftue/i,
 onboarding:/onboard|ftue|tutor|обуч|first_(?:session|battle|match|level|fight)|registration|sign_?up|регистрац/i,
 level:/^(?:level|lvl|уровень)[_ -]?(?:up[_ -]?)?(?:0?[1-5])$|^(?:level|lvl)_(?:start|complete)_(?:0?[1-3])$/i,
 purchase:/purchase|payment|^iap|_iap|in_app|buy|покуп|оплат|^revenue|ecommerce_purchase/i,
 done:/complete|completed|finish|finished|end|done|завершен/i,
 start:/start|begin|open|shown|начал|старт/i
};
// The order of steps of one flow: «start» first, numbered steps by number, «complete» last, the rest by how many
// players sent them (more players — earlier in the flow).
function ordered(events,pattern){
 const rank=e=>RE.start.test(e.name)&&!/\d/.test(e.name)?0:RE.done.test(e.name)?2:1;
 const number=e=>{const m=e.name.match(/(\d+)(?!.*\d)/);return m?Number(m[1]):null;};
 return events.filter(e=>pattern.test(e.name)&&!RE.purchase.test(e.name)).sort((a,b)=>rank(a)-rank(b)||((number(a)??1e9)-(number(b)??1e9))||(b.users||0)-(a.users||0)||a.name.localeCompare(b.name));
}
const LABEL={[INSTALL]:'Установка'};
const step=(event)=>({event,label:LABEL[event]||event});

// {steps:[{event, label}]} or {missing:'…'} with the candidates the question can offer.
function resolve(kind,events,{install=false,max=8}={}){
 const list=(events||[]).filter(e=>e&&typeof e.name==='string'&&e.name.length<=80);
 const first=install?[step(INSTALL)]:(()=>{const e=list.filter(x=>RE.install.test(x.name)).sort((a,b)=>(b.users||0)-(a.users||0))[0];return e?[step(e.name)]:[];})();
 if(kind==='tutorial'||kind==='onboarding'){
  let flow=ordered(list,kind==='tutorial'?RE.tutorial:RE.onboarding);
  if(kind==='onboarding'&&flow.length<3)flow=[...flow,...ordered(list,RE.level).filter(e=>!flow.includes(e))];
  flow=flow.slice(0,max-first.length);
  if(flow.length<(first.length?1:2))return {missing:kind==='tutorial'?'Не нашёл событий туториала (tutorial…, обучение…).':'Не нашёл событий онбординга (onboarding…, tutorial…, first_…).',candidates:list.slice(0,8).map(e=>e.name)};
  return {steps:[...first,...flow.map(e=>step(e.name))]};
 }
 if(kind==='purchase'){
  const buy=list.filter(e=>RE.purchase.test(e.name)).sort((a,b)=>(/first/i.test(b.name)-/first/i.test(a.name))||(b.users||0)-(a.users||0))[0];
  if(!buy)return {missing:'Не нашёл события покупки (purchase…, payment…, iap…).',candidates:list.slice(0,8).map(e=>e.name)};
  if(!first.length)return {missing:'Нет шага установки: источник не отдаёт установки и события install/first_open нет.',candidates:list.slice(0,8).map(e=>e.name)};
  const tutorial=ordered(list,RE.tutorial).filter(e=>RE.done.test(e.name)).slice(-1);
  return {steps:[...first,...tutorial.map(e=>step(e.name)),step(buy.name)]};
 }
 return {missing:'Не понял, какие шаги взять.',candidates:list.slice(0,8).map(e=>e.name)};
}
// Explicit steps named by the user: the install words become `$install` when the source has installations; names
// are matched to the source's events ignoring case.
function explicit(names,events,{install=false}={}){
 const known=new Map((events||[]).map(e=>[e.name.toLowerCase(),e.name]));
 const out=[],unknown=[];
 for(const n of names){
  if(RE.install.test(n)||/^установк/i.test(n)){if(install){out.push(step(INSTALL));continue;}}
  const hit=known.get(n.toLowerCase());
  if(hit)out.push(step(hit));else if(!events?.length)out.push(step(n));else unknown.push(n);
 }
 return unknown.length?{missing:'Таких событий нет в данных: '+unknown.join(', ')+'.',candidates:(events||[]).slice(0,8).map(e=>e.name)}:{steps:out};
}
const TITLE={tutorial:'Туториал',onboarding:'Онбординг',purchase:'Установка → первая покупка'};
module.exports={INSTALL,RE,ordered,resolve,explicit,TITLE};
