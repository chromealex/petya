// «Поиск файлов по смыслу»: finds the user's files by what they are about («где презентация про Китай с графиком
// LTV?», «найди скрипт, который сохраняет прогресс») through the semantic index (src/features/semantic-index.cjs),
// collection «files» (collection.cjs). The index is opt-in: until the user presses «Включить» in the card or turns
// it on in the settings, nothing is read and nothing is downloaded. Opening a file, showing it in the folder and
// attaching it to the chat happen only on a card button.
const fs=require('node:fs');
const path=require('node:path');
const kit=require('../app-kit.cjs');
const route=require('./route.cjs');
const folders=require('./folders.cjs');
const ID='file-search',BY='Поиск файлов',COLLECTION='files';
// Paths in the card start with «~» instead of the home folder.
const shown=p=>{const home=require('node:os').homedir();return home&&(p===home||p.startsWith(home+path.sep))?'~'+p.slice(home.length):p;};

const deps={
 shell:()=>require('electron').shell,
 chooseFolder:async win=>{const {t}=require('../../interface-language.cjs');const r=await require('electron').dialog.showOpenDialog(win,{title:t('Какую папку искать по смыслу?'),properties:['openDirectory']});return r.canceled?'':r.filePaths[0]||'';}
};

// The best piece of text around the first highlighted word, with the highlight ranges moved into it.
function snippet(text,ranges,size=320){
 const t=String(text||'');
 const first=ranges?.[0]?.[0]??0;
 let start=Math.max(0,first-90);if(start>0){const space=t.lastIndexOf(' ',start);if(space>start-30)start=space+1;}
 let end=Math.min(t.length,start+size);if(end<t.length){const space=t.indexOf(' ',end);if(space>0&&space<end+30)end=space;}
 const body=t.slice(start,end).replace(/\s+/g,' ');
 // Ranges were computed on the raw text: recompute on the collapsed piece by word match to stay exact.
 const words=(ranges||[]).map(([a,b])=>t.slice(a,b).toLowerCase());
 const out=[];const re=/[\p{L}\p{N}]+/gu;let m;
 while((m=re.exec(body))&&out.length<20)if(words.includes(m[0].toLowerCase()))out.push([m.index,m.index+m[0].length]);
 return {text:(start>0?'… ':'')+body+(end<t.length?' …':''),ranges:out.map(([a,b])=>start>0?[a+2,b+2]:[a,b])};
}
function row(hit,kinds){
 const m=hit.meta||{},file=String(m.path||hit.id);
 let exists=true;try{exists=fs.statSync(file).isFile();}catch{exists=false;}
 const s=snippet(hit.text,hit.ranges);
 return {path:file,name:path.basename(file),dir:path.dirname(file),shown:shown(path.dirname(file)),ext:path.extname(file).slice(1).toLowerCase(),kind:String(m.type||'text'),
  snippet:s.text,ranges:s.ranges,score:Math.round(Math.max(0,Math.min(1,hit.cosine??hit.score))*1000)/1000,
  boost:kinds.includes(m.type),mtime:Number(m.mtime)||0,size:Number(m.size)||0,loc:hit.loc||{},exists};
}

async function setupCard(s,command,want,{status,roots}){
 const model=status.model,bytes=status.modelBytes;
 const card={state:'setup',query:want.query,request:command,model,bytes,modelInstalled:!!status.modelInstalled,ollama:!!status.ollama,
  folders:roots.map(r=>({path:r.path,shown:shown(r.path),project:r.project||'',own:!!r.own})),platform:process.platform};
 const text=!roots.length?'Чтобы искать файлы по смыслу, добавьте папку: нажмите «Добавить папку» в карточке или в настройках приложения.'
  :'Поиск по смыслу работает по локальному индексу папок — он ещё не включён. Нажмите «'+(status.modelInstalled?'Включить индекс':'Скачать модель и включить')+'» в карточке: '+(status.modelInstalled?'':'скачаю модель '+model+' ('+Math.round(bytes/1e6)+' МБ), ')+'проиндексирую '+roots.length+' '+kit.plural(roots.length,['папку','папки','папок'])+' на этом компьютере, ничего никуда не отправляя.';
 return kit.reply(s,command,{by:BY,question:true,text,data:{fileSearch:card}});
}

