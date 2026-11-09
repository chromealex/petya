// «Аномалии»: a watcher over the apps' data sources — game metrics, crashes, player support, ad revenue and store
// ratings (feeds.cjs). Each day's value is compared with the same weekday of the four weeks before (median / MAD,
// minimum effect and volume, stats.cjs), duplicates are folded and the rest ranked by impact (engine.cjs).
// Daily at the set time (default 09:00, only while a source is connected) it checks yesterday and, when something is
// unusual, puts the card into its own chat with one notification «Вчера установки из Бразилии −40%» that opens it;
// the morning brief gets the same as a part (brief.cjs, morning-brief `addPart`). On request: «что необычного вчера», «есть аномалии за
// неделю?». Missing data is said as missing, never reported as an anomaly. Nothing is written to any service.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const feeds=require('./feeds.cjs');
const engine=require('./engine.cjs');
const {shift}=require('./stats.cjs');
const ID='anomalies',BY='Аномалии';
const SOURCE_APPS={metrics:['appmetrica','grafana'],crashes:['sentry','crashlytics','google-play'],support:['support'],ads:['ad-revenue'],reviews:['store-reviews']};
const KIND_NAMES={metrics:'метрики игры',crashes:'крэши',support:'поддержка',ads:'реклама',reviews:'отзывы в сторах'};

// --- Routing ------------------------------------------------------------------------------------------------------
const ANOMALY=/аномал\p{L}*|(?:^|[^\p{L}])anomal\p{L}*/iu;
const UNUSUAL=/необычн\p{L}*|странн\p{L}*|подозрительн\p{L}*/iu;
const WHEN=/вчера|позавчера|сегодня|за\s+(?:эту\s+|прошл\p{L}*\s+|последн\p{L}*\s+)?(?:недел\p{L}*|сутки|\d+\s+дн\p{L}*|7\s+дней)|в\s+(?:метрик|данных|цифрах|показател)\p{L}*|по\s+(?:метрик|данным|цифрам|показател)\p{L}*/iu;
// Ad revenue questions with «аномалии» are the ad app's own anomaly view; weather, people and gifts are not data.
const NOT=/аномальн\p{L}*\s+(?:жар|холод|погод|мороз|снег|дожд|зим|лет|тепл)|необычн\p{L}*\s+(?:подар|иде|имя|имен|назван|мест|рецепт|фильм|книг|игр\p{L}*\s+для)|странн\p{L}*\s+(?:сон|звук|человек|запах)/iu;
function intent(text){
 const t=String(text||'').trim();
 if(!t||NOT.test(t))return null;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить|работает))/iu.test(t))return null;
 try{if(require('../ad-revenue/query.cjs').about(t))return null;}catch{/* no ad app */}
 if(!(ANOMALY.test(t)||UNUSUAL.test(t)&&WHEN.test(t)||/что\s+(?:пошло\s+не\s+так|случилось|сломалось)\s+вчера\s+(?:в|по)\s+(?:метрик|данн|цифр)/iu.test(t)))return null;
 return {days:/недел\p{L}*|7\s+дней|семь\s+дней/iu.test(t)?7:1};
}

// --- Settings -----------------------------------------------------------------------------------------------------
function mutes(settings){try{const v=JSON.parse(settings.anomaliesMuted||'[]');return Array.isArray(v)?v.filter(r=>r&&typeof r.key==='string'):[];}catch{return [];}}
const pad=v=>String(v).padStart(2,'0');
const localDay=(now,shiftDays=0)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+shiftDays);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};

