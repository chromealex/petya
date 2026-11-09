// «Нейминг»: routing and near-misses, wishes (language, length, count), length/charset/translit/pronunciation
// checks, duplicates in a project (localization texts and keys, code identifiers), App Store (stubbed iTunes Search
// API), Google Play through Petya's web search (stubbed) or a note when it is off, .com via RDAP (stubbed),
// verdicts and ordering, model-free checks of given names, «ещё в этом стиле» / «короче» follow-ups.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const checks=require('../src/extensions/naming/checks.cjs');
const project=require('../src/extensions/naming/project.cjs');
const stores=require('../src/extensions/naming/stores.cjs');
const app=require('../src/extensions/naming/feature.cjs');
const offer=require('../src/extensions/naming/offer.cjs');

const json=(v,status=200)=>({ok:status<300,status,json:async()=>v});
(async()=>{
 // --- Routing ---
 const yes={'придумай название для ивента на Хэллоуин':'event','имена для героев-гномов':'hero','как назвать фичу с сундуками':'feature','название игры про бункер':'game',
  'предложи никнеймы для босса-дракона':'hero','как назвать новый режим':'feature','придумай 5 коротких имён для питомцев на английском':'hero','подбери названия для локаций в пустыне':'place'};
 for(const [t,kind] of Object.entries(yes)){const w=app.intent(t);assert.equal(w?.mode,'make',t);assert.equal(w.kind,kind,t);}
 const near=['как назвать переменную','переименуй задачу','назови сумму','как назвать функцию для парсинга','придумай название ветки','придумай название задачи','как называется игра про бункер','какое название у этой игры','как тебя зовут','придумай название таблицы','назови имя победителя'];
 for(const t of near)assert.equal(app.intent(t),null,t);
 assert.deepEqual(app.intent('проверь название «Bunker Wars»'),{mode:'check',names:['Bunker Wars'],kind:'other'});
 assert.deepEqual(app.intent('свободны ли названия: Gnomgard, Stonebeard').names,['Gnomgard','Stonebeard']);
 assert.deepEqual(app.wishes('придумай 5 коротких имён на английском до 8 букв'),{lang:'en',limit:8,oneWord:false,count:5,domain:false});
 assert.equal(app.wishes('придумай название игры и проверь домен').domain,true);

 // --- Checks by code ---
 assert.equal(checks.toLatin('Гномгард'),'Gnomgard');assert.equal(checks.toCyrillic('Thornwick'),'Торнуик');
 assert.equal(checks.compare('Гномгард','Gnomgard'),'exact','across scripts');
 assert.equal(checks.compare('Bunker','Bunker Wars'),'similar');assert.equal(checks.compare('Gnomgard','Gnomgrad'),'similar');assert.equal(checks.compare('Ivy','Ivo'),null,'short names need an exact match');
 const hard=checks.inspect('Тыквенная ночь');assert.equal(hard.length,14);assert.equal(hard.words,2);assert.match(hard.notes[0],/трудны: ы \(латиницей — Tykvennaya noch\)/);
 assert.match(checks.inspect('Thornwick').notes[0],/th прочтут как «т» или «з»/);
 assert.match(checks.inspect('Крхтштрум').notes.at(-1),/стечение согласных/);
 assert.deepEqual(checks.inspect('Gnоmgard').warnings,['смешаны кириллица и латиница — в поиске и сторах это разные буквы'],'a Cyrillic «о» inside a Latin name');
 assert.match(checks.inspect('Very Long Bunker Survival Strategy Game',{kind:'game'}).warnings[0],/длиннее 30 символов/);
 assert.deepEqual(checks.inspect('Гном',{limit:3}).warnings,['длиннее 3 символов']);

 // --- The project: localization texts and keys, code identifiers ---
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-naming-'));
 fs.mkdirSync(path.join(root,'Assets','Localization'),{recursive:true});fs.mkdirSync(path.join(root,'Assets','Scripts'),{recursive:true});fs.mkdirSync(path.join(root,'node_modules','x'),{recursive:true});
 fs.writeFileSync(path.join(root,'Assets','Localization','Localization.csv'),'Key,English,Russian\nevent_pumpkin_night,Pumpkin Night,Тыквенная ночь\nchest_luck,Open the Chest of Luck,Открыть сундук удачи\n');
 fs.writeFileSync(path.join(root,'Assets','Scripts','Heroes.cs'),'public class GnomgardController : MonoBehaviour { int stonebeardHealth; }');
 fs.writeFileSync(path.join(root,'node_modules','x','index.js'),'const Ironfoot=1;');
 const idx=await project.index([root]);
 assert.equal(idx.locFiles,1);assert.equal(idx.codeFiles,1,'node_modules is skipped');
 assert.equal(project.match(idx,'Тыквенная ночь').status,'taken');assert.equal(project.match(idx,'Тыквенная ночь').matches[0].where,'Localization.csv · event_pumpkin_night');
 assert.equal(project.match(idx,'Pumpkin Night').status,'taken','other language and the key');
 assert.equal(project.match(idx,'Сундук удачи').status,'similar');
 assert.equal(project.match(idx,'Gnomgard').status,'similar');assert.equal(project.match(idx,'Gnomgard').matches[0].text,'GnomgardController');
 assert.equal(project.match(idx,'Stonebeard').status,'similar');assert.equal(project.match(idx,'Ironfoot').status,'free');
 assert.equal(project.match(idx,'Гномгард').status,'similar','Cyrillic candidate against a Latin identifier');

 // --- Stores and domain ---
 let calls=[];
 const itunes={'Bunker Wars':[{trackName:'Bunker Wars: WW1 RTS',trackViewUrl:'https://apps.apple.com/app/id1',sellerName:'Hexapod'}],'Bunkerfall':[{trackName:'Bunker Falls',trackViewUrl:'https://apps.apple.com/app/id2',sellerName:'X'}],'Тыквенная ночь':[]};
 const domains={'bunkerwars.com':200,'stonebeard.com':404};
 const fetcher=async(url,o={})=>{calls.push(url);const u=new URL(url);
  if(u.hostname==='itunes.apple.com'){assert.equal(u.pathname,'/search');assert.equal(u.searchParams.get('entity'),'software');return json({resultCount:1,results:itunes[u.searchParams.get('term')]||[]});}
  if(u.hostname==='rdap.org'){const host=u.pathname.split('/').pop();assert.equal(o.redirect,'follow');return {ok:domains[host]===200,status:domains[host]||500,json:async()=>({})};}
  throw Error('unexpected '+url);};
 const war=await stores.appStore('Bunker Wars',{fetcher});assert.equal(war.status,'taken');assert.equal(war.matches[0].seller,'Hexapod');assert.equal(war.country,'US');
 assert.equal((await stores.appStore('Bunkerfall',{fetcher})).status,'similar');
 const ru=await stores.appStore('Тыквенная ночь',{fetcher});assert.equal(ru.status,'free');assert.equal(ru.country,'RU');
 assert.equal((await stores.appStore('X',{fetcher:async()=>json({},503)})).status,'unknown');
 assert.deepEqual(await stores.domain('Bunker Wars',{fetcher}),{domain:'bunkerwars.com',status:'taken'});
 assert.deepEqual(await stores.domain('Stonebeard',{fetcher}),{domain:'stonebeard.com',status:'free'});
 assert.equal((await stores.domain('Гномгард',{fetcher})).status,'unknown');assert.ok(calls.includes('https://rdap.org/domain/gnomgard.com'),'Cyrillic is transliterated');
 assert.match((await stores.googlePlay(['A'],{webSearchEngine:{enabled:()=>false,searchAPI:async()=>{throw Error('no');}}})).skipped,/включите «Поиск в интернете»/);
 const searches=[];
 const web={enabled:()=>true,searchAPI:async q=>{searches.push(q);return [{url:'https://play.google.com/store/apps/details?id=a',title:'Bunker Wars - Apps on Google Play'},{url:'https://example.com/bunker',title:'Bunker Wars review'},{url:'https://play.google.com/store/apps/details?id=b',title:'Stonebeard Mining – Приложения в Google Play'}];}};
 const play=await stores.googlePlay(['Bunker Wars','Stonebeard','Ironfoot'],{webSearchEngine:web});
 assert.equal(searches.length,1,'one search for all names');assert.equal(searches[0],'site:play.google.com/store/apps "Bunker Wars" OR "Stonebeard" OR "Ironfoot"');
 assert.deepEqual(['Bunker Wars','Stonebeard','Ironfoot'].map(n=>play.results[n].status),['taken','similar','free']);

 // --- Chat turns ---
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},webSearchEngine:{enabled:()=>false},
  dialogue:{state:{projects:[{id:'p',folders:[root]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages.at(-1).content);return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}};
 topic.projectId='p';
 const turn=t=>app.turn(s,t,{fetcher,delay:0});
 assert.equal(await turn('придумай название для ивента на Хэллоуин'),null,'not added: the offer handles it');
 assert.equal(offer.ready(s.settings),false);
 s.settings.extension_naming='true';
 for(const t of near)assert.equal(await turn(t),null,t);
 model=[body=>{const u=JSON.parse(body.messages.at(-1).content);assert.equal(u.kind,'ивент');return {candidates:[{name:'Тыквенная ночь',meaning:'праздник тыкв',lang:'ru'},{name:'«Ночь фонарей»',meaning:'фонари из тыкв',lang:'ru'},{name:'Bunkerfall',meaning:'x',lang:'en'},{name:'тыквенная  ночь',meaning:'повтор',lang:'ru'},{name:'',meaning:'',lang:'ru'}]};}];
 calls=[];
 const made=await turn('придумай название для ивента на Хэллоуин');
 const card=made.extensionData.namingCard;
 assert.deepEqual(card.candidates.map(c=>[c.name,c.verdict.status]),[['Ночь фонарей','free'],['Bunkerfall','similar'],['Тыквенная ночь','taken']],'free first; quotes, duplicates and empty names dropped');
 assert.equal(card.candidates[2].verdict.where,'проекте');assert.equal(card.candidates[2].verdict.like,'Тыквенная ночь');
 assert.equal(card.candidates[1].verdict.where,'App Store');assert.equal(card.candidates[1].verdict.like,'Bunker Falls');
 assert.equal(card.checked.project,true);assert.equal(card.checked.locFiles,1);assert.match(card.checked.googlePlayNote,/включите «Поиск в интернете»/);
 assert.equal(card.candidates[0].domain,undefined,'no domain check for an event');
 assert.equal(made.text,'3 варианта: свободно 1, занято 1, похожих 1. Свободны: Ночь фонарей. Google Play не проверен: включите «Поиск в интернете» в «Подключениях».');
 assert.equal(topic.messages.at(-1).by,'Нейминг');
 // A game: the .com domain is checked too; Google Play through web search.
 s.webSearchEngine=web;
 model=[{candidates:[{name:'Bunker Wars',meaning:'войны бункеров',lang:'en'},{name:'Stonebeard',meaning:'каменная борода',lang:'en'}]}];
 const game=await turn('название игры про бункер');
 const g=game.extensionData.namingCard.candidates;
 assert.deepEqual(g.map(c=>[c.name,c.verdict.status,c.domain?.status]),[['Stonebeard','similar','free'],['Bunker Wars','taken','taken']]);
 assert.equal(game.extensionData.namingCard.checked.googlePlay,true);
 // Follow-ups: previous names are excluded, «короче» lowers the length.
 model=[body=>{const u=JSON.parse(body.messages.at(-1).content);assert.deepEqual(u.notThese,['Stonebeard','Bunker Wars']);assert.match(u.request,/исходная просьба: название игры про бункер/);assert.ok(u.maxLength<=10&&u.maxLength>=4);return {candidates:[{name:'Bunkr',meaning:'коротко',lang:'en'},{name:'Bunker Wars',meaning:'повтор',lang:'en'}]};}];
 const shorter=await turn('Придумай названия короче');
 assert.deepEqual(shorter.extensionData.namingCard.candidates.map(c=>c.name),['Bunkr'],'a repeated name is dropped');
 assert.equal(shorter.extensionData.namingCard.request,'название игры про бункер','the style request is kept for further follow-ups');
 model=[body=>{const u=JSON.parse(body.messages.at(-1).content);assert.deepEqual(u.notThese,['Stonebeard','Bunker Wars','Bunkr']);return {candidates:[{name:'Ironfoot',meaning:'железная нога',lang:'en'}]};}];
 assert.deepEqual((await turn('ещё')).extensionData.namingCard.candidates.map(c=>c.name),['Ironfoot'],'a bare «ещё» right after the card continues it');
 topic.messages.push({role:'user',text:'привет'},{role:'assistant',text:'Привет!'});
 assert.equal(await turn('ещё'),null,'…but not after another answer');
 // Model errors and no model: generation explains, checking given names still works.
 model=[{candidates:[]}];
 assert.equal((await turn('имена для героев-гномов')).error,true);
 s.settings.model='';s.webSearchEngine={enabled:()=>false};
 assert.match((await turn('имена для героев-гномов')).text,/выберите локальную модель/);
 const checked=await turn('проверь название «Gnomgard»');
 assert.equal(checked.text,'«Gnomgard» похоже на «GnomgardController» (проекте). Google Play не проверен: включите «Поиск в интернете» в «Подключениях».');
 const free=await turn('свободно ли название «Ironfoot»?');assert.match(free.text,/^«Ironfoot» свободно/);
 // A failure of the project scan or stores is not fatal; an unexpected error is reported under the app's name.
 const broken=await app.turn(s,'проверь название «Ironfoot»',{fetcher:async()=>{throw Error('сеть недоступна');},delay:0});
 assert.equal(broken.extensionData.namingCard.candidates[0].appStore.status,'unknown');assert.equal(broken.extensionData.namingCard.checked.appStore,false);
 s.dialogue.state.projects[0].folders=[];project.clear();
 assert.equal((await turn('проверь название «Ironfoot»')).extensionData.namingCard.checked.project,false);
 console.log('Naming: routing with near-misses, wishes, length/charset/translit/pronunciation, project duplicates, App Store, Google Play via web search, RDAP, verdicts, follow-ups, model-free checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
