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
 {name:'Свежие данные',turns:['Какая сейчас погода в Москве?']}
];
module.exports=async(win,out)=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const withTimeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Нет ответа за '+ms/1000+' с')),ms))]);
 const report={at:new Date().toISOString(),version:require('../package.json').version,scenarios:[]};
 const before=await js('window.petya.dialogueTopics()');
 const title='Автотест Пети '+new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const project=(await js(`window.petya.chatProjectCreate(${JSON.stringify(title)})`)).projects.find(p=>p.name===title);
 try{
  for(const scenario of SCENARIOS){
   // Git needs the folders of the user's own project; its chat is archived right after.
   // Prefer the active project when it has folders, otherwise the first project that has some.
   const withFolders=(before.projects||[]).filter(p=>p.folder||p.folders?.length||p.memoryId);
   const target=scenario.userProject?((withFolders.find(p=>p.id===before.activeProjectId)||withFolders[0])?.id||before.activeProjectId||project.id):project.id;
   await js(`window.petya.chatProjectSelect(${JSON.stringify(target)})`);await js(`window.petya.dialogueSelect('')`);
   const turns=[];
   for(const text of scenario.turns){const started=Date.now();let r;
    try{r=await withTimeout(js(`window.petya.converse(${JSON.stringify(text)}).then(r=>({text:r.text||'',by:r.by||(r.messages||[]).filter(m=>m.role==='assistant').at(-1)?.by||'',handled:r.handled,question:!!r.question,error:!!r.error,steps:(r.steps||[]).map(s=>s.label),options:(r.options||r.clarificationOptions||r.skillChoices||r.integrationOffers||r.mediaChoices||[]).map(o=>o.label||o).slice(0,6)}))`),150000);}
    catch(e){r={text:'',error:true,failure:e.message};}
    // Agents answer later: wait for the combined answer in the parent chat.
    if(scenario.agents&&!r.error){const id=(await js('window.petya.dialogueTopics()')).activeId;for(let i=0;i<120&&id;i++){await new Promise(res=>setTimeout(res,2000));const st=await js(`window.petya.chatJobState(${JSON.stringify(id)})`);const plan=st?.messages?.find(m=>m.agentPlan)?.agentPlan;if(st?.job?.state==='done'&&st.messages.at(-1)?.by==='агенты Пети: итог'){r.agents=(plan?.tasks||[]).map(t=>t.title+' — '+t.state);r.final=st.messages.at(-1).text;break;}}}
    turns.push({input:text,ms:Date.now()-started,...r});
    fs.writeFileSync(out,JSON.stringify({...report,scenarios:[...report.scenarios,{name:scenario.name,turns}]},null,1));
   }
   report.scenarios.push({name:scenario.name,turns});
   if(scenario.agents){const since=Date.parse(report.at);for(const t of (await js('window.petya.dialogueTopics()')).topics.filter(t=>/^Агент · /.test(t.title)&&t.at>=since))try{await js(`window.petya.chatArchive('chat',${JSON.stringify(t.id)},true)`);}catch{}}
   if(target!==project.id){const id=(await js('window.petya.dialogueTopics()')).activeId;if(id)try{await js(`window.petya.chatArchive('chat',${JSON.stringify(id)},true)`);}catch{}}
  }
 }finally{
  fs.writeFileSync(out,JSON.stringify(report,null,1));
  // Leave the user's chats as they were: archive the test project and return to the previous chat.
  try{await js(`window.petya.chatArchive('project',${JSON.stringify(project.id)},true)`);}catch{}
  try{if(before.activeProjectId)await js(`window.petya.chatProjectSelect(${JSON.stringify(before.activeProjectId)})`);if(before.activeId)await js(`window.petya.dialogueSelect(${JSON.stringify(before.activeId)})`);}catch{}
 }
};
