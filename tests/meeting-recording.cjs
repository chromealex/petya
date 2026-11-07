const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {MeetingRecording}=require('../src/meeting-recording.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'petya-meeting-test-'));
 try{
  let calls=0,fail=false;const saved=new Map(),events=[];
  const deps={directory,encrypt:s=>Buffer.from(s).reverse(),decrypt:b=>Buffer.from(b).reverse().toString(),transcribe:async()=>{calls++;if(fail)throw Error('offline');return 'Обсудили релиз';},save:item=>saved.set(item.id,item),emit:s=>events.push(s)};
  const recorder=new MeetingRecording(deps),id=recorder.begin();
  for(let i=0;i<40;i++)recorder.append(id,i%2?'Микрофон':'Zoom',{wav:new ArrayBuffer(100),at:Date.now(),endedAt:Date.now()});
  // Recognition runs in the background while the meeting goes on; the session stays «recording» until it ends.
  while(recorder.running.size)await new Promise(r=>setImmediate(r));
  assert.equal(calls,40,'fragments are recognised during the meeting');assert.equal(recorder.state(id).phase,'recording');
  const live=recorder.status().find(x=>x.id===id);assert.equal(live.bytes,4000);assert.equal(live.completed,40);assert.match(live.message,/расшифровано 40 из 40/);
  recorder.finish(id);recorder.finish(id);
  while(recorder.running.size)await new Promise(r=>setImmediate(r));
  assert.equal(calls,40);assert.equal(saved.size,40);assert.equal(recorder.state(id).phase,'done');
  assert.equal(fs.readdirSync(directory).filter(n=>n.endsWith('.audio')).length,0);
  assert(saved.values().every(x=>!x.chatId&&!x.projectId&&x.sessionId===id));
  const bad=recorder.begin();fail=true;recorder.append(bad,'Zoom',{wav:new ArrayBuffer(100),at:1,endedAt:2});
  while(recorder.running.size)await new Promise(r=>setImmediate(r));assert.equal(recorder.state(bad).phase,'recording','a failed recognition keeps recording');recorder.append(bad,'Zoom',{wav:new ArrayBuffer(100),at:2,endedAt:3});
  while(recorder.running.size)await new Promise(r=>setImmediate(r));recorder.finish(bad);
  while(recorder.running.size)await new Promise(r=>setImmediate(r));
  assert.equal(recorder.state(bad).phase,'error');assert(fs.readdirSync(directory).some(n=>n.endsWith('.audio')));
  // A fragment arriving while the previous one is recognised is picked up, and the finish completes it.
  let release;const slow=new MeetingRecording({...deps,transcribe:()=>new Promise(r=>release=r)}),late=slow.begin();
  slow.append(late,'Zoom',{wav:new ArrayBuffer(100),at:1,endedAt:2});slow.append(late,'Zoom',{wav:new ArrayBuffer(100),at:3,endedAt:4});slow.finish(late);
  for(let i=0;i<2;i++){while(!release)await new Promise(r=>setImmediate(r));const r=release;release=null;r('часть');}
  while(slow.running.size)await new Promise(r=>setImmediate(r));assert.equal(slow.state(late).phase,'done');
  slow.remove(late);assert.throws(()=>slow.state(late));assert.ok(!fs.readdirSync(directory).some(n=>n.startsWith(late)));
  fail=false;const restored=new MeetingRecording(deps);restored.retry(bad);
  while(restored.running.size)await new Promise(r=>setImmediate(r));
  assert.equal(restored.state(bad).phase,'done');assert.equal(saved.size,44);
  const sandbox={setTimeout,clearTimeout,Date,window:{petya:{transcribe:()=>{throw Error('Meeting must not invoke live ASR');}}}};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/ui/audio.js','utf8')+'\nthis.Listener=AudioListener;',sandbox);
  let appended=0;const listener=new sandbox.Listener(()=>assert.fail('No command dispatch'),e=>{throw e;},{recordSegment:async()=>{appended++;return null;}});
  listener.active=true;listener.queue=Array.from({length:40},()=>({wav:new ArrayBuffer(100),at:1,endedAt:2}));await listener.drain(0);assert.equal(appended,40);
  const feature=require('../src/features/meeting-memory.cjs');assert.equal(feature.defaults.zoomAutoRecord,'false','meetings are recorded only after the user turns it on');
  // An update never switches recording on; the old one-off migration that did is reverted once, later choices persist.
  for(const [before,expected] of [[{zoomMemoryMigration:'1',zoomAutoRecord:'true'},{zoomAutoRecord:'false',zoomMemoryMigration:'2'}],[{zoomMemoryMigration:'0',zoomAutoRecord:'false'},{zoomMemoryMigration:'2'}],[{zoomMemoryMigration:'2',zoomAutoRecord:'true'},null]]){
   const saved=[];const src=require('fs').readFileSync(require.resolve('../src/features/meeting-memory.cjs'),'utf8');const block=src.slice(src.indexOf('if(s.settings.zoomMemoryMigration'),src.indexOf("\n  const {safeStorage"));
   new Function('s',block)({settings:before,saveSettings:p=>saved.push(p)});assert.deepEqual(saved[0]||null,expected);}
  assert.equal(feature.read({prune:()=>[...saved.values()]},{sessionId:id}).total,40);
  console.log('Meeting recording: background ASR during the meeting, 40 segments, both sources, duplicate finish, encrypted spool cleanup, restart/retry, shared memory and no VoiceTurn passed');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
