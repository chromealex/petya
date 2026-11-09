// «VK Teams» against a fake VK Teams Bot API on localhost (GET <api>/<method>?token=…, `ok` answers, events/get with
// lastEventId): routing and near-misses (ВКонтакте, Microsoft Teams, other messengers, building bots), not added / not
// connected / no chats yet, the event store (new, edited, deleted messages, replies grouped into threads, the bot's own
// messages, file mode, bounded), syncing only after the last event id, a new token starting a new store, the digest
// with verbatim themes and the «since the bot joined» note, threads by id and by choice, search over the received
// messages, sending only from a card with the exact text and chat (once; a thread reply with replyMsgId), a failing
// service with stored messages, share-message, the messenger-source contract, validation and the offers.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/vk-teams/feature.cjs');
const client=require('../src/extensions/vk-teams/client.cjs');
const store=require('../src/extensions/vk-teams/store.cjs');
const share=require('../src/extensions/vk-teams/share-message.cjs');
const offer=require('../src/extensions/vk-teams/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const M=require('../src/features/messenger-sources.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const TOKEN='x'.repeat(24),OTHER='y'.repeat(24);
const NOW=Date.now(),sec=min=>Math.floor((NOW-min*60000)/1000);
const GROUP={chatId:'681@chat.agent',type:'group',title:'Релизы'},PRIVATE={chatId:'ivan@corp.example',type:'private',firstName:'Иван'};
const OLGA={userId:'olga@corp.example',firstName:'Оля',lastName:'Котова'},IVAN={userId:'ivan@corp.example',firstName:'Иван'},BOT={userId:'1000000001',firstName:'Петя'};
const msg=(type,msgId,chat,from,text,min,extra={})=>({type,payload:{msgId,chat,from,text,timestamp:sec(min),...extra}});
const reply=to=>({parts:[{type:'reply',payload:{message:{msgId:to,from:OLGA,text:'…',timestamp:sec(30)}}}]});
const EVENTS=[
 {type:'newChatMembers',payload:{chat:GROUP,newMembers:[BOT],addedBy:OLGA}},
 msg('newMessage','7001',GROUP,OLGA,'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',20),
 msg('newMessage','7002',GROUP,IVAN,'Ок, допилю оплату',15,reply('7001')),
 msg('newMessage','7003',GROUP,OLGA,'Changelog за мной',12,reply('7002')),
 msg('editedMessage','7002',GROUP,IVAN,'Ок, допилю экран оплаты',15,reply('7001')),
 msg('newMessage','7004',PRIVATE,IVAN,'Привет, бот',11),
 msg('newMessage','7005',GROUP,IVAN,'опечатка',10),
 {type:'deleteMessage',payload:{msgId:'7005',chat:GROUP,timestamp:sec(9)}},
 msg('newMessage','7006',GROUP,BOT,'Сводка готова',8),
 msg('newMessage','7007',GROUP,OLGA,'Кто ревьюит матчмейкинг? <b>срочно</b>',5,{parts:[{type:'file',payload:{fileId:'f1',type:'image',caption:''}}]})
].map((e,i)=>({eventId:i+1,...e}));
const calls=[];
let down=false;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x'),q=Object.fromEntries(u.searchParams);
 const send=b=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 calls.push({path:u.pathname,query:q});
 if(down){res.writeHead(502);return res.end('bad gateway');}
 if(![TOKEN,OTHER].includes(q.token))return send({ok:false,description:'Invalid token'});
 const m=u.pathname.replace(/^\/bot\/v1\//,'');
 if(m==='self/get')return send({ok:true,userId:q.token===TOKEN?BOT.userId:'2000000002',nick:q.token===TOKEN?'petya_bot':'other_bot',firstName:'Петя'});
 if(m==='events/get'){
  if(q.token===OTHER)return send({ok:true,events:[]});
  const after=Number(q.lastEventId)||0;return send({ok:true,events:EVENTS.filter(e=>e.eventId>after).slice(0,5)});
 }
 if(m==='messages/sendText'){if(q.chatId==='nope@chat.agent')return send({ok:false,description:'Chat not found'});return send({ok:true,msgId:'9'+String(calls.length).padStart(3,'0')});}
 res.writeHead(404);res.end('{}');
});
async function request(url,{timeoutMs,...o}={}){
 const r=await fetch(url,o);
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;throw e;}
 return r.json();
}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const API='http://127.0.0.1:'+server.address().port+'/bot/v1';
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-vkteams-'));
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];
 const settings={'extension_vk-teams':'true',vkTeamsApi:API,vkTeamsToken:TOKEN,ollamaUrl:'http://127.0.0.1:11434/api/chat'};
 const s={settings,dataRoot,smoke:true,requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}},
  async request(url,o={}){if(url.includes('11434')){const next=model.shift();assert.ok(next,'unexpected model call');return {message:{content:JSON.stringify(next)}};}return request(url,o);}};
 try{
  // --- Routing -------------------------------------------------------------------------------------------------------
  for(const t of ['что нового в VK Teams?','что писали в чате «Релизы» в вк тимс за неделю','перескажи тред про оплату в VK Teams','найди в VK Teams про сборку','отправь в VK Teams в чат «Релизы»: билд 2.3 готов','что нового в myteam'])assert.equal(app.wanted(t),true,t);
  for(const t of ['что нового во вконтакте','опубликуй пост во ВКонтакте про акцию','что пишут в группе вк','реклама в вк','встреча в тимс','что было на звонке в Microsoft Teams','что нового в слаке','что нового в mattermost','напиши бота для vk teams','vk teams не работает','установи vk teams','что такое VK Teams','найди везде про оплату в vk teams','бот для вк тимс на python'])assert.equal(app.wanted(t),false,t);
  assert.equal(await app.turn({...s,settings:{...settings,'extension_vk-teams':'false'}},'что нового в VK Teams'),null);
  let r=await app.turn({...s,settings:{...settings,vkTeamsToken:''}},'что нового в VK Teams');
  assert.equal(r.question,true);assert.match(r.text,/@metabot/);
  assert.equal(calls.length,0);

  // --- Sync: events after the last id, edits, deletes, replies as threads ---------------------------------------------
  r=await app.turn(s,'что нового в VK Teams');
  assert.deepEqual(calls.filter(c=>c.path.endsWith('events/get')).map(c=>[c.query.lastEventId,c.query.pollTime]),[['0','0'],['5','0'],['10','0']]);
  assert.equal(calls[0].path,'/bot/v1/self/get','the bot is identified once per token');
  const st=store.read(dataRoot);
  assert.equal(st.lastEventId,10);
  assert.deepEqual(Object.values(st.chats).map(c=>[c.id,c.title,c.kind]).sort(),[['681@chat.agent','Релизы','group'],['ivan@corp.example','Иван','direct']]);
  assert.deepEqual(st.messages.map(m=>[m.id,m.thread,m.bot]),[['7001',null,false],['7002','7001',false],['7003','7001',false],['7004',null,false],['7006',null,true],['7007',null,false]]);
  assert.equal(st.messages.find(m=>m.id==='7002').text,'Ок, допилю экран оплаты');
  assert.equal(st.messages.find(m=>m.id==='7007').files,1);
  if(process.platform!=='win32')assert.equal(fs.statSync(store.file(dataRoot)).mode&0o777,0o600);
  const card=r.extensionData.vkTeamsCard;
  assert.equal(card.mode,'digest');assert.equal(card.total,5,'the bot\'s own message is not counted');
  assert.deepEqual(card.channels.map(c=>[c.name,c.count]).sort(),[['Иван',1],['Релизы',4]]);
  assert.deepEqual(card.threads.map(t=>[t.id,t.replies]),[['7001',2]]);
  assert.equal(card.themes,null);assert.match(card.latest.find(x=>x.text.includes('матчмейкинг')).text,/<b>/);
  // Again within 30 s: no new request; later, only after the last event id.
  const n=calls.length;await app.turn(s,'что нового в VK Teams');assert.equal(calls.length,n);
  const saved=store.read(dataRoot);saved.syncedAt=0;store.write(dataRoot,saved);
  await app.turn(s,'что нового в VK Teams');
  assert.deepEqual(calls.slice(n).map(c=>[c.path,c.query.lastEventId]),[['/bot/v1/events/get','10']]);

  // --- Digest with the model and the «since the bot joined» note ----------------------------------------------------------
  settings.model='qwen3:4b';
  model.push({themes:[{title:'Перенос релиза',messages:[1,2,3,4],quotes:['Релиз 2.3 переносим на пятницу','так никто не писал']}]});
  r=await app.turn(s,'что писали в чате «Релизы» в вк тимс за неделю');
  const week=r.extensionData.vkTeamsCard;
  assert.deepEqual(week.channels.map(c=>c.name),['Релизы']);assert.equal(week.days,7);
  assert.deepEqual(week.themes[0].quotes.map(q=>q.text),['Релиз 2.3 переносим на пятницу']);
  assert.ok(week.notes.some(x=>/с момента подключения/.test(x)));
  await assert.rejects(app.turn(s,'что нового в VK Teams в чате Маркетинг'),e=>{assert.ok(e instanceof InputRequired);assert.deepEqual(e.spec.options.sort(),['Иван','Релизы']);assert.equal(e.spec.strictChoices,true);return true;});

  // --- Threads ------------------------------------------------------------------------------------------------------------
  model.push({summary:'Релиз перенесли на пятницу.',points:[{kind:'task',text:'Changelog — Оля',message:3,quote:'Changelog за мной'}]});
  r=await app.turn(s,'перескажи тред #7001 в VK Teams');
  let t=r.extensionData.vkTeamsCard;
  assert.equal(t.mode,'thread');assert.equal(t.thread.id,'7001');assert.equal(t.thread.replies,2);assert.equal(t.limit,client.LIMIT);
  assert.deepEqual(t.thread.points.map(p=>[p.quote.text,p.quote.verbatim]),[['Changelog за мной',true]]);
  model.push({summary:'Про оплату.',points:[]});
  r=await app.turn(s,'перескажи тред про оплату в VK Teams');
  assert.equal(r.extensionData.vkTeamsCard.thread.id,'7001');
  r=await app.turn(s,'перескажи тред #123456 в VK Teams');
  assert.match(r.text,/такого треда/);

  // --- Search over the received messages ------------------------------------------------------------------------------------
  settings.model='';
  r=await app.turn(s,'найди в VK Teams про оплату');
  const found=r.extensionData.vkTeamsCard;
  assert.equal(found.mode,'search');assert.equal(found.query,'оплату');
  assert.deepEqual(found.results.map(x=>x.id).sort(),['7001','7002']);assert.equal(found.scope,'сообщения, полученные ботом');

  // --- Sending ----------------------------------------------------------------------------------------------------------------
  await assert.rejects(app.turn(s,'отправь в VK Teams: билд готов'),e=>{assert.deepEqual(e.spec.options.sort(),['Иван','Релизы']);r=e;return true;});
  const composed=(await r.resume('Релизы')).extensionData.vkTeamsCompose;
  assert.deepEqual([composed.channel.id,composed.text],['681@chat.agent','билд готов']);
  assert.equal(calls.filter(c=>c.path.endsWith('sendText')).length,0,'nothing is sent from the chat');
  r=await app.turn(s,'отправь в VK Teams в чат «Релизы»: билд 2.3 готов');
  assert.equal(r.extensionData.vkTeamsCompose.channel.name,'Релизы');assert.equal(r.extensionData.vkTeamsCompose.text,'билд 2.3 готов');
  const {ipc}=app.setup(s);
  await assert.rejects(ipc.send({card:composed.id,channel:'ivan@corp.example'},'x'),/Чат не совпадает/);
  const [a,b]=await Promise.allSettled([ipc.send({card:composed.id,channel:'681@chat.agent'},'Билд готов!'),ipc.send({card:composed.id,channel:'681@chat.agent'},'Билд готов!')]);
  assert.equal(a.status,'fulfilled');assert.equal(b.status,'rejected');
  assert.deepEqual(calls.filter(c=>c.path.endsWith('sendText')).map(c=>[c.query.chatId,c.query.text,c.query.replyMsgId,c.query.token]),[['681@chat.agent','Билд готов!',undefined,TOKEN]]);
  await assert.rejects(ipc.send({card:composed.id,channel:'681@chat.agent'},'ещё'),/уже отправлено/);
  const threadCard=topic.messages.map(m=>m.extensionData?.vkTeamsCard).find(c=>c?.mode==='thread');
  await ipc.send({card:threadCard.id,root:'7001'},'Готово');
  assert.deepEqual(calls.filter(c=>c.path.endsWith('sendText')).at(-1).query.replyMsgId,'7001');
  await assert.rejects(ipc.send({card:threadCard.id,root:'7002'},'x'),/только в тред/);

  // --- Failures: stored messages still answer with a note; nothing stored → an error --------------------------------------
  down=true;const late=store.read(dataRoot);late.syncedAt=0;store.write(dataRoot,late);
  r=await app.turn(s,'что нового в VK Teams');
  assert.ok(r.extensionData.vkTeamsCard.notes.some(x=>/Не удалось обновить VK Teams/.test(x)));
  down=false;
  // Another bot: a new store, the old messages are not shown as this bot's.
  settings.vkTeamsToken=OTHER;
  r=await app.turn(s,'что нового в VK Teams');
  assert.equal(r.question,true);assert.match(r.text,/ещё не видел ни одного чата/);
  assert.equal(store.read(dataRoot).messages.length,0);
  settings.vkTeamsToken='z'.repeat(24);
  r=await app.turn(s,'что нового в VK Teams');
  assert.equal(r.error,true);assert.match(r.text,/не принял токен/);
  settings.vkTeamsToken=TOKEN;
  assert.equal(ipc.status().chats.length,0);
  const synced=await ipc.sync();assert.equal(synced.bot,'petya_bot');assert.equal(synced.chats.length,2);assert.equal(synced.error,'');
  assert.equal(ipc.forget().chats.length,0);assert.equal(fs.existsSync(store.file(dataRoot)),false);

  // --- share-message, messenger source, validation ---------------------------------------------------------------------------
  assert.equal(share.ready(settings),true);
  assert.deepEqual(await share.run(s,{text:'Патч 4.13\r\n- фикс'}),{ask:'Отправь в VK Teams: Патч 4.13\n- фикс',send:true});
  const reg=M.create(s);
  const listed=reg.list().find(x=>x.id==='vk-teams');assert.ok(listed&&listed.search&&listed.thread&&!listed.presence&&!listed.memory);
  await ipc.sync();
  await assert.rejects(reg.messages('vk-teams',{channel:'nope@chat.agent'}),/не состоит/);
  assert.equal(client.apiBase(''),client.DEFAULT_API);
  assert.equal(client.apiBase('http://teams.example.com/bot/v1'),'');
  assert.equal(client.apiBase('https://teams.example.com/bot/v1/'),'https://teams.example.com/bot/v1');
  assert.throws(()=>app.validate({vkTeamsApi:'ftp://x'}),/Адрес Bot API/);
  assert.throws(()=>app.validate({vkTeamsToken:'короткий'}),/токен бота/);
  app.validate({vkTeamsApi:'',vkTeamsToken:TOKEN});
  // Background sync while settings are closed: one notification per new error, one for the recovery, none when quiet.
  const published=[],quiet=app.background(s,x=>published.push(x));
  let st2=store.read(dataRoot);st2.syncedAt=0;store.write(dataRoot,st2);
  down=true;await quiet();await quiet();down=false;await quiet();await quiet();
  assert.deepEqual(published.map(x=>[x.id,x.kind]),[['vk-teams-sync','error'],['vk-teams-sync','success']]);
  await app.background({...s,settings:{...settings,'extension_vk-teams':'false'}},x=>published.push(x))();
  assert.equal(published.length,2,'not added → no sync, no notification');
  app.teardown();

  // --- Offers: VK Teams by name only; ВКонтакте is not it; Microsoft Teams does not take VK Teams --------------------------
  const all=offers.load();
  const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings:{}}));return d?d.one?d.one.offer.id:d.tie.map(x=>x.offer.id).join('+'):null;};
  for(const t of ['что нового в VK Teams','перескажи тред в вк тимс','отправь в vk teams: билд готов'])assert.equal(pick(t),'vk-teams',t);
  for(const t of ['опубликуй пост во вконтакте','что пишут в группе вконтакте про акцию','реклама вконтакте за неделю'])assert.notEqual(pick(t),'vk-teams',t);
  assert.equal(pick('встреча в тимс'),'teams');
  console.log('VK Teams: routing and near-misses (ВКонтакте, Microsoft Teams, other messengers, bots), not added/not connected/no chats, event store with edits, deletes, reply threads and own messages, sync after the last event id, new token new store, digest with verbatim themes and the since-joined note, threads by id and choice, search, send only from the card once with replyMsgId in threads, failures with stored messages, share-message, messenger source, validation, offers passed');
 }finally{server.close();fs.rmSync(dataRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
