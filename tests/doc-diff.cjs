// «Что изменилось в документе» over a fixture git repository with dated commits by two authors and over fake HTTP
// servers (Confluence REST v2 page versions, Drive revisions with export links): routing incl. near-misses (code,
// balance, the Drive, meetings, stale docs), not added, the document found by name («GDD», «спека лиг» → leagues.md)
// or link, a tie asked, nothing found, the period and the previous version, uncommitted edits, sections with word
// diffs and who/when, the summary kept only when grounded in the hunks it cites, Confluence versions and authors,
// Google revisions, a service error.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/doc-diff/feature.cjs');
const diff=require('../src/extensions/doc-diff/diff.cjs');
const offer=require('../src/extensions/doc-diff/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
const people={masha:['Мария Ким','masha@studio.example'],oleg:['Олег Смирнов','oleg@studio.example']};
function git(dir,args,date,who='oleg'){const [n,e]=people[who];execFileSync('git',['-C',dir,...args],{env:{...process.env,GIT_AUTHOR_DATE:date||'',GIT_COMMITTER_DATE:date||'',GIT_AUTHOR_NAME:n,GIT_AUTHOR_EMAIL:e,GIT_COMMITTER_NAME:n,GIT_COMMITTER_EMAIL:e},stdio:'pipe'});}
function write(dir,file,text){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
const GDD1='# GDD «Бункер»\n\n## Лиги\n\nВ сезоне 5 лиг: бронза, серебро, золото, платина, алмаз. Сезон длится 28 дней.\n\n## Экономика\n\nСтартовый баланс — 100 золота.\n\n## Кланы\n\nКлан до 30 игроков.\n';
const GDD2=GDD1.replace('В сезоне 5 лиг: бронза, серебро, золото, платина, алмаз.','В сезоне 6 лиг: бронза, серебро, золото, платина, алмаз, легенда.');
const GDD3=GDD2.replace('Стартовый баланс — 100 золота.','Стартовый баланс — 150 золота и 5 кристаллов.').replace('## Кланы\n\nКлан до 30 игроков.\n','## Магазин\n\nЕжедневные предложения обновляются в 00:00 UTC.\n');
function repo(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-docdiff-'));
 const dir=path.join(root,'game');fs.mkdirSync(dir);
 git(dir,['init','-q','-b','main']);git(dir,['remote','add','origin','git@github.com:studio/game.git']);
 write(dir,'docs/gdd.md',GDD1);
 write(dir,'docs/specs/leagues.md','# Лиги\n\n## Повышение\n\nТоп-10 игроков лиги переходят выше.\n');
 write(dir,'README.md','# Game\n\nСборка через Unity 6.\n');
 git(dir,['add','-A']);git(dir,['commit','-q','-m','Первая версия GDD'],'2026-10-01T10:00:00Z','oleg');
 write(dir,'docs/gdd.md',GDD2);git(dir,['commit','-q','-am','Лиги: легенда'],'2026-11-04T09:00:00Z','masha');
 write(dir,'docs/gdd.md',GDD3);git(dir,['commit','-q','-am','Экономика и магазин'],'2026-11-06T15:30:00Z','oleg');
 write(dir,'docs/specs/leagues.md','# Лиги\n\n## Повышение\n\nТоп-20 игроков лиги переходят выше, последние 5 — ниже.\n');git(dir,['commit','-q','-am','Спека лиг: понижение'],'2026-11-07T12:00:00Z','masha');
 return {root,dir};
}

// A fake HTTP server: routes by method and path; every request is recorded.
async function server(handler){
 const calls=[];
 const srv=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',async()=>{
  const u=new URL(req.url,'http://x');calls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body:body?JSON.parse(body):null,auth:req.headers.authorization||''});
  const out=await handler(req.method,u,body?JSON.parse(body):null);
  if(out===undefined){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"message":"not found"}');return;}
  if(out&&out.status){res.writeHead(out.status,{'Content-Type':'application/json'});res.end(JSON.stringify(out.body||{}));return;}
  if(typeof out==='string'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end(out);return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(out));
 });});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+srv.address().port,calls,close:()=>srv.close()};
}
async function json(url,o={}){const r=await fetch(url,o);if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=await r.text();throw e;}return r.status===204?null:r.json();}

