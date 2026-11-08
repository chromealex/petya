// «Разбор плейтеста»: phrases and near-misses, not installed / no video / missing path, the event log (CSV with
// mm:ss, JSON with ISO times from the recording start), negative speech (verbatim quotes, swearing never quoted,
// Whisper's stock captions ignored), moment detection from evidence only (repeated deaths, same respawn after fail
// screens, idle runs, speech, taps on nothing, nearby evidence raising severity), and the whole background run with a
// stubbed sampler, vision model and transcription: batches, bounded concurrency, notifications, the card saved into
// the chat, no model, cancellation, attachment frames without a path, duplicate start, and «Открыть на этом месте».
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/playtest/feature.cjs');
const events=require('../src/extensions/playtest/events.cjs');
const speech=require('../src/extensions/playtest/speech.cjs');
const moments=require('../src/extensions/playtest/moments.cjs');
const vision=require('../src/extensions/playtest/vision.cjs');
const offer=require('../src/extensions/playtest/offer.cjs');
const downloads=require('../src/extensions/playtest/downloads.cjs');
const DIR=path.join(__dirname,'fixtures/playtest');
const TRANSCRIPT=fs.readFileSync(path.join(DIR,'transcript.txt'),'utf8');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-playtest-'));
const VIDEO=path.join(tmp,'session 3.mp4');fs.writeFileSync(VIDEO,'not really a video');

function services({installed=true,files=[],models=['qwen3.5:9b','gemma3:4b']}={}){
 const topic={id:'t',title:'Чат',messages:[],attachments:[]};
 const pending=new Map(files.map((f,i)=>[String(i),{id:String(i),...f}]));
 const sent=[];
 const s={settings:{...installed?{extension_playtest:'true'}:{},model:'qwen3.5:9b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},sent,
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(ch,item)=>sent.push([ch,item])}},
  optionalModels:{catalog:[{name:'gemma3:4b',vision:true}],installed:async()=>models,download:name=>({started:true,model:name})},
  dialogue:{state:{topics:[topic],projects:[],activeProjectId:'general'},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{list:()=>[...pending.values()].map(f=>({id:f.id,name:f.name})),pending,take:ids=>ids.map(id=>structuredClone(pending.get(id))),info:f=>({id:f.id,name:f.name}),remove:id=>pending.delete(id)}};
 return {s,topic};
}
// A stub sampler: 25 frames over 120 s; frames 6–9 (30–45 s) are the same picture (idle), fail screens at 30 and 75 s.
function sampler({hold=null}={}){
 const grabbed=[];
 return {grabbed,module:{times:d=>Array.from({length:25},(_,i)=>i*5),open:async(file,{signal})=>{
  assert.equal(file,VIDEO);
  return {duration:120,close(){},grab:async list=>{
   if(hold)await hold(signal);
   if(signal.aborted)throw Object.assign(Error('Разбор плейтеста отменён.'),{cancelled:true});
   grabbed.push(list.length);
   return list.map(at=>({at,image:'img'+at,thumb:'data:image/jpeg;base64,AAAA'+at,diff:at>=35&&at<=50?0.002:0.08,hash:at===35||at===80?'ffff0000ffff0000':'0123456789abcdef'}));
  }};
 }}};
}
const LABELS={30:{screen:'fail',text:'ВЫ ПОГИБЛИ',description:'Экран поражения с кнопкой «Ещё раз».',tapOnNothing:false,tapNote:''},
 75:{screen:'fail',text:'ВЫ ПОГИБЛИ',description:'Экран поражения.',tapOnNothing:false,tapNote:''},
 100:{screen:'menu',text:'Магазин',description:'Магазин, игрок жмёт на баннер.',tapOnNothing:true,tapNote:'Касание по картинке баннера, это не кнопка.'}};

