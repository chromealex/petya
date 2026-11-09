// Pictures and videos from messages Petya keeps of a service (synced threads and chats), which the chat can attach
// and inspect («разбери скриншот из …»). Each messenger app provides its own:
//   "provides": { "media-source": "<file>.cjs" }
// exporting {id, name, candidates(items, settings) → [{contextId, messageId, name, size, title, at, url, …}],
//   allowed?(services, rows) → rows, fingerprint?(settings) → any, async download(services, row) → {name, bytes} |
//   {filePath, cleanup?}}. `items` are the context memory's records; a source answers only its own. `allowed` drops
// rows the current connection may not read (e.g. channels not chosen for the company); a changed `fingerprint`
// between listing and download refuses the import. Only sources of added apps count.
const {isVideo}=require('./attachments.cjs');
const KIND='media-source';
const supported=name=>/\.[a-z0-9_+-]{1,16}$/i.test(name||'');
const registry=()=>require('./extension-registry.cjs');
function load(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||typeof p.candidates!=='function'||typeof p.download!=='function'){
   const error=Error('Invalid media source '+x.extension+'/'+x.file);
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,setting:x.setting,source:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
const added=(x,settings)=>!x.setting||settings?.[x.setting]==='true';
// The newest 80 media of the added sources, each with a stable id.
function candidates(items,settings,{sources}={}){
 const rows=[];
 for(const x of (sources||load()).filter(x=>added(x,settings))){let found=[];try{found=x.source.candidates(items,settings)||[];}catch{found=[];}for(const r of found)if(supported(r.name))rows.push({...r,service:x.id});}
 return rows.sort((a,b)=>b.at-a.at).slice(0,80).map(r=>({...r,id:Buffer.from(JSON.stringify([r.service,r.contextId,r.messageId,r.fileId||''])).toString('base64url')}));
}
function create(s,{sources}={}){
 const all=()=>(sources||load()).filter(x=>added(x,s.settings));
 const list=()=>candidates(s.memory.prune(),s.settings,{sources:all()});
 const fingerprint=()=>JSON.stringify(all().map(x=>[x.id,x.source.fingerprint?.(s.settings)]));
 async function allowed(service){
  let rows=list().filter(r=>!service||r.service===service);
  for(const x of all())if(typeof x.source.allowed==='function'&&rows.some(r=>r.service===x.id)){const own=await x.source.allowed(s,rows.filter(r=>r.service===x.id));rows=rows.filter(r=>r.service!==x.id||own.includes(r));}
  return rows;
 }
 async function download(id,check){
  const row=list().find(r=>r.id===id);if(!row)throw Error('Вложение устарело. Обновите список источников.');
  const x=all().find(x=>x.id===row.service);if(!x)throw Error('Вложение устарело. Обновите список источников.');
  const file=await x.source.download(s,row);check?.();return {row,file};
 }
 return {list,allowed,download,fingerprint};
}
// «Посмотри скриншот из <service>»: the one matching picture or video is attached and inspected; several are offered
// as a choice; none is said. Called by the apps' chat routes («media» stage, src/features/chat-routes.cjs).
async function turn(s,command,{service,name}){
 if(!/(?:посмотри|разбери|проверь|объясни).*(?:скрин|картин|изображени|видео|ролик)/iu.test(command))return null;
 const wantVideo=/(?:видео|ролик)/iu.test(command),wantImage=/(?:скрин|картин|изображени)/iu.test(command);
 const rows=(await s.allowedMedia(service)).filter(r=>wantVideo&&!wantImage?isVideo(r.name):wantImage&&!wantVideo?!isVideo(r.name):true);
 if(!rows.length)return {handled:true,text:'В сохранённых сообщениях нет подходящих медиа. Обновите выбранные чаты '+name+' или прикрепите файл.'};
 if(rows.length>1)return {handled:true,text:'Какое вложение разобрать?',mediaChoices:rows.map(r=>({id:r.id,label:r.title+' · '+r.name+' · '+new Date(r.at).toLocaleString('ru-RU')})),mediaQuestion:command};
 const added=await s.importMedia(rows[0].id);return s.inspectAttachments([added.id],command);
}
module.exports={KIND,load,candidates,create,turn,supported};
