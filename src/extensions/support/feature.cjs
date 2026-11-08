// «Поддержка игроков»: the player support desk in the chat, source-agnostic (sources.cjs; the first source is Zendesk).
// Code counts open tickets, SLA breaches, new today and tickets per day by status; the local model only groups
// problems (quotes checked against real tickets) and drafts a reply grounded in the ticket, its comments and Help
// Center articles. A draft never promises a refund or compensation unless an active macro offers it, and it links the
// knowledge base. A reply is posted only when the user presses «Отправить» on the card, with exactly the text shown.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const a=require('./analysis.cjs');
const registry=require('./sources.cjs');
const ID='support',BY='Поддержка игроков';
const sourcesOf=s=>s.supportSources||registry.create(s);

// --- Routing ---------------------------------------------------------------------------------------------------
const NAME=/zendesk|зендеск\p{L}*|helpshift|freshdesk/iu;
const TICKET=/тикет\p{L}*/iu;
const SUPPORT=/(?:^|[^\p{L}])(?:в|из|от|для|у)\s+(?:служб\p{L}*\s+)?(?:поддержк\p{L}*|саппорт\p{L}*)|поддержк\p{L}*\s+(?:игрок|пользовател|клиент)\p{L}*|саппорт\p{L}*|обращени\p{L}*\s+(?:игрок\p{L}*|пользовател\p{L}*|в поддержку)/iu;
// Not this app: vendors' support (Unity docs), Petya's own help, cheering someone up, «supports format X», store
// reviews, and tickets of the task tracker.
const NEAR=/(?:поддержк\p{L}*|саппорт\p{L}*)\s+(?:unity|юнити|apple|эппл|google|гугл|steam|стим|ios|android|андроид|microsoft|epic|яндекс|jetbrains|github|discord|дискорд|slack|слак|zoom|зум)|техподдержк\p{L}*\s+(?:пет|приложени|программ|ассистент)|поддержк\p{L}*\s+пет[иьяю]|поддерж(?:и|ите|ать)(?!\p{L})|поддержи\s+меня|морал\p{L}*\s+поддержк|поддерживает\p{L}*|поддержк\p{L}*\s+(?:формат|язык|верси|платформ|функци|api|протокол|кодек|шрифт|ios|android)|отзыв\p{L}*|(?:app\s?store|google\s?play)|jira|джир\p{L}*|спринт\p{L}*|youtrack|бэклог\p{L}*|(?:задач\p{L}*|тикет\p{L}*)\s+(?:в|из)\s+(?:трекер|asana|асан)/iu;
const REPLY=/(?:ответь|ответить|отвечай|подготовь ответ|черновик ответа|напиши ответ)\p{L}*\s+(?:на\s+)?(?:\p{L}+\s+)?(?:тикет|обращени)/iu;
const ticketId=text=>String(text||'').match(/(?:тикет\p{L}*|обращени\p{L}*|№|#)\s*(?:№|#)?\s*(\d{1,12})(?!\d)/iu)?.[1]||null;

function wanted(text){
 const t=String(text||'').trim();
 if(!t||NEAR.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить))/iu.test(t))return false;
 return NAME.test(t)||TICKET.test(t)||SUPPORT.test(t);
}

