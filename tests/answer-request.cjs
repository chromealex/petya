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
// History is sent as chat turns (follow-ups keep context), the current command is not duplicated.
const follow=dialogueRequest({model:'qwen3:4b',command:'А какое оно?',topic:{title:'Т',messages:[{role:'user',text:'Кодовое слово Лира'},{role:'assistant',text:'Запомнил.'},{role:'user',text:'А какое оно?'}]}});
assert.deepEqual(follow.messages.slice(2).map(m=>[m.role,m.content]),[['user','Кодовое слово Лира'],['assistant','Запомнил.'],['user','А какое оно?']]);
assert(!/"history"/.test(follow.messages[1].content),'Recent history is not duplicated inside reference data');
assert(follow.options.temperature>0&&follow.options.repeat_penalty>1,'Greedy decoding made the small model repeat itself');
assert(follow.messages[0].content.length<2600,'Base prompt stays short for small local models');
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
 // Never the same answer twice: regenerate once, then admit the loop with a non-repeating phrase.
 const same='В доступных данных нет информации о текущем состоянии Git-репозитория, только папка проекта.';
 const looped={title:'Git',messages:[{role:'user',text:'Посмотри гит'},{role:'assistant',text:same},{role:'user',text:'А сейчас можешь гит посмотреть'}]};
 assert.match(dialogueRequest({model:'qwen3:4b',command:'А сейчас можешь гит посмотреть',topic:looped}).messages[0].content,/предыдущий ответ: «В доступных данных/);
 calls=[];const fresh=await localAnswer({...options,topic:looped,command:'А сейчас можешь гит посмотреть',request:async o=>{calls.push(o);return {message:{content:JSON.stringify({understood:true,answer:calls.length===1?same:'Подключи папку с .git в настройках проекта — тогда покажу ветку и последние коммиты.'})}};}});
 assert.match(fresh,/Подключи папку/);assert.equal(calls.length,2);assert(calls[1].options.temperature>calls[0]?.options?.temperature||calls[1].options.temperature===1);
 calls=[];const stuck=await localAnswer({...options,topic:looped,command:'А сейчас можешь гит посмотреть',request:async o=>{calls.push(o);return {message:{content:JSON.stringify({understood:true,answer:same+(calls.length===2?' Увы.':'')})}};}});
 assert.notEqual(stuck,same);assert.match(stuck,/по кругу|то же самое/);assert.equal(calls.length,2,'Repeat retry is bounded');
 const twice={...looped,messages:[...looped.messages,{role:'assistant',text:stuck},{role:'user',text:'Ну?'}]};
 assert.notEqual(await localAnswer({...options,topic:twice,command:'Ну?',request:async()=>({message:{content:JSON.stringify({understood:true,answer:stuck})}})}),stuck,'The loop notice itself is never repeated');
 assert.equal(await localAnswer({...options,topic:{title:'M',messages:[{role:'user',text:'2+2?'},{role:'assistant',text:'4'},{role:'user',text:'А 3+1?'}]},command:'А 3+1?',request:async()=>({message:{content:JSON.stringify({understood:true,answer:'4'})}})}),'4','Short factual answers may coincide');
 // Every reply is labelled with the path that produced it (shown under the message).
 {const {Dialogue}=require(root+'/src/dialogue.cjs');
  const d=new Dialogue({routeTopic:async()=>null,answer:(command,topic)=>localAnswer({model:'qwen3:4b',command,topic,uncertain:()=>false,clarify:()=>({text:'?',question:true}),request:async()=>({message:{content:JSON.stringify({understood:true,answer:'Docker — это платформа для контейнеров.'})}})})});
  await d.turn('Что такое Docker?');assert.equal(d.active().messages.at(-1).by,'модель qwen3:4b');assert.equal(d.active().answeredBy,undefined,'transient marker is cleared');
  await d.turn('Сколько будет 2+2?');assert.equal(d.active().messages.at(-1).by,'калькулятор');
  assert.equal(d.greeting('Привет').messages.at(-1).by,'шаблон: приветствие');}
 console.log('Answer request regressions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
