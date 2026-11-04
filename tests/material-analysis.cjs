const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PETYA_ROOT||path.resolve(__dirname,'..');
const {answerAttachments,parseReply,sources,proposedCode}=require(root+'/src/attachment-assistant.cjs');
const {Attachments}=require(root+'/src/attachments.cjs');
const settings={model:'text',ollamaUrl:'http://127.0.0.1:11434/api/chat'};
const result=answer=>({done_reason:'stop',message:{content:JSON.stringify({answer})}});
function service(replies=[],models=[{name:'text',size:1},{name:'vision',size:2},{name:'qwen2.5-coder:7b',size:3}]){
 const calls=[];let chats=0;
 const request=async(url,options)=>{const data=options?.body?JSON.parse(options.body):{};calls.push({url,data});
 if(url.endsWith('/api/tags'))return {models};
 if(url.endsWith('/api/show'))return {capabilities:[data.model==='vision'?'vision':'completion']};
 const reply=replies[chats++];if(reply instanceof Error)throw reply;return typeof reply==='function'?reply(data):reply||result('Ответ');};
 return {calls,request,chats:()=>chats};
}
(async()=>{
 assert.equal(proposedCode('```python\n1: def f():\n2:     return 1\n```'),'```python\ndef f():\n    return 1\n```');
 assert.equal(proposedCode('```python\n1: x\n```','с номерами строк'),'```python\n1: x\n```');
 const files=[{name:'test.py',text:'x = 1\nprint(x)'}];
 assert.equal(sources([{file:'test.py',line:2},{file:'test.py',line:2},{file:'other',line:1},{file:'test.py',line:3}],files),'\n\nИсходные строки (дословно):\ntest.py:2\nprint(x)');
 assert.equal(sources([{file:'test.py',line:1}],files.concat(files)), '');
 for(const answer of ['', ' ', '{', '[]', '```'])assert.throws(()=>parseReply(result(answer)),/ответ/);
 assert.throws(()=>parseReply({...result('partial'),done_reason:'length'}),/лимиту/);
 let api=service([{message:{content:JSON.stringify({answer:'Проверка',sourceLines:[{file:'test.py',line:2}]})}}]);
 let answer=await answerAttachments({settings,request:api.request,topic:{attachments:files,messages:[]},question:'Где строка?'});
 assert.match(answer,/test.py:2\nprint\(x\)/);let chats=api.calls.filter(c=>c.url.endsWith('/api/chat')).map(c=>c.data);
 assert.equal(chats[0].model,'qwen2.5-coder:7b');assert.equal(chats[0].tools,undefined);assert.match(chats[0].messages[1].content,/numberedText/);
 api=service([result('{'),result('Исправленный полный ответ')]);
 answer=await answerAttachments({settings,request:api.request,topic:{attachments:files,messages:[]},question:'Проверь'});assert.equal(answer,'Исправленный полный ответ');assert.equal(api.chats(),2);
 api=service([result('{'),result('[')]);await assert.rejects(()=>answerAttachments({settings,request:api.request,topic:{attachments:files},question:'Проверь'}),/содержательный/);assert.equal(api.chats(),2);
 api=service([new Error('network down')]);await assert.rejects(()=>answerAttachments({settings,request:api.request,topic:{attachments:files},question:'Проверь'}),/network down/);assert.equal(api.chats(),1);
 api=service([{...result('cut'),done_reason:'length'},result('Полный')]);assert.equal(await answerAttachments({settings,request:api.request,topic:{attachments:files},question:'Проверь'}),'Полный');
 api=service([result('Status: Failed'),result('Нет подтверждения исправления.')]);
 answer=await answerAttachments({settings,request:api.request,topic:{attachments:[{name:'incident.png',image:'base64',note:'image'}],messages:[]},question:'Исправлено?'});
 chats=api.calls.filter(c=>c.url.endsWith('/api/chat')).map(c=>c.data);assert.equal(chats.length,2);assert.equal(chats[0].model,'vision');assert.deepEqual(chats[0].messages[1].images,['base64']);assert.equal(chats[1].model,'text');assert.equal(chats[1].messages[1].images,undefined);assert.match(chats[1].messages[1].content,/incident.png/);assert.match(chats[1].messages[1].content,/Status: Failed/);assert.match(chats[0].messages[0].content,/untrusted/);
 api=service([], [{name:'qwen2.5-coder:7b',remote_host:'external'},{name:'text'}]);await answerAttachments({settings,request:api.request,topic:{attachments:files},question:'Проверь'});assert.equal(api.calls.find(c=>c.url.endsWith('/api/chat')).data.model,'text');
 api=service([], [{name:'vision-cloud',size:1}]);await assert.rejects(()=>answerAttachments({settings,request:api.request,topic:{attachments:[{name:'x.png',image:'x'}]},question:'Проверь'}),/Нет локальной модели/);assert.equal(api.chats(),0);


 api=service([result('OVERRIDE'),result('OVERRIDE')]);
 await assert.rejects(()=>answerAttachments({settings,request:api.request,topic:{attachments:files},question:'Найди проблему'}),/отдельное слово/);assert.equal(api.chats(),2);
 const intake=new Attachments({});
 for(const name of ['query.sql','module.cjs','module.mjs','screen.tsx','view.jsx','main.go','main.rs','main.cpp','app.java','worker.out']){
  const item=await intake.add(name,Buffer.from('alpha\nbeta'));assert.equal(intake.take([item.id])[0].text,'alpha\nbeta');intake.remove(item.id);
 }
 await assert.rejects(()=>intake.add('bad.sql',Buffer.from([1,0,2])),/двоичные/);
 console.log('Material analysis: exact sources, local model routing, separate image observation, bounded malformed/truncated retries, no network retries, source formats passed');
})().catch(error=>{console.error(error);process.exitCode=1});
