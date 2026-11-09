// Attachments: files, media kept from services' messages and attachment IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const attachments=new (require('./attachments.cjs').Attachments)({saved:ctx.dialogue.state.composerFiles||[],savePending:files=>{ctx.dialogue.state.composerFiles=files;ctx.dialogue.persist();},scope:()=>ctx.dialogue.active()?.id||'draft:'+ctx.dialogue.state.activeProjectId,unknown:(bytes,name)=>ctx.formatReader.read(bytes,name,{resume:ctx.formatReader.pending?.name===name&&ctx.formatReader.pending.resume}),pdf:bytes=>require('./pdf-reader.cjs').readPDF(bytes),image:bytes=>require('./image-reader.cjs').readImage(bytes),video:async(bytes,name)=>{const snapshot={...ctx.settings};let ready=false;return require('./video-reader.cjs').readVideo(bytes,name,{transcribe:async wav=>{if(!ready){await ctx.speech.ensure(snapshot);ready=true;}const form=new FormData();form.append('file',new Blob([wav],{type:'audio/wav'}),'video.wav');form.append('language','auto');form.append('response_format','json');const response=await ctx.speech.run(snapshot,target=>ctx.request(ctx.core.localEndpoint(target),{method:'POST',body:form}));if(typeof response?.text!=='string')throw Error('Whisper не вернул расшифровку.');return response.text;}});}});
  const scenes = new WeakMap();
  attachments.localScene = id => {
    const item = attachments.pending.get(id);
    return item?.owner === attachments.scope() ? scenes.get(item) : null;
  };
  // Media kept from services' messages (media-source, src/media-sources.cjs): listed, then downloaded on request.
  const media=()=>require('./media-sources.cjs').create(ctx.services);
  const allowedMedia=service=>media().allowed(service);
  ctx.handle('attachmentSources',async()=>(await allowedMedia()).map(({fileId,messageId,channel,chatId,contextId,...r})=>r));
  const importMedia=async id=>{
    const source=media(),before=source.fingerprint();const check=()=>{if(before!==source.fingerprint()||!source.list().some(r=>r.id===id))throw Error('Источник изменился. Обновите список медиа.');};
    const {row,file}=await source.download(id);
    let added;try{check();added=file.filePath?await attachments.addVideoFile(file.filePath):await attachments.add(file.name,file.bytes);}finally{await file.cleanup?.();}try{check();}catch(e){attachments.remove(added.id);throw e;}const stored=attachments.pending.get(added.id);stored.source={service:row.service,chat:row.title,url:row.url,at:row.at,contextText:ctx.memory.prune().find(c=>c.id===row.contextId)?.text.slice(-5000)||''};return added;
  };
  ctx.handle('attachmentImport',importMedia);
  ctx.handle('attachmentVideoFile',(file,owner)=>attachments.addVideoFile(file,attachmentOwner(owner)));
  const attachmentOwner=owner=>{if(!owner)return attachments.scope();if(owner.startsWith('draft:')?ctx.dialogue.state.projects.some(p=>'draft:'+p.id===owner):ctx.dialogue.state.topics.some(t=>t.id===owner))return owner;throw Error('Чат для вложения больше недоступен.');};
  ctx.handle('attachmentAdd',(name,bytes,owner)=>attachments.add(name,bytes,attachmentOwner(owner)));
  ctx.handle('attachmentTopic',()=>{const t=ctx.dialogue.active();return t?.attachments?{id:t.id,files:t.attachments.map(a=>({name:a.name,note:a.note}))}:null;});
  ctx.handle('attachmentList',()=>attachments.list());ctx.handle('attachmentRemove',id=>{if(!attachments.list().some(a=>a.id===id))throw Error('Вложение не найдено в текущем чате.');attachments.remove(id);});
  ctx.handle('attachmentVideoCancel',()=>require('./video-reader.cjs').cancelVideo());
  ctx.app.on('will-quit',()=>require('./video-reader.cjs').cancelVideo());
  ctx.handle('attachmentPick',async()=>{const owner=attachments.scope();const r=await require('electron').dialog.showOpenDialog(ctx.win,{title:'Что показать Пете?',properties:['openFile','multiSelections'],filters:[{name:'Документы, изображения и видео',extensions:['txt','md','log','csv','json','xml','yaml','yml','js','ts','py','cs','html','css','docx','pdf','png','jpg','jpeg','webp','mp4','mov','webm']},{name:'3D-модели',extensions:require('./model-attachment.cjs').formats},{name:'Все форматы — Петя найдёт способ чтения',extensions:['*']}]});if(r.canceled)return [];if(r.filePaths.length>5)throw Error('Выберите не больше пяти файлов.');const errors=[];for(const file of r.filePaths){try{if (/\.blend$/i.test(file)) {
    if (owner !== attachments.scope() || attachments.list().length >= 5) throw Error('Выберите до пяти файлов в текущем чате.');
    const full = ctx.fs.realpathSync(file);
    if (!ctx.fs.statSync(full).isFile() || !/\.blend$/i.test(full)) throw Error('Выберите локальный файл .blend.');
    const item = {id:require('node:crypto').randomUUID(),name:ctx.path.basename(full),owner,at:Date.now(),localSourcePath:full,note:'Сцена Blender'};
    scenes.set(item,full);
    attachments.store(item);
    continue;
  }
  if(ctx.fs.statSync(file).size>require('./attachments.cjs').maxSize(file))throw Error('Документ/изображение больше 10 МБ.');if(require('./attachments.cjs').isVideo(file))await attachments.addVideoFile(file,owner);else await attachments.add(ctx.path.basename(file),ctx.fs.readFileSync(file),owner,item=>{if(owner!==attachments.scope())throw Error('Чат изменился. Прикрепите файл заново.');item.localSourcePath=ctx.fs.realpathSync(file);});}catch(e){errors.push(ctx.path.basename(file)+': '+e.message);}}return errors;});
  return {attachments,allowedMedia,importMedia};
};