(async()=>{
 // Phrases.
 for(const p of ['разбери плейтест','где игрок застрял','моменты фрустрации в этом видео','разбери плейтест "/tmp/a.mp4"','почему игрок бросил уровень','разбери playtest'])assert.equal(app.wanted(p),true,p);
 for(const p of ['разбери видео созвона','сделай гифку из видео','тест упал','разбери профайлер','что такое плейтест?','как провести плейтест','привет','разбери видео'])assert.equal(app.wanted(p),false,p);
 assert.equal(await app.turn(services({installed:false}).s,'разбери плейтест'),null);
 {const {s}=services();const r=await app.turn(s,'разбери плейтест');assert.equal(r.question,true);assert.match(r.text,/MP4, MOV или WebM/);}
 {const {s}=services();const r=await app.turn(s,'разбери плейтест "/nope/run.mp4"');assert.equal(r.error,true);assert.match(r.text,/Не нашёл видео/);}

 // Event logs.
 {const r=events.parse(fs.readFileSync(path.join(DIR,'events.csv'),'utf8'));
  assert.deepEqual(r.events.map(e=>[e.t,e.kind]),[[0,'session_start'],[4,'level_start'],[31,'death'],[52,'death'],[55,'retry'],[74,'death'],[100,'level_end'],[108,'purchase']]);
  assert.equal(r.skipped,1);assert.equal(r.events[2].level,'Уровень 2');assert.match(r.events[2].detail,/fell into pit/);}
 {const r=events.parse(fs.readFileSync(path.join(DIR,'events.json'),'utf8'));
  assert.equal(r.absolute,true);assert.deepEqual(r.events.map(e=>[e.t,e.kind]),[[0,'session_start'],[42.5,'death'],[70,'ui_miss'],[120,'level_end']]);assert.equal(r.events[1].level,'forest-1');}
 assert.equal(events.looks('time,event\n1,death'),true);assert.equal(events.looks('Name;Median Time\n"A";1'),false);assert.equal(events.seconds('1:02:03'),3723);

 // Speech: verbatim quotes, swearing marked without a quote, stock captions ignored.
 {const said=speech.negative(TRANSCRIPT);
  assert.deepEqual(said.map(x=>x.kind),['angry','confused','swearing']);
  assert.equal(said[0].quote,'Опять в эту яму!');assert.equal(said[1].quote,'Я не понимаю, куда тут прыгать.');
  assert.equal(said[2].quote,null);assert.equal(said[2].swearing,true);
  assert.ok(said[0].t>=29.5&&said[0].t<40&&said[1].t>said[0].t,'positions estimated inside the fragment');
  assert.ok(!said.some(x=>/Продолжение/.test(x.quote||'')));}

 // Moments from evidence only.
 assert.deepEqual(moments.detect({duration:60,frames:[],speech:[],events:[]}),[],'no evidence, no moments');
 {const ev=events.parse(fs.readFileSync(path.join(DIR,'events.csv'),'utf8')).events;
  const found=moments.detect({duration:120,frames:[],speech:[],events:ev});
  const retry=found.find(m=>m.type==='retry');assert.equal(retry.count,3);assert.equal(retry.severity,'high');assert.equal(retry.t,31);assert.equal(retry.end,74);assert.match(retry.title,/3 попытки на одном месте · Уровень 2/);
  assert.match(retry.evidence[0].text,/перезапусков: 1/);assert.equal(found.filter(m=>m.type==='death').length,3);}
 {const frames=[0,5,10,15,20,25,30,35,40].map(at=>({at,diff:at>=10&&at<=30?0.001:0.1,hash:'',label:at===35?{screen:'gameplay',description:'Игрок стоит у двери.',text:''}:null}));
  const found=moments.detect({duration:45,frames,speech:[{t:22,quote:'Что делать?',kind:'confused',swearing:false}],events:[],interval:5});
  const idle=found.find(m=>m.type==='idle');assert.equal(idle.t,5);assert.equal(idle.seconds,30);assert.equal(idle.severity,'medium','30 s low, raised by speech nearby');
  assert.deepEqual(found.find(m=>m.type==='speech').near,['idle']);}
 {const frames=[{at:0,diff:null,hash:'aaaa',label:{screen:'gameplay'}},{at:5,diff:0.1,hash:'aaaa',label:{screen:'fail',text:'',description:'Поражение.'}},{at:10,diff:0.1,hash:'aaaa',label:{screen:'gameplay'}},
   {at:15,diff:0.1,hash:'bbbb',label:{screen:'gameplay'}},{at:20,diff:0.1,hash:'cccc',label:{screen:'fail',description:'Поражение.'}},{at:25,diff:0.1,hash:'aaab',label:{screen:'gameplay'}},{at:30,diff:0.1,hash:'ffff',label:{screen:'loading'}}];
  const found=moments.detect({duration:30,frames,speech:[],events:[]});
  assert.equal(found.find(m=>m.type==='retry').count,2,'the same picture after two fail screens is one place');}
 assert.equal(moments.hamming('ff','fe'),1);assert.equal(moments.clock(3725),'1:02:05');

 // Vision label tidy and model choice.
 assert.equal(vision.tidy({screen:'boss',text:'',description:'',tapOnNothing:false,tapNote:''}),null);
 assert.equal(vision.tidy({screen:'menu',text:'',description:'x',tapOnNothing:true,tapNote:''}).tapOnNothing,false,'a tap needs a note');
 assert.equal(vision.pickModel(['qwen3.5:9b','llava:7b']),'llava:7b');assert.equal(vision.pickModel(['qwen3.5:9b']),null);
 assert.deepEqual(await downloads.present({optionalModels:{installed:async()=>['gemma3:4b'],catalog:[]}}),['vision-model']);assert.deepEqual(await downloads.present({}),[]);

 // The whole run: video + log attached, stubbed sampler / vision / transcription.
 const original={...app.deps};
 {const smp=sampler();let active=0,peak=0;const labelled=[];
  Object.assign(app.deps,{sampler:()=>smp.module,exists:f=>f===VIDEO,
   label:async(s,{model,image,at})=>{assert.equal(model,'gemma3:4b');labelled.push(image);peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));active--;return LABELS[at]||{screen:'gameplay',text:'',description:'Игрок бежит по уровню.',tapOnNothing:false,tapNote:''};},
   transcribe:async(s,file)=>{assert.equal(file,VIDEO);return {text:TRANSCRIPT,audio:{status:'complete',chunks:4}};}});
  const {s,topic}=services({files:[{name:'session 3.mp4',localSourcePath:VIDEO},{name:'events.csv',localSourcePath:path.join(DIR,'events.csv'),text:''}]});
  const r=await app.turn(s,'разбери плейтест');
  assert.equal(r.extensionData.playtest.status,'running');assert.match(r.text,/Разбираю плейтест «session 3\.mp4» с журналом «events\.csv»/);
  assert.equal(s.attachments.pending.size,0,'the video and the log move into the chat');assert.equal(topic.attachments.length,2);
  const id=r.extensionData.playtest.id,job=app.state.jobs.get(id);
  const dup=await app.turn(s,'разбери плейтест "'+VIDEO+'"');assert.match(dup.text,/Уже разбираю/);
  await job.promise;
  const card=topic.messages.find(m=>m.extensionData?.playtest?.id===id).extensionData.playtest;
  assert.equal(card.status,'done');assert.equal(card.frames,25);assert.equal(card.model,'gemma3:4b');assert.equal(card.duration,120);
  assert.deepEqual(smp.grabbed,[8,8,8,1],'frames in batches of 8');assert.equal(labelled.length,25);assert.ok(peak<=2,'at most two vision requests at a time');
  const types=card.moments.map(m=>m.type);
  for(const t of ['death','retry','idle','speech','ui'])assert.ok(types.includes(t),t);
  const retry=card.moments.find(m=>m.type==='retry');assert.equal(retry.count,3);assert.equal(retry.severity,'high');
  const death=card.moments.find(m=>m.type==='death'&&m.t===31);assert.ok(death.evidence.some(e=>e.kind==='frame'&&/Экран поражения/.test(e.text)),'the fail frame joins the logged death');
  assert.ok(card.moments.every(m=>m.evidence.length>0&&Number.isFinite(m.t)),'every moment has evidence and a time');
  assert.ok(card.moments.every(m=>!m.thumb||m.thumb.startsWith('data:image/jpeg;base64,')));
  const quotes=card.moments.filter(m=>m.type==='speech').flatMap(m=>m.evidence).map(e=>e.text);
  assert.ok(quotes.includes('Опять в эту яму!'));assert.ok(quotes.includes(null),'swearing kept as a mark, no text');
  assert.ok(!JSON.stringify(card).includes('Блядь'),'swearing is never stored or shown');
  assert.equal(card.moments.find(m=>m.type==='ui').evidence[0].text,'Касание по картинке баннера, это не кнопка.');
  assert.ok(card.summary.length&&card.summary[0].severity==='high');assert.match(card.summary[0].text,/3 попытки/);
  assert.equal(card.log.events,8);assert.match(card.notes.join(' '),/пропущено строк без времени или типа: 1/);
  assert.match(topic.messages.find(m=>m.extensionData?.playtest?.id===id).text,/Разобрал «session 3\.mp4» \(2:00\): \d+ момент/);
  const notices=s.sent.filter(([ch])=>ch==='extension-install-progress').map(([,n])=>n);
  assert.ok(notices.every(n=>n.id==='playtest:'+id),'one stable notification id');assert.ok(notices.some(n=>n.busy&&n.percent>0));assert.equal(notices.at(-1).busy,false);assert.equal(notices.at(-1).kind,'success');
  const ipc=app.setup(s).ipc;assert.equal(ipc.status(id).status,'done');assert.deepEqual(ipc.progress().at(-1).id,'playtest:'+id);
  // «Открыть на этом месте»: only this run's video, at the moment.
  const played=[];app.deps.playAt=async(file,at)=>{played.push([file,at]);return {opened:'player'};};
  assert.deepEqual(await ipc.open(id,31),{opened:'player'});assert.deepEqual(played[0],[VIDEO,31]);
  await assert.rejects(()=>ipc.open('other',1),/не найдено/);
  app.state.jobs.delete(id);assert.deepEqual(await ipc.open(id,5),{opened:'player'},'after a restart the path comes from the saved card');
 }
 // No vision model: no labels, idle still found from pixels, the download is offered.
 {Object.assign(app.deps,original);const smp=sampler();let called=0;
  Object.assign(app.deps,{sampler:()=>smp.module,exists:f=>f===VIDEO,label:async()=>{called++;return null;},transcribe:async()=>({text:'',audio:{status:'complete',chunks:4}})});
  const {s,topic}=services({files:[{name:'session 3.mp4',localSourcePath:VIDEO}],models:['qwen3.5:9b']});
  const r=await app.turn(s,'где игрок застрял');await app.state.jobs.get(r.extensionData.playtest.id).promise;
  const card=topic.messages.at(-1).extensionData.playtest;
  assert.equal(called,0);assert.equal(card.model,'');assert.deepEqual(card.moments.map(m=>m.type),['idle']);assert.match(card.notes.join(' '),/Модели для кадров нет/);assert.match(card.notes.join(' '),/Разборчивой речи игрока не нашёл/);
  assert.deepEqual(app.setup(s).ipc.downloadModel(),{started:true,model:'gemma3:4b'});}
 // Cancellation from the notification: the sampler stops, the card says so, transcription is not started.
 {Object.assign(app.deps,original);let release;let transcribed=0;const smp=sampler({hold:signal=>new Promise(r=>{release=r;signal.addEventListener('abort',r,{once:true});})});
  Object.assign(app.deps,{sampler:()=>smp.module,exists:f=>f===VIDEO,transcribe:async()=>{transcribed++;return {text:''};},label:async()=>null});
  const {s,topic}=services({files:[{name:'session 3.mp4',localSourcePath:VIDEO}]});
  const r=await app.turn(s,'моменты фрустрации в этом видео');const id=r.extensionData.playtest.id;
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(app.setup(s).ipc.cancel(id),{stopped:true});
  await app.state.jobs.get(id).promise;
  const card=topic.messages.at(-1).extensionData.playtest;assert.equal(card.status,'cancelled');assert.equal(transcribed,0);
  assert.match(topic.messages.at(-1).text,/отменён/);assert.equal(s.sent.at(-1)[1].busy,false);assert.equal(app.setup(s).ipc.cancel(id).stopped,false);}
 // A video attached without a path: the reader's frames and transcript are used, thumbnails made locally.
 {Object.assign(app.deps,original);const thumbs=[];
  Object.assign(app.deps,{exists:()=>false,thumb:image=>{thumbs.push(image);return 'data:image/jpeg;base64,BBBB';},label:async(s,{at})=>at===20?{screen:'fail',text:'',description:'Поражение.',tapOnNothing:false,tapNote:''}:{screen:'gameplay',text:'',description:'Игра.',tapOnNothing:false,tapNote:''}});
  const {s,topic}=services({files:[{name:'clip.mp4',frames:[0,10,20,30].map(at=>({at,image:'f'+at})),duration:30,text:'[0.0–30.0 с] Не понимаю, что делать.',audio:{status:'complete'}}]});
  const r=await app.turn(s,'разбери плейтест');await app.state.jobs.get(r.extensionData.playtest.id).promise;
  const card=topic.messages.at(-1).extensionData.playtest;
  assert.equal(card.status,'done');assert.equal(card.frames,4);assert.deepEqual(thumbs,['f0','f10','f20','f30']);
  assert.deepEqual(card.moments.map(m=>m.type).sort(),['death','speech']);assert.match(card.notes.join(' '),/без пути к файлу/);}
 Object.assign(app.deps,original);

 // Offer gate.
 const hit=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
 for(const p of ['разбери плейтест','где игрок застрял','моменты фрустрации в этом видео'])assert.ok(hit(p),p);
 for(const p of ['разбери видео созвона','сделай гифку','тест упал','разбери профайлер'])assert.ok(!hit(p),p);
 console.log('Playtest: phrases and near-misses, event logs, negative speech without slurs, moments from evidence, background run with batches, notifications, no model, cancel, attachment frames, open at moment passed');
})().catch(e=>{console.error(e);process.exit(1);});
