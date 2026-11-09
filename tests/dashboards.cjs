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

// --- Feature ------------------------------------------------------------------------------------------------------
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-dash-')),repo=path.join(root,'repo');fs.mkdirSync(repo);
 const crashes=require('../src/extensions/crashes/feature.cjs');const realTurn=crashes.turn;let turns=0;
 crashes.turn=async(s,command)=>{turns++;return require('../src/extensions/app-kit.cjs').reply(s,command,{by:'Крэши',text:'Крэшей: '+turns,data:{crashCard:{totals:{issues:turns}}}});};
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
  assert.equal(ipc.peek(d.id).widgets.length,3,'peek does not sync');
  assert.equal(ipc.get(d.id).widgets.length,4,'opening takes the chat\'s new cards');
  assert.equal(ipc.fromChat('t1').id,d.id,'the same chat keeps its dashboard');
  assert.equal(ipc.chatDashboard('t1').id,d.id);
  // Widget settings, order, removal with undo.
  let v=ipc.widget(d.id,d.widgets[0].id,{size:'w',every:60,title:'Крэши'});assert.equal(v.widgets[0].size,'w');assert.equal(v.widgets[0].every,60);
  assert.throws(()=>ipc.widget(d.id,d.widgets[0].id,{every:7}),/интервал/);
  v=ipc.move(d.id,[d.widgets[2].id,d.widgets[0].id]);assert.equal(v.widgets[0].id,d.widgets[2].id);
  const removed=ipc.removeWidget(d.id,d.widgets[2].id);assert.equal(removed.view.widgets.length,3);
  assert.equal(ipc.restoreWidget(d.id,removed.undo.widget,removed.undo.index).widgets.length,4);
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
  assert.match(reply.text,/Собрал дашборд «Релиз»: Крэши за неделю, Отзывы в сторах\. Добавил приложение «[^»]+»\. Без: «погода на марсе»/);
  assert.equal(topic.messages.at(-1).dashboard.id,reply.dashboard.id);
  assert.equal(feature.dashboards.turn('что умеет дашборд'),null);
  assert.throws(()=>ipc.compose('погода на марсе','p1'),/Не нашёл/);
  // A phrase nothing added can show says what would: an app to add, Google Play to connect.
  const hints=feature.dashboards.turn('Собери дашборд: аномалии, ANR');
  assert.match(hints.text,/Добавил приложение «Аномалии»/);assert.match(hints.text,/«ANR» — подключите Google Play Console/);
  // A page from the answer becomes a web widget read in the chat browser's session; the page opens next to the chat.
  let attended='';s.chatBrowser={attend:async(id,o)=>{attended=o.url;return true;},WEB:'petya-web-search'};
  let ask2;try{feature.dashboards.turn('Собери дашборд: основные метрики проекта (из wombyte)');}catch(e){ask2=e;}
  assert.equal(ask2?.name,'InputRequired','an unknown service is asked about, not given to «Метрики игры»');
  const viaWeb=ask2.resume('https://app.wombyte.com/dashboard');const wd=ipc.get(viaWeb.dashboard.id);
  assert.equal(wd.widgets[0].kind,'web');assert.match(wd.widgets[0].describe,/app\.wombyte\.com/);assert.equal(attended,'https://app.wombyte.com/dashboard');
  const web=require('../src/dashboard-web.cjs');
  await assert.rejects(web.load({settings:{}},{url:'https://x.io/d',query:'DAU'},{read:async()=>({url:'https://x.io/login',password:true,text:''})}),/Нужно войти на x\.io/);
  assert.match((await web.load({settings:{}},{url:'https://x.io/d',query:'DAU'},{read:async()=>({url:'https://x.io/d',text:'DAU 12 500\nRetention D1 38%'})})).text,/DAU 12 500/);
  ipc.remove(wd.id);
  // With Google Play connected ANR is a widget of its own, filled by the Google Play reader.
  s.settings.googlePlayCredential='x';s.googlePlay={read:async()=>({title:'ANR · Game',data:{app:'apps/game',date:{year:2026,month:11,day:8},rate:0.004,perceived:0.003,week:{},rows:[]}})};
  const anr=ipc.get(ipc.compose('ANR','p1').dashboard.id);assert.equal(anr.widgets[0].kind,'anr');
  const filled=await ipc.refresh(anr.id,anr.widgets[0].id);assert.equal(filled.widgets[0].data.playVitals.app,'Game');
  ipc.remove(anr.id);delete s.settings.googlePlayCredential;
  // Share: the definition goes to .petya/dashboards, the snapshot stays personal; the start screen follows.
  const out=ipc.share(d.id,0);
  const file=path.join(repo,'.petya','dashboards','relize.json');
  assert.equal(out.file,path.join('.petya','dashboards',path.basename(out.file)));
  const written=JSON.parse(fs.readFileSync(path.join(repo,out.file),'utf8'));
  assert.equal(written.widgets.length,3);assert(written.widgets.every(w=>w.source.kind!=='snapshot'&&!('data' in w)));assert.equal(out.kept,1);
  const sharedRow=ipc.list('p1').find(x=>x.shared);assert.equal(sharedRow.id,out.id);assert.equal(sharedRow.start,true,'the start screen moves to the shared copy');
  assert.equal(ipc.get(out.id).widgets[0].data?.crashCard?.totals?.issues,1,'cached data moves with it');
  ipc.rename(out.id,'Релиз BW');assert.equal(JSON.parse(fs.readFileSync(path.join(repo,out.file),'utf8')).title,'Релиз BW','edits of a shared dashboard go to its file');
  assert.equal(ipc.copy(out.id).shared,false);
  ipc.remove(out.id);assert(!fs.existsSync(path.join(repo,out.file)));assert.equal(ipc.startOf('p1'),null);
  void file;
  console.log('Dashboards: sources, sandboxed refresh, chat → dashboard, pin, compose, start screen and sharing through .petya passed');
 }finally{crashes.turn=realTurn;fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
