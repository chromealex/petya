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
 // no list in the chat: the usual pipeline answers
 topic.messages=[{role:'assistant',text:'Привет'}];assert.equal(await listFollowup.turn('Какие из этих задач сделать сначала?'),null);
 console.log('List follow-up: «какие из этих сначала» and status filters («на ревью», «в работе») answer from the latest shown list, closed items skipped, partial lists named, no list → pipeline passed');
})().catch(e=>{console.error(e);process.exit(1);});
