// «Место на диске»: what fills the disk on macOS and Windows and what can be cleaned. A chat turn only measures;
// cleaning happens from the card after the user confirmed the exact paths and size (cleanup.cjs), never from a turn.
// The scan publishes its stages to the notification center under one stable id and can be stopped there or in chat.
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const kit=require('../app-kit.cjs');
const scanner=require('./scan.cjs');
const cleanup=require('./cleanup.cjs');
const cancel=require('../../answer-cancel.cjs');
const ID='disk-usage',BY='Место на диске',NOTICE='disk-usage-scan';

// «чем забит диск», «сколько места свободно», «что можно почистить», «освободи место».
const DISK=/(?:чем|что) (?:забит|занят|занимает)\p{L}*(?: (?:весь|мой|наш))? (?:диск|место|мак|ssd|компьютер|ноутбук)|забит\p{L}* диск|диск забит|мест\p{L}* на (?:диске|маке|ssd|компе|компьютере|ноутбуке)|свободн\p{L}* мест\p{L}*|мест\p{L}* свободн\p{L}*|сколько (?:осталось )?места|освободи\p{L}* (?:место|диск|гигабайт)|почист\p{L}* (?:диск|мак|компьютер|ноутбук|кэш)|что можно (?:почистить|удалить|снести)|не хватает места|кончает\p{L}* место|закончил\p{L}* место|disk usage|disk space/iu;
// Space that is not a disk: meetings, sprints, cloud drives, seats.
const AVOID=/встреч|спринт|календар|google ?drive|гугл[- ]?диск|яндекс[- ]?диск|onedrive|dropbox|icloud|облак|в машине|в самол[её]т|в зале|в офисе|парковк|в команде|в бэклоге|в коде|в тексте|в презентаци|на слайде|в таблице|в jira|в джир|на сервере|на проде|в базе|в почте|в ящике|в репозитори/iu;
const wanted=text=>DISK.test(text)&&!AVOID.test(text);

const state={running:null,controller:null,operation:null,scans:new Map()};
const deps={trashItem:p=>require('electron').shell.trashItem(p),showItem:p=>require('electron').shell.showItemInFolder(p),
 userData:()=>{try{return require('electron').app.getPath('userData');}catch{return '';}},home:()=>os.homedir(),platform:()=>process.platform,env:()=>process.env,timeLimit:30000};