// --- Checking ------------------------------------------------------------------------------------------------------
// Yesterday (or the last 7 days) of every connected source. Cached per day and settings for an hour, so the daily
// check, its card, the morning brief and a question right after it read the services once.
const cache=new Map();
async function check(s,{days=1,now=new Date(),readers}={}){
 const yesterday=localDay(now,-1),list=Array.from({length:days},(_,i)=>shift(yesterday,-(days-1-i)));
 const sensitivity=['low','normal','high'].includes(s.settings.anomaliesSensitivity)?s.settings.anomaliesSensitivity:'normal';
 const kinds=readers?Object.keys(readers):feeds.connected(s);
 const key=[s.companyId||'',yesterday,days,sensitivity,kinds.join(',')].join('|');
 const hit=cache.get(key);
 let data;
 if(hit&&now.getTime()-hit.at<3600000&&!readers)data=hit.data;
 else{
  s.requestProgress?.report?.('Читаю данные: '+kinds.map(k=>KIND_NAMES[k]).join(', '));
  data=await feeds.read(s,{from:shift(list[0],-35),to:yesterday,now,kinds,...readers?{readers}:{}});
  if(!readers){cache.set(key,{at:now.getTime(),data});while(cache.size>8)cache.delete(cache.keys().next().value);}
 }
 const r=engine.detect(data.series,{days:list,yesterday,sensitivity,mutes:mutes(s.settings)});
 const sources=[...new Map(data.series.map(x=>[x.kind+':'+x.source,{kind:x.kind,id:x.source,name:x.sourceName}])).values()];
 return {mode:days>1?'week':'day',day:yesterday,from:list[0],to:yesterday,items:r.items.slice(0,30),more:Math.max(0,r.items.length-30),hidden:r.hidden,
  notes:[...data.notes.map(n=>({...n,text:String(n.text||'').slice(0,300)})),...r.notes].slice(0,12),sources,kinds:data.kinds,sensitivity,at:now.toISOString()};
}
function summary(card){
 const when=card.mode==='week'?'За неделю':'Вчера';
 const errors=card.notes.filter(n=>n.error),missing=card.notes.filter(n=>n.missing);
 if(!card.sources.length)return 'Не удалось прочитать ни один источник: '+(errors.map(n=>n.text).join(' ')||'данных нет')+'.';
 let text;
 if(!card.items.length)text=when+' всё в пределах обычного ('+card.sources.map(x=>x.name).join(', ')+').';
 else text=(card.mode==='week'?'За неделю ':'')+'Нашёл '+card.items.length+' '+kit.plural(card.items.length,['аномалию','аномалии','аномалий'])+': '+card.items.slice(0,3).map(x=>x.headline.replace(/^Вчера /,'')+' ('+x.delta+')').join('; ')+(card.items.length>3?' и ещё '+(card.items.length-3):'')+'.';
 if(missing.length)text+=' Нет данных: '+[...new Set(missing.map(n=>n.sourceName))].join(', ')+' — это не аномалия, источник ещё не прислал их.';
 if(errors.length)text+=' Не прочитал: '+errors.map(n=>n.sourceName).join(', ')+'.';
 if(card.hidden)text+=' Скрыто правилами: '+card.hidden+'.';
 return text;
}
// No connected source: the shared offer card lists the apps that would bring data.
function connectQuestion(s,command){
 const text='Аномалии пока не из чего искать: подключите источник данных — метрики игры (AppMetrica, Grafana), крэши (Sentry, Crashlytics, Google Play), поддержку (Zendesk), рекламу (AppLovin MAX, LevelPlay) или отзывы в сторах. Какой подключить?';
 const offered=s.extensionOffers?.propose?.(command,['appmetrica','grafana','sentry','crashlytics','support','ad-revenue','store-reviews'],text,BY);
 return offered||kit.reply(s,command,{by:BY,question:true,text});
}

async function turn(s,command,{now,readers}={}){
 const text=String(command||''),want=intent(text);
 if(!want||!kit.installed(s,ID))return null;
 if(!feeds.connected(s).length&&!readers)return connectQuestion(s,text);
 try{
  const card=await check(s,{days:want.days,now:now||new Date(),readers});
  return kit.reply(s,text,{by:BY,text:summary(card),data:{anomalies:card}});
 }catch(e){if(e?.name==='AbortError'||e?.name==='InputRequired')throw e;return kit.failure(s,text,BY,e);}
}

