// Semantic index: search by meaning over collections that apps declare. A collection is declared by an extension in
// its extension.json — "provides": { "index-collection": "<file>.cjs" } (read by src/features/app-links.cjs `scan`) —
// or is one of Petya's own (chats, meetings: src/semantic-index/collections.cjs). The file exports
//   { id?, name, description?, collects,               // collects: what is read, shown before the user opts in
//     type?: 'code'|'markdown'|'text'|'chat',          // default chunker for items without their own type
//     refresh?: minutes (default 30, 0 = only on request),
//     ready?(settings) -> bool,                         // e.g. the folders are chosen; the registry adds «app added»
//     list?(services, {signal, gate}) -> [{id, version, meta?}],             // automatic collections
//     read?(services, entry, {signal}) -> {text|messages|chunks, type?, title?, meta?} | null }
// Collections without list/read are filled by their app through `semanticIndex.add`. Everything is opt-in per
// collection (setting semanticIndexCollections), stays in <company data>/semantic-index and can be wiped.
// The full contract: docs/foundations/semantic-index.md.
const path=require('node:path');
const KIND='index-collection';
const {SemanticIndex,NOTICE}=require('../semantic-index/index.cjs');
const embedding=require('../semantic-index/embedder.cjs');
const own=require('../semantic-index/collections.cjs');

