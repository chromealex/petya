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
  ctx.handle('restartOllama', () => {if(visionReady.state.busy)throw Error('Дождитесь загрузки модели для изображений.');return ollamaReady.restart();});
  ctx.handle('openOllama', () => {if(visionReady.state.busy)throw Error('Дождитесь загрузки модели для изображений.');return ollamaReady.start();});
  return {ollamaInstaller,ollamaReady,visionReady};
};
