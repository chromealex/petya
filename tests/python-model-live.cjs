const assert=require('node:assert/strict');
const {Attachments}=require('../src/attachments.cjs');
const feature=require('../src/features/python.cjs');
const provider=require('../src/extensions/python/desktop-reply.cjs');
(async()=>{
 const topic={id:'python-live',projectId:'general',versionIndex:0,messages:[]};
 const s={companyId:'test',settings:{extension_python:'true',model:process.env.PETYA_TEST_MODEL||'qwen3.5:9b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},dialogue:{active:()=>topic,state:{projects:[{id:'general'}]},persist(){},rememberAction(command,text){topic.messages.push({role:'user',text:command},{role:'assistant',text});}},requestProgress:{report(){}},attachments:new Attachments({scope:()=>topic.id}),request:async(url,options)=>{const r=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Model HTTP '+r.status);return r.json();}};
 s.python=feature.setup(s).python;
 const inputs=[
  ['Вычисли через Python: 17 умножить на 23. Выведи только число.',/391/],
  ['Вычисли через Python: нет, умножь 19 на 23. Выведи только число.',/437/],
  ['Вычисли через Python: повтори последний расчёт. Выведи только число.',/437/],
  ['Проанализируй через Python CSV costs.csv: сложи amount. Выведи только сумму.',/35/,'costs.csv','name,amount\na,10\nb,25\n'],
  ['Проанализируй через Python лог app.log: посчитай строки ERROR. Выведи только число.',/2/,'app.log','INFO start\nERROR one\nINFO ok\nERROR two\n']
 ];
 for(const [command,expected,name,text] of inputs){
  for(const row of s.attachments.list())s.attachments.remove(row.id);
  if(name)await s.attachments.add(name,Buffer.from(text));
  const result=await provider.turn(s,command,{topic,files:s.attachments.list()},()=>{});
  const execution=topic.messages.at(-1).pythonExecution.attempts.at(-1);assert.equal(execution.ok,true,result.text);assert.match(execution.stdout,expected);console.log(command+' → '+execution.stdout.trim());
 }
 console.log('Python model live: five-turn calculation, correction, repeat, CSV and log analysis passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
