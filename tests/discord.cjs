// «Discord»: routing and near-misses, not added / not connected, the digest from stubbed REST (channels, threads,
// pins, unread since the last digest), verbatim quotes and pinned-grounded FAQ answers from the model, the
// model-free card, Message Content Intent detection, sending only through a card with the exact text and channel,
// never a guessed channel, the share-message provider, service errors and the offer.
const assert=require('node:assert/strict');
const app=require('../src/extensions/discord/feature.cjs');
const client=require('../src/extensions/discord/client.cjs');
const digest=require('../src/extensions/discord/digest.cjs');
const offer=require('../src/extensions/discord/offer.cjs');
const share=require('../src/extensions/discord/share-message.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 const GUILD='900000000000000001',GENERAL='900000000000000010',BUGS='900000000000000011',NEWS='900000000000000012',FORUM='900000000000000013',THREAD='900000000000000020';
 const now=Date.now();
 const sf=ms=>client.snowflakeAt(new Date(ms));
 let n=0;
 const msg=(minutesAgo,author,content,extra={})=>{const at=now-minutesAgo*60000;return {id:String(BigInt(sf(at))+BigInt(++n)),type:0,content,timestamp:new Date(at).toISOString(),author:{id:'1',username:author.toLowerCase(),global_name:author},attachments:[],embeds:[],...extra};};
 const general=[msg(10,'Vasya','Когда выйдет новый сезон?'),msg(30,'Petr','Когда будет новый сезон? Уже скучно'),msg(50,'Anna','Игра вылетает после обновления на Samsung A52'),msg(70,'Bot','Daily reward!',{author:{id:'2',username:'mee6',bot:true}}),msg(90,'Kolya','Спасибо за ивент, очень круто!'),msg(3000,'Old','как получить скин дракона?')];
 const bugs=[msg(20,'Dima','После патча вылетает на загрузке 87%'),msg(40,'Lena','Магазин не открывается, ошибка 502')];
 const thread=[msg(15,'Ivan','Где взять ключи от бункера?')];
 const pins=[{pinned_at:new Date().toISOString(),message:msg(9000,'Mod','Новый сезон стартует 20 ноября. Скин дракона — в событии «Пламя».')}];
 const calls=[];
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[],failWith=null,hidden=false;
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},saved:[],
  saveSettings(patch){this.saved.push(patch);Object.assign(this.settings,patch);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}},
  async request(url,options={}){
   if(url.includes('11434')){const next=model.shift();assert.ok(next,'unexpected model call: '+JSON.parse(options.body).messages.at(-1).content.slice(0,200));return {message:{content:JSON.stringify(typeof next==='function'?next(JSON.parse(options.body)):next)}};}
   calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,auth:options.headers?.Authorization});
   if(failWith)throw failWith;
   const u=new URL(url);assert.ok(url.startsWith('https://discord.com/api/v10/'),'Discord REST only: '+url);
   const p=u.pathname.replace('/api/v10','');
   const hide=list=>hidden?list.map(m=>m.author.bot?m:{...m,content:''}):list;
   if(p==='/channels/'+GENERAL+'/messages'&&(options.method||'GET')==='GET')return hide(general);
   if(p==='/channels/'+BUGS+'/messages'&&(options.method||'GET')==='GET')return hide(bugs);
   if(p==='/channels/'+THREAD+'/messages')return hide(thread);
   if(p==='/channels/'+NEWS+'/messages'&&options.method==='POST')return {id:'900000000000000099',timestamp:new Date().toISOString()};
   if(p==='/channels/'+GENERAL+'/messages'&&options.method==='POST')return {id:'900000000000000098',timestamp:new Date().toISOString()};
   if(p.endsWith('/messages')&&(options.method||'GET')==='GET')return [];
   if(p==='/guilds/'+GUILD+'/threads/active')return {threads:[{id:THREAD,parent_id:FORUM,name:'Ключи от бункера',last_message_id:thread[0].id,message_count:1},{id:'900000000000000021',parent_id:'900000000000000777',name:'чужая ветка',last_message_id:thread[0].id}],members:[]};
   if(p==='/channels/'+GENERAL+'/messages/pins')return {items:pins,has_more:false};
   if(p==='/channels/'+BUGS+'/messages/pins'){throw Object.assign(Error('HTTP 404'),{status:404});}
   if(p==='/channels/'+BUGS+'/pins')return [];
   if(p.endsWith('/pins'))return {items:[],has_more:false};
   throw Error('unexpected '+p);
  }};

 // --- Routing ---------------------------------------------------------------------------------------------------
 for(const t of ['что нового в дискорде','частые вопросы игроков','баги из дискорда','что пишут в Discord за неделю','отправь в дискорд: сервер перезапустится'])assert.equal(app.wanted(t),true,t);
 for(const t of ['дискорд не работает','discord не запускается','как подключить discord.js','напиши бота для дискорда на discord.py','что нового в слаке','что пишут в телеграме','частые вопросы в поддержке','установи дискорд','что такое discord','Discord Nitro подарок'])assert.equal(app.wanted(t),false,t);
 assert.equal(await app.turn(s,'что нового в дискорде'),null,'not added: nothing here');
 s.settings.extension_discord='true';
 for(const t of ['дискорд не работает','как подключить discord.js','что нового в слаке'])assert.equal(await app.turn(s,t),null,t);
 // Not connected: a question telling where to connect.
 let r=await app.turn(s,'что нового в дискорде');
 assert.equal(r.question,true);assert.match(r.text,/Developer Portal/);assert.match(r.text,/Message Content Intent/);assert.match(r.text,/Настройки → Discord/);
 // A fake bot token, assembled so the source holds no token-shaped string.
 s.settings.discordToken=['x'.repeat(24),'y'.repeat(6),'z'.repeat(27)].join('.');s.settings.discordGuild=GUILD;
 r=await app.turn(s,'что нового в дискорде');assert.equal(r.question,true);assert.match(r.text,/каналы/,'token without channels asks for channels');
 s.settings.discordGuildName='Bunker Wars';
 s.settings.discordChannels=JSON.stringify([{id:GENERAL,name:'general',type:0},{id:BUGS,name:'bug-reports',type:0},{id:NEWS,name:'announcements',type:5},{id:FORUM,name:'help',type:15}]);
 assert.throws(()=>app.validate({discordToken:'abc'}),/токен бота/);assert.throws(()=>app.validate({discordGuild:'12'}),/ID сервера/);app.validate({discordToken:s.settings.discordToken,discordGuild:GUILD});

 // --- Digest with the model: themes with verbatim quotes, FAQ answered only from a real pinned message ---------------
 s.settings.discordSeen=JSON.stringify({[GENERAL]:general[2].id});
 model=[
  body=>{const list=body.messages.at(-1).content;assert.match(list,/\[#general\] Vasya: Когда выйдет новый сезон\?/);assert.doesNotMatch(list,/Daily reward/,'bots are not players');
   const num=t=>Number(list.split('\n').find(l=>l.includes(t)).split('.')[0]);
   return {clusters:[{title:'Вылеты после патча',kind:'bug',sentiment:'negative',messages:[num('Samsung'),num('87%')],quotes:['вылетает на загрузке 87%','игра постоянно крашится у всех']},
    {title:'Ждут новый сезон',kind:'question',sentiment:'neutral',messages:[num('Vasya'),num('Petr')],quotes:['Когда будет новый сезон?']},{title:'',kind:'other',sentiment:'neutral',messages:[1],quotes:[]},{title:'Пустая',kind:'other',sentiment:'neutral',messages:[999],quotes:[]}]};},
  body=>{const c=body.messages.at(-1).content;assert.match(c,/Закреплённые сообщения:\n1\. \[#general\] Новый сезон стартует 20 ноября/);
   const num=t=>Number(c.split('\n').find(l=>l.includes(t)).split('.')[0]);
   return {faq:[{question:'Когда новый сезон?',messages:[num('Vasya'),num('Petr')],pin:1,answer:'Новый сезон стартует 20 ноября.'},{question:'Где ключи от бункера?',messages:[num('Ivan')],pin:7,answer:'Выдумано'}]};}];
 r=await app.turn(s,'что нового в дискорде');
 const card=r.extensionData.discordDigest;
 assert.equal(card.mode,'digest');assert.equal(card.days,null,'«что нового» = since the last digest');
 assert.equal(card.total,6,'players only, each channel since its own seen mark (3 days without one)');
 assert.deepEqual(card.channels.map(c=>[c.name,c.count,c.unread]),[['general',3,2],['bug-reports',2,2],['announcements',0,0],['help',1,1]]);
 assert.equal(card.clusters.length,2,'empty and invalid themes dropped');
 assert.deepEqual(card.clusters[0].quotes.map(q=>q.text),['вылетает на загрузке 87%'],'an invented quote is dropped');
 assert.equal(card.clusters[0].quotes[0].url,'https://discord.com/channels/'+GUILD+'/'+BUGS+'/'+bugs[0].id);
 assert.equal(card.faq[0].answer,'Новый сезон стартует 20 ноября.');assert.equal(card.faq[0].pin.url,'https://discord.com/channels/'+GUILD+'/'+GENERAL+'/'+pins[0].message.id);
 assert.equal(card.faq[0].latest.id,general[0].id,'a reply goes to the latest such question');
 assert.equal(card.faq[1].answer,'','an answer without a real pinned message is not kept');assert.equal(card.faq[1].thread,THREAD);
 assert.ok(card.mood.score<0&&card.mood.byModel);
 assert.match(r.text,/^Discord с прошлого просмотра: 6 сообщений игроков\. Главные темы: вылеты после патча \(2\)/);
 assert.ok(calls.some(c=>c.url.endsWith('/channels/'+BUGS+'/pins')),'legacy pins endpoint when the new one is missing');
 assert.ok(!calls.some(c=>c.url.includes('/channels/'+FORUM+'/messages')),'a forum is read through its posts (threads)');
 assert.ok(calls.every(c=>c.auth==='Bot '+s.settings.discordToken));
 assert.equal(JSON.parse(s.saved.at(-1).discordSeen)[GENERAL],general[0].id,'the digest marks the newest message as seen');

 // --- Bugs and FAQ modes; a named channel; the period ---------------------------------------------------------------
 model=[{clusters:[{title:'Вылеты',kind:'bug',sentiment:'negative',messages:[1],quotes:['После патча вылетает']},{title:'Похвала',kind:'praise',sentiment:'positive',messages:[2],quotes:[]}]}];
 r=await app.turn(s,'баги из дискорда в #bug-reports за неделю');
 assert.equal(r.extensionData.discordDigest.mode,'bugs');assert.equal(r.extensionData.discordDigest.days,7);
 assert.deepEqual(r.extensionData.discordDigest.channels.map(c=>c.name),['bug-reports']);
 assert.deepEqual(r.extensionData.discordDigest.clusters.map(c=>c.title),['Вылеты'],'bugs mode keeps bug themes only');
 assert.equal(r.extensionData.discordDigest.faq,null);
 await assert.rejects(app.turn(s,'что нового в дискорде в #random'),e=>e instanceof InputRequired&&e.spec.options.includes('#general')&&/random/.test(e.message),'an unknown channel is asked, not guessed');

 // --- Without a model: numbers, bug words, questions grouped by words ------------------------------------------------
 s.settings.model='';
 r=await app.turn(s,'частые вопросы игроков');
 const plain=r.extensionData.discordDigest;
 assert.equal(plain.mode,'faq');assert.equal(plain.clusters,null);assert.equal(plain.faqByModel,false);
 assert.equal(plain.faq[0].count,2,'«когда новый сезон» asked twice');assert.equal(plain.faq[0].answer,'');
 assert.ok(plain.faq.every(q=>q.latest.text),'real messages only');
 assert.ok(plain.bugs.some(b=>/Samsung/.test(b.text)));
 assert.equal(plain.mood.byModel,false);
 s.settings.model='qwen3:4b';

 // --- Message Content Intent off: empty texts are reported, not analysed ---------------------------------------------
 hidden=true;r=await app.turn(s,'что пишут в дискорде за неделю');hidden=false;
 assert.equal(r.extensionData.discordDigest.hidden,true);assert.match(r.text,/Message Content Intent/);

 // --- Service errors in words -------------------------------------------------------------------------------------------
 failWith=Object.assign(Error('HTTP 401'),{status:401});r=await app.turn(s,'что нового в дискорде');failWith=null;
 assert.equal(r.error,true);assert.match(r.text,/не принял токен/);
 failWith=Object.assign(Error('HTTP 429'),{status:429,retryAfter:3});r=await app.turn(s,'баги из дискорда');failWith=null;
 assert.match(r.text,/ограничил число запросов/);

 // --- Sending: the channel is named or asked; the card holds the exact text; only «Отправить» posts ---------------------
 const before=calls.filter(c=>c.method==='POST').length;
 r=await app.turn(s,'Отправь в Discord в #announcements: Сервер перезапустится в 18:00 @everyone');
 const compose=r.extensionData.discordCompose;
 assert.deepEqual(compose.channel,{id:NEWS,name:'announcements'});assert.equal(compose.text,'Сервер перезапустится в 18:00 @everyone');
 assert.equal(calls.filter(c=>c.method==='POST').length,before,'nothing is posted from a chat turn');
 await assert.rejects(app.turn(s,'отправь в дискорд: патч 1.2 вышел'),e=>{assert.ok(e instanceof InputRequired);assert.deepEqual(e.spec.options,['#general','#bug-reports','#announcements'],'forums are not offered for posting');assert.equal(e.spec.strictChoices,true);return true;},'no channel named: asked, never guessed');
 const asked=await app.turn(s,'отправь в дискорд: патч 1.2 вышел').catch(e=>e);
 r=await asked.resume('#general');assert.equal(r.extensionData.discordCompose.channel.name,'general');
 await assert.rejects(app.turn(s,'напиши в дискорд в #announcements'),e=>e instanceof InputRequired&&/Что написать в #announcements/.test(e.message),'no text: asked for it');
 // The card's send: exactly the edited text, the card's channel, no mentions expanded; never twice.
 const ipc=app.setup(s).ipc;
 const sent=await ipc.send({card:compose.id,channel:NEWS},'Сервер перезапустится в 18:30 @everyone');
 const post=calls.filter(c=>c.method==='POST').at(-1);
 assert.equal(post.url,'https://discord.com/api/v10/channels/'+NEWS+'/messages');
 assert.deepEqual(post.body,{content:'Сервер перезапустится в 18:30 @everyone',allowed_mentions:{parse:[]}});
 assert.equal(sent.url,'https://discord.com/channels/'+GUILD+'/'+NEWS+'/900000000000000099');
 await assert.rejects(ipc.send({card:compose.id,channel:NEWS},'ещё раз'),/уже отправлено/);
 await assert.rejects(ipc.send({card:r.extensionData.discordCompose.id,channel:NEWS},'x'),/не совпадает/,'only the card\'s channel');
 await assert.rejects(ipc.send({card:r.extensionData.discordCompose.id,channel:GENERAL},'x'.repeat(2001)),/2000/);
 await assert.rejects(ipc.send({card:'nope',channel:GENERAL},'x'),/не найдена/);
 // A FAQ answer goes to the question's channel as a reply to its latest message.
 await ipc.send({card:card.id,replyTo:card.faq[0].latest.id},'Сезон стартует 20 ноября!');
 const faqPost=calls.filter(c=>c.method==='POST').at(-1);
 assert.equal(faqPost.url,'https://discord.com/api/v10/channels/'+GENERAL+'/messages');
 assert.deepEqual(faqPost.body.message_reference,{message_id:card.faq[0].latest.id,fail_if_not_exists:false});

 // --- share-message: hands the text to the chat flow above (which asks for the channel and confirms) -----------------------
 assert.equal(share.ready(s.settings),true);assert.equal(share.ready({...s.settings,extension_discord:'false'}),false);
 assert.deepEqual(await share.run(s,{text:'Патч 1.3:\n- новые карты\n- фиксы'}),{ask:'Отправь в Discord: Патч 1.3:\n- новые карты\n- фиксы',send:true});
 const links=require('../src/features/app-links.cjs').load();
 assert.ok(links.some(p=>p.kind==='share-message'&&p.id==='discord'),'declared in "provides"');
 assert.equal(app.messageText('Отправь в Discord: Патч 1.3:\n- новые карты'),'Патч 1.3:\n- новые карты');

 // --- The offer -------------------------------------------------------------------------------------------------------------
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:offers.load(),settings:{}}));return d?.one?.offer.id||d?.tie?.map(x=>x.offer.id).join(',')||null;};
 for(const t of ['что нового в дискорде','баги из дискорда','покажи частые вопросы игроков'])assert.equal(offered(t),'discord',t);
 for(const t of ['discord.js не ставится','дискорд не работает','напиши бота для дискорда','что нового в слаке'])assert.notEqual(offered(t),'discord',t);
 assert.equal(offer.ready(s.settings),true);assert.equal(offer.ready({extension_discord:'true'}),false);
 assert.equal(digest.verbatim('  «вылетает на загрузке 87%» ',[{text:'После патча вылетает   на загрузке 87%'}]).text,'вылетает на загрузке 87%');
 console.log('Discord: routing and near-misses, not added/not connected, digest with unread/threads/pins, verbatim quotes, pinned-grounded FAQ, model-free card, intent detection, errors, send only from the card with exact text and channel, share-message, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
