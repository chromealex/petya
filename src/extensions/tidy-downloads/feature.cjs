// «Уборка загрузок»: the Downloads folder in groups — installers of programs already installed, duplicates by hash,
// archives already extracted, large files not opened for N days, screenshots — with sizes and a preview. A chat turn
// only looks; moving to the Trash or into «Загрузки/Разобрано» happens from the card after the user confirmed the
// exact files, and every action lands in an undo list («Вернуть»). Sizes and the walk come from «Место на диске».
const os=require('node:os');
const path=require('node:path');
const kit=require('../app-kit.cjs');
const groups=require('./groups.cjs');
const actions=require('./actions.cjs');
const cancel=require('../../answer-cancel.cjs');
const ID='tidy-downloads',BY='Уборка загрузок',NOTICE='tidy-downloads-scan';

// «разбери загрузки», «что можно удалить из загрузок», «дубликаты в загрузках», «почисти папку Downloads».
const PLACE=/(?:^|[^\p{L}])(?:загрузк\p{L}*|загрузок|downloads)(?=$|[^\p{L}])/iu;
const ACT=/разбер\p{L}*|разобра\p{L}*|почист\p{L}*|очист\p{L}*|уборк\p{L}*|убер\p{L}*|убра\p{L}*|прибер\p{L}*|прибра\p{L}*|навед\p{L}* порядок|порядок в|(?:что|чего)\s+(?:можно\s+|стоит\s+|нужно\s+)?(?:удалить|убрать|выкинуть|выбросить|почистить|снести|стереть)|(?:можно|стоит|нужно)\s+(?:удалить|убрать|выкинуть|выбросить|почистить|снести)|дубликат\p{L}*|дубл\p{L}*|мусор\p{L}*|хлам\p{L}*|что\s+(?:лежит|занимает|скопилось|накопилось)|сколько\s+(?:места\s+)?занима\p{L}*|установщик\p{L}*|скриншот\p{L}*\s+в\s+загрузк/iu;
// Downloads in other senses: store installs, loading time and speed, server load, uploading a file, model downloads.
const AVOID=/загрузк\p{L}*\s+(?:приложени|игр|в\s+стор|в\s+app\s*store|в\s+google\s*play|сервер|процессор|cpu|gpu|памят|уровн|сцен|страниц|сайт|модел|билд|сборк|ассет|бандл)|(?:скорост|врем|экран)\p{L}*\s+загрузк|сколько\s+загрузок|загрузк\p{L}*\s+за\s+(?:день|недел|месяц|вчера|сегодня)|загрузи\b|загрузить|прогресс\p{L}*\s+загрузк|google ?drive|гугл[- ]?диск|в облак/iu;
const QUIET=/^(?:а\s+)?(?:как|что такое|зачем|почему)\s/iu;
const wanted=text=>{const t=String(text||'');return PLACE.test(t)&&ACT.test(t)&&!AVOID.test(t)&&!QUIET.test(t.trim());};
// «не открывал 60 дней», «старше двух месяцев», «за полгода».
function daysIn(text,fallback=30){
 const t=String(text||'');
 const words={одн:1,два:2,две:2,двух:2,три:3,трёх:3,трех:3,четыр:4,пят:5,шест:6};
 const m=/(?<![\p{L}\d])(\d{1,3}|одн\p{L}*|дв\p{L}*|тр\p{L}*|четыр\p{L}*|пят\p{L}*|шест\p{L}*)?\s*(дн\p{L}*|день|недел\p{L}*|месяц\p{L}*|полгода|год\p{L}*|лет)(?=$|[^\p{L}])/iu.exec(t);
 if(!m||!/не\s+открыва|старше|давн|за\s|не\s+трога|не\s+пользова/iu.test(t))return fallback;
 const unit=m[2].toLowerCase();const k=/^д/.test(unit)?1:/^н/.test(unit)?7:/^м/.test(unit)?30:/^пол/.test(unit)?180:365;
 let n=1;if(m[1])n=/^\d/.test(m[1])?Number(m[1]):Object.entries(words).find(([w])=>m[1].toLowerCase().startsWith(w))?.[1]||1;
 return Math.max(1,Math.min(3650,/^пол/.test(unit)?180:n*k));
}

