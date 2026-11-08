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
 name:'meetingMemory', defaults:{meetingAutoRecord:'auto', meetingCaptureMic:'true', meetingMigration:'1'}, read,
 validate(next){
  if(!migration.MODES.includes(next.meetingAutoRecord))throw Error('Проверьте режим записи встреч.');
  if(!['true','false'].includes(next.meetingCaptureMic))throw Error('Проверьте настройку микрофона на встречах.');
 },
 // Called when the settings file is read: keys of the old single-app recorder become meeting keys once (src/meeting-migration.cjs).
 migrate(settings,saved,context){return migration.migrateSettings(settings,saved,context);},
 setup(s) {
  if(migration.pending(s.settings))try{s.saveSettings({},true);}catch{/* saved with the next change */}
  const {safeStorage,app}=require('electron');
  const company=s.companyId, memory=s.memory;
  const recording=new (require('../meeting-recording.cjs').MeetingRecording)({
   directory:require('node:path').join(s.dataRoot,'meeting-recordings'),days:()=>s.settings.contextDays,
   encrypt:text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Хранилище ОС недоступно.');return safeStorage.encryptString(text);},
   decrypt:bytes=>safeStorage.decryptString(bytes),
   transcribe:bytes=>require('../voice-setup.cjs').transcribe(s,bytes),
   save:item=>memory.put([item]),
   emit:state=>{if(company===s.companyId&&s.win&&!s.win.isDestroyed())s.win.webContents.send('meeting-memory-progress',state);}
  });
  const local=new (require('../local-meeting.cjs').LocalMeeting)({settings:()=>s.settings,sources:{list:()=>s.meetingSources?.list()||[],detect:()=>s.meetingSources?s.meetingSources.detect():{active:false},speaker:(...a)=>s.meetingSources?.speaker(...a)||'',begin:id=>s.meetingSources?.begin(id),end:id=>s.meetingSources?.end(id)},recording,
   createCapture:options=>new (require('../meeting-capture.cjs').LocalCapture)(options),
   emit:state=>{if(company===s.companyId&&s.win&&!s.win.isDestroyed())s.win.webContents.send('local-meeting-progress',state);}
  });
  const timer=setInterval(()=>{if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1')local.tick().catch(()=>{});},5000);timer.unref();
  app.once('before-quit',async()=>{clearInterval(timer);await local.stop(false);});
  // «Запись встреч» settings card (src/ui/connections.js): when to start, the microphone, and the sources.
  const options=()=>({mode:s.settings.meetingAutoRecord,microphone:s.settings.meetingCaptureMic!=='false',sources:s.meetingSources?.list().map(x=>x.name)||[]});
  const configure=input=>{
   const values={};
   if(input?.mode!==undefined){if(local.snapshot().busy&&input.mode!==s.settings.meetingAutoRecord)throw Error('Сначала завершите текущую запись встречи.');values.meetingAutoRecord=String(input.mode);}
   if(typeof input?.microphone==='boolean')values.meetingCaptureMic=String(input.microphone);
   s.saveSettings(values,true);return options();
  };
  const ipc={captureStatus:()=>local.snapshot(),startCapture:()=>local.start(),stopCapture:()=>local.stop(true),options,configure,read:args=>read(s.memory,args),begin:()=>recording.begin(),append:(...args)=>recording.append(...args),finish:id=>recording.finish(id),retry:id=>recording.retry(id),status:()=>recording.status()};
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
