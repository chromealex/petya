const assert=require('node:assert/strict');const feature=require('../src/features/team-intent.cjs');
(async()=>{
 // the model decides; the feature only routes. Unrelated messages never ask the model.
 let asked=[],answer='fill';const calls=[];
 const s={settings:{model:'m',ollamaUrl:'http://127.0.0.1:11434',teamMembers:JSON.stringify([{name:'Полина'}])},core:{localEndpoint:u=>u},requestProgress:{report(){}},attachments:{list:()=>[]},dialogue:{active:()=>null},
  request:async(_u,o)=>{asked.push(JSON.parse(JSON.parse(o.body).messages[1].content).request);return {message:{content:JSON.stringify({intent:answer,confidence:.9})}};},
  teamFill:{turn:async(text,a,b,c,opts)=>{calls.push([text,opts]);return {handled:true,text:'ok'};}}};
 const {teamIntent}=feature.setup(s);
 for(const [q,intent,existing] of [['Можешь команде добавить роли?','existing',true],['Подтяни почты коллег','existing',true],['Найди, кто у нас в команде, и запиши','fill',false],['Полина теперь отвечает за релизы','facts',false]]){
  answer=intent;calls.length=0;const r=await teamIntent.turn(q);assert.equal(r.text,'ok',q);assert.equal(calls[0][1].force,true);assert.equal(!!calls[0][1].existing,existing,q);}
 answer='workload';calls.length=0;assert.equal(await teamIntent.turn('Что делает команда на этой неделе?'),null);assert.equal(calls.length,0,'workload stays with the Jira reports');
 asked.length=0;for(const q of ['Как сварить гречку?','Какая погода в Москве?','Напиши команду git для отката коммита'])assert.equal(await teamIntent.turn(q),null,q);assert.equal(asked.length,0,'no model call for messages not about the team');
 // A question about one named colleague is answered from the card and their Jira issues.
 {const people=[];s.teamLoad={person:async(m,text)=>{people.push([m.name,text]);return {handled:true,text:'card'};}};s.settings.teamMembers=JSON.stringify([{name:'Анна',aliases:'Аня'},{name:'Полина'}]);
  for(const [q,intent] of [['Чем Аня занимается?','workload'],['над чем работает Полина','workload'],['Кто такая Полина?','other']]){answer=intent;assert.equal((await teamIntent.turn(q))?.text,'card',q);}
  assert.deepEqual(people.map(p=>p[0]),['Анна','Полина','Полина']);
  answer='workload';assert.equal(await teamIntent.turn('Полина и Аня, кто чем занят?'),null,'two colleagues: the team report');
  answer='facts';calls.length=0;await teamIntent.turn('Полина теперь отвечает за релизы');assert.equal(people.length,3,'stated facts are recorded, not answered');
  // A follow-up with a pronoun goes to the one colleague named in the last turns, not to the project's tasks.
  {const real=s.dialogue.active;const chat=messages=>{s.dialogue.active=()=>({id:'t',messages});};const asks=s.request;let modelCalls=0;s.request=async(...a)=>{modelCalls++;return asks(...a);};
   chat([{role:'user',text:'Чем Аня занимается?'},{role:'assistant',text:'Анна — тестировщик. Открыто в Jira: 3.'}]);
   assert.equal((await teamIntent.turn('Какие у неё задачи?'))?.text,'card');assert.deepEqual(people.at(-1),['Анна','Какие у неё задачи?']);
   assert.equal((await teamIntent.turn('а у нее что в работе'))?.text,'card','lower case, no question mark, «нее»');
   assert.equal(modelCalls,0,'resolved from the chat, no model call');
   chat([{role:'user',text:'Как дела у Полины и Ани?'}]);assert.equal(await teamIntent.turn('Какие у неё задачи?'),null,'two colleagues in the last turn: ambiguous');
   chat([{role:'user',text:'Покажи задачи BW'}]);assert.equal(await teamIntent.turn('Какие у него задачи?'),null,'no colleague in the chat');
   chat([{role:'user',text:'Чем Аня занимается?'}]);assert.equal(await teamIntent.turn('Как её зовут полностью?'),null,'not about work');
   s.dialogue.active=real;s.request=asks;}
  // A group by role: the model picks the people from the saved cards; unknown names are dropped.
  const groups=[];s.teamLoad.people=async(g,text)=>{groups.push(g.map(m=>m.name));return {handled:true,text:'group'};};
  s.settings.teamMembers=JSON.stringify([{name:'Иван Петров',role:'бэкенд'},{name:'Олег',role:'бэкенд-разработчик'},{name:'Полина',role:'QA',responsibilities:'тестирование релизов'}]);
  s.request=async(_u,o)=>{asked.push(JSON.parse(JSON.parse(o.body).messages[1].content));return {message:{content:JSON.stringify({intent:'workload',confidence:.9,people:['Иван Петров','Олег','Призрак']})}};};
  asked.length=0;assert.equal((await teamIntent.turn('Чем занят бэк?'))?.text,'group');assert.deepEqual(groups[0],['Иван Петров','Олег']);
  assert.deepEqual(asked[0].savedTeam.map(m=>m.role),['бэкенд','бэкенд-разработчик','QA'],'the model sees the roles');
  s.request=async()=>({message:{content:JSON.stringify({intent:'workload',confidence:.9,people:['Полина']})}});assert.equal((await teamIntent.turn('Что делают тестировщики?'))?.text,'group');
  asked.length=0;s.request=async(_u,o)=>{asked.push(1);return {message:{content:'{}'}};};assert.equal(await teamIntent.turn('Чем занят дизайн?'),null);assert.equal(asked.length,0,'no such role on the cards: no model call');
  delete s.teamLoad;s.settings.teamMembers=JSON.stringify([{name:'Полина'}]);s.request=async(_u,o)=>{asked.push(JSON.parse(JSON.parse(o.body).messages[1].content).request);return {message:{content:JSON.stringify({intent:answer,confidence:.9})}};};}
 answer='fill';s.request=async()=>({message:{content:JSON.stringify({intent:'fill',confidence:.4})}});assert.equal(await teamIntent.turn('Что там с командой?'),null,'low confidence falls back');
 s.settings.model='';assert.equal(await teamIntent.turn('Заполни команду'),null,'no model: the regex routing handles it');
 console.log('Team intent: fill / existing / facts by meaning, workload and other requests stay with the pipeline, no model call off-topic, low confidence and no model fall back passed');
})().catch(e=>{console.error(e);process.exit(1);});