const state={running:null,controller:null,operation:null,scans:new Map(),store:null};
const deps={
 trashItem:p=>require('electron').shell.trashItem(p),
 showItem:p=>require('electron').shell.showItemInFolder(p),
 openTrash:()=>{const platform=process.platform;try{if(platform==='darwin')require('electron').shell.openPath(path.join(os.homedir(),'.Trash'));else if(platform==='win32')require('node:child_process').execFile('explorer.exe',['shell:RecycleBinFolder']);}catch{/* nothing to open */}},
 downloads:()=>{try{return require('electron').app.getPath('downloads');}catch{return require('../disk-usage/scan.cjs').locations({platform:process.platform,home:os.homedir(),env:process.env}).downloads[0];}},
 installed:()=>require('../../desktop-apps.cjs').installed(),
 lastUsed:files=>process.platform==='darwin'?groups.spotlight(files):Promise.resolve({}),
 thumbnail:async(file)=>{
  const {nativeImage}=require('electron');
  let img=null;try{img=await nativeImage.createThumbnailFromPath(file,{width:240,height:150});}catch{img=null;}
  if(!img||img.isEmpty()){img=nativeImage.createFromPath(file);if(img.isEmpty())return '';const sz=img.getSize();img=img.resize(sz.width>=sz.height?{width:240}:{height:150});}
  return img.toDataURL();
 },
 home:()=>os.homedir(),platform:()=>process.platform,env:()=>process.env,now:()=>Date.now(),timeLimit:30000
};
function storeOf(s){
 const file=path.join(s.dataRoot||'.','extensions',ID,'undo.json');
 if(!state.store||state.store.file!==file)state.store={file,...actions.store(file)};
 return state.store;
}
function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}
const H=groups.human;
function summary(r){
 const free=r.groups.reduce((a,g)=>a+g.bytes,0);
 const parts=['В «Загрузках» '+H(r.total)+': файлов — '+r.files+(r.folders?', папок — '+r.folders:'')+'.'];
 if(r.groups.length)parts.push('Можно убрать около '+H(free)+': '+r.groups.map(g=>g.label.toLocaleLowerCase('ru')+' — '+H(g.bytes)).join(', ')+'.');
 else parts.push('Ничего явно лишнего не нашёл.');
 if(r.cancelled)parts.push('Проверка остановлена — показано, что успел.');
 else if(r.partial)parts.push('Проверка частичная: не уложился в лимит времени или часть файлов закрыта.');
 if(r.groups.length)parts.push('Отметьте файлы в карточке — в Корзину или в папку «Разобрано» только после вашего подтверждения, и всё можно вернуть.');
 return parts.join(' ');
}

async function look(s,command,days){
 const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 const controller=new AbortController(),outer=cancel.signal();
 const abort=()=>controller.abort();outer?.addEventListener('abort',abort,{once:true});
 state.running=id;state.controller=controller;
 publish(s,{text:'Смотрю «Загрузки»',busy:true,kind:'info',version:'running:'+id});
 try{
  const result=await groups.scan({root:deps.downloads(),platform:deps.platform(),installed:deps.installed(),lastUsed:deps.lastUsed,days,now:deps.now(),
   signal:controller.signal,timeLimit:deps.timeLimit,progress(stage,done,total){
    s.requestProgress?.report?.('Уборка загрузок: '+stage);
    publish(s,{text:stage+' · '+done+' из '+total,busy:true,percent:Math.round(done*100/total),kind:'info',version:'running:'+id});
   }});
  state.scans.set(id,result);while(state.scans.size>5)state.scans.delete(state.scans.keys().next().value);
  const free=result.groups.reduce((a,g)=>a+g.bytes,0);
  publish(s,{text:(result.partial?'Частично: ':'Готово: ')+'можно убрать ~'+H(free),busy:false,kind:result.partial?'attention':'success',version:'done:'+id});
  const card={scanId:id,at:deps.now(),root:result.root,total:result.total,files:result.files,folders:result.folders,days:result.days,partial:result.partial,cancelled:result.cancelled,skipped:result.skipped,elapsedMs:result.elapsedMs,platform:deps.platform(),
   groups:result.groups.map(g=>({id:g.id,label:g.label,note:g.note,bytes:g.bytes,items:g.items.slice(0,60)})),undo:storeOf(s).list().slice(0,5)};
  return kit.reply(s,command,{by:BY,text:summary(result),data:{tidyDownloads:card}});
 }catch(e){
  publish(s,{text:'Не получилось: '+e.message,busy:false,kind:'error',version:'error:'+id});
  return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message});
 }finally{outer?.removeEventListener('abort',abort);state.running=null;state.controller=null;}
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 if(state.running)return kit.reply(s,command,{by:BY,text:'Уже смотрю «Загрузки» — прогресс в уведомлениях.'});
 return look(s,command,daysIn(text));
}

