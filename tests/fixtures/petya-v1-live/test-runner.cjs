const assert=require('node:assert/strict');
const {runScenario,loopback,scenarios}=require('./run.cjs');
(async()=>{
 assert.equal(scenarios().length,6);
 assert.equal(scenarios().reduce((n,s)=>n+s.turns.length,0),31);
 for(const bad of ['https://127.0.0.1','http://example.com','http://localhost','http://127.0.0.1/path','http://x@127.0.0.1','http://127.0.0.1/?x=1'])assert.throws(()=>loopback(bad));
 assert.equal(loopback('http://127.0.0.1:18919').port,'18919');
 const records=[],requests=[];
 await runScenario({id:'harness-only',turns:['Объясни, что такое архивирование файлов.','А чем оно отличается от резервной копии?']},{model:'petya-v1-test',record:x=>records.push(x),request:async body=>{
  requests.push(body);
  return {message:{content:JSON.stringify({understood:true,answer:requests.length===1?'Архивирование объединяет файлы в архив.':'Резервная копия нужна для восстановления потерянных данных.'})}};
 }});
 assert.equal(requests.length,2);
 for(const body of requests){assert.equal(body.options.temperature,0.6);assert.equal(body.options.top_p,0.9);assert.equal(body.options.repeat_penalty,1.1);assert.equal(body.stream,false);assert.equal(body.format.type,'object');assert.equal(body.model,'petya-v1-test');}
 assert(requests[1].messages.some(m=>m.role==='assistant'&&m.content.includes('Архивирование объединяет файлы')),'Generated answer must become real assistant history');
 assert.equal(records.filter(x=>x.kind==='turn').length,2);
 assert(records.filter(x=>x.kind==='turn').every(x=>!x.error&&x.answer));
 assert.equal(records.filter(x=>x.kind==='response').length,2);
 const failed=[];
 await runScenario({id:'harness-error',turns:['Объясни устройство файлового архива.']},{model:'petya-v1',record:r=>failed.push(r),request:async()=>{throw Error('Local inference connection failed');}});
 assert.equal(failed.filter(r=>r.kind==='request-error').length,1);
 const failedTurn=failed.find(r=>r.kind==='turn');assert(failedTurn.error);assert.equal(failedTurn.error,failedTurn.answer);
 const clarified=[];
 await runScenario({id:'harness-clarification',turns:['Объясни устройство файлового архива.']},{model:'petya-v1',record:r=>clarified.push(r),request:async()=>({message:{content:JSON.stringify({understood:false,answer:''})}})});
 const question=clarified.find(r=>r.kind==='turn');assert.equal(question.question,true);assert.equal(question.error,undefined);
 console.log('Runner checks passed: generated history, production sampling/schema, captured responses, loopback restriction and frozen scenarios. No model quality was evaluated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
