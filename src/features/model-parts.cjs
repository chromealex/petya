// Petya's own models as a group (docs/MODELS.md): R picks the function, A answers (optional), D writes requirement
// drafts. The group and its parts are described on the `models` branch of the public repository; adapters come from
// its releases, the base model from Hugging Face. Every file is checked against its SHA-256 before it is kept.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {Readable}=require('node:stream');
const SOURCE={raw:'https://raw.githubusercontent.com/chromealex/petya/models/',releases:'https://github.com/chromealex/petya/releases/download/',hub:'https://huggingface.co/'};
const ROLES={R:'Выбор функции',A:'Ответы и разговор',D:'Черновики требований'};
const NAME=/^[a-z][a-z0-9-]{0,40}$/,PART=/^[RAD][0-9]{1,4}$/,FILE=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/,DIGEST=/^[a-f0-9]{64}$/;
function create(s,{root,fetch:get=globalThis.fetch,source=SOURCE,group='andromeda'}={}){
 if(!NAME.test(group))throw Error('Неверное имя группы моделей.');
 const base=path.join(root,'groups',group),jobs=new Map(),choiceFile=path.join(base,'choice.json');let catalog=null,last=null;
 // The owner may pin a part to another published version (rollback); the choice is kept next to the downloads.
 const readChoice=()=>{try{const c=JSON.parse(fs.readFileSync(choiceFile,'utf8'));return c&&typeof c==='object'?c:{};}catch{return {};}};
 const emit=item=>{if(s.win&&!s.win.isDestroyed()&&!s.win.webContents.isDestroyed())s.win.webContents.send('model-parts-progress',item);};
 async function json(url){const r=await get(url);if(!r.ok)throw Error('Каталог моделей недоступен ('+r.status+').');return r.json();}
 // The group and every part, validated: names, sizes and digests only of the expected shape.
 async function load(force=false){
  if(catalog&&!force&&Date.now()-catalog.at<10*60000)return catalog;
  const g=await json(source.raw+group+'/group.json');
  if(!g||typeof g.version!=='string'||!g.components||!g.base?.files)throw Error('Неверный каталог группы моделей.');
  const files=Object.entries(g.base.files).map(([name,f])=>{if(!FILE.test(name)||!DIGEST.test(f.sha256)||!Number.isInteger(f.bytes))throw Error('Неверный список файлов базовой модели.');return {name,bytes:f.bytes,sha256:f.sha256};});
  if(!/^[\w.-]+\/[\w.-]+$/.test(g.base.repository)||!/^[a-f0-9]{40}$/.test(g.base.revision))throw Error('Неверная базовая модель.');
  const parts=[],choice=readChoice(),chosen={};
  for(const [letter,groupId] of Object.entries(g.components)){
   if(!ROLES[letter]||!PART.test(groupId)||groupId[0]!==letter)throw Error('Неверный состав группы моделей.');
   const versions=[...new Set([groupId,...(Array.isArray(g.versions?.[letter])?g.versions[letter]:[])])].filter(v=>typeof v==='string'&&PART.test(v)&&v[0]===letter);
   const id=versions.includes(choice[letter])?choice[letter]:groupId;chosen[letter]=id;
   const m=await json(source.raw+group+'/'+id+'/model.json');
   const adapter=Object.entries(m.adapter?.files||{}).map(([name,sha256])=>{if(!FILE.test(name)||!DIGEST.test(sha256))throw Error('Неверные файлы модели '+id+'.');return {name,sha256};});
   parts.push({id,letter,groupId,versions,role:ROLES[letter],optional:(g.optional||[]).includes(letter),status:String(m.status||''),bytes:Number(m.bytes)||0,files:adapter,url:source.releases+group+'-'+id.toLowerCase()+'/'});
  }
  const version=Object.keys(g.components).map(letter=>chosen[letter]).join('-');
  const pinned=Object.entries(g.components).some(([letter,id])=>chosen[letter]!==id);
  catalog={at:Date.now(),name:g.group,version:pinned?version:g.version,groupVersion:g.version,pinned,base:{id:'base',role:'Базовая модель · '+g.base.repository,repository:g.base.repository,revision:g.base.revision,bytes:files.reduce((n,f)=>n+f.bytes,0),files,url:source.hub+g.base.repository+'/resolve/'+g.base.revision+'/'},parts};
  return catalog;
 }
 const dir=item=>path.join(base,item.id==='base'?'base-'+item.revision.slice(0,12):item.id);
 const marker=item=>path.join(dir(item),'.verified.json');
 const installed=item=>{try{const v=JSON.parse(fs.readFileSync(marker(item),'utf8'));return item.files.every(f=>v[f.name]===f.sha256);}catch{return false;}};
 function view(c){
  const row=item=>{const job=jobs.get(item.id);return {id:item.id,role:item.role,optional:!!item.optional,status:item.status||'',bytes:item.bytes,installed:installed(item),groupId:item.groupId,versions:item.versions||[],needed:item.id!=='base'&&!item.files.length?'без своих весов: работает на базовой модели':'',busy:!!job,received:job?.received||0,total:item.bytes,error:job?null:last?.[item.id]||null};};
  return {group:c.name,version:'Petya '+c.name+' '+c.version,groupVersion:'Petya '+c.name+' '+c.groupVersion,pinned:!!c.pinned,base:row(c.base),parts:c.parts.map(row),folder:base};
 }
 const notice=(item,state)=>emit({id:'model-part:'+group+':'+item.id,part:item.id,title:'Модели Пети · '+(item.id==='base'?'базовая модель':item.id+' '+item.role.toLowerCase()),...state});
 // Downloads the files of one part (or the base model) into a temporary folder, checking every digest; the folder
 // replaces the old one only when everything matches. One download per part at a time.
 async function install(id){
  const c=await load();const item=id==='base'?c.base:c.parts.find(p=>p.id===id);
  if(!item)throw Error('Такой части группы нет.');if(!item.files.length)throw Error('У '+id+' нет своих весов: скачивать нечего.');
  if(jobs.has(id))return view(c);if(installed(item))return view(c);
  const job={controller:new AbortController(),received:0};jobs.set(id,job);last={...last,[id]:null};
  const target=dir(item),temp=target+'.download';
  (async()=>{
   try{
    await fsp.rm(temp,{recursive:true,force:true});await fsp.mkdir(temp,{recursive:true});const verified={};
    for(const f of item.files){
     const r=await get(item.url+encodeURIComponent(f.name),{signal:job.controller.signal,redirect:'follow'});if(!r.ok||!r.body)throw Error('Не удалось скачать '+f.name+' ('+r.status+').');
     const hash=createHash('sha256'),out=fs.createWriteStream(path.join(temp,f.name),{mode:0o600});let tick=0;
     for await(const chunk of Readable.fromWeb(r.body)){hash.update(chunk);job.received+=chunk.length;if(!out.write(chunk))await new Promise(done=>out.once('drain',done));if(Date.now()-tick>500){tick=Date.now();notice(item,{text:'Скачиваю '+f.name,busy:true,percent:item.bytes?Math.min(99,Math.floor(job.received*100/item.bytes)):undefined,version:'download'});}}
     await new Promise((done,fail)=>out.end(e=>e?fail(e):done()));
     if(hash.digest('hex')!==f.sha256)throw Error('Файл '+f.name+' не совпал с опубликованным хэшем.');verified[f.name]=f.sha256;
    }
    await fsp.writeFile(path.join(temp,'.verified.json'),JSON.stringify(verified));
    await fsp.rm(target,{recursive:true,force:true});await fsp.rename(temp,target);
    notice(item,{text:'Скачано и проверено',busy:false,kind:'success',version:'done'});
   }catch(e){await fsp.rm(temp,{recursive:true,force:true}).catch(()=>{});const stopped=job.controller.signal.aborted;last={...last,[id]:stopped?null:e.message};
    notice(item,{text:stopped?'Загрузка остановлена':e.message,busy:false,kind:stopped?'info':'error',version:stopped?'cancelled':'error',part:id,retry:!stopped});}
   finally{jobs.delete(id);emit({id:'model-parts:state'});}
  })();
  notice(item,{text:'Начинаю загрузку',busy:true,version:'download'});
  return view(c);
 }
 async function remove(id){const c=await load();const item=id==='base'?c.base:c.parts.find(p=>p.id===id);if(!item)throw Error('Такой части группы нет.');if(jobs.has(id))throw Error('Сначала остановите загрузку.');await fsp.rm(dir(item),{recursive:true,force:true});return view(c);}
 function cancel(id){jobs.get(id)?.controller.abort();return true;}
 // Pick a published version of one part; the group's own version clears the pin.
 async function choose(letter,id){
  const c=await load();const part=c.parts.find(p=>p.letter===letter);
  if(!part)throw Error('Такой части группы нет.');if(!part.versions.includes(id))throw Error('Такой версии '+letter+' нет среди опубликованных.');
  if(jobs.size)throw Error('Сначала дождитесь окончания загрузки.');
  const next={...readChoice()};if(id===part.groupId)delete next[letter];else next[letter]=id;
  await fsp.mkdir(base,{recursive:true});await fsp.writeFile(choiceFile,JSON.stringify(next));
  return view(await load(true));
 }
 return {status:async(force=false)=>view(await load(force)),install,cancel,remove,choose,
  // The folder of an installed part (for the runtime that runs it), or null.
  path:async id=>{const c=await load();const item=id==='base'?c.base:c.parts.find(p=>p.id===id);return item&&installed(item)?dir(item):null;}};
}
// Which model answers by default: Ollama models installed on this computer, and Petya's own service once its
// checked release is available and running (until then it is listed as not ready, not offered silently).
async function engines(s){
 let ollama=[],error='';
 try{const base=new URL(require('../core.cjs').localEndpoint(s.settings.ollamaUrl));const tags=await s.directRequest(new URL('/api/tags',base).href,{signal:AbortSignal.timeout(3000)});
  ollama=(Array.isArray(tags?.models)?tags.models:[]).filter(m=>typeof m.name==='string'&&m.name!=='petya-v1'&&!/cloud|embed/i.test(m.name)&&!m.remote_host&&!m.remote_model).map(m=>({name:m.name,size:Number(m.size)||0}));}
 catch(e){error='Ollama недоступна: '+e.message;}
 let own={ready:false,available:false,message:''};
 try{const st=s.modelRuntime?.invoke('status');own={ready:!!st?.releaseAvailable&&st.phase==='ready'&&st.model==='petya-v1',available:!!st?.releaseAvailable,message:st?.message||''};}catch{}
 return {current:s.settings.model||'',ollama,own,error};
}
module.exports={name:'modelParts',engines,defaults:{},validate(){},create,SOURCE,
 setup(s){const parts=create(s,{root:path.join(require('electron').app.getPath('userData'),'petya-models')});
  return {modelParts:parts,ipc:{status:force=>parts.status(!!force),install:id=>parts.install(String(id)),cancel:id=>parts.cancel(String(id)),remove:id=>parts.remove(String(id)),
   choose:(letter,id)=>parts.choose(String(letter),String(id)),engines:()=>engines(s)}};}
};
