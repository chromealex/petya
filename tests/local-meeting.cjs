const assert=require('node:assert/strict');
const {LocalMeeting}=require('../src/extensions/zoom-bot/local-controller.cjs');
(async()=>{
 let found=true,mode='auto',begins=0,finishes=0,starts=0,ends=0,inspectionError=false;
 const events=[],appended=[];
 const local=new LocalMeeting({settings:()=>({zoomBotMode:mode,zoomCaptureMic:'true'}),inspect:async()=>{if(inspectionError)throw Error('temporary');return {meetingActive:found,windows:[]};},recording:{begin:()=>String(++begins),append:(...x)=>appended.push(x),finish:()=>finishes++},emit:s=>events.push(s),createCapture:options=>({async start(config){starts++;assert.equal(config.microphone,true);await options.append('Zoom',{wav:'system'});await options.append('Микрофон',{wav:'self'});},async finish(){ends++;},destroy(){}})});
 await local.tick();assert.equal(starts,0);await local.tick();assert.equal(starts,1);assert.equal(finishes,0);assert.equal(appended.length,2);
 await Promise.all([local.start(),local.start()]);assert.equal(starts,1);
 inspectionError=true;await local.tick();assert.equal(ends,0,'Transient observation errors must not terminate capture');inspectionError=false;
 found=false;await local.tick();await local.tick();assert.equal(ends,0);await local.tick();assert.equal(ends,1);assert.equal(finishes,1);
 found=true;mode='ask';await local.tick();await local.tick();assert.equal(local.phase,'detected');assert.equal(starts,1);await local.start();assert.equal(starts,2);await local.stop();await local.tick();assert.equal(starts,2,'Manual stop suppresses restart in same meeting');
 found=false;for(let i=0;i<3;i++)await local.tick();found=true;mode='off';await assert.rejects(local.start(),/выключена/);assert.equal(starts,2);
 assert(events.some(e=>e.phase==='starting'&&e.present));
 mode='auto';found=true;await local.tick();assert.equal(local.present,true);found=false;for(let i=0;i<3;i++)await local.tick();assert.equal(local.present,false,'A one-tick detection must release the chat voice lock');
 console.log('Local meeting: auto/ask/off, two separate sources, deferred finish, duplicate start, transient observation, manual stop and end detection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
