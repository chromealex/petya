// Corrections inside one utterance (from the dictation benchmark): the corrected request is routed,
// a cancelled action is not run, ordinary «нет» is left alone.
const assert=require('node:assert/strict');const {resolve}=require('../src/self-correction.cjs');
const {Dialogue}=require('../src/dialogue.cjs');const {ChatJobs}=require('../src/chat-jobs.cjs');
for(const [q,a] of [
 ['Назови проект Альфа, нет, проект Бета. В ответе только название.','Назови проект Бета. В ответе только название.'],
 ['Сколько будет десять плюс пять, нет, десять плюс семь? Ответь только числом.','Сколько будет десять плюс семь? Ответь только числом.'],
 ['Расскажи про язык Java, нет, лучше про JavaScript. Ответь одним предложением.','Расскажи про JavaScript. Ответь одним предложением.'],
 ['Расскажи про Java, нет, JavaScript','Расскажи про JavaScript'],['Покажи баги в Альфа, нет, Бета','Покажи баги в Бета'],
 ['Покажи задачи проекта Альфа, вернее, Бета','Покажи задачи проекта Бета'],['Отправь Ане, нет, Маше сообщение','Отправь Маше сообщение'],
 ['Альфа, нет, Бета','Бета'],['Сколько будет пять, нет, семь умножить на два?','Сколько будет семь умножить на два?'],
 ['Покажи задачи, нет, лучше открой мне все свежие баги проекта Бета','открой мне все свежие баги проекта Бета']])assert.equal(resolve(q).text,a,q);
for(const q of ['Проверь, нет ли новых писем','Есть баги или нет, посмотри','Задач нет, посмотри завтра','Нет, спасибо','Скажи «Альфа, нет, Бета»','У меня нет задач'])assert.deepEqual(resolve(q),{text:q,changed:false},q);
for(const [q,reply] of [['Создай задачу в Jira, нет, ничего не создавай. Просто скажи, что не будешь создавать задачу.','Хорошо, не буду создавать задачу в Jira.'],['Напиши письмо, нет, не надо','Хорошо, не буду писать письмо.'],['Отправь отчёт в Slack, нет, отмена','Хорошо, не буду отправлять отчёт в Slack.']]){const r=resolve(q);assert.equal(r.cancelled,true,q);assert.equal(r.reply,reply);}
assert.equal(resolve('Не создавай задачу, нет, создай').cancelled,undefined,'a cancellation needs an action before it');
// In a background chat the corrected question replaces the pending one instead of duplicating it.
(async()=>{let asked='';const d=new Dialogue({answer:async t=>{asked=t;return 'ok';}});
 const jobs=new ChatJobs({dialogue:d,scope:()=>'s',converse:text=>d.turn(resolve(text).text,undefined,'chat')});
 const s=jobs.start('','general','Назови проект Альфа, нет, проект Бета');for(let i=0;i<40&&jobs.jobs.size;i++)await new Promise(r=>setTimeout(r,5));
 const t=d.state.topics.find(t=>t.id===s.topicId);assert.equal(asked,'Назови проект Бета');assert.deepEqual(t.messages.map(m=>[m.role,m.text]),[['user','Назови проект Бета'],['assistant','ok']]);
 console.log('Self-correction: replacements, cancellations, ordinary «нет» and background chats passed');})().catch(e=>{console.error(e);process.exit(1);});
