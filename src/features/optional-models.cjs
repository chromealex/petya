// Feature: optional local models. Only the answer model (qwen3.5:9b) is kept installed; the others are
// downloaded when they are needed — from the chat model picker, or when a task asks for one — and can be
// removed again. Progress goes to the notification center like the main model's preparation.
const CATALOG=[
 {name:'gemma3:4b',size:3.3e9,purpose:'скриншоты и видео во вложениях'},
 {name:'qwen2.5-coder:7b',size:4.7e9,purpose:'разбор кода во вложениях'},
 {name:'qwen3:4b',size:2.5e9,purpose:'быстрые короткие ответы'}];
const known=name=>CATALOG.find(m=>m.name===name);
module.exports={
 name:'optional-models',
 CATALOG,
 setup(s){
  const {localEndpoint}=require('../core.cjs');
  const base=()=>new URL(localEndpoint(s.settings.ollamaUrl));
  const call=async(route,body,method=body?'POST':'GET')=>{const r=await fetch(new URL(route,base()),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('Ollama: HTTP '+r.status+'.');return r.status===200&&method!=='DELETE'?r.json().catch(()=>({})):{};};
  const installed=async()=>((await call('/api/tags'))?.models||[]).map(m=>m.name);
  // One download at a time; it never changes the default model (save is a no-op) and reports through the
  // same «ollama-install-progress» channel, so the notification center shows one card per operation.
  let ready=null;
  const download=name=>{
   const model=known(name);if(!model)throw Error('Эта модель не входит в список дополнительных.');
   if(s.ollamaReady?.state?.busy||ready?.state?.busy)throw Error('Уже идёт подготовка модели. Дождитесь её окончания.');
   ready=new s.OllamaReady({settings:()=>({...s.settings,model:name}),save:()=>{},install:s.ollamaInstaller,
    emit:state=>{if(!s.win.isDestroyed())s.win.webContents.send('ollama-install-progress',{...state,model:name,optional:true});}});
   ready.start(name);return {started:true,model:name,size:model.size};
  };
  const ipc={
   list:async()=>{let names=[],error='';try{names=await installed();}catch(e){error='Ollama недоступна: '+e.message;}
    return {models:CATALOG.map(m=>({...m,installed:names.includes(m.name)})),busy:!!ready?.state?.busy,error};},
   download,
   cancel:()=>ready?.cancel?.(),
   status:()=>ready?.state||{phase:'idle'},
   // Removing keeps the answer model: only catalog models can be removed here.
   remove:async name=>{if(!known(name))throw Error('Удалять отсюда можно только дополнительные модели.');if(name===s.settings.model)throw Error('Это модель по умолчанию — сначала выбери другую.');
    await call('/api/delete',{model:name},'DELETE');return ipc.list();}
  };
  return {optionalModels:{catalog:CATALOG,download,installed},ipc};
 }
};
