// «Геймдизайн-документ» over a fixture project (the configs of tests/fixtures/config-balance plus leagues and a GDD in
// Markdown) and fake HTTP servers (Jira epics, a Confluence GDD page, a Google Docs GDD): routing incl. near-misses,
// not added, where the GDD is (found, asked, remembered), the draft from chat / meeting / Jira / configs with every
// number checked (config values cited as file:line, source numbers by their label, the rest «(уточнить)»), the model's
// draft checked the same way, the section written only through `apply` (exact text, once, refused when the GDD
// changed) into Markdown, Confluence (only that section of the storage body, the next version) and Google Docs
// (batchUpdate with the revision guard), «обнови раздел экономики по текущим конфигам», and «чего не хватает в GDD».
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const app=require('../src/extensions/gdd/feature.cjs');
const target=require('../src/extensions/gdd/target.cjs');
const offer=require('../src/extensions/gdd/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
const GDD='# GDD «Бункер»\n\n## Лиги\n\nВ сезоне 5 лиг. Сезон длится 30 дней.\n\n### Параметры из конфигов\n\n| Объект | Параметр | Значение | Где |\n|---|---|---|---|\n| Бронза | promoteTop | 5 | [old.json:1] |\n\n## Экономика\n\nСтартовый баланс — 100 золота. Лучник стоит 100, меч — 120.\n\n## Кланы\n\nКлан до 30 игроков.\n';
function project(over={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-gdd-'));
 const dir=path.join(root,'game');
 fs.cpSync(path.join(__dirname,'fixtures/config-balance/project'),dir,{recursive:true});
 fs.mkdirSync(path.join(dir,'Assets/Configs/Leagues'),{recursive:true});
 fs.writeFileSync(path.join(dir,'Assets/Configs/Leagues/leagues.json'),'[\n {"id":"bronze","name":"Бронза","minRating":0,"promoteTop":10,"seasonDays":28},\n {"id":"silver","name":"Серебро","minRating":1000,"promoteTop":10,"seasonDays":28},\n {"id":"gold","name":"Золото","minRating":2000,"promoteTop":5,"seasonDays":28}\n]\n');
 for(const f of ['LeagueService.cs','LeagueTable.cs'])fs.writeFileSync(path.join(dir,'Assets/Scripts',f),'class X {}\n');
 fs.mkdirSync(path.join(dir,'Assets/Scripts/Leagues'),{recursive:true});fs.mkdirSync(path.join(dir,'Assets/Scripts/Crafting'),{recursive:true});
 for(const f of ['Leagues/LeagueService.cs','Leagues/Promotion.cs','Crafting/Recipe.cs','Crafting/Workbench.cs'])fs.writeFileSync(path.join(dir,'Assets/Scripts',f),'class X {}\n');
 if(!over.noGdd){fs.mkdirSync(path.join(dir,'docs'),{recursive:true});fs.writeFileSync(path.join(dir,'docs/gdd.md'),GDD);}
 return {root,dir};
}
async function server(handler){
 const calls=[];
 const srv=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',async()=>{
  const u=new URL(req.url,'http://x');const parsed=body?JSON.parse(body):null;calls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body:parsed,auth:req.headers.authorization||''});
  const out=await handler(req.method,u,parsed);
  if(out===undefined){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}
  res.writeHead(out?.status||200,{'Content-Type':'application/json'});res.end(JSON.stringify(out?.status?out.body||{}:out));
 });});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+srv.address().port,calls,close:()=>srv.close()};
}
async function json(url,o={}){const r=await fetch(url,o);if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=await r.text();throw e;}return r.status===204?null:r.json();}

