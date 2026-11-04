const http=require('node:http'),assert=require('node:assert/strict');
module.exports=async win=>{
 const requests=[];const server=http.createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{const body=JSON.parse(raw||'{}');requests.push({body,res});});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/chat';
 const js=code=>win.webContents.executeJavaScript('(async()=>('+code+'))()');const wait=async test=>{for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('Draft request did not arrive');};
 const original=await js('window.petya.settings()');
 try{
  await js(`window.petya.saveSettings({model:'draft-test',ollamaUrl:${JSON.stringify(url)},semanticTools:'false'})`);
  await js("window.petya.dialogueSelect('')");
  const before=await js('JSON.stringify(await window.petya.dialogueTopics())');
  await js("window.__draftChunks=0");await js("void window.petyaEvents.onAnswerChunk(()=>window.__draftChunks++)");await js("window.petya.prepareVoice('Объясни язык Java')");await wait(()=>requests.length===1);
  assert.equal(requests[0].body.stream,false,'draft must not stream to the UI');
  assert.equal(await js('JSON.stringify(await window.petya.dialogueTopics())'),before,'draft wrote chat history');
  await js("window.petya.prepareVoice('Объясни отличие Java от JavaScript')");await wait(()=>requests.length===2);
  assert.equal(await js('window.__draftChunks'),0,'draft became visible');
  requests[1].res.end(JSON.stringify({message:{content:JSON.stringify({understood:true,answer:'Это разные языки программирования.'})},done:true}));
  await new Promise(r=>setTimeout(r,30));assert.equal(await js('window.__draftChunks'),0);
  const result=await js("window.petya.converse('Объясни отличие Java от JavaScript')");
  assert.equal(result.text,'Это разные языки программирования.');assert.equal(requests.length,2,'final answer regenerated instead of using draft');
  await js("window.petya.prepareVoice('Объясни их различия подробнее')");await wait(()=>requests.length===3);
  assert(requests[2].body.messages.some(m=>m.role==='assistant'&&m.content==='Это разные языки программирования.'),'follow-up lost previous answer');
  requests[2].res.end(JSON.stringify({message:{content:JSON.stringify({understood:true,answer:'У Java и JavaScript разные системы типов и среды выполнения.'})},done:true}));
  const follow=await js("window.petya.converse('Объясни их различия подробнее')");assert.match(follow.text,/системы типов/);assert.equal(requests.length,3,'follow-up draft was not reused');
  await js('window.petya.prepareVoice(null)');
  console.log('Speculative answer UI: actual IPC, correction, no premature output/history and final reuse passed');
 }finally{await js(`window.petya.saveSettings(${JSON.stringify({model:original.model,ollamaUrl:original.ollamaUrl,semanticTools:original.semanticTools})})`);server.closeAllConnections();await new Promise(r=>server.close(r));}
};
