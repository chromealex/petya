// «Подписки и продления»: what the user pays for regularly and what renews soon, from mail records
// (src/features/mail-records.cjs: receipts and subscriptions, domain / certificate / license renewals read from the
// mail Petya already reads; opt-in, local). Monthly total per currency, services with the next charge and past
// charges, renewals by expiry, «Напомнить перед списанием» (a chat request to «Напоминания» when that app is added)
// and «Открыть письмо». No model here; reading the mail happens only after the user turns it on.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const {build}=require('./services.cjs');
const {merchantKey}=require('../../mail-records/store.cjs');
const ID='subscriptions',BY='Подписки и продления',HOUR=3600000;

// --- Routing --------------------------------------------------------------------------------------------------------
const TOPIC=[
 /за\s+что\s+(?:я\s+)?(?:плачу|плат\p{L}*|списыва\p{L}*)|на\s+что\s+(?:у\s+меня\s+)?(?:списыва\p{L}*|уход\p{L}*\s+деньги)/iu,
 /(?:мои|какие\s+у\s+меня|какие|список|все)\s+(?:платн\p{L}*\s+)?подписк\p{L}*|подписк\p{L}*\s+и\s+продлени\p{L}*|(?:платн\p{L}*|регулярн\p{L}*)\s+(?:подписк|сервис|платеж|платёж|списани)\p{L}*/iu,
 /сколько\s+(?:у\s+меня\s+|я\s+)?(?:уходит|трачу|плачу|тратится|списывается|отдаю)\s+(?:в\s+месяц\s+)?(?:на\s+)?(?:подписк|сервис|софт|программ)\p{L}*/iu,
 /что\s+(?:у\s+меня\s+)?(?:продлится|продлевается|спишется|будет\s+списан\p{L}*|истекает|заканчивается)(?:\s+(?:на\s+этой\s+неделе|в\s+этом\s+месяце|скоро|завтра|сегодня))?/iu,
 /когда\s+(?:следующее\s+)?(?:списание|продление|спишут|продлевать|продлить|истекает|заканчивается)\s+(?:за\s+|у\s+|подписк\p{L}*\s+|домен\p{L}*|лицензи\p{L}*|сертификат\p{L}*|\p{Lu})/iu,
 /(?:когда|до\s+какого)\s+.*(?:истекает|заканчивается|оплачен\p{L}*)\s+(?:домен|лицензи|сертификат)\p{L}*|(?:домен|лицензи|сертификат)\p{L}*\s+.*(?:истекает|продлить|продлевать|заканчивается)/iu,
 /(?:обнови|проверь|найди|собери)\s+(?:мои\s+)?(?:подписки|чеки|продления)\s+(?:из|в|по)\s+почт\p{L}*/iu
];
// Neighbours: subscribing to channels or mailing lists, signing documents, extending a sprint or a focus session,
// prices of products, bookings of rooms, followers.
const AVOID=/подпиш\p{L}*|отпиш\p{L}*|подпис[аеи]\p{L}*\s+(?:документ|договор|акт|письм)|подписчик\p{L}*|подпис\p{L}*\s+(?:на\s+(?:канал|рассылк|тред|ветк|уведомлени)|к\s+картинк)|продли\s+(?:спринт|фокус|дедлайн|встречу|срок\s+задачи)|переговорк|сколько\s+стоит/iu;
function wants(text){const t=String(text||'');return TOPIC.some(r=>r.test(t))&&!AVOID.test(t);}
function intent(text){
 const t=String(text||'');
 if(/(?:обнови|проверь|найди|собери)\s.*почт/iu.test(t))return 'refresh';
 if(/на\s+этой\s+неделе|завтра|сегодня|скоро|ближайш/iu.test(t)||/что\s+(?:у\s+меня\s+)?(?:продлится|спишется|истекает)/iu.test(t))return 'week';
 if(/сколько/iu.test(t))return 'total';
 if(/домен|лицензи|сертификат/iu.test(t))return 'renewals';
 return 'all';
}

// --- Text -------------------------------------------------------------------------------------------------------------
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayWords=(date,today)=>{const d=new Date(date+'T12:00:00'),t=new Date(today+'T12:00:00');const n=Math.round((d-t)/86400000);return n===0?'сегодня':n===1?'завтра':d.getDate()+' '+MONTHS[d.getMonth()];};
const money=(n,c)=>{const v=Number.isInteger(n)?String(n):n.toFixed(2).replace('.',',');const sym={RUB:'₽',USD:'$',EUR:'€',GBP:'£',KZT:'₸',UAH:'₴'}[c];return sym?(c==='USD'||c==='GBP'?sym+v:v+' '+sym):v+' '+c;};
const PER={month:'в месяц',year:'в год',week:'в неделю',quarter:'в квартал'};
// The chat request for «Напоминания»: the day before the charge at 10:00 (or in an hour when that has passed).
function remindText(sv,now){
 const day=new Date(sv.next+'T10:00:00');day.setDate(day.getDate()-1);
 const when=day.getTime()>now?day.getDate()+' '+MONTHS[day.getMonth()]+' в 10:00':'через час';
 return 'Напомни '+when+': '+dayWords(sv.next,ymdOf(now))+' спишется '+sv.merchant+' — '+money(sv.amount,sv.currency);
}
const ymdOf=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function summary(data,mode,now){
 const today=ymdOf(now);
 const {services,renewals,totals}=data;
 if(!services.length&&!renewals.length)return 'В почте пока не нашлось подписок и продлений.';
 const total=totals.length?totals.map(t=>money(t.monthly,t.currency)).join(' + ')+' в месяц':'';
 const active=services.filter(s=>s.status==='active');
 if(mode==='week'){
  const soon=[...active.filter(s=>s.days!==null&&s.days<=7).map(s=>s.merchant+' — '+dayWords(s.next,today)+', '+money(s.amount,s.currency)),...renewals.filter(r=>r.days>=0&&r.days<=7).map(r=>r.name+' — истекает '+dayWords(r.expires,today))];
  return soon.length?'На этой неделе: '+soon.join('; ')+'.':'На этой неделе ничего не продлевается.'+(active[0]?.next?' Ближайшее списание — '+active[0].merchant+' '+dayWords(active[0].next,today)+'.':'');
 }
 if(mode==='renewals'){
  if(!renewals.length)return 'Писем о продлении доменов, сертификатов и лицензий не нашлось.';
  return 'Продления: '+renewals.slice(0,5).map(r=>r.name+' — до '+dayWords(r.expires,today)).join('; ')+'.';
 }
 const list=active.slice(0,5).map(s=>s.merchant+' '+money(s.amount,s.currency)+(s.period?' '+PER[s.period]:''));
 return (mode==='total'&&total?'На сервисы уходит '+total+' ('+active.length+' '+kit.plural(active.length,['подписка','подписки','подписок'])+')':'Вы платите за '+active.length+' '+kit.plural(active.length,['сервис','сервиса','сервисов'])+(total?' — '+total:''))+'.'+(list.length&&mode!=='total'?' '+list.join(', ')+'.':'');
}

