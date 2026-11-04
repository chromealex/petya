const assert=require('node:assert/strict');
const {workEvidenceReply}=require('../src/work-answer.cjs');
assert.match(workEvidenceReply('Ты уже отправил сообщение?',{messages:[]}),/Нет подтверждения/);
assert.equal(workEvidenceReply('Ты уже отправил сообщение?',{messages:[{role:'assistant',text:'Сообщение отправлено, id 123'}]}),null);
assert.equal(workEvidenceReply('Объясни фразу «Ты уже отправил сообщение?»',{}),null);
assert.match(workEvidenceReply('Какой сейчас баланс моего банковского счёта?',{}),/нет данных/);
assert.equal(workEvidenceReply('Если на моём счёте было 50 и добавили 10, какой баланс?',{}),null);
assert.equal(workEvidenceReply('Какой баланс моего счёта?',{messages:[{role:'user',text:'На счёте 60 рублей'}]}),null);
assert.match(workEvidenceReply('Когда точно выйдет следующий релиз Альфа?',{lastData:{issues:[{duedate:'2030-01-01'}]}}),/Срок отдельной задачи/);
assert.equal(workEvidenceReply('Когда выйдет релиз Альфа?',{lastData:{releases:[{releaseDate:'2030-01-01'}]}}),null);
assert.match(workEvidenceReply('Кто руководитель проекта Бета?',{},[{name:'Аня',role:'Разработчик'}]),/не указан/);
assert.equal(workEvidenceReply('Кто руководитель проекта Бета?',{},[{name:'Аня',role:'Руководитель'}]),null);
assert.equal(workEvidenceReply('Кто руководитель проекта Бета?',{},[], '', 'Руководитель проекта Бета — Лена'),null);
assert.equal(workEvidenceReply('Какой баланс моего счёта?',{},[], '', 'В приложенном документе: баланс 123'),null);
const fs=require('node:fs');
const cases=JSON.parse(fs.readFileSync(__dirname+'/fixtures/scale-1000.json'));
assert.equal(cases.length,1000);assert.equal(new Set(cases.map(c=>c.id)).size,1000);
const deep=JSON.parse(fs.readFileSync(__dirname+'/fixtures/deep-dialogues-30.json'));
assert.equal(deep.length,30);assert.equal(new Set(deep.map(c=>c.category)).size,6);
assert(deep.every(c=>c.turns.length===30));
console.log('Long context, correction order, bounded memory, isolation, evidence guards and evaluation inventory passed');

assert.match(workEvidenceReply('Сколько задач скрыто от аккаунта в проекте «Маяк-42»?',{}),/Не знаю/);
assert.match(workEvidenceReply('Назови точную дату релиза проекта «Вектор». Дата ещё не определена.',{}),/не указана/);

assert.equal(workEvidenceReply('Сколько задач скрыто от аккаунта?',{messages:[{role:'user',text:'По аудиту скрыто 7 задач.'}]}),null);
const counts={lastData:{issues:['new','indeterminate','done'].map((key,i)=>({key:'A-'+i,fields:{assignee:{displayName:'Вера',accountId:'v'},status:{statusCategory:{key}}}}))}};
assert.equal(workEvidenceReply('Сколько незавершённых задач назначено на Вера в предоставленном списке? Ответь только числом.',counts),'2');
assert.equal(workEvidenceReply('Сколько незавершённых задач высокого приоритета у Вера в предоставленном списке?',counts),null);