// --- Overview --------------------------------------------------------------------------------------------------------
const PRIORITY={urgent:0,high:1,normal:2,low:3};
const slaHours=s=>{const n=Number(s.settings.supportSlaHours);return Number.isFinite(n)&&n>0&&n<=720?n:24;};
async function read(s,list,{since}){
 const rows=[],notes=[],errors=[];
 for(const x of list){
  try{s.requestProgress?.report('Читаю тикеты '+x.name);rows.push(...(await x.source.tickets(s,{since})).map(t=>({...t,source:x.id})));}
  catch(e){errors.push(e);notes.push(x.name+': '+e.message);}
 }
 if(errors.length===list.length)throw errors[0];
 return {rows,notes};
}
async function group(s,rows){
 if(!rows.length)return [];
 if(!s.settings.model)return null;
 const sample=rows.slice(0,80);
 s.requestProgress?.report('Группирую проблемы игроков');
 const raw=await kit.modelJSON(s,{system:'Сгруппируй обращения игроков в поддержку по проблемам (не больше 5). title — короткая проблема по-русски (например «Не пришла покупка»). tickets — номера обращений этой проблемы. quotes — 1–2 точные цитаты, скопированные из текста обращений дословно, без изменений и перевода.',
  user:a.clusterInput(sample),schema:a.CLUSTER_SCHEMA,predict:1500}).catch(()=>null);
 return raw?a.clusters(raw,sample):[];
}
const days=n=>n+' '+kit.plural(n,['день','дня','дней']);
const hoursText=h=>h<1?'меньше часа':h<48?Math.round(h)+' '+kit.plural(Math.round(h),['час','часа','часов']):Math.round(h/24)+' '+kit.plural(Math.round(h/24),['день','дня','дней']);
async function overview(s,command,list,now=Date.now()){
 const period=a.period(command),topic=a.topicAsked(command),hours=slaHours(s);
 const span=Math.max(period,7),since=new Date(now-span*a.DAY);
 const {rows:all,notes}=await read(s,list,{since});
 const fresh=t=>Date.parse(t.created)>=now-period*a.DAY;
 const scoped=topic?all.filter(t=>a.about(t,topic)):all;
 const inPeriod=scoped.filter(fresh);
 const tiles=a.tiles(scoped,now,hours);
 const clusters=await group(s,(topic?scoped.filter(t=>fresh(t)||a.OPEN.has(t.status)):inPeriod.length?inPeriod:scoped.filter(t=>a.OPEN.has(t.status))));
 const listed=(topic?scoped.filter(t=>fresh(t)||a.OPEN.has(t.status)):scoped.filter(t=>a.OPEN.has(t.status)))
  .map(t=>({...t,text:t.text.slice(0,400),wait:Math.round(a.wait(t,now)*10)/10,slaLeft:(v=>v===null?null:Math.round(v*10)/10)(a.slaLeft(t,now,hours)),overdue:a.overdue(t,now,hours)}))
  .sort((x,y)=>Number(y.overdue)-Number(x.overdue)||(PRIORITY[x.priority]??2)-(PRIORITY[y.priority]??2)||y.wait-x.wait);
 const card={id:randomUUID(),mode:'overview',sources:list.map(x=>({id:x.id,name:x.name})),days:period,topic:topic?{id:topic.id,label:topic.label}:null,slaHours:hours,
  tiles,daily:a.daily(scoped,new Date(now-(Math.max(period,7)-1)*a.DAY),new Date(now)),
  clusters:clusters===null?a.plainClusters(inPeriod.length?inPeriod:scoped):clusters,clustersByModel:clusters!==null,
  tickets:listed.slice(0,30),more:Math.max(0,listed.length-30),created:inPeriod.length,notes,model:!!s.settings.model,at:now};
 const where=topic?' · '+topic.label.toLowerCase():'';
 let text=BY+where+': открыто '+tiles.open+(tiles.overdue?', просрочено по SLA '+tiles.overdue:'')+', новых сегодня '+tiles.today+'; за '+days(period)+' — '+inPeriod.length+' '+kit.plural(inPeriod.length,['тикет','тикета','тикетов'])+'.';
 if(card.clusters.length)text+=' Чаще всего: '+card.clusters.slice(0,3).map(c=>c.title.toLowerCase()+' ('+c.count+')').join(', ')+'.';
 const sources=list.map(x=>({title:x.name+' · тикеты',url:all.find(t=>t.source===x.id)?.url?.replace(/\/agent\/tickets\/\d+$/,'/agent/filters')||''})).filter(x=>x.url);
 return kit.reply(s,command,{by:BY,text,data:{supportCard:card},sources});
}

