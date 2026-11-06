const assert=require('node:assert/strict');
const f=require('../src/features/list-followup.cjs');
(async()=>{
 for(const q of ['Какие из этих задач сделать сначала?','Что из этого списка взять в первую очередь?','Какую из них начать?','Петя, какие из них самые важные?'])assert.ok(f.question(q),q);
 for(const q of ['Какие задачи на мне?','Покажи задачи MW2','Сначала покажи баги','Из этих двух вариантов какой лучше по цене?'.replace('какой лучше по цене','')])assert.ok(!f.question(q),q);
 const list='MW2: найдено 431 задач всех типов, незавершённых — 49.\nMW2-148 — Thumbnail Templates for Youtube (Done)\nMW2-149 — [Promised] Уметь разбирать все типы артефактов (On Hold)\nMW2-150 — Matchmaking changes (Released)\nMW2-152 — Радиус у скиллов (Rejected)\nMW2-156 — Гонки БП 2 итерация (On Hold)\nMW2-160 — Артефакт 10115';
 const rows=f.items(list);assert.equal(rows.length,6);assert.deepEqual(f.open(rows).map(r=>r.key),['MW2-149','MW2-156','MW2-160']);
 // turn: picks only from open items of the last answer, records the answer in this chat
 const topic={id:'t',messages:[{role:'user',text:'Задачи MW2'},{role:'assistant',text:list}]};let sent=null;const remembered=[];
 const s={settings:{model:'m',ollamaUrl:'http://127.0.0.1:11434'},core:{localEndpoint:u=>u+'/api/chat'},requestProgress:{report(){}},
  request:async(_u,o)=>{sent=JSON.parse(JSON.parse(o.body).messages[1].content);return {message:{content:'1. MW2-149 — артефакты: обещано пользователям'}};},
  dialogue:{active:()=>topic,rememberAction:(c,t)=>{remembered.push(c);topic.messages.push({role:'user',text:c},{role:'assistant',text:t});},persist(){}}};
 const {listFollowup}=f.setup(s);
 const r=await listFollowup.turn('Какие из этих задач сделать сначала?');
 assert.ok(r.handled);assert.deepEqual(sent.tasks.map(t=>t.key),['MW2-149','MW2-156','MW2-160']);assert.match(r.text,/MW2-149/);assert.match(r.text,/не учитывал: 3/);assert.equal(r.by,'выбор из списка');
 // filters over the shown list match status groups, not one exact name; the last real list is used
 const mine='Незавершённые назначенные задачи: 4.\nBW-3021 — ANR (Owner Review)\nBW-4243 — Кастом (In Progress)\nBW-4350 — Обрывы боёв (QA Review)\nBW-4382 — Тутор (In Progress)';
 topic.messages=[{role:'assistant',text:mine},{role:'user',text:'?'},{role:'assistant',text:'Задач со статусом «Review»: 0.'}];
 const review=await listFollowup.turn('Какие из них на ревью?');assert.equal(review.by,'фильтр списка');assert.match(review.text,/на ревью — 2/);assert.match(review.text,/BW-3021[\s\S]*BW-4350/);assert.doesNotMatch(review.text,/BW-4243/);
 // «из них» is the latest list: after the review filter there is nothing in progress
 assert.match((await listFollowup.turn('А какие из них в работе?')).text,/«в работе» нет\. Статусы в списке: Owner Review, QA Review/);
 topic.messages=[{role:'assistant',text:mine}];const work=await listFollowup.turn('А какие из них в работе?');assert.match(work.text,/в работе — 2/);assert.match(work.text,/BW-4243[\s\S]*BW-4382/);
 // a filter result is itself a list: the next follow-up narrows it
 const none=await listFollowup.turn('Какие из них на паузе?');assert.match(none.text,/нет\. Статусы в списке: In Progress/);
 assert.equal(f.filterQuestion('Какие из них критичные?'),null,'priority is not in the shown list');assert.equal(f.filterQuestion('Какие задачи на мне?'),null);
 // a truncated list says the answer covers the shown part
 topic.messages=[{role:'assistant',text:list}];const part=await listFollowup.turn('Какие из них на паузе?');assert.match(part.text,/показаны 6 из 431/);
 topic.messages=[{role:'assistant',text:list}];const missing=await listFollowup.turn('А какие из них в работе?');assert.match(missing.text,/«задачи MW2 в работе»/);
 // the chat moved on (a calculation in a new chat): the latest list of the project is used and its chat becomes active
 {const state={activeProjectId:'p',activeId:'calc',topics:[{id:'tasks',projectId:'p',messages:[{role:'assistant',text:mine,at:Date.now()-60000}]},{id:'bugs',projectId:'p',messages:[{role:'assistant',text:'Баги:\nBW-1 — Краш (Open)\nBW-2 — Лаг (To Do)',at:Date.now()-120000}]},{id:'calc',projectId:'p',messages:[{role:'assistant',text:'300'}]}]};
  const s2={...s,dialogue:{state,active:()=>state.topics.find(t=>t.id===state.activeId),rememberAction:(c,t)=>state.topics.find(x=>x.id===state.activeId).messages.push({role:'user',text:c},{role:'assistant',text:t}),persist(){}}};
  const {listFollowup:lf}=f.setup(s2);let x=await lf.turn('Вернёмся к задачам: какие из них на ревью?');assert.equal(x.topicId,'tasks');assert.match(x.text,/на ревью — 2/);
  state.activeId='calc';x=await lf.turn('Вернёмся к багам: какие из них не начаты?');assert.equal(x.topicId,'bugs');assert.match(x.text,/BW-2/);}
 // no list in the chat: the usual pipeline answers
 topic.messages=[{role:'assistant',text:'Привет'}];assert.equal(await listFollowup.turn('Какие из этих задач сделать сначала?'),null);
 console.log('List follow-up: «какие из этих сначала» and status filters («на ревью», «в работе») answer from the latest shown list, closed items skipped, partial lists named, no list → pipeline passed');
})().catch(e=>{console.error(e);process.exit(1);});
// «На кого эти задачи можно перевести?»: colleagues from the team directory with their Jira load, in this chat, nothing reassigned.
(async()=>{
 const list='Незавершённые назначенные задачи: 3.\nBW-4577 — Лиги: подгружать лидерборд пачками (New)\nBW-4580 — Портрет героя в углу сейфов (New)\nBW-4100 — Старое (Done)';
 const topic={id:'mine',messages:[{role:'user',text:'Какие задачи в 19.3 на мне?'},{role:'assistant',text:list}]};let sent=null,jql='';
 const settings={model:'m',ollamaUrl:'x',userName:'Alex',teamMembers:JSON.stringify([{name:'Alex Silaev',role:'Lead'},{name:'Oleg Petrov',role:'Client developer',jiraId:'a2'},{name:'Polina Samarina',role:'Project Manager',jiraId:'a3'}])};
 const s={settings,core:{localEndpoint:u=>u},requestProgress:{report(){}},
  workspace:{settings:()=>({}),api:async(_r,o)=>{jql=JSON.parse(o.body).jql;return {isLast:true,issues:[{fields:{assignee:{accountId:'a2'}}},{fields:{assignee:{accountId:'a2'}}},{fields:{assignee:{accountId:'a3'}}}]};}},
  request:async(_u,o)=>{sent=JSON.parse(JSON.parse(o.body).messages[1].content);return {message:{content:'BW-4577 — Лиги → Oleg Petrov: клиентский разработчик'}};},
  dialogue:{active:()=>topic,rememberAction:(c,t)=>topic.messages.push({role:'user',text:c},{role:'assistant',text:t}),persist(){}}};
 const {listFollowup}=f.setup(s);
 const r=await listFollowup.turn('На кого эти задачи можно перевести?');
 assert.equal(r.by,'кому передать');assert.equal(r.topicId,'mine','answered in this chat');
 assert.deepEqual(sent.tasks.map(t=>t.key),['BW-4577','BW-4580'],'only open tasks of the shown list');
 assert.deepEqual(sent.team.map(p=>p.name),['Oleg Petrov','Polina Samarina'],'the user is not a candidate');
 assert.equal(sent.team[0].openTasks,2);assert.match(jql,/assignee in \("a2","a3"\)/);
 assert.match(r.text,/Oleg Petrov/);assert.match(r.text,/Сам ничего не переназначал/);
 // one named task of the list; an empty team says how to fill it
 const one=await listFollowup.turn('На кого можно переназначить BW-4580?');assert.deepEqual(sent.tasks.map(t=>t.key),['BW-4580']);
 settings.teamMembers='[]';assert.match((await listFollowup.turn('Кому из команды их отдать?')).text,/Заполни команду/);
 // the dialogue keeps a question about the shown list in this chat
 const {aboutShownList}=require('../src/dialogue.cjs');
 assert.ok(aboutShownList('Что общего у этих задач?',{messages:[{role:'assistant',text:list}]}));assert.ok(!aboutShownList('Какие баги открыты?',{messages:[{role:'assistant',text:list}]}));
 console.log('List follow-up: «на кого эти задачи перевести» suggests colleagues with Jira load in the same chat passed');
})().catch(e=>{console.error(e);process.exit(1);});
