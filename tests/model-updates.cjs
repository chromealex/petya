const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {ModelUpdates,registryPath}=require('../src/model-updates.cjs');
(async()=>{
 const manifest=JSON.stringify({schemaVersion:2,layers:[{size:7000000000}]}),digest=createHash('sha256').update(manifest).digest('hex');let local=digest,requests=0,started;
 const settings={model:'qwen3.5:9b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},ready={state:{busy:false},start:async(...args)=>{started=args;return {ready:true};}};
 const updates=new ModelUpdates({settings:()=>settings,ready,fetcher:async url=>{requests++;return new URL(url).pathname==='/api/tags'?new Response(JSON.stringify({models:[{name:settings.model,digest:local}]})):new Response(manifest);}});
 assert.equal((await updates.check()).items.length,0);const calls=requests;await updates.check();assert.equal(requests,calls);local='older';const state=await updates.check(true);assert.equal(state.items[0].kind,'update');assert.equal(state.items[0].size,7000000000);await updates.install(settings.model);assert.deepEqual(started,[settings.model,{forcePull:true}]);await assert.rejects(()=>updates.install('arbitrary:tag'));
 settings.model='qwen3:4b';assert((await updates.check()).items.some(i=>i.model==='qwen3.5:9b'&&i.kind==='install'));
 assert.throws(()=>registryPath('https://untrusted.example/model'));assert.throws(()=>registryPath('../secret'));
 const offline=new ModelUpdates({settings:()=>settings,ready,fetcher:async()=>{throw Error('offline');}});assert.equal((await offline.check()).error,'offline');assert.equal((await offline.check()).items.length,0);
 console.log('Model updates: manifest comparison, cache, new model, explicit force pull, offline and registry boundary passed');
})().catch(e=>{console.error(e);process.exit(1)});
