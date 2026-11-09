// The `messenger-source` foundation (src/features/messenger-sources.cjs, docs/foundations/messengers.md): declarations
// of the real extensions, normalization into one message shape, bounds, readiness (catalog switch, module_ switches,
// connection), sources that fail or answer garbage, searchAll with failures reported next to results, the evidence
// helpers (verbatim quotes, activity, authors, threads), the shared digest with checked quotes; the Slack and Telegram
// adapters over the context memory, the Discord adapter over stubbed REST; and the «Поиск по всему» hook.
const assert=require('node:assert/strict');
const M=require('../src/features/messenger-sources.cjs');
const D=require('../src/messenger-digest.cjs');
const NOW=Date.parse('2026-11-09T12:00:00Z');
const iso=h=>new Date(NOW-h*3600000).toISOString();

(async()=>{
 // --- Declarations -------------------------------------------------------------------------------------------------
 const real=M.load();
 assert.deepEqual(real.map(x=>x.id),['discord','mattermost','slack','telegram','vk-teams']);
 assert.deepEqual(real.map(x=>x.setting),['extension_discord','extension_mattermost','module_slack','module_telegram','extension_vk-teams']);
 assert.equal(real.find(x=>x.id==='slack').source.memory,true);
 assert.equal(real.find(x=>x.id==='vk-teams').source.memory,undefined);

 // --- Normalization and bounds -------------------------------------------------------------------------------------
 const m=M.message({id:42,channel:{id:'c1',name:'dev'},author:'Оля',text:'  строка 1\r\nстрока 2\u0007 ',at:Math.floor(NOW/1000),url:'javascript:alert(1)',replies:'3',bot:1},'x');
 assert.deepEqual(m,{id:'42',source:'x',channel:{id:'c1',name:'dev'},thread:null,replyTo:null,author:{id:'Оля',name:'Оля'},bot:true,text:'строка 1\nстрока 2',at:new Date(Math.floor(NOW/1000)*1000).toISOString(),url:'',replies:3,files:0});
 assert.equal(M.message({id:'1',at:'nope'},'x').at,'');
 assert.equal(M.message({id:'1',text:'x'.repeat(9000),at:NOW},'x').text.length,4000);
 assert.deepEqual(M.channel({id:'1',name:'n',kind:'weird',url:'ftp://x'}),{id:'1',name:'n',kind:'channel',url:'',topic:''});
 let b=M.bound({since:'2020-01-01',until:'2030-01-01',limit:99999},{now:NOW});
 assert.equal(b.until,new Date(NOW).toISOString());assert.equal(b.since,new Date(NOW-31*M.DAY).toISOString());assert.equal(b.limit,500);assert.deepEqual(b.notes,['Период сокращён до 31 дней.']);
 b=M.bound({days:7,query:'  оплата\nвсё '},{now:NOW});assert.equal(b.since,new Date(NOW-7*M.DAY).toISOString());assert.equal(b.query,'оплата всё');assert.equal(b.limit,200);
 b=M.bound({},{now:NOW});assert.equal(b.since,new Date(NOW-M.DAY).toISOString());
 for(const [t,n] of [['за неделю',7],['за 3 дня',3],['сегодня',1],['вчера',2],['за месяц',30],['за две недели',14],['что нового',null],['за 90 дней',31]])assert.equal(M.period(t),n,t);

 // --- Registry with fixed sources ------------------------------------------------------------------------------------
 const calls=[];
 const good={id:'good',name:'Good',names:[/гуд/iu],ready:st=>!!st.goodToken,
  async channels(){return [{id:'c1',name:'dev'},{id:'',name:'broken'},{id:'c2',name:'qa',kind:'group'}];},
  async messages(s,spec){calls.push(['messages',spec]);return {messages:[
   {id:'1',channel:{id:spec.channel,name:'dev'},author:{id:'u1',name:'Оля'},text:'Релиз в пятницу, не забудьте changelog',at:iso(2)},
   {id:'2',channel:{id:spec.channel,name:'dev'},author:{id:'u2',name:'Иван'},text:'ок',at:iso(1),thread:'1'},
   {id:'3',channel:{id:spec.channel,name:'dev'},author:{id:'u3',name:'Old'},text:'старое',at:iso(24*40)},
   {id:'4',channel:{id:spec.channel,name:'dev'},author:{id:'b',name:'CI'},bot:true,text:'build #12 green',at:iso(3)}],notes:['из кэша']};},
  async thread(s,{id}){return {messages:[{id:'2',text:'ответ',at:iso(1),author:'Иван',thread:id},{id,text:'корень',at:iso(2),author:'Оля',replies:1}]};},
  async search(s,{query}){calls.push(['search',query]);return {messages:[{id:'9',channel:{id:'c1',name:'dev'},author:'Оля',text:'про оплату',at:iso(5)}]};},
  async presence(s,{users}){return users.map(u=>({user:u,status:u==='u1'?'online':'nonsense'})).concat([{user:'stranger',status:'online'}]);}};
 const broken={id:'broken',name:'Broken',ready:()=>true,async channels(){return 'nope';},async messages(){return {messages:'nope'};},async search(){throw Error('сервер недоступен');}};
 const memory={id:'mem',name:'Mem',memory:true,ready:()=>true,async channels(){return [];},async messages(){return [];},async search(){return {messages:[{id:'m',text:'про оплату',at:iso(1),author:'a'}]};}};
 const settings={};
 const s={settings};
 const reg=M.create(s,{now:()=>NOW,sources:[{id:'good',extension:'good',setting:'extension_good',name:'Good',source:good},{id:'broken',extension:'broken',setting:'',name:'Broken',source:broken},
  {id:'mem',extension:'mem',setting:'module_mem',name:'Mem',source:memory}]});
 assert.deepEqual(reg.list().map(x=>x.id),['broken','mem'],'module_ switches are on unless false; Good is not added');
 settings.extension_good='true';
 assert.deepEqual(reg.list().map(x=>x.id),['broken','mem'],'added but not connected');
 settings.goodToken='x'.repeat(24);
 assert.deepEqual(reg.list().map(x=>x.id),['good','broken','mem'].sort((a,c)=>['good','broken','mem'].indexOf(a)-['good','broken','mem'].indexOf(c)));
 assert.deepEqual(reg.find('good'),{id:'good',name:'Good',extension:'good',added:true,connected:true,ready:true,hint:'',memory:false,thread:true,search:true,presence:true});
 settings.module_mem='false';assert.equal(reg.find('mem').ready,false);delete settings.module_mem;
 assert.deepEqual(reg.named('что в гуд-чате'),['good']);
 assert.deepEqual((await reg.channels('good')).map(c=>[c.id,c.kind]),[['c1','channel'],['c2','group']]);
 await assert.rejects(reg.channels('broken'),/некорректный список каналов/);
 await assert.rejects(reg.messages('good',{}),/Не указан канал/);
 const r=await reg.messages('good',{channel:'c1',days:7});
 assert.deepEqual(r.messages.map(x=>x.id),['2','1','4'],'newest first, outside the period dropped');
 assert.equal(calls[0][1].since,new Date(NOW-7*M.DAY).toISOString());
 assert.deepEqual(r.notes,['из кэша']);
 await assert.rejects(reg.messages('broken',{channel:'c1'}),/некорректный список сообщений/);
 const t=await reg.thread('good',{id:'1'});assert.deepEqual(t.messages.map(x=>x.id),['1','2'],'root first');
 await assert.rejects(reg.thread('broken',{id:'1'}),/не умеет читать треды/);
 await assert.rejects(reg.search('good',{query:'  '}),/Нечего искать/);
 const all=await reg.searchAll({query:'оплата'});
 assert.deepEqual(all.messages.map(x=>x.source),['mem','good']);assert.deepEqual(all.failed,[{id:'broken',name:'Broken',error:'сервер недоступен'}]);
 assert.deepEqual((await reg.searchAll({query:'оплата'},{memory:false})).used.map(x=>x.id),['good']);
 assert.deepEqual(await reg.presence('good',['u1','u2','u1']),[{user:'u1',status:'online',at:''},{user:'u2',status:'offline',at:''}]);
 assert.deepEqual(await reg.presence('broken',['u1']),[]);
 // A connection that changes while reading is reported, not used.
 const flip={...good,async messages(s2){delete settings.goodToken;return good.messages(s2,{channel:'c1'});}};
 const reg2=M.create(s,{now:()=>NOW,sources:[{id:'good',extension:'good',setting:'extension_good',name:'Good',source:flip}]});
 await assert.rejects(reg2.messages('good',{channel:'c1'}),/Подключение «Good» изменилось/);
 await assert.rejects(reg2.messages('good',{channel:'c1'}),/не добавлен или не подключён/);
 settings.goodToken='x'.repeat(24);

 // --- Evidence helpers and the shared digest ---------------------------------------------------------------------------
 const msgs=r.messages;
 assert.equal(M.verbatim('«Релиз в пятницу»',msgs).message.id,'1');
 assert.equal(M.verbatim('Релиз в субботу',msgs),null);assert.equal(M.verbatim('ок',msgs),null,'too short to check');
 assert.deepEqual(M.authors(msgs).map(a=>[a.name,a.count]),[['Иван',1],['Оля',1]]);
 assert.deepEqual(M.threads(msgs).map(x=>[x.id,x.replies,x.title]),[['1',1,'Релиз в пятницу, не забудьте changelog']]);
 assert.deepEqual(M.activity(msgs,iso(48),iso(0)).map(x=>x.count),[0,0,3]);
 // Themes: an invented quote is dropped, a theme without a checkable quote shows its real message.
 const model=[];
 const ms={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},async request(url,o){const next=model.shift();assert.ok(next,'unexpected model call');return {message:{content:JSON.stringify(next)}};}};
 model.push({themes:[{title:'Релиз',messages:[1,2],quotes:['Релиз в пятницу','Релиз отменили']},{title:'Выдумка',messages:[2],quotes:['этого никто не писал']},{title:'Пусто',messages:[99],quotes:[]}]});
 const th=await D.themes(ms,msgs);
 assert.deepEqual(th.map(x=>[x.title,x.count,x.quotes.map(q=>q.text)]),[['Релиз',2,['Релиз в пятницу']],['Выдумка',1,['Релиз в пятницу, не забудьте changelog']]]);
 assert.equal(await D.themes({settings:{}},msgs),null,'no model → no themes');
 model.push({summary:'Решили выпустить релиз в пятницу.',points:[{kind:'decision',text:'Релиз в пятницу',message:1,quote:'Релиз в пятницу'},{kind:'task',text:'Написать changelog',message:1,quote:'напишите changelog сегодня'},{kind:'point',text:'нет такого',message:7,quote:'x'}]});
 const sum=await D.thread(ms,[msgs[1],msgs[0]]);
 assert.equal(sum.summary,'Решили выпустить релиз в пятницу.');
 // A quote not in the named message is replaced by that message's own text; a point naming no real message is dropped.
 assert.deepEqual(sum.points.map(p=>[p.kind,p.quote.text,p.quote.verbatim]),[['decision','Релиз в пятницу',true],['task','Релиз в пятницу, не забудьте changelog',false]]);
 const card=await D.digest({settings:{}},{app:'good',messages:msgs,channels:[{id:'c1',name:'dev'}],since:iso(48),until:iso(0),days:2,presence:[{user:'u1',status:'online'}]});
 assert.equal(card.total,2,'bots are not counted');assert.equal(card.themes,null);assert.equal(card.latest.length,2);
 assert.deepEqual(card.authors.find(a=>a.name==='Оля'),{name:'Оля',count:1,status:'online'});
 // Routing helpers.
 const NAME=/mattermost|маттермост\p{L}*/iu;
 for(const [t,mode] of [['что нового в mattermost','digest'],['отправь в mattermost: билд готов','send'],['напиши в маттермост в ~dev, что билд готов','send'],['найди в mattermost про оплату','search'],['где обсуждали оплату в маттермосте','search'],['перескажи тред про релиз в mattermost','thread'],['что пишут в маттермосте','digest'],['что написали в mattermost за неделю','digest']])assert.equal(D.mode(t,NAME),mode,t);
 assert.equal(D.messageText('Отправь в Mattermost в ~dev: билд 2.3 готов',NAME),'билд 2.3 готов');
 assert.equal(D.messageText('напиши в mattermost в чат «Релизы», что билд готов',NAME),'билд готов');
 assert.equal(D.messageText('напиши в mattermost «билд готов»',NAME),'билд готов');
 assert.equal(D.messageText('напиши в mattermost в чат «Релизы»',NAME),'');
 assert.equal(D.namedChannel('что в ~dev'),'dev');assert.equal(D.namedChannel('что в канале «Общий чат»'),'Общий чат');assert.equal(D.namedChannel('что нового'),null);
 assert.equal(D.subject('найди в маттермосте про оплату за неделю',NAME),'оплату');

 // --- Slack and Telegram adapters over the context memory ---------------------------------------------------------------
 const slack=real.find(x=>x.id==='slack').source,telegram=real.find(x=>x.id==='telegram').source,discord=real.find(x=>x.id==='discord').source;
 const memoryItems=[
  {id:'slack:C1:1731000000.000100',source:'Slack',channel:'C1',title:'Релиз',url:'https://app.slack.com/archives/C1/p1731000000000100',messages:[{ts:'1731000000.000100',at:NOW-3600e3,user:'U1',text:'Релиз в пятницу'},{ts:'1731000060.000200',at:NOW-3500e3,user:'U2',text:'Ок, оплату проверю'}]},
  {id:'telegram:7:42',source:'Telegram',telegramChat:'42',title:'Команда',url:'https://t.me/c/42/9',messages:[{id:'8',at:NOW-7200e3,user:'Маша',text:'Ответ на #7: оплата прошла'}]},
  {id:'n1',source:'Заметка',text:'не мессенджер'}];
 const ss={settings:{module_slack:'true',slackToken:'x'.repeat(24),module_telegram:'true',telegramCredential:JSON.stringify({session:'x'.repeat(24)})},memory:{prune:()=>memoryItems}};
 assert.equal(slack.ready(ss.settings),true);assert.equal(slack.ready({...ss.settings,module_slack:'false'}),false);assert.equal(slack.ready({module_slack:'true'}),false);
 assert.equal(telegram.ready(ss.settings),true);assert.equal(telegram.ready({module_telegram:'true',telegramCredential:'{}'}),false);
 const sreg=M.create(ss,{now:()=>NOW,sources:real.filter(x=>['slack','telegram'].includes(x.id))});
 assert.deepEqual(sreg.list().map(x=>x.id),['slack','telegram']);
 assert.deepEqual((await sreg.channels('slack')).map(c=>c.id),['C1']);
 const sm=await sreg.messages('slack',{channel:'C1'});
 assert.deepEqual(sm.messages.map(x=>[x.id,x.thread,x.replyTo,x.url]),[['1731000060.000200','1731000000.000100','1731000000.000100','https://app.slack.com/archives/C1/p1731000060000200?thread_ts=1731000000.000100'],['1731000000.000100','1731000000.000100',null,'https://app.slack.com/archives/C1/p1731000000000100']]);
 assert.equal((await sreg.thread('slack',{id:'1731000000.000100'})).messages.length,2);
 assert.deepEqual((await sreg.search('slack',{query:'оплату'})).messages.map(x=>x.text),['Ок, оплату проверю']);
 const tm=await sreg.messages('telegram',{channel:'42'});
 assert.deepEqual(tm.messages.map(x=>[x.text,x.replyTo,x.url]),[['оплата прошла','7','https://t.me/c/42/8']]);
 assert.deepEqual((await sreg.searchAll({query:'оплата'},{memory:false})).used,[],'memory sources are skipped for «Поиск по всему»');

 // --- Discord adapter over stubbed REST ----------------------------------------------------------------------------------
 const client=require('../src/extensions/discord/client.cjs');
 const G='900000000000000001',CH='900000000000000010',FORUM='900000000000000013';
 const ds={settings:{extension_discord:'true',discordToken:'x'.repeat(24)+'.'+'x'.repeat(6)+'.'+'x'.repeat(27),discordGuild:G,discordGuildName:'BW',discordChannels:JSON.stringify([{id:CH,name:'general',type:0},{id:FORUM,name:'help',type:15}])},
  async request(url){assert.ok(url.startsWith('https://discord.com/api/v10/channels/'+CH+'/messages'),url);return [{id:client.snowflakeAt(new Date(NOW-600e3)),type:0,content:'Когда сезон?',timestamp:new Date(NOW-600e3).toISOString(),author:{id:'1',global_name:'Vasya'},attachments:[]}];}};
 const dreg=M.create(ds,{now:()=>NOW,sources:real.filter(x=>x.id==='discord')});
 assert.deepEqual((await dreg.channels('discord')).map(c=>c.name),['general'],'forums are not listed');
 const dm=await dreg.messages('discord',{channel:CH,since:new Date(NOW-M.DAY).toISOString(),until:new Date(NOW).toISOString()});
 assert.deepEqual(dm.messages.map(x=>[x.author.name,x.text,x.channel.name]),[['Vasya','Когда сезон?','general']]);
 await assert.rejects(dreg.messages('discord',{channel:FORUM}),/не выбран/);
 assert.equal(discord.search,undefined);

 // --- «Поиск по всему» searches every ready messenger with search that is not memory-only ------------------------------
 const sa=require('../src/extensions/search-all/feature.cjs');
 const fake={id:'chatx',name:'ЧатИкс',ready:()=>true,async channels(){return [];},async messages(){return [];},async search(s2,{query}){assert.equal(query,'оплату');return {messages:[{id:'5',channel:{id:'c',name:'general'},author:'Оля',text:'Оплата в Китае сломалась',at:NOW-3600e3,url:'https://chat.example.com/studio/pl/'+'a'.repeat(26)}]};}};
 const failing={id:'chaty',name:'ЧатИгрек',ready:()=>true,async channels(){return [];},async messages(){return [];},async search(){throw Error('сервер недоступен');}};
 sa.deps.now=()=>NOW;
 sa.deps.sources={...sa.deps.sources,memory:()=>({items:[],kinds:new Set()}),files:async()=>({state:'off',items:[]}),indexedFiles:async()=>[],glossary:()=>({state:'off',items:[]}),mailAccounts:()=>[],projectRoots:()=>[]};
 sa.deps.messengers=s2=>M.create(s2,{now:()=>NOW,sources:[{id:'chatx',extension:'chatx',setting:'',name:'ЧатИкс',source:fake},{id:'chaty',extension:'chaty',setting:'',name:'ЧатИгрек',source:failing},{id:'mem',extension:'mem',setting:'',name:'Mem',source:memory}]});
 const topic={id:'t',title:'Чат',messages:[]};
 const sas={settings:{'extension_search-all':'true'},requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}}};
 const out=await sa.turn(sas,'найди везде про оплату');
 const sc=out.extensionData.searchAll;if(process.env.DEBUG)console.log(JSON.stringify(sc.sources),out.text);
 assert.deepEqual(sc.items.map(i=>[i.source,i.title,i.messenger]),[['chatx','ЧатИкс · general',true]]);
 assert.deepEqual(sc.sources.filter(x=>['chatx','chaty','mem'].includes(x.id)).map(x=>[x.id,x.label,x.state]),[['chatx','ЧатИкс','ok'],['chaty','ЧатИгрек','error']]);
 assert.match(out.text,/ЧатИкс 1/);
 console.log('Messenger sources: declarations, normalization, bounds, readiness incl. module switches, broken sources, searchAll failures, presence, verbatim themes and thread points, routing helpers, Slack/Telegram memory adapters, Discord adapter, «Поиск по всему» hook passed');
})().catch(e=>{console.error(e);process.exit(1);});
