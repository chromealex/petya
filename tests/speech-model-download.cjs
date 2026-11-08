const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {SpeechModelDownload,MODEL}=require('../src/speech-model-download.cjs');
const body=Buffer.from('whisper small test model');
const model={name:'ggml-small.bin',url:'https://example.invalid/m',size:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')};
(async()=>{
 assert.equal(MODEL.name,'ggml-small.bin');assert.match(MODEL.sha256,/^[0-9a-f]{64}$/);assert(MODEL.url.startsWith('https://huggingface.co/'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-speech-'));
 try{
  // A corrupted download is rejected and leaves no file behind.
  const bad=new SpeechModelDownload({root,model,fetcher:async()=>new Response(Buffer.from('x'.repeat(body.length)))});
  await assert.rejects(bad.start(),/проверку/);assert(!bad.installed());assert.deepEqual(fs.readdirSync(path.join(root,'runtime/models')),[]);assert.equal(bad.statuses()[0].phase,'error');assert.equal(bad.statuses()[0].busy,false);
  // Too little disk space: nothing is fetched.
  let calls=0;const full=new SpeechModelDownload({root,model,freeSpace:()=>0,fetcher:async()=>{calls++;}});
  await assert.rejects(full.start(),/места/);assert.equal(calls,0);
  // A good download is verified, installed once and reported to the notification center.
  const events=[];calls=0;const good=new SpeechModelDownload({root,model,emit:s=>events.push(s.phase),fetcher:async()=>{calls++;return new Response(body);}});
  const first=good.start();assert.equal(good.start(),first);
  assert.equal(await first,path.join(root,'runtime/models/ggml-small.bin'));assert(good.installed());assert.equal(calls,1);
  assert.deepEqual([events[0],...events.slice(-2)],['downloading','verifying','done']);
  assert.equal(await good.start(),good.file);assert.equal(calls,1);
  assert.equal(good.statuses()[0].code,'speech-model');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 console.log('Speech model download passed');
})().catch(e=>{console.error(e);process.exit(1);});
