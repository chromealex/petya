// «Вики из обсуждений» over fake HTTP servers (a messenger with search and threads behind the `messenger-source`
// registry, Confluence REST v2, the Notion API): routing incl. near-misses (ADR, searching the wiki, a meeting summary,
// sending), not added, no messenger, the thread found by topic or by link, a tie asked, the existing page found through
// the documentation sources of «Поиск по всему» and the update offered instead, the draft with verbatim quotes and links
// and the owner from «Команда», the model's draft (invented quotes and points dropped), a meeting as the source, and
// publishing only through the IPC: a new Confluence page, an update with the version guard, a Notion page.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const app=require('../src/extensions/wiki-author/feature.cjs');
const publish=require('../src/extensions/wiki-author/publish.cjs');
const offer=require('../src/extensions/wiki-author/offer.cjs');
const msgs=require('../src/features/messenger-sources.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
async function server(handler){
 const calls=[];
 const srv=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',async()=>{
  const u=new URL(req.url,'http://x');const parsed=body?JSON.parse(body):null;calls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body:parsed,headers:req.headers});
  const out=await handler(req.method,u,parsed);
  if(out===undefined){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}
  res.writeHead(out?.status||200,{'Content-Type':'application/json'});res.end(JSON.stringify(out?.status?out.body||{}:out));
 });});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+srv.address().port,calls,close:()=>srv.close()};
}
async function json(url,o={}){const r=await fetch(url,o);if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;throw e;}return r.status===204?null:r.json();}

// The messenger: two threads about matchmaking in #game-design, one about payments.
const at=m=>'2026-11-0'+m+'T10:00:00Z';
const R=k=>k.padEnd(26,'0');
const THREADS={
 [R('r1')]:[{id:R('r1'),author:'Олег Смирнов',text:'Матчмейкинг: что делаем с долгим поиском на ночном онлайне?',at:at(3),replies:4},
  {id:'a1',author:'Мария Ким',text:'Предлагаю расширять окно рейтинга на 50 каждые 10 секунд поиска.',at:at(3)},
  {id:'a2',author:'Иван Петров',text:'А ботов подмешивать после 40 секунд? <img src=x onerror=alert(1)>',at:at(4)},
  {id:'a3',author:'Мария Ким',text:'Договорились: окно расширяем до 300 рейтинга, ботов не подмешиваем в ранговых.',at:at(5)},
  {id:'a4',author:'Олег Смирнов',text:'Ок, матчмейкинг для турниров обсудим отдельно?',at:at(5)}],
 [R('r2')]:[{id:R('r2'),author:'Иван Петров',text:'Матчмейкинг в турнирах: нужен отдельный пул?',at:at(6),replies:1},{id:'b1',author:'Олег Смирнов',text:'Матчмейкинг турниров — пока общий пул.',at:at(6)}],
 [R('r3')]:[{id:R('r3'),author:'Иван Петров',text:'Оплата в Китае: нужен WeChat Pay.',at:at(7),replies:1},{id:'c1',author:'Мария Ким',text:'Решили: подключаем через агрегатора.',at:at(7)}]
};
const raw=(root,m)=>({id:m.id,channel:{id:'C1',name:'game-design'},thread:root,author:{id:m.author,name:m.author},text:m.text,at:m.at,url:'https://chat.studio.example/game/pl/'+m.id,replies:m.replies||0});
async function messenger(){
 return server(async(method,u)=>{
  if(u.pathname==='/search'){const q=u.searchParams.get('q').toLowerCase().split(/\s+/).map(w=>w.slice(0,Math.max(3,w.length-2)));
   return {messages:Object.entries(THREADS).flatMap(([root,list])=>list.map(m=>raw(root,m))).filter(m=>q.every(w=>m.text.toLowerCase().includes(w)))};}
  const t=/^\/threads\/(\w+)$/.exec(u.pathname);if(t)return {messages:(THREADS[t[1]]||[]).map(m=>raw(t[1],m))};
 });
}
function source(url){
 return {id:'chat',extension:'chat',setting:null,name:'Чат студии',source:{name:'Чат студии',ready:()=>true,channels:async()=>[{id:'C1',name:'game-design'}],messages:async()=>({messages:[]}),
  thread:async(s,{id})=>json(url+'/threads/'+id),search:async(s,{query})=>json(url+'/search?'+new URLSearchParams({q:query}))}};
}
const TEAM=[{key:'masha',name:'Мария Ким',aliases:['Маша']},{key:'oleg',name:'Олег Смирнов'}];
const people={find:t=>{const m=TEAM.find(p=>String(t).includes(p.name)||(p.aliases||[]).some(a=>String(t).includes(a)));return m?{member:m}:null;}};