function check(p,where){
 const bad=()=>Error('Invalid index collection '+where);
 if(!/^[a-z][a-z0-9-]{0,63}$/.test(p.id||'')||typeof p.name!=='string'||!p.name.trim()||typeof p.collects!=='string'||!p.collects.trim())throw bad();
 for(const hook of ['list','read','ready'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
 if((typeof p.list==='function')!==(typeof p.read==='function'))throw bad();
 if(p.type!==undefined&&!['code','markdown','text','chat'].includes(p.type))throw bad();
 if(p.refresh!==undefined&&!(Number.isFinite(p.refresh)&&p.refresh>=0))throw bad();
 return p;
}
// Every declared collection: Petya's own, then the extensions' ({...provider, id, extension, setting}).
function load(dir){
 const found=require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(x=>check({...x.provider,id:x.provider.id||x.extension,extension:x.extension,setting:x.setting,name:x.provider.name||x.name},x.extension+'/'+x.file));
 const all=[...own.builtin.map(p=>check({...p},p.id)),...found];
 const ids=new Set();for(const p of all){if(ids.has(p.id))throw Error('Duplicate index collection '+p.id);ids.add(p.id);}
 return all;
}
const parse=v=>{try{const o=JSON.parse(v||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{};}catch{return {};}};

function create(s,{providers=load(),fetcher=(...a)=>fetch(...a),root=path.join(s.dataRoot,'semantic-index'),publish,busy=()=>false,throttle=20}={}){
 const {localEndpoint}=require('../core.cjs');
 const base=()=>new URL(localEndpoint(s.settings.ollamaUrl));
 // A collection counts only while its app is added and ready; the opt-in is the user's switch.
 const usable=p=>{if(p.setting&&s.settings?.[p.setting]!=='true')return false;try{return typeof p.ready!=='function'||!!p.ready(s.settings||{});}catch{return false;}};
 const live=()=>providers.filter(usable);
 const send=publish||(notice=>{try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}});
 let embedder=null;
 const embedderOf=()=>{
  const model=embedding.known(s.settings.semanticIndexModel)?s.settings.semanticIndexModel:embedding.DEFAULT_MODEL;
  if(!embedder||embedder.model!==model)embedder=new embedding.Embedder({model,base,fetcher});
  return embedder;
 };
 const index=new SemanticIndex({root,embedder:embedderOf,providers:live,services:s,publish:send,busy,throttle,
  enabled:id=>parse(s.settings.semanticIndexCollections)[id]===true,
  setEnabled:(id,on)=>{const next=parse(s.settings.semanticIndexCollections);if(on)next[id]=true;else delete next[id];s.saveSettings({semanticIndexCollections:JSON.stringify(next)},true);}});
 index.paused=s.settings.semanticIndexPaused==='true';

 // The embedding model download, its own notification card (stable id), cancellable.
 let model={phase:'idle',busy:false},controller=null,pending=null;
 const modelNotice=()=>{const percent=model.total>0?Math.min(100,Math.floor(model.received*100/model.total)):undefined;return {id:NOTICE+'-model',title:'Модель для поиска по смыслу',text:(model.message||'')+(model.busy&&Number.isFinite(percent)?' · '+percent+'%':''),busy:model.busy,percent,kind:model.phase==='error'?'error':model.phase==='done'?'success':'model',version:model.phase};};
 const update=(phase,message,extra={})=>{model={phase,message,busy:!['idle','done','error','cancelled'].includes(phase),...extra};send(modelNotice());};
 function prepareModel(){
  if(pending)return {started:false,busy:true};
  const name=embedderOf().model;controller=new AbortController();
  pending=embedding.prepare({model:name,base,fetcher,install:s.ollamaInstaller,signal:controller.signal,update})
   .then(r=>{update('done','Модель '+name+' готова. Индекс строится в фоне.',{model:name});index.modelChecked=0;index.lastSync.clear();index.tick();index.kick();return r;})
   .catch(e=>{update(controller.signal.aborted?'cancelled':'error',controller.signal.aborted?'Загрузка модели отменена.':e.message);})
   .finally(()=>{pending=null;});
  return {started:true,model:name,bytes:embedding.MODELS[name].bytes};
 }
 const company=s.companyId;
 const timer=setInterval(()=>{if(s.companyId!==company||s.smoke)return;index.tick();},60000);timer.unref?.();
 // First refresh shortly after start, not during it.
 const first=setTimeout(()=>{if(s.companyId===company&&!s.smoke)index.tick();},20000);first.unref?.();
 const close=async()=>{clearInterval(timer);clearTimeout(first);controller?.abort();await index.close();};

 const api={
  add:(collection,items)=>index.add(collection,items),
  remove:(collection,ids)=>index.remove(collection,ids),
  search:(target,query,options)=>index.search(target,query,options),
  sync:collection=>index.sync(collection),
  collections:()=>index.collections(),
  enabled:id=>index.enabled(id),
  // Turning a collection on starts its first indexing (and the model download when the model is missing).
  async enable(id,on=true){
   const p=providers.find(x=>x.id===id);if(!p)throw Error('Нет такой коллекции.');
   if(on&&!usable(p))throw Error('Сначала добавьте и настройте приложение «'+p.name+'».');
   index.setEnabled(id,!!on);
   if(on){const st=await embedderOf().status();if(st.reachable&&!st.installed)prepareModel();else if(typeof p.list==='function')index.sync(id).catch(()=>{});}
   else{index.lastSync.delete(id);}
   return index.collections();
  },
  status:async()=>{const st=await embedderOf().status();return {...index.status(),model:embedderOf().model,modelBytes:embedding.MODELS[embedderOf().model].bytes,modelInstalled:st.installed,ollama:st.reachable,preparing:model.busy?model:null};},
  prepareModel,
  cancelModel:()=>{controller?.abort();return model;},
  modelState:()=>model,modelNotice:()=>model.phase==='idle'?null:modelNotice(),
  pause:()=>{index.pause();s.saveSettings({semanticIndexPaused:'true'},true);return index.status();},
  resume:()=>{index.resume();s.saveSettings({semanticIndexPaused:'false'},true);return index.status();},
  wipe:collection=>index.wipe(collection),
  index,close
 };
 return api;
}

module.exports={name:'semanticIndex',KIND,load,check,create,
 defaults:{semanticIndexCollections:'{}',semanticIndexModel:embedding.DEFAULT_MODEL,semanticIndexPaused:'false'},
 validate(next){
  if(next.semanticIndexModel!==undefined&&!embedding.known(next.semanticIndexModel))throw Error('Эта модель не подходит для индекса по смыслу.');
  if(next.semanticIndexCollections!==undefined){let o;try{o=JSON.parse(next.semanticIndexCollections);}catch{o=null;}if(!o||typeof o!=='object'||Array.isArray(o)||Object.values(o).some(v=>v!==true))throw Error('Проверьте список коллекций индекса.');}
  if(next.semanticIndexPaused!==undefined&&!['true','false'].includes(next.semanticIndexPaused))throw Error('Проверьте паузу индекса.');
 },
 setup(s){
  let power=null;try{power=require('electron').powerMonitor;}catch{power=null;}
  // On battery the queue waits: indexing is not worth the charge.
  const api=create(s,{busy:()=>{try{return !!power?.isOnBatteryPower?.();}catch{return false;}}});
  try{require('electron').app.once('before-quit',()=>api.close());}catch{/* outside Electron */}
  const ipc={
   collections:()=>api.collections(),status:()=>api.status(),enable:(id,on)=>api.enable(String(id),on!==false),
   sync:id=>{api.sync(String(id)).catch(()=>{});return api.collections();},
   prepareModel:()=>api.prepareModel(),cancelModel:()=>api.cancelModel(),
   pause:()=>api.pause(),resume:()=>api.resume(),wipe:id=>api.wipe(id?String(id):undefined),
   // The notification cards to restore after a window reload.
   progress:()=>[api.index.snapshot,api.modelNotice()].filter(Boolean)
  };
  return {semanticIndex:api,ipc};
 }};
