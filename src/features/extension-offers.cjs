// Offers an extension the user does not have yet when the conversation enters its subject.
// Each extension may declare `offer.cjs` beside its extension.json:
//   { id, name, pitch, names:[RegExp], topics:[RegExp], avoid:[RegExp], requests?:[RegExp],
//     connect:'install'|'settings', ready(settings), connected?(settings), also?:[ids], service?:'<module>' }
// `also`: extensions added together with this one (a crash source brings «Крэши», which shows its crashes).
// `service`: the app is connected in Petya's own service settings (Google Play), not in an extension card.
// `connected`: the catalog's «подключено» when it differs from `ready` (a source is connected before «Крэши» is added).
// `names` are explicit service names (Sentry, App Store), `topics` the subject words (крэш, отзывы),
// `avoid` near-misses that belong to someone else («код-ревью» is not store reviews).
// A direct request («покажи крэши за неделю») is answered by the offer itself and resumes after connecting;
// a mention in ordinary talk gets a small offer under Petya's answer, once per chat. Two extensions that fit
// equally well are never guessed between: the offer names both.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

// Without `dir`, the offers of every live extension in the shared registry (bundled, installed, development).
function load(dir){
 if(dir)return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(dir,e.name,'offer.cjs'))
  .filter(f=>fs.existsSync(f)).map(f=>{const o=require(f);if(o.id!==path.basename(path.dirname(f)))throw Error('Invalid extension offer '+f);return o;});
 const registry=require('../extension-registry.cjs');
 return registry.files('offer.cjs').flatMap(e=>{
  const o=registry.load(e,e.file);if(!o)return [];
  const regexps=list=>list===undefined||Array.isArray(list)&&list.every(r=>r instanceof RegExp);
  const valid=o.id===e.id&&(e.origin==='bundled'||typeof o.name==='string'&&typeof o.pitch==='string'&&typeof o.ready==='function'&&['names','topics','avoid','requests'].every(k=>regexps(o[k]))&&(o.connect===undefined||['install','settings'].includes(o.connect))&&(o.connected===undefined||typeof o.connected==='function')&&(o.also===undefined||Array.isArray(o.also)&&o.also.every(x=>typeof x==='string'))&&o.service===undefined);
  if(valid)return [o];
  if(e.origin==='bundled')throw Error('Invalid extension offer '+e.file);
  registry.report(e,Error('offer.cjs: нужны id «'+e.id+'», name, pitch, ready(settings) и списки RegExp names/topics/avoid/requests'),e.file);return [];
 });
}
// Asking or telling Petya to show, check or count something: the request needs data the extension would bring.
const REQUEST=/(?:^|[\s,.!?«"])(?:покажи|показать|выведи|сколько|какие|какой|какая|что с |что там|что по |проверь|глянь|посмотри|найди|сравни|разбери|собери|дай|открой|запусти|перезапусти|последн\p{L}*|топ\b|список|почему (?:упал|упала|упало|не собрал))/iu;
// Talking about something without wanting it now: no offer at all.
const QUIET=/^(?:а\s+)?(?:не\s+(?:надо|нужно|показывай|подключай)|что такое|как (?:подключить|настроить|работает)|объясни,? что такое|запомни)/iu;
const any=(list,text)=>(list||[]).some(r=>r.test(text));
const count=(list,text)=>(list||[]).filter(r=>r.test(text)).length;

function muted(settings){try{const v=JSON.parse(settings.extensionOffersMuted||'[]');return Array.isArray(v)?v:[];}catch{return [];}}

function candidates(command,{offers,settings,topic}){
 const text=String(command||'').trim();
 if(!text||QUIET.test(text))return [];
 const off=muted(settings);
 const rows=[];
 for(const o of offers){
  if(off.includes(o.id))continue;
  let ready=false;try{ready=!!o.ready(settings||{});}catch{ready=false;}
  if(ready)continue;
  if(any(o.avoid,text))continue;
  const named=any(o.names,text),subject=count(o.topics,text);
  if(!named&&!subject)continue;
  rows.push({offer:o,named,score:(named?10:0)+subject,direct:named&&REQUEST.test(text)||subject>0&&(any(o.requests,text)||REQUEST.test(text))});
 }
 // A named service wins over subject words: «отзывы в App Store» is not «отзывы в Google Play».
 const pool=rows.some(r=>r.named)?rows.filter(r=>r.named):rows;
 return pool.sort((a,b)=>b.score-a.score);
}
// One clear winner, or a tie that must be asked about.
function decide(rows){
 if(!rows.length)return null;
 const top=rows.filter(r=>r.score===rows[0].score);
 return top.length===1?{one:top[0]}:{tie:top.slice(0,3)};
}

function setup(s){
 // Follows the registry: an extension installed or removed while Petya runs is offered (or not) at once.
 const live=()=>require('../extension-registry.cjs').cached('offers',()=>load());
 const pending=new Map();
 const prune=()=>{for(const [k,v]of pending)if(Date.now()-v.at>30*60000)pending.delete(k);};
 const keep=(o,command,topicId,direct)=>{prune();const id=randomUUID();pending.set(id,{id,ext:o.id,command,topicId,direct,at:Date.now()});return {id,ext:o.id,name:o.name,pitch:o.pitch,connect:o.connect||'install',...o.service?{service:o.service}:{}};};
 const services=command=>{try{return require('../service-access.cjs').detect(command,null);}catch{return [];}};
 // Requests Petya's own handlers answer (Jira, team, an added app's own requests, sums, weather) are never taken over by an offer.
 // work-query-route classifies ordinary talk as {kind:'chat'}: only other kinds count as owned.
 function ownedByPetya(command,topic){
  try{
   if(require('../dialogue.cjs').intent(command)!=='chat')return true;
   const route=require('../work-query-route.cjs').classify(command,topic||{});if(route&&route.kind!=='chat')return true;
   if(require('../explicit-calculation.cjs').explicitCalculation(command)!==null||require('../team-fill.cjs').isTeamFill(command)||require('../capabilities.cjs').owned(command,s.settings))return true;
   const fresh=require('./fresh-data.cjs');return !!fresh.weatherQuestion(command)||!!fresh.rateQuestion(command);
  }catch{return false;}
 }

 // Called before Petya answers. Only a direct request about a missing extension's subject is answered by the
 // offer; everything else is left to Petya and maybe annotated afterwards.
 function turn(command){
  const topic=s.dialogue.active();
  if(services(command).length||ownedByPetya(command,topic))return null;
  const choice=decide(candidates(command,{offers:live(),settings:s.settings,topic}).filter(r=>r.direct));
  if(!choice)return null;
  const rows=choice.one?[choice.one]:choice.tie;
  const text=choice.one?'Для этого нужно расширение «'+rows[0].offer.name+'»: '+rows[0].offer.pitch+'. Подключить?':
   'Это может сделать одно из расширений: '+rows.map(r=>'«'+r.offer.name+'» — '+r.offer.pitch).join('; ')+'. Какое подключить?';
  return answer(command,rows.map(r=>r.offer),text);
 }
 // An extension that is added but needs another one (e.g. «Крэши» without a connected crash source) asks with the same
 // offer card: `ids` are the extensions to choose from, `text` the question. The request resumes after connecting.
 function propose(command,ids,text,by){
  const list=ids.map(id=>live().find(o=>o.id===id)).filter(Boolean);
  if(!list.length)return null;
  return answer(command,list,text,by);
 }
 function answer(command,list,text,by='расширения'){
  const topic=s.dialogue.active();
  const items=list.map(o=>keep(o,command,topic?.id,true));
  s.dialogue.rememberAction(command,text);
  const t=s.dialogue.active(),message=t.messages.at(-1);
  message.by=by;message.extensionData={...message.extensionData,extensionOffer:{items,direct:true}};
  if(t){t.extensionOffers=[...new Set([...(t.extensionOffers||[]),...items.map(i=>i.ext)])];}
  s.dialogue.persist();
  return {handled:true,question:true,text,by,topicId:t.id,topicTitle:t.title,messages:t.messages,extensionData:{extensionOffer:{items,direct:true}}};
 }
 // Called after Petya answered something on the subject: a quiet offer under the answer, once per chat.
 function annotate(command,result){
  const topic=s.dialogue.active();
  if(!result?.handled||result.error||result.question||!topic||services(command).length)return result;
  const message=topic.messages.at(-1);
  if(message?.role!=='assistant'||message.extensionData?.extensionOffer)return result;
  const choice=decide(candidates(command,{offers:live(),settings:s.settings,topic}).filter(r=>!(topic.extensionOffers||[]).includes(r.offer.id)));
  if(!choice?.one)return result;
  const item=keep(choice.one.offer,command,topic.id,false);
  const data={extensionOffer:{items:[item],direct:false}};
  message.extensionData={...message.extensionData,...data};
  topic.extensionOffers=[...(topic.extensionOffers||[]),item.ext];
  s.dialogue.persist();
  return {...result,extensionData:{...result.extensionData,...data}};
 }
 // An app that needs another one (e.g. «Подготовка к встрече» needs «Календарь») answers with the same offer
 // card for it: accepting adds that app (and opens its settings when a service must be connected), and the
 // original request is sent again. Returns the card data, or null when no such extension offers itself.
 function prerequisite(id,command){
  const o=live().find(x=>x.id===id);if(!o)return null;
  const topic=s.dialogue.active();
  return {items:[keep(o,command,topic?.id,true)],direct:true};
 }
 function find(id){prune();const row=pending.get(id);if(!row)throw Error('Предложение устарело. Повторите запрос.');return row;}
 function accept(id){
  const row=find(id),o=live().find(x=>x.id===row.ext);
  if(!o){pending.delete(id);throw Error('Расширение больше недоступно.');}
  // Same switch the catalog's «Добавить» uses: the descriptor's setting (and those of the extensions it brings).
  const descriptors=require('./extension-ui.cjs').descriptors,patch={};
  for(const ext of [o.id,...(o.also||[])]){const d=descriptors.find(d=>d.id===ext);if(d?.setting)patch[d.setting]='true';}
  if(Object.keys(patch).length)s.saveSettings(patch);
  pending.delete(id);
  let ready=false;try{ready=!!o.ready(s.settings);}catch{ready=false;}
  if(ready||o.connect!=='settings')return {installed:o.id,name:o.name,retry:row.direct?row.command:null,text:'Расширение «'+o.name+'» добавлено.'};
  if(o.service)return {installed:o.id,name:o.name,service:o.service,retry:row.command,text:'Подключите «'+o.name+'» в настройках — запрос сохранён: скажите «готово», и я продолжу.'};
  return {installed:o.id,name:o.name,settings:o.id,retry:row.command,text:'Расширение «'+o.name+'» добавлено. Подключите его в настройках — запрос сохранён: скажите «готово», и я продолжу.'};
 }
 function dismiss(id,forever=false){
  const row=find(id);pending.delete(id);
  if(forever){const list=muted(s.settings);if(!list.includes(row.ext))s.saveSettings({extensionOffersMuted:JSON.stringify([...list,row.ext])});}
  return {dismissed:row.ext,forever};
 }
 function unmute(ext){s.saveSettings({extensionOffersMuted:JSON.stringify(muted(s.settings).filter(x=>x!==ext))});return muted(s.settings);}
 return {extensionOffers:{turn,annotate,propose,prerequisite,get offers(){return live();}},ipc:{accept,dismiss,unmute,muted:()=>muted(s.settings)}};
}
module.exports={name:'extensionOffers',defaults:{extensionOffersMuted:'[]'},validate(){},setup,load,candidates,decide,REQUEST};
