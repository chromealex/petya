const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs');
const {JiraInsights}=require('../src/jira-insights.cjs');
const {ProjectMemory}=require('../src/project-memory.cjs');
const {projectCatalogReply}=require('../src/project-catalog.cjs');
let turns=0;
function fixture(){
 const queries=[];let fail=false;
 const jira=new JiraInsights({settings:()=>({module_jira:'true',jiraProjects:'A,B',jiraUrl:'https://fixture.invalid'}),pages:async()=>[{key:'A',name:'Альфа'},{key:'B',name:'Бета'}],api:async(route,options)=>{
  if(fail)throw Error('fixture offline');
  if(route.endsWith('/versions'))return [{id:'1',name:'1.0',released:true,releaseDate:'2025-01-01'},{id:'2',name:'2.0',released:true,releaseDate:'2025-02-01'}];
  if(route.includes('/project/'))return {issueTypes:[{id:'bug',name:'Bug'}]};
  const q=JSON.parse(options.body).jql;queries.push(q);return {isLast:true,issues:[{id:'i',key:q.includes('"A"')?'A-1':'B-1',fields:{summary:'Fixture bug',status:{statusCategory:{key:'new'}}}}]};
 }});
 const d=new Dialogue({answer:async text=>'Обсудим: '+text,readers:{tasks:(command,topic,context)=>jira.read(command,topic,context,'tasks'),bugs:(...a)=>jira.read(...a),anr:async()=>({text:'Нет подключения Google Play',error:true})}});
 return {d,queries,offline:()=>fail=true,turn:async text=>{turns++;return d.turn(text);}};
}
(async()=>{
 for(const choice of ['первый','1','Альфа','в проекте Альфа']){
  const f=fixture();assert((await f.turn('Посмотри баги последней версии')).question);
  const result=await f.turn(choice);assert.equal(result.data.project,'A',choice);assert.equal(result.data.version,'2.0');
  assert.equal((await f.turn('А по предыдущей версии?')).data.version,'1.0');
  assert.equal((await f.turn('А сколько осталось?')).data.open,1);
  const n=f.queries.length;assert.match((await f.turn('А как дела?')).text,/как дела/);assert.equal(f.queries.length,n);
 }
 for(const choice of ['второй','2','Бета','в проекте Бета']){
  const f=fixture();await f.turn('Проверь баги');assert.equal((await f.turn(choice)).data.project,'B');
 }
 for(const change of ['А в проекте Бета?','А по проекту Бета?','Теперь в Бета']){
  const f=fixture();await f.turn('Проверь баги Альфа');assert.equal((await f.turn(change)).data?.project,'B',change);
 }
 {
  const f=fixture();await f.turn('Проверь баги');await f.turn('Как дела?');
  const n=f.queries.length;await f.turn('первый');assert.equal(f.queries.length,n,'Old clarification consumed a later unrelated ordinal');
 }
 for(const cancel of ['отмена','не надо','стоп']){
  const f=fixture();await f.turn('Проверь баги');await f.turn(cancel);assert.equal(f.d.active().pending,undefined,cancel);
  assert.equal(f.queries.length,0);
 }
 {
  const f=fixture();await f.turn('Проверь баги Альфа');const id=f.d.active().id;
  await f.turn('Посмотри ANR');const n=f.queries.length;
  assert.equal((await f.turn('Вернёмся к багам')).topicId,id);assert.equal(f.queries.length,n);
  await f.turn('Обнови');assert.equal(f.queries.length,n+1);
  f.offline();assert.equal((await f.turn('Обнови')).error,true);assert.equal(f.d.busy,false);
 }
 for(const text of ['Не проверяй баги','Не надо смотреть баги','Что такое ANR?','Объясни фразу «проверь баги»','В чём проблема?']){
  const f=fixture();await f.turn('Проверь баги Альфа');const n=f.queries.length;
  assert.match((await f.turn(text)).text,/Обсудим/);assert.equal(f.queries.length,n,text);if(/^Не/iu.test(text))assert.deepEqual(require('../src/service-access.cjs').detect(text,{kind:'bugs'}),[]);
 }
 {
  const f=fixture();await f.turn('Проверь баги');const r=await f.turn('9');assert(r.question,'Invalid option must ask again');assert.equal(f.queries.length,0);assert.equal((await f.turn('второй')).data.project,'B');
 }
 for(const question of ['А таски какие?','А какие задачи?','Покажи задачи','Перечисли задачи в проекте Альфа']){
  const f=fixture();await f.turn('Проверь баги Альфа');
  // Even a misleading model route must not override this explicit subject change.
  f.d.routeTopic=async()=>({kind:'bugs'});
  const r=await f.turn(question);assert.match(r.text,/задач всех типов/);assert.match(r.text,/A-1/);
  assert.equal(r.data.project,'A');assert.equal(r.data.version,'2.0');
  assert(!f.queries.at(-1).includes('issuetype'));assert(f.queries.at(-1).includes('fixVersion'));
  assert.equal((await f.turn('Обнови')).data.field,'fixVersion');
 }
 {
  const f=fixture();const r=await f.turn('Какие задачи?');assert(r.question);
  const chosen=await f.turn('Альфа');assert.match(chosen.text,/задач всех типов/);
  assert(!f.queries.at(-1).includes('Version'),'Unscoped tasks must not silently select latest release');
 }
 for(const phrase of ['Еще раз названия проектов прочитай','Ещё раз прочитай названия проектов','Повтори названия проектов','Озвучь проекты']){
  const r=projectCatalogReply(phrase,{projects:[{id:'a',name:'Bunker Wars'},{id:'b',name:'Mushroom Wars'}]});
  assert(r?.projectCatalog,phrase);assert.match(r.text,/Bunker Wars/);assert.match(r.text,/Mushroom Wars/);assert(!r.text.includes('баг'));
 }
 for(const phrase of ['Создай задачу','Не показывай задачи','Что такое задачи?'])assert.equal(require('../src/dialogue.cjs').taskListRequest(phrase),false);
 let topic={},scope='one';const p=new ProjectMemory({save:()=>{},topic:()=>topic,switchProject:p=>topic=p?{id:p.id,projectMemoryId:p.id}:{},scope:()=>scope,slackAccount:()=>scope,verify:async(kind,value)=>kind==='slack'?{id:value,name:value}:{key:value}});
 for(const name of ['Альфа','Бета']){await p.turn('Работаем над проектом '+name);await p.turn('Запомни канал разработки '+name+'-dev');}
 assert.equal(p.context().projectChannels[0].name,'Бета-dev');
 await p.turn('Выбери проект Альфа');assert.equal(p.context().projectChannels[0].name,'Альфа-dev');
 const catalog=projectCatalogReply('Какие проекты у тебя есть?',{projects:p.state.projects,activeId:p.active().id});assert.match(catalog.text,/Альфа — текущий/);assert.match(catalog.text,/Бета/);
 await p.turn('Работаем над другим проектом');assert.equal((await p.turn('отмена',true)).text,'Отменено.');assert.equal(p.active().name,'Альфа');
 for(const choice of ['второй','2','Бета']){await p.turn('Работаем над другим проектом');await p.turn(choice,true);assert.equal(p.active().name,'Бета',choice);assert.equal(p.state.projects.length,2);}
 await p.turn('Работаем над другим проектом');assert.equal((await p.turn('9',true)).question,true);assert.equal(p.state.projects.length,2);await p.turn('первый',true);assert.equal(p.active().name,'Альфа');
 await p.turn('Запомни репозиторий');scope='two';assert.match((await p.turn('/tmp/repo',true)).text,/устарело/);assert.equal(p.context().projectChannels.length,0);
 console.log(`Dialogue scenarios passed: ${turns} turns plus project memory/catalogue/isolation scenarios`);
})().catch(e=>{console.error(e);process.exitCode=1;});
