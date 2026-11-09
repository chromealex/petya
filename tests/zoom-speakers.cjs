// Names of Zoom speakers from the window texts, and a fragment labelled with whoever talked most during it.
const assert=require('node:assert/strict');const {parse,SpeakerTimeline}=require('../src/extensions/zoom/speakers.cjs');
const r=parse(['Zoom Meeting','Talking: Сергей Иванов','Анна Петрова, Audio muted, Video off','Alex Silaev (Host, me), Computer audio unmuted','Mute','Participants','Мария говорит']);
assert.deepEqual(r.talking.sort(),['Мария','Сергей Иванов'].sort());assert.deepEqual(r.people.sort(),['Alex Silaev','Анна Петрова'].sort());
assert.deepEqual(parse(['Participants (3)','Share Screen','Zoom']).talking,[]);
(async()=>{
 let t=0,i=0;const seq=[['Talking: Сергей'],['Talking: Сергей'],['Talking: Анна'],[]];
 const line=new SpeakerTimeline({read:async()=>({texts:seq[Math.min(i++,seq.length-1)]}),now:()=>t,every:1e9});
 for(const at of [1000,3000,5000,7000]){t=at;line.busy=false;await line.start();await new Promise(r=>setImmediate(r));}
 line.stop();assert.equal(line.label(0,4000),'Сергей');assert.equal(line.label(5000,5500),'Анна');assert.equal(line.label(20000,30000),'');
 // Zoom says nobody is talking, but besides the user there is one person in the meeting: the sound is theirs.
 const two=new SpeakerTimeline({read:async()=>({trusted:true,texts:['Алекс (Я), Audio muted','Мария Иванова, Video off']}),now:()=>100,every:1e9});
 await two.start();await new Promise(r=>setImmediate(r));two.stop();
 assert.deepEqual(two.intervals(0,5000,{me:['Алекс']}).map(r=>r.name),['Мария Иванова']);
 // Without accessibility access the window cannot be read: the timeline knows it is blind.
 const blind=new SpeakerTimeline({read:async()=>({trusted:false,texts:[]}),every:1e9});await blind.start();await new Promise(r=>setImmediate(r));blind.stop();assert.equal(blind.blind,true);
 console.log('zoom speakers: names from Zoom window texts, fragment labels, the only other person, no access passed');
})().catch(e=>{console.error(e);process.exit(1);});
