const assert=require('node:assert/strict');
const root=process.env.PETYA_ROOT||require('node:path').resolve(__dirname,'..');
const {dialogueRequest}=require(root+'/src/dialogue-request.cjs');
const topic={title:'Пример',messages:[{role:'user',text:'Кодовое слово Лира'},{role:'assistant',text:'Лира'}]};
const original=JSON.stringify(topic);
const request=dialogueRequest({model:'qwen3:4b',command:'Назови кодовое слово.',topic,company:'Тестовая компания'});
assert.equal(request.think,false,'Ordinary dialogue uses the explicitly requested fast mode');
assert.equal(dialogueRequest({model:'qwen3:4b',command:'Explain',topic,reasoning:true}).think,true,'Explicit reasoning remains available');
assert(request.options.num_predict>=2048,'Reasoning must leave budget for a JSON answer');
assert.match(dialogueRequest({model:'qwen3:4b',command:'Что такое АНР?',topic}).messages[0].content,/Application Not Responding/);
assert.equal(request.messages.at(-1).content,'Назови кодовое слово.');
assert.match(request.messages[1].content,/Лира/);
assert.equal(JSON.stringify(topic),original,'Building a request must not mutate dialogue memory');
for(const model of ['llama3.2:3b','gemma3:4b'])assert.equal(dialogueRequest({model,command:'Привет',topic}).think,false);
const {localAnswer,prohibitionReply,greetingReply}=require(root+'/src/dialogue-answer.cjs');
(async()=>{
 for(const command of ['Не отправляй сообщение в Slack.','Не создавай задачу в Jira.','Не удаляй файлы.','Не меняй настройки.','Не публикуй отчёт.','Не проверяй почту.','Не запускай сборку.','Не приглашай коллег на встречу.','Не передавай документы.','Не открывай браузер.']) {
  const response=await localAnswer({command,request:()=>assert.fail('A simple prohibition must not call the model')});
  assert.match(response,/не буду/);
 }
 for(const command of ['Не создавай задачу, а объясни идею','Не создавай задачу и объясни почему','Не создавай задачу просто обсудим идею','Не открывай браузер?','«Не отправляй сообщение»','Что означает «не отправляй»?','Если я скажу не отправляй письмо','Не отправляй сообщение пока не проверишь адрес','Не отправляй сообщение. Расскажи про ANR','Не создавай задачу как лучше решить проблему'])assert.equal(prohibitionReply(command),null,command);
 for(const command of ['Привет','Петя, привет!','Привет, Петя!','Добрый день!','Добрый вечер!','Как дела?']) {
  const response=await localAnswer({command,request:()=>assert.fail('A plain greeting must not call the model')});
  assert.match(response,/на связи|На связи/);assert(!/вам|вы/iu.test(response));
 }
 for(const command of ['Привет! Что такое ANR?','Привет, создай задачу','Как дела с релизом?','Объясни слово привет','«Добрый день»'])assert.equal(greetingReply(command),null,command);
 const options={model:'qwen3:4b',uncertain:()=>false,clarify:()=>assert.fail('transport errors must not trigger interpretation')};
 const r=await localAnswer({...options,request:async()=>({done_reason:'length',message:{thinking:'unfinished',content:''}})});
 assert.equal(r.error,true,'An exhausted reasoning budget must not yield a false successful answer');
 const answer=await localAnswer({...options,request:async()=>({message:{thinking:'private reasoning',content:JSON.stringify({understood:true,answer:'Луна'})}})});
 assert.equal(answer,'Луна','Only the answer, not internal reasoning, should be shown');
 let calls=[];
 const recovered=await localAnswer({...options,request:async(overrides)=>{calls.push(overrides);return calls.length===1?{done_reason:'length',message:{content:'',thinking:'unfinished'}}:{message:{content:JSON.stringify({understood:true,answer:'Красный'})}};}});
 assert.equal(recovered,'Красный');assert.deepEqual(calls,[{},{think:false}]);
 calls=[];
 assert((await localAnswer({...options,request:async(o)=>{calls.push(o);return {done_reason:'length',message:{content:''}};}})).error);
 assert.equal(calls.length,2,'Exhaustion retry is bounded');
 calls=[];
 assert((await localAnswer({...options,request:async(o)=>{calls.push(o);return {message:{content:'invalid'}};}})).error);
 assert.equal(calls.length,1,'Unrelated malformed output is not retried');
 console.log('Answer request regressions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