// --- Reply to one ticket --------------------------------------------------------------------------------------------------
async function draftReply(s,t,thread,articles,macros){
 if(!s.settings.model)return null;
 s.requestProgress?.report('Готовлю черновик ответа');
 const out=await kit.modelJSON(s,{system:'Ты агент поддержки игры. Напиши ответ игроку на его обращение. Пиши на языке игрока, вежливо и по существу, без подписи. Опирайся только на обращение, переписку и статьи базы знаний; если статья помогает — дай её ссылку из списка. Не обещай возврат денег, компенсацию или подарки, если этого нет в макросах. Не выдумывай сроков и фактов об игре. articles — номера статей, которые ты использовал.',
  user:{ticket:{subject:t.subject,text:t.text,status:t.status,priority:t.priority},thread:thread.slice(-6).map(c=>({from:c.agent?'агент':'игрок',public:c.public,text:c.text.slice(0,1200)})),
   articles:articles.map((x,i)=>({n:i+1,title:x.title,url:x.url,snippet:x.snippet})),macros:macros.slice(0,20).map(m=>({title:m.title,text:m.text.slice(0,500)}))},
  schema:{type:'object',properties:{reply:{type:'string'},articles:{type:'array',items:{type:'integer'}}},required:['reply','articles']},temperature:0.3,predict:900}).catch(()=>null);
 let text=String(out?.reply||'').trim();if(!text)return null;
 const guarded=a.guard(text,macros);text=guarded.text;
 // The knowledge base is linked: the model's chosen article, or the best match when the draft has no link.
 const used=(out.articles||[]).map(Number).filter(i=>i>=1&&i<=articles.length).map(i=>articles[i-1]);
 const linked=articles.filter(x=>text.includes(x.url));
 const add=(used[0]&&!linked.length?used[0]:!linked.length&&articles[0]?articles[0]:null);
 if(add)text+=(text?'\n\n':'')+'Подробнее: '+add.url;
 return {text,removed:guarded.removed,articles:[...new Set([...linked,...used,...(add?[add]:[])])].map(x=>x.url)};
}
async function replyCard(s,command,x,id){
 const t=await x.source.ticket(s,id);
 if(!t)return kit.reply(s,command,{by:BY,error:true,text:'Тикет #'+id+' не найден в '+x.name+'.'});
 s.requestProgress?.report('Читаю переписку тикета #'+id);
 const thread=await x.source.comments(s,id);
 let articles=[],macros=[];const notes=[];
 try{articles=typeof x.source.articles==='function'?await x.source.articles(s,t.subject||t.text.slice(0,120)):[];}catch(e){notes.push('База знаний: '+e.message);}
 try{macros=typeof x.source.macros==='function'?await x.source.macros(s):[];}catch(e){notes.push('Макросы: '+e.message);}
 const draft=await draftReply(s,t,thread,articles,macros);
 const now=Date.now(),hours=slaHours(s);
 const card={id:randomUUID(),mode:'reply',sources:[{id:x.id,name:x.name}],source:x.id,
  ticket:{...t,source:x.id,wait:Math.round(a.wait(t,now)*10)/10,slaLeft:(v=>v===null?null:Math.round(v*10)/10)(a.slaLeft(t,now,hours)),overdue:a.overdue(t,now,hours)},
  thread:thread.slice(-6),articles,draft:draft?.text||'',removed:draft?.removed||[],refundAllowed:a.allowsPromise(macros),
  macros:macros.length,model:!!s.settings.model,notes,sent:null,at:now};
 let text='Тикет #'+id+(t.subject?' «'+t.subject+'»':'')+(t.requester?' от '+t.requester:'')+' — '+(card.ticket.overdue?'просрочен по SLA, ':'')+'ждёт '+hoursText(card.ticket.wait)+'.';
 text+=draft?' Черновик ответа в карточке: поправьте и нажмите «Отправить» — без этого ничего не уйдёт.':s.settings.model?' Черновик не получился — напишите ответ в карточке.':' Чтобы Петя набросал ответ, выберите локальную модель; написать его можно и самому в карточке.';
 if(card.removed.length)text+=' Обещание возврата или компенсации убрано из черновика: в макросах его нет.';
 return kit.reply(s,command,{by:BY,text,data:{supportCard:card},sources:[{title:x.name+' · тикет #'+id,url:t.url}]});
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 const reg=sourcesOf(s),list=reg.list();
 if(!list.length)return kit.reply(s,command,{by:BY,question:true,text:'Чтобы читать тикеты, подключите службу поддержки. '+(reg.hints()[0]||'Zendesk: укажите поддомен, email агента и API-токен в «Настройки → Поддержка игроков».')});
 const id=ticketId(text);
 try{
  if(id||REPLY.test(text)){
   const go=(source,ticket)=>replyCard(s,command,source,ticket).catch(e=>fail(s,command,e));
   const pickSource=ticket=>{
    if(list.length===1)return go(list[0],ticket);
    const labels=list.map(x=>x.name);
    return require('../../input-required.cjs').ask({text:'В какой службе тикет #'+ticket+'?',label:'Служба поддержки',options:labels,strictChoices:true},choice=>go(list[labels.indexOf(choice)],ticket));
   };
   if(id)return await pickSource(id);
   return require('../../input-required.cjs').ask({text:'На какой тикет ответить? Напишите номер.',label:'Номер тикета',placeholder:'Например: 1234'},answer=>{const n=String(answer||'').match(/\d{1,12}/)?.[0];if(!n)return kit.reply(s,command,{by:BY,question:true,text:'Нужен номер тикета — например, 1234.'});return pickSource(n);});
  }
  return await overview(s,text,list);
 }catch(e){if(e instanceof require('../../input-required.cjs').InputRequired)throw e;return fail(s,command,e);}
}
// The help desk's own answers (credentials, rights, limits) are already explained in words.
const fail=(s,command,e)=>e?.status?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);

