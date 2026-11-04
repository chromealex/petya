const assert = require('node:assert/strict');
const { OllamaReady, readProgress } = require('../src/ollama-ready.cjs');
const json = value => new Response(JSON.stringify(value));
(async () => {
 let config = { ollamaUrl: 'http://127.0.0.1:11434/api/chat', model: '' }, saves = 0, pulls = 0, installs = 0;
 const events = [];
 const options = { settings: () => config, save: s => { config = s; saves++; }, install: { start: async () => { installs++; return {phase:'done'}; }, cancel() {} }, emit: s => events.push(s), wait: async()=>{},
 fetcher: async (url, opts) => {
 const route = new URL(url).pathname;
 if (route === '/api/tags') return json({ models: [] });
 if (route === '/api/pull') { pulls++; return new Response('{"total":100,"completed":50}\n{"status":"success"}\n'); }
 if (route === '/api/chat') return json({ message: { content: 'Готов' } });
 throw new Error('Unexpected route');
 }};
 const ready = new OllamaReady(options); const a=ready.start();assert.equal(a,ready.start());assert.equal((await a).ready,true);
 assert.equal(config.model,'qwen3:4b');assert.equal(saves,1);assert.equal(installs,0);assert.equal(pulls,1);assert.ok(events.some(s=>s.received===50));
 config = { ...config, model: '' };
 const reuse = new OllamaReady({...options,fetcher:async(url,opts)=>{
 const route=new URL(url).pathname;
 if(route==='/api/tags')return json({models:[{name:'embed',size:1},{name:'local-chat',size:2}]});
 if(route==='/api/show')return json({capabilities:JSON.parse(opts.body).model==='embed'?['embedding']:['completion']});
 if(route==='/api/chat')return json({message:{content:'ok'}});
 throw new Error('Must not download');
 }});assert.equal((await reuse.start()).model,'local-chat');
 const before=saves;
 const broken = new OllamaReady({...options,fetcher:async url=>new URL(url).pathname==='/api/tags'?json({models:[]}):new Response('{"status":"pulling"}\n')});
 assert.equal((await broken.start()).phase,'error');assert.equal(saves,before);
 const failed = new OllamaReady({...options,fetcher:async url=>new URL(url).pathname==='/api/tags'?json({models:[{name:config.model}]}):json({message:{content:''}})});
 assert.equal((await failed.start()).phase,'error');assert.equal(saves,before);
 const decoderStream = new ReadableStream({ start(c) { const b=new TextEncoder().encode('{"status":"success"}');c.enqueue(b.slice(0,7));c.enqueue(b.slice(7));c.close(); }});
 await readProgress(decoderStream,()=>{});
 await assert.rejects(readProgress(new Response('{"error":"disk full"}\n').body,()=>{}),/disk full/);
 const old=config.model;
 const upgradeFailure=new OllamaReady({...options,fetcher:async url=>new URL(url).pathname==='/api/tags'?json({models:[]}):new Response('{"error":"download interrupted"}\n')});
 assert.equal((await upgradeFailure.start('qwen3.5:9b')).phase,'error');assert.equal(config.model,old);
 assert.equal((await new OllamaReady(options).start('qwen3.5:9b')).model,'qwen3.5:9b');assert.equal(config.model,'qwen3.5:9b');
 config={ollamaUrl:'https://example.com',model:''};assert.equal((await new OllamaReady(options).start()).phase,'error');
 console.log('Ollama ready: default download, reuse text model, skip embedding, single flight, probe before save, partial streams and local-only endpoint passed');
})().catch(e=>{console.error(e);process.exitCode=1});
