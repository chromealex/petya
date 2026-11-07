// Corrections of Petya's last answer in the user's own words, not one fixed phrase.
const assert=require('node:assert/strict');const {correction}=require('../src/personal-dictionary.cjs');
const chat={jiraProject:'',messages:[{role:'user',text:'Покажи баги в Jira'},{role:'assistant',text:'Вот баги…'}]};
const asked={messages:[{role:'user',text:'Создай задачу'},{role:'assistant',text:'Назначить на тебя?'}]};
// The right request: learned as a correction.
for(const [text,to] of [['Нет, я имел в виду покажи задачи в Jira','покажи задачи в Jira'],['Я имел ввиду не это, а задачи на мне','задачи на мне'],['Не то, мне нужны задачи на мне','задачи на мне'],['ты не так понял, я хотел увидеть задачи команды','задачи команды'],['Нет, не это — я просил задачи на мне','задачи на мне']]){
 const r=correction(text,chat);assert.equal(r.to,to,text);assert.equal(r.from,'Покажи баги в Jira');assert.equal(r.origin,'chat');}
// How it should have been done: the request is redone with it.
for(const [text,refine] of [['Не так надо было, надо списком','надо списком'],['Неправильно понял, речь о задачах в спринте','задачах в спринте'],['не так, я про баги в iOS','баги в iOS']])assert.equal(correction(text,chat).refine,refine,text);
// Only that it was wrong: Petya asks what was meant.
for(const text of ['Я имел ввиду не это','Не так надо было','Я не это имел в виду','не то','Нет','мимо','это не то','не тот проект','Неправильно'])assert.ok(correction(text,chat)?.ask,text);
// Not corrections.
for(const text of ['Не так быстро, Петя, расскажи подробнее','Нет проблем, спасибо','Не то что бы плохо, но ок','Почему не так?','Не забудь про релиз','Не надо'])assert.equal(correction(text,chat),null,text);
assert.equal(correction('Нет',asked),null,'«нет» answers Petya\'s own question');
console.log('chat corrections: free wording, redo with how it should be, asking what was meant passed');
