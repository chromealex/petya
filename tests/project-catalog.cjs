const assert=require('node:assert/strict');
const {projectCatalogReply,isProjectCatalogQuestion}=require('../src/project-catalog.cjs');
const {intent,Dialogue}=require('../src/dialogue.cjs');
const {VoiceTurn}=require('../src/ui/voice-turn.js');
(async()=>{
 const state={projects:[{id:'a',name:'Альфа'},{id:'b',name:'Бета'}],activeId:'b',settings:{jiraProjects:'ALPHA,BETA,ALPHA'}};
 for(const q of ['А какие проекты у тебя есть?','Какие у тебя проекты','Какие проекты есть','Покажи список проектов','Перечисли проекты','Петя, какие проекты ты знаешь?']){
  const before=JSON.stringify(state),reply=projectCatalogReply(q,state);assert(reply?.projectCatalog,q);assert.match(reply.text,/Альфа/);assert.match(reply.text,/Бета — текущий/);assert.deepEqual(reply.jiraProjects,['ALPHA','BETA']);assert.equal(JSON.stringify(state),before);
 }
 for(const q of ['Какие проекты с багами?','А какие баги есть в проекте?','Не показывай список проектов','Объясни, что такое список проектов','Какие проекты есть в Jira?'])assert.equal(isProjectCatalogQuestion(q),false,q);
 assert.match(projectCatalogReply('А какие проекты у тебя есть?',{}).text,/пока нет/);
 assert(!projectCatalogReply('Какие проекты есть',{projects:[]}).text.includes('Альфа'));
 for(const kind of ['bugs','anr']){
  assert.equal(intent('А какие проекты у тебя есть?',{kind}),'chat');
  assert.equal(intent('А кто отвечает за сервер?',{kind}),'chat');
  assert.equal(intent('Проверь почту',{kind}),'chat');
  assert.equal(intent('А сколько осталось?',{kind}),kind);
  assert.equal(intent('А по предыдущей версии?',{kind}),kind);
 }
 assert.equal(VoiceTurn.isNewQuestion('А какие проекты у тебя есть'),true);
 let reads=0;const d=new Dialogue({state:{activeId:'old',topics:[{id:'old',kind:'bugs',title:'Баги',at:Date.now(),messages:[]}]},answer:async()=> 'Ответ на новый вопрос',readers:{bugs:async()=>{reads++;return {text:'wrong'};}}});
 assert.equal((await d.turn('А кто отвечает за сервер?')).text,'Ответ на новый вопрос');assert.equal(reads,0);
 console.log('Project catalogue: explicit list, company-scoped saved data, no mutations, empty state, voice question and narrow topic continuation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
