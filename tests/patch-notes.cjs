// «Патчноуты»: routing and the boundary with the skill library (inline changes go to the skills), near-misses,
// not installed / nothing connected, the version question, changes from Jira + local git + GitHub (merged by key and
// PR number, internal ones by labels / components / commit types), model lines that must cite real changes,
// store limits (Google Play 500 cut by whole lines), the internal changelog, toggles without the model, regeneration
// in another tone, model-free behaviour, and service errors.
const assert=require('node:assert/strict');
const app=require('../src/extensions/patch-notes/feature.cjs');
const sources=require('../src/extensions/patch-notes/sources.cjs');
const notes=require('../src/extensions/patch-notes/notes.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 // --- Routing and the skills boundary ---
 for(const t of ['напиши патчноут к версии 1.5','что нового для стора','чейнджлог между v1.4 и v1.5','анонс обновления для игроков','release notes к версии 2.0','патчноут за спринт 12 на английском и немецком','что нового в версии 1.5 для Google Play'])assert.equal(app.intent(t),true,t);
 for(const t of ['заметки встречи','что нового в Slack','что нового в почте','напиши патчноут для игроков: исправили зависание магазина, добавили ивент на Хэллоуин','Сделай changelog по коммитам: fix login crash; add shop screen; refactor inventory','/release-notes версия 2.0: кланы и новый магазин','что такое патчноут','сделай скилл: как оформлять релиз-ноты','переведи эту фразу','сводка встречи'])assert.equal(app.intent(t),false,t);
 assert.equal(app.destination('что нового для Google Play'),'play');assert.equal(app.destination('анонс обновления для игроков'),'post');assert.equal(app.destination('чейнджлог между v1.4 и v1.5'),'internal');

 // --- Classification ---
 const cfg={patchNotesInternalLabels:sources.DEFAULT_LABELS,patchNotesInternalComponents:'Backend'};
 assert.equal(sources.kind({title:'feat(shop): add bundles'}),'feature');assert.equal(sources.kind({title:'fix: crash on login'}),'fix');assert.equal(sources.kind({title:'perf: faster loading'}),'improvement');
 assert.equal(sources.kind({type:'Bug',title:'Магазин'}),'fix');assert.equal(sources.kind({type:'Story',title:'Кланы'}),'feature');
 assert.equal(sources.internal({title:'chore: bump deps'},cfg),'тип chore');assert.equal(sources.internal({title:'x',labels:['TechDebt']},cfg),'метка TechDebt');assert.equal(sources.internal({title:'x',components:['Backend']},cfg),'компонент Backend');
 assert.equal(sources.cleanTitle('feat(shop): PET-12 Add bundles (#41)'),'Add bundles');
 assert.equal(notes.count('Ёжик 🦔'),6,'characters, not UTF-16 units');

 // --- Not installed / nothing connected ---
 const topic={id:'t',title:'Чат',messages:[]};
 const dialogue={active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic]}};
 const settings={model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...cfg,patchNotesLanguages:'ru, en'};
 let model=[],modelCalls=[],github=[],jira=[];
 const s={settings,dialogue,requestProgress:{report(){}},
  async request(url,o={}){
   if(url.startsWith('https://api.github.com/')){github.push(url);return githubAnswer(url);}
   const body=JSON.parse(o.body);modelCalls.push(body);const next=model.shift();assert.ok(next,'unexpected model call');return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};
  }};
 assert.equal(await app.turn(s,'напиши патчноут к версии 1.5'),null,'not added');
 settings['extension_patch-notes']='true';
 const none=await app.turn(s,'напиши патчноут к версии 1.5');
 assert.equal(none.question,true);assert.match(none.text,/подключите Jira/);

 // --- Sources: Jira version, local git between tags, GitHub merged PRs ---
 settings.jiraUrl='https://corp.atlassian.net';settings.jiraEmail='me@corp.ru';settings.jiraToken='x';settings.jiraProjects='GAME';
 settings.githubToken='ghp_x';settings.githubRepos='acme/game';
 const issue=(key,summary,type,{labels=[],components=[],done=true,subtask=false}={})=>({key,fields:{summary,issuetype:{name:type,subtask},labels,components:components.map(name=>({name})),status:{statusCategory:{key:done?'done':'indeterminate'}}}});
 s.workspace={api:async(route,o={})=>{jira.push({route,method:o.method||'GET',body:o.body?JSON.parse(o.body):null});
  if(route==='/rest/api/3/project/GAME/versions')return [{name:'1.4',released:true},{name:'1.5',released:false},{name:'old',archived:true}];
  if(route==='/rest/api/3/search/jql')return {issues:[issue('GAME-12','Кланы: вступление и чат клана','Story'),issue('GAME-15','Игра вылетала при покупке в магазине','Bug'),issue('GAME-16','Быстрее загрузка уровней','Improvement'),issue('GAME-20','Перевести сервер на новый кластер','Task',{components:['Backend']}),issue('GAME-21','Ивент Хэллоуин','Story',{done:false}),issue('GAME-22','Рефакторинг инвентаря','Task',{labels:['techdebt']})],isLast:true};
  throw Error('unexpected jira '+route);}};
 const gitCalls=[];
 s.gitWorkspace={discover:async()=>({selected:'/repo'}),git:async(root,args)=>{gitCalls.push(args);
  if(args[0]==='tag')return 'v1.5.0\nv1.4.2\nv1.4.0\nnightly\n';
  if(args[0]==='log'){assert.equal(args.at(-1),'v1.4.2..v1.5.0');return ['a1b2c3d4\x1fGAME-15 fix purchase crash\x1f2026-11-01T10:00:00Z','b2c3d4e5\x1ffeat: daily login reward (#41)\x1f2026-11-02T10:00:00Z','c3d4e5f6\x1fchore: bump gradle\x1f2026-11-03T10:00:00Z','d4e5f6a7\x1ffix: sound stops after ads\x1f2026-11-04T10:00:00Z'].join('\x1e')+'\x1e';}
  throw Error('unexpected git '+args.join(' '));}};
 const githubAnswer=url=>{
  if(url.includes('/compare/v1.4.2...v1.5.0'))return {merge_base_commit:{commit:{committer:{date:'2026-10-30T00:00:00Z'}}},commits:[{sha:'a1b2c3d4',parents:[{}],commit:{message:'x',committer:{date:'2026-11-04T10:00:00Z'}}}]};
  if(url.includes('/search/issues')){assert.equal(new URL(url).searchParams.get('q'),'repo:acme/game is:pr is:merged merged:2026-10-30T00:00:00+00:00..2026-11-04T10:00:00+00:00');return {items:[{number:41,title:'Daily login reward',labels:[{name:'feature'}],html_url:'https://github.com/acme/game/pull/41'},{number:42,title:'GAME-12 clans chat',labels:[],html_url:'https://github.com/acme/game/pull/42'},{number:43,title:'CI: cache gradle',labels:[{name:'ci'}],html_url:'https://github.com/acme/game/pull/43'}]};}
  throw Error('unexpected github '+url);
 };
 const plainOnly=await app.turn(s,'напиши патчноут к версии 1.5');
 const c0=plainOnly.extensionData.patchNotes;
 assert.deepEqual(c0.items.map(i=>i.id),['jira:GAME-12','jira:GAME-15','jira:GAME-16','jira:GAME-20','jira:GAME-21','jira:GAME-22','pr:#41','pr:#43','commit:c3d4e5f','commit:d4e5f6a'],'commits and PRs naming a Jira key or a PR join it');
 assert.deepEqual(c0.items.find(i=>i.id==='jira:GAME-15').also.map(a=>a.ref),['a1b2c3d']);
 assert.deepEqual(c0.items.find(i=>i.id==='jira:GAME-12').also.map(a=>a.ref),['#42']);
 assert.deepEqual(c0.items.find(i=>i.id==='pr:#41').also.map(a=>a.ref),['b2c3d4e']);
 assert.deepEqual(c0.items.filter(i=>!i.include).map(i=>[i.ref,i.internal||'не готово']),[['GAME-20','компонент Backend'],['GAME-21','не готово'],['GAME-22','метка techdebt'],['#43','метка ci'],['c3d4e5f','тип chore']]);
 assert.ok(jira.every(c=>c.method==='GET'||c.route==='/rest/api/3/search/jql'),'Jira is only read');
 assert.match(jira.find(c=>c.body)?.body.jql,/project in \(GAME\) AND fixVersion = "1\.5"/);
 assert.ok(github.every(u=>!/\/(?:pulls|issues)\/\d+\/(?:comments|reviews)/.test(u)),'GitHub is only read');
 // No model: titles as they are, one language, and it says so.
 assert.equal(modelCalls.length,0);
 assert.deepEqual(c0.languages,['ru']);assert.equal(c0.model,false);
 assert.match(c0.warnings.join(' '),/Без локальной модели/);
 assert.match(c0.texts.ru.appstore.text,/^Новое:\n• Кланы: вступление и чат клана\n• Daily login reward/);
 assert.match(c0.internal.text,/### Внутреннее\n- GAME-20 — Перевести сервер на новый кластер \(компонент Backend\)/);
 assert.match(c0.internal.text,/### Не вошло в патчноут\n- GAME-21 — Ивент Хэллоуин \(не готово\)/);
 assert.match(plainOnly.text,/^Версия 1\.5: 5 изменений для игроков из Jira · версия 1\.5, git · v1\.4\.2\.\.v1\.5\.0, GitHub · acme\/game\./);

 // With a model, per language: lines citing unknown or internal changes are dropped; limits per store.
 settings.model='qwen3:4b';
 const ru={headings:{feature:'Новое',improvement:'Улучшения',fix:'Исправления'},lines:[
  {group:'feature',text:'Кланы: вступайте и общайтесь в чате клана',short:'Кланы и чат клана',sources:['jira:GAME-12']},
  {group:'feature',text:'Награда за ежедневный вход',short:'Награда за вход',sources:['pr:#41']},
  {group:'feature',text:'Новый режим «Королевская битва»',short:'Королевская битва',sources:['jira:GAME-999']},
  {group:'feature',text:'Ивент Хэллоуин',short:'Хэллоуин',sources:['jira:GAME-21']},
  {group:'improvement',text:'Уровни загружаются быстрее',short:'Быстрее загрузка',sources:['jira:GAME-16']},
  {group:'fix',text:'Игра больше не вылетает при покупке в магазине',short:'Нет вылета при покупке',sources:['jira:GAME-15']},
  {group:'fix',text:'Звук больше не пропадает после рекламы',short:'Звук после рекламы',sources:['commit:d4e5f6a']}]};
 const long=s=>'x'.repeat(s);
 const en={headings:{feature:'New',improvement:'Improvements',fix:'Fixes'},lines:[
  {group:'feature',text:'Clans with clan chat',short:'Clans: join a clan, chat with its members and take part in clan events '+long(60),sources:['jira:GAME-12']},
  {group:'feature',text:'Daily login reward',short:'Daily login reward for every day you play '+long(120),sources:['pr:#41']},
  {group:'improvement',text:'Faster level loading',short:'Levels load noticeably faster on all devices '+long(120),sources:['jira:GAME-16']},
  {group:'fix',text:'No more crash on purchase',short:'The game no longer crashes when you buy items in the shop '+long(120),sources:['jira:GAME-15']},
  {group:'fix',text:'Sound after ads',short:'Sound no longer stops after watching an ad '+long(60),sources:['commit:d4e5f6a']}]};
 model=[body=>{assert.match(body.messages[0].content,/Язык ответа: русский \(ru\)\. Тон: весёлый/);const items=JSON.parse(body.messages[1].content).items.map(i=>i.id);assert.deepEqual(items,['jira:GAME-12','jira:GAME-15','jira:GAME-16','pr:#41','commit:d4e5f6a'],'only included changes reach the model');return ru;},en];
 const made=await app.turn(s,'напиши весёлый патчноут к версии 1.5 для Google Play');
 const c=made.extensionData.patchNotes;
 assert.deepEqual(c.languages,['ru','en']);assert.equal(c.tone,'весёлый');assert.equal(c.dest,'play');assert.equal(c.model,true);
 assert.ok(!c.texts.ru.appstore.text.includes('Королевская'),'a line about a change that does not exist is dropped');
 assert.ok(!c.texts.ru.appstore.text.includes('Хэллоуин'),'a line about an unfinished change is dropped');
 assert.equal(c.texts.ru.appstore.text,'Новое:\n• Кланы: вступайте и общайтесь в чате клана\n• Награда за ежедневный вход\n\nУлучшения:\n• Уровни загружаются быстрее\n\nИсправления:\n• Игра больше не вылетает при покупке в магазине\n• Звук больше не пропадает после рекламы');
 assert.equal(c.texts.ru.play.text,'• Кланы и чат клана\n• Награда за вход\n• Быстрее загрузка\n• Нет вылета при покупке\n• Звук после рекламы');
 assert.ok(c.texts.en.play.count<=500,'Google Play limit per language');
 {const many={headings:notes.HEADINGS.en,lines:Array.from({length:9},(_,i)=>({group:i<3?'feature':i<6?'improvement':'fix',text:'Line '+i,short:'Change number '+i+' '+'y'.repeat(60),sources:['s'+i]}))};const cut=notes.format(many,'play');assert.ok(cut.count<=500);assert.equal(cut.dropped,3);assert.ok(cut.text.endsWith('y'),'no line is cut in the middle');assert.ok(!cut.text.includes('Change number 8'),'fixes go first when cutting');}
 assert.ok(c.texts.en.play.rows.every(r=>r.kind!=='line'||r.sources.length),'every line names its sources');
 assert.match(c.texts.ru.post.text,/^\*\*Версия 1\.5\*\*\n\n\*\*Новое\*\*\n- Кланы/);
 assert.ok(c.texts.ru.appstore.count<=4000&&c.texts.ru.post.count<=2000);
 // A model answer that cites nothing real gives no language at all rather than invented text.
 model=[{headings:ru.headings,lines:[{group:'feature',text:'Выдумка',short:'Выдумка',sources:['x']}]}];
 const empty=await app.turn(s,'патчноут к версии 1.5 на русском');
 assert.deepEqual(empty.extensionData.patchNotes.languages,[]);assert.match(empty.extensionData.patchNotes.warnings.join(' '),/русский: модель не дала строк/);

 // --- Card calls: toggles without the model, regeneration in another tone ---
 const ipc=app.setup({...s,dialogue:{...dialogue,state:{topics:[{messages:[{extensionData:{patchNotes:c}}]}]},persist(){}}}).ipc;
 const before=modelCalls.length;
 const off=ipc.compose({id:c.id,chosen:c.chosen.filter(id=>id!=='commit:d4e5f6a')});
 assert.ok(!off.texts.ru.appstore.text.includes('Звук'),'switching a change off removes its line');assert.equal(modelCalls.length,before,'no model for toggles');
 assert.match(off.internal.text,/### Не вошло в патчноут\n(?:- .*\n)*- d4e5f6a — sound stops after ads$/);
 assert.throws(()=>ipc.compose({id:'nope'}),/устарел/);
 model=[body=>{assert.match(body.messages[0].content,/Тон: официальный/);return ru;},en];
 const again=await ipc.regenerate({id:c.id,tone:'официальный',chosen:off.chosen});
 assert.equal(again.tone,'официальный');assert.ok(!again.texts.ru.appstore.text.includes('Звук'),'the switched-off change stays out after regenerating');

 // --- The version question and errors ---
 settings.model='';
 let asked=null;
 await assert.rejects(app.turn(s,'что нового для стора'),e=>{asked=e;return e instanceof InputRequired;});
 assert.deepEqual(asked.spec.options,['версия 1.5','версия 1.4','между v1.4.2 и v1.5.0']);
 const resumed=await asked.resume('версия 1.5');assert.equal(resumed.extensionData.patchNotes.title,'Версия 1.5');
 assert.match((await asked.resume('не знаю')).text,/Не понял версию/);
 const brokenJira={...s,workspace:{api:async()=>{throw Object.assign(Error('HTTP 401'),{status:401});}}};
 const partial=await app.turn(brokenJira,'напиши патчноут к версии 1.5');
 assert.match(partial.extensionData.patchNotes.warnings.join(' '),/Jira: HTTP 401/,'a failing source is reported, the others still count');
 const nothing=await app.turn({...brokenJira,gitWorkspace:{discover:async()=>({})},settings:{...settings,githubToken:''}},'напиши патчноут к версии 1.5');
 assert.equal(nothing.error,true);assert.match(nothing.text,/Изменений для «Версия 1\.5» не нашёл\. Jira: HTTP 401/);

 // --- Offer: own phrases; the skills' inline requests and neighbours are not offered ---
 const all=offers.load();
 const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings:{}}));return d?.one?[d.one.offer.id]:d?d.tie.map(r=>r.offer.id):[];};
 for(const t of ['напиши патчноут к версии 1.5','что нового для стора','чейнджлог между v1.4 и v1.5','анонс обновления для игроков'])assert.deepEqual(pick(t),['patch-notes'],t);
 for(const t of ['заметки встречи','что нового в Slack','напиши патчноут для игроков: исправили зависание магазина, добавили ивент'])assert.ok(!pick(t).includes('patch-notes'),t);
 assert.throws(()=>app.validate({patchNotesLanguages:'ru, klingon'}),/коды/);assert.throws(()=>app.validate({patchNotesTone:'злой'}));
 console.log('Patch notes: routing and skills boundary, Jira/git/GitHub sources merged by key and PR, internal filter, cited lines only, store limits, changelog, toggles, regeneration, model-free, version question, errors passed');
})().catch(e=>{console.error(e);process.exit(1);});
