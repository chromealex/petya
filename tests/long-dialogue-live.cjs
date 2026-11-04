// Explicit opt-in live check on local Ollama: long conversations (5–6 turns) with
// follow-ups, corrections, topic changes and repeated questions.
// Run: node tests/long-dialogue-live.cjs   (PETYA_TEST_MODEL=qwen3.5:9b to pick a model)
const fs=require('node:fs'),path=require('node:path');
const {Dialogue}=require('../src/dialogue.cjs');
const {dialogueRequest}=require('../src/dialogue-request.cjs');
const {localAnswer}=require('../src/dialogue-answer.cjs');
const {similar}=require('../src/answer-repeat.cjs');
const model=process.env.PETYA_TEST_MODEL||'qwen3:4b';
const url=process.env.PETYA_OLLAMA_URL||'http://127.0.0.1:11434';
async function request(body){const r=await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,stream:false}),signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Ollama HTTP '+r.status);return r.json();}
// [реплика, ожидаемый смысл (RegExp) или null — только общие проверки]
const cases=[
 {name:'Продолжения по теме',steps:[['Расскажи коротко, что такое Docker',/контейнер/iu],['А чем он отличается от виртуалки?',/виртуал|ядр|изоляц|легч|ресурс/iu],['А он бесплатный?',/бесплат|лиценз|desktop/iu],['Приведи пример команды',/docker\s+(?:run|ps|pull|build)/iu],['А для Windows это работает?',/windows|wsl/iu],['Спасибо!',null]]},
 {name:'Память и поправка',steps:[['Меня зовут Саша',null],['Я работаю над проектом Петя',null],['Как меня зовут?',/саш/iu],['Нет, вообще-то зови меня Алекс',null],['Как меня зовут?',/алекс/iu],['Над каким проектом я работаю?',/пет/iu]]},
 {name:'Повторный вопрос без данных',steps:[['Можешь посмотреть мой git?',null],['А сейчас можешь гит посмотреть?',null],['Ну посмотри гит',null],['Почему не можешь?',null]]},
 {name:'Смена темы и возврат',steps:[['Посоветуй одну книгу по программированию',/«|книг|автор/iu],['А что-нибудь художественное?',/«|роман|книг|автор/iu],['Сколько будет 17 умножить на 23?',/391/u],['Вернёмся к книгам: посоветуй ещё одну художественную',/«|роман|книг|автор/iu],['Почему именно её?',null]]},
 {name:'«Нет, другое»',steps:[['Как сварить гречку?',/вод|минут/iu],['Нет, я про гречку в мультиварке',/мультиварк|режим|программ/iu],['А сколько соли?',/сол|ложк|щепот|грамм/iu],['А если на четверых?',/стакан|грамм|чашк|вдвое|в два раза|четыр/iu]]}
];
(async()=>{
 const report=[];let failed=0;
 for(const scenario of cases){
  const d=new Dialogue({routeTopic:async()=>null,answer:async(command,topic)=>localAnswer({model,command,topic,request:(overrides={})=>request({...dialogueRequest({model,command,topic,company:'Тестовая компания'}),...overrides}),uncertain:()=>false,clarify:()=>({text:'Уточни вопрос.',question:true})})});
  const answers=[];
  for(const [text,expected] of scenario.steps){
   const start=Date.now();let answer='',error='';
   try{const result=await d.turn(text);answer=String(result?.text||'');
    if(!answer)error='Нет ответа';
    else if(expected&&!expected.test(answer))error='Ответ не по смыслу';
    else if(answers.some(previous=>similar(answer,previous)))error='Повтор прежнего ответа';
    else if(/(?:^|\s)(?:вы|вам|вас|давайте|уточните)(?=[\s,.!?]|$)/iu.test(answer))error='Обращение на «вы»';
    else if(/lastVerifiedData|archiveSummary|recentUserFacts|telegramContext/u.test(answer))error='Утечка служебных полей';
   }catch(e){error='Ошибка: '+e.message;}
   answers.push(answer);if(error)failed++;
   report.push({scenario:scenario.name,input:text,answer,ms:Date.now()-start,passed:!error,...(error?{error}:{})});
   console.log((error?'✗ ':'✓ ')+scenario.name+' | '+text+'\n   '+answer.replace(/\n/g,' ').slice(0,220)+(error?'\n   → '+error:''));
  }
 }
 const total=report.length;console.log(`\n${model}: ${total-failed}/${total} реплик без ошибок`);
 const out=path.join(__dirname,'results','long-dialogue-'+new Date().toISOString().slice(0,10)+'-'+model.replace(/[^\w.-]+/g,'_')+'.json');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({model,at:new Date().toISOString(),results:report},null,1));console.log('Отчёт: '+path.relative(process.cwd(),out));
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