// --- Chat turn ----------------------------------------------------------------------------------------------------------
const hidden=s=>{try{const v=JSON.parse(s.settings.subscriptionsHidden||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch{return [];}};
function card(s,mode,now,extra={}){
 const data=build(s.mailRecords.list({types:['subscription','receipt','renewal']}),{now,hidden:hidden(s)});
 for(const sv of data.services)if(sv.next&&sv.status==='active')sv.remind=remindText(sv,now);
 const st=s.mailRecords.status();
 return {data,text:summary(data,mode,now),card:{subscriptionsCard:{mode,now,today:ymdOf(now),...data,reminders:s.settings.extension_reminders==='true',
  status:{records:st.records,scanned:st.scanned,connected:st.connected,model:st.model,encrypted:st.encrypted},...extra}}};
}
const CONSENT='Чтобы найти подписки, Петя прочитает в подключённой почте только письма, похожие на чеки, подписки, брони и продления, и сохранит из них суммы, даты и ссылки на письма — только на этом компьютере. Письма никуда не отправляются и не меняются. Включить?';
async function answer(s,command,mode,deps){
 const now=deps.now?.()??Date.now();
 const st=s.mailRecords.status();
 let note='';
 // Read new mail first when the last look is old (or there was none); a failure still answers from what is stored.
 if(mode==='refresh'||!st.scanned||now-st.scanned>6*HOUR){
  s.requestProgress?.report(st.scanned?'Проверяю новые письма':'Читаю почту: чеки, подписки и продления');
  try{const r=await s.mailRecords.scan({quiet:!!st.scanned});if(mode==='refresh')note='Прочитано писем: '+r.read+', новых записей: '+r.added+'. ';}
  catch(e){if(!st.records)return kit.reply(s,command,{by:BY,error:true,text:'Не удалось прочитать почту: '+e.message});note='Почту сейчас прочитать не удалось ('+e.message+'), показываю найденное раньше. ';}
 }
 const c=card(s,mode==='refresh'?'all':mode,now);
 return kit.reply(s,command,{by:BY,text:note+c.text,data:c.card});
}
async function turn(s,command,deps={}){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!wants(text))return null;
 if(!s.mailRecords)return kit.reply(s,command,{by:BY,error:true,text:'Записи из почты ещё загружаются. Повторите через минуту.'});
 const mode=intent(text);
 const st=s.mailRecords.status();
 if(!st.connected)return kit.reply(s,command,{by:BY,question:true,text:'Подписки ищутся в почте, а она не подключена. Подключите Gmail или Outlook в «Подключения → Почта» и повторите вопрос.'});
 if(!st.enabled)return ask({text:CONSENT,label:BY,options:['Включить и прочитать почту','Не сейчас'],strictChoices:true},a=>{
  if(!/включить/iu.test(String(a)))return kit.reply(s,command,{by:BY,text:'Хорошо, почту не читаю. Включить можно в настройках «Подписок и продлений».'});
  s.mailRecords.enable(true);
  return answer(s,command,mode,deps);
 });
 return answer(s,command,mode,deps);
}

// --- Renderer calls --------------------------------------------------------------------------------------------------
function setup(s){
 return {ipc:{
  async refresh(){if(!s.mailRecords)throw Error('Записи из почты ещё загружаются.');const r=await s.mailRecords.scan();return {...r,...card(s,'all',Date.now()).card};},
  // «Не подписка»: hides a merchant from this app (the records stay for other apps); 'show' brings it back.
  hide(merchant,show=false){
   const k=merchantKey(merchant);if(!k)throw Error('Нет сервиса.');
   const list=hidden(s).filter(x=>x!==k);if(!show)list.push(k);
   s.saveSettings({subscriptionsHidden:JSON.stringify(list.slice(-200))});return {ok:true};
  }
 }};
}
function validate(next){
 if(next.subscriptionsHidden===undefined)return;
 let v;try{v=JSON.parse(next.subscriptionsHidden||'[]');}catch{v=[];}
 next.subscriptionsHidden=JSON.stringify((Array.isArray(v)?v:[]).filter(x=>typeof x==='string'&&x.length<=80).slice(-200));
 if(next.subscriptionsHidden.length>2000)throw Error('Слишком много скрытых сервисов в «Подписках и продлениях».');
}
module.exports={name:'subscriptionsApp',defaults:{['extension_'+ID]:'false',subscriptionsHidden:'[]'},validate,setup,turn,wants,intent,summary,remindText,card};
