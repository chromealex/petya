// Explicit opt-in live check on local Ollama or the own runtime: long conversations (5–6 turns) with
// follow-ups, corrections, topic changes and repeated questions.
// Run: node tests/long-dialogue-live.cjs   (PETYA_TEST_MODEL=qwen3.5:9b to pick a model)
const fs=require('node:fs'),path=require('node:path');
const {Dialogue}=require('../src/dialogue.cjs');
const {dialogueRequest}=require('../src/dialogue-request.cjs');
const {localAnswer}=require('../src/dialogue-answer.cjs');
const {similar}=require('../src/answer-repeat.cjs');
let model=process.env.PETYA_TEST_MODEL||'qwen3:4b';
const url=process.env.PETYA_OLLAMA_URL||'http://127.0.0.1:11434';
let request=async function(body){const r=await fetch(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,stream:false}),signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Ollama HTTP '+r.status);return r.json();};
// [реплика, ожидаемый смысл (RegExp) или null — только общие проверки]
const cases=[
 {name:'Продолжения по теме',steps:[['Расскажи коротко, что такое Docker',/контейнер/iu],['А чем он отличается от виртуалки?',/виртуал|ядр|изоляц|легч|ресурс/iu],['А он бесплатный?',/бесплат|лиценз|desktop/iu],['Приведи пример команды',/docker\s+(?:run|ps|pull|build)/iu],['А для Windows это работает?',/windows|wsl/iu],['Спасибо!',null]]},
 {name:'Память и поправка',steps:[['Меня зовут Саша',null],['Я работаю над проектом Петя',null],['Как меня зовут?',/саш/iu],['Нет, вообще-то зови меня Алекс',null],['Как меня зовут?',/алекс/iu],['Над каким проектом я работаю?',/пет/iu]]},
 {name:'Повторный вопрос без данных',steps:[['Можешь посмотреть мой git?',null],['А сейчас можешь гит посмотреть?',null],['Ну посмотри гит',null],['Почему не можешь?',null]]},
 {name:'Смена темы и возврат',steps:[['Посоветуй одну книгу по программированию',/«|книг|автор/iu],['А что-нибудь художественное?',/«|роман|книг|автор/iu],['Сколько будет 17 умножить на 23?',/391/u],['Вернёмся к книгам: посоветуй ещё одну художественную',/«|роман|книг|автор/iu],['Почему именно её?',null]]},
 {name:'«Нет, другое»',steps:[['Как сварить гречку?',/вод|минут/iu],['Нет, я про гречку в мультиварке',/мультиварк|режим|программ/iu],['А сколько соли?',/сол|ложк|щепот|грамм/iu],['А если на четверых?',/стакан|грамм|чашк|вдвое|в два раза|четыр/iu]]}
];
async function prepareRuntime(args,input,fetchImpl){
 const [flag,endpoint,selected,digest,output,...extra]=args;
 if(flag!=='--runtime'||!endpoint||!selected||!output||extra.length||!/^(sha256:)?[a-f0-9]{64}$/.test(digest||''))throw Error('Usage: --runtime LOOPBACK_ORIGIN MODEL EXPECTED_SHA256 NEW_OUTPUT.json');
 const {loopback,readToken,authenticatedJSON}=require('./fixtures/petya-v1-live/run.cjs');
 const origin=loopback(endpoint);
 if(fs.existsSync(output))throw Error('Output already exists');
 const token=await readToken(input),fetchJSON=authenticatedJSON(origin,token,fetchImpl);
 const tags=await fetchJSON('/api/tags');
 const identity=tags.models?.find(m=>m.name===selected||m.model===selected);
 if(!identity||String(identity.digest).replace(/^sha256:/,'')!==digest.replace(/^sha256:/,''))throw Error('Endpoint model identity mismatch');
 const crypto=require('node:crypto'),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
 const sourceHashes={};
 const root=path.resolve(__dirname,'..');
 const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.isFile()&&file.endsWith('.cjs'))sourceHashes[path.relative(root,file)]=hash(fs.readFileSync(file));}};
 walk(path.join(root,'src'));
 const evidence={endpoint:origin.origin,expectedDigest:digest,advertisedModel:identity,runnerSha256:hash(fs.readFileSync(__filename)),transportSha256:hash(fs.readFileSync(require.resolve('./fixtures/petya-v1-live/run.cjs'))),sourceHashes,calls:[],scope:'Generated dialogue with heuristic checks; complete manual semantic review and server artifact verification remain required.'};
 return {model:selected,output,evidence,request:async body=>{
  const sent={...body,stream:false},call={body:sent};evidence.calls.push(call);
  try{const response=await fetchJSON('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sent)});call.response=response;return response;}
  catch(e){call.error=e.message;throw e;}
 }};
}
async function main(){
 let runtime;
 if(process.argv.length>2){runtime=await prepareRuntime(process.argv.slice(2),process.stdin);model=runtime.model;request=runtime.request;}
 const out=runtime?.output||path.join(__dirname,'results','long-dialogue-'+new Date().toISOString().slice(0,10)+'-'+model.replace(/[^\w.-]+/g,'_')+'.json');
 if(fs.existsSync(out))throw Error('Output already exists');
 const report=[];let failed=0;
 for(const scenario of cases){
  const d=new Dialogue({routeTopic:async()=>null,answer:async(command,topic)=>localAnswer({model,command,topic,request:(overrides={})=>request({...dialogueRequest({model,command,topic,company:'Тестовая компания'}),...overrides}),uncertain:()=>false,clarify:()=>({text:'Уточни вопрос.',question:true})})});
  const answers=[];
  for(const [text,expected] of scenario.steps){
   const start=Date.now();let answer='',error='';
   try{const result=await d.turn(text);answer=String(result?.text||'');
    if(result?.error)error=answer||'Ошибка модели';
    else if(!answer)error='Нет ответа';
    else if(expected&&!expected.test(answer))error='Ответ не по смыслу';
    else if(answers.some(previous=>similar(answer,previous)))error='Повтор прежнего ответа';
    else if(/(?:^|\s)(?:вы|вам|вас|давайте|уточните)(?=[\s,.!?]|$)/iu.test(answer))error='Обращение на «вы»';
    else if(/lastVerifiedData|archiveSummary|recentUserFacts|telegramContext/u.test(answer))error='Утечка служебных полей';
   }catch(e){error='Ошибка: '+e.message;}
   answers.push(answer);if(error)failed++;
   report.push({scenario:scenario.name,input:text,answer,source:d.active()?.answeredBy||null,ms:Date.now()-start,passed:!error,...(error?{error}:{})});
   console.log((error?'✗ ':'✓ ')+scenario.name+' | '+text+'\n   '+answer.replace(/\n/g,' ').slice(0,220)+(error?'\n   → '+error:''));
  }
 }
 const total=report.length;console.log(`\n${model}: ${total-failed}/${total} реплик без ошибок`);
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({model,at:new Date().toISOString(),results:report,...(runtime?{runtime:runtime.evidence,status:'captured-awaiting-semantic-review'}:{})},null,1),{flag:'wx'});console.log('Отчёт: '+path.relative(process.cwd(),out));
 if(failed)process.exitCode=1;
}
module.exports={prepareRuntime,cases};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