// --- Card action: sending the reply ---------------------------------------------------------------------------------------
function locate(s,cardId){
 for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.supportCard;if(card?.id===cardId)return {message,card};}
 return null;
}
function setup(s){
 const sending=new Set();
 async function send(ref,text){
  const hit=locate(s,ref?.card);if(!hit||hit.card.mode!=='reply')throw Error('Карточка тикета не найдена в чате. Повторите запрос.');
  const card=hit.card;
  if(String(ref.id)!==card.ticket.id||ref.source!==card.source)throw Error('Тикет не совпадает с карточкой.');
  if(card.sent)throw Error('Ответ на этот тикет уже отправлен из этой карточки.');
  if(typeof text!=='string'||!text.trim())throw Error('Напишите текст ответа.');
  if(text.length>30000)throw Error('Ответ слишком длинный. Сократите текст.');
  const x=sourcesOf(s).find(card.source);if(!x)throw Error('Служба поддержки отключена или не подключена. Откройте «Настройки → Поддержка игроков».');
  const lock=card.source+':'+card.ticket.id;if(sending.has(lock))throw Error('Ответ уже отправляется.');
  sending.add(lock);
  try{
   // Exactly the text the user saw and pressed «Отправить» for, as a public comment.
   const result=await x.source.reply(s,card.ticket.id,text);
   card.sent={text,url:result.url,status:result.status||'',at:new Date().toISOString()};
   s.dialogue.persist?.();
   return {...card.sent,text:'Ответ отправлен в тикет #'+card.ticket.id+'.'};
  }finally{sending.delete(lock);}
 }
 function status(){const reg=sourcesOf(s);return {sources:reg.all().map(x=>({id:x.id,name:x.name,ready:!!reg.find(x.id)})),hasZendeskToken:!!s.settings.supportZendeskToken};}
 return {ipc:{send,status}};
}

function validate(next){
 if(next.supportZendeskSubdomain)require('./zendesk.cjs').subdomain(next.supportZendeskSubdomain);
 if(next.supportZendeskEmail&&!/^[^\s@]+@[^\s@]+$/.test(String(next.supportZendeskEmail).trim()))throw Error('Email агента Zendesk указан неверно.');
 if(next.supportSlaHours!==undefined&&next.supportSlaHours!==''){const n=Number(next.supportSlaHours);if(!Number.isFinite(n)||n<=0||n>720)throw Error('Цель SLA — число часов от 1 до 720.');}
}
module.exports={name:'supportDesk',
 defaults:{['extension_'+ID]:'false',supportZendeskSubdomain:'',supportZendeskEmail:'',supportZendeskToken:'',supportSlaHours:'24'},
 secrets:['supportZendeskToken'],validate,setup,turn,wanted,ticketId,locate};
