const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),fs=require('node:fs');
const {Interpretation,uncertain,promptFor}=require('../src/interpretation.cjs');
(async()=>{
 let calls=0,lastArgs,lastCwd,input='';
 const launch=(binary,args,options)=>{calls++;lastArgs=args;lastCwd=options.cwd;assert.equal(options.shell,false);const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{};c.stdin.on('data',d=>input+=d);c.stdin.on('finish',()=>{c.stdout.write(binary.includes('claude')?JSON.stringify({result:'Возможно, речь о релизе.'}):JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Возможно, речь о релизе.'}})+'\n');c.emit('close',0);});return c;};
 const one=new Interpretation({find:n=>n==='codex'?'/codex':'',launch});
 assert.match((await one.ask('что с рилизом','Проект Alpha')).text,/Ответ Codex/);assert.equal(calls,1);assert(input.includes('Проект Alpha'));assert(lastArgs.includes('read-only'));assert(lastArgs.includes('shell_tool'));assert(lastArgs.includes('--ignore-user-config'));assert(!fs.existsSync(lastCwd));
 const both=new Interpretation({find:n=>'/'+n,launch});const ask=await both.ask('рилиз','');assert.equal(ask.interpretChoices.length,2);assert.equal(calls,1);
 assert.match((await both.ask('рилиз','','claude')).text,/Ответ Claude/);assert.equal(lastArgs[lastArgs.indexOf('--tools')+1],'');assert(lastArgs.includes('--strict-mcp-config'));
 assert.match((await one.ask('рилиз','','claude')).text,/нужен установленный CLI/);assert.equal(calls,2,'explicit absent provider must not be replaced');
 assert.match((await one.ask('','')).text,/повторите/);assert.equal(calls,2);
 const low=new Interpretation({find:n=>'/'+n,launch,budget:()=>({state:'low'})});assert.match((await low.ask('рилиз','')).text,/Codex/);
 assert(uncertain('Не понял, что вы имеете в виду'));assert(!uncertain('Слово означает релиз'));
 assert(promptFor('x','z'.repeat(10000)).length<4000);
 const {Dialogue}=require('../src/dialogue.cjs');let fallbacks=0;
 const d=new Dialogue({routeTopic:async()=>({unclear:true}),answer:async(t,topic,unclear)=>{assert(unclear);fallbacks++;return {text:'Ответ Codex: уточните',interpretation:true};},readers:{}});
 assert((await d.turn('неясная фраза')).interpretation);assert.equal(fallbacks,1);assert.equal((await d.turn('создай задачу')).handled,false);assert.equal(fallbacks,1);
 console.log('Interpretation: provider routing, no-action arguments, context bounds, response, cleanup, unclear fallback passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
