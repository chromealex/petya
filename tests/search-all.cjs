// «Поиск по всему»: routing and near-misses, subject and stems, BM25 + recency ranking, snippets with highlight offsets,
// every source stubbed (stored Slack/Telegram/meetings/mail, Slack search API allowed and not, Confluence/Notion,
// Jira, Gmail and Outlook, project files with limits, glossary), per-source timeouts and errors with partial results,
// optional embedding re-rank, «Ответь по найденному» with citations checked in code, no model, not added.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/search-all/feature.cjs');
const Q=require('../src/extensions/search-all/query.cjs');
const R=require('../src/extensions/search-all/rank.cjs');
const SRC=require('../src/extensions/search-all/sources.cjs');
const embed=require('../src/extensions/search-all/embed.cjs');
const offer=require('../src/extensions/search-all/offer.cjs');
const DAY=86400000,NOW=Date.UTC(2026,10,9,12);

(async()=>{
 // --- Routing and the subject ------------------------------------------------------------------------------------------
 for(const [text,subject] of [['найди везде про матчмейкинг','матчмейкинг'],['где обсуждали оплату в Китае','оплату в Китае'],['поиск по всему: лиги','лиги'],['Петя, поищи везде насчёт релиза 2.3','релиза 2.3'],
  ['где мы говорили о бонусах за рефералов','бонусах за рефералов'],['найди по всем источникам «ночной режим»','ночной режим'],['искать везде: античит','античит']]){
  assert.equal(Q.kind(text),'search',text);assert.equal(Q.subject(text),subject,text);
 }
 assert.equal(Q.kind('ответь по найденному'),'answer');assert.equal(Q.kind('Ответь по найденному в Slack'),'answer');assert.equal(Q.kind('подытожь результаты поиска'),'answer');
 for(const text of ['найди файл config.json','найди в интернете про лиги','найди в таблице выручку за октябрь','найди человека, который знает Unity','кто знает про матчмейкинг','найди везде файл build.gradle',
  'найди в Confluence про лиги','что обсуждали на встрече','найди задачу про оплату','привет','найди везде в интернете отзывы про нас','где лежит ключ от офиса'])
  assert.equal(Q.kind(text),null,'near-miss: '+text);
 assert.deepEqual(['оплату','оплата','оплаты','Китае','Китай','Китая','лиги','лигу'].map(Q.stem),['оплат','оплат','оплат','кита','кита','кита','лиг','лиг']);
 assert.ok(Q.meets('игро','игр')&&Q.meets('лигах','лиг')&&!Q.meets('китель','кита'));
 assert.deepEqual(Q.named('ответь по найденному в Slack и Jira'),['slack','jira']);

 // --- Ranking and snippets -------------------------------------------------------------------------------------------
 const terms=Q.terms('оплату в Китае',['payment','China']);
 assert.deepEqual(terms.map(t=>[t.stem,t.weight]),[['оплат',1],['кита',1],['payment',0.6],['china',0.6]]);
 const ranked=R.rank([
  {id:'old',title:'Оплата',text:'оплата в Китае через WeChat Pay',at:NOW-300*DAY},
  {id:'new',title:'Оплата в Китае',text:'обсуждаем оплату в Китае: Alipay и WeChat, оплата в юанях',at:NOW-DAY},
  {id:'half',title:'Оплата',text:'оплата картой в Европе',at:NOW},
  {id:'en',title:'Payments',text:'China payment provider review',at:NOW-2*DAY},
  {id:'none',title:'Лиги',text:'сезон лиг',at:NOW}],terms,{now:NOW});
 assert.deepEqual(ranked.map(r=>r.id),['new','old','en','half'],'both words and recent beat one word; unrelated is dropped');
 const sn=R.snippet('Вчера долго спорили. '+'Текст без совпадений. '.repeat(20)+'Решили: оплата в Китае пойдёт через Alipay, а оплату картами отложим. '+'Ещё текст. '.repeat(20),terms,{size:120});
 assert.ok(sn.snippet.startsWith('…')&&sn.snippet.endsWith('…'));
 assert.deepEqual(sn.marks.map(([a,b])=>sn.snippet.slice(a,b)),['оплата','Китае','оплату']);

 // --- Stubbed sources ------------------------------------------------------------------------------------------------
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-search-'));
 const project=path.join(tmp,'Game');fs.mkdirSync(path.join(project,'Assets','Scripts','Net'),{recursive:true});fs.mkdirSync(path.join(project,'node_modules','x'),{recursive:true});fs.mkdirSync(path.join(project,'docs'),{recursive:true});
 fs.writeFileSync(path.join(project,'Assets','Scripts','Net','Matchmaker.cs'),'// Matchmaking queue: pairs players by MMR\npublic class Matchmaker {\n  // матчмейкинг по рейтингу, окно 200 MMR\n}\n');
 fs.writeFileSync(path.join(project,'docs','payments.md'),'# Payments\nОплата в Китае: только через Alipay и WeChat Pay, см. PAY-12.\n');
 fs.writeFileSync(path.join(project,'node_modules','x','matchmaking.js'),'matchmaking matchmaking');
 fs.writeFileSync(path.join(project,'Assets','big.json'),'{"matchmaking":"'+'x'.repeat(600*1024)+'"}');
 fs.writeFileSync(path.join(project,'Assets','logo.png'),'matchmaking');
 fs.mkdirSync(path.join(tmp,'company','extensions','glossary'),{recursive:true});
 fs.writeFileSync(path.join(tmp,'company','extensions','glossary','glossary.json'),JSON.stringify({version:1,projects:{p1:{name:'Game',terms:[{id:'t1',term:'Матчмейкинг',definition:'Подбор соперников по MMR.',synonyms:['подбор'],translations:{en:'Matchmaking'},at:NOW-10*DAY},{id:'t2',term:'Мана',definition:'Ресурс заклинаний.',synonyms:[],translations:{}}]}}}));
 const topic={id:'t',title:'Чат',projectId:'p1',messages:[]};
 const memory=[
  {id:'s1',source:'Slack',title:'#jw-bw-dev · Матчмейкинг',channel:'jw-bw-dev',url:'https://team.slack.com/archives/C1/p1762000000000100',at:NOW-2*DAY,messages:[
   {user:'Олег',ts:'1762000000.000100',at:NOW-3*DAY,text:'Матчмейкинг ломается на пиках: очередь растёт до 4 минут'},{user:'Маша',ts:'1762000100.000200',at:NOW-2*DAY,text:'Предлагаю расширять окно MMR в матчмейкинге каждые 30 секунд'},{user:'Маша',ts:'1762000200.000300',at:NOW-2*DAY,text:'и ещё про обед'}]},
  {id:'s2',source:'Slack',title:'#payments',url:'https://team.slack.com/archives/C2/p1762100000000100',at:NOW-5*DAY,messages:[{user:'Ира',ts:'1762100000.000100',at:NOW-5*DAY,text:'Оплата в Китае: Apple не пускает внешние платежи, обсуждаем Alipay'}]},
  {id:'tg1',source:'Telegram',title:'Игроки BW',at:NOW-DAY,messages:[{user:'Player1',id:'5',at:NOW-DAY,text:'когда починят матчмейкинг? ищет по 5 минут'}]},
  {id:'m1',source:'Встреча',sessionId:'sess1',title:'Планёрка · 05.11',speaker:'Олег',at:NOW-4*DAY,text:'по матчмейкингу решили: окно MMR 200, потом расширяем'},
  {id:'m2',source:'Микрофон',sessionId:'sess1',title:'Планёрка · 05.11',at:NOW-4*DAY,text:'согласен'},
  {id:'n1',source:'Заметка',title:'Идеи',text:'лиги и сезоны',at:NOW-DAY}];
 const calls=[];let model=[],slackMode='ok',jiraMode='ok',docsMode='ok';
 const s={settings:{'extension_search-all':'false',model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat',slackToken:'test-token',jiraUrl:'https://studio.atlassian.net',jiraEmail:'me@studio.dev',jiraToken:'t'.repeat(20),jiraProjects:'BW',notionToken:'n'.repeat(20)},
  dataRoot:path.join(tmp,'company'),requestProgress:{report(){}},memory:{prune:()=>structuredClone(memory)},
  dialogue:{state:{topics:[topic],projects:[{id:'p1',name:'Game',folders:[project]}],activeProjectId:'p1'},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  workspace:{settings:()=>s.settings,
   async searchDocs(ctx,query){calls.push({docs:query});if(docsMode==='error')throw Error('Confluence: HTTP 503');return {terms:[query],docs:[{id:'confluence:9',source:'Confluence',title:'Матчмейкинг: правила подбора',text:'Матчмейкинг подбирает соперников по MMR. Окно 200.',url:'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=9',updated:new Date(NOW-20*DAY).toISOString()},{id:'notion:x',source:'Notion',title:'Лиги и матчмейкинг',text:'Лиги влияют на матчмейкинг',url:'https://www.notion.so/x',updated:new Date(NOW-40*DAY).toISOString()}],warnings:['Notion: поиск по названиям страниц; текст найденных документов используется в плане.']};},
   async api(route,options){calls.push({jira:JSON.parse(options.body)});if(jiraMode==='slow')return new Promise(()=>{});if(jiraMode==='error')throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});
    return {issues:[{key:'BW-77',fields:{summary:'Матчмейкинг: долгий поиск на пиках',status:{name:'В работе'},issuetype:{name:'Баг'},updated:new Date(NOW-DAY).toISOString(),description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Очередь матчмейкинга растёт до 4 минут.'}]}]}}}]};}},
  mailAccounts:{accounts:()=>[{id:'g1',provider:'Google',email:'me@studio.dev'},{id:'microsoft:o1',provider:'Microsoft',email:'me@corp.com'}],
   google:{client:()=>({async search(q){calls.push({gmail:q});return [{id:'18c2f',subject:'Re: матчмейкинг в турнирах',from:'Олег <oleg@studio.dev>',at:NOW-6*DAY,text:'По матчмейкингу в турнирах — ждём данных.'}];}})},
   microsoft:{client:()=>({access:async()=>'ms-token',async json(url){calls.push({outlook:decodeURIComponent(url)});return {value:[{id:'AAA',subject:'Матчмейкинг: отчёт',from:{emailAddress:{name:'Аналитика'}},receivedDateTime:new Date(NOW-8*DAY).toISOString(),bodyPreview:'Средняя длительность поиска матчмейкинга — 41 с.',webLink:'https://outlook.office.com/mail/id/AAA'}]};}})}},
  async request(url,options={}){
   if(url.startsWith('https://slack.com/api/search.messages')){calls.push({slack:url});if(slackMode==='limited')return {ok:false,error:'not_allowed_token_type'};
    return {ok:true,messages:{matches:[{text:'Предлагаю расширять окно MMR в матчмейкинге каждые 30 секунд',ts:'1762000100.000200',permalink:'https://team.slack.com/archives/C1/p1762000100000200?thread_ts=1762000000.000100',channel:{id:'C1',name:'jw-bw-dev'},username:'masha'},
     {text:'Матчмейкинг для турниров — отдельная очередь',ts:'1761000000.000100',permalink:'https://team.slack.com/archives/C9/p1761000000000100',channel:{id:'C9',name:'tournaments'},username:'oleg'}]}};}
   if(url==='http://127.0.0.1:11434/api/tags')return {models:[{name:'qwen3:4b'}]};
   if(url==='http://127.0.0.1:11434/api/chat'){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages.at(-1).content.slice(0,160));return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}
   throw Error('unexpected request '+url);
  }};
 app.deps.now=()=>NOW;

 // Not added → nothing.
 assert.equal(await app.turn(s,'найди везде про матчмейкинг'),null);
 s.settings['extension_search-all']='true';
 assert.equal(offer.ready(s.settings),true);

 // Full search: every source answers.
 embed.reset();
 model=[{words:['matchmaking','MMR']}];
 const found=await app.turn(s,'найди везде про матчмейкинг');
 const card=found.extensionData.searchAll;
 const by=Object.fromEntries(card.sources.map(x=>[x.id,[x.state,x.count]]));
 assert.deepEqual(by,{slack:['ok',3],confluence:['ok',1],notion:['ok',1],jira:['ok',1],mail:['ok',2],telegram:['ok',1],meetings:['ok',1],files:['ok',1],glossary:['ok',1]});
 assert.match(found.text,/^Нашёл по «матчмейкинг» 12 результатов: Slack 3, Confluence 1, Notion 1, Jira 1, Почта 2, Telegram 1, Встречи 1, Файлы проекта 1, Глоссарий 1\. Могу ответить по найденному\./);
 assert.equal(card.items.filter(i=>/окно MMR в матчмейкинге/.test(i.snippet)).length,1,'the Slack API hit and the stored message are one result');
 assert.ok(card.items.every(i=>i.marks.every(([a,b])=>/^(?:матчмейк|matchmak|mmr)/i.test(i.snippet.slice(a,b)))),'marks point at matched words');
 const file=card.items.find(i=>i.source==='files');
 assert.equal(file.title,path.join('Assets','Scripts','Net','Matchmaker.cs'));assert.equal(file.line,1);assert.equal(file.path,path.join(project,'Assets','Scripts','Net','Matchmaker.cs'));
 assert.ok(!card.items.some(i=>/node_modules|big\.json|logo\.png/.test(i.title)),'vendor folders, large and binary files are skipped');
 assert.deepEqual(card.extra,['matchmaking','MMR']);
 assert.equal(card.items.find(i=>i.source==='slack'&&/ломается/.test(i.snippet)).url,'https://team.slack.com/archives/C1/p1762000000000100','a root message links to the thread');
 assert.equal(card.items.find(i=>i.source==='jira').url,'https://studio.atlassian.net/browse/BW-77');
 const jql=calls.find(c=>c.jira).jira.jql;
 assert.equal(jql,'project IN ("BW") AND (text ~ "матчмейкинг*" OR text ~ "matchmaking" OR text ~ "MMR") ORDER BY updated DESC');
 assert.equal(calls.find(c=>c.gmail).gmail,'{матчмейкинг matchmaking MMR} newer_than:2y');
 assert.match(calls.find(c=>c.outlook).outlook,/\$search="матчмейкинг OR matchmaking OR MMR"/);
 assert.match(calls.find(c=>c.slack).slack,/query=%D0%BC%D0%B0%D1%82%D1%87/,'Slack is asked with the user\'s own words');
 assert.ok(found.messages.at(-1).sources.length>0);
 assert.ok(!card.items.some(i=>/обед/.test(i.snippet)),'messages without the subject are not results');
 // The Slack token cannot search: stored threads still answer, the card says why.
 slackMode='limited';calls.length=0;model=[{words:[]}];
 const limited=(await app.turn(s,'где обсуждали оплату в Китае')).extensionData.searchAll;
 const sl=limited.sources.find(x=>x.id==='slack');
 assert.equal(sl.state,'limited');assert.equal(sl.count,1);assert.match(sl.note,/Токен Slack не даёт искать/);
 assert.equal(limited.items[0].source,'slack','both words and recent first');
 assert.equal(limited.items.find(i=>i.source==='files').title,path.join('docs','payments.md'));
 // A slow source times out, a failing one is marked, the rest is shown.
 slackMode='ok';jiraMode='slow';docsMode='error';app.deps.timeouts.remote=150;model=[{words:[]}];
 const t0=Date.now();
 const partial=(await app.turn(s,'поиск по всему: матчмейкинг')).extensionData.searchAll;
 assert.ok(Date.now()-t0<3000,'the timeout does not wait for the slow source');
 const st=Object.fromEntries(partial.sources.map(x=>[x.id,x.state]));
 assert.equal(st.jira,'timeout');assert.equal(st.confluence,'error');assert.equal(st.notion,'error');assert.equal(st.slack,'ok');
 assert.match(partial.sources.find(x=>x.id==='confluence').note,/HTTP 503/);
 assert.ok(partial.items.length>5);
 jiraMode='error';model=[{words:[]}];
 assert.equal((await app.turn(s,'поиск по всему: матчмейкинг')).extensionData.searchAll.sources.find(x=>x.id==='jira').state,'error');
 jiraMode='ok';docsMode='ok';app.deps.timeouts.remote=8000;
 // Without a model: own words only.
 const keepModel=s.settings.model;s.settings.model='';
 const plain=(await app.turn(s,'найди везде про матчмейкинг')).extensionData.searchAll;
 assert.deepEqual(plain.extra,[]);assert.ok(plain.items.length>5);

 // Optional embeddings: an installed embedding model re-ranks the top results.
 s.settings.model=keepModel;embed.reset();
 const realRequest=s.request;let embedded=null;
 s.request=async(url,options)=>{
  if(url==='http://127.0.0.1:11434/api/tags')return {models:[{name:'qwen3:4b'},{name:'nomic-embed-text:latest'}]};
  if(url==='http://127.0.0.1:11434/api/embed'){embedded=JSON.parse(options.body);return {embeddings:embedded.input.map((t,i)=>i===0?[1,0]:/турнир/.test(t)?[1,0]:[0,1])};}
  return realRequest(url,options);
 };
 model=[{words:[]}];
 const meaning=(await app.turn(s,'найди везде про матчмейкинг')).extensionData.searchAll;
 assert.equal(meaning.embed,'nomic-embed-text:latest');assert.equal(embedded.model,'nomic-embed-text:latest');assert.equal(embedded.input[0],'матчмейкинг');
 assert.match(meaning.items[0].snippet,/турнир/,'the closest by meaning goes first');
 s.request=realRequest;embed.reset();

 // --- «Ответь по найденному» ----------------------------------------------------------------------------------------------
 model=[{words:[]}];
 await app.turn(s,'найди везде про матчмейкинг');
 model=[body=>{const user=JSON.parse(body.messages[1].content);assert.equal(user.question,'матчмейкинг');assert.equal(user.excerpts.length,12);assert.match(body.messages[0].content,/только по пронумерованным выдержкам/);
  return {answer:'Матчмейкинг на пиках ищет до 4 минут [1]. Решили начать с окна MMR 200 и расширять его [3, 9]. Ещё говорят про луну [42].',found:true};}];
 const answer=await app.turn(s,'Ответь по найденному');
 assert.equal(answer.text,'Матчмейкинг на пиках ищет до 4 минут [1]. Решили начать с окна MMR 200 и расширять его [3, 9]. Ещё говорят про луну.','a citation of a missing excerpt is removed');
 assert.deepEqual(answer.extensionData.searchAllAnswer.citations.map(c=>c.n),[1,3,9]);
 // Only Slack.
 model=[body=>{const user=JSON.parse(body.messages[1].content);assert.ok(user.excerpts.every(e=>e.source==='Slack'));return {answer:'Окно MMR расширяют каждые 30 секунд [1].',found:true};}];
 const onlySlack=await app.turn(s,'ответь по найденному только в Slack');
 assert.equal(onlySlack.extensionData.searchAllAnswer.citations[0].source,'slack');assert.deepEqual(onlySlack.extensionData.searchAllAnswer.only,['slack']);
 // An answer without citations is not an answer.
 model=[{answer:'Матчмейкинг — это хорошо.',found:true}];
 const ungrounded=await app.turn(s,'ответь по найденному');
 assert.match(ungrounded.text,/^В найденном нет прямого ответа на «матчмейкинг»/);assert.equal(ungrounded.extensionData.searchAllAnswer.found,false);
 s.settings.model='';
 assert.match((await app.turn(s,'ответь по найденному')).text,/выберите локальную модель/);
 s.settings.model=keepModel;
 // No search yet in this chat → a question.
 topic.messages.length=0;
 assert.match((await app.turn(s,'ответь по найденному')).text,/Сначала найдите/);
 // Nothing found.
 model=[{words:[]}];
 const nothing=await app.turn(s,'найди везде про квантовую гравитацию');
 assert.match(nothing.text,/^По «квантовую гравитацию» ничего не нашёл/);assert.equal(nothing.extensionData.searchAll.items.length,0);
 // No subject → a question; nothing connected at all → where to connect.
 assert.match((await app.turn(s,'найди везде')).text,/Что искать/);
 const bare={...s,settings:{'extension_search-all':'true'},memory:{prune:()=>[]},mailAccounts:null,dialogue:{...s.dialogue,state:{topics:[topic],projects:[],activeProjectId:'general'}}};
 const none=await app.turn(bare,'найди везде про лиги');
 assert.equal(none.question,true);assert.match(none.text,/Искать пока негде/);
 // Files: limits stop the walk and say so.
 const limitedFiles=await SRC.files(s,Q.terms('матчмейкинг',['matchmaking']),{maxFiles:1});
 assert.equal(limitedFiles.items.length<=1,true);assert.match(limitedFiles.note,/остановлен по лимиту \(файлы\)/);
 // Reveal only inside the project.
 const ipc=app.setup(s).ipc;
 assert.throws(()=>ipc.reveal('/etc/passwd'),/не из папки проекта/);
 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Поиск по всему: routing and near-misses, stems, BM25 + recency, snippets, all sources stubbed (Slack API allowed/limited, docs, Jira, Gmail/Outlook, Telegram, meetings, files with limits, glossary), timeouts and errors with partial results, embedding re-rank, answers with checked citations, no model, not added passed');
})().catch(e=>{console.error(e);process.exit(1);});