// --- Daily check ------------------------------------------------------------------------------------------------------
// Due once a day at the set time (within 3 hours, like the morning brief), only with a connected source.
function due(s,now=new Date(),kinds=null){
 const time=String(s.settings.anomaliesDaily||'');if(!/^\d{2}:\d{2}$/.test(time)||!kit.installed(s,ID))return false;
 const today=localDay(now),[h,m]=time.split(':').map(Number),at=new Date(now);at.setHours(h,m,0,0);
 if(s.settings.anomaliesLast===today||now<at||now-at>=3*3600000)return false;
 return (kinds||feeds.connected(s)).length?today:false;
}
// Puts the card into its own chat titled with the top anomaly and marks the chat done: the notification center shows
// one «Вчера установки из Бразилии −40%» with «Открыть чат». Quiet days post nothing.
async function daily(s,{now=new Date(),readers}={}){
 const today=due(s,now,readers?Object.keys(readers):null);if(!today)return null;
 s.saveSettings({anomaliesLast:today});
 const card=await check(s,{days:1,now,readers});
 if(!card.items.length)return {card,topicId:null};
 const state=s.dialogue.state,project=state.projects.find(p=>p.id==='general')||state.projects[0];if(!project)return {card,topicId:null};
 const top=card.items[0],title=(top.headline+(card.items.length>1?' и ещё '+(card.items.length-1):'')).slice(0,80);
 const topic={id:randomUUID(),projectId:project.id,title,kind:'chat',anomaliesDay:card.day,messages:[{role:'assistant',text:summary(card),by:BY,at:now.getTime(),extensionData:{anomalies:card}}],at:now.getTime()};
 state.topics.push(topic);s.dialogue.persist();
 try{s.chatJobs?.update?.(topic,'done','Готово');}catch(e){console.error('Anomalies notification:',e.message);}
 return {card,topicId:topic.id};
}

function setup(s){
 let running=false;
 const tick=async()=>{if(running)return;running=true;try{await daily(s);}catch(e){console.error('Anomalies:',e.message);}finally{running=false;}};
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'&&!process.env.PETYA_LIVE_CHECK){const timer=setInterval(()=>{tick();},60000);timer.unref?.();}
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Аномалии» не добавлено.');};
 // Yesterday's anomalies as a part of the morning brief.
 try{require('../../features/morning-brief.cjs').addPart(ID,require('./brief.cjs').part);}catch{/* no morning brief in this build */}
 return {anomalies:{check:o=>check(s,o),daily:o=>daily(s,o)},ipc:{
  // «Не показывать такое»: a rule by kind, metric, segment and direction (any source); «Отменить» removes it.
  mute:(key,label)=>{ready();if(typeof key!=='string'||key.split('|').length!==4||key.length>200)throw Error('Некорректное правило.');
   const list=mutes(s.settings);if(!list.some(r=>r.key===key))list.push({id:randomUUID().slice(0,8),key,label:String(label||key).slice(0,120),at:Date.now()});
   s.saveSettings({anomaliesMuted:JSON.stringify(list.slice(-50))});cache.clear();return {rules:list,text:'Такое больше не покажу.'};},
  unmute:key=>{const list=mutes(s.settings).filter(r=>r.key!==key&&r.id!==key);s.saveSettings({anomaliesMuted:JSON.stringify(list)});cache.clear();return {rules:list};},
  status:()=>({kinds:feeds.connected(s).map(k=>({id:k,name:KIND_NAMES[k]})),rules:mutes(s.settings),daily:s.settings.anomaliesDaily||'',sensitivity:s.settings.anomaliesSensitivity||'normal'})
 }};
}
function validate(next){
 if(next.anomaliesDaily!==undefined&&next.anomaliesDaily!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.anomaliesDaily))throw Error('Время проверки — ЧЧ:ММ, например 09:00.');
 if(next.anomaliesSensitivity!==undefined&&!['low','normal','high'].includes(next.anomaliesSensitivity))next.anomaliesSensitivity='normal';
 if(next.anomaliesMuted!==undefined){try{if(!Array.isArray(JSON.parse(next.anomaliesMuted)))throw 0;}catch{next.anomaliesMuted='[]';}}
 if(next.anomaliesLast!==undefined&&!/^(?:\d{4}-\d{2}-\d{2})?$/.test(next.anomaliesLast))next.anomaliesLast='';
}
// Dashboards (src/features/dashboards.cjs): «аномалии» is a read-only card that refreshes there.
const dashboard={accepts:text=>!!intent(String(text||'')),widgets:[{title:'Аномалии за вчера',command:'аномалии за вчера'}]};
module.exports={name:'anomalies',dashboard,defaults:{['extension_'+ID]:'false',anomaliesDaily:'09:00',anomaliesSensitivity:'normal',anomaliesMuted:'[]',anomaliesLast:''},
 validate,setup,turn,intent,check,summary,daily,due,SOURCE_APPS,cache};
