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
 const context={spokenStreamId:'',streamedVoice:{generationEnded(){},feed(){}},window:{petyaEvents:{onAnswerChunk:cb=>listener=cb},createAnswerPace:paint=>({update:text=>paint(text),stop(){},finish(){},shown:0})},document:{createElement:()=>({setAttribute(){},remove(){nodes=nodes.filter(n=>n!==this);}}),addEventListener:(_,cb)=>changed=cb},dialogueMessages:{append:n=>nodes.push(n)}};vm.runInNewContext(code,context);
 listener({id:'a',start:true});listener({id:'a',text:'<script>test</script>'});assert.equal(nodes[0].textContent,'<script>test</script>');changed();assert.equal(nodes.length,0);listener({id:'a',text:'late'});assert.equal(nodes.length,0);listener({id:'a',end:true});listener({id:'b',start:true});listener({id:'b',text:'ok'});assert.equal(nodes.length,1);listener({id:'a',end:true});assert.equal(nodes.length,1);listener({id:'b',end:true});assert.equal(nodes.length,0);
 // Real pacing module: gradual reveal, finish shows full text, stop halts painting.
 {const timers=[];let now=0;const paints=[];const pctx={performance:{now:()=>now},setTimeout:(f)=>{timers.push(f);return timers.length;},clearTimeout(){},document:{addEventListener(){}},window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/answer-pace.js'),'utf8'),pctx);assert.equal(typeof pctx.window.createAnswerPace,'function');
  const pace=pctx.window.createAnswerPace(t=>paints.push(t));pace.update('Привет, мир');assert(!paints.includes('Привет, мир'),'text is paced, not dumped at once');
  now+=150;timers.shift()?.();assert(paints.at(-1).length>0&&paints.at(-1).length<'Привет, мир'.length);
  pace.finish();assert.equal(paints.at(-1),'Привет, мир');const count=paints.length;timers.splice(0).forEach(f=>f());assert.equal(paints.length,count,'no painting after finish');}
 const main=fs.readFileSync(require.resolve('../src/main.cjs'),'utf8');assert(main.indexOf('const quick=dialogue.greeting(original)')<main.indexOf('const duplicateReply=await taskDuplicates.turn'));assert(main.includes('onAnswerChunk:require(\'./answer-stream.cjs\').report'));
 console.log('Fast greetings and streaming: zero model calls, pre-completion text, UTF-8, JSON escapes, no thinking leakage, interrupted streams, cleanup and stale-topic preview passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
