// The live meeting stream (src/meeting-stream.cjs, src/features/meeting-stream.cjs): the contract of
// docs/foundations/meeting-stream.md on its own, without any app. Partials before their final and nothing after it,
// repeated partials and repeated finals dropped, lag (no partials when behind, stale finals skipped, the lag event),
// subscribe/unsubscribe and per-subscriber backpressure, pause/resume, end; extension listeners only while added;
// the recorder's fragments with the «continues» hint; invalid declarations refused.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {MeetingStream}=require('../src/meeting-stream.cjs');
const registry=require('../src/features/meeting-stream.cjs');
const {MeetingRecording}=require('../src/meeting-recording.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
function clock(start=1_000_000){
 const c={t:start,timers:[],now:()=>c.t,setTimer:(fn,ms)=>{const t={fn,at:c.t+ms};c.timers.push(t);return t;},clearTimer:t=>{c.timers=c.timers.filter(x=>x!==t);},
  advance(ms){c.t+=ms;for(const t of c.timers.filter(x=>x.at<=c.t)){c.timers=c.timers.filter(x=>x!==t);t.fn();}}};
 return c;
}
// A handler that never settles would end the process silently: count that as a failure.
let finished=false;process.on('exit',()=>{if(!finished){console.error('Meeting stream test did not finish');process.exitCode=1;}});
const texts=events=>events.filter(e=>e.type==='transcript').map(e=>(e.final?'F:':'P:')+e.text);
(async()=>{
 // --- Partials, then the final of the same utterance; seq grows; event fields ---
 {
  const c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer});
  const all=[],finals=[];
  stream.subscribe(e=>{all.push(e);},{partials:true});
  stream.subscribe(e=>{finals.push(e);});
  assert.equal(stream.segment({meetingId:'m1',source:'Встреча',at:1,endedAt:2,text:'нет встречи'}),undefined,'no meeting → nothing');
  stream.start({meetingId:'m1',title:'Синк по релизу',app:'Видеозвонок',source:'video',attendees:['Олег','Маша','Олег','']});
  // A forced cut (8 s of speech): the utterance goes on → partial.
  c.t+=1000;stream.segment({meetingId:'m1',index:0,source:'Встреча',at:c.t-9000,endedAt:c.t-1000,overlap:false,text:'Давайте вернёмся к магазину',speaker:'Олег',pending:0});
  c.t+=8000;stream.segment({meetingId:'m1',index:1,source:'Встреча',at:c.t-9000,endedAt:c.t-1000,overlap:true,text:'и скидкам на выходные',pending:0,continues:false});
  // The microphone, a short phrase cut by a pause → final at once.
  stream.segment({meetingId:'m1',index:2,source:'Микрофон',at:c.t-3000,endedAt:c.t-500,overlap:false,text:'Согласен',pending:0});
  await stream.idle();
  assert.deepEqual(texts(all),['P:Давайте вернёмся к магазину','F:Давайте вернёмся к магазину и скидкам на выходные','F:Согласен']);
  assert.deepEqual(texts(finals),['F:Давайте вернёмся к магазину и скидкам на выходные','F:Согласен'],'partials only for those who ask');
  const started=all[0];assert.equal(started.type,'started');assert.equal(started.meetingId,'m1');
  assert.deepEqual(started.context.attendees,['Олег','Маша'],'attendees cleaned and de-duplicated');assert.equal(started.context.title,'Синк по релизу');
  const final=all.find(e=>e.final&&e.source==='sound');
  assert.equal(final.speaker,'Олег');assert.equal(final.utterance,all.find(e=>e.type==='transcript'&&!e.final).utterance,'partial and final share the utterance');
  assert.equal(all.find(e=>e.source==='mic').source,'mic');assert.ok(Object.isFrozen(final),'events are frozen');
  for(let i=1;i<all.length;i++)assert.ok(all[i].seq>all[i-1].seq,'seq grows');
  assert.deepEqual(stream.recent().map(e=>e.text),['Давайте вернёмся к магазину и скидкам на выходные','Согласен']);
  // A context update from the calendar.
  stream.annotate('m1',{title:'Релиз 1.4',attendees:['Ира']});stream.annotate('other',{title:'x'});await stream.idle();
  assert.equal(all.at(-1).type,'context');assert.deepEqual(all.at(-1).context.attendees,['Олег','Маша','Ира']);assert.equal(stream.meeting().title,'Релиз 1.4');
  // Unknown continuation: a long fragment is taken as unfinished; the hold timer finishes it if nothing follows.
  stream.segment({meetingId:'m1',index:3,source:'Встреча',at:c.t,endedAt:c.t+8000,overlap:false,text:'Ещё про баннеры',pending:0});c.t+=8000;
  c.advance(12001);await stream.idle();
  assert.deepEqual(texts(all).slice(-2),['P:Ещё про баннеры','F:Ещё про баннеры'],'no continuation in time → final');
  // An empty recognition that ends the utterance finishes it.
  stream.segment({meetingId:'m1',index:4,source:'Встреча',at:c.t,endedAt:c.t+8000,overlap:false,text:'Последнее',pending:0,continues:true});
  stream.segment({meetingId:'m1',index:5,source:'Встреча',at:c.t+8000,endedAt:c.t+9000,overlap:true,text:'',pending:0,continues:false});
  c.t+=9000;await stream.idle();assert.deepEqual(texts(all).slice(-2),['P:Последнее','F:Последнее']);
  // End: an open utterance is finished first, then «ended»; the in-memory buffer is wiped.
  stream.segment({meetingId:'m1',index:6,source:'Микрофон',at:c.t,endedAt:c.t+8000,overlap:false,text:'Тогда до пятницы',pending:0,continues:true});c.t+=8000;
  stream.end('m1',{pending:2});await stream.idle();
  assert.deepEqual(all.slice(-3).map(e=>e.type+(e.final?':F':'')),['transcript','transcript:F','ended']);
  assert.equal(all.at(-1).pending,2);assert.equal(stream.status().active,false);assert.deepEqual(stream.recent(),[]);assert.equal(c.timers.length,0,'no timer left');
 }

 // --- Dedupe: repeated partials, partials after a final, a repeated final ---
 {
  const c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer}),got=[];
  stream.subscribe(e=>{got.push(e);},{partials:true,lifecycle:false});
  stream.start({meetingId:'m2'});
  const t={meetingId:'m2',utterance:'u1',source:'sound',start:c.t-2000,end:c.t-100};
  stream.transcript({...t,text:'Решили'});stream.transcript({...t,text:'Решили'});stream.transcript({...t,text:'Решили перенести'});
  stream.transcript({...t,text:'Решили перенести релиз',final:true});
  stream.transcript({...t,text:'Решили перенести релиз на вторник'});stream.transcript({...t,text:'x',final:true});
  assert.equal(stream.transcript({...t,utterance:'',text:'без id'}),null);assert.equal(stream.transcript({...t,source:'video',utterance:'u9',text:'?'}),null,'unknown source refused');
  // The recogniser repeating itself across the overlap: the same words again at once are one utterance.
  stream.segment({meetingId:'m2',index:7,source:'Микрофон',at:c.t-2000,endedAt:c.t-1000,text:'Да, так и сделаем.',pending:0});
  stream.segment({meetingId:'m2',index:8,source:'Микрофон',at:c.t-900,endedAt:c.t-100,text:'да так и сделаем',pending:0});
  await stream.idle();
  // Published faster than delivered: «Решили» was replaced by «Решили перенести» while waiting.
  assert.deepEqual(texts(got),['P:Решили перенести','F:Решили перенести релиз','F:Да, так и сделаем.']);
  assert.equal(stream.seq,4+1,'«started», two partials (the repeat dropped), two finals');
  assert.equal(stream.status().skipped.duplicates,1);
  assert.ok(got.every(e=>e.type==='transcript'),'lifecycle:false → transcripts only');
 }

 // --- Lag: behind → no partials, the lag event both ways, stale finals skipped ---
 {
  const c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer}),got=[];
  stream.subscribe(e=>{got.push(e);},{partials:true});
  stream.start({meetingId:'m3'});
  // 20 s behind the speech: the partial is skipped, the final still comes with its lag.
  stream.segment({meetingId:'m3',index:0,source:'Встреча',at:c.t-28000,endedAt:c.t-20000,text:'Про релиз',pending:1,continues:true});
  stream.segment({meetingId:'m3',index:1,source:'Встреча',at:c.t-20000,endedAt:c.t-19000,overlap:true,text:'в пятницу',pending:0,continues:false});
  await stream.idle();
  const lag=got.find(e=>e.type==='lag');assert.equal(lag.behind,true);assert.ok(lag.lag>=19000);
  assert.deepEqual(texts(got),['F:Про релиз в пятницу']);assert.ok(got.find(e=>e.final).lag>=19000);
  assert.equal(stream.status().behind,true);assert.ok(stream.status().skipped.partials>=1);
  // A long backlog counts as behind too, even with fresh audio.
  stream.segment({meetingId:'m3',index:2,source:'Микрофон',at:c.t-1000,endedAt:c.t-500,text:'ок',pending:5});
  assert.equal(stream.status().behind,true);
  // Caught up: the lag event says so.
  stream.segment({meetingId:'m3',index:3,source:'Микрофон',at:c.t-1000,endedAt:c.t-200,text:'поехали',pending:0});await stream.idle();
  assert.deepEqual(got.filter(e=>e.type==='lag').map(e=>e.behind),[true,false]);
  // Older than 90 s: useless live, skipped (meeting memory still has it).
  stream.segment({meetingId:'m3',index:4,source:'Микрофон',at:c.t-100000,endedAt:c.t-95000,text:'давнее',pending:0});await stream.idle();
  assert.ok(!texts(got).includes('F:давнее'));assert.equal(stream.status().skipped.finals,1);
 }

 // --- Subscribers: unsubscribe, slow handlers, failing handlers, bounded queue ---
 {
  const c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer,queue:3}),fast=[],slow=[];let release;
  const off=stream.subscribe(e=>{fast.push(e);},{partials:true});
  stream.subscribe(async e=>{slow.push(e);if(e.type==="started"&&!release)await new Promise(r=>{release=r;});},{partials:true});
  stream.subscribe(()=>{throw Error('listener bug');},{partials:true});
  stream.start({meetingId:'m4'});
  for(let i=0;i<3;i++){stream.transcript({meetingId:'m4',utterance:'u',source:'mic',start:c.t-1000,end:c.t,text:'слово '+i});await tick();}
  assert.equal(fast.filter(e=>e.type==='transcript').length,3,'a quick subscriber gets every partial');
  assert.equal(slow.length,1,'the slow one is still busy with «started»');
  stream.transcript({meetingId:'m4',utterance:'u',source:'mic',start:c.t-1000,end:c.t,text:'слово 3',final:true});
  for(let i=0;i<5;i++)stream.segment({meetingId:'m4',index:10+i,source:'Встреча',at:c.t-1000,endedAt:c.t,text:'фраза '+i,pending:0});
  release();await stream.idle();
  assert.deepEqual(texts(slow),['F:фраза 2','F:фраза 3','F:фраза 4'],'busy → waiting partials coalesced, its queue bounded to the newest');
  assert.ok(stream.status().skipped.dropped>=3);
  off();off();
  stream.segment({meetingId:'m4',index:20,source:'Встреча',at:c.t-1000,endedAt:c.t,text:'после отписки',pending:0});await stream.idle();
  assert.ok(!texts(fast).includes('F:после отписки'),'unsubscribed → nothing more');
  assert.equal(stream.status().subscribers,2);
  assert.throws(()=>stream.subscribe(null),/handler/);
  // A second meeting replaces the first: «ended» for the old one, then «started».
  const order=[];stream.subscribe(e=>{order.push(e.type+':'+e.meetingId);});
  stream.start({meetingId:'m5'});await stream.idle();assert.deepEqual(order,['ended:m4','started:m5']);
  stream.start({meetingId:'m5'});await stream.idle();assert.equal(order.length,2,'the same meeting twice → one start');
 }

 // --- Pause and resume: nothing delivered while paused, the open utterance dropped ---
 {
  const c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer}),got=[];
  stream.subscribe(e=>{got.push(e);},{partials:true});
  stream.start({meetingId:'m6'});
  stream.segment({meetingId:'m6',index:0,source:'Встреча',at:c.t-8000,endedAt:c.t,text:'начало',pending:0,continues:true});
  stream.pause();stream.pause();
  stream.segment({meetingId:'m6',index:1,source:'Встреча',at:c.t,endedAt:c.t+1000,overlap:true,text:'секрет',pending:0});
  stream.resume();
  stream.segment({meetingId:'m6',index:2,source:'Встреча',at:c.t,endedAt:c.t+1000,text:'снова',pending:0});
  stream.end('m6');await stream.idle();
  assert.deepEqual(got.map(e=>e.type==='transcript'?(e.final?'F:':'P:')+e.text:e.type),['started','P:начало','paused','resumed','F:снова','ended']);
  assert.equal(stream.pause(),null,'no meeting → no pause');
 }

 // --- Extension listeners: declared in `provides`, only while the extension is added ---
 {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-listeners-'));
  try{
   const box=path.join(dir,'box');fs.mkdirSync(box);
   fs.writeFileSync(path.join(box,'extension.json'),JSON.stringify({id:'box',name:'Ящик',setting:'extension_box',provides:{'meeting-listener':'listener.cjs'}}));
   fs.writeFileSync(path.join(box,'listener.cjs'),'const seen=[];module.exports={partials:false,seen,onEvent(e,ctx){seen.push([e.type,e.final,e.replay||false,ctx.meeting()?.meetingId||"",typeof ctx.status().lag,Object.keys(ctx).sort().join()]);}};');
   const listeners=registry.load(dir);
   assert.deepEqual(listeners.map(x=>[x.id,x.extension,x.setting]),[['box','box','extension_box']]);
   const settings={},c=clock(),stream=new MeetingStream({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer});
   const {api}=registry.create({settings},{listeners,stream});
   const seen=listeners[0].listener.seen;
   stream.start({meetingId:'m7'});
   stream.segment({meetingId:'m7',index:0,source:'Встреча',at:c.t-2000,endedAt:c.t,text:'не добавлен',pending:0});await stream.idle();
   assert.deepEqual(seen,[],'not added → no events');assert.deepEqual(api.listeners(),[]);
   settings.extension_box='true';
   stream.segment({meetingId:'m7',index:1,source:'Встреча',at:c.t-8000,endedAt:c.t,text:'добавлен',pending:0,continues:true});
   stream.segment({meetingId:'m7',index:2,source:'Встреча',at:c.t,endedAt:c.t+500,overlap:true,text:'посреди встречи',pending:0,continues:false});
   await stream.idle();
   assert.deepEqual(seen.map(x=>x.slice(0,4)),[['started',undefined,true,'m7'],['transcript',true,false,'m7']],'added mid-meeting → replayed start, then finals only (partials:false)');
   assert.equal(seen[0][5],'meeting,recent,status','the context is read-only views, no services');
   settings.extension_box='false';
   stream.end('m7');await stream.idle();assert.equal(seen.length,2,'removed → no «ended» either');
   assert.deepEqual(api.listeners(),[]);settings.extension_box='true';assert.deepEqual(api.listeners(),[{id:'box',extension:'box',name:'Ящик'}]);
   // The public API is read-only for features: subscribe gets events, producers are not on it.
   assert.ok(Object.isFrozen(api));assert.equal(api.segment,undefined);assert.equal(api.start,undefined);
   const via=[];const off=api.subscribe(e=>{via.push(e.type);});stream.start({meetingId:'m8'});await stream.idle();off();assert.deepEqual(via,['started']);
   // Invalid declarations are refused.
   fs.writeFileSync(path.join(box,'listener.cjs'),'module.exports={partials:"yes",onEvent(){}};');delete require.cache[path.join(box,'listener.cjs')];
   assert.throws(()=>registry.load(dir),/Invalid meeting listener box\/listener\.cjs/);
   fs.writeFileSync(path.join(box,'extension.json'),JSON.stringify({id:'box',name:'Ящик',setting:'extension_box',provides:{'meeting-listener':'../evil.cjs'}}));
   assert.throws(()=>registry.load(dir),/Invalid capability provider/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  assert.ok(require('../src/features/app-links.cjs').REGISTRIES.includes('meeting-listener'));
 }

 // --- The recorder feeds the stream: fragments recognised while recording, with the «continues» hint ---
 {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'petya-stream-rec-'));
  try{
   const seen=[];let n=0;const words=['Обсудим магазин','и скидки','Да'];
   const rec=new MeetingRecording({directory,encrypt:s=>Buffer.from(s),decrypt:b=>Buffer.from(b).toString(),transcribe:async()=>words[n++]||'',save:()=>{},observe:x=>seen.push(x)});
   const id=rec.begin({title:'Синк'}),wav=()=>new ArrayBuffer(100);
   rec.append(id,'Встреча',{wav:wav(),at:1000,endedAt:9000});rec.append(id,'Встреча',{wav:wav(),at:8600,endedAt:10000,overlap:true});rec.append(id,'Микрофон',{wav:wav(),at:10000,endedAt:11000});
   while(rec.running.size)await tick();
   assert.deepEqual(seen.map(x=>[x.id===id,x.index,x.source,x.text,x.overlap,x.continues]),[[true,0,'Встреча','Обсудим магазин',false,true],[true,1,'Встреча','и скидки',true,undefined],[true,2,'Микрофон','Да',false,undefined]]);
   rec.append(id,'Встреча',{wav:wav(),at:12000,endedAt:13000});rec.finish(id);
   while(rec.running.size)await tick();
   assert.equal(seen.length,3,'recognised after the stop → not live');
   const stream=new MeetingStream({now:()=>14000}),got=[];stream.subscribe(e=>{got.push(e);},{partials:true});stream.start({meetingId:id});
   for(const x of seen)stream.segment({...x,meetingId:x.id});stream.end(id);await stream.idle();
   assert.deepEqual(texts(got),['P:Обсудим магазин','F:Обсудим магазин и скидки','F:Да']);
   // An observer that throws never breaks the recording.
   const bad=new MeetingRecording({directory,encrypt:s=>Buffer.from(s),decrypt:b=>Buffer.from(b).toString(),transcribe:async()=>'текст',save:()=>{},observe:()=>{throw Error('bug');}});
   const b=bad.begin();bad.append(b,'Встреча',{wav:wav(),at:1,endedAt:2});while(bad.running.size)await tick();assert.equal(bad.state(b).completed,1);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
 finished=true;
 console.log('Meeting stream: partials before their final, dedupe, lag skipping and the lag event, subscribe/unsubscribe and backpressure, pause/resume/end, extension listeners only while added, recorder fragments passed');
})().catch(e=>{console.error(e);process.exit(1);});
