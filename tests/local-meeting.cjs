// The meeting recorder (src/local-meeting.cjs) with meeting sources: auto/ask/off, two separate audio sources,
// speaker names from the source, transient errors, manual stop, end detection — and without any source: nothing
// starts by itself, «Слушать встречу» records plain system audio until the user stops it.
const assert=require('node:assert/strict');
const {LocalMeeting}=require('../src/local-meeting.cjs');
const sources=require('../src/features/meeting-sources.cjs');
(async()=>{
 let found=true,mode='auto',begins=0,finishes=0,starts=0,ends=0,inspectionError=false,began=0,ended=0;
 const events=[],appended=[],titles=[];
 // A registry with one fake source, as src/features/meeting-sources.cjs builds it from an added extension.
 const settings={extension_meet:'true'};
 const fake={detect:async()=>{if(inspectionError)throw Error('temporary');return {active:found,title:'Дейли'};},begin:()=>{began++;},end:()=>{ended++;},
  speakers:({from,to})=>[{name:'Анна',start:from,end:from+1},{name:'Сергей Иванов',start:from,end:to}],participants:()=>['Анна','Сергей Иванов']};
 const registry=sources.create({settings},{sources:[{id:'meet',extension:'meet',setting:'extension_meet',name:'Встречи',source:fake}]});
 const recording={begin:o=>{titles.push(o);return String(++begins);},append:(...x)=>appended.push(x),finish:()=>finishes++};
 const capture=options=>({async start(config){starts++;assert.equal(config.microphone,true);await options.append('Встреча',{wav:'system',at:1000,endedAt:5000});await options.append('Микрофон',{wav:'self',at:1000,endedAt:5000});},async finish(){ends++;},destroy(){}});
 const local=new LocalMeeting({settings:()=>({meetingAutoRecord:mode,meetingCaptureMic:'true'}),sources:registry,recording,emit:s=>events.push(s),createCapture:capture});
 await local.tick();assert.equal(starts,0);await local.tick();assert.equal(starts,1);assert.equal(finishes,0);assert.equal(appended.length,2);
 assert.deepEqual(titles[0],{title:'Дейли',app:'Встречи'},'the source names the meeting');
 assert.equal(appended[0][2].speaker,'Сергей Иванов','the meeting sound gets the name that talked most');assert.equal(appended[1][2].speaker,undefined,'the microphone is the user');
 assert.equal(began,1);
 await Promise.all([local.start(),local.start()]);assert.equal(starts,1);
 inspectionError=true;await local.tick();assert.equal(ends,0,'Transient observation errors must not terminate capture');inspectionError=false;
 found=false;await local.tick();await local.tick();assert.equal(ends,0);await local.tick();assert.equal(ends,1);assert.equal(finishes,1);assert.equal(ended,1);
 found=true;mode='ask';await local.tick();await local.tick();assert.equal(local.phase,'detected');assert.equal(local.snapshot().canStart,true);assert.equal(starts,1);await local.start();assert.equal(starts,2);await local.stop();await local.tick();assert.equal(starts,2,'Manual stop suppresses restart in same meeting');
 found=false;for(let i=0;i<3;i++)await local.tick();found=true;mode='off';await local.tick();await local.tick();assert.equal(starts,2,'off: a meeting seen by a source does not start recording');
 assert(events.some(e=>e.phase==='starting'&&e.present));
 mode='auto';found=true;await local.tick();assert.equal(local.present,true);found=false;for(let i=0;i<3;i++)await local.tick();assert.equal(local.present,false,'A one-tick detection must release the chat voice lock');
 // The source belongs to an extension: removed from the catalog, it is not asked any more.
 settings.extension_meet='false';found=true;for(let i=0;i<3;i++)await local.tick();assert.equal(starts,2);assert.equal(local.present,false);
 assert.deepEqual(registry.list(),[]);assert.deepEqual(registry.participants(),[]);
 settings.extension_meet='true';assert.deepEqual(registry.participants(),['Анна','Сергей Иванов']);

 // No meeting source at all: Petya still records when asked, plain system audio without names, and only the user
 // stops it (no end detection).
 const plain=[],plainTitles=[];let plainStarts=0,plainEnds=0;
 const bare=new LocalMeeting({settings:()=>({meetingAutoRecord:'auto',meetingCaptureMic:'false'}),sources:sources.create({settings:{}},{sources:[]}),emit:()=>{},
  recording:{begin:o=>{plainTitles.push(o);return 'p1';},append:(...x)=>plain.push(x),finish:()=>{}},
  createCapture:options=>({async start(config){plainStarts++;assert.equal(config.microphone,false);await options.append('Встреча',{wav:'system',at:1,endedAt:2});},async finish(){plainEnds++;},destroy(){}})});
 for(let i=0;i<4;i++)await bare.tick();assert.equal(plainStarts,0,'without a source nothing starts by itself');
 assert.match(bare.snapshot().message,/Слушать встречу/);
 await bare.start();assert.equal(plainStarts,1);assert.deepEqual(plainTitles[0],{title:'',app:''});assert.equal(plain[0][2].speaker,undefined);
 for(let i=0;i<5;i++)await bare.tick();assert.equal(plainEnds,0,'a manual recording is not stopped by missing detection');
 await bare.stop();assert.equal(plainEnds,1);
 // Same with a registry that lists no added source and with no registry at all.
 const none=new LocalMeeting({settings:()=>({meetingAutoRecord:'auto',meetingCaptureMic:'true'}),recording:{begin:()=>'x',append(){},finish(){}},emit:()=>{},createCapture:()=>({async start(){},async finish(){},destroy(){}})});
 await none.tick();await none.start();assert.equal(none.snapshot().active,true);await none.stop();assert.equal(none.snapshot().active,false);
 console.log('Local meeting: meeting sources (auto/ask/off, title, speaker names, end detection, removed extension), two separate audio sources, duplicate start, transient observation, manual stop; without a source manual recording only passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