async function searchTurn(s,command,want){
 const index=s.semanticIndex;
 if(!index)return kit.reply(s,command,{by:BY,error:true,text:'Индекс по смыслу недоступен. Перезапустите Петю.'});
 const status=await index.status();
 const roots=folders.roots(s);
 if(!index.enabled(COLLECTION)||!roots.length)return setupCard(s,command,want,{status,roots});
 s.requestProgress?.report('Ищу по смыслу в индексе файлов');
 let r;
 try{r=await index.search(COLLECTION,want.query,{k:8});}
 catch(e){return kit.failure(s,command,BY,e);}
 const building=status.phase&&status.phase!=='idle'&&status.collection===COLLECTION?{phase:status.phase,done:status.done||0,total:status.total||0,paused:!!status.paused}:null;
 const stats=index.collections().find(c=>c.id===COLLECTION)||{};
 if(!r.ready){
  const text=r.code==='model'?'Для поиска нужна модель '+status.model+'. Скачайте её кнопкой в карточке — это займёт '+Math.round(status.modelBytes/1e6)+' МБ.':'Не получилось спросить локальную модель: '+(r.error||'Ollama недоступна')+'. Запустите Ollama и повторите.';
  return kit.reply(s,command,{by:BY,question:r.code==='model',error:r.code!=='model',text,data:{fileSearch:{state:r.code==='model'?'model':'error',query:want.query,request:command,model:status.model,bytes:status.modelBytes,error:r.error||''}}});
 }
 const hits=r.hits.map(h=>row(h,want.kinds)).filter(h=>h.exists);
 // The kind of file the request names («презентация», «скрипт») is a small preference, not a filter.
 hits.sort((a,b)=>(b.score+(b.boost?0.03:0))-(a.score+(a.boost?0.03:0)));
 const card={state:'results',query:want.query,request:command,hits:hits.slice(0,8),indexed:stats.items||0,chunks:stats.chunks||0,folders:roots.length,building,platform:process.platform};
 let text;
 if(hits.length)text='Нашёл по смыслу '+hits.length+' '+kit.plural(hits.length,['файл','файла','файлов'])+'. Больше всего похоже: '+hits[0].name+'.';
 else if(building)text='Пока ничего похожего: индекс ещё строится ('+building.done+' из '+building.total+'). Спросите чуть позже.';
 else if(!stats.items)text='Индекс файлов пока пуст. Он строится в фоне — спросите через пару минут.';
 else text='В проиндексированных папках ничего похожего не нашёл. Попробуйте описать иначе или добавьте папку в настройках.';
 return kit.reply(s,command,{by:BY,text,data:{fileSearch:card}});
}

async function turn(s,command){
 const want=route.wanted(command);
 if(!want||!kit.installed(s,ID))return null;
 return searchTurn(s,String(command),want);
}

function setup(s){
 // Only files under the indexed folders can be opened, shown or attached from the card.
 const allowed=file=>{const abs=path.resolve(String(file||''));if(!folders.inside(s,abs))throw Error('Этот файл не из папок поиска.');if(!fs.existsSync(abs))throw Error('Файла уже нет на месте: '+path.basename(abs)+'.');return abs;};
 const saveFolders=list=>s.saveSettings({fileSearchFolders:JSON.stringify([...new Set(list)])},true);
 const index=()=>{if(!s.semanticIndex)throw Error('Индекс по смыслу недоступен.');return s.semanticIndex;};
 const status=async()=>{
  const st=await index().status();const info=index().collections();
  return {enabled:index().enabled(COLLECTION),project:s.settings.fileSearchProject!=='false',folders:folders.roots(s,{all:true}),
   index:st,files:info.find(c=>c.id===COLLECTION)||null,others:info.filter(c=>c.builtin).map(({id,name,description,collects,enabled,items})=>({id,name,description,collects,enabled,items}))};
 };
 const ipc={
  status,
  async open(file){const abs=allowed(file);const error=await deps.shell().openPath(abs);if(error)throw Error(error);return {opened:abs};},
  reveal(file){const abs=allowed(file);deps.shell().showItemInFolder(abs);return {shown:abs};},
  // Attaches the file to the current chat so the next question is answered from its text.
  async ask(file){
   const abs=allowed(file);
   if(!s.attachments?.add)throw Error('Вложения сейчас недоступны.');
   const size=fs.statSync(abs).size;if(size>10*1024*1024)throw Error('Файл больше 10 МБ — откройте его и пришлите нужную часть.');
   const info=await s.attachments.add(path.basename(abs),fs.readFileSync(abs));
   return {attached:info?.name||path.basename(abs)};
  },
  // The user's explicit «включить»: turns the collection on; the index downloads the model if it is missing.
  async enable(on=true){await index().enable(COLLECTION,on!==false);return status();},
  async enableOther(id,on){if(!['chats','meetings'].includes(id))throw Error('Нет такой коллекции.');await index().enable(id,on!==false);return status();},
  async addFolder(){
   const dir=await deps.chooseFolder(s.win);if(!dir)return status();
   saveFolders([...folders.extra(s.settings),dir]);
   if(index().enabled(COLLECTION))index().sync(COLLECTION).catch(()=>{});
   return status();
  },
  async removeFolder(dir){
   saveFolders(folders.extra(s.settings).filter(p=>p!==dir));
   if(index().enabled(COLLECTION))index().sync(COLLECTION).catch(()=>{});
   return status();
  },
  async setProject(on){s.saveSettings({fileSearchProject:String(on!==false)},true);if(index().enabled(COLLECTION))index().sync(COLLECTION).catch(()=>{});return status();},
  async refresh(){index().sync(COLLECTION).catch(()=>{});return status();},
  prepareModel:()=>index().prepareModel(),
  pause:()=>{index().pause();return status();},
  resume:()=>{index().resume();return status();},
  async wipe(){await index().wipe();return status();}
 };
 return {ipc};
}

module.exports={name:'fileSearch',defaults:{['extension_'+ID]:'false',fileSearchFolders:'[]',fileSearchProject:'true'},
 validate(next){
  if(next.fileSearchFolders!==undefined){let list;try{list=JSON.parse(next.fileSearchFolders);}catch{list=null;}if(!Array.isArray(list)||list.length>50||list.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw Error('Проверьте папки поиска по смыслу.');}
  if(next.fileSearchProject!==undefined&&!['true','false'].includes(next.fileSearchProject))throw Error('Проверьте настройку папок проекта.');
 },
 // A search is read-only: a dashboard may repeat it («документы про релиз» as a widget). No ready-made widgets.
 dashboard:{accepts:command=>!!route.wanted(command),size:'m',widgets:[]},
 setup,turn,searchTurn,snippet,row,deps};