function fixture(over={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-wiki-'));
 const topic={id:'t1',title:'Чат',messages:[]};
 const model=[];
 const settings={'extension_wiki-author':'true',model:over.model?'qwen3:8b':'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...over.settings};
 const s={settings,dataRoot:root,requestProgress:{report(){}},people,memory:{prune:()=>over.memory||[]},
  request:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:11434')){model.push(JSON.parse(o.body));return {message:{content:JSON.stringify(over.model)}};}return over.request?over.request(url,o):Promise.reject(Error('нет сети'));},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}},...over.services};
 s.messengerSources=msgs.create(s,{sources:over.sources||[],now:()=>+NOW});
 return {s,topic,model};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'оформи в вики итоги треда про матчмейкинг':['thread','матчмейкинг',''],'Петя, перенеси в Confluence итоги встречи про релиз 2.3':['meeting','релиз 2.3','confluence'],
  'задокументируй в Notion обсуждение про оплату в Китае':['thread','оплату в Китае','notion'],'запиши в базу знаний итоги обсуждения про лиги, ответственный — Маша':['thread','лиги',''],'оформи в гугл док итоги созвона про бюджет':['meeting','бюджет','google']};
 for(const [p,[src,topic,dest]] of Object.entries(own)){const k=app.kind(p);assert.ok(k,p);assert.equal(k.source,src,p);assert.equal(k.topic,topic,p);assert.equal(k.dest,dest,p);}
 assert.equal(app.kind('сделай вики-страницу из треда https://studio.slack.com/archives/C024BE91L/p1699999999123456').link,'https://studio.slack.com/archives/C024BE91L/p1699999999123456');
 assert.equal(app.kind('запиши в базу знаний итоги обсуждения про лиги, ответственный — Маша').owner,'Маша');
 for(const p of ['запиши решение: переходим на Addressables','оформи ADR про лиги','найди в Confluence про лиги','что в вики про лиги','отправь в слак итоги','сводка встречи','оформи итоги треда про матчмейкинг','опиши систему лиг в GDD','оформи в вики страницу про онбординг','сохрани это в Google Docs','что поменяли в GDD за неделю','/wiki-author оформи в вики итоги треда про лиги',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.deepEqual(app.linkId('https://studio.slack.com/archives/C1/p1699999999123456?thread_ts=1699999990.000100&cid=C1'),{id:'1699999990.000100',channel:'C1'});
 const offered=t=>!offer.avoid.some(r=>r.test(t))&&offer.topics.some(r=>r.test(t));
 for(const t of ['оформи в вики итоги треда про матчмейкинг','перенеси в Confluence итоги встречи про релиз','задокументируй в Notion обсуждение про оплату'])assert.ok(offered(t),t);
 for(const t of ['оформи ADR про лиги','найди в Confluence про лиги','сводка встречи','что поменяли в GDD за неделю','отправь в слак итоги треда'])assert.ok(!offered(t),t);
 assert.equal(offer.ready({'extension_wiki-author':'true'}),true);

 // --- Not added / no messenger ---------------------------------------------------------------------------------------
 assert.equal(await app.turn(fixture({settings:{'extension_wiki-author':'false'}}).s,'оформи в вики итоги треда про матчмейкинг'),null);
 let r=await app.turn(fixture().s,'оформи в вики итоги треда про матчмейкинг');
 assert.equal(r.question,true);assert.match(r.text,/Нет подключённых мессенджеров/);

 // --- A tie between two threads is asked -----------------------------------------------------------------------------------
 const chat=await messenger();
 let f=fixture({sources:[source(chat.url)]});
 let q;try{await app.turn(f.s,'оформи в вики итоги треда про матчмейкинг',{now:NOW});}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.equal(q.spec.strictChoices,true);
 assert.equal(q.spec.options.length,2);assert.match(q.spec.options[0],/^Чат студии · game-design · «Матчмейкинг/);
 r=await q.resume(q.spec.options.find(o=>/долгим поиском/.test(o)));
 let c=r.extensionData.wikiCard;
 assert.equal(c.page,null);assert.equal(c.dest,'','nothing connected to publish to');assert.deepEqual(c.destinations,[]);
 assert.equal(c.where.label,'Чат студии · game-design');assert.equal(c.where.url,'https://chat.studio.example/game/pl/'+R('r1'));
 assert.deepEqual(c.owner,{name:'Мария Ким',key:'masha',why:'подвёл итог в треде'});
 assert.match(c.text,/^# Матчмейкинг\n\n\*\*Ответственный:\*\* Мария Ким\n\n## Контекст\n\nМатчмейкинг: что делаем с долгим поиском на ночном онлайне\? \(\[#1\]\(https:\/\/chat\.studio\.example\/game\/pl\/r10+\)\)/);
 assert.match(c.text,/## Итоги\n\n- Договорились: окно расширяем до 300 рейтинга, ботов не подмешиваем в ранговых\. \(\[#4\]\(https:\/\/chat\.studio\.example\/game\/pl\/a3\)\)/);
 assert.match(c.text,/## Открытые вопросы\n\n- Ок, матчмейкинг для турниров обсудим отдельно\?/);
 assert.match(c.text,/> «Предлагаю расширять окно рейтинга на 50 каждые 10 секунд поиска\.» — \[Мария Ким\]\(https:\/\/chat\.studio\.example\/game\/pl\/a1\)/);
 assert.match(c.text,/## Источник\n\n- Чат студии · game-design — https:\/\/chat\.studio\.example\/game\/pl\/r10+ · 2026-11-03 — 2026-11-05 · участники: Олег Смирнов, Мария Ким, Иван Петров/);
 assert.equal(c.quotes.length,3);assert.ok(c.quotes.every(x=>x.url.startsWith('https://chat.studio.example/')));
 assert.equal(c.timeline.length,5);
 assert.match(r.text,/^Черновик вики-страницы «Матчмейкинг» по треду \(Чат студии · game-design\): 1 итог, 3 цитаты, ответственный — Мария Ким\. Опубликую только после вашей кнопки/);

 // --- By link; the owner named in the request ---------------------------------------------------------------------------------
 c=(await app.turn(f.s,'сделай вики-страницу из треда https://chat.studio.example/game/pl/'+R('r3'),{now:NOW})).extensionData.wikiCard;
 assert.equal(c.where.url,'https://chat.studio.example/game/pl/'+R('r3'));assert.equal(c.timeline.length,2);assert.match(c.text,/Решили: подключаем через агрегатора/);
 r=await app.turn(f.s,'сделай вики-страницу из треда https://chat.studio.example/game/pl/'+R('zz'),{now:NOW});
 assert.equal(r.question,true,'an unknown permalink is a question');
 r=await app.turn(f.s,'запиши в вики итоги обсуждения про оплату в Китае, ответственный — Маша',{now:NOW});
 assert.equal(r.extensionData.wikiCard.owner.name,'Мария Ким');assert.equal(r.extensionData.wikiCard.owner.why,'назван в запросе');
 r=await app.turn(f.s,'оформи в вики итоги треда про телепорты',{now:NOW});
 assert.equal(r.question,true);assert.match(r.text,/Не нашёл тред про «телепорты»/);

 // --- An existing Confluence page on the topic: update it (diff, version guard) or create a new one -----------------------------------
 let version=4;const pages=[];
 const conf=await server(async(method,u,body)=>{
  if(u.pathname==='/wiki/api/v2/pages/555'&&method==='GET')return {id:'555',title:'Матчмейкинг',version:{number:version},body:{storage:{value:'<h1>Матчмейкинг</h1><h2>Итоги</h2><p>Окно рейтинга — 200.</p>'}}};
  if(u.pathname==='/wiki/api/v2/pages/555'&&method==='PUT'){version=body.version.number;return {id:'555',_links:{webui:'/spaces/GAME/pages/555'}};}
  if(u.pathname==='/wiki/api/v2/spaces')return {results:[{id:'98765',key:'GAME'}]};
  if(u.pathname==='/wiki/api/v2/pages'&&method==='POST'){pages.push(body);return {id:'556',_links:{webui:'/spaces/GAME/pages/556'}};}
 });
 const confSettings={module_confluence:'true',jiraUrl:conf.url,jiraEmail:'lead@studio.example',jiraToken:'jira-test',confluenceSpace:'GAME'};
 const workspace={api:(route,o={},st)=>json(st.jiraUrl+route,{...o,headers:{'Content-Type':'application/json'}}),
  searchDocs:async(ctx,query)=>({terms:[query],docs:/матчмейк/i.test(query)?[{id:'confluence:555',source:'Confluence',title:'Матчмейкинг',text:'Окно рейтинга — 200.',url:conf.url+'/wiki/pages/viewpage.action?pageId=555',updated:'2026-10-01T10:00:00Z'}]:[],warnings:[]})};
 f=fixture({sources:[source(chat.url)],settings:confSettings,services:{workspace}});
 let first;try{await app.turn(f.s,'оформи в вики итоги треда про матчмейкинг',{now:NOW});}catch(e){first=e;}
 const thread=await first.resume(first.spec.options.find(o=>/долгим поиском/.test(o))).catch(e=>e);
 assert.ok(thread instanceof InputRequired,'the existing page is asked about before drafting');
 assert.match(thread.spec.text,/^Про «матчмейкинг» уже есть страница: «Матчмейкинг» \(Confluence\)\. Обновить её вместо новой\?$/);
 assert.deepEqual(thread.spec.options,['Обновить «Матчмейкинг» (Confluence)','Создать новую страницу']);
 c=(await thread.resume('Обновить «Матчмейкинг» (Confluence)')).extensionData.wikiCard;
 assert.equal(c.page.service,'confluence');assert.equal(c.title,'Матчмейкинг');assert.deepEqual(c.destinations,['confluence']);
 assert.ok(c.page.ops.some(o=>o.op==='del'&&/200/.test(o.text)),'the diff against the existing page');
 const ipc=app.setup(f.s).ipc;
 assert.equal(conf.calls.filter(x=>x.method!=='GET').length,0,'nothing published by the turn');
 const done=await ipc.publish(c.draftId,'confluence',c.text);
 assert.equal(done.text,'Страница «Матчмейкинг» обновлена в Confluence');assert.equal(done.url,conf.url+'/wiki/spaces/GAME/pages/555');
 const put=conf.calls.find(x=>x.method==='PUT');assert.equal(put.body.version.number,5);assert.ok(!/<h1>/.test(put.body.body.value));assert.match(put.body.body.value,/<blockquote>/);
 assert.equal((await ipc.publish(c.draftId,'confluence',c.text)).text,'Уже опубликовано');
 // A page changed since the draft is refused.
 try{await app.turn(f.s,'оформи в вики итоги треда про матчмейкинг',{now:NOW});}catch(e){first=e;}
 const again=await first.resume(first.spec.options.find(o=>/долгим поиском/.test(o))).catch(e=>e);
 const stale=(await again.resume('Обновить «Матчмейкинг» (Confluence)')).extensionData.wikiCard;version=9;
 await assert.rejects(ipc.publish(stale.draftId,'confluence',stale.text),/изменилась после черновика \(версия 9\)/);
 // Or a new page in the space.
 try{await app.turn(f.s,'оформи в вики итоги треда про матчмейкинг',{now:NOW});}catch(e){first=e;}
 const asked=await first.resume(first.spec.options.find(o=>/долгим поиском/.test(o))).catch(e=>e);
 c=(await asked.resume('Создать новую страницу')).extensionData.wikiCard;
 assert.equal(c.page,null);assert.equal(c.dest,'confluence');assert.deepEqual(c.destinations,['confluence']);
 const made=await ipc.publish(c.draftId,'confluence',c.text);
 assert.equal(pages[0].spaceId,'98765');assert.equal(pages[0].title,'Матчмейкинг');assert.equal(made.url,conf.url+'/wiki/spaces/GAME/pages/556');
 await assert.rejects(ipc.publish('../x','confluence','x'),/Некорректный черновик/);
 conf.close();

 // --- The model's draft: invented quotes and points without a message are dropped -------------------------------------------------------
 f=fixture({sources:[source(chat.url)],model:{title:'Матчмейкинг на ночном онлайне',summary:'Поиск долгий ночью.',decisions:[{text:'Окно рейтинга расширяем до 300.',n:4},{text:'Ботов добавим везде.',n:42}],open:[{text:'Турниры обсудить отдельно.',n:5}],
  quotes:[{quote:'расширять окно рейтинга на 50 каждые 10 секунд',n:2},{quote:'боты — это зло',n:3}]}});
 try{await app.turn(f.s,'оформи в вики итоги треда про матчмейкинг',{now:NOW});}catch(e){first=e;}
 c=(await first.resume(first.spec.options.find(o=>/долгим поиском/.test(o)))).extensionData.wikiCard;
 assert.equal(c.by,'model');assert.equal(c.title,'Матчмейкинг на ночном онлайне');
 assert.match(c.text,/## Итоги\n\n- Окно рейтинга расширяем до 300\. \(\[#4\]/);assert.ok(!/Ботов добавим везде/.test(c.text),'a point naming no message is dropped');
 assert.deepEqual(c.quotes.map(x=>x.quote),['расширять окно рейтинга на 50 каждые 10 секунд'],'an invented quote is dropped');
 assert.equal(JSON.parse(f.model[0].messages[1].content).messages.length,5);

 // --- A meeting as the source; a Notion page under a parent ------------------------------------------------------------------------------
 const memory=[{id:'summary:m9',kind:'summary',title:'Сводка встречи · Релиз 2.3',at:Date.parse('2026-11-06T12:00:00Z'),summary:{discussed:['Сроки релиза 2.3'],decisions:['Релиз 2.3 — 20 ноября','Фриз фич с 13 ноября'],tasks:[{title:'Собрать RC',assignee:'Олег Смирнов'}],notDiscussed:[]}}];
 const notion=await server(async(method,u,body)=>{if(u.pathname==='/v1/pages'&&method==='POST')return {id:'1f2e3d4c-5b6a-4789-8abc-def012345678',url:'https://www.notion.so/Reliz-1f2e3d4c5b6a47898abcdef012345678'};});
 f=fixture({memory,settings:{module_notion:'true',notionToken:'notion-test'},request:(url,o)=>json(String(url).replace('https://api.notion.com',notion.url),o)});
 c=(await app.turn(f.s,'перенеси в Notion итоги встречи про релиз 2.3',{now:NOW})).extensionData.wikiCard;
 assert.equal(c.meeting,true);assert.equal(c.where.label,'Встреча «Релиз 2.3»');assert.equal(c.dest,'notion');assert.equal(c.owner,null);
 assert.match(c.text,/\*\*Ответственный:\*\* уточнить — нет в «Команде»/);
 assert.match(c.text,/## Итоги\n\n- Релиз 2\.3 — 20 ноября \(#2\)\n- Фриз фич с 13 ноября \(#3\)/);
 const np=app.setup(f.s).ipc;
 await assert.rejects(np.publish(c.draftId,'notion',c.text,{parent:'просто текст'}),/родительскую страницу Notion/);
 const nn=await np.publish(c.draftId,'notion',c.text,{parent:'https://www.notion.so/studio/Wiki-0a1b2c3d4e5f60718293a4b5c6d7e8f9'});
 assert.equal(nn.url,'https://www.notion.so/Reliz-1f2e3d4c5b6a47898abcdef012345678');
 const posted=notion.calls[0];
 assert.equal(posted.headers['notion-version'],'2025-09-03');assert.equal(posted.headers.authorization,'Bearer notion-test');
 assert.deepEqual(posted.body.parent,{page_id:'0a1b2c3d4e5f60718293a4b5c6d7e8f9'});
 assert.equal(posted.body.properties.title.title[0].text.content,'Релиз 2.3');
 assert.ok(posted.body.children.some(b=>b.type==='heading_1'&&b.heading_1.rich_text[0].text.content==='Итоги'),'## becomes heading_1 under the page title');
 assert.ok(posted.body.children.every(b=>b.object==='block'));
 notion.close();chat.close();
 // Blocks: links stay links.
 assert.deepEqual(publish.rich('см. [#1](https://chat.studio.example/x)'),[{type:'text',text:{content:'см. '}},{type:'text',text:{content:'#1',link:{url:'https://chat.studio.example/x'}}}]);
 assert.equal(publish.notionId('https://www.notion.so/studio/Wiki-0a1b2c3d4e5f60718293a4b5c6d7e8f9?pvs=4'),'0a1b2c3d4e5f60718293a4b5c6d7e8f9');
 console.log('Wiki author: routing and near-misses, offer, threads by topic and link with a tie asked, the existing page offered for update (diff, version guard) or a new one, verbatim quotes with links, owner from «Команда», model draft checked, a meeting source, Confluence and Notion publishing over fake servers passed');
})().catch(e=>{console.error(e);process.exit(1);});
