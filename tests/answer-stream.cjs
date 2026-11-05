const assert=require('node:assert/strict');
const {preview,consume,run,report}=require('../src/answer-stream.cjs');
const {Dialogue}=require('../src/dialogue.cjs');
(async()=>{
 const {dialogueRequest}=require('../src/dialogue-request.cjs');const base={model:'qwen3:4b',topic:{title:'Test',messages:[]},company:'Test'};
 assert.equal(dialogueRequest({...base,command:'Что такое API?'}).think,false);assert.equal(dialogueRequest({...base,command:'Докажи теорему пошагово'}).think,true);assert.equal(dialogueRequest({...base,command:'Статус проекта',reasoning:true}).think,true);
 let external=0;const d=new Dialogue({routeTopic:async()=>{external++;},answer:async()=>{external++;}});
 for(const q of ['Как дела?','Привет!','Петя, как у тебя дела?']){assert(d.greeting(q)?.handled);assert.equal(d.active().messages.at(-2).text,q);}
 assert.equal(external,0);for(const q of ['Как дела у проекта AA?','Привет, проверь Jira','Переведи «Как дела?»','Как дела? И кто занят?'])assert.equal(d.greeting(q),null);
 d.active().pending={options:[]};assert.equal(d.greeting('Привет'),null);delete d.active().pending;
 const payload=JSON.stringify({understood:true,answer:'Привет!\nКавычки: "да" 😀'});
 assert.equal(preview(payload),'Привет!\nКавычки: "да" 😀');assert.equal(preview('{"understood":false,"answer":"secret"}'),'');assert.equal(preview('{"answer":"secret","understood":true}'),'');
 assert.equal(preview('{"understood":true,"answer":"\\u041'),'');assert.equal(preview('{"understood":true,"answer":"\\u041f\\uD83D'),'П');
 const encode=new TextEncoder();let controller,seen=[];const stream=new ReadableStream({start(c){controller=c;}});const consuming=consume({body:stream},text=>seen.push(text));
 const packet=x=>encode.encode(JSON.stringify(x)+'\n');
 controller.enqueue(packet({message:{thinking:'PRIVATE',content:'{"understood":true,"answer":"Привет'}}));
 for(let i=0;i<10&&!seen.some(Boolean);i++)await Promise.resolve();assert(seen.includes('Привет'),'text visible before terminal packet');assert(!seen.join('').includes('PRIVATE'));
 controller.enqueue(packet({message:{content:'!"}'},done:true}));controller.close();assert.equal((await consuming).message.content,'{"understood":true,"answer":"Привет!"}');assert.equal(seen.at(-1),'Привет!');
 const wire=packet({message:{content:payload},done:true});const split=new ReadableStream({start(c){for(const byte of wire)c.enqueue(Uint8Array.of(byte));c.close();}});assert.equal((await consume({body:split},()=>{})).message.content,payload);
 for(const data of [packet({message:{content:'{"understood":true,"answer":"partial'}}),encode.encode('invalid\n'),packet({error:'outage'})]){const values=[];await assert.rejects(()=>consume({body:new ReadableStream({start(c){c.enqueue(data);c.close();}})},t=>values.push(t)));assert.equal(values.at(-1),'');}
 const events=[];await assert.rejects(()=>run(e=>events.push(e),async()=>{report('x');throw Error('fail');}));assert(events[0].start);assert(events.at(-1).end);assert.equal(new Set(events.map(e=>e.id)).size,1);
 // Exercise the exact renderer listener: safe text, cancellation, final cleanup.
 const fs=require('node:fs'),vm=require('node:vm');const ui=fs.readFileSync(require.resolve('../src/ui/dialogue.js'),'utf8');const code=ui.slice(ui.indexOf('let answerPreview='),ui.indexOf('let speechEpoch='));let listener,changed,nodes=[];
 const context={spokenStreamId:'',streamedVoice:{generationEnded(){},feed(){}},window:{renderMessage:({text})=>({querySelector:()=>({textContent:text})}),petyaEvents:{onAnswerChunk:cb=>listener=cb},createAnswerPace:paint=>({update:text=>paint(text),stop(){},finish(){},shown:0})},document:{createElement:()=>({dataset:{},setAttribute(){},replaceChildren(n){this.textContent=n.textContent;},remove(){this.isConnected=false;nodes=nodes.filter(n=>n!==this);}}),addEventListener:(_,cb)=>changed=cb},dialogueMessages:{append:n=>{n.isConnected=true;nodes.push(n);}}};vm.runInNewContext(code,context);
 listener({id:'a',start:true});listener({id:'a',text:'<script>test</script>'});assert.equal(nodes[0].textContent,'<script>test</script>');changed({detail:{}});assert.equal(nodes.length,0);listener({id:'a',text:'late'});assert.equal(nodes.length,0);listener({id:'a',end:true});listener({id:'b',start:true});listener({id:'b',text:'ok'});assert.equal(nodes.length,1);listener({id:'a',end:true});assert.equal(nodes.length,1);listener({id:'b',end:true});assert.equal(nodes.length,1,'preview remains until final message arrives');changed({detail:{}});assert.equal(nodes.length,0);
 const main=fs.readFileSync(require.resolve('../src/main.cjs'),'utf8'),pipeline=fs.readFileSync(require.resolve('../src/converse.cjs'),'utf8');assert(pipeline.indexOf('const quick=ctx.dialogue.greeting(original)')>0&&pipeline.indexOf('const quick=ctx.dialogue.greeting(original)')<pipeline.indexOf('const duplicateReply=await ctx.taskDuplicates.turn'));assert(main.includes('onAnswerChunk:require(\'./answer-stream.cjs\').report'));
 console.log('Fast greetings and streaming: zero model calls, pre-completion text, UTF-8, JSON escapes, no thinking leakage, interrupted streams, cleanup and stale-topic preview passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
