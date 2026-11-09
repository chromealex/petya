// Regressions found by the live long-dialogue run on qwen3:4b (tests/results/long-dialogue-*).
const assert=require('node:assert/strict');
const {explicitCalculation}=require('../src/explicit-calculation.cjs');const {Dialogue}=require('../src/dialogue.cjs');const {dialogueRequest}=require('../src/dialogue-request.cjs');
(async()=>{
 // «17 умножить на 23» was answered by the model as 401.
 for(const [q,a] of [['Сколько будет 17 умножить на 23?','391'],['Сколько будет 17 на 23?','391'],['Раздели 100 на 4','25'],['Умножь 17 на 23','391'],['Сложи 2 и 3','5'],['Вычти 5 из 9','4'],['Сколько будет 10 минус 3 плюс 2?','9']])assert.equal(explicitCalculation(q),a,q);
 for(const q of ['Сколько будет 100 разделить на 3?','Раздели задачу на 3 части','Сколько задач на 23 число?'])assert.equal(explicitCalculation(q),null,q);
 assert.equal(explicitCalculation('Сколько будет 15 процентов от 200?'),'30');assert.equal(explicitCalculation('Корень из 144'),'12');assert.equal(explicitCalculation('2 в степени 10'),'1024');
 // «Вернёмся к книгам: посоветуй ещё одну» replayed the old answer instead of answering.
 const d=new Dialogue({answer:async t=>'новый ответ на: '+t});
 await d.turn('Посоветуй книгу по программированию');const books=d.active().id;await d.turn('Новая тема: сколько будет 2+2');await d.turn('Новая тема: погода');
 let r=await d.turn('Вернёмся к книгам');assert.match(r.text,/^Вернулись к теме/);assert.equal(d.active().id,books);
 await d.turn('Новая тема: кино');r=await d.turn('Вернёмся к книгам: посоветуй ещё одну');assert.match(r.text,/^новый ответ/);assert.equal(d.active().id,books);
 // Everyday questions are answered; informal address is required.
 const p=dialogueRequest({model:'q',command:'Как сварить гречку?',topic:{title:'T',messages:[]}}).messages[0].content;
 assert.match(p,/бытовые вопросы/);assert.match(p,/только на «ты»/);
 // Live check 2026-11-04: a shell command is not the team; git status stays short; Ollama 500 retries with a smaller context.
 const route=require('../src/work-query-route.cjs');
 assert.equal(route.classify('Приведи пример команды',{}),null);assert.equal(route.classify('Какая команда для запуска docker?',{}),null);assert.equal(route.classify('Покажи загрузку команды',{}).kind,'workload');
 const git=require('../src/extensions/git/workspace.cjs').summary({name:'BW',branch:'rc',files:Array.from({length:5000},(_,i)=>({status:' M',path:'f'+i}))});
 assert(git.length<1000);assert.match(git,/Изменено файлов: 5000/);assert.match(git,/и ещё 4985/);
 {const {localAnswer}=require('../src/dialogue-answer.cjs');const calls=[];const r=await localAnswer({model:'m',command:'Что такое Docker?',topic:{messages:[]},uncertain:()=>false,clarify:()=>'?',request:async o=>{calls.push(o);if(calls.length===1){const e=Error('HTTP 500');e.status=500;e.detail='{"error":"model requires more system memory"}';throw e;}return {message:{content:JSON.stringify({understood:true,answer:'Контейнеры.'})}};}});
  assert.equal(r,'Контейнеры.');assert.equal(calls[1].options.num_ctx,4096);
  const fail=await localAnswer({model:'m',command:'Что такое Docker?',topic:{messages:[]},uncertain:()=>false,clarify:()=>'?',request:async()=>{const e=Error('HTTP 500');e.status=500;e.detail='{"error":"model requires more system memory"}';throw e;}});
  assert(fail.error);assert.match(fail.text,/requires more system memory/);}
 const access=new (require('../src/service-access.cjs').ServiceAccess)({settings:()=>({}),save:()=>{},open:()=>{}});
 assert.match((await access.offer('Есть новые письма?',null)).text,/^Почта не подключена/);
 // Live check after reboot: exact names; Slack never goes to the internet; a crashed runner restarts Ollama.
 {const {nameReply,localAnswer}=require('../src/dialogue-answer.cjs');const t={};
  assert.equal(nameReply('Меня зовут Саша',t),'Приятно познакомиться, Саша!');assert.equal(nameReply('Нет, вообще-то зови меня Алекс',t),'Хорошо, буду звать тебя Алекс.');assert.equal(nameReply('Как меня зовут?',t),'Тебя зовут Алекс.');assert.equal(nameReply('Как меня зовут?',{},''),null);
  assert.match(dialogueRequest({model:'q',command:'Привет',topic:{title:'T',messages:[],preferredName:'Алекс'},userName:'Александр',speechStyle:'0'}).messages[0].content,/"Алекс"/);
  let restarts=0,calls=0;const r=await localAnswer({model:'m',command:'Что такое Docker?',topic:{messages:[]},uncertain:()=>false,clarify:()=>'?',recover:async()=>{restarts++;},request:async()=>{calls++;if(calls===1){const e=Error('HTTP 500');e.status=500;e.detail='{"error":"mlx runner failed: panic: Failed to create Metal shared event"}';throw e;}return {message:{content:JSON.stringify({understood:true,answer:'Контейнеры.'})}};}});
  assert.equal(r,'Контейнеры.');assert.equal(restarts,1);}
 {const s=require('../src/semantic-tools.cjs');assert.equal(await s.dispatch({tool:'web'},'Что нового в Slack?',{web:()=>'web'}),null);assert.equal(await s.dispatch({tool:'web'},'Какая погода в Москве?',{web:()=>'web'}),'web');}
 {const {OllamaInstaller}=require('../src/ollama-install.cjs');const ran=[];let opened='';const i=new OllamaInstaller({platform:'darwin',home:'/h',find:()=>'/Applications/Ollama.app',run:async(f,a)=>{ran.push(f);return {stdout:''};},open:async t=>{opened=t;return '';}});
  const st=await i.restart();assert.equal(st.phase,'done');assert.deepEqual(ran,['/usr/bin/osascript','/usr/bin/pkill']);assert.equal(opened,'/Applications/Ollama.app');}
 console.log('Live dialogue fixes: spoken arithmetic, return to a topic with a new question, everyday questions passed');
})().catch(e=>{console.error(e);process.exit(1);});
