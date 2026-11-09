// A meeting recording goes on through a company switch: the company that records it keeps its recorder in the
// background, the open company shows that meeting and can stop it but starts none of its own, recognition waits
// for the recording company and goes to its memory when it is opened again (src/meeting-carry.cjs).
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const quit=[];
const electron={safeStorage:{isEncryptionAvailable:()=>true,encryptString:t=>Buffer.from(String(t)),decryptString:b=>Buffer.from(b).toString()},app:{once:(event,fn)=>{if(event==='before-quit')quit.push(fn);}}};
const captures=[];
class FakeCapture{constructor({append}){this.append=append;captures.push(this);}async start(){}async finish(){}destroy(){}}
const load=Module._load;
Module._load=function(request,parent,...rest){
 if(request==='electron')return electron;
 if(/meeting-capture\.cjs$/.test(request))return {LocalCapture:FakeCapture};
 if(/voice-setup\.cjs$/.test(request))return {transcribe:async s=>'Речь для '+s.companyId};
 return load.call(this,request,parent,...rest);
};
const carry=require('../src/meeting-carry.cjs'),feature=require('../src/features/meeting-memory.cjs');
const wav=at=>({wav:new ArrayBuffer(100),at,endedAt:at+1});
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-carry-'));let open='a',switching=false;const sent=[];
 const services=(id,saved)=>({companyId:id,currentCompanyId:()=>open,companySwitching:()=>switching,dataRoot:path.join(root,id),smoke:true,
  settings:{contextDays:'7',meetingAutoRecord:'off',meetingCaptureMic:'true',meetingMigration:'1',videoAppsMigration:'1'},saveSettings(){},
  memory:{put:items=>saved.push(...items),prune:()=>saved},companies:{get:x=>({name:x==='a'?'Альфа':'Бета'})},
  win:{isDestroyed:()=>false,webContents:{send:(channel,state)=>sent.push({channel,state,open})}}});
 // The company's own «before-quit» listener (the company scope calls it when the company closes); the app-level one
 // that stops a carried recorder on quit is added by src/meeting-carry.cjs and stays.
 const closeFor=async f=>{await f.close();};
 const setup=(id,saved)=>{const out=feature.setup(services(id,saved));out.close=quit.at(-1);return out;};
 try{
  // Company «Альфа» records a meeting.
  const alpha=[],a=setup('a',alpha);
  await a.ipc.startCapture();assert.equal(a.ipc.captureStatus().busy,true);assert.equal(a.ipc.captureStatus().company,'a');
  captures[0].append('Встреча',wav(1));await settle();assert.equal(alpha.length,1,'recognised while its company is open');
  // Switch to «Бета»: the recorder is kept, nothing is stopped.
  switching=true;await closeFor(a);switching=false;open='b';
  assert.deepEqual(carry.recording(),['a'],'the tab of «Альфа» shows the recording');
  const beta=[],b=setup('b',beta);
  const shown=b.ipc.captureStatus();assert.equal(shown.busy,true);assert.equal(shown.company,'a');assert.equal(shown.elsewhere,'Альфа');assert.match(shown.message,/компании «Альфа» в фоне/);
  await assert.rejects(b.ipc.startCapture(),/встреча компании «Альфа»/,'one meeting at a time');
  captures[0].append('Встреча',wav(5));await settle();
  assert.equal(alpha.length,1,'recognition waits for «Альфа»');assert.equal(beta.length,0,'nothing goes to «Бета»');
  // «Остановить встречу» in «Бета» stops the meeting of «Альфа».
  await b.ipc.stopCapture();assert.deepEqual(carry.recording(),[]);
  assert(sent.some(x=>x.open==='b'&&x.state.company==='a'&&x.state.elsewhere==='Альфа'&&!x.state.busy),'the open window hears that the background recording ended');assert.equal(b.ipc.captureStatus().busy,false);assert.equal(b.ipc.captureStatus().company,'b');
  await settle();assert.equal(alpha.length,1);
  // Back to «Альфа»: the same recorder is adopted and the rest is recognised into its (new) memory.
  switching=true;await closeFor(b);switching=false;open='a';
  const alpha2=[],again=setup('a',alpha2);await settle();
  assert.equal(alpha2.length,1,'what was recorded in the background is recognised now');assert.match(alpha2[0].text,/Речь для a/);
  assert.equal(again.ipc.status().find(x=>x.segments===2)?.phase,'done');
  // Quitting (not a switch) stops and forgets the recorder.
  await again.ipc.startCapture();await closeFor(again);assert.deepEqual(carry.recording(),[]);assert.equal(carry._owners.size,0);
  assert.equal(quit.length,4,'one app-level listener for carried recorders');
  console.log('Meeting carry: recording goes on through a company switch, one meeting at a time, stop from another company, recognition after return, quit stops passed');
 }finally{Module._load=load;fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
