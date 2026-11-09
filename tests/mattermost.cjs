// «Mattermost» against a fake Mattermost server on localhost (REST API v4 paths, Bearer token, PostList answers):
// routing and near-misses (other messengers, plugins, installing, definitions), not added / not connected, the channel
// digest (posts of the chosen channels, names by id, statuses, threads, themes with verbatim quotes, no model), named
// and unknown channels (asked, never guessed), a thread by permalink and by choice, search limited to the chosen
// channels, sending only from a card with the exact text and channel (once), a reply in the thread, share-message, the
// messenger-source contract, service errors, settings validation and the offer.
const assert=require('node:assert/strict');
const http=require('node:http');
const app=require('../src/extensions/mattermost/feature.cjs');
const client=require('../src/extensions/mattermost/client.cjs');
const source=require('../src/extensions/mattermost/messenger-source.cjs');
const share=require('../src/extensions/mattermost/share-message.cjs');
const offer=require('../src/extensions/mattermost/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const M=require('../src/features/messenger-sources.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const id=p=>(p+'0'.repeat(26)).slice(0,26);
const TEAM=id('team'),DEV=id('dev'),QA=id('qa'),SECRET=id('secret'),ROOT=id('root'),R2=id('rtwo');
const U={olga:id('uolga'),ivan:id('uivan'),bot:id('ubot')};
const TOKEN='x'.repeat(26);
const NOW=Date.now();
const at=min=>NOW-min*60000;
const post=(pid,channel,user,message,min,extra={})=>({id:pid,channel_id:channel,user_id:user,message,create_at:at(min),update_at:at(min),delete_at:0,type:'',root_id:'',reply_count:0,file_ids:[],props:{},...extra});
const posts={
 [DEV]:[post(id('p1'),DEV,U.olga,'Релиз 2.3 переносим на пятницу, не успеваем с оплатой',10,{reply_count:2}),
  post(id('p2'),DEV,U.ivan,'Ок, тогда я допилю экран оплаты',8,{root_id:id('p1')}),
  post(id('p3'),DEV,U.olga,'Changelog пишу я',7,{root_id:id('p1')}),
  post(id('p4'),DEV,U.bot,'build #512 passed',30),
  post(id('p5'),DEV,U.ivan,'',40,{type:'system_join_channel'}),
  post(id('p6'),DEV,U.ivan,'Кто ревьюит PR про матчмейкинг? <script>alert(1)</script>',60),
  post(id('old'),DEV,U.olga,'совсем старое',60*24*10)],
 [QA]:[post(id('q1'),QA,U.olga,'Нашли вылет на Android 14 при оплате',20)]
};
const thread={[id('p1')]:[posts[DEV][0],posts[DEV][1],posts[DEV][2]]};
const calls=[];
let failWith=0;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x');let body='';for await(const c of req)body+=c;
 const send=(code,b)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 calls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body:body?JSON.parse(body):null,auth:req.headers.authorization});
 if(req.headers.authorization!=='Bearer '+TOKEN)return send(401,{id:'api.context.session_expired.app_error',message:'Invalid or expired session',status_code:401});
 if(failWith)return send(failWith,{message:'boom'});
 const p=u.pathname.replace(/^\/api\/v4/,'');
 const list=arr=>({order:arr.map(x=>x.id),posts:Object.fromEntries(arr.map(x=>[x.id,x])),next_post_id:'',prev_post_id:''});
 if(p==='/users/me')return send(200,{id:U.olga,username:'olga',first_name:'Оля',last_name:'Котова'});
 if(p==='/users/me/teams')return send(200,[{id:TEAM,name:'studio',display_name:'Studio',delete_at:0}]);
 if(p==='/users/me/teams/'+TEAM+'/channels')return send(200,[{id:DEV,name:'dev',display_name:'Dev',type:'O',delete_at:0},{id:QA,name:'qa',display_name:'QA',type:'P',delete_at:0},{id:id('dm'),name:'a__b',display_name:'',type:'D',delete_at:0}]);
 const ch=/^\/channels\/([a-z0-9]{26})\/posts$/.exec(p);
 if(ch&&req.method==='GET')return send(200,list((posts[ch[1]]||[]).slice().sort((a,b)=>b.create_at-a.create_at)));
 const th=/^\/posts\/([a-z0-9]{26})\/thread$/.exec(p);
 if(th)return thread[th[1]]?send(200,list(thread[th[1]])):send(404,{message:'not found'});
 const one=/^\/posts\/([a-z0-9]{26})$/.exec(p);
 if(one){const all=Object.values(posts).flat();const x=all.find(y=>y.id===one[1]);return x?send(200,x):send(404,{message:'not found'});}
 if(p==='/teams/'+TEAM+'/posts/search'&&req.method==='POST')return send(200,list([posts[DEV][0],posts[QA][0],post(id('s1'),SECRET,U.ivan,'оплата в секретном канале',5)]));
 if(p==='/users/ids'&&req.method==='POST')return send(200,JSON.parse(body).map(x=>x===U.olga?{id:x,username:'olga',first_name:'Оля',last_name:'Котова'}:x===U.ivan?{id:x,username:'ivan',first_name:'Иван',last_name:''}:{id:x,username:'ci',is_bot:true}));
 if(p==='/users/status/ids'&&req.method==='POST')return send(200,JSON.parse(body).map(x=>({user_id:x,status:x===U.olga?'online':'away',last_activity_at:NOW})));
 if(p==='/posts'&&req.method==='POST'){const b=JSON.parse(body);return send(201,{id:id('sent'+calls.length),channel_id:b.channel_id,message:b.message,root_id:b.root_id||'',create_at:NOW});}
 send(404,{message:'unknown '+p});
});
let base='';
// Petya's s.request: fetch, an error with the HTTP status and body for a failed answer.
async function request(url,{timeoutMs,...o}={}){
 const r=await fetch(url,o);
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.status===204?null:r.json();
}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const chosen=[{id:DEV,name:'dev',display:'Dev',team:TEAM,teamName:'studio',type:'O'},{id:QA,name:'qa',display:'QA',team:TEAM,teamName:'studio',type:'P'}];
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];
 const settings={extension_mattermost:'true',mattermostUrl:base,mattermostToken:TOKEN,mattermostChannels:JSON.stringify(chosen),ollamaUrl:'http://127.0.0.1:11434/api/chat'};
 const s={settings,requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}},
  async request(url,o={}){if(url.includes('11434')){const next=model.shift();assert.ok(next,'unexpected model call');return {message:{content:JSON.stringify(typeof next==='function'?next(JSON.parse(o.body)):next)}};}return request(url,o);}};
 try{
  // --- Routing -------------------------------------------------------------------------------------------------------
  for(const t of ['что нового в Mattermost?','что обсуждали в канале dev в маттермосте за неделю','перескажи тред про релиз в Mattermost','найди в Mattermost сообщения про оплату','отправь в маттермост: билд готов','где обсуждали оплату в маттермосте','mattermost за сегодня'])assert.equal(app.wanted(t),true,t);
  for(const t of ['что нового в слаке','что пишут в телеграме','что нового в дискорде','напиши плагин для mattermost','mattermost не работает','установи mattermost','как развернуть mattermost','что такое mattermost','webhook в mattermost','найди везде про оплату в маттермосте','ответь по найденному в маттермосте','что нового в VK Teams','перенеси из slack в mattermost','что нового'])assert.equal(app.wanted(t),false,t);
  assert.equal(app.claims('что нового в mattermost'),true);
  // Not added → null; added but not connected → where to connect.
  assert.equal(await app.turn({...s,settings:{...settings,extension_mattermost:'false'}},'что нового в mattermost'),null);
  let r=await app.turn({...s,settings:{...settings,mattermostToken:''}},'что нового в mattermost');
  assert.equal(r.question,true);assert.match(r.text,/Personal Access Tokens/);
  r=await app.turn({...s,settings:{...settings,mattermostChannels:'[]'}},'что нового в mattermost');
  assert.match(r.text,/Отметьте каналы/);
  assert.equal(calls.length,0,'nothing is read before connecting');

  // --- Digest without a model -------------------------------------------------------------------------------------------
  r=await app.turn(s,'что нового в mattermost');
  let card=r.extensionData.mattermostCard;
  assert.equal(card.mode,'digest');assert.equal(card.themes,null);
  assert.equal(card.total,5,'system and bot posts and posts older than the day are not counted');
  assert.deepEqual(card.channels.map(c=>[c.name,c.count,c.url]),[['Dev',4,base+'/studio/channels/dev'],['QA',1,base+'/studio/channels/qa']]);
  assert.deepEqual(card.authors.map(a=>[a.name,a.count,a.status]),[['Оля Котова',3,'online'],['Иван',2,'away']]);
  assert.deepEqual(card.threads.map(t=>[t.id,t.replies,t.url]),[[id('p1'),2,base+'/studio/pl/'+id('p1')]]);
  assert.equal(card.latest.length,5);assert.match(card.latest.find(x=>x.text.includes('PR')).text,/<script>/,'text is kept as data');
  assert.match(r.text,/5 сообщений в 2 каналах/);assert.match(r.text,/Самое живое обсуждение/);
  assert.equal(r.messages.at(-1).sources[0].url,base+'/studio/pl/'+id('p1'));
  const get=calls.filter(c=>c.path.endsWith('/posts')&&c.method==='GET');
  assert.deepEqual(get.map(c=>c.query),[{page:'0',per_page:'200'},{page:'0',per_page:'200'}]);
  assert.ok(calls.every(c=>c.auth==='Bearer '+TOKEN));
  assert.ok(!calls.some(c=>c.path.includes(SECRET)),'only chosen channels are read');

  // --- Digest with the model: invented quotes are dropped ---------------------------------------------------------------
  settings.model='qwen3:4b';
  model.push(body=>{const user=body.messages.at(-1).content;assert.match(user,/Релиз 2\.3/);return {themes:[{title:'Перенос релиза',messages:[1,2,3],quotes:['Релиз 2.3 переносим на пятницу','Релиз отменён совсем']},{title:'Оплата',messages:[4],quotes:['придумано моделью']}]};});
  r=await app.turn(s,'что обсуждали в канале dev в маттермосте за неделю');
  card=r.extensionData.mattermostCard;
  assert.deepEqual(card.channels.map(c=>c.name),['Dev'],'the named channel only');assert.equal(card.days,7);
  assert.deepEqual(card.themes.map(t=>[t.title,t.quotes.map(q=>q.text)]),[['Перенос релиза',['Релиз 2.3 переносим на пятницу']],['Оплата',[card.themes[1].quotes[0].text]]]);
  assert.ok(!card.themes.some(t=>t.quotes.some(q=>/придумано|отменён совсем/.test(q.text))));
  assert.equal(card.themes[0].quotes[0].url,base+'/studio/pl/'+id('p1'));
  assert.match(r.text,/Главные темы: перенос релиза/);

  // --- An unknown channel is asked, never guessed -----------------------------------------------------------------------
  await assert.rejects(app.turn(s,'что нового в mattermost в канале marketing'),e=>{
   assert.ok(e instanceof InputRequired);assert.deepEqual(e.spec.options,['~Dev','~QA']);assert.equal(e.spec.strictChoices,true);r=e;return true;});
  const resumed=await r.resume('~QA');// one message: no model call
  assert.deepEqual(resumed.extensionData.mattermostCard.channels.map(c=>c.name),['QA']);

  // --- Thread by permalink, then by choice -------------------------------------------------------------------------------
  model.push({summary:'Релиз перенесли на пятницу из-за оплаты.',points:[{kind:'decision',text:'Релиз в пятницу',message:1,quote:'Релиз 2.3 переносим на пятницу'},{kind:'task',text:'Иван делает экран оплаты',message:2,quote:'я допилю экран оплаты'},{kind:'task',text:'Выдумка',message:9,quote:'x'}]});
  r=await app.turn(s,'перескажи тред '+base+'/studio/pl/'+id('p2')+' в mattermost');
  card=r.extensionData.mattermostCard;
  assert.equal(card.mode,'thread');assert.equal(card.thread.id,id('p1'),'a reply link opens its root thread');
  assert.equal(card.thread.replies,2);assert.deepEqual(card.thread.people,['Оля Котова','Иван']);
  assert.deepEqual(card.thread.points.map(p=>[p.kind,p.quote.text,p.quote.verbatim]),[['decision','Релиз 2.3 переносим на пятницу',true],['task','я допилю экран оплаты',true]]);
  assert.equal(r.text,'Релиз перенесли на пятницу из-за оплаты.');
  r=await app.turn(s,'перескажи тред https://other.example.com/studio/pl/'+id('p1')+' в mattermost');
  assert.equal(r.question,true,'a link to another server is not read');
  model.push({summary:'',points:[]});
  r=await app.turn(s,'перескажи тред про релиз в mattermost');
  assert.equal(r.extensionData.mattermostCard.thread.id,id('p1'),'one thread with these words: summarized at once');
  r=await app.turn(s,'перескажи тред про бюджет в mattermost');
  assert.match(r.text,/тредов с такими словами/);

  // --- Search: only chosen channels ---------------------------------------------------------------------------------------
  settings.model='';
  r=await app.turn(s,'найди в Mattermost сообщения про оплату');
  card=r.extensionData.mattermostCard;
  const search=calls.filter(c=>c.path.endsWith('/posts/search')).at(-1);
  assert.deepEqual(search.body,{terms:'оплату',is_or_search:false,include_deleted_channels:false,time_zone_offset:0,page:0,per_page:60});
  assert.equal(card.mode,'search');assert.equal(card.query,'оплату');
  assert.deepEqual(card.results.map(x=>x.channel).sort(),['Dev','QA'],'the secret channel is not chosen → not shown');
  await assert.rejects(app.turn(s,'найди в маттермосте'),e=>e instanceof InputRequired&&/Что найти/.test(e.spec.text));

  // --- Sending: the channel is picked, the text is exact, nothing is posted from the chat ---------------------------------
  const before=calls.length;
  await assert.rejects(app.turn(s,'отправь в mattermost: Билд 2.3 готов\nсмотрите changelog'),e=>{assert.deepEqual(e.spec.options,['~Dev','~QA']);r=e;return true;});
  const composed=await r.resume('~Dev');
  const compose=composed.extensionData.mattermostCompose;
  assert.deepEqual(compose.channel,{id:DEV,name:'Dev'});assert.equal(compose.text,'Билд 2.3 готов\nсмотрите changelog');
  assert.equal(calls.slice(before).filter(c=>c.method==='POST'&&c.path==='/api/v4/posts').length,0,'nothing posted before «Отправить»');
  r=await app.turn(s,'напиши в маттермост в ~qa, что сборка упала');
  assert.equal(r.extensionData.mattermostCompose.channel.id,QA);assert.equal(r.extensionData.mattermostCompose.text,'сборка упала');
  await assert.rejects(app.turn(s,'отправь в mattermost в ~qa'),e=>e instanceof InputRequired&&/Что написать/.test(e.spec.text));
  const {ipc}=app.setup(s);
  await assert.rejects(ipc.send({card:compose.id,channel:QA},'x'),/Канал не совпадает/);
  await assert.rejects(ipc.send({card:'nope',channel:DEV},'x'),/Карточка не найдена/);
  const [a,b2]=await Promise.allSettled([ipc.send({card:compose.id,channel:DEV},'Билд 2.3 готов!'),ipc.send({card:compose.id,channel:DEV},'Билд 2.3 готов!')]);
  assert.equal(a.status,'fulfilled');assert.equal(b2.status,'rejected');
  const posted=calls.filter(c=>c.method==='POST'&&c.path==='/api/v4/posts');
  assert.deepEqual(posted.map(c=>c.body),[{channel_id:DEV,message:'Билд 2.3 готов!'}]);
  assert.equal(a.value.url,base+'/studio/pl/'+a.value.id);
  await assert.rejects(ipc.send({card:compose.id,channel:DEV},'ещё раз'),/уже отправлено/);
  // A reply in the thread card goes to its root only.
  const threadCard=topic.messages.map(m=>m.extensionData?.mattermostCard).find(c=>c?.mode==='thread');
  await assert.rejects(ipc.send({card:threadCard.id,root:id('p2')},'x'),/только в тред/);
  await ipc.send({card:threadCard.id,root:threadCard.thread.id},'Беру ревью');
  assert.deepEqual(calls.filter(c=>c.method==='POST'&&c.path==='/api/v4/posts').at(-1).body,{channel_id:DEV,message:'Беру ревью',root_id:id('p1')});
  // A channel unticked in settings cannot be written to.
  const stale=(await app.turn(s,'отправь в mattermost в ~qa: проверка')).extensionData.mattermostCompose;
  settings.mattermostChannels=JSON.stringify(chosen.slice(0,1));
  await assert.rejects(ipc.send({card:stale.id,channel:QA},'проверка'),/больше нет среди выбранных/);
  settings.mattermostChannels=JSON.stringify(chosen);

  // --- share-message, messenger-source, errors -----------------------------------------------------------------------------
  assert.equal(share.ready(settings),true);assert.equal(share.ready({...settings,extension_mattermost:'false'}),false);
  assert.deepEqual(await share.run(s,{text:'  Патч 4.13\r\n- фикс  '}),{ask:'Отправь в Mattermost: Патч 4.13\n- фикс',send:true});
  await assert.rejects(share.run(s,{text:' '}),/Нет текста/);
  const reg=M.create(s);
  assert.ok(reg.list().some(x=>x.id==='mattermost'&&x.search&&x.thread&&x.presence));
  assert.deepEqual((await reg.channels('mattermost')).map(c=>c.name),['Dev','QA']);
  await assert.rejects(reg.messages('mattermost',{channel:SECRET}),/не выбран/);
  assert.equal(source.names[0].test('в маттермосте'),true);
  failWith=500;
  r=await app.turn(s,'что нового в mattermost');
  assert.equal(r.error,true);assert.match(r.text,/Mattermost/);
  failWith=0;
  settings.mattermostToken='y'.repeat(26);
  r=await app.turn(s,'что нового в mattermost');
  assert.equal(r.error,true);assert.match(r.text,/не принял токен/);
  settings.mattermostToken=TOKEN;
  settings.mattermostUrl='http://127.0.0.1:1';
  r=await app.turn(s,'что нового в mattermost');assert.equal(r.error,true);
  settings.mattermostUrl=base;

  // --- Settings and the client's guards ----------------------------------------------------------------------------------
  assert.equal(client.server('chat.example.com/'),'https://chat.example.com');
  assert.equal(client.server('http://chat.example.com'),'','plain http only for this computer');
  assert.equal(client.server('https://u:p@chat.example.com'),'');
  assert.equal(client.postOfLink('см. '+base+'/studio/pl/'+id('p1')+'.',base),id('p1'));
  assert.throws(()=>app.validate({mattermostUrl:'ftp://x'}),/Адрес сервера/);
  assert.throws(()=>app.validate({mattermostToken:'short'}),/личный токен/);
  assert.throws(()=>app.validate({mattermostChannels:'{'}),/повреждён/);
  app.validate({mattermostUrl:'https://chat.example.com',mattermostToken:TOKEN,mattermostChannels:'[]'});
  assert.deepEqual(client.channelsOf(JSON.stringify([{id:'bad'},...chosen])).length,2);
  const status=ipc.status();assert.equal(status.connected,true);assert.equal(status.channels.length,2);assert.equal(status.token,undefined,'the token never leaves');
  assert.deepEqual((await ipc.channels(TEAM)).map(c=>c.name),['dev','qa'],'direct messages are not offered');

  // --- Offer -----------------------------------------------------------------------------------------------------------
  const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:[offer],settings:{}}));return d?.one?.offer.id||null;};
  for(const t of ['что нового в mattermost','перескажи тред в маттермосте'])assert.equal(pick(t),'mattermost',t);
  for(const t of ['что нового в слаке','плагин для mattermost','mattermost не работает','что нового в дискорде'])assert.equal(pick(t),null,t);
  assert.equal(offer.ready(settings),true);assert.equal(offer.ready({...settings,mattermostToken:''}),false);
  console.log('Mattermost: routing and near-misses, not added/not connected, digest with names, statuses and threads, verbatim themes, named/unknown channels asked, thread by link and choice, search in chosen channels, send only from the card with exact text and channel once, thread reply, share-message, messenger source, errors, validation, offer passed');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