function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}
function savedRoots(settings){
 const v=settings.diskUsageRoots||'';
 if(v==='-')return {skip:true,roots:[]};
 try{const list=JSON.parse(v||'[]');return {skip:false,roots:Array.isArray(list)?list.filter(p=>typeof p==='string'):[]};}catch{return {skip:false,roots:[]};}
}
async function projectFolders(s){
 try{const found=await s.gitWorkspace?.discover?.();return [...(found?.folders||[]),...(found?.repositories||[])];}catch{return [];}
}
const isDir=p=>{try{return fs.statSync(p).isDirectory();}catch{return false;}};
// Where to look for Unity projects: saved answer, the current project, Unity Hub's list, the usual folders.
async function unityRoots(s,home,platform,env){
 const saved=savedRoots(s.settings);
 const hints=scanner.unityHints({platform,home,env});
 const roots=[...saved.roots,...await projectFolders(s),...scanner.hubProjects(hints.hub),...hints.folders].filter(isDir);
 return {skip:saved.skip,roots:[...new Set(roots)],asked:!!s.settings.diskUsageRoots};
}
function parseRoots(answer,home){
 return String(answer).split(/[\n,;]+/).map(p=>p.trim().replace(/^["«']|["»']$/g,'')).filter(Boolean).map(p=>p.replace(/^~(?=$|[\\/])/,home)).filter(p=>path.isAbsolute(p));
}

function summary(result){
 const H=scanner.human,v=result.volume,top=result.categories.filter(c=>c.bytes>0).slice(0,3);
 const safe=result.categories.filter(c=>c.clean&&c.tag!=='caution').reduce((a,c)=>a+c.bytes,0);
 const parts=[];
 if(v)parts.push('Свободно '+H(v.free)+' из '+H(v.total)+'.');
 if(top.length)parts.push('Больше всего: '+top.map(c=>c.label+' — '+H(c.bytes)).join(', ')+'.');
 if(safe)parts.push('Без последствий или с пересозданием можно освободить около '+H(safe)+'.');
 if(result.cancelled)parts.push('Подсчёт остановлен — показано, что успел посчитать.');
 else if(result.partial)parts.push('Подсчёт частичный: не уложился в лимит времени или часть папок закрыта.');
 parts.push('Очистить можно кнопкой в строке карточки — без вашего подтверждения ничего не удаляю.');
 return parts.join(' ');
}

async function measure(s,command,roots){
 const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 const controller=new AbortController(),outer=cancel.signal();
 const abort=()=>controller.abort();outer?.addEventListener('abort',abort,{once:true});
 state.running=id;state.controller=controller;
 const home=deps.home(),platform=deps.platform(),env=deps.env();
 publish(s,{text:'Начинаю подсчёт',busy:true,kind:'info',version:'running:'+id});
 try{
  const result=await scanner.scan({platform,home,env,userData:deps.userData(),unityRoots:roots,signal:controller.signal,timeLimit:deps.timeLimit,
   progress(stage,done,total){
    const percent=Math.round(done*100/total);
    s.requestProgress?.report?.('Считаю место: '+stage);
    publish(s,{text:stage+' · '+done+' из '+total,busy:true,percent,kind:'info',version:'running:'+id});
   }});
  const scanId=id;
  state.scans.set(scanId,result);
  while(state.scans.size>5)state.scans.delete(state.scans.keys().next().value);
  const freeable=result.categories.filter(c=>c.clean&&c.tag!=='caution').reduce((a,c)=>a+c.bytes,0);
  publish(s,{text:(result.partial?'Частично: ':'Готово: ')+(result.volume?'свободно '+scanner.human(result.volume.free)+', ':'')+'можно освободить ~'+scanner.human(freeable),busy:false,kind:result.partial?'attention':'success',version:'done:'+id});
  const card={scanId,at:Date.now(),...result,unityRoots:roots,
   categories:result.categories.map(c=>({id:c.id,label:c.label,tag:c.tag,note:c.note,clean:c.clean,bytes:c.bytes,partial:c.partial,skipped:c.skipped,roots:c.roots,items:c.items}))};
  return kit.reply(s,command,{by:BY,text:summary(result),data:{diskUsage:card}});
 }catch(e){
  publish(s,{text:'Не удалось посчитать: '+e.message,busy:false,kind:'error',version:'error:'+id});
  return kit.failure(s,command,BY,e);
 }finally{outer?.removeEventListener('abort',abort);state.running=null;state.controller=null;}
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 if(state.running)return kit.reply(s,command,{by:BY,text:'Уже считаю место на диске — прогресс в уведомлениях. Дождитесь результата или остановите подсчёт там.'});
 const home=deps.home(),platform=deps.platform(),env=deps.env();
 const found=await unityRoots(s,home,platform,env);
 if(!found.skip&&!found.roots.length&&!found.asked){
  // No project folder known: ask once where Unity projects live (or skip them), then scan.
  return require('../../input-required.cjs').ask({text:'Где лежат проекты Unity? Напишите путь к папке (можно несколько через запятую) — посчитаю их папки Library. Или «Без Unity».',
   label:'Папки проектов Unity',placeholder:'Например: ~/Projects',options:['Без Unity']},answer=>{
   const skip=/^(?:без unity|без юнити|пропусти|нет|не надо)/iu.test(String(answer).trim());
   const roots=skip?[]:parseRoots(answer,home).filter(isDir);
   s.saveSettings?.({diskUsageRoots:skip||!roots.length?'-':JSON.stringify(roots)});
   return measure(s,command,roots);
  });
 }
 return measure(s,command,found.skip?[]:found.roots);
}

function find(scanId,categoryId){
 const scan=state.scans.get(String(scanId));
 if(!scan)throw Error('Результат проверки устарел. Проверьте диск ещё раз — скажите «чем забит диск».');
 const category=scan.categories.find(c=>c.id===categoryId);
 if(!category)throw Error('Такой строки нет в результате проверки.');
 return category;
}
function setup(s){
 return {ipc:{
  progress:()=>state.operation,
  cancel(){state.controller?.abort();return {stopped:!!state.controller};},
  // The card calls this only after the user pressed «Переместить в корзину» under the listed paths.
  async clean(scanId,categoryId,targets){
   if(state.running)throw Error('Дождитесь окончания подсчёта.');
   const category=find(scanId,categoryId);
   const result=await cleanup.clean(category,targets,{trashItem:deps.trashItem});
   const H=scanner.human;
   const verb=category.clean==='ollama'?'Удалено моделей':'В корзину перемещено';
   return {...result,bytes:category.bytes,text:result.removed.length?verb+': '+result.removed.length+' · освобождено '+H(result.freed)+(result.failed.length?' · не получилось: '+result.failed.length:''):'Не получилось: '+result.failed.map(f=>f.error).join('; ')};
  },
  reveal(scanId,categoryId,target){
   const category=find(scanId,categoryId);
   const known=[...category.roots,...category.items.map(i=>i.project||i.path)];
   const p=target&&known.includes(target)?target:category.roots[0];
   if(!p)throw Error('Папка не найдена.');
   deps.showItem(p);return {shown:p};
  }
 }};
}
function validate(next){
 const v=next.diskUsageRoots;
 if(typeof v!=='string'||v===''||v==='-')return;
 try{const list=JSON.parse(v);if(!Array.isArray(list)||list.length>20||!list.every(p=>typeof p==='string'&&path.isAbsolute(p)&&p.length<1000))throw Error();}
 catch{next.diskUsageRoots='';}
}
module.exports={name:'diskUsage',defaults:{['extension_'+ID]:'false',diskUsageRoots:''},validate,setup,turn,wanted,parseRoots,state,deps,summary};