function fixture(over={}){
 const p=over.project||project(over);
 const topic={id:'t1',title:'Лиги',projectId:'p1',messages:[
  {role:'user',text:'По лигам решили: 6 лиг, легенда — топ-100 сервера.'},{role:'assistant',text:'Записал.'},{role:'user',text:'Как дела у Маши?'},...over.messages||[]]};
 const state={topics:[topic],projects:[{id:'general',name:'Общий'},{id:'p1',name:'Game',folders:over.noFolder?[]:[p.dir]}],activeProjectId:'p1'};
 const memory=[{id:'summary:m1',kind:'summary',title:'Сводка встречи · Геймдизайн',at:Date.parse('2026-11-05T12:30:00Z'),summary:{decisions:['Повышение в лиге — топ-10 игроков'],discussed:['Награды лиги за сезон'],tasks:[],notDiscussed:[]}}];
 const model=[];
 const settings={extension_gdd:'true',model:over.model?'qwen3:8b':'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...over.settings};
 const s={settings,dataRoot:p.root,requestProgress:{report(){}},memory:{prune:()=>memory},
  request:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:11434')){model.push(JSON.parse(o.body));return {message:{content:JSON.stringify(over.model)}};}return over.request?over.request(url,o):Promise.reject(Error('нет сети'));},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state},...over.services};
 return {s,p,topic,model};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'опиши систему лиг в GDD':['draft','систему лиг',false],'обнови раздел экономики по текущим конфигам':['draft','экономики',true],'Петя, распиши в GDD механику сундуков':['draft','механику сундуков',false],
  'добавь в геймдизайн-документ раздел про кланы':['draft','кланы',false],'чего не хватает в GDD':['gaps'],'каких разделов нет в GDD?':['gaps'],'какие системы не описаны в GDD':['gaps'],'GDD лежит в docs/design/gdd.md':['bind']};
 for(const [p,[k,topic,configs]] of Object.entries(own)){const r=app.kind(p);assert.equal(r?.kind,k,p);if(topic){assert.equal(r.topic,topic,p);assert.equal(r.configs,configs,p);}}
 for(const p of ['что такое GDD','напиши GDD','что поменяли в GDD за неделю','проверь свежесть документации','обнови документацию','сверь баланс с конфигами','обнови конфиги','запиши решение: лиги в GDD','составь шаблон GDD','обнови раздел экономики','какая документация устарела','оформи ADR про лиги','оформи в вики итоги треда про лиги','/gdd опиши лиги',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.equal(app.title('систему лиг'),'Система лиг');assert.equal(app.title('экономики'),'Экономика');
 const offered=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
 for(const t of ['опиши систему лиг в GDD','обнови раздел экономики по текущим конфигам','чего не хватает в GDD'])assert.ok(offered(t),t);
 for(const t of ['что поменяли в GDD за неделю','сверь баланс с конфигами','что такое GDD','проверь свежесть документации'])assert.ok(!offered(t),t);
 assert.equal(offer.ready({extension_gdd:'true'}),true);assert.equal(offer.ready({}),false);

 // --- Not added ------------------------------------------------------------------------------------------------------
 let f=fixture({settings:{extension_gdd:'false'}});
 assert.equal(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW}),null);

 // --- Jira epics over a fake server ------------------------------------------------------------------------------------
 const jira=await server(async(method,u,body)=>{
  if(u.pathname==='/rest/api/3/search/jql')return {issues:[{key:'BUN-12',fields:{summary:'Лиги: сезон 2',status:{name:'В работе'},description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Добавить лигу «Легенда» для топ-100 игроков сервера.'}]}]}}}]};
 });
 const jiraSettings={module_jira:'true',jiraUrl:jira.url,jiraEmail:'lead@studio.example',jiraToken:'jira-test',jiraProjects:'BUN'};
 const workspace={api:(route,o={},st)=>json(st.jiraUrl+route,{...o,headers:{'Content-Type':'application/json'}})};

 // --- The draft by rules: every number is backed or marked ---------------------------------------------------------------
 f=fixture({settings:jiraSettings,services:{workspace}});
 let r=await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW});
 let c=r.extensionData.gddCard;
 assert.equal(c.mode,'draft');assert.equal(c.target.kind,'file');assert.equal(c.target.where,'game/docs/gdd.md');
 assert.deepEqual(c.section,{title:'Лиги',exists:true,level:2});
 assert.equal(c.old,'В сезоне 5 лиг. Сезон длится 30 дней.\n\n### Параметры из конфигов\n\n| Объект | Параметр | Значение | Где |\n|---|---|---|---|\n| Бронза | promoteTop | 5 | [old.json:1] |');
 // The old prose stays; its numbers that no config or source backs are marked.
 assert.match(c.text,/^В сезоне 5 \(уточнить\) лиг\. Сезон длится 30 \(уточнить\) дней\./);
 // Sources with their own numbers, cited by label.
 assert.match(c.text,/- По лигам решили: 6 лиг, легенда — топ-100 сервера\. \[чат «Лиги»\]/);
 assert.match(c.text,/- Повышение в лиге — топ-10 игроков \[встреча «Геймдизайн»\]/);
 assert.match(c.text,/- Лиги: сезон 2\. Добавить лигу «Легенда» для топ-100 игроков сервера\. \[BUN-12\]/);
 // The config table: regenerated, every value with file:line.
 assert.match(c.text,/### Параметры из конфигов\n\nКонфиг: `Assets\/Configs\/Leagues\/leagues\.json`\n\n\| Объект \| Параметр \| Значение \| Где \|/);
 assert.match(c.text,/\| Бронза \| promoteTop \| 10 \| \[Assets\/Configs\/Leagues\/leagues\.json:2\] \|/);
 assert.match(c.text,/\| Золото \| minRating \| 2000 \| \[Assets\/Configs\/Leagues\/leagues\.json:4\] \|/);
 assert.ok(!/old\.json/.test(c.text),'the old table is replaced');
 assert.deepEqual(c.unclear.map(u=>u.number),['5','30']);
 assert.ok(c.cited>=12);
 assert.ok(c.facts.every(x=>/^Assets\/Configs\/Leagues\/leagues\.json:\d+$/.test(x.cite)));
 assert.deepEqual(c.sources.map(x=>x.kind),['chat','meeting','meeting','jira']);assert.ok(!c.sources.some(x=>/Маши/.test(x.text)));
 assert.ok(c.ops.some(o=>o.op==='ins')&&c.ops.some(o=>o.op==='del'));
 assert.match(jira.calls[0].body.jql,/^project IN \("BUN"\) AND issuetype = Epic AND \(text ~ "лиг"/);
 assert.equal(fs.readFileSync(path.join(f.p.dir,'docs/gdd.md'),'utf8'),GDD,'the draft writes nothing');
 assert.match(r.text,/^Обновил черновик раздела «Лиги» для GDD \(Markdown в проекте\): \d+ чис\p{L}+ со ссылкой на источник, 2 помечено «уточнить»\. В GDD запишу только после «Записать в GDD»/u);

 // --- Apply: exactly the editor's text, once, never over a changed GDD ----------------------------------------------------------
 const ipc=app.setup(f.s).ipc;
 assert.deepEqual(ipc.state(c.draftId),{state:'draft'});
 const edited=c.text.replace('В сезоне 5 (уточнить) лиг.','В сезоне 6 лиг [чат «Лиги»].');
 const pv=ipc.preview(c.draftId,edited);assert.deepEqual(pv.unclear.map(u=>u.number),['30']);assert.ok(pv.ops.length);
 const done=await ipc.apply(c.draftId,edited);
 assert.equal(done.text,'Раздел «Лиги» записан: docs/gdd.md');
 const after=fs.readFileSync(path.join(f.p.dir,'docs/gdd.md'),'utf8');
 assert.ok(after.startsWith('# GDD «Бункер»\n\n## Лиги\n\n'+edited+'\n\n## Экономика\n\nСтартовый баланс — 100 золота. Лучник'),'only that section changed');
 assert.ok(after.endsWith('## Кланы\n\nКлан до 30 игроков.\n'));
 assert.equal((await ipc.apply(c.draftId,'другое')).text,'Уже записано в GDD');
 const second=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;
 fs.appendFileSync(path.join(f.p.dir,'docs/gdd.md'),'\n## Новое\n');
 await assert.rejects(ipc.apply(second.draftId,second.text),/GDD изменился после черновика/);
 await assert.rejects(ipc.apply('../../etc','x'),/Некорректный черновик/);
 await assert.rejects(ipc.apply('00000000-0000-0000-0000-000000000000','x'),/устарел/);

 // --- «обнови раздел экономики по текущим конфигам»: configs only -------------------------------------------------------------
 f=fixture({settings:jiraSettings,services:{workspace}});jira.calls.length=0;
 c=(await app.turn(f.s,'обнови раздел экономики по текущим конфигам',{now:NOW})).extensionData.gddCard;
 assert.equal(c.section.title,'Экономика');assert.deepEqual(c.sources,[]);assert.equal(jira.calls.length,0,'configs only');
 // «Лучник стоит 100»: one config value of the archer → cited; the starting gold and the sword's price (the line names
 // no config object or field) → «уточнить».
 assert.match(c.text,/^Стартовый баланс — 100 \(уточнить\) золота\. Лучник стоит 100 \[Assets\/Configs\/Units\/Archer\.asset:23\], меч — 120 \(уточнить\)\./);
 assert.ok(c.facts.some(x=>x.field==='price')&&c.facts.some(x=>x.field==='cost'));
 assert.ok(!c.facts.some(x=>x.field==='damage'),'only economy fields of other configs');
 r=await app.turn(f.s,'обнови раздел телепортов по текущим конфигам',{now:NOW});
 assert.match(r.text,/В конфигах проекта не нашёл ничего про «телепортов»/);

 // --- The model's draft is checked the same way ------------------------------------------------------------------------------
 f=fixture({model:{text:'## Лиги\n\nЛиг пять: Бронза открывается с рейтинга 0 [Assets/Configs/Leagues/leagues.json:2], Золото — с 2000 [Assets/Configs/Leagues/leagues.json:2]. Сезон — 28 дней. Наверх проходят 25 лучших.'}});
 c=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;
 assert.equal(c.by,'model');
 assert.match(c.text,/^Лиг пять: Бронза открывается с рейтинга 0 \[Assets\/Configs\/Leagues\/leagues\.json:2\], Золото — с 2000 \(уточнить\) \[Assets\/Configs\/Leagues\/leagues\.json:2\]\. Сезон — 28 \(уточнить\) дней\. Наверх проходят 25 \(уточнить\) лучших\./,'a wrong citation and an ambiguous or unknown number are marked');
 assert.match(c.text,/### Параметры из конфигов/);
 const sent=JSON.parse(f.model[0].messages[1].content);assert.equal(sent.facts[0].cite,'Assets/Configs/Leagues/leagues.json:2');

 // --- Where the GDD is: asked, then remembered ----------------------------------------------------------------------------------
 f=fixture({noGdd:true});
 fs.mkdirSync(path.join(f.p.dir,'design'),{recursive:true});fs.writeFileSync(path.join(f.p.dir,'design/main.md'),'# Дизайн\n\n## Лиги\n\nПока пусто.\n');
 let q;try{await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW});}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.match(q.spec.text,/Где GDD проекта/);
 c=(await q.resume('design/main.md')).extensionData.gddCard;
 assert.equal(c.target.where,'game/design/main.md');assert.equal(c.section.title,'Лиги');
 assert.equal(target.bound(f.s).rel,'design/main.md','remembered for the project');
 assert.equal((await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard.target.where,'game/design/main.md');
 r=await app.turn(f.s,'GDD лежит в docs/nowhere.md');assert.equal(r.question,true);
 try{await app.turn(fixture({noGdd:true}).s,'опиши систему лиг в GDD');}catch(e){q=e;}
 assert.equal((await q.resume('где-то там')).question,true,'a vague answer is a question, not an error');

 // --- Confluence GDD: only that section of the storage body, the next version --------------------------------------------------
 let version=7;const STORAGE='<h1>GDD</h1><h2>Лиги</h2><p>В сезоне 5 лиг.</p><ac:structured-macro ac:name="info"><ac:rich-text-body><p>Подсказка в макросе</p></ac:rich-text-body></ac:structured-macro><h2>Экономика</h2><p>Старт 100 золота.</p>';
 let stored=STORAGE;
 const conf=await server(async(method,u,body)=>{
  if(u.pathname==='/wiki/api/v2/pages/777'&&method==='GET')return {id:'777',title:'GDD Бункер',version:{number:version},body:{storage:{value:stored}}};
  if(u.pathname==='/wiki/api/v2/pages/777'&&method==='PUT'){stored=body.body.value;version=body.version.number;return {id:'777'};}
 });
 f=fixture({settings:{module_confluence:'true',jiraUrl:conf.url,jiraEmail:'lead@studio.example',jiraToken:'jira-test'},services:{workspace}});
 r=await app.turn(f.s,'GDD лежит в '+conf.url+'/wiki/spaces/GAME/pages/777/GDD');assert.match(r.text,/Запомнил: GDD этого проекта/);
 c=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;
 assert.equal(c.target.kind,'confluence');assert.equal(c.old,'В сезоне 5 лиг.\nПодсказка в макросе','the section as the card shows it (its macro text too)');
 await app.setup(f.s).ipc.apply(c.draftId,'В сезоне 6 лиг [чат «Лиги»].');
 const put=conf.calls.find(x=>x.method==='PUT');
 assert.equal(put.body.version.number,8);assert.equal(put.body.title,'GDD Бункер');assert.equal(put.body.body.representation,'storage');
 assert.equal(stored,'<h1>GDD</h1><h2>Лиги</h2><p>В сезоне 6 лиг [чат «Лиги»].</p><h2>Экономика</h2><p>Старт 100 золота.</p>','only the section, other sections untouched');
 const stale=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;version=9;
 await assert.rejects(app.setup(f.s).ipc.apply(stale.draftId,'x'),/изменилась после черновика \(версия 9\)/);
 conf.close();

 // --- Google Docs GDD: batchUpdate of the section with the revision guard -------------------------------------------------------------
 const DOC='1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';const updates=[];
 const para=(start,text,style)=>({startIndex:start,endIndex:start+text.length+1,paragraph:{paragraphStyle:{namedStyleType:style||'NORMAL_TEXT'},elements:[{textRun:{content:text+'\n'}}]}});
 const gdoc={documentId:DOC,title:'GDD Бункер',revisionId:'rev-1',body:{content:[para(1,'GDD','HEADING_1'),para(5,'Лиги','HEADING_2'),para(10,'В сезоне 5 лиг.'),para(26,'Экономика','HEADING_2'),para(36,'Старт 100 золота.')]}};
 const g=await server(async(method,u,body)=>{
  if(u.pathname==='/v1/documents/'+DOC&&method==='GET')return gdoc;
  if(u.pathname==='/v1/documents/'+DOC+':batchUpdate'){updates.push(body);return {documentId:DOC};}
 });
 const gmail=JSON.stringify({accounts:[{id:'g1',email:'me@studio.example',tokens:{scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents'}}]});
 f=fixture({settings:{'extension_google-drive':'true',gmailCredential:gmail},request:(url,o)=>json(String(url).replace('https://docs.googleapis.com',g.url),o),services:{mailAccounts:{google:{client:()=>({access:async()=>'acct-docs'})}}}});
 await app.turn(f.s,'наш GDD — https://docs.google.com/document/d/'+DOC+'/edit');
 c=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;
 assert.equal(c.target.kind,'google');assert.equal(c.old,'В сезоне 5 лиг.');
 await app.setup(f.s).ipc.apply(c.draftId,'В сезоне 6 лиг [чат «Лиги»].\n\n### Параметры из конфигов\n\n| Объект | Параметр |\n|---|---|\n| Бронза | 10 |');
 assert.deepEqual(updates[0].writeControl,{requiredRevisionId:'rev-1'});
 assert.deepEqual(updates[0].requests[0],{deleteContentRange:{range:{startIndex:10,endIndex:26}}});
 assert.deepEqual(updates[0].requests[1],{insertText:{location:{index:10},text:'В сезоне 6 лиг [чат «Лиги»].\nПараметры из конфигов\nОбъект · Параметр\nБронза · 10\n'}});
 assert.ok(g.calls.every(x=>x.auth==='Bearer acct-docs'));
 // Without the Docs write permission: a clear error, nothing sent.
 const readOnly=JSON.stringify({accounts:[{id:'g1',email:'me@studio.example',tokens:{scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents.readonly'}}]});
 f.s.settings.gmailCredential=readOnly;updates.length=0;
 const ro=(await app.turn(f.s,'опиши систему лиг в GDD',{now:NOW})).extensionData.gddCard;
 await assert.rejects(app.setup(f.s).ipc.apply(ro.draftId,ro.text),/разрешение Google на запись/);assert.equal(updates.length,0);
 g.close();jira.close();

 // --- What the GDD lacks ----------------------------------------------------------------------------------------------------------------
 f=fixture();
 r=await app.turn(f.s,'чего не хватает в GDD');
 c=r.extensionData.gddCard;
 assert.equal(c.mode,'gaps');
 const st=Object.fromEntries(c.rows.map(x=>[x.name,x.status]));
 assert.equal(st.Leagues,'covered');assert.equal(c.rows.filter(x=>/^League/.test(x.name)).length,1,'one system per stem (config and code folder)');
 assert.equal(st.Unit,'missing');assert.equal(st.Waves,'missing');assert.equal(st.Crafting,'missing');assert.equal(st.Items,'missing');
 assert.equal(c.rows[0].status==='covered',false,'missing first');
 assert.match(r.text,/^В GDD нет разделов для \d+ из \d+ систем: /);
 assert.equal((await app.turn(fixture({noFolder:true}).s,'чего не хватает в GDD').catch(e=>e)).name,'InputRequired','no folder: where is the GDD first');
 assert.equal(app.dashboard.accepts('чего не хватает в GDD'),true);assert.equal(app.dashboard.accepts('опиши систему лиг в GDD'),false);
 console.log('GDD: routing and near-misses, offer, not added, where the GDD is (found, asked, remembered), drafts from chat/meetings/Jira/configs with every number cited or «уточнить» (rules and model), apply once into Markdown / Confluence section / Google Docs batchUpdate with version guards, configs-only update, gaps passed');
})().catch(e=>{console.error(e);process.exit(1);});
