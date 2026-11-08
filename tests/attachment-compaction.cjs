// Attachments of any size: the whole text is kept, and a question about a file longer than the model
// window is answered from excerpts compacted for it, with the file's real line numbers.
const assert=require('node:assert/strict');
const compactor=require('../src/context-compactor.cjs');
const {Attachments}=require('../src/attachments.cjs');
const {answerAttachments}=require('../src/attachment-assistant.cjs');
(async()=>{
 // 150 000 characters of log with one real failure deep inside.
 const lines=Array.from({length:6000},(_,i)=>'2026-11-08 10:'+String(i%60).padStart(2,'0')+' INFO request '+i+' served in 12 ms');
 lines[4711]='2026-11-08 11:11 ERROR PaymentService: NullReferenceException at Shop.cs:42';
 const text=lines.join('\n');
 const store=new Attachments({scope:()=>'chat'});
 const info=await store.add('server.log',Buffer.from(text));
 const [file]=store.take([info.id]);
 assert.equal(file.text.length,text.length,'the attachment keeps its whole text');
 assert.equal(file.note,'Текст прочитан полностью.');
 // Several large files can be taken together now; the window is handled when answering.
 const more=await Promise.all([1,2].map(async i=>{const s=new Attachments({scope:()=>'chat'});return s.take([(await s.add('part'+i+'.txt',Buffer.from('строка\n'.repeat(20000)))).id])[0];}));
 assert(more.every(f=>f.text.length===140000));
 // The model: compaction requests return the lines that matter with their numbers; the final answer
 // checks it got the failure and that the request fits the window.
 const seen={compactions:0,final:null};
 const request=async(url,o={})=>{
  const route=new URL(url).pathname;
  if(route==='/api/tags')return {models:[{name:'qwen3:8b',size:1}]};
  if(route==='/api/show')return {capabilities:['completion']};
  const body=JSON.parse(o.body);
  if(body.format?.properties?.summary){seen.compactions++;const piece=JSON.parse(body.messages[1].content).text;
   return {message:{content:JSON.stringify({summary:piece.split('\n').filter(l=>/ERROR/.test(l)).join('\n')||'Строки INFO без ошибок.'})}};}
  seen.final=body;
  return {message:{content:JSON.stringify({answer:'Падение: NullReferenceException в PaymentService.',sourceLines:[{file:'server.log',line:4712}]})}};
 };
 const topic={id:'t',attachments:[file],messages:[]};
 const answer=await answerAttachments({settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},request,topic,question:'Почему упал сервер?'});
 assert(seen.compactions>1,'a long file is compacted in pieces');
 const sent=seen.final.messages.reduce((n,m)=>n+compactor.tokens(typeof m.content==='string'?m.content:''),0);
 assert(sent<=compactor.WINDOW-4096,'the final request fits the window: '+sent);
 const input=JSON.parse(seen.final.messages[1].content);
 assert(input.files[0].numberedExcerpts.includes('4712: 2026-11-08 11:11 ERROR PaymentService'),'the failure deep in the file reaches the model with its real line number');
 assert(!input.files[0].numberedText,'the full text is not sent when it cannot fit');
 assert(/длиннее окна модели/.test(input.files[0].note));
 assert(answer.includes('Shop.cs:42'),'the cited line is copied from the original file');
 assert.equal(topic.attachments[0].text.length,text.length,'the attachment in the chat stays whole');
 // A small file is sent as before, without compaction.
 seen.compactions=0;const tiny={id:'s',attachments:[{name:'small.log',text:'ERROR one\nINFO two',note:'Текст прочитан полностью.'}],messages:[]};
 await answerAttachments({settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},request,topic:tiny,question:'Что в логе?'});
 assert.equal(seen.compactions,0);assert(JSON.parse(seen.final.messages[1].content).files[0].numberedText);
 console.log('Attachment compaction: whole texts kept, several large files, compacted excerpts with real line numbers, window fit and small files untouched OK');
})().catch(e=>{console.error(e);process.exit(1);});
