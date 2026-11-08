// «Поддержка игроков»: routing and near-misses, not added / not connected, the source registry (Zendesk as the first
// `support-source`), the overview from stubbed Zendesk Search (tiles, SLA, per-day by status, problems with verbatim
// quotes, a topic filter), the model-free card, a reply draft grounded in the ticket and Help Center with refund
// promises removed unless a macro offers them, sending only from the card with exact text, service errors, the offer.
const assert=require('node:assert/strict');
const app=require('../src/extensions/support/feature.cjs');
const a=require('../src/extensions/support/analysis.cjs');
const zendesk=require('../src/extensions/support/zendesk.cjs');
const registry=require('../src/extensions/support/sources.cjs');
const offer=require('../src/extensions/support/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 const now=Date.now(),H=3600000;
 const iso=ms=>new Date(ms).toISOString();
 const ticket=(id,subject,description,status,priority,createdHoursAgo,extra={})=>({id,subject,description,status,priority,created_at:iso(now-createdHoursAgo*H),updated_at:iso(now-(extra.updatedHoursAgo??createdHoursAgo)*H),requester_id:100+id,tags:extra.tags||[],via:{channel:'web'},result_type:'ticket',...(extra.sla?{slas:{policy_metrics:[{metric:'first_reply_time',stage:'active',breach_at:iso(now+extra.sla*H)}]}}:{})});
 const open=[
  ticket(1201,'Не пришли кристаллы','Оплатил пакет кристаллов за 499 рублей, деньги списали, а кристаллы не пришли.','new','urgent',30),
  ticket(1202,'Списали дважды','Списали деньги два раза за одну покупку. Верните, пожалуйста.','open','high',5,{sla:-1}),
  ticket(1203,'Вылет на загрузке','Игра вылетает на загрузке после обновления 4.13, Samsung A52.','open','normal',3,{sla:6}),
  ticket(1204,'Не могу войти','Не могу войти в аккаунт после смены телефона.','pending','normal',50,{updatedHoursAgo:20}),
 ];
 const solved=[ticket(1190,'Где промокод','Где ввести промокод?','solved','low',72),ticket(1191,'Покупка не прошла','Покупка не прошла, но деньги списали','closed','normal',100)];
 const users=[...open,...solved].map(t=>({id:t.requester_id,name:'Игрок '+t.id,role:'end-user'})).concat([{id:7,name:'Оля (поддержка)',role:'agent'}]);
 const calls=[];let failWith=null,macroList=[];
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}},
  async request(url,options={}){
   if(url.includes('11434')){const next=model.shift();assert.ok(next,'unexpected model call: '+JSON.parse(options.body).messages.at(-1).content.slice(0,300));return {message:{content:JSON.stringify(typeof next==='function'?next(JSON.parse(options.body)):next)}};}
   calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,auth:options.headers?.Authorization});
   if(failWith)throw failWith;
   const u=new URL(url);assert.equal(u.origin,'https://mystudio.zendesk.com');
   if(u.pathname==='/api/v2/search.json'){
    const q=u.searchParams.get('query');assert.equal(u.searchParams.get('include'),'tickets(users,slas)');
    if(q==='type:ticket status<solved')return {results:open,users,next_page:null,count:open.length};
    if(/^type:ticket created>\d{4}-\d\d-\d\d$/.test(q))return {results:[...open.filter(t=>Date.parse(t.created_at)>now-8*24*H),...solved],users,next_page:null};
    throw Error('unexpected query '+q);
   }
   if(u.pathname==='/api/v2/tickets/1201.json'&&(options.method||'GET')==='GET')return {ticket:open[0],users};
   if(u.pathname==='/api/v2/tickets/9999.json')throw Object.assign(Error('HTTP 404'),{status:404});
   if(u.pathname==='/api/v2/tickets/1201/comments.json')return {comments:[{id:1,author_id:1301,public:true,plain_body:'Оплатил пакет кристаллов за 499 рублей, деньги списали, а кристаллы не пришли.',created_at:iso(now-30*H)},{id:2,author_id:7,public:false,plain_body:'Проверить транзакцию в биллинге',created_at:iso(now-29*H)}],users};
   if(u.pathname==='/api/v2/help_center/articles/search.json'){assert.equal(u.searchParams.get('query'),'Не пришли кристаллы');return {results:[{title:'Покупка не пришла',html_url:'https://mystudio.zendesk.com/hc/ru/articles/360001',snippet:'Если <em>покупка</em> не пришла, перезапустите игру'}]};}
   if(u.pathname==='/api/v2/macros/active.json')return {macros:macroList};
   if(u.pathname==='/api/v2/tickets/1201.json'&&options.method==='PUT')return {ticket:{...open[0],status:'open'}};
   throw Error('unexpected '+u.pathname);
  }};

 // --- Routing ---------------------------------------------------------------------------------------------------------
 for(const t of ['что жалуются в поддержку','тикеты про оплату за неделю','ответь на тикет 1234','сколько тикетов просрочено','что в Zendesk','обращения игроков за сегодня'])assert.equal(app.wanted(t),true,t);
 for(const t of ['поддержка Unity','как написать в поддержку Unity','техподдержка Пети','отзывы в сторах','поддержи меня','спасибо за поддержку, поддержите идею','поддерживает ли Unity формат webp','создай тикет в Jira','тикеты спринта в джире','что такое Zendesk'])assert.equal(app.wanted(t),false,t);
 assert.equal(app.ticketId('ответь на тикет 1234'),'1234');assert.equal(app.ticketId('ответь на тикет №77'),'77');assert.equal(app.ticketId('ответь на тикет #5'),'5');
 assert.equal(await app.turn(s,'что жалуются в поддержку'),null,'not added: nothing here');
 s.settings.extension_support='true';
 for(const t of ['поддержка Unity','отзывы в сторах'])assert.equal(await app.turn(s,t),null,t);
 let r=await app.turn(s,'что жалуются в поддержку');
 assert.equal(r.question,true);assert.match(r.text,/Настройки → Поддержка игроков/);assert.match(r.text,/API-токен/);

 // --- The registry: Zendesk is a support source declared in "provides" ---------------------------------------------------
 const loaded=registry.load();
 assert.deepEqual(loaded.map(x=>[x.id,x.extension]),[['zendesk','support']]);
 assert.equal(zendesk.subdomain('https://MyStudio.zendesk.com/agent/'),'mystudio');assert.throws(()=>zendesk.subdomain('my studio'),/Поддомен/);
 assert.throws(()=>app.validate({supportSlaHours:'0'}),/SLA/);assert.throws(()=>app.validate({supportZendeskEmail:'nope'}),/Email/);
 Object.assign(s.settings,{supportZendeskSubdomain:'mystudio',supportZendeskEmail:'agent@studio.com',supportZendeskToken:'tok123',supportSlaHours:'24'});
 assert.equal(registry.create(s).list().length,1);

 // --- Overview with the model ----------------------------------------------------------------------------------------------
 model=[body=>{const list=body.messages.at(-1).content;assert.match(list,/Списали дважды — Списали деньги два раза/);
  const num=t=>Number(list.split('\n').find(l=>l.includes(t)).split('.')[0]);
  return {clusters:[{title:'Деньги списали, покупка не пришла',tickets:[num('кристаллов'),num('дважды'),num('не прошла')],quotes:['деньги списали, а кристаллы не пришли','верните деньги немедленно']},{title:'Вылеты',tickets:[num('Вылет')],quotes:['вылетает на загрузке после обновления 4.13']},{title:'',tickets:[1],quotes:[]}]};}];
 r=await app.turn(s,'что жалуются в поддержку');
 const card=r.extensionData.supportCard;
 assert.equal(card.mode,'overview');
 assert.deepEqual(card.tiles,{open:4,overdue:2,today:card.tiles.today,urgent:2},'1201: new for 30h > 24h target; 1202: breached its Zendesk SLA; 1204 pending does not tick');
 assert.equal(card.tickets[0].overdue,true);assert.deepEqual(card.tickets.map(t=>t.id).slice(0,2),['1201','1202'],'overdue first, then priority');
 assert.equal(card.tickets.find(t=>t.id==='1203').slaLeft,6);assert.equal(card.tickets.find(t=>t.id==='1204').slaLeft,null);
 assert.equal(card.tickets[0].requester,'Игрок 1201');assert.equal(card.tickets[0].url,'https://mystudio.zendesk.com/agent/tickets/1201');
 assert.equal(card.clusters.length,2);assert.deepEqual(card.clusters[0].quotes.map(q=>q.text),['деньги списали, а кристаллы не пришли'],'an invented quote is dropped');
 assert.equal(card.clusters[0].count,3);
 const total=card.daily.reduce((n,d)=>n+d.new+d.open+d.pending+d.hold+d.solved,0);assert.equal(total,6,'per-day by status covers the fetched tickets');
 assert.equal(card.daily.length,7);
 assert.match(r.text,/^Поддержка игроков: открыто 4, просрочено по SLA 2, новых сегодня \d+; за 7 дней — 6 тикетов\. Чаще всего: деньги списали, покупка не пришла \(3\)/);
 assert.ok(calls.every(c=>c.auth==='Basic '+Buffer.from('agent@studio.com/token:tok123').toString('base64')));

 // --- A topic filter, without a model: problems by words with real sentences ------------------------------------------------
 s.settings.model='';
 r=await app.turn(s,'тикеты про оплату за неделю');
 const pay=r.extensionData.supportCard;
 assert.equal(pay.topic.id,'payment');assert.deepEqual(pay.tickets.map(t=>t.id).sort(),['1191','1201','1202']);
 assert.equal(pay.clustersByModel,false);assert.equal(pay.clusters[0].title,'Оплата и покупки');
 assert.ok(pay.clusters[0].quotes.every(q=>[...open,...solved].some(t=>t.description.includes(q.text)||t.subject.includes(q.text))),'model-free quotes are real sentences');
 s.settings.model='qwen3:4b';

 // --- Reply: grounded draft, refund promise removed without a macro, KB linked; nothing sent from the turn ---------------------
 model=[body=>{const u=JSON.parse(body.messages.at(-1).content);assert.equal(u.ticket.subject,'Не пришли кристаллы');assert.equal(u.articles[0].url,'https://mystudio.zendesk.com/hc/ru/articles/360001');assert.equal(u.thread.length,2);
  return {reply:'Здравствуйте! Спасибо, что написали. Мы вернём вам деньги в течение суток. Пожалуйста, перезапустите игру — обычно покупка приходит после этого.',articles:[]};}];
 const puts=()=>calls.filter(c=>c.method==='PUT').length;
 r=await app.turn(s,'ответь на тикет 1201');
 const rc=r.extensionData.supportCard;
 assert.equal(rc.mode,'reply');assert.equal(rc.ticket.id,'1201');assert.equal(rc.thread[1].public,false);assert.equal(rc.thread[1].agent,true);
 assert.doesNotMatch(rc.draft,/вернём вам деньги/,'refund promise removed without a macro');
 assert.deepEqual(rc.removed,['Мы вернём вам деньги в течение суток.']);
 assert.match(rc.draft,/^Здравствуйте! Спасибо, что написали\. Пожалуйста, перезапустите игру/);
 assert.match(rc.draft,/Подробнее: https:\/\/mystudio\.zendesk\.com\/hc\/ru\/articles\/360001$/,'the knowledge base is linked');
 assert.match(r.text,/Обещание возврата/);assert.equal(puts(),0,'nothing is sent from a chat turn');
 // A macro that offers compensation lets the draft keep it.
 macroList=[{title:'Компенсация за сбой покупки',actions:[{field:'comment_value',value:'Мы начислим компенсацию 100 кристаллов.'}]}];
 model=[{reply:'Мы начислим компенсацию 100 кристаллов. См. https://mystudio.zendesk.com/hc/ru/articles/360001',articles:[1]}];
 r=await app.turn(s,'ответь на тикет 1201');
 assert.match(r.extensionData.supportCard.draft,/начислим компенсацию/);assert.equal(r.extensionData.supportCard.refundAllowed,true);
 assert.doesNotMatch(r.extensionData.supportCard.draft,/Подробнее/,'no second link when the draft links the article');
 macroList=[];
 // No ticket number: asked; an unknown ticket is reported.
 await assert.rejects(app.turn(s,'ответь на тикет игрока'),e=>e instanceof InputRequired&&/номер/.test(e.message));
 r=await app.turn(s,'ответь на тикет 9999');assert.equal(r.error,true);assert.match(r.text,/не нашёл тикет/);

 // --- Sending: exactly the edited text, as a public comment; never twice; only the card's ticket -----------------------------
 const ipc=app.setup(s).ipc;
 await assert.rejects(ipc.send({card:rc.id,source:'zendesk',id:'1202'},'x'),/не совпадает/);
 await assert.rejects(ipc.send({card:rc.id,source:'zendesk',id:'1201'},'  '),/текст ответа/);
 const sent=await ipc.send({card:rc.id,source:'zendesk',id:'1201'},'Здравствуйте! Проверили платёж — кристаллы уже начислены.');
 const put=calls.filter(c=>c.method==='PUT').at(-1);
 assert.equal(put.url,'https://mystudio.zendesk.com/api/v2/tickets/1201.json');
 assert.deepEqual(put.body,{ticket:{comment:{body:'Здравствуйте! Проверили платёж — кристаллы уже начислены.',public:true}}});
 assert.equal(sent.text,'Ответ отправлен в тикет #1201.');
 await assert.rejects(ipc.send({card:rc.id,source:'zendesk',id:'1201'},'ещё раз'),/уже отправлен/);
 await assert.rejects(ipc.send({card:card.id,source:'zendesk',id:'1201'},'x'),/Карточка тикета/,'an overview card cannot send');

 // --- Errors and analysis helpers ------------------------------------------------------------------------------------------------
 failWith=Object.assign(Error('HTTP 401'),{status:401});r=await app.turn(s,'что в поддержке');failWith=null;
 assert.equal(r.error,true);assert.match(r.text,/не принял email и API-токен/);
 assert.equal(a.guard('Вернём деньги.\n\nПерезапустите игру.',[]).text,'Перезапустите игру.');
 assert.equal(a.guard('Привет.\n\nПерезапустите игру.',[]).text,'Привет.\n\nПерезапустите игру.','paragraphs survive');

 // --- The offer -------------------------------------------------------------------------------------------------------------------
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:offers.load(),settings:{}}));return d?.one?.offer.id||d?.tie?.map(x=>x.offer.id).join(',')||null;};
 for(const t of ['что жалуются в поддержку','покажи тикеты в Zendesk','ответь на тикет 1234'])assert.equal(offered(t),'support',t);
 for(const t of ['поддержка Unity','техподдержка Пети','отзывы в сторах','поддержи меня','тикет в Jira'])assert.notEqual(offered(t),'support',t);
 assert.equal(offer.ready(s.settings),true);assert.equal(offer.ready({extension_support:'true'}),false);
 console.log('Support: routing and near-misses, not added/not connected, support-source registry, overview with SLA/tiles/per-day/problems with verbatim quotes, topic filter, model-free problems, grounded reply with refund guard and KB link, send only from the card, errors, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
