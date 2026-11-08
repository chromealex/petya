// Meeting transcripts belong to the current company, independently of the selected chat.
function read(memory, {sessionId = '', offset = 0, limit = 100} = {}) {
 const rows = memory.prune().filter(r => (r.source === 'Zoom' || r.source === 'Микрофон' && r.sessionId) && (!sessionId || r.sessionId === sessionId)).sort((a,b) => a.at-b.at);
 return {scope:'company', total:rows.length, items:rows.slice(offset,offset+limit)};
}
module.exports = {
 name:'meetingMemory', defaults:{zoomAutoRecord:'false', zoomMemoryMigration:'0',zoomLocalService:'1'}, validate(){}, read,
 setup(s) {
  // Recording meetings needs the user's explicit choice: it is off by default and never switched on by an update.
  // Migration 1 had switched it on for every installation; migration 2 switches that back off once.
  if(s.settings.zoomMemoryMigration === '1') s.saveSettings({zoomAutoRecord:'false',zoomMemoryMigration:'2'});
  else if(s.settings.zoomMemoryMigration !== '2') s.saveSettings({zoomMemoryMigration:'2'});
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
  // Names of speakers from Zoom's window; the last window texts are kept locally for tuning the parser.
  const speakers=new (require('../zoom-speakers.cjs').SpeakerTimeline)({keep:sample=>{try{require('node:fs').writeFileSync(require('node:path').join(s.dataRoot,'zoom-speakers-sample.json'),JSON.stringify(sample),{mode:0o600});}catch{}}});
  const local=new (require('../extensions/zoom-bot/local-controller.cjs').LocalMeeting)({speakers,settings:()=>s.settings,inspect:()=>require('../meeting-monitor.cjs').desktopState(),recording,
   createCapture:options=>new (require('../extensions/zoom-bot/local-capture.cjs').LocalCapture)(options),
   emit:state=>{if(company===s.companyId&&s.win&&!s.win.isDestroyed())s.win.webContents.send('local-meeting-progress',state);}
  });
  const timer=setInterval(()=>{if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1')local.tick().catch(()=>{});},5000);timer.unref();
  app.once('before-quit',async()=>{clearInterval(timer);await local.stop(false);});
  const ipc={captureStatus:()=>local.snapshot(),startCapture:()=>local.start(),stopCapture:()=>local.stop(true),read:args=>read(s.memory,args),begin:()=>recording.begin(),append:(...args)=>recording.append(...args),finish:id=>recording.finish(id),retry:id=>recording.retry(id),status:()=>recording.status()};
  return {ipc,meetingSessions:{status:()=>recording.status(),remove:id=>recording.remove(id),settings:()=>({mode:s.settings.zoomBotMode||'auto',capture:'local'})},meetingRecording:(method,...args)=>{if(!['status','retry','captureStatus','startCapture','stopCapture'].includes(method))throw Error('Операция доступна только в приложении.');return ipc[method](...args);}};
 },
 register(server,z,ctx) {
  for(const method of ['status','retry'])server.registerTool(method==='status'?'meeting_recording_status':'retry_meeting_processing',{
   description:method==='status'?'Состояние записи и последующей обработки встреч компании.':'Повторить обработку уже записанной встречи после ошибки. Не включает запись. Требуется доступ на редактирование всей компании.',
   inputSchema:method==='status'?{}:{sessionId:z.string().min(1).max(200)},annotations:{readOnlyHint:method==='status',destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId||method==='retry'&&ctx.access?.mode&&ctx.access.mode!=='edit')throw Error('Недостаточно прав доступа к записям компании.');
   return await ctx.run(async()=>({content:[{type:'text',text:JSON.stringify(await ctx.meetingRecording(method,args.sessionId))}]}));
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});

  for(const [tool,method] of [['local_meeting_status','captureStatus'],['start_local_meeting','startCapture'],['stop_local_meeting','stopCapture']])server.registerTool(tool,{
   description:method==='captureStatus'?'Состояние отдельной локальной записи встречи, без бота Zoom.':method==='startCapture'?'Записать обнаруженную встречу локально. Доступно только при автоматическом режиме, выбранном пользователем; разрешения ОС выдаются в приложении.':'Остановить локальную запись и начать обработку в общую память компании.',
   inputSchema:{},annotations:{readOnlyHint:method==='captureStatus',destructiveHint:false,openWorldHint:false}
  },async()=>{try{ctx.check();if(ctx.access?.projectId||method!=='captureStatus'&&ctx.access?.mode!=='edit')throw Error('Нужен доступ ко всей компании с соответствующими правами.');return await ctx.run(async()=>{const state=await ctx.meetingRecording('captureStatus');if(method==='startCapture'&&state.mode!=='auto')throw Error('Подтвердите запись в приложении.');return {content:[{type:'text',text:JSON.stringify(await ctx.meetingRecording(method))}]};});}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});

  server.registerTool('read_meeting_memory', {
   description:'Читать полную расшифровку Zoom из общей памяти текущей компании постранично, независимо от чата. Доступ только при разрешении MCP на всю компанию. Запуск записи и разрешения ОС доступны в приложении.',
   inputSchema:{sessionId:z.string().max(200).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(100)},
   annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId)throw Error('Для общей памяти встреч нужен доступ MCP ко всей компании.');
   return await ctx.run(()=>{ctx.check();return {content:[{type:'text',text:JSON.stringify(read(ctx.memory,args))}]};});
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 }
};
