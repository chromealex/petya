// «Разбор плейтеста» cards in the real chat. With ffmpeg on this computer, a 60-second clip is made and analysed by
// the real sampler window (frames, pixel change, hashes, thumbnails); the vision model and speech recognition are
// stubbed. The finished card (timeline, summary, moments with thumbnails, quotes, open and task actions) and a running
// card (progress from the app's status, «Отменить») are checked and photographed.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/playtest/feature.cjs');
const TRANSCRIPT=fs.readFileSync(path.join(__dirname,'fixtures/playtest/transcript.txt'),'utf8');
const EVENTS=path.join(__dirname,'fixtures/playtest/events.csv');

function clip(){
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'petya-playtest-ui-')),'playtest session.mp4');
 try{
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=640x360:r=25:d=20','-f','lavfi','-i','smptebars=s=640x360:r=25:d=25',
   '-f','lavfi','-i','color=c=0xb02a2a:s=640x360:r=25:d=5','-f','lavfi','-t','10','-i','mandelbrot=s=640x360:r=25',
   '-filter_complex','[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,format=yuv420p','-c:v','libx264','-preset','ultrafast',file],{stdio:'ignore',timeout:60000});
  return file;
 }catch{return '';}
}

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const video=clip();
 let card;
 if(video){
  // Real sampler; stubbed vision (by time: the static part is a menu, the red part a fail screen) and transcription.
  Object.assign(app.deps,{installedModels:async()=>['gemma3:4b'],
   label:async(s,{at})=>at>=44.5&&at<50?{screen:'fail',text:'ВЫ ПОГИБЛИ',description:'Красный экран поражения.',tapOnNothing:false,tapNote:''}:at>=20&&at<44.5?{screen:'menu',text:'',description:'Неподвижный экран меню.',tapOnNothing:at>=35&&at<40,tapNote:at>=35&&at<40?'Курсор жмёт в пустую область меню.':''}:{screen:'gameplay',text:'',description:'Игровая сцена в движении.',tapOnNothing:false,tapNote:''},
   transcribe:async()=>({text:TRANSCRIPT,audio:{status:'complete',chunks:2}})});
  const topic={id:'ui',title:'Плейтест',messages:[],attachments:[]};
  const s={settings:{extension_playtest:'true',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},win:null,optionalModels:{catalog:[]},
   dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
   attachments:{list:()=>[{id:'v',name:path.basename(video)},{id:'l',name:'events.csv'}],pending:new Map([['v',{localSourcePath:video}],['l',{localSourcePath:EVENTS}]]),take:()=>{throw Error('kept');}}};
  const r=await app.start(s,'разбери плейтест');
  await app.state.jobs.get(r.extensionData.playtest.id).promise;
  card=topic.messages.at(-1).extensionData.playtest;
  assert.equal(card.status,'done',card.error);
  assert.ok(card.frames>=12,'real frames were sampled');
  assert.ok(card.moments.find(m=>m.type==='idle'&&m.t>=15&&m.t<=25&&m.seconds>=20),'the static 25 s are found by pixel change');
  assert.ok(card.moments.every(m=>!m.thumb||/^data:image\/jpeg;base64,/.test(m.thumb)));
  assert.ok(card.moments.filter(m=>m.thumb).length>=3,'thumbnails extracted locally');
 }else{
  console.log('ffmpeg not found: the card uses recorded data');
  const thumb='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  card={id:'static',status:'done',video:{name:'playtest session.mp4',path:''},log:{name:'events.csv',events:8},duration:60,interval:5,frames:13,model:'gemma3:4b',speech:{status:'complete',lines:3},counts:{death:3,retry:1,idle:1,speech:2},
   moments:[{id:'m1',t:20,end:40,type:'idle',severity:'high',title:'Простой 25 с в меню',seconds:25,thumb,evidence:[{kind:'frame',t:20,text:'кадр почти не меняется 25 с'}]},
    {id:'m2',t:31,end:52,type:'retry',severity:'high',count:3,title:'3 попытки на одном месте · Уровень 2',evidence:[{kind:'event',t:31,text:'смерти на «Уровень 2»: 0:31, 0:52, 1:14'}]}],
   summary:[{severity:'high',text:'3 попытки на одном месте · Уровень 2 (0:31–1:14)'}],notes:[],timeline:[]};
 }
 // A running card: a job the app reports through its status IPC.
 const running={id:'run-1',status:'running',stage:'Смотрю кадры 16 из 25',percent:48,video:{name:'second session.mov',path:''},log:{name:'events.json',events:4},moments:[],summary:[],notes:[]};
 app.state.jobs.set('run-1',{id:'run-1',running:true,controller:new AbortController(),video:{localSourcePath:''},card:running});
 card.notes=[...(card.notes||[]),'<img src=x onerror=alert(1)>'];
 await js(`view('home');showDialogueMessages([{role:'user',text:'разбери плейтест'},{role:'assistant',text:'Разобрал.',by:'Разбор плейтеста',extensionData:{playtest:${JSON.stringify(card)}}},{role:'user',text:'где игрок застрял'},{role:'assistant',text:'Разбираю.',by:'Разбор плейтеста',extensionData:{playtest:${JSON.stringify(running)}}}],'Плейтест')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.pt-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.pt-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.pt-card[data-status=done] .pt-mark').length"),card.moments.length,'one marker per moment');
 assert.equal(await js("document.querySelectorAll('.pt-card[data-status=done] .pt-moment').length"),card.moments.length);
 assert.ok(await js("document.querySelectorAll('.pt-card[data-status=done] .pt-thumb img').length>=1"));
 assert.equal(await js("document.querySelectorAll('.pt-card img:not(.pt-thumb img)').length"),0,'notes are text, never HTML');
 assert.equal(await js("document.querySelectorAll('.pt-card[data-status=done] .kit-links[data-kind=task-tracker]').length"),card.moments.length,'a task per moment through k.links');
 if(video){
  assert.ok(await js("[...document.querySelectorAll('.pt-ev q')].some(q=>q.textContent==='Опять в эту яму!')"),'quotes verbatim');
  assert.ok(await js("[...document.querySelectorAll('.pt-ev-text.muted')].some(n=>/без цитаты/.test(n.textContent))"),'swearing marked without a quote');
  assert.equal(await js("document.body.textContent.includes('Блядь')"),false);
  assert.ok(await js("[...document.querySelectorAll('.pt-card[data-status=done] .pt-actions button')].some(b=>b.textContent==='Открыть на этом месте')"));
 }
 // Clicking a timeline marker reveals its moment.
 await js("document.querySelector('.pt-card[data-status=done] .pt-mark').click()");
 // Running card: progress from the status IPC, then cancel.
 assert.match(await js("document.querySelector('.pt-card[data-status=running] .kit-chip').textContent"),/48%/);
 running.percent=72;running.stage='Распознаю речь игрока';
 for(let i=0;i<60;i++){if(await js("(document.querySelector('.pt-card[data-status=running] .kit-chip')?.textContent||'').includes('72%')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.match(await js("document.querySelector('.pt-card[data-status=running] .pt-stage').textContent"),/Распознаю речь/);
 const file=await require('./card-shot.cjs')(win,'.pt-card','petya-playtest');
 for(const [i,y] of [[2,760],[3,1520]]){await js('document.getElementById("card-shot").scrollTop='+y);await new Promise(r=>setTimeout(r,200));fs.writeFileSync(file.replace('.png','-'+i+'.png'),(await win.webContents.capturePage()).toPNG());}
 console.log('Playtest cards: '+(video?'real sampled clip, ':'')+'timeline markers, moments with thumbnails, quotes without slurs, task links, running progress passed ('+file+')');
}};
require('../src/main.cjs');
