// Ollama: installer, model preparation, vision model, model updates and per-chat models.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const ollamaInstaller = new ctx.OllamaInstaller({ home: ctx.app.getPath('home'),
    open: target => require('electron').shell.openPath(target),
    emit: state => { if (state.phase !== 'done') ollamaReady?.update(state.phase, state.message, { ...state, busy: true }); }
  });
  const ollamaReady = new ctx.OllamaReady({ settings: () => ctx.settings, save: ctx.saveSettings, install: ollamaInstaller,
    emit: state => { if (!ctx.win.isDestroyed()) ctx.win.webContents.send('ollama-install-progress', state); }
  });
  const visionReady=new ctx.OllamaReady({settings:()=>({...ctx.settings,model:'gemma3:4b'}),save:()=>{},install:ollamaInstaller,emit:()=>{}});
  ctx.handle('attachmentVisionInstall',()=>{if(ollamaReady.state.busy)throw Error('Дождитесь подготовки Ollama.');visionReady.start();return visionReady.state;});
  ctx.handle('attachmentVisionStatus',()=>visionReady.state);ctx.handle('attachmentVisionCancel',()=>visionReady.cancel());
  ctx.app.on('will-quit',()=>visionReady.cancel());
  const modelUpdates=new (require('./model-updates.cjs').ModelUpdates)({settings:()=>ctx.settings,ready:ollamaReady});
  ctx.handle('modelUpdates',force=>ctx.smoke?{items:[],checkedAt:Date.now(),error:''}:modelUpdates.check(force===true));
  ctx.handle('modelUpdateInstall',model=>{if(visionReady.state.busy)throw Error('Дождитесь подготовки модели изображений.');return modelUpdates.install(ctx.text(model,180));});
  ctx.handle('installBrain',()=>{if(visionReady.state.busy)throw Error('Дождитесь подготовки модели изображений.');return ollamaReady.start('qwen3.5:9b');});
  ctx.handle('installOllama', () => {if(visionReady.state.busy)throw Error('Дождитесь загрузки модели для изображений.');return ollamaReady.start();});
  ctx.handle('ollamaInstallStatus', () => ollamaReady.state);
  ctx.handle('cancelOllamaInstall', () => ollamaReady.cancel());
  ctx.app.on('before-quit', event => {
    if (!ollamaReady.state.busy) return;
    event.preventDefault(); ctx.quitting = false;
    ollamaReady.cancel();
    // Downloads cancel immediately; let an installation finish before quitting.
    ollamaReady.pending?.finally(() => ctx.app.quit());
  });
  // Per-chat answer model: local Ollama models only; empty means the default from settings.
  const localModels=async()=>{const base=new URL(ctx.core.localEndpoint(ctx.settings.ollamaUrl));const tags=await ctx.directRequest(new URL('/api/tags',base).href,{});return (Array.isArray(tags?.models)?tags.models:[]).filter(m=>typeof m.name==='string'&&!/cloud/i.test(m.name)&&!/embed/i.test(m.name)&&!m.remote_host).map(m=>({name:m.name,size:Number(m.size)||0})).sort((a,b)=>a.size-b.size);};
  ctx.handle('chatModels',async()=>{const topic=ctx.dialogue.active();let models=[],error='';try{models=await localModels();}catch(e){error='Ollama недоступна: '+e.message;}return {models,current:typeof topic?.model==='string'?topic.model:'',defaultModel:ctx.settings.model||'',error};});
  ctx.handle('chatModelSet',async model=>{if(model!==''&&(typeof model!=='string'||model.length>200))throw Error('Некорректная модель.');if(model&&!(await localModels()).some(m=>m.name===model))throw Error('Модель не найдена в Ollama.');const topic=ctx.dialogue.active();if(!topic)throw Error('Откройте чат.');if(model)topic.model=model;else delete topic.model;ctx.dialogue.persist();return {current:topic.model||'',defaultModel:ctx.settings.model||''};});
  ctx.handle('restartOllama', () => {if(visionReady.state.busy)throw Error('Дождитесь загрузки модели для изображений.');return ollamaReady.restart();});
  ctx.handle('openOllama', () => {if(visionReady.state.busy)throw Error('Дождитесь загрузки модели для изображений.');return ollamaReady.start();});
  return {ollamaInstaller,ollamaReady,visionReady};
};