function fixture(over={}){
 const r=over.repo||repo();
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const state={topics:[topic],projects:[{id:'general',name:'Общий'},{id:'p1',name:'Game',folders:over.noRepo?[]:[r.dir]}],activeProjectId:'p1'};
 const model=[];
 const settings={'extension_doc-diff':'true',model:over.model?'qwen3:8b':'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...over.settings};
 const s={settings,dataRoot:r.root,requestProgress:{report(){}},
  request:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:11434')){model.push(JSON.parse(o.body));const a=Array.isArray(over.model)?over.model.shift():over.model;return {message:{content:JSON.stringify(a)}};}return over.request?over.request(url,o):Promise.reject(Error('нет сети'));},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state},...over.services};
 return {s,r,topic,model};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'что поменяли в GDD за неделю':[7,'GDD'],'сравни спеку лиг с прошлой версией':[null,'спеку лиг'],'что изменилось в README за 3 дня':[3,'README'],'какие правки в документе «Экономика» за месяц':[30,'документе «Экономика»'],
  'кто менял спеку матчмейкинга':[null,'спеку матчмейкинга'],'что изменилось в docs/leagues.md':[null,'docs/leagues.md'],'Петя, что поменяли в гдд?':[null,'гдд'],'что поменяли на странице лиг в Confluence за неделю':[7,'странице лиг в Confluence']};
 for(const [p,[d,subject]] of Object.entries(own)){const k=app.kind(p);assert.ok(k,p);assert.equal(k.days,d,p);assert.equal(k.subject,subject,p);}
 for(const p of ['что изменилось в коде','что изменилось в коде за неделю','что поменялось в балансе с прошлой версии','что нового в гугл диске','что изменилось с прошлой встречи','что поменяли в задаче','сравни размер этих двух apk',
  'что изменилось в спринте','проверь свежесть документации','какая документация устарела','обнови документацию','что изменилось в конфигах','сравни баланс с конфигами','что изменилось в репозитории за неделю','что нового в Confluence','/doc-diff что поменяли в GDD',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 // Offer: only document changes.
 const offered=t=>!offer.avoid.some(r=>r.test(t))&&offer.topics.some(r=>r.test(t));
 for(const t of ['что поменяли в GDD за неделю','сравни спеку лиг с прошлой версией','какие правки в документе за месяц','история изменений спеки лиг'])assert.ok(offered(t),t);
 for(const t of ['что изменилось в коде','что поменялось в балансе','какие изменения в задаче','проверь свежесть документации','что нового в гугл диске'])assert.ok(!offered(t),t);
 assert.equal(offer.ready({'extension_doc-diff':'true'}),true);assert.equal(offer.ready({}),false);

 // --- Not added --------------------------------------------------------------------------------------------------
 let f=fixture({settings:{'extension_doc-diff':'false'}});
 assert.equal(await app.turn(f.s,'что поменяли в GDD за неделю',{now:NOW}),null);

 // --- git, a period: base before the week, two commits in it ---------------------------------------------------------
 const shared=repo();
 f=fixture({repo:shared});
 let r=await app.turn(f.s,'что поменяли в GDD за неделю',{now:NOW});
 let c=r.extensionData.docDiffCard;
 assert.equal(c.doc.source,'git');assert.equal(c.doc.path,'docs/gdd.md');assert.equal(c.doc.url,'https://github.com/studio/game/blob/HEAD/docs/gdd.md');
 assert.deepEqual(c.versions.map(v=>[v.author,v.label]),[['Мария Ким','Лиги: легенда'],['Олег Смирнов','Экономика и магазин']]);
 assert.match(c.versions[0].url,/^https:\/\/github\.com\/studio\/game\/commit\/[0-9a-f]{40}$/);
 assert.deepEqual(c.hunks.map(h=>[h.title,h.status,h.by]),[['Лиги','changed',['Мария Ким']],['Экономика','changed',['Олег Смирнов']],['Магазин','added',['Олег Смирнов']],['Кланы','removed',['Олег Смирнов']]]);
 const leagues=c.hunks[0];
 assert.deepEqual(leagues.ops.filter(o=>o.op!=='eq').map(o=>o.op+':'+o.text.trim()),['del:5','ins:6',"ins:, легенда"]);
 assert.equal(leagues.at,'2026-11-04T09:00:00.000Z');
 assert.equal(c.totals.sections,4);assert.ok(c.totals.added>0&&c.totals.removed>0);
 assert.deepEqual(c.summary,{items:[{text:'Изменён раздел «Лиги»',hunks:[1]},{text:'Изменён раздел «Экономика»',hunks:[2]},{text:'Добавлен раздел «Магазин»',hunks:[3]},{text:'Удалён раздел «Кланы»',hunks:[4]}],by:'rules',dropped:0});
 assert.match(r.text,/^«docs\/gdd\.md» за 7 дней: 4 раздела изменено, Мария Ким, Олег Смирнов\. Изменён раздел «Лиги»/);
 assert.equal(f.model.length,0,'no model without a model');
 // A week before anything happened: nothing changed.
 r=await app.turn(f.s,'что поменяли в GDD за 2 дня',{now:new Date('2026-11-03T10:00:00Z')});
 assert.match(r.text,/за 2 дня не менялся/);assert.equal(r.extensionData.docDiffCard.versions.length,0);

 // --- The previous version, found by a Russian name of an English file -------------------------------------------------
 r=await app.turn(f.s,'сравни спеку лиг с прошлой версией',{now:NOW});
 c=r.extensionData.docDiffCard;
 assert.equal(c.doc.path,'docs/specs/leagues.md');assert.equal(c.range.mode,'previous');
 assert.deepEqual(c.versions.map(v=>v.author),['Мария Ким']);
 assert.deepEqual(c.hunks[0].ops.filter(o=>o.op!=='eq').map(o=>o.op+':'+o.text.trim()),['del:10','ins:20',"ins:, последние 5 — ниже"]);
 // Uncommitted edits are the newest version.
 write(shared.dir,'README.md','# Game\n\nСборка через Unity 6.1 и Xcode 16.\n');
 r=await app.turn(f.s,'что изменилось в README',{now:NOW});
 c=r.extensionData.docDiffCard;
 assert.deepEqual(c.versions.map(v=>[v.id,v.local]),[['worktree',true]]);assert.equal(c.hunks[0].title,'Game');
 execFileSync('git',['-C',shared.dir,'checkout','--','README.md']);

 // --- The summary by the model: grounded points stay, invented ones are dropped -------------------------------------------
 f=fixture({repo:shared,model:{items:[{text:'Лиг стало 6 вместо 5: добавлена легенда',hunks:[1]},{text:'Стартовый баланс вырос до 150 золота',hunks:[2]},{text:'Добавлены клановые войны',hunks:[3]},{text:'Лиги теперь длятся 30 дней',hunks:[1]},{text:'Магазин обновляется ежедневно',hunks:[9]}]}});
 c=(await app.turn(f.s,'что поменяли в GDD за неделю',{now:NOW})).extensionData.docDiffCard;
 assert.equal(c.summary.by,'model');
 assert.deepEqual(c.summary.items.map(i=>i.text),['Лиг стало 6 вместо 5: добавлена легенда','Стартовый баланс вырос до 150 золота']);
 assert.equal(c.summary.dropped,3);
 const sent=JSON.parse(f.model[0].messages[1].content);assert.equal(sent.changes[0].added.includes('6'),true);
 // Nothing grounded: the rule summary instead.
 f=fixture({repo:shared,model:{items:[{text:'Переписан весь документ про PvP',hunks:[1]}]}});
 c=(await app.turn(f.s,'что поменяли в GDD за неделю',{now:NOW})).extensionData.docDiffCard;
 assert.equal(c.summary.by,'rules');assert.equal(c.summary.dropped,1);
 // The check itself.
 const hunks=diff.compare(GDD1,GDD3);
 assert.equal(diff.grounded({text:'Сезон теперь 28 дней',hunks:[1]},hunks),false,'28 is not a changed word');
 assert.equal(diff.grounded({text:'Удалён раздел про кланы',hunks:[4]},hunks),true);
 assert.equal(diff.grounded({text:'Удалён раздел про кланы',hunks:[]},hunks),false,'a point must cite a hunk');

 // --- Several documents fit: a question, the answer resumes ---------------------------------------------------------------
 write(shared.dir,'docs/game-design.md','# Game design\n\nВторой документ.\n');git(shared.dir,['add','-A']);git(shared.dir,['commit','-q','-m','Второй GDD'],'2026-11-08T10:00:00Z');
 f=fixture({repo:shared});
 let q;try{await app.turn(f.s,'что поменяли в GDD за неделю',{now:NOW});}catch(e){q=e;}
 assert.ok(q instanceof InputRequired);assert.equal(q.spec.strictChoices,true);
 assert.deepEqual(q.spec.options,['docs/game-design.md · game','docs/gdd.md · game']);
 r=await q.resume('docs/gdd.md · game');assert.equal(r.extensionData.docDiffCard.doc.path,'docs/gdd.md');
 // Nothing found / no project.
 r=await app.turn(fixture({noRepo:true}).s,'что поменяли в спеке телепорта',{now:NOW});
 assert.equal(r.question,true);assert.match(r.text,/Не нашёл документ «спеке телепорта»/);

 // --- Confluence page versions over a fake server ---------------------------------------------------------------------------
 const page=v=>({1:'<h2>Лиги</h2><p>Топ-10 переходят выше.</p>',2:'<h2>Лиги</h2><p>Топ-20 переходят выше.</p>',3:'<h2>Лиги</h2><p>Топ-20 переходят выше.</p><h2>Награды</h2><p>Сундук за сезон.</p>'}[v]);
 const conf=await server(async(method,u,body)=>{
  if(u.pathname==='/wiki/rest/api/content/search')return {results:[{id:'4242',title:'Спека лиг'}]};
  if(u.pathname==='/wiki/api/v2/pages/4242/versions')return {results:[3,2,1].map(n=>({number:n,authorId:n===1?'a-1':'a-2',createdAt:['','2026-09-01T10:00:00Z','2026-11-05T10:00:00Z','2026-11-08T10:00:00Z'][n],message:n===3?'награды':''})),_links:{}};
  if(u.pathname==='/wiki/api/v2/pages/4242'){const v=Number(u.searchParams.get('version')||3);return {id:'4242',title:'Спека лиг',version:{number:3},body:{storage:{value:page(v)}}};}
  if(u.pathname==='/wiki/api/v2/users-bulk'&&method==='POST')return {results:body.accountIds.map(id=>({accountId:id,displayName:id==='a-2'?'Мария Ким':'Олег Смирнов'}))};
 });
 const confSettings={module_confluence:'true',jiraUrl:conf.url,jiraEmail:'lead@studio.example',jiraToken:'jira-test',confluenceSpace:'GAME'};
 f=fixture({noRepo:true,settings:confSettings,services:{workspace:{api:(route,o={},st)=>json(st.jiraUrl+route,{...o,headers:{'Content-Type':'application/json'}})}}});
 r=await app.turn(f.s,'что поменяли на странице лиг в Confluence за неделю',{now:NOW});
 c=r.extensionData.docDiffCard;
 assert.equal(c.doc.source,'confluence');assert.equal(c.doc.title,'Спека лиг');assert.equal(c.doc.url,conf.url+'/wiki/pages/viewpage.action?pageId=4242');
 assert.deepEqual(c.versions.map(v=>[v.id,v.author]),[['v2','Мария Ким'],['v3','Мария Ким']]);
 assert.deepEqual(c.hunks.map(h=>[h.title,h.status]),[['Лиги','changed'],['Награды','added']]);
 assert.ok(conf.calls.some(x=>x.path==='/wiki/api/v2/pages/4242'&&x.query.version==='1'),'the base is the version before the week');
 assert.match(conf.calls.find(x=>x.path==='/wiki/rest/api/content/search').query.cql,/space = "GAME"/);
 // A link to the page skips the search.
 conf.calls.length=0;
 c=(await app.turn(f.s,'сравни страницу '+conf.url+'/wiki/spaces/GAME/pages/4242/Liga с прошлой версией',{now:NOW})).extensionData.docDiffCard;
 assert.deepEqual(c.versions.map(v=>v.id),['v3']);assert.ok(!conf.calls.some(x=>x.path==='/wiki/rest/api/content/search'));
 conf.close();

 // --- Google Docs revisions over a fake server (read-only scope) -----------------------------------------------------------
 const DOC='1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
 const gsrv=await server(async(method,u)=>{
  if(u.pathname==='/drive/v3/files/'+DOC)return {id:DOC,name:'GDD · Бункер',mimeType:'application/vnd.google-apps.document',webViewLink:'https://docs.google.com/document/d/'+DOC+'/edit'};
  if(u.pathname==='/drive/v3/files/'+DOC+'/revisions')return {revisions:[['11','2026-10-01T10:00:00Z'],['12','2026-11-03T10:00:00Z'],['13','2026-11-07T10:00:00Z']].map(([id,at])=>({id,modifiedTime:at,lastModifyingUser:{displayName:id==='13'?'Олег Смирнов':'Мария Ким'},exportLinks:{'text/markdown':'https://docs.google.com/feeds/download/documents/export/Export?id='+DOC+'&revision='+id+'&exportFormat=md'}}))};
  if(u.pathname==='/feeds/download/documents/export/Export'){const rev=u.searchParams.get('revision');return {11:GDD1,12:GDD2,13:GDD3}[rev];}
 });
 const local=url=>String(url).replace(/^https:\/\/(?:www\.googleapis\.com|docs\.google\.com)/,gsrv.url);
 const gmail=JSON.stringify({accounts:[{id:'g1',email:'me@studio.example',tokens:{scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents.readonly'}}]});
 f=fixture({noRepo:true,settings:{'extension_google-drive':'true',gmailCredential:gmail},request:(url,o)=>json(local(url),o),
  services:{mailAccounts:{google:{client:()=>({access:async()=>'acct-read'})}}}});
 const fetchText=async(url,token)=>{const res=await fetch(local(url),{headers:{Authorization:'Bearer '+token}});return res.text();};
 r=await app.turn(f.s,'что поменяли в https://docs.google.com/document/d/'+DOC+'/edit за 4 дня',{now:NOW,fetchText});
 assert.deepEqual(r.extensionData.docDiffCard.versions.map(v=>v.id),['r13'],'a bare link names the document');
 r=await app.turn(f.s,'что поменяли в гугл доке https://docs.google.com/document/d/'+DOC+'/edit за неделю',{now:NOW,fetchText});
 c=r.extensionData.docDiffCard;
 assert.equal(c.doc.source,'google');assert.equal(c.doc.title,'GDD · Бункер');
 assert.deepEqual(c.versions.map(v=>[v.id,v.author]),[['r12','Мария Ким'],['r13','Олег Смирнов']]);
 assert.deepEqual(c.hunks.map(h=>[h.title,h.by.join()]),[['Лиги','Мария Ким'],['Экономика','Олег Смирнов'],['Магазин','Олег Смирнов'],['Кланы','Олег Смирнов']]);
 assert.ok(gsrv.calls.every(x=>x.auth==='Bearer acct-read'),'read token everywhere');
 assert.equal(gsrv.calls.find(x=>/revisions$/.test(x.path)).query.fields,'revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress),exportLinks)');
 // A service error is reported, not thrown.
 f.s.request=async()=>{const e=Error('Сервис вернул HTTP 403');e.status=403;e.detail='insufficientPermissions';throw e;};
 r=await app.turn(f.s,'что поменяли в гугл доке https://docs.google.com/document/d/'+DOC+'/edit за неделю',{now:NOW,fetchText});
 assert.equal(r.error,true);assert.match(r.text,/^Что изменилось в документе · /);
 gsrv.close();

 // --- Dashboard: read-only requests only -------------------------------------------------------------------------------------
 assert.equal(app.dashboard.accepts('что поменяли в GDD за неделю'),true);assert.equal(app.dashboard.accepts('обнови раздел экономики'),false);
 console.log('Doc diff: routing and near-misses, offer, git period / previous / uncommitted with who and when, word diffs, grounded summary (invented points dropped), a tie asked, Confluence versions and Google revisions over fake servers, errors passed');
})().catch(e=>{console.error(e);process.exit(1);});
