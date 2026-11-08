// Live self-check with the user's real model and connections: Petya asks itself a fixed set of
// read-only questions in a separate project, records the answers and exits. Nothing is sent,
// created or changed in external services. Started by: PETYA_LIVE_CHECK=<report.json> Petya
const fs=require('node:fs');
const SCENARIOS=[
 {name:'Приветствие',turns:['Привет','Что ты умеешь?']},
 {name:'Мои задачи и статусы',turns:['Покажи мои задачи','А из todo?','Только в работе','Задачи открытые на мне покажи']},
 {name:'Баги',turns:['Какие баги открыты?']},
 {name:'Калькулятор',turns:['Сколько будет 17 умножить на 23?','Раздели 100 на 4']},
 {name:'Поправка во фразе',turns:['Назови проект Альфа, нет, проект Бета. В ответе только название.','Сколько будет десять плюс пять, нет, десять плюс семь? Ответь только числом.']},
 {name:'Отмена действия',turns:['Создай задачу в Jira, нет, ничего не создавай.']},
 {name:'Продолжения по теме',turns:['Что такое Docker? Коротко.','А чем он отличается от виртуалки?','Приведи пример команды']},
 {name:'Память и поправка',turns:['Меня зовут Саша','Как меня зовут?','Нет, вообще-то зови меня Алекс','Как меня зовут?']},
 {name:'Повтор вопроса',turns:['Расскажи анекдот про программистов','Расскажи анекдот про программистов']},
 {name:'Git',turns:['Посмотри гит','Какая версия проекта?'],userProject:true},
 {name:'Сервисы',turns:['Что нового в Slack?','Есть новые письма?','Что нового в телеграме?']},
 {name:'Команда',turns:['Кто сейчас свободен в команде?','Какие задачи у коллег в работе?']},
 {name:'Бытовое',turns:['Как сварить гречку?','Переведи на английский: доброе утро']},
 {name:'Агенты',turns:['Раздай агентам: 1) какие задачи на мне в работе, 2) что нового в Slack, 3) какая последняя версия проекта по гиту'],agents:true,userProject:true},
 {name:'Агенты по проектам',turns:['Раздай агентам: 1) какие баги открыты в BW, 2) какой статус проекта MW2, 3) что нового в Slack за сегодня'],agents:true,userProject:true},
 {name:'Уточнение: задачи проекта',turns:['Покажи задачи MW2','Какие из этих задач сделать сначала?','А какие из них в работе?']},
 {name:'Уточнение: мои задачи',turns:['Какие задачи на мне в работе?','Какие из них на ревью?','Что из этого списка самое срочное?']},
 {name:'Уточнение: баги',turns:['Какие баги открыты в BW?','Какие из них критичные?']},
 {name:'Уточнение: команда',turns:['Кто сейчас в команде?','Кто из них свободен?'],userProject:true},
 {name:'Уточнение: длинный рабочий',turns:['Какие задачи на мне в работе?','Какие из них на ревью?','Запомни как важное: BW-4350 нужно закрыть до релиза','Сколько будет 15% от 2000?','Вернёмся к задачам: что из этого списка сделать сначала?','А какие из них в работе?','Что важно не забыть по задачам?','Нет, я про BW-4350 — до какого момента её надо закрыть?']},
 {name:'Уточнение: длинный со сменой темы',turns:['Какие баги открыты в BW?','Какие из них в работе?','Какая погода в Москве?','Нет, в Казани','Вернёмся к багам: какие из этих сделать сначала?','А что из этого списка не начато?','Спасибо, а курс евро?']},
 {name:'Предложение агентов',turns:['Покажи мои задачи в работе и что нового в слаке','Ответить одним сообщением']},
 {name:'Важное',turns:['Запомни как важное: релиз 1.19 переносим на 20 ноября','Расскажи анекдот про тестировщиков','Когда релиз 1.19?']},
 {name:'Свежие данные',turns:['Какая сейчас погода в Москве?','Какой курс доллара?','Погода в Санкт-Петербурге завтра']},
 {name:'Навыки',turns:['Оформи баг-репорт: при нажатии на кнопку магазина игра зависает на iPhone 12','Напиши патчноут для игроков: исправили зависание магазина, добавили ивент на Хэллоуин','Составь тест-кейсы для формы входа по почте','Что нового в Slack?']},
 {name:'Разговор',turns:['Как дела?','Ты кто?','Спасибо!']},
 {name:'Баги по проектам',turns:['Какие баги открыты в BW?','А в MW2?','Только критичные']},
 {name:'Мои задачи: сроки',turns:['Сколько у меня задач в работе?','А просроченные?','Покажи закрытые на мне']},
 {name:'Git подробно',turns:['Какие ветки есть в гите?','Покажи последние коммиты','Что изменилось в гите?'],userProject:true},
 {name:'Калькулятор 2',turns:['Сколько будет 15% от 2400?','Корень из 144','2 в степени 10']},
 {name:'Поправки 2',turns:['Сколько будет 3 умножить на 4, точнее на 5?','Отправь отчёт в Slack, нет, не отправляй','Не создавай задачу']},
 {name:'Знания',turns:['Что такое ANR?','Чем отличается merge от rebase?','Объясни коротко, что такое docker compose','А пример?']},
 {name:'Бытовое 2',turns:['Сколько варить яйцо всмятку?','Как по-английски «дедлайн»?','Придумай название для чат-бота поддержки']},
 {name:'Повтор 2',turns:['Посоветуй фильм на вечер','Посоветуй фильм на вечер']},
 {name:'Сервисы 2',turns:['Что мне писали в Slack?','Есть новые сообщения в телеграме?','Посмотри почту']},
 {name:'Команда 2',turns:['Кто у нас тестирует?','Чем занята команда?']},
 {name:'Важное проекта',turns:['Запомни как важное для проекта: демо в пятницу в 15:00','Когда демо?']},
 {name:'Агенты: одним сообщением',turns:['Что нового в Slack и какие баги открыты в BW?','Одним сообщением']},
 {name:'Свежие 2',turns:['Курс евро','Какая погода завтра в Казани?']},
 {name:'Шум',turns:['ыва','Петя','?']}
];
// PETYA_LIVE_SET=500 runs the 500 graded cases of src/live-cases.cjs instead of the short scenario list.
const CASES=process.env.PETYA_LIVE_SET==='500'?require('./live-cases.cjs'):SCENARIOS;
module.exports=async(win,out)=>{
 // The packaged app has no console: progress and an unexpected exit are logged next to the report.
 const note=line=>{try{fs.appendFileSync(out+'.log',new Date().toISOString()+' '+line+'\n');}catch{}};
 process.once('exit',code=>note('EXIT '+code));process.on('uncaughtException',e=>note('UNCAUGHT '+(e?.stack||e)));process.on('unhandledRejection',e=>note('REJECTION '+(e?.stack||e)));
 {const {app}=require('electron');for(const k of ['quit','exit']){const f=app[k].bind(app);app[k]=(...a)=>{note('APP.'+k.toUpperCase()+' '+new Error().stack.split('\n').slice(2,6).join(' | '));return f(...a);};}
  app.on('before-quit',()=>note('BEFORE-QUIT'));}
 win.webContents.on('render-process-gone',(_e,d)=>note('RENDERER GONE '+JSON.stringify(d)));

 const js=code=>win.webContents.executeJavaScript(code);
 const withTimeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Нет ответа за '+ms/1000+' с')),ms))]);
 const report={at:new Date().toISOString(),version:require('../package.json').version,scenarios:[]};
 // PETYA_LIVE_RESUME=1: an interrupted run (Petya was quit) continues with the scenarios it has not finished.
 let done=new Set();if(process.env.PETYA_LIVE_RESUME==='1')try{const prev=JSON.parse(fs.readFileSync(out,'utf8'));if(!prev.summary){const names=new Set(CASES.map(c=>c.name));report.scenarios=prev.scenarios.filter(x=>names.has(x.name)&&x.turns.length===CASES.find(c=>c.name===x.name).turns.length);report.at=prev.at||report.at;done=new Set(report.scenarios.map(x=>x.name));note('RESUME after '+done.size+' scenarios');}}catch{}
 const before=await js('window.petya.dialogueTopics()');
 // PETYA_LIVE_MODEL runs the whole check on another local model (for comparing models); restored afterwards.
 const previousModel=(await js('window.petya.settings()')).model||'';report.model=process.env.PETYA_LIVE_MODEL||previousModel;
 if(process.env.PETYA_LIVE_MODEL)await js(`window.petya.saveSettings(${JSON.stringify({model:process.env.PETYA_LIVE_MODEL})})`);
 const title='Автотест Пети '+new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const project=(await js(`window.petya.chatProjectCreate(${JSON.stringify(title)})`)).projects.find(p=>p.name===title);
 try{
  // PETYA_LIVE_ONLY=<regex> runs only the scenarios whose name matches (e.g. «Агент»).
  const only=process.env.PETYA_LIVE_ONLY?new RegExp(process.env.PETYA_LIVE_ONLY,'iu'):null;
  for(const scenario of CASES.filter(x=>(!only||only.test(x.name))&&!done.has(x.name))){const models=require('./model-context.cjs');models.stats({reset:true});
   // Git needs the folders of the user's own project; its chat is archived right after.
   // Prefer the active project when it has folders, otherwise the first project that has some.
   const withFolders=(before.projects||[]).filter(p=>p.folder||p.folders?.length||p.memoryId);
   const target=scenario.userProject?((withFolders.find(p=>p.id===before.activeProjectId)||withFolders[0])?.id||before.activeProjectId||project.id):project.id;
   await js(`window.petya.chatProjectSelect(${JSON.stringify(target)})`);await js(`window.petya.dialogueSelect('')`);
   const turns=[];
   for(const turn of scenario.turns){const [text,checks]=Array.isArray(turn)?turn:[turn,{}];const started=Date.now();let r;try{fs.appendFileSync(out+'.log',new Date().toISOString()+' '+scenario.name+' › '+text+'\n');}catch{}
    try{r=await withTimeout(js(`window.petya.converse(${JSON.stringify(text)}).then(r=>({text:r.text||'',topicId:r.topicId||'',by:r.by||(r.messages||[]).filter(m=>m.role==='assistant').at(-1)?.by||'',handled:r.handled,question:!!r.question,error:!!r.error,steps:(r.steps||[]).map(s=>s.label),options:(r.options||r.clarificationOptions||r.skillChoices||r.integrationOffers||r.mediaChoices||[]).map(o=>o.label||o).slice(0,6)}))`),150000);}
    catch(e){r={text:'',error:true,failure:e.message};}
    // Agents answer later: wait for the combined answer in the parent chat.
    if(scenario.agents&&!r.error){const id=(await js('window.petya.dialogueTopics()')).activeId;for(let i=0;i<120&&id;i++){await new Promise(res=>setTimeout(res,2000));const st=await js(`window.petya.chatJobState(${JSON.stringify(id)})`);const plan=st?.messages?.find(m=>m.agentPlan)?.agentPlan;if(st?.job?.state==='done'&&st.messages.at(-1)?.by==='агенты Пети: итог'){r.agents=(plan?.tasks||[]).map(t=>t.title+' — '+t.state);r.final=st.messages.at(-1).text;break;}}
     // Agent chats must sit under this chat in the sidebar (agentOf) and stay within the model cap.
     if(id){const nav=await js('window.petya.chatNavigation("")');r.agentChats=nav.topics.filter(t=>t.agentOf===id).map(t=>t.title+' — '+(t.job?.state||''));}}
    {const m=require('./model-context.cjs').stats({reset:true});r.models={peak:m.peak,maxWaiting:m.maxWaiting,limit:m.limit};}
    turns.push({input:text,ms:Date.now()-started,...r,fail:require('./live-grade.cjs').grade(r,checks)});
    fs.writeFileSync(out,JSON.stringify({...report,scenarios:[...report.scenarios,{name:scenario.name,turns}]},null,1));
   }
   report.scenarios.push({name:scenario.name,turns});
   if(scenario.agents){const since=Date.parse(report.at);for(const t of (await js('window.petya.dialogueTopics()')).topics.filter(t=>/^Агент · /.test(t.title)&&t.at>=since))try{await js(`window.petya.chatArchive('chat',${JSON.stringify(t.id)},true)`);}catch{}}
   if(target!==project.id){const id=(await js('window.petya.dialogueTopics()')).activeId;if(id)try{await js(`window.petya.chatArchive('chat',${JSON.stringify(id)},true)`);}catch{}}
  }
 }catch(e){note('FAILED '+(e?.stack||e));throw e;}finally{note('FINALLY');
  try{report.summary=require('./live-grade.cjs').summary(report);}catch(e){report.summaryError=e.message;}
  fs.writeFileSync(out,JSON.stringify(report,null,1));
  // Leave the user's chats as they were: remove the test project and the chats this run opened (and leftovers of
  // older runs), then return to the previous chat.
  try{const turns=CASES.flatMap(x=>x.turns.map(t=>Array.isArray(t)?t[0]:t));report.cleanup=await js(`window.petya.feature('selftest','cleanup',${JSON.stringify({since:Date.parse(report.at)-1000,turns,legacy:true})})`);fs.writeFileSync(out,JSON.stringify(report,null,1));}catch(e){try{await js(`window.petya.chatArchive('project',${JSON.stringify(project.id)},true)`);}catch{}}
  if(process.env.PETYA_LIVE_MODEL)try{await js(`window.petya.saveSettings(${JSON.stringify({model:previousModel})})`);}catch{}
  try{if(before.activeProjectId)await js(`window.petya.chatProjectSelect(${JSON.stringify(before.activeProjectId)})`);if(before.activeId)await js(`window.petya.dialogueSelect(${JSON.stringify(before.activeId)})`);}catch{}
 }
};
