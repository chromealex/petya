// «Архитектурные решения»: routing incl. near-misses (equations, a meeting's decisions, «прими решение», finance),
// not added, no project folder, the draft from the user's words + chat + meeting summaries + the semantic index
// (by rules and by the model), the exact file written only through `save` (never overwriting, number taken by
// another file refused, path fixed by the draft), search and list over a fixture repository's docs/adr, the
// contradiction check (model verdicts count only with a verbatim quote), and the Confluence page from the card
// button over stubbed Confluence REST v2. No network, no real model.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/adr/feature.cjs');
const adr=require('../src/extensions/adr/adr.cjs');
const offer=require('../src/extensions/adr/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
const ADRS={
 '0001-setevoy-protokol-udp.md':'# 1. Сетевой протокол: UDP\n\nДата: 2026-03-02\nСтатус: Принято\n\n## Контекст\n\nМатч синхронизируется 30 раз в секунду, задержка важнее доставки каждого пакета.\n\n## Решение\n\nДля синхронизации матча используем UDP с собственной надёжной доставкой важных сообщений. TCP для игрового трафика не используем.\n\n## Последствия\n\n- Нужен свой слой подтверждений.\n',
 '0002-hranenie-sohraneniy.md':'# 2. Хранение сохранений\n\n- Status: Accepted\n- Date: 2026-05-10\n\n## Context and Problem Statement\n\nSaves must survive reinstall.\n\n## Decision Outcome\n\nСохранения храним в облаке Firebase, локально — только кэш.\n',
 '0003-resursy-v-resources.md':'# 3. Ресурсы в папке Resources\n\nДата: 2025-12-01\nСтатус: Заменено решением 0005\n\n## Решение\n\nВсе ресурсы уровня грузим из Resources.\n'
};
function fixture(over={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-adr-'));
 const repo=path.join(root,'game');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});
 if(!over.empty){fs.mkdirSync(path.join(repo,'docs','adr'),{recursive:true});for(const [n,t] of Object.entries(ADRS))fs.writeFileSync(path.join(repo,'docs','adr',n),t);}
 const calls=[];
 const settings={extension_adr:'true',model:over.model?'qwen3:8b':'',ollamaUrl:'http://127.0.0.1:11434/api/chat',...over.settings};
 const request=async(address,options={})=>{calls.push({address,body:JSON.parse(options.body||'null')});const answer=over.model.shift?over.model.shift():over.model;return {message:{content:JSON.stringify(answer)}};};
 const topic={id:'t1',title:'Загрузка уровней',projectId:'p1',messages:[
  {role:'user',text:'Уровни грузятся по 20 секунд из Resources, память на телефонах кончается.'},
  {role:'assistant',text:'Можно перейти на Addressables или оставить Resources и резать уровни на части.'},
  {role:'user',text:'Как дела у Маши?'},...over.messages||[]]};
 const state={topics:[topic],projects:[{id:'general',name:'Общий'},{id:'p1',name:'Game',folders:over.noFolder?[]:[repo]}],activeProjectId:'p1'};
 const memory=[{id:'summary:m1',kind:'summary',title:'Сводка встречи · 5 нояб., 12:00',at:Date.parse('2026-11-05T12:30:00Z'),summary:{discussed:['Долгая загрузка уровней на Android'],decisions:['Переходим на Addressables в следующем спринте'],tasks:[],notDiscussed:[]}}];
 const indexCalls=[];
 const s={settings,request,dataRoot:root,requestProgress:{report(){}},memory:{prune:()=>memory},
  semanticIndex:over.index===false?undefined:{async search(cols,query,opt){indexCalls.push({cols,query,opt});
   if(cols==='files')return /облак|хранени/.test(query)?{hits:[{collection:'files',id:'x',score:0.6,text:'Сохранения храним в облаке Firebase',meta:{path:path.join(repo,'docs/adr/0002-hranenie-sohraneniy.md')}}]}:{hits:[]};
   return {hits:[{collection:'files',id:'f1',score:0.71,text:'LevelLoader.Load() тянет весь уровень из Resources синхронно',meta:{path:'Assets/Scripts/LevelLoader.cs'}},{collection:'chats',id:'c',score:0.2,text:'низкий балл',meta:{title:'x'}}]};}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state}};
 return {s,root,repo,topic,calls,indexCalls,settings};
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'запиши решение: переходим на Addressables':'record','Петя, запиши решение: переходим на Addressables.':'record','зафиксируй решение — UDP для сети':'record','оформи ADR про переход на Addressables':'record',
  'напиши ADR о хранении сохранений':'record','оформи архитектурное решение про кэш':'record','какие решения принимали про сеть':'search','какие решения принимали про сеть?':'search','какие архитектурные решения у нас есть по сохранениям':'search',
  'найди ADR про сеть':'search','покажи ADR':'list','список архитектурных решений':'list','противоречит ли это решению про сеть':'check','противоречит ли переход на TCP принятым решениям?':'check','противоречит ли это ADR 1':'check',
  'противоречит ли решениям: будем грузить всё из Resources':'check'};
 for(const [p,k] of Object.entries(own))assert.equal(app.kind(p)?.kind,k,p);
 for(const p of ['запиши решение уравнения','реши уравнение x+2=5','какие решения приняли на встрече','какие решения принимали по итогам встречи','прими решение за меня','помоги решить задачу','противоречит ли это закону',
  'курс ADR Яндекса','запиши встречу','что решили на встрече','какое решение лучше','/adr запиши решение: x',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.deepEqual(app.kind('противоречит ли это решению про сеть'),{kind:'check',subject:'',target:'сеть'});
 assert.deepEqual(app.kind('противоречит ли решениям: будем грузить всё из Resources'),{kind:'check',subject:'будем грузить всё из Resources',target:''});
 assert.equal(adr.slug('Переход на Addressables'),'perehod-na-addressables');
 assert.equal(adr.slug('Очень длинное название решения про переход всей загрузки уровней на новую систему ассетов'),'ochen-dlinnoe-nazvanie-resheniya-pro-perehod-vsey-zagruzki');
 const parsed=adr.list(fixture().repo);
 assert.deepEqual(parsed.map(r=>[r.number,r.title,r.status,r.date]),[[1,'Сетевой протокол: UDP','accepted','2026-03-02'],[2,'Хранение сохранений','accepted','2026-05-10'],[3,'Ресурсы в папке Resources','superseded','2025-12-01']]);
 assert.match(parsed[1].sections.decision,/Firebase/);

 // --- Not added / no folder ----------------------------------------------------------------------------------------
 let f=fixture({settings:{extension_adr:'false'}});
 assert.equal(await app.turn(f.s,'запиши решение: переходим на Addressables'),null);
 f=fixture({noFolder:true});
 const q=await app.turn(f.s,'оформи ADR про переход на Addressables',{now:NOW});
 assert.equal(q.question,true);assert.match(q.text,/Привяжите к чату папку проекта/);

 // --- Draft by rules: nothing is written until «Сохранить» -------------------------------------------------------------
 f=fixture();
 const r=await app.turn(f.s,'оформи ADR про переход на Addressables',{now:NOW});
 const c=r.extensionData.adrCard;
 assert.equal(c.mode,'draft');assert.equal(c.path,'docs/adr/0004-perehod-na-addressables.md');assert.equal(c.number,4);
 assert.equal(c.folder.path,f.repo);
 assert.ok(!fs.existsSync(path.join(f.repo,c.path)),'the draft writes nothing');
 assert.match(c.text,/^# 0004\. Переход на Addressables\n\n- Дата: 2026-11-09\n- Статус: Принято\n\n## Контекст\n/);
 assert.match(c.text,/## Решение\n\nПереходим на Addressables в следующем спринте\./,'the meeting decision is the decision');
 assert.match(c.text,/## Альтернативы\n\n- Можно перейти на Addressables или оставить Resources и резать уровни на части\./);
 assert.deepEqual(c.sources.map(x=>x.kind),['chat','meeting','index']);
 assert.ok(!c.sources.some(x=>/Маши/.test(x.text)),'unrelated chat lines are not sources');
 assert.match(c.text,/## Источники\n\n- Чат «Загрузка уровней»/);
 assert.deepEqual(f.indexCalls[0].cols,['chats','meetings','files']);
 assert.ok(c.sources.some(x=>/LevelLoader/.test(x.text)));assert.ok(!c.sources.some(x=>/низкий балл/.test(x.text)),'weak index hits are dropped');
 assert.deepEqual(c.related.map(x=>x.number),[3],'the superseded Resources decision is similar');
 assert.match(r.text,/^Черновик 0004 «Переход на Addressables» — docs\/adr\/0004-perehod-na-addressables\.md/);assert.match(r.text,/только после «Сохранить в проект»/);
 assert.equal(f.calls.length,0,'no model without a model');

 // --- Save: the exact text, to the fixed path, never overwriting ----------------------------------------------------------
 const ipc=app.setup(f.s).ipc;
 const other=(await app.turn(f.s,'запиши решение: кэш уровней храним на диске, не в памяти',{now:NOW})).extensionData.adrCard;
 assert.equal(other.path,'docs/adr/0004-kesh-urovney-hranim-na-diske.md','the same next number until one is saved');
 assert.deepEqual(ipc.state(c.draftId),{state:'draft',confluenceUrl:''});
 const edited=c.text.replace('## Последствия\n\n- —','## Последствия\n\n- Загрузка уровня асинхронная');
 const saved=ipc.save(c.draftId,edited);
 assert.deepEqual(saved,{ok:true,path:c.path,text:'Сохранено: '+c.path});
 assert.equal(fs.readFileSync(path.join(f.repo,c.path),'utf8'),edited,'exactly the text of the card');
 assert.equal(ipc.save(c.draftId,'другой текст').text,'Уже сохранено: '+c.path);
 assert.equal(fs.readFileSync(path.join(f.repo,c.path),'utf8'),edited,'never overwritten');
 assert.equal(ipc.state(c.draftId).state,'saved');
 assert.throws(()=>ipc.save(other.draftId,other.text),/Номер 0004 уже занят: docs\/adr\/0004-perehod-na-addressables\.md/);
 assert.ok(!fs.existsSync(path.join(f.repo,other.path)));
 assert.throws(()=>ipc.save('../../etc/passwd','x'),/Некорректный черновик/);
 assert.throws(()=>ipc.save('00000000-0000-0000-0000-000000000000','x'),/устарел/);
 assert.throws(()=>ipc.save(other.draftId,'   '),/Пустой/);
 // The next draft takes the next number; a folder without docs/adr gets it created on save.
 assert.equal((await app.turn(f.s,'запиши решение: кэш уровней храним на диске',{now:NOW})).extensionData.adrCard.number,5);
 const empty=fixture({empty:true});
 const ec=(await app.turn(empty.s,'запиши решение: используем UDP для синхронизации матча',{now:NOW})).extensionData.adrCard;
 assert.equal(ec.path,'docs/adr/0001-ispolzuem-udp-dlya-sinhronizatsii-matcha.md');
 app.setup(empty.s).ipc.save(ec.draftId,ec.text);
 assert.ok(fs.existsSync(path.join(empty.repo,ec.path)));

 // --- Draft by the model -------------------------------------------------------------------------------------------------
 const m=fixture({model:{title:'ADR 7: Addressables для уровней',context:'Уровни грузятся 20 секунд, память кончается.',decision:'Грузим уровни через Addressables.',alternatives:['Оставить Resources и резать уровни — не решает память'],consequences:['Быстрее загрузка','Нужна сборка бандлов в CI']}});
 const mc=(await app.turn(m.s,'оформи ADR про переход на Addressables',{now:NOW})).extensionData.adrCard;
 assert.equal(mc.by,'model');assert.equal(mc.title,'Addressables для уровней');assert.equal(mc.path,'docs/adr/0004-addressables-dlya-urovney.md');
 assert.match(mc.text,/## Последствия\n\n- Быстрее загрузка\n- Нужна сборка бандлов в CI/);
 const sent=m.calls[0].body.messages[1].content;assert.match(sent,/LevelLoader/);assert.match(sent,/Addressables в следующем спринте/);
 // A model answer without a decision is ignored.
 const weak=fixture({model:{title:'X',context:'',decision:'',alternatives:[],consequences:[]}});
 assert.equal((await app.turn(weak.s,'запиши решение: переходим на Addressables',{now:NOW})).extensionData.adrCard.by,'rules');

 // --- Search and list -------------------------------------------------------------------------------------------------------
 f=fixture();
 const sr=await app.turn(f.s,'какие решения принимали про сеть');
 const sc=sr.extensionData.adrCard;
 assert.deepEqual(sc.found.map(x=>x.number),[1]);assert.match(sc.found[0].excerpt,/UDP/);assert.equal(sc.all.length,3);
 assert.match(sr.text,/^Про «сеть» — 1 решение: 0001 «Сетевой протокол: UDP»\.$/);
 const saves=(await app.turn(f.s,'какие решения принимали про хранение сохранений')).extensionData.adrCard;
 assert.equal(saves.found[0].number,2);
 const byMeaning=(await app.turn(f.s,'какие решения принимали про облако')).extensionData.adrCard;
 assert.deepEqual(byMeaning.found.map(x=>[x.number,x.byMeaning]),[[2,false]],'found by words and not repeated from the index');
 const list=await app.turn(f.s,'покажи ADR');
 assert.deepEqual(list.extensionData.adrCard.found.map(x=>x.number),[3,2,1]);assert.match(list.text,/^Решений в docs\/adr: 3\./);
 assert.match((await app.turn(fixture({empty:true}).s,'какие решения принимали про сеть')).text,/ещё нет решений/);

 // --- Contradiction check ---------------------------------------------------------------------------------------------------
 f=fixture({messages:[{role:'user',text:'Давай перейдём на TCP для синхронизации матча, так проще.'}]});
 const ck=await app.turn(f.s,'противоречит ли это решению про сеть');
 const cc=ck.extensionData.adrCard;
 assert.equal(cc.subject,'Давай перейдём на TCP для синхронизации матча, так проще.','«это» is the previous message');
 assert.equal(cc.verdict,'unclear');assert.equal(cc.items[0].number,1);assert.equal(cc.items[0].verified,false);
 assert.match(ck.text,/^Сравните сами: без локальной модели не берусь судить\. Связанные решения: 0001/);
 let none;try{await app.turn(fixture().s,'противоречит ли это решению про сеть',{});}catch(e){none=e;}
 assert.ok(!none,'the previous user message is used when there is one');
 const lonely=fixture();lonely.topic.messages=[];
 let askFor;try{await app.turn(lonely.s,'противоречит ли это решению про сеть');}catch(e){askFor=e;}
 assert.ok(askFor instanceof InputRequired);assert.match(askFor.spec.text,/С чем сравнить/);
 const answered=await askFor.resume('перейдём на TCP для синхронизации');
 assert.equal(answered.extensionData.adrCard.items[0].number,1);
 // With the model: a verbatim quote makes the verdict; an invented one does not.
 const mk=fixture({model:{items:[{number:1,verdict:'contradicts',quote:'TCP для игрового трафика не используем',explanation:'Решение 0001 запрещает TCP для матча.'}]}});
 const mcard=(await app.turn(mk.s,'противоречит ли переход на TCP для синхронизации матча решению про сеть')).extensionData.adrCard;
 assert.equal(mcard.subject,'переход на TCP для синхронизации матча');
 assert.equal(mcard.verdict,'contradicts');assert.equal(mcard.items[0].verified,true);assert.equal(mcard.items[0].quote,'TCP для игрового трафика не используем');
 const made=fixture({model:{items:[{number:1,verdict:'contradicts',quote:'TCP строго запрещён везде',explanation:'…'}]}});
 const madeCard=(await app.turn(made.s,'противоречит ли переход на TCP решению про сеть')).extensionData.adrCard;
 assert.equal(madeCard.verdict,'unclear');assert.equal(madeCard.items[0].verified,false);
 // A superseded decision is never the reason for «противоречит».
 const old=fixture({model:{items:[{number:3,verdict:'contradicts',quote:'Все ресурсы уровня грузим из Resources',explanation:'…'}]}});
 assert.notEqual((await app.turn(old.s,'противоречит ли переход на Addressables решению 3')).extensionData.adrCard.verdict,'contradicts');

 // --- Confluence from the card button ---------------------------------------------------------------------------------------
 f=fixture({settings:{module_confluence:'true',jiraUrl:'https://studio.atlassian.net',jiraEmail:'lead@studio.com',jiraToken:'jira-token',confluenceSpace:'ARCH'}});
 const posted=[];
 f.s.workspace={async api(route,options={},settings){posted.push({route,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,space:settings.confluenceSpace});
  if(route.startsWith('/wiki/api/v2/spaces?'))return {results:[{id:'98765',key:'ARCH'}]};
  if(route==='/wiki/api/v2/pages')return {id:'111',_links:{webui:'/spaces/ARCH/pages/111/0004'}};
  throw Error('unexpected '+route);}};
 const dc=(await app.turn(f.s,'оформи ADR про переход на Addressables',{now:NOW})).extensionData.adrCard;
 assert.equal(dc.confluence,'ARCH');
 assert.equal(posted.length,0,'nothing is posted by the draft');
 const page=await app.setup(f.s).ipc.confluence(dc.draftId,dc.text);
 assert.equal(page.url,'https://studio.atlassian.net/wiki/spaces/ARCH/pages/111/0004');
 assert.equal(posted[0].route,'/wiki/api/v2/spaces?keys=ARCH&limit=1');
 assert.equal(posted[1].method,'POST');assert.equal(posted[1].body.spaceId,'98765');assert.equal(posted[1].body.title,'0004. Переход на Addressables');
 assert.equal(posted[1].body.body.representation,'storage');assert.match(posted[1].body.body.value,/^<ul><li>Дата: 2026-11-09<\/li><li>Статус: Принято<\/li><\/ul><h2>Контекст<\/h2>/);assert.ok(!/<h1>/.test(posted[1].body.body.value));
 assert.equal((await app.setup(f.s).ipc.confluence(dc.draftId,dc.text)).text,'Страница уже создана','one page per draft');
 assert.equal(posted.length,2);
 assert.equal(fixture().s.settings.confluenceSpace,undefined);
 assert.equal((await app.turn(fixture().s,'оформи ADR про кэш',{now:NOW})).extensionData.adrCard.confluence,'','no Confluence button without a space');
 assert.ok(app.storage('# 1. T\n\n<script>x</script>').includes('&lt;script&gt;'));

 // --- Offer -----------------------------------------------------------------------------------------------------------------
 assert.equal(offer.ready({extension_adr:'true'}),true);assert.equal(offer.ready({}),false);
 console.log('ADR: routing and near-misses, drafts from chat/meetings/index (rules and model), exact-file save without overwrite, search and list, verbatim-checked contradiction, Confluence page passed');
})().catch(e=>{console.error(e);process.exit(1);});
