// Dashboards: widgets keep their sources and refresh in a sandbox (nothing written to the chat), a chat becomes a
// dashboard, single cards are pinned, «Собери дашборд: …» composes one, shared dashboards are files in .petya/.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const model=require('../src/dashboards.cjs');
const jira=require('../src/extensions/jira/dashboard.cjs');

// --- Model --------------------------------------------------------------------------------------------------------
assert(model.wantsDashboard('Петя, собери дашборд: баги спринта'));assert(model.wantsDashboard('сделай мне дашборд по релизу'));assert(!model.wantsDashboard('что такое дашборд'));
let p=model.phrases('Собери дашборд «Релиз 2.4»: баги спринта, крэши за неделю и отзывы в сторах');
assert.equal(p.title,'Релиз 2.4');assert.deepEqual(p.parts,['баги спринта','крэши за неделю','отзывы в сторах']);
p=model.phrases('собери дашборд по крэши за неделю; мои PR');assert.deepEqual(p.parts,['крэши за неделю','мои PR']);
assert.throws(()=>model.widget({source:{kind:'extension',extension:'Bad id',command:'x'}}),/Источник/);
const snap=model.widget({title:'x',source:{kind:'snapshot'},data:{charts:[1]},every:60});assert.equal(snap.every,0,'snapshots never refresh');
assert.equal(model.widget({size:'huge',source:{kind:'jira',jql:'a'}}).size,'auto','the layout chooses unless a size is set');
const shared=model.shareable(model.dashboard({title:'T',widgets:[snap,{title:'J',source:{kind:'jira',jql:'project = BW'}}]}));
assert.equal(shared.widgets.length,1,'snapshots are not shared');assert(!('data' in shared.widgets[0]));
assert.deepEqual(model.position({x:11,y:2,w:6,h:5}),{x:6,y:2,w:6,h:5},'a widget stays inside the 12 columns');assert.equal(model.position({x:'a'}),null);
assert.deepEqual(model.shareable(model.dashboard({widgets:[{source:{kind:'jira',jql:'a'},pos:{x:0,y:0,w:4,h:6}}]})).widgets[0].pos,{x:0,y:0,w:4,h:6},'the arrangement is shared');
assert.equal(model.slug('Релиз 2.4 — Android'),'reliz-2-4-android');

// --- Jira phrases → JQL -------------------------------------------------------------------------------------------
assert.equal(jira.jqlFor('баги спринта',['BW']),'project IN ("BW") AND issuetype = Bug AND sprint in openSprints() AND statusCategory != Done ORDER BY priority DESC, updated DESC');
assert.match(jira.jqlFor('мои задачи в работе',[]),/assignee = currentUser\(\) AND statusCategory = "In Progress"/);
assert.match(jira.jqlFor('задачи закрытые за неделю',[]),/statusCategory = Done AND resolved >= -7d/);
assert.equal(jira.jqlFor('создай задачу про баг',[]),'','writes are not dashboard widgets');
assert.equal(jira.jqlFor('крэши за неделю',[]),'','not about Jira');
assert.equal(jira.jqlFor('JQL: project = X ORDER BY rank',[]),'project = X ORDER BY rank');

// --- Source hints -------------------------------------------------------------------------------------------------
assert.deepEqual(model.sourceHint('основные метрики проекта (из wombyte)'),{body:'основные метрики проекта',name:'wombyte',paren:true});
assert.equal(model.sourceHint('отзывы в сторах'),null,'a trailing «в X» is a hint only when X is a known source');
assert.deepEqual(model.sourceHint('DAU из wombyte',n=>n==='wombyte'),{body:'DAU',name:'wombyte',paren:false});
assert(model.mentions('графаны','Графана')&&model.mentions('Wombyte','wombyte')&&!model.mentions('графики','Графана'));
assert.deepEqual(require('../src/extensions/grafana/client.cjs').names('https://dashboards.wombyte.net/?orgId=2'),['wombyte'],'the Grafana host gives its name');
assert.deepEqual(model.source({kind:'extension',extension:'metrics',command:'DAU',selected:'grafana'}),{kind:'extension',extension:'metrics',command:'DAU',selected:'grafana'});

