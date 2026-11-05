// End-to-end (inside the app, from the smoke test): twelve chats at once through the real request
// pipeline with a fake Ollama on a random port, while the user navigates and creates a project.
// Run: PETYA_SMOKE_TEST=1 PETYA_E2E_PARALLEL=1 npm start
const http=require('node:http');
module.exports=async win=>{
 let active=0,peak=0;
 const server=http.createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',async()=>{
  if(q.url!=='/api/chat'){s.end(JSON.stringify({models:[]}));return;}
  const body=JSON.parse(b||'{}'),last=(body.messages||[]).at(-1)?.content||'';active++;peak=Math.max(peak,active);
  await new Promise(r=>setTimeout(r,600+Math.random()*900));active--;
  const content=body.format?JSON.stringify({understood:true,answer:'Ответ на: '+last}):'Ответ на: '+last;
  s.setHeader('content-type','application/x-ndjson');s.end(JSON.stringify({message:{role:'assistant',content},done:true,done_reason:'stop'})+'\n');});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const js=code=>win.webContents.executeJavaScript(code);
 const previous=await js(`window.petya.settings()`);
 try{
  await js(`window.petya.saveSettings({model:'fake:1b',ollamaUrl:'http://127.0.0.1:${server.address().port}/api/chat'})`);
  const asks=['Объясни, что такое API','Привет','Сколько будет 17*23?','Что такое Docker?','Расскажи про HTTP','Что такое DNS?','Как работает TCP?','Что такое JSON?','Объясни REST','Что такое Kafka?','Что такое Redis?','Что такое gRPC?'];
  const ids=await js(`(async()=>{const ids=[];for(const q of ${JSON.stringify(asks)}){await window.petya.dialogueSelect('');const r=await window.petya.chatJobStart('',(await window.petya.dialogueTopics()).activeProjectId,q);if(r.foreground)throw Error('Went to foreground: '+q);ids.push(r.topicId);}return ids;})()`);
  await js(`(async()=>{await window.petya.dialogueSelect(${JSON.stringify(ids[0])});await window.petya.chatProjectCreate('Параллельный E2E');await window.petya.dialogueSelect(${JSON.stringify(ids[5])});})()`);
  const selected=(await js(`window.petya.dialogueTopics()`)).activeId;
  let states;for(let i=0;i<160;i++){states=await js(`Promise.all(${JSON.stringify(ids)}.map(id=>window.petya.chatJobState(id)))`);if(states.every(s=>['done','attention'].includes(s?.job?.state)))break;await new Promise(r=>setTimeout(r,250));}
  states.forEach((s,i)=>{const m=s.messages;if(s.job.state!=='done'||m.length!==2||m[0].text!==asks[i]||m[1].role!=='assistant')throw Error('Chat «'+asks[i]+'»: '+s.job.state+' '+JSON.stringify(m.map(x=>x.text)));if(/^Ответ на:/.test(m[1].text)&&!m[1].text.includes(asks[i]))throw Error('Cross-talk in «'+asks[i]+'»: '+m[1].text);});
  if((await js(`window.petya.dialogueTopics()`)).activeId!==selected)throw Error('Background answers moved the selected chat.');
  // Chats run in parallel, but local generations are capped (model-context LIMIT) to keep Ollama's memory bounded.
  const cap=require('../src/model-context.cjs').LIMIT;if(peak<2||peak>cap)throw Error('Model calls: peak '+peak+', expected 2…'+cap+'.');
  console.log('Parallel chats E2E: 12 chats, peak '+peak+' concurrent model calls, navigation during answers passed');
 }finally{server.close();await js(`window.petya.saveSettings(${JSON.stringify({model:previous.model||'',ollamaUrl:previous.ollamaUrl||''})})`).catch(()=>{});}
};