// The scan's own entries for these paths; anything else (a forged or stale path) is refused before acting.
function pick(scanId,groupId,paths){
 const scan=state.scans.get(String(scanId));
 if(!scan)throw Error('Результат проверки устарел. Скажите «разбери загрузки» ещё раз.');
 const group=scan.groups.find(g=>g.id===groupId);if(!group)throw Error('Такой группы нет в результате проверки.');
 const wanted=[...new Set((Array.isArray(paths)?paths:[]).map(String))];
 if(!wanted.length)throw Error('Ничего не выбрано.');
 const items=wanted.map(p=>group.items.find(i=>i.path===p&&!i.removed));
 if(items.some(i=>!i))throw Error('Список изменился. Скажите «разбери загрузки» ещё раз.');
 return {scan,group,items};
}
const count=n=>n+' '+kit.plural(n,['файл','файла','файлов']);
function setup(s){
 return {ipc:{
  progress:()=>state.operation,
  cancel(){state.controller?.abort();return {stopped:!!state.controller};},
  // Called only after «В корзину» / «Переместить» under the listed files was pressed.
  async trash(scanId,groupId,paths){
   if(state.running)throw Error('Дождитесь окончания проверки.');
   const {scan,group,items}=pick(scanId,groupId,paths);
   const r=await actions.trash(items,{root:scan.root,trashItem:deps.trashItem,group:group.label});
   for(const i of group.items)if(r.removed.includes(i.path))i.removed=true;
   if(r.action)storeOf(s).add(r.action);
   return {...r,text:r.removed.length?'В Корзину: '+count(r.removed.length)+' · '+H(r.freed)+(r.failed.length?' · не получилось: '+r.failed.length:''):'Не получилось: '+r.failed.map(f=>f.error).join('; ')};
  },
  async move(scanId,groupId,paths){
   if(state.running)throw Error('Дождитесь окончания проверки.');
   const {scan,group,items}=pick(scanId,groupId,paths);
   const r=await actions.move(items,{root:scan.root,group:group.id,label:group.label});
   for(const i of group.items)if(r.moved.includes(i.path))i.removed=true;
   if(r.action)storeOf(s).add(r.action);
   return {...r,text:r.moved.length?'Перемещено в «'+actions.FOLDER+'»: '+count(r.moved.length)+(r.failed.length?' · не получилось: '+r.failed.length:''):'Не получилось: '+r.failed.map(f=>f.error).join('; ')};
  },
  actions:()=>storeOf(s).list(),
  async undo(id){
   const st=storeOf(s),action=st.get(String(id));
   const r=await actions.undo(action,{platform:deps.platform(),home:deps.home(),env:deps.env(),openTrash:deps.openTrash});
   if(r.back.length&&!r.failed.length)st.update(action.id,{undone:Date.now()});
   else if(r.back.length)st.update(action.id,{items:action.items.filter(i=>!r.back.includes(i.from))});
   return {...r,text:r.back.length?'Вернул на место: '+count(r.back.length)+(r.failed.length?' · не получилось: '+r.failed.length:''):r.manual?'Открыл Корзину — верните файлы кнопкой «Вернуть» в ней.':'Не получилось: '+r.failed.map(f=>f.error).join('; ')};
  },
  async thumb(scanId,file){
   const scan=state.scans.get(String(scanId));
   if(!scan||!scan.groups.some(g=>g.items.some(i=>i.path===file)))return '';
   try{return await deps.thumbnail(file);}catch{return '';}
  },
  reveal(scanId,file){
   const scan=state.scans.get(String(scanId));
   const known=scan?[scan.root,...scan.groups.flatMap(g=>g.items.map(i=>i.path))]:[];
   const p=known.includes(file)?file:scan?.root||deps.downloads();
   deps.showItem(p);return {shown:p};
  }
 }};
}
function teardown(){state.controller?.abort();}
module.exports={name:'tidyDownloads',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,teardown,wanted,daysIn,summary,state,deps};
