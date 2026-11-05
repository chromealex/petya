const {randomUUID}=require('node:crypto');
const {fromObservation}=require('./meeting-link.cjs');
const {hasMeeting}=require('../../meeting-monitor.cjs');
const phases={idle:'Ожидаю начала встречи Zoom',detected:'Встреча обнаружена. Подключить Петю?',link:'Получаю ссылку текущей встречи Zoom…',joining:'Петя подключается к Zoom…',waiting:'Петя ожидает допуска в Zoom',recording:'Петя записывает встречу отдельно от компьютера',processing:'Встреча завершена. Обрабатываю запись…',done:'Расшифровка сохранена в общей памяти компании',dismissed:'Петя не будет входить в эту встречу'};
class ZoomBot {
 constructor({settings,inspect,remote,save,transcribe,accessReady=()=>true,load=()=>null,persist=()=>{},emit=()=>{},now=Date.now}){Object.assign(this,{settings,inspect,remote,save,transcribe,accessReady,persist,emit,now});this.state=load()||{phase:'idle'};this.busy=false;this.hits=0;this.misses=0;this.present=false;}
 snapshot(){const s=this.state;return {needsPermission:!this.accessReady(),meetingPresent:this.present,id:s.id||'observer',phase:s.phase,message:s.message||phases[s.phase],meetingId:s.meetingId||'',hasLink:!!s.url,canJoin:s.phase==='detected',canRetry:s.phase==='error',busy:['link','joining','waiting','recording','processing'].includes(s.phase)};}
 publish(patch){Object.assign(this.state,patch);this.persist(this.state);this.emit(this.snapshot());return this.snapshot();}
 async tick(){
  if(this.busy)return;this.busy=true;
  try{
   if(this.state.jobId&&!['done','error','dismissed'].includes(this.state.phase)){await this.poll();}
   if(this.settings().zoomBotMode==='off'||this.settings().zoomCaptureMode==='local')return this.snapshot();
   if(this.state.permissionBlocked&&this.accessReady()){await this.discover();}
   if(this.state.phase==='detected'&&this.settings().zoomBotMode==='auto')await this.connect();
   const observation=await this.inspect(false),found=hasMeeting(observation);
   if(found){this.hits++;this.misses=0;}else{this.hits=0;this.misses++;}
   if(this.misses>=3){const wasPresent=this.present;this.present=false;if(wasPresent)this.publish({});if(!this.state.jobId)this.publish({phase:'idle',id:null,url:null,meetingId:null});}
   if(found&&this.hits>=2&&!this.present){this.present=true;
    if(this.state.jobId&&this.state.phase!=='done')return this.snapshot();
    this.state={id:randomUUID(),phase:'link',at:this.now()};this.publish({});
    await this.discover();
    if(this.settings().zoomBotMode==='auto')await this.connect();
   }
   return this.snapshot();
  }catch(e){return this.publish({phase:'error',permissionBlocked:e.code==='ACCESSIBILITY_REQUIRED',message:e.message});}finally{this.busy=false;}
 }
 async discover(){if(!this.accessReady())throw Object.assign(Error('Разрешите Пете Универсальный доступ. Нажмите «Разрешить доступ» — откроется нужный раздел настроек, затем Петя продолжит автоматически.'),{code:'ACCESSIBILITY_REQUIRED'});const observation=await this.inspect(true);if(!hasMeeting(observation))throw Error('Встреча Zoom уже завершилась.');const link=fromObservation(observation);if(!link)throw Error('Не удалось прочитать ссылку текущей встречи. Петя попробовал открыть сведения о встрече. Нажмите «Повторить»; если окно Zoom закрыто, вернитесь во встречу.');this.publish({...link,permissionBlocked:false,phase:'detected',message:phases.detected});}
 async connect(){
  if(this.settings().zoomBotMode==='off')throw Error('Включите участника Пети в настройках Zoom.');
  if(this.state.jobId)return this.snapshot();
  if(!this.state.url)throw Error('Ссылка текущей встречи ещё не определена.');
  // Re-read at the moment of consent: never join a stale meeting from a notification.
  const current=fromObservation(await this.inspect(true));if(!current||current.meetingId!==this.state.meetingId)throw Error('Встреча изменилась. Дождитесь её повторного определения.');
  this.publish({phase:'joining',message:phases.joining});
  const result=await this.remote('POST','/v1/bots',{requestId:this.state.id,...current,name:'Петя'});
  if(typeof result.id!=='string'||!result.id)throw Error('Сервис Zoom не вернул идентификатор подключения.');
  this.publish({jobId:result.id,phase:'joining',message:phases.joining});return this.snapshot();
 }
 async poll(){
  const result=await this.remote('GET','/v1/bots/'+encodeURIComponent(this.state.jobId));
  if(!['joining','waiting','recording','recorded','done','error'].includes(result.phase))throw Error('Сервис Zoom вернул неизвестное состояние.');
  if(result.phase==='recorded'){
   if(!Number.isInteger(result.segments)||result.segments<0||result.segments>50000)throw Error('Некорректная длина записи.');
   this.publish({phase:'processing',message:phases.processing});
   for(let i=this.state.completed||0;i<result.segments;i++){
    const part=await this.remote('GET','/v1/bots/'+encodeURIComponent(this.state.jobId)+'/audio/'+i);
    if(typeof part.wav!=='string'||part.wav.length>6e6||!Number.isFinite(part.at))throw Error('Некорректный звуковой фрагмент Zoom.');
    const bytes=Buffer.from(part.wav,'base64'),text=await this.transcribe(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if(text)await this.save([{id:'zoom-bot-'+this.state.id+'-'+i,sessionId:this.state.id,source:'Zoom',title:'Встреча Zoom · '+this.state.meetingId,text,at:part.at,url:''}]);
    this.publish({completed:i+1,message:`Обрабатываю запись Zoom: ${i+1} из ${result.segments} фрагментов`});
   }
   await this.remote('POST','/v1/bots/'+encodeURIComponent(this.state.jobId)+'/ack',{});
   return this.publish({phase:'done',message:phases.done});
  }
  return this.publish({phase:result.phase,message:result.phase==='error'?String(result.message||'Ошибка записи Zoom'):phases[result.phase]});
 }
 async action(method,id){
  if(id!==this.state.id)throw Error('Состояние встречи изменилось.');
  if(this.busy)throw Error('Петя уже обрабатывает встречу.');this.busy=true;
  try{
   if(method==='dismiss'){if(this.state.jobId)throw Error('Петя уже подключается к встрече.');return this.publish({phase:'dismissed',message:phases.dismissed});}
   if(method==='join'&&this.state.phase!=='detected')throw Error('Встреча не ожидает подключения.');
   if(method==='retry'){
    if(this.state.jobId){
     try{await this.poll();if(this.state.phase!=='error')return this.snapshot();}
     catch(e){if(e.code!=='ZOOM_JOB_UNAVAILABLE'||this.state.completed)throw e;}
     // Explicit retry starts a new attempt only after a terminal/missing job.
     this.state={id:randomUUID(),phase:'link',at:this.now()};this.publish({});
    }
    await this.discover();
   }
   return await this.connect();
  }catch(e){this.publish({phase:'error',permissionBlocked:e.code==='ACCESSIBILITY_REQUIRED',message:e.message});throw e;}finally{this.busy=false;}
 }
}
module.exports={ZoomBot,phases};
