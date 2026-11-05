const assert=require('node:assert/strict');const feature=require('../src/features/optional-models.cjs');
(async()=>{
 const calls=[];let tags=['qwen3.5:9b'];
 global.fetch=async(url,o={})=>{calls.push([String(url).replace(/^.*11434/,''),o.method||'GET',o.body]);if(String(url).endsWith('/api/tags'))return {ok:true,status:200,json:async()=>({models:tags.map(name=>({name}))})};if(String(url).endsWith('/api/delete')){tags=tags.filter(t=>t!==JSON.parse(o.body).model);return {ok:true,status:200,json:async()=>({})};}throw Error('unexpected '+url);};
 const sent=[];let started=null;
 class FakeReady{constructor(o){this.o=o;this.state={phase:'idle',busy:false};}start(model){started={model,settings:this.o.settings()};this.state={phase:'pull',busy:true};this.o.emit(this.state);this.o.save({model});}cancel(){this.state={phase:'cancelled',busy:false};}}
 const saved=[];
 const s={settings:{model:'qwen3.5:9b',ollamaUrl:'http://127.0.0.1:11434'},ollamaReady:{state:{busy:false}},ollamaInstaller:{},OllamaReady:FakeReady,win:{isDestroyed:()=>false,webContents:{send:(ch,st)=>sent.push([ch,st])}},saveSettings:p=>saved.push(p)};
 const {ipc}=feature.setup(s);
 let r=await ipc.list();assert.deepEqual(r.models.map(m=>[m.name,m.installed]),[['gemma3:4b',false],['qwen2.5-coder:7b',false],['qwen3:4b',false]]);
 const d=ipc.download('qwen2.5-coder:7b');assert.equal(d.model,'qwen2.5-coder:7b');assert.equal(started.settings.model,'qwen2.5-coder:7b');
 assert.equal(saved.length,0,'an optional download never changes the default model');
 assert.equal(sent[0][0],'ollama-install-progress');assert.equal(sent[0][1].optional,true);assert.equal(sent[0][1].model,'qwen2.5-coder:7b');
 assert.throws(()=>ipc.download('gemma3:4b'),/Уже идёт/);assert.throws(()=>ipc.download('llama3:70b'),/не входит/);
 ipc.cancel();
 tags.push('gemma3:4b');r=await ipc.remove('gemma3:4b');assert(!r.models.find(m=>m.name==='gemma3:4b').installed);
 await assert.rejects(()=>ipc.remove('qwen3.5:9b'),/дополнительные/);s.settings.model='qwen3:4b';await assert.rejects(()=>ipc.remove('qwen3:4b'),/по умолчанию/);
 console.log('Optional models: catalog with install state, download without changing the default model, progress to notifications, one at a time, removal of catalog models only passed');
})().catch(e=>{console.error(e);process.exit(1);});
