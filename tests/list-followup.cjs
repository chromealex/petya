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
 // no list in the chat: the usual pipeline answers
 topic.messages=[{role:'assistant',text:'Привет'}];assert.equal(await listFollowup.turn('Какие из этих задач сделать сначала?'),null);
 console.log('List follow-up: «какие из этих сначала» picks from the open items of the shown list, closed ones skipped, no list → pipeline passed');
})().catch(e=>{console.error(e);process.exit(1);});
