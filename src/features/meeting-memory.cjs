// Meeting recording and memory: the recorder (src/local-meeting.cjs) with its settings, and the transcripts, which
// belong to the current company independently of the selected chat. Meeting apps plug in as meeting sources
// (src/features/meeting-sources.cjs); without any, a meeting is recorded when the user asks.
const {isMeeting}=require('../meeting-talk.cjs');
const migration=require('../meeting-migration.cjs');
function read(memory, {sessionId = '', offset = 0, limit = 100} = {}) {
 const rows = memory.prune().filter(r => isMeeting(r) && (!sessionId || r.sessionId === sessionId)).sort((a,b) => a.at-b.at);
 return {scope:'company', total:rows.length, items:rows.slice(offset,offset+limit)};
}
module.exports = {
 name:'meetingMemory', defaults:{meetingAutoRecord:'auto', meetingCaptureMic:'true', meetingMigration:'1', videoAppsMigration:'1'}, read,
 validate(next){
  if(!migration.MODES.includes(next.meetingAutoRecord))throw Error('Проверьте режим записи встреч.');
  if(!['true','false'].includes(next.meetingCaptureMic))throw Error('Проверьте настройку микрофона на встречах.');
 },
 // Called when the settings file is read: keys of the old single-app recorder become meeting keys once, and the video
 // meeting apps that used to be calendar choices are added for calendar users once (src/meeting-migration.cjs).
 migrate(settings,saved,context){const meetings=migration.migrateSettings(settings,saved,context),video=migration.migrateVideoApps(settings,saved);return meetings||video;},
 setup(s) {
  if(migration.pending(s.settings))try{s.saveSettings({},true);}catch{/* saved with the next change */}
  const {safeStorage,app}=require('electron');
  // A recording goes on through a company switch (src/meeting-carry.cjs): opening its company again adopts the same
  // recorder. Everything the recorder uses of the company is read through `bind.s`, the services of the open profile.
  const carry=require('../meeting-carry.cjs'),company=s.companyId,kept=carry.adopt(company);
  const bind=kept?kept.bind:{s};bind.s=s;
  const here=()=>company===(bind.s.currentCompanyId?.()??company);
  const send=(channel,state)=>{const win=bind.s.win;if(win&&!win.isDestroyed())win.webContents.send(channel,state);};
  const recording=kept?kept.recording:new (require('../meeting-recording.cjs').MeetingRecording)({
   directory:require('node:path').join(s.dataRoot,'meeting-recordings'),days:()=>bind.s.settings.contextDays,
   encrypt:text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Хранилище ОС недоступно.');return safeStorage.encryptString(text);},
   decrypt:bytes=>safeStorage.decryptString(bytes),
   transcribe:bytes=>require('../voice-setup.cjs').transcribe(bind.s,bytes),
   save:item=>bind.s.memory.put([item]),
   emit:state=>{if(here())send('meeting-memory-progress',state);},
   // Recognised fragments go to the live meeting stream (src/features/meeting-stream.cjs) while the meeting is recorded.
   observe:item=>{if(here())bind.s.meetingStreamProducer?.segment({...item,meetingId:item.id});}
  });
  // The live stream starts when the recording does and ends when it stops: started/ended with the meeting's context.
  const live=state=>{
   const stream=bind.s.meetingStreamProducer;if(!stream||!here())return;
   try{
    if(state.active&&state.phase==='recording'){const session=recording.sessions.get(state.id);stream.start({meetingId:state.id,title:session?.title||'',app:state.app||session?.app||'',source:local.source||'',attendees:local.source?bind.s.meetingSources?.participants?.()||[]:[]});}
    else if(!state.active&&stream.status().meetingId===state.id){const session=recording.sessions.get(state.id);stream.end(state.id,{reason:state.phase==='error'?'error':'stopped',pending:session?session.segments.length-session.completed:0});}
   }catch{/* the live stream never breaks the recording */}
  };
  const companyName=()=>{try{return bind.s.companies?.get(company)?.name||'';}catch{return '';}};
  // What the window shows: this company's recorder, or the meeting another company records in the background.
  const view=()=>{const own=local.snapshot();const other=!own.busy&&carry.recordingElsewhere(company);if(!other)return {...own,company};const state=other.local.snapshot();return {...state,company:other.id,elsewhere:other.name,message:'Записываю встречу компании «'+other.name+'» в фоне.'};};
  // The source that saw the meeting stays the one asked for speakers until the recording ends.
  let pinned=null;
  const local=kept?kept.local:new (require('../local-meeting.cjs').LocalMeeting)({settings:()=>bind.s.settings,
   sources:{list:()=>bind.s.meetingSources?.list()||[],detect:()=>bind.s.meetingSources?bind.s.meetingSources.detect():{active:false},speaker:(...a)=>pinned?.speaker(...a)||'',begin:id=>{pinned=bind.s.meetingSources;pinned?.begin(id);},end:id=>{pinned?.end(id);pinned=null;}},
   recording,
   createCapture:options=>new (require('../meeting-capture.cjs').LocalCapture)(options),
   // The company a meeting belongs to, by its participants and each company's «Команда» (src/meeting-company.cjs).
   place:state=>require('../meeting-company.cjs').place(bind.s,state,{decrypt:b64=>safeStorage.decryptString(Buffer.from(b64,'base64'))}),
   ended:()=>require('../meeting-company.cjs').reset(),
   // One meeting at a time, recorded only by the open company (a carried recorder finishes its own meeting only).
   blocked:()=>{if(!here())return 'Компания не открыта.';const other=carry.recordingElsewhere(company);return other?'Сейчас записывается встреча компании «'+other.name+'». Остановите её, чтобы начать новую.':'';},
   emit:state=>{
    live(state);
    if(here())send('local-meeting-progress',{...state,company});
    else{const open=bind.s.currentCompanyId?.();if(!carry._owners.get(open)?.local.snapshot().busy)send('local-meeting-progress',{...state,company,elsewhere:companyName(),...state.busy?{message:'Записываю встречу компании «'+companyName()+'» в фоне.'}:{}});}
   }
  });
  if(kept){clearInterval(kept.timer);recording.held=false;recording.resume();}
  const timer=setInterval(()=>{if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1')local.tick().catch(()=>{}).finally(()=>carry.settle(company));},5000);timer.unref();
  carry.register(company,{local,recording,bind,timer,name:companyName});
  // Closing the company for a switch keeps a running recording; quitting stops it.
  app.once('before-quit',async()=>{if(s.companySwitching?.()&&carry.carry(company))return;clearInterval(timer);carry.drop(company);await local.stop(false);});
  // «Запись встреч» settings card (src/ui/connections.js): when to start, the microphone, and the sources.
  const options=()=>({mode:s.settings.meetingAutoRecord,microphone:s.settings.meetingCaptureMic!=='false',sources:s.meetingSources?.list().map(x=>x.name)||[]});
  const configure=input=>{
   const values={};
   if(input?.mode!==undefined){if(local.snapshot().busy&&input.mode!==s.settings.meetingAutoRecord)throw Error('Сначала завершите текущую запись встречи.');values.meetingAutoRecord=String(input.mode);}
   if(typeof input?.microphone==='boolean')values.meetingCaptureMic=String(input.microphone);
   s.saveSettings(values,true);return options();
  };
  const ipc={captureStatus:view,startCapture:()=>local.start(),stopCapture:()=>{const other=!local.snapshot().busy&&carry.recordingElsewhere(company);return (other?other.local:local).stop(true);},options,configure,read:args=>read(s.memory,args),begin:()=>recording.begin(),append:(...args)=>recording.append(...args),finish:id=>recording.finish(id),retry:id=>recording.retry(id),status:()=>recording.status()};
  return {ipc,meetingSessions:{status:()=>recording.status(),remove:id=>recording.remove(id),settings:()=>({...options(),capture:'local'})},meetingRecording:(method,...args)=>{if(!['status','retry','captureStatus','startCapture','stopCapture'].includes(method))throw Error('Операция доступна только в приложении.');return ipc[method](...args);}};
 },
 register(server,z,ctx) {
  for(const method of ['status','retry'])server.registerTool(method==='status'?'meeting_recording_status':'retry_meeting_processing',{
   description:method==='status'?'Состояние записи и последующей обработки встреч компании.':'Повторить обработку уже записанной встречи после ошибки. Не включает запись. Требуется доступ на редактирование всей компании.',
   inputSchema:method==='status'?{}:{sessionId:z.string().min(1).max(200)},annotations:{readOnlyHint:method==='status',destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId||method==='retry'&&ctx.access?.mode&&ctx.access.mode!=='edit')throw Error('Недостаточно прав доступа к записям компании.');
   return await ctx.run(async()=>({content:[{type:'text',text:JSON.stringify(await ctx.meetingRecording(method,args.sessionId))}]}));
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});

  for(const [tool,method] of [['local_meeting_status','captureStatus'],['start_local_meeting','startCapture'],['stop_local_meeting','stopCapture']])server.registerTool(tool,{
   description:method==='captureStatus'?'Состояние отдельной локальной записи встречи.':method==='startCapture'?'Записать обнаруженную встречу локально. Доступно только при автоматическом режиме, выбранном пользователем; разрешения ОС выдаются в приложении.':'Остановить локальную запись и начать обработку в общую память компании.',
   inputSchema:{},annotations:{readOnlyHint:method==='captureStatus',destructiveHint:false,openWorldHint:false}
  },async()=>{try{ctx.check();if(ctx.access?.projectId||method!=='captureStatus'&&ctx.access?.mode!=='edit')throw Error('Нужен доступ ко всей компании с соответствующими правами.');return await ctx.run(async()=>{const state=await ctx.meetingRecording('captureStatus');if(method==='startCapture'&&state.mode!=='auto')throw Error('Подтвердите запись в приложении.');return {content:[{type:'text',text:JSON.stringify(await ctx.meetingRecording(method))}]};});}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});

  server.registerTool('read_meeting_memory', {
   description:'Читать полную расшифровку встреч из общей памяти текущей компании постранично, независимо от чата. Доступ только при разрешении MCP на всю компанию. Запуск записи и разрешения ОС доступны в приложении.',
   inputSchema:{sessionId:z.string().max(200).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(100)},
   annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId)throw Error('Для общей памяти встреч нужен доступ MCP ко всей компании.');
   return await ctx.run(()=>{ctx.check();return {content:[{type:'text',text:JSON.stringify(read(ctx.memory,args))}]};});
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 }
};
