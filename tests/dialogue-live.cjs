// Explicit opt-in: only local Ollama; all company/project data are fixtures.
const fs=require('node:fs');
const {Dialogue}=require('../src/dialogue.cjs');
const {dialogueRequest}=require('../src/dialogue-request.cjs');
const {localAnswer}=require('../src/dialogue-answer.cjs');
const {routingRequest,parseRoute}=require('../src/intent-router.cjs');
const {ConversationInput}=require('../src/ui/conversation-input.js');
const {projectCatalogReply}=require('../src/project-catalog.cjs');
const model=process.env.PETYA_TEST_MODEL||'qwen3:4b';
async function request(body){const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Ollama HTTP '+r.status);return r.json();}
const cases=[
 {name:'Подтверждённое действие в истории',history:[{role:'user',text:'Отправь согласованное сообщение в канал проекта'},{role:'assistant',text:'Сообщение отправлено в канал #alpha-dev. Подтверждение Slack: ts=123.456.'}],steps:[['Ты уже отправил сообщение?',/^(?:Да|Сообщение отправлено)/iu]]},
 {name:'Приветствие и продолжение',steps:[['Как дела?',/помо|готов|хорош|поряд|отлич|норм|на связи|привет|как у тебя/iu],['А что ты умеешь?',/помо|могу|умею/iu],['Ты здесь?',/здесь/iu]]},
 {name:'Новый вопрос после старой опечатки',history:[{role:'user',text:'кгдер'},{role:'assistant',text:'Это опечатка «Костя где»?'}],steps:[['Как дела?',/помо|готов|хорош|поряд|отлич|норм|на связи|привет|как у тебя/iu],['Какие проекты у тебя есть?',/Альфа.*Бета/su],['Не создавай задачу, просто обсудим идею',/обсуд|иде|расскаж|давай/iu]]},
 {name:'Уточнение проекта и смена темы',steps:[['Проверь баги',/проект/iu],['второй',/Бета: 7/iu],['А сколько осталось?',/Бета: 7/iu],['Как дела?',/помо|готов|хорош|поряд|отлич|норм|на связи|привет|как у тебя/iu],['первый',/нет открытого списка/iu]]},
 {name:'Возврат к проверенным данным',steps:[['Проверь баги Альфа',/Альфа: 3/iu],['Что означает это число?',/количество открытых багов/iu],['Посмотри ANR',/не подключ/iu],['Вернёмся к багам',/Последний сохранённый ответ/iu],['Обнови',/Альфа: 3/iu]]},
 {name:'Объяснение и отрицание',steps:[['Что такое ANR?',/android|андроид|приложен|отвеч|завис/iu],['Не проверяй баги',null],['Объясни фразу «создай задачу»',/задач/iu]]},
 {name:'Неизвестные данные',steps:[['Кто сейчас чинит сервер в проекте Гамма?',/не знаю|нет |уточ|информац|данн|сведен|кто|како/iu],['Ты уже написал ему?',/^Нет/iu]]}
];
(async()=>{
 const report=[];
 for(const scenario of cases){
  let reads=0;const d=new Dialogue({routeTopic:async(text,topics,id)=>parseRoute(await request(routingRequest(model,text,topics,id)),topics),answer:async(command,topic)=>localAnswer({model,command,topic,request:(overrides={})=>request({...dialogueRequest({model,command,topic,company:'Тестовая компания'}),...overrides}),uncertain:()=>false,clarify:()=>({text:'Уточни вопрос.',question:true})}),readers:{bugs:async(text,t)=>{reads++;if(/Альфа/iu.test(text))t.jiraProject='A';if(/Бета/iu.test(text))t.jiraProject='B';if(!t.jiraProject)return {question:'В каком проекте посмотреть баги?',field:'jiraProject',options:[{id:'A',label:'Альфа'},{id:'B',label:'Бета'}]};const name=t.jiraProject==='A'?'Альфа':'Бета',n=t.jiraProject==='A'?3:7;return {text:name+': '+n+' открытых багов.',title:'Баги · '+name,data:{project:t.jiraProject,total:n,open:n}};},anr:async()=>{reads++;return {text:'Google Play не подключён.',error:true};}}});
  if(scenario.history){d.state={activeId:'old',topics:[{id:'old',kind:'chat',title:'Опечатка',at:Date.now(),messages:scenario.history}]};}
  for(const [text,expected] of scenario.steps){
   const start=Date.now(),before=reads;let result,error='';
   try{result=ConversationInput.presenceReply(text)||projectCatalogReply(text,{projects:[{id:'A',name:'Альфа'},{id:'B',name:'Бета'}]})||await d.turn(text);
    if(/(?:^|\s)(?:вы|вам|вас|давайте|уточните)(?=[\s,.!?]|$)/iu.test(result?.text||''))error='Formal address instead of ty';
    if(/^Не проверяй/iu.test(text)&&/ANR|Application/iu.test(result?.text||''))error='Repeated unrelated explanation';
    if(/lastVerifiedData|telegramContext|\bteam\b/iu.test(result?.text||''))error='Internal fields leaked';
    if(!result.handled||!result.text)error='No conversational answer';
    else if(expected&&!expected.test(result.text))error='Answer did not satisfy expected meaning';
    if(/\bпользователь\b|(?:^|\s)пользователь(?:\s|[,.:])/iu.test(result.text))error='Third-person address';
    if(/^Что такое ANR/iu.test(text)&&(!/Application Not Responding|не отвечает/iu.test(result.text)||/Network Response/iu.test(result.text)))error='Incorrect ANR definition';
    if(/Кто сейчас/iu.test(text)&&(/(?:^|\s)(?:Иван|Петров)(?=[\s,.]|$)/iu.test(result.text)||!/(?:не знаю|нет (?:этих |таких )?данных|нет информации|(?:данн|сведен).{0,100}(?:нет|отсутств)|(?:нет|отсутствуют).{0,100}(?:данн|сведен))/iu.test(result.text)))error='Invented responsible person';
    if(/^Как дела/iu.test(text)&&/проект|настрой|систем|баг|Альфа|Бета/iu.test(result.text))error='Greeting dragged into unrelated work';
    if(/^(?:Как дела|Что такое|Не проверяй|Объясни|первый)/iu.test(text)&&reads!==before)error='Unrequested service read';
   }catch(e){error=e.message;}
   const row={scenario:scenario.name,input:text,answer:result?.text,ms:Date.now()-start,passed:!error,...error?{error}:{}};report.push(row);console.log(JSON.stringify(row));
  }
 }
 if(process.env.PETYA_TEST_REPORT)fs.writeFileSync(process.env.PETYA_TEST_REPORT,JSON.stringify({model,at:new Date().toISOString(),results:report},null,2));
 console.log(`Live dialogue: ${report.filter(r=>r.passed).length}/${report.length} passed`);if(report.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
