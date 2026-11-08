const {MeetingMonitor,hasMeeting}=require('../../meeting-monitor.cjs');
class LocalMeeting {
 constructor({settings,inspect,recording,createCapture,emit,speakers=null}){
  Object.assign(this,{settings,inspect,recording,createCapture,emit,speakers});this.phase='idle';this.present=false;
  this.monitor=new MeetingMonitor({inspect:async()=>{let state;try{state=await inspect();}catch(error){if(this.capture)return {meetingActive:true,windows:[],permission:true};throw error;}if(hasMeeting(state)&&!this.present){this.present=true;this.emit(this.snapshot());}return {...state,permission:true};},start:async()=>{this.publish('detected','Обнаружена встреча Zoom.');if(settings().zoomBotMode==='auto')await this.start();},stop:async()=>{await this.stop(false);this.present=false;this.publish('idle','Ожидаю встречу Zoom.');}});
 }
 snapshot(){return {id:this.id||'local-observer',phase:this.phase,present:this.present,active:!!this.capture,busy:!!this.capture||!!this.starting,mode:this.settings().zoomBotMode,message:this.message||'Ожидаю встречу Zoom.',canStart:this.phase==='detected'||this.phase==='stopped'&&this.present,canRetry:this.phase==='error'};}
 publish(phase,message){this.phase=phase;this.message=message;this.emit(this.snapshot());}
 async tick(){try{const enabled=this.settings().zoomBotMode!=='off';if(!enabled){await this.stop(false);const changed=this.present||this.phase!=='idle';this.present=false;if(changed)this.publish('idle','Локальная запись выключена.');}await this.monitor.tick(enabled);if(this.present&&!this.capture&&this.monitor.misses>=3){this.present=false;this.publish('idle','Ожидаю встречу Zoom.');}}catch(e){if(!this.capture)this.publish('error',e.message);}}
 async start(){
  if(this.starting)return this.starting;if(this.capture)return this.snapshot();
  this.starting=this.begin();try{return await this.starting;}finally{this.starting=null;}
 }
 async begin(){
  const cfg=this.settings();if(cfg.zoomBotMode==='off')throw Error('Локальная запись выключена в настройках встреч.');
  if(!hasMeeting(await this.inspect()))throw Error('Активная встреча Zoom не найдена.');
  this.present=true;this.id=this.recording.begin();this.publish('starting','Подключаю системный звук и микрофон…');
  // The meeting sound gets the name of whoever Zoom shows talking (src/zoom-speakers.cjs).
  this.speakers?.start();
  const capture=this.createCapture({append:(source,item)=>this.recording.append(this.id,source,source==='Zoom'&&this.speakers?{...item,speaker:this.speakers.label(item.at,item.endedAt)}:item),onError:error=>{this.stop(true).then(()=>this.publish('error',error.message)).catch(()=>this.publish('error',error.message));}});this.capture=capture;
  try{await capture.start({microphone:cfg.zoomCaptureMic!=='false',deviceId:cfg.microphoneDeviceId||''});this.publish('recording','Записываю встречу отдельно от чатов. Обработка начнётся после завершения.');return this.snapshot();}
  catch(e){this.speakers?.stop();capture.destroy();this.capture=null;this.recording.finish(this.id);this.publish('error',e.message);throw e;}
 }
 async stop(manual=true){
  if(manual)this.monitor.pause();
  if(this.stopping)return this.stopping;
  this.stopping=(async()=>{if(this.starting)await this.starting.catch(()=>{});const capture=this.capture;if(!capture)return this.snapshot();try{await capture.finish();}finally{this.speakers?.stop();this.capture=null;this.recording.finish(this.id);this.publish('stopped','Запись завершена. Расшифровка сохраняется в память компании.');}return this.snapshot();})();
  try{return await this.stopping;}finally{this.stopping=null;}
 }
}
module.exports={LocalMeeting};
