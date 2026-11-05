// Meeting transcripts belong to the current company, independently of the selected chat.
function read(memory, {sessionId = '', offset = 0, limit = 100} = {}) {
 const rows = memory.prune().filter(r => (r.source === 'Zoom' || r.source === 'Микрофон' && r.sessionId) && (!sessionId || r.sessionId === sessionId)).sort((a,b) => a.at-b.at);
 return {scope:'company', total:rows.length, items:rows.slice(offset,offset+limit)};
}
module.exports = {
 name:'meetingMemory', defaults:{zoomAutoRecord:'true', zoomMemoryMigration:'0'}, validate(){}, read,
 setup(s) {
  // Enable the new default once for existing installations; subsequent opt-outs persist.
  if(s.settings.zoomMemoryMigration !== '1') s.saveSettings({zoomAutoRecord:'true',zoomMemoryMigration:'1'});
  const {safeStorage}=require('electron');
  const recording=new (require('../meeting-recording.cjs').MeetingRecording)({
   directory:require('node:path').join(s.dataRoot,'meeting-recordings'),days:()=>s.settings.contextDays,
   encrypt:text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Хранилище ОС недоступно.');return safeStorage.encryptString(text);},
   decrypt:bytes=>safeStorage.decryptString(bytes),
   transcribe:bytes=>require('../voice-setup.cjs').transcribe(s,bytes),
   save:item=>s.memory.put([item]),
   emit:state=>{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('meeting-memory-progress',state);}
  });
  const ipc={read:args=>read(s.memory,args),begin:()=>recording.begin(),append:(...args)=>recording.append(...args),finish:id=>recording.finish(id),retry:id=>recording.retry(id),status:()=>recording.status()};
  return {ipc,meetingRecording:(method,...args)=>{if(!['status','retry'].includes(method))throw Error('Операция доступна только в приложении.');return ipc[method](...args);}};
 },
 register(server,z,ctx) {
  for(const method of ['status','retry'])server.registerTool(method==='status'?'meeting_recording_status':'retry_meeting_processing',{
   description:method==='status'?'Состояние записи и последующей обработки встреч компании.':'Повторить обработку уже записанной встречи после ошибки. Не включает запись. Требуется доступ на редактирование всей компании.',
   inputSchema:method==='status'?{}:{sessionId:z.string().min(1).max(200)},annotations:{readOnlyHint:method==='status',destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId||method==='retry'&&ctx.access?.mode&&ctx.access.mode!=='edit')throw Error('Недостаточно прав доступа к записям компании.');
   return await ctx.run(async()=>({content:[{type:'text',text:JSON.stringify(await ctx.meetingRecording(method,args.sessionId))}]}));
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});

  server.registerTool('read_meeting_memory', {
   description:'Читать полную расшифровку Zoom из общей памяти текущей компании постранично, независимо от чата. Доступ только при разрешении MCP на всю компанию. Запуск записи и разрешения ОС доступны в приложении.',
   inputSchema:{sessionId:z.string().max(200).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(100)},
   annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async args=>{try{ctx.check();if(ctx.access?.projectId)throw Error('Для общей памяти встреч нужен доступ MCP ко всей компании.');
   return await ctx.run(()=>{ctx.check();return {content:[{type:'text',text:JSON.stringify(read(ctx.memory,args))}]};});
  }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 }
};
