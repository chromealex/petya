// The semantic index of one company: collections of items (files, chats, meetings, …) cut into pieces, embedded by
// a local model and searched by meaning. See docs/foundations/semantic-index.md for the contract apps use.
// Collections are opt-in one by one; nothing is read for a collection that is off. Indexing runs in a single
// background queue that yields between files and batches, can be paused, and reports to the notification center.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Collection}=require('./store.cjs');
const chunker=require('./chunk.cjs');
const {redact}=require('./ignore.cjs');

const ID=/^[a-z][a-z0-9-]{0,63}$/;
const LIMITS={items:20000,chunks:200000,perItem:chunker.MAX_PIECES,meta:2048};
const NOTICE='semantic-index';
const sleepFor=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(signal.reason||Error('Отменено.'));return;}
 const t=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
 const stop=()=>{clearTimeout(t);reject(signal.reason||Error('Отменено.'));};
 signal?.addEventListener('abort',stop,{once:true});
});
const yieldNow=()=>new Promise(r=>setImmediate(r));
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};

// Query words for the small lexical bonus and the highlight: letters/digits of 3+ characters, compared by their first
// stem (up to six characters, one less than a short word) so «монетизации» meets «монетизация» and «Китаю» «Китай».
const STOP=new Set(['где','как','что','это','про','для','все','всё','его','она','они','мне','мой','мои','найди','найти','покажи','поищи','файл','файлы','файла','документ','документы','который','которая','которое','которые','есть','был','была','были','with','the','and','for']);
function terms(query){
 return [...new Set((String(query||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!STOP.has(w)).map(w=>w.slice(0,Math.max(3,Math.min(6,w.length-1)))))].slice(0,12);
}
// Character ranges [start, end) of words in `text` that start like one of the query terms.
function ranges(text,list){
 if(!list.length)return [];
 const out=[];const re=/[\p{L}\p{N}]+/gu;let m;
 while((m=re.exec(text))&&out.length<40){const w=m[0].toLowerCase();if(w.length>=3&&list.some(t=>w.startsWith(t)||t.length>=4&&w.length>=4&&t.startsWith(w)))out.push([m.index,m.index+m[0].length]);}
 return out;
}
// Metadata prefilter: {type, types, pathPrefix, ids, meta:{key:value}} or a function (meta, id) → bool.
function filterOf(filter){
 if(!filter)return null;
 if(typeof filter==='function')return item=>filter(item.meta||{},item.id);
 const f=filter,ids=Array.isArray(f.ids)?new Set(f.ids.map(String)):null,types=Array.isArray(f.types)?f.types:f.type?[f.type]:null;
 const prefixes=[].concat(f.pathPrefix||[]).map(String).filter(Boolean);
 return item=>{
  const m=item.meta||{};
  if(ids&&!ids.has(item.id))return false;
  if(types&&!types.includes(m.type))return false;
  if(prefixes.length&&!prefixes.some(p=>String(m.path||'').startsWith(p)))return false;
  for(const [k,v] of Object.entries(f.meta||{}))if(m[k]!==v)return false;
  return true;
 };
}
function compactMeta(meta,limit=LIMITS.meta){
 const out={};
 for(const [k,v] of Object.entries(meta&&typeof meta==='object'?meta:{})){
  if(!/^[A-Za-z][\w-]{0,40}$/.test(k))continue;
  if(typeof v==='string')out[k]=v.slice(0,600);else if(typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean')out[k]=v;
 }
 while(JSON.stringify(out).length>limit){const keys=Object.keys(out);if(!keys.length)break;delete out[keys.at(-1)];}
 return out;
}
const hashOf=content=>crypto.createHash('sha1').update(JSON.stringify([content.type||'',content.text??'',content.messages??'',content.chunks??''])).digest('hex');

class SemanticIndex{
 // root: <company data>/semantic-index. embedder(): the Embedder for the chosen model, or null when none is set.
 // providers(): collection definitions (see validate in src/features/semantic-index.cjs). enabled(id)/setEnabled(id, on)
 // keep the opt-in. publish(notice) goes to the notification center. busy() holds the queue (e.g. on battery).
 constructor({root,embedder,providers,services={},enabled,setEnabled=()=>{},publish=()=>{},busy=()=>false,throttle=20,limits={},onError=()=>{}}){
  Object.assign(this,{root,embedderOf:embedder,providersOf:providers,services,isEnabled:enabled,setEnabled,publish,busy,throttle,onError});
  this.limits={...LIMITS,...limits};
  this.stores=new Map();this.queue=[];this.running=null;this.paused=false;this.closed=false;this.lastSync=new Map();this.state={phase:'idle'};this.errors=new Map();
  this.controller=new AbortController();this.shown=false;this.last=0;
 }
 provider(id){return (this.providersOf()||[]).find(p=>p.id===id)||null;}
 embedder(){return this.embedderOf();}
 store(id){
  if(!ID.test(id))throw Error('Некорректное имя коллекции.');
  const e=this.embedder();if(!e)throw Error('Модель для индекса не выбрана.');
  const key=id+'\0'+e.model;
  let s=this.stores.get(key);
  if(!s){s=new Collection(path.join(this.root,id),{model:e.model,dim:e.dim});this.stores.set(key,s);}
  return s;
 }
 // Existing stores only: searching never creates an empty collection on disk.
 storeIfAny(id){const e=this.embedder();if(!e||!fs.existsSync(path.join(this.root,id,'meta.json')))return null;return this.store(id);}
 collections(){
  return (this.providersOf()||[]).map(p=>{
   let stats=null;try{stats=this.storeIfAny(p.id)?.stats()||null;}catch{stats=null;}
   return {id:p.id,name:p.name,description:p.description||'',collects:p.collects||'',extension:p.extension||'',builtin:!!p.builtin,enabled:this.enabled(p.id),
    automatic:typeof p.list==='function',items:stats?.items||0,chunks:stats?.chunks||0,bytes:stats?.bytes||0,lastSync:this.lastSync.get(p.id)||0,error:this.errors.get(p.id)||'',recovered:stats?.recovered||''};
  });
 }
 enabled(id){try{return !!this.provider(id)&&!!this.isEnabled(id);}catch{return false;}}
 status(){
  return {...this.state,paused:this.paused,queue:this.queue.length+(this.running?1:0),model:this.embedder()?.model||''};
 }

 // --- Jobs ------------------------------------------------------------------------------------------------------
 enqueue(job){
  if(this.closed)return Promise.reject(Error('Индекс закрыт.'));
  // One pending sync per collection: a second request joins the first.
  if(job.type==='sync'){const same=this.queue.find(j=>j.type==='sync'&&j.collection===job.collection);if(same)return same.promise;}
  job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  job.promise.catch(()=>{});
  this.queue.push(job);this.kick();return job.promise;
 }
 kick(){if(!this.running&&!this.closed)this.running=this.loop().finally(()=>{this.running=null;if(this.queue.length&&!this.closed)this.kick();});}
 async loop(){
  while(this.queue.length&&!this.closed){
   const job=this.queue[0];
   try{job.resolve(await this.process(job));}
   catch(e){
    if(this.closed||this.controller.signal.aborted){job.reject(e);}
    else{
     const repeated=this.errors.get(job.collection)===e.message;
     this.errors.set(job.collection,e.message);job.reject(e);this.onError(e,job);
     // A stopped Ollama is waited out quietly; the same error is not announced again on every refresh.
     if(e.code!=='ollama'&&!repeated)this.notice({text:'«'+(this.provider(job.collection)?.name||job.collection)+'»: '+e.message,busy:false,kind:'error',code:e.code||'',version:'error:'+job.collection+':'+e.message},true);
    }
   }
   finally{this.queue.shift();}
  }
  if(!this.closed)this.state={phase:'idle'};
 }
 async gate(){
  const signal=this.controller.signal;
  signal.throwIfAborted();
  while(this.paused||this.busy()){await sleepFor(500,signal);}
  await yieldNow();
 }
 async ready(){
  const e=this.embedder();if(!e)throw Object.assign(Error('Модель для индекса не выбрана.'),{code:'model'});
  if(this.modelChecked&&Date.now()-this.modelChecked<60000)return e;
  const st=await e.status();
  if(!st.reachable)throw Object.assign(Error('Ollama не запущен: индекс подождёт.'),{code:'ollama'});
  if(!st.installed)throw Object.assign(Error('Нужна модель '+e.model+' — скачайте её в настройках приложения.'),{code:'model'});
  this.modelChecked=Date.now();return e;
 }
 async process(job){
  const p=this.provider(job.collection);
  if(!p)throw Error('Коллекция «'+job.collection+'» не зарегистрирована.');
  // Removing needs neither the model nor the opt-in: forgetting is always allowed.
  if(job.type==='remove'){const store=this.storeIfAny(job.collection);let n=0;if(store)for(const id of job.ids)if(store.remove(String(id)))n++;return {removed:n};}
  if(!this.enabled(job.collection))throw Error('Коллекция «'+p.name+'» выключена. Включите её в настройках.');
  await this.ready();
  const store=this.store(job.collection);
  this.errors.delete(job.collection);
  if(job.type==='add')return this.ingestAll(p,store,job.items.map(i=>({entry:i,content:i})));
  // sync: list what the collection has now, drop what is gone, read and index what changed.
  this.state={phase:'listing',collection:p.id,name:p.name,done:0,total:0};
  const listed=await p.list(this.services,{signal:this.controller.signal,gate:()=>this.gate()});
  if(!Array.isArray(listed))throw Error('Коллекция «'+p.name+'» вернула некорректный список.');
  const entries=[];const seen=new Set();
  for(const e of listed){if(e&&typeof e.id==='string'&&e.id&&!seen.has(e.id)&&entries.length<this.limits.items){seen.add(e.id);entries.push(e);}}
  let removed=0;for(const id of store.ids())if(!seen.has(id)){store.remove(id);removed++;}
  const todo=entries.filter(e=>store.get(e.id)?.version!==String(e.version??''));
  const result=await this.ingestAll(p,store,todo.map(entry=>({entry,read:true})));
  this.lastSync.set(p.id,Date.now());
  return {...result,removed,total:entries.length,truncated:listed.length>entries.length};
 }
 async ingestAll(p,store,list){
  const counts={indexed:0,unchanged:0,skipped:0,failed:0,chunks:0};
  if(!list.length)return counts;
  const started=Date.now();let fails=0;
  this.state={phase:'indexing',collection:p.id,name:p.name,done:0,total:list.length};
  for(let i=0;i<list.length;i++){
   await this.gate();
   this.state={...this.state,done:i,current:String(list[i].entry.meta?.title||list[i].entry.meta?.path||list[i].entry.id).slice(0,200)};
   this.progress(false,list.length>3);
   try{
    const content=list[i].read?await p.read(this.services,list[i].entry,{signal:this.controller.signal}):list[i].content;
    const r=await this.ingest(store,list[i].entry,content);
    counts[r.result]++;counts.chunks+=r.chunks||0;fails=0;
   }catch(e){
    if(this.controller.signal.aborted||e?.code==='limit')throw e;
    // A model or Ollama failure stops the run (nothing would succeed); one unreadable item does not.
    if(e?.status===404||/model .*not found/i.test(e.message||'')){this.modelChecked=0;throw Object.assign(Error('Модель индекса недоступна в Ollama. Скачайте её снова в настройках.'),{code:'model'});}
    counts.failed++;if(++fails>=5)throw Error('Не получается проиндексировать подряд пять элементов: '+e.message);
   }
  }
  this.state={...this.state,done:list.length,current:''};
  this.progress(true,Date.now()-started>1500||counts.indexed>3,counts);
  return counts;
 }
 // One item: content {text|messages|chunks, type, meta, title} → pieces → vectors → store. Same content hash keeps
 // the old vectors and only records the new version.
 async ingest(store,entry,content){
  const id=String(entry.id),version=String(entry.version??content?.version??'');
  if(!content||content.skip){store.remove(id);return {result:'skipped'};}
  const type=content.type||entry.type||'text';
  const clean={type};
  if(typeof content.text==='string')clean.text=redact(content.text).text;
  if(Array.isArray(content.messages))clean.messages=content.messages.slice(0,5000).map(m=>({who:String(m?.who||'').slice(0,80),text:redact(String(m?.text||'')).text,...m?.at?{at:m.at}:{}}));
  if(Array.isArray(content.chunks))clean.chunks=content.chunks.slice(0,this.limits.perItem).map(c=>typeof c==='string'?redact(c).text:{text:redact(String(c?.text||'')).text,loc:c?.loc});
  const hash=hashOf(clean);
  const old=store.get(id);
  const meta=compactMeta({...entry.meta,...content.meta,type:entry.meta?.type||content.meta?.type||type});
  if(old&&old.hash===hash){store.touch(id,version);return {result:'unchanged'};}
  const pieces=chunker.chunk(clean).slice(0,this.limits.perItem);
  if(!pieces.length){store.remove(id);return {result:'skipped'};}
  if(store.chunks-(old?.chunks||0)+pieces.length>this.limits.chunks)throw Object.assign(Error('Индекс коллекции достиг предела в '+this.limits.chunks+' фрагментов. Уберите лишние папки или исключите их.'),{code:'limit'});
  const title=String(content.title||meta.title||'').slice(0,200);
  const embedder=await this.ready();
  const vectors=[];
  for(let i=0;i<pieces.length;i+=embedder.batch){
   await this.gate();
   vectors.push(...await embedder.embed(pieces.slice(i,i+embedder.batch).map(p=>(title?title+'\n':'')+p.text),{signal:this.controller.signal}));
   if(this.throttle)await sleepFor(this.throttle,this.controller.signal);
  }
  store.put(id,{version,hash,meta,pieces,vectors});
  return {result:'indexed',chunks:pieces.length};
 }
 // Notification center: one card for the queue, shown only for real work (not a no-op refresh).
 notice(item,force=false){
  const now=Date.now();if(!force&&now-this.last<300)return;this.last=now;
  this.snapshot={id:NOTICE,title:'Индекс по смыслу',...item};
  try{this.publish(this.snapshot);}catch{/* window closing */}
 }
 progress(done,show,counts){
  const st=this.state;
  if(!done){
   if(!show&&!this.shown)return;
   this.shown=true;
   const percent=st.total?Math.floor(st.done*100/st.total):undefined;
   this.notice({text:(this.paused?'На паузе · ':'')+'«'+st.name+'»: '+st.done+' из '+st.total+(st.current?' · '+st.current:''),busy:!this.paused,paused:this.paused,percent,kind:this.paused?'attention':'info',version:'running:'+st.collection},this.paused);
   return;
  }
  if(!show&&!this.shown)return;
  this.shown=false;
  const store=this.storeIfAny(st.collection);
  const total=store?store.size:0;
  this.notice({text:'«'+st.name+'» готово: '+total+' '+plural(total,['элемент','элемента','элементов'])+' в индексе'+(counts?.failed?' · не прочитано: '+counts.failed:''),busy:false,kind:counts?.failed?'attention':'success',version:'done:'+Date.now()},true);
 }

 // --- Public API (see docs/foundations/semantic-index.md) ------------------------------------------------------------
 add(collection,items){
  if(!Array.isArray(items))return Promise.reject(Error('Нужен список элементов.'));
  const list=items.filter(i=>i&&typeof i.id==='string'&&i.id);
  return this.enqueue({type:'add',collection,items:list});
 }
 remove(collection,ids){return this.enqueue({type:'remove',collection,ids:[].concat(ids||[]).map(String)});}
 sync(collection){
  const p=this.provider(collection);
  if(!p||typeof p.list!=='function')return Promise.reject(Error('Эту коллекцию нельзя обновить автоматически.'));
  return this.enqueue({type:'sync',collection});
 }
 // target: a collection id, a list of ids, or '*' (every enabled collection). Hits: best piece per item, sorted.
 async search(target,query,{k=8,filter,perItem=1,minScore=0,lexical=true,signal}={}){
  const text=String(query||'').trim();if(!text)throw Error('Пустой запрос.');
  const ids=target==='*'?(this.providersOf()||[]).map(p=>p.id):[].concat(target);
  const wanted=ids.filter(id=>this.enabled(id));
  const stores=wanted.map(id=>{try{return [id,this.storeIfAny(id)];}catch{return [id,null];}}).filter(([,s])=>s&&s.size);
  const base={collections:stores.map(([id])=>id),off:ids.filter(id=>!wanted.includes(id)),status:this.status()};
  if(!stores.length)return {...base,hits:[],ready:!!this.embedder()};
  let embedder;
  try{embedder=await this.ready();}catch(e){return {...base,hits:[],ready:false,error:e.message,code:e.code||''};}
  const [q]=await embedder.embed([text],{query:true,signal});
  const words=lexical?terms(text):[];
  const allow=filterOf(filter);
  let hits=[];
  for(const [id,store] of stores){
   for(const h of store.search(q,{k:Math.max(k,8)*2,allow,perItem})){
    const hay=(h.text+' '+(h.meta?.title||'')+' '+(h.meta?.path||'')).toLowerCase();
    const bonus=words.length?Math.min(0.06,0.02*words.filter(w=>hay.includes(w)).length):0;
    hits.push({collection:id,id:h.id,score:h.score+bonus,cosine:h.score,chunk:h.chunk,text:h.text,loc:h.loc,meta:h.meta,version:h.version,ranges:ranges(h.text,words)});
   }
  }
  hits=hits.filter(h=>h.score>=minScore).sort((a,b)=>b.score-a.score).slice(0,k*perItem);
  return {...base,hits,ready:true};
 }
 pause(){this.paused=true;if(this.state.phase==='indexing')this.progress(false,true);return this.status();}
 resume(){this.paused=false;if(this.state.phase==='indexing')this.progress(false,true);this.kick();return this.status();}
 // Deletes every vector and snippet of a collection (or all) and switches it off; a running job is cancelled.
 async wipe(collection){
  const ids=collection?[collection]:(this.providersOf()||[]).map(p=>p.id);
  if(collection&&!ID.test(collection))throw Error('Некорректное имя коллекции.');
  this.controller.abort(Error('Индекс стирается.'));
  for(const j of this.queue.splice(this.running?1:0))j.reject(Error('Индекс стёрт.'));
  await this.running?.catch(()=>{});
  this.controller=new AbortController();
  for(const id of ids){try{this.setEnabled(id,false);}catch{/* settings closed */}this.lastSync.delete(id);this.errors.delete(id);}
  for(const key of [...this.stores.keys()])if(!collection||key.startsWith(collection+'\0'))this.stores.delete(key);
  if(collection)fs.rmSync(path.join(this.root,collection),{recursive:true,force:true});
  else fs.rmSync(this.root,{recursive:true,force:true});
  this.state={phase:'idle'};this.shown=false;
  this.notice({text:collection?'Индекс «'+(this.provider(collection)?.name||collection)+'» стёрт.':'Индекс по смыслу стёрт.',busy:false,kind:'success',version:'wiped:'+Date.now()},true);
  return this.collections();
 }
 // Background refresh: every enabled automatic collection is synced once after start and then by its `refresh`.
 tick(now=Date.now()){
  if(this.closed)return;
  for(const p of this.providersOf()||[]){
   if(typeof p.list!=='function'||!this.enabled(p.id))continue;
   const every=(Number.isFinite(p.refresh)?p.refresh:30)*60000;
   const last=this.lastSync.get(p.id)||0;
   if(!last||every>0&&now-last>=every){this.lastSync.set(p.id,now);this.sync(p.id).catch(()=>{});}
  }
 }
 async close(){this.closed=true;this.controller.abort(Error('Индекс закрыт.'));for(const j of this.queue.splice(this.running?1:0))j.reject(Error('Индекс закрыт.'));await this.running?.catch(()=>{});}
}

module.exports={SemanticIndex,terms,ranges,filterOf,compactMeta,LIMITS,NOTICE};