// «Собери дашборд: основные метрики проекта (из wombyte), краши и ANR» — the request that found nothing before.
const REQUEST='Собери дашборд: основные метрики проекта (из wombyte), краши и ANR';
const GRAFANA={extension_grafana:'true',grafanaUrl:'https://dashboards.wombyte.net/?orgId=2',grafanaToken:'glsa_test',grafanaMetricMap:JSON.stringify({dau:{d:'kpi',p:1,f:'',t:'DAU',dt:'KPI'}})};
const PLAY={module_googleplay:'true',googlePlayCredential:JSON.stringify({type:'oauth',client:{client_id:'c',client_secret:'x'},refresh_token:'r'})};
// Google's answers for the ANR card: the token, one app, the freshness of the ANR set and two days of rows.
const day=(y,m,d)=>({year:y,month:m,day:d});
async function play(url,options={}){
 url=String(url);
 if(url==='https://oauth2.googleapis.com/token')return {access_token:'a',expires_in:3600};
 if(url.includes('apps:search'))return {apps:[{name:'apps/com.wombyte.game',displayName:'Wombyte Game',packageName:'com.wombyte.game'}]};
 if(url.endsWith('/anrRateMetricSet'))return {freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:day(2026,11,8)}]}};
 if(url.endsWith('/anrRateMetricSet:query')&&options.method==='POST'){const v=n=>({decimalValue:{value:String(n)}});
  return {rows:[{startTime:day(2026,11,6),metrics:[{metric:'anrRate',...v(0.004)},{metric:'userPerceivedAnrRate',...v(0.002)},{metric:'userPerceivedAnrRate7dUserWeighted',...v(0.0021)}]},
   {startTime:day(2026,11,7),metrics:[{metric:'anrRate',...v(0.005)},{metric:'userPerceivedAnrRate',...v(0.003)},{metric:'userPerceivedAnrRate7dUserWeighted',...v(0.0022)}]}]};}
 throw Error('unexpected request '+url);
}
async function sources(root){
 const metrics=require('../src/extensions/metrics/feature.cjs'),registry=require('../src/extensions/metrics/sources.cjs');
 const make=(settings,extra={})=>{
  const topic={id:'c1',title:'Дашборды',projectId:'general',kind:'chat',at:1,messages:[]};
  const dialogue={state:{topics:[topic],projects:[{id:'general',name:'Общее'}],activeProjectId:'general',activeId:'c1'},active(){return topic;},persist(){},
   rememberAction(command,text){topic.messages.push({role:'user',text:command,at:Date.now()},{role:'assistant',text,at:Date.now()});}};
  const s={dialogue,settings,dataRoot:fs.mkdtempSync(path.join(root,'s-')),win:null,modules:{assertEnabled(){},enabled:(st,name)=>st['module_'+name]!=='false'},
   projectShare:{folders:()=>[]},projectMemory:{get:()=>null},request:play,requestProgress:{report(){}},...extra};
  return {s,topic,feature:require('../src/features/dashboards.cjs').setup(s)};
 };
 // Everything added and connected: three widgets — metrics read from the wombyte Grafana, crashes, the ANR card.
 const all={extension_crashes:'true',extension_metrics:'true',extension_storeReviews:'true','extension_store-reviews':'true','extension_ci-builds':'true',...GRAFANA,...PLAY};
 let {s,topic,feature}=make({...all});
 // Metrics are read through the real Grafana source description (its names), with a stubbed fetch.
 const declared=registry.load(),grafana=declared.find(x=>x.id==='grafana');
 assert.deepEqual(registry.create(s,{sources:declared}).names(grafana).slice(-1),['wombyte'],'Grafana is called by its host');
 const dates=Array.from({length:30},(_,i)=>new Date(Date.now()-(30-i)*86400000).toISOString().slice(0,10));
 const fetched=[];
 metrics.useSources(registry.create(s,{sources:declared.map(x=>x.id!=='grafana'?x:{...x,source:{...x.source,retention:undefined,
  fetch:async(sx,q)=>{fetched.push(q);return {series:[{metric:'dau',unit:'users',series:dates.map((date,i)=>({date,value:1000+i}))}]};}}})}));
 try{
  const reply=feature.dashboards.turn(REQUEST);
  assert.match(reply.text,/^Собрал дашборд «Дашборд»: Основные метрики проекта \(из wombyte\), Краши, ANR\. Он в списке/,reply.text);
  const d=feature.dashboards.find(reply.dashboard.id);
  assert.deepEqual(d.widgets.map(w=>w.source),[
   {kind:'extension',extension:'metrics',command:'основные метрики проекта',selected:'grafana'},
   {kind:'extension',extension:'crashes',command:'краши'},
   {kind:'extension',extension:'google-play',command:'ANR'}]);
  const v=await feature.ipc.refresh(d.id);
  assert.match(v.widgets[0].describe,/^Метрики игры · «основные метрики проекта» · Grafana$/);
  assert.equal(v.widgets[0].error,'',v.widgets[0].error);
  assert.deepEqual(v.widgets[0].data.metricsCard.sources.map(b=>b.id),['grafana'],'only the source the hint named');assert.equal(fetched.length,1);
  assert.equal(v.widgets[1].data.crashCard?.totals?.issues>0,true,'crashes refresh through «Крэши»');
  // The ANR widget is the chat's vitals card: the same reader, the same card data.
  const vitals=v.widgets[2].data.playVitals;
  assert.equal(v.widgets[2].error,'',v.widgets[2].error);
  assert.equal(vitals.app,'Wombyte Game');assert.equal(vitals.date,'2026-11-07');assert.equal(vitals.perceived,0.003);assert.deepEqual(vitals.days.map(x=>x.date),['2026-11-06','2026-11-07']);
  assert.match(v.widgets[2].text,/ANR: 0,5%/);
  assert.equal(topic.messages.length,2,'refreshing writes nothing to the chat');
  // «ANR за неделю», «зависания»; the adder offers the ready widgets of the three apps.
  for(const phrase of ['ANR за неделю','зависания'])assert.equal(feature.dashboards.compose('собери дашборд: '+phrase,'general').d.widgets[0]?.source.extension,'google-play',phrase);
  const titles=feature.ipc.catalog('general').map(r=>r.title);
  for(const t of ['Основные метрики','DAU за неделю','Выручка за месяц','ANR за неделю','Крэши за неделю'])assert(titles.includes(t),t+' in the adder: '+titles);
  // «DAU из wombyte», «выручка (из графаны)»: the hint selects the Grafana source; a Grafana dashboard by name is Grafana's.
  const one=phrase=>feature.dashboards.compose('собери дашборд: '+phrase,'general').d.widgets[0]?.source;
  assert.deepEqual(one('DAU из wombyte'),{kind:'extension',extension:'metrics',command:'DAU',selected:'grafana'});
  assert.deepEqual(one('выручка (из графаны)'),{kind:'extension',extension:'metrics',command:'выручка',selected:'grafana'});
  assert.deepEqual(one('дашборд лиг (из wombyte)'),{kind:'extension',extension:'grafana',command:'дашборд лиг из Grafana'});
  assert.equal(one('https://dashboards.wombyte.net/d/kpi/main?orgId=2').extension,'grafana','a pasted dashboard link');
  // Bare nouns: every phrase is implicitly «покажи …».
  assert.deepEqual(one('отзывы'),{kind:'extension',extension:'store-reviews',command:'отзывы'});
  assert.equal(one('сборки').command,'покажи сборки');
  assert.equal(one('краши').command,'краши','the crash word alone is enough for «Крэши»');
  // Not data: nothing matches, and nobody is suggested for it.
  assert.equal(feature.dashboards.compose('собери дашборд: поставь встречу','general').d.widgets.length,0);
  assert.equal(feature.dashboards.advise('поставь встречу'),null);
 }finally{metrics.reset();}
 // Jira's «баги спринта» as a bare noun phrase.
 ({feature}=make({jiraUrl:'https://bw.atlassian.net',jiraEmail:'a@b.c',jiraToken:'t',jiraProjects:'BW'}));
 assert.equal(feature.dashboards.compose('собери дашборд: баги спринта','general').d.widgets[0]?.source.kind,'jira');

 // Nothing added: the reply names the app for each phrase, and the offer card brings them.
 let offered=null;
 ({s,topic,feature}=make({},{extensionOffers:{offers:[],propose(command,ids,text,by){offered={command,ids,text,by};return {handled:true,question:true,text};}}}));
 let reply=feature.dashboards.turn(REQUEST);
 assert.match(reply.text,/^Пока не из чего собрать дашборд: для «основные метрики проекта \(из wombyte\)» добавьте «Метрики игры» и подключите «AppMetrica» или «Grafana»; для «краши» добавьте «Крэши»; для «ANR» подключите «Google Play Console» \(Подключения → «Google Play Console»\)\.$/,reply.text);
 assert(offered.ids.includes('metrics')&&offered.ids.includes('crashes'),'the offer card adds the apps: '+offered.ids);
 assert.equal(offered.command,REQUEST,'accepting the offer repeats the request');
 // Without the offer card: the same text in the chat, no dashboard.
 ({s,topic,feature}=make({}));
 reply=feature.dashboards.turn(REQUEST);assert.match(reply.text,/для «ANR» подключите «Google Play Console»/);assert.equal(reply.dashboard,undefined);
 // Metrics added, the wombyte Grafana known but without a token: «подключите Grafana»; Google Play connected → ANR built.
 ({s,topic,feature}=make({extension_metrics:'true',...GRAFANA,grafanaToken:'',...PLAY}));
 reply=feature.dashboards.turn(REQUEST);
 assert.match(reply.text,/^Собрал дашборд «Дашборд»: ANR\. Для «основные метрики проекта \(из wombyte\)» подключите «Grafana» \(Каталог → «Grafana», затем Настройки → «Grafana»: адрес, токен/,reply.text);
 assert.match(reply.text,/для «краши» добавьте «Крэши»/);
 // The wombyte Grafana connected but no panel mapped to a metric: not a Grafana dashboard search for «основные метрики
 // проекта», but «сопоставьте панели».
 ({s,topic,feature}=make({extension_metrics:'true',...GRAFANA,grafanaMetricMap:'',...PLAY}));
 assert.equal(feature.dashboards.compose('собери дашборд: основные метрики проекта (из wombyte)','general').d.widgets.length,0,'not given to «Grafana» as a dashboard name');
 reply=feature.dashboards.turn(REQUEST);
 assert.match(reply.text,/для «основные метрики проекта \(из wombyte\)» сопоставьте панели Grafana с метриками \(Настройки → «Grafana» → «Сопоставить панели с метриками»\)/i,reply.text);
 // «Метрики игры» not added, the wombyte Grafana connected without mapped panels: add the app and map the panels —
 // not «подключите Grafana».
 ({s,topic,feature}=make({...GRAFANA,grafanaMetricMap:''}));
 assert.match(feature.dashboards.advise('основные метрики проекта (из wombyte)')&&(r=>'для «x» '+[r.add&&'добавьте «'+r.add+'»',r.todo].filter(Boolean).join(' и '))(feature.dashboards.advise('основные метрики проекта (из wombyte)')),/добавьте «Метрики игры» и сопоставьте панели Grafana с метриками/);
 // Several Google Play apps: the ANR card asks which one; the choice is kept with the widget and read at once.
 {const two=async(url,o)=>String(url).includes('apps:search')?{apps:[{name:'apps/com.a.one',displayName:'One',packageName:'com.a.one'},{name:'apps/com.b.two',displayName:'Two',packageName:'com.b.two'}]}:play(url,o);
  ({s,topic,feature}=make({...PLAY},{request:two}));
  const made=feature.ipc.compose('ANR','general');let v=await feature.ipc.refresh(made.dashboard.id);
  assert.match(v.widgets[0].error,/несколько приложений — выберите/);assert.deepEqual(v.widgets[0].choice.options.map(o=>o.id),['apps/com.a.one','apps/com.b.two']);
  feature.ipc.widget(made.dashboard.id,v.widgets[0].id,{selected:'apps/com.b.two',title:'ANR · Two'});
  v=await feature.ipc.refresh(made.dashboard.id);
  assert.equal(v.widgets[0].error,'',v.widgets[0].error);assert.equal(v.widgets[0].choice,null);assert.equal(v.widgets[0].data.playVitals.app,'Two');assert.equal(v.widgets[0].title,'ANR · Two');
  // Crashes too: the card asks which game (or all), and the chosen package is named in the read.
  ({s,topic,feature}=make({...PLAY,extension_crashes:'true'},{request:two}));
  const crashes=require('../src/extensions/crashes/feature.cjs'),real=crashes.crashesTurn;let asked='';
  crashes.crashesTurn=async(sx,text)=>{asked=text;return require('../src/extensions/app-kit.cjs').reply(sx,text,{by:'Крэши',text:'ok',data:{crashCard:{totals:{issues:1}}}});};
  try{const c=feature.ipc.compose('краши','general');let cv=await feature.ipc.refresh(c.dashboard.id);
   assert.match(cv.widgets[0].error,/чьи крэши показывать/);assert.deepEqual(cv.widgets[0].choice.options.map(o=>o.id),['all','apps/com.a.one','apps/com.b.two']);
   feature.ipc.widget(c.dashboard.id,cv.widgets[0].id,{selected:'apps/com.a.one'});cv=await feature.ipc.refresh(c.dashboard.id);
   assert.equal(cv.widgets[0].error,'');assert.match(asked,/com\.a\.one$/,asked);
   feature.ipc.widget(c.dashboard.id,cv.widgets[0].id,{selected:'all'});cv=await feature.ipc.refresh(c.dashboard.id);
   assert.equal(cv.widgets[0].error,'');assert.equal(asked,'краши','«all» reads every app');
  }finally{crashes.crashesTurn=real;}}
 // A phrase nobody knows: Petya asks for a page; without one, the generic hint.
 ({feature}=make({}));
 let unknown;try{feature.dashboards.turn('Собери дашборд: погода на марсе');}catch(e){unknown=e;}
 assert.equal(unknown?.name,'InputRequired');
 assert.match(unknown.resume('Собрать без этого').text,/^Не нашёл источников для: «погода на марсе»\. Подключите приложения/);
}

// --- Feature ------------------------------------------------------------------------------------------------------
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-dash-')),repo=path.join(root,'repo');fs.mkdirSync(repo);
 const crashes=require('../src/extensions/crashes/feature.cjs');const realTurn=crashes.turn,realCrashes=crashes.crashesTurn;let turns=0;
 crashes.turn=async(s,command)=>{turns++;return require('../src/extensions/app-kit.cjs').reply(s,command,{by:'Крэши',text:'Крэшей: '+turns,data:{crashCard:{totals:{issues:turns}}}});};
 crashes.crashesTurn=crashes.turn;// the widget reads the card directly (dashboard.load)
 const topic={id:'t1',title:'Релиз',projectId:'p1',kind:'chat',at:1,messages:[
  {role:'user',text:'Петя, крэши за неделю',at:10},{role:'assistant',text:'Крэшей 3',by:'Крэши',extensionData:{crashCard:{totals:{issues:3}}},at:11},
  {role:'user',text:'привет',at:12},{role:'assistant',text:'Привет!',at:13},
  {role:'user',text:'баги спринта в джире',at:14},{role:'assistant',text:'Нашёл 2',jiraItems:[{key:'BW-1',site:'https://x.atlassian.net'},{key:'BW-2',site:'https://x.atlassian.net'}],at:15},
  {role:'user',text:'нарисуй схему',at:16},{role:'assistant',text:'Схема',extensionData:{layoutProposal:{x:1}},at:17}]};
 let persisted=0,remembered=0;
 const dialogue={state:{topics:[topic],projects:[{id:'general',name:'Общее'},{id:'p1',name:'BW',memoryId:'m1'}],activeProjectId:'p1',activeId:'t1'},
  active(){return this.state.topics.find(t=>t.id===this.state.activeId);},persist(){persisted++;},
  rememberAction(command,text){remembered++;const t=this.active();t.messages.push({role:'user',text:command,at:Date.now()},{role:'assistant',text,at:Date.now()});}};
 const s={dialogue,settings:{extension_crashes:'true',extension_storeReviews:'false'},dataRoot:root,win:null,modules:{assertEnabled(){},enabled(){return false;}},saveSettings(patch){Object.assign(this.settings,patch);},
  projectShare:{folders:id=>id==='p1'?[repo]:[]},projectMemory:{get:()=>null}};
 const feature=require('../src/features/dashboards.cjs').setup(s),ipc=feature.ipc;
 try{
  // A chat becomes a dashboard: cards only, each with its source; plain answers stay out.
  const d=ipc.fromChat('t1');
  assert.deepEqual(d.widgets.map(w=>w.kind),['extension','jira','snapshot']);
  assert.equal(d.widgets[0].title,'Крэши за неделю');assert.equal(d.widgets[2].live,false);
  assert.match(d.widgets[1].describe,/issuetype = Bug AND sprint in openSprints\(\)/,'Jira cards refresh by the request they answered');
  const before=topic.messages.length;remembered=0;
  // Refresh runs the extension in a sandbox: data comes back, the chat gets nothing.
  const fresh=await ipc.refresh(d.id,d.widgets[0].id);
  assert.equal(fresh.widgets[0].data.crashCard.totals.issues,1);assert(fresh.widgets[0].at>0);
  assert.equal(topic.messages.length,before);assert.equal(remembered,0,'nothing is written to the dialogue');
  // Jira is not connected here: the widget shows an error, the dashboard still works.
  const withJira=await ipc.refresh(d.id,d.widgets[1].id);assert.match(withJira.widgets[1].error,/Jira не подключена/);
  // The same chat → the same dashboard; a new card in the chat joins it.
  topic.messages.push({role:'user',text:'новые крэши за неделю',at:20},{role:'assistant',text:'1',extensionData:{crashCard:{}},at:21});
  assert.equal(ipc.peek(d.id).widgets.length,3);
  assert.equal(ipc.get(d.id).widgets.length,3,'a dashboard is not tied to the chat it came from: opening it takes nothing new from the chat');
  assert.equal(ipc.fromChat('t1').id,d.id,'the same chat keeps its dashboard');
  assert.equal(ipc.chatDashboard('t1').id,d.id);
  // Widget settings, order, removal with undo.
  let v=ipc.widget(d.id,d.widgets[0].id,{size:'w',every:60,title:'Крэши'});assert.equal(v.widgets[0].size,'w');assert.equal(v.widgets[0].every,60);
  assert.throws(()=>ipc.widget(d.id,d.widgets[0].id,{every:7}),/интервал/);
  v=ipc.move(d.id,[d.widgets[2].id,d.widgets[0].id]);assert.equal(v.widgets[0].id,d.widgets[2].id);
  const removed=ipc.removeWidget(d.id,d.widgets[2].id);assert.equal(removed.view.widgets.length,2);
  assert.equal(ipc.restoreWidget(d.id,removed.undo.widget,removed.undo.index).widgets.length,3);
  // The person's arrangement is saved as it was placed.
  let laid=ipc.layout(d.id,ipc.peek(d.id).widgets.map((w,i)=>({id:w.id,x:i%2*6,y:Math.floor(i/2)*8,w:6,h:8})));
  assert(laid.widgets.every(w=>w.pos&&w.pos.w===6&&w.pos.h===8));assert.throws(()=>ipc.layout(d.id,'x'),/раскладка/);
  // Pin a single card into another dashboard.
  const pinned=ipc.pin('','t1',1);assert.equal(pinned.live,true);assert.notEqual(pinned.dashboard.id,d.id);
  assert.equal(ipc.pin(pinned.dashboard.id,'t1',1).dashboard.widgets,1,'the same source is not added twice');
  assert.equal(ipc.pin(pinned.dashboard.id,'t1',3).live,false,'a plain answer is pinned as a snapshot');
  // Start screen of the project.
  ipc.start('p1',d.id);assert.equal(ipc.startOf('p1').id,d.id);assert(ipc.list('p1').find(x=>x.id===d.id).start);
  // «Собери дашборд»: phrases → sources; what has no source is named.
  // An app that shows a part is added right away; for what no app shows Petya asks for a page (or builds without it).
  let asked;try{feature.dashboards.turn('Собери дашборд «Релиз»: крэши за неделю, отзывы в сторах, погода на марсе');}catch(e){asked=e;}
  assert.equal(asked?.name,'InputRequired');assert.match(asked.spec.text,/«погода на марсе» в Пете нет приложения/);assert.equal(s.settings['extension_store-reviews'],'true','the reviews app is added');
  const reply=asked.resume('Собрать без этого');
  assert.match(reply.text,/Собрал дашборд «Релиз»: Крэши за неделю, Отзывы в сторах\. Добавил приложение «Отзывы в сторах»\. Не нашёл источника для: «погода на марсе»/);
  assert.equal(topic.messages.at(-1).dashboard.id,reply.dashboard.id);
  assert.equal(feature.dashboards.turn('что умеет дашборд'),null);
  assert.throws(()=>ipc.compose('погода на марсе','p1'),/Не нашёл/);
  // A phrase nothing added can show says what would: an app to add, Google Play to connect.
  const hints=feature.dashboards.turn('Собери дашборд: аномалии, ANR');
  assert.match(hints.text,/Добавил приложение «Аномалии»/);assert.match(hints.text,/Для «ANR» подключите «Google Play Console»/);
  // A page from the answer becomes a web widget read in the chat browser's session; the page opens next to the chat.
  let attended='';s.chatBrowser={attend:async(id,o)=>{attended=o.url;return true;},WEB:'petya-web-search'};
  // An unknown service with no app that knows its data: asked about («погода на марсе» here; «(из wombyte)» is
  // Grafana's host or «Метрики игры» to connect, see sources()).
  let ask2;try{feature.dashboards.turn('Собери дашборд: погода на марсе');}catch(e){ask2=e;}
  assert.equal(ask2?.name,'InputRequired','a phrase no app knows asks for a page');
  const viaWeb=ask2.resume('https://app.wombyte.com/dashboard');const wd=ipc.get(viaWeb.dashboard.id);
  assert.equal(wd.widgets[0].kind,'web');assert.match(wd.widgets[0].describe,/app\.wombyte\.com/);assert.equal(attended,'https://app.wombyte.com/dashboard');
  const web=require('../src/dashboard-web.cjs');
  await assert.rejects(web.load({settings:{}},{url:'https://x.io/d',query:'DAU'},{read:async()=>({url:'https://x.io/login',password:true,text:''})}),/Нужно войти на x\.io/);
  assert.match((await web.load({settings:{}},{url:'https://x.io/d',query:'DAU'},{read:async()=>({url:'https://x.io/d',text:'DAU 12 500\nRetention D1 38%'})})).text,/DAU 12 500/);
  ipc.remove(wd.id);
  // A card control on a widget («Исправить», a status chip) acts on the widget's own data, not on the open chat.
  {const jiraResult=require('../src/extensions/jira/result.cjs'),realPerform=jiraResult.perform;let performed=null;
   jiraResult.perform=async(action,row)=>{performed={action,key:row.item.key};return {handled:true,text:'План',topicId:'plan-1'};};
   try{
    const snap=ipc.pin('','t1',3).dashboard;const sd=ipc.get(snap.id);
    const w=sd.widgets.find(x=>x.kind==='snapshot');
    // The pinned plain answer carries no cards; give the snapshot Jira items as a card source would.
    const raw=s.dialogue.state.dashboards.find(x=>x.id===sd.id).widgets.find(x=>x.id===w.id);raw.data={jiraItems:[{key:'BW-9',summary:'Падает',site:'https://x.atlassian.net',type:'Bug',category:'new'}]};
    const out=await ipc.cardAction(sd.id,w.id,JSON.stringify(['https://x.atlassian.net','BW-9']),'execute');
    assert.deepEqual(performed,{action:'execute',key:'BW-9'});assert.equal(out.topicId,'plan-1');
    await assert.rejects(ipc.cardAction(sd.id,w.id,JSON.stringify(['https://x.atlassian.net','BW-404']),'execute'),/Карточка устарела/);
    ipc.remove(sd.id);
   }finally{jiraResult.perform=realPerform;}}
  // The dashboard's own chat: a topic bound to it; requests there add, remove and rename widgets.
  {const {topicId}=ipc.chat(d.id);const chat=dialogue.state.topics.find(t=>t.id===topicId);assert.equal(chat.dashboardId,d.id);assert.equal(ipc.chat(d.id).topicId,topicId,'one chat per dashboard');
   const was=dialogue.state.activeId;dialogue.state.activeId=topicId;
   const before=ipc.peek(d.id).widgets.length;
   let r=feature.dashboards.turn('добавь новые крэши за неделю');assert.match(r.text,/^Добавил: Новые крэши за неделю/);assert.equal(ipc.peek(d.id).widgets.length,before+1);
   r=feature.dashboards.turn('убери новые крэши');assert.match(r.text,/^Убрал: «Новые крэши за неделю»/);assert.equal(ipc.peek(d.id).widgets.length,before);
   assert.match(feature.dashboards.turn('убери погоду').text,/нет виджета про «погоду»/);
   r=feature.dashboards.turn('переименуй в Релиз 3');assert.equal(ipc.peek(d.id).title,'Релиз 3');assert.equal(chat.title,'Релиз 3');ipc.rename(d.id,'Релиз');
   assert.equal(feature.dashboards.turn('что там с багами?'),null,'other questions go on as usual');
   dialogue.state.activeId=was;}
  // Opening a dashboard no longer pulls new cards from the chat it was made from.
  topic.messages.push({role:'user',text:'ещё крэши',at:30},{role:'assistant',text:'1',extensionData:{crashCard:{}},at:31});
  assert.equal(ipc.get(d.id).widgets.length,ipc.peek(d.id).widgets.length,'no sync with the chat');
  // Share: the definition goes to .petya/dashboards, the snapshot stays personal; the start screen follows.
  const out=ipc.share(d.id,0);
  const file=path.join(repo,'.petya','dashboards','relize.json');
  assert.equal(out.file,path.join('.petya','dashboards',path.basename(out.file)));
  const written=JSON.parse(fs.readFileSync(path.join(repo,out.file),'utf8'));
  assert.equal(written.widgets.length,2);assert(written.widgets.every(w=>w.source.kind!=='snapshot'&&!('data' in w)));assert.equal(out.kept,1);
  const sharedRow=ipc.list('p1').find(x=>x.shared);assert.equal(sharedRow.id,out.id);assert.equal(sharedRow.start,true,'the start screen moves to the shared copy');
  assert.equal(ipc.get(out.id).widgets[0].data?.crashCard?.totals?.issues,1,'cached data moves with it');
  ipc.rename(out.id,'Релиз BW');assert.equal(JSON.parse(fs.readFileSync(path.join(repo,out.file),'utf8')).title,'Релиз BW','edits of a shared dashboard go to its file');
  assert.equal(ipc.copy(out.id).shared,false);
  ipc.remove(out.id);assert(!fs.existsSync(path.join(repo,out.file)));assert.equal(ipc.startOf('p1'),null);
  void file;
  await sources(root);
  console.log('Dashboards: sources, sandboxed refresh, chat → dashboard, pin, compose, start screen, sharing through .petya, bare nouns, source hints, ANR and the missed-phrase advice passed');
 }finally{crashes.turn=realTurn;crashes.crashesTurn=realCrashes;fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
