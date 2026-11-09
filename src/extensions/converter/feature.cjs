// «Конвертер»: files from one phrase — images, video, audio, office documents, a whole folder by mask.
// A chat turn only plans: it finds the files, the target format and the parameters and shows the card with the
// estimate. Files are written only when the user presses «Конвертировать» (ipc start); originals are never
// touched: outputs go next to them with a suffix or into a folder the user chose. Long runs and the ffmpeg
// download publish to the notification center under stable ids and can be cancelled there or in the card.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const planner=require('./plan.cjs');
const ops=require('./ops.cjs');
const runner=require('./run.cjs');
const tools=require('./tools.cjs');
const ffmpeg=require('./ffmpeg-install.cjs');
const ID='converter',BY='Конвертер';

const state={plans:new Map(),jobs:new Map(),download:null,notices:new Map()};
const deps={
 userData:()=>{try{return require('electron').app.getPath('userData');}catch{return '';}},
 platform:()=>process.platform,
 showItem:p=>require('electron').shell.showItemInFolder(p),
 chooseFolder:async win=>{const r=await require('electron').dialog.showOpenDialog(win,{title:require('../../interface-language.cjs').t('Куда сохранить результаты?'),properties:['openDirectory','createDirectory']});return r.canceled?'':r.filePaths[0]||'';},
 confirm:async(win,text,detail,button)=>{const {t}=require('../../interface-language.cjs');return (await require('electron').dialog.showMessageBox(win,{message:t(text),detail:t(detail),buttons:[t('Отмена'),t(button)],defaultId:0,cancelId:0})).response===1;},
 thumbnail:async file=>{const {nativeImage}=require('electron');let img=null;
  try{img=await nativeImage.createThumbnailFromPath(file,{width:112,height:112});}catch{/* not on Linux, or no Quick Look */}
  if(!img||img.isEmpty()){const raw=nativeImage.createFromPath(file);if(!raw.isEmpty())img=raw.resize(raw.getSize().width>=raw.getSize().height?{width:112}:{height:112});}
  return img&&!img.isEmpty()?img.toDataURL():'';}
};
deps.tools=()=>{const userData=deps.userData();return tools.detect({platform:deps.platform(),own:userData&&ffmpeg.installed(userData,deps.platform())?ffmpeg.folder(userData,deps.platform()):''});};
const found=()=>deps.tools();
const H=n=>{if(!Number.isFinite(n))return '—';const u=['Б','КБ','МБ','ГБ'];let i=0;while(n>=1024&&i<3){n/=1024;i++;}return (i?n.toFixed(n<10?1:0):String(n)).replace('.',',')+' '+u[i];};
const fileWord=n=>kit.plural(n,['файл','файла','файлов']);

function publish(s,id,item){
 const notice={id,title:BY,...item};state.notices.set(id,notice);
 while(state.notices.size>10)state.notices.delete(state.notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}

// Files attached to the chat that came from disk (their original paths).
function attachedFiles(s){
 try{return s.attachments.list().map(a=>({path:s.attachments.pending?.get(a.id)?.localSourcePath||''})).filter(a=>a.path);}catch{return [];}
}
function label(plan){
 const from=plan.from?plan.from.toUpperCase():{image:'Картинки',video:'Видео',audio:'Аудио',document:'Документы'}[plan.kind]||'Файлы';
 return from+(plan.to?' → '+plan.to.toUpperCase():'');
}
function describe(plan){
 const p=plan.params||{},parts=[];
 if(p.maxSide)parts.push('до '+p.maxSide+' px');if(p.height)parts.push(p.height+'p');if(p.targetBytes)parts.push('до '+H(p.targetBytes));
 if(p.trim)parts.push('отрезок '+p.trim.start+'–'+p.trim.end+' с');if(p.fps)parts.push(p.fps+' к/с');if(p.quality)parts.push('качество '+p.quality);
 if(p.compress)parts.push('сжатие');if(p.strip)parts.push('без метаданных');if(p.normalize)parts.push('нормализация громкости');
 return parts.join(', ');
}
function cardFiles(plan){
 return plan.files.map(file=>{
  let bytes=0;try{bytes=fs.statSync(file).size;}catch{/* gone */}
  const d=plan.kind==='image'?ops.dimensions(file):null;
  return {path:file,name:path.basename(file),bytes,kind:planner.kindOf(file),...(d?{width:d.width,height:d.height}:{}),estimate:ops.estimate(file,plan,{bytes,dims:d})};
 });
}
function card(id,plan,files,needs){
 const before=files.reduce((a,f)=>a+f.bytes,0),known=files.every(f=>Number.isFinite(f.estimate));
 return {id,kind:plan.kind,from:plan.from,to:plan.to,params:plan.params,label:label(plan),glob:plan.glob,outDir:plan.outDir||'',
  files:files.slice(0,200).map(({path:p,...f})=>({...f,dir:path.dirname(p)})),count:files.length,before,estimate:known?files.reduce((a,f)=>a+f.estimate,0):null,
  needs,platform:deps.platform()};
}
function summary(plan,c){
 const what=label(plan)+(describe(plan)?' ('+describe(plan)+')':'');
 let text=what+' · '+c.count+' '+fileWord(c.count)+', '+H(c.before)+(c.estimate!=null?' → ≈ '+H(c.estimate):'')+'.';
 if(c.needs==='ffmpeg')text+=' Для этого нужен ffmpeg — скачайте его кнопкой в карточке, потом нажмите «Конвертировать».';
 else if(c.needs==='soffice')text+=' Для документов нужен LibreOffice: установите его с libreoffice.org и нажмите «Конвертировать».';
 else text+=' Нажмите «Конвертировать» — исходники не трогаю, результаты лягут рядом с суффиксом.';
 return text;
}

async function planTurn(s,command,{retried=false}={}){
 const plan=planner.plan(command,{attachments:attachedFiles(s)});
 if(!plan.files.length){
  if(retried)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл таких файлов. Напишите полный путь к файлу или папке (например, ~/Movies/clip.mov или ~/Pictures/*.png) или прикрепите файлы к сообщению.'});
  return require('../../input-required.cjs').ask({text:'Какие файлы конвертировать? Напишите путь к файлу или папке (можно с маской: ~/Pictures/*.png) или прикрепите файлы.',label:'Файлы для конвертера',placeholder:'Например: ~/Movies/clip.mov'},
   answer=>planTurn(s,command+' '+String(answer||'').trim(),{retried:true}));
 }
 if(!plan.to&&!Object.keys(plan.params).length){
  const options=(planner.TARGETS[plan.kind]||[]).map(f=>f.toUpperCase());
  return require('../../input-required.cjs').ask({text:'В какой формат перевести '+plan.files.length+' '+fileWord(plan.files.length)+'?',label:'Формат',options},
   answer=>planTurn(s,command+' в '+String(answer||'').trim().toLowerCase(),{retried}));
 }
 const id=randomUUID();
 const files=cardFiles(plan);
 const needs=ops.needs(plan,found(),deps.platform());
 state.plans.set(id,{plan:{...plan,outDir:''},topicId:s.dialogue.active()?.id||'',at:Date.now()});
 while(state.plans.size>30)state.plans.delete(state.plans.keys().next().value);
 const c=card(id,plan,files,needs);
 return kit.reply(s,command,{by:BY,text:summary(plan,c),data:{converterCard:c}});
}

async function turn(s,command){
 const text=String(command||'');
 if(!planner.wanted(text)||!kit.installed(s,ID))return null;
 return planTurn(s,text);
}

// Card edits arrive as a patch; only known fields with sane values are taken.
function apply(plan,patch={}){
 const next={...plan,params:{...plan.params}};
 if('to' in patch){const to=String(patch.to||'').toLowerCase();if(!(planner.TARGETS[plan.kind]||[]).includes(to))throw Error('Такой формат здесь не подходит.');next.to=to;}
 const p=patch.params||{},int=(v,lo,hi)=>v===null||v===undefined||v===''?null:Number.isInteger(Number(v))&&Number(v)>=lo&&Number(v)<=hi?Number(v):(()=>{throw Error('Некорректное значение.');})();
 const set=(k,v)=>{if(v===null)delete next.params[k];else next.params[k]=v;};
 if('maxSide' in p)set('maxSide',int(p.maxSide,16,16384));
 if('height' in p){const h=int(p.height,360,2160);if(h!==null&&![360,480,720,1080,1440,2160].includes(h))throw Error('Некорректная высота.');set('height',h);}
 if('fps' in p)set('fps',int(p.fps,1,60));
 if('quality' in p)set('quality',int(p.quality,10,100));
 if('targetBytes' in p)set('targetBytes',int(p.targetBytes,100*1024,50*1024**3));
 if('trim' in p){const t=p.trim;if(t===null)set('trim',null);else{const a=Number(t?.start),b=Number(t?.end);if(!(a>=0&&b>a&&b<=86400))throw Error('Отрезок: начало раньше конца, в секундах.');set('trim',{start:a,end:b});}}
 for(const k of ['strip','normalize','compress'])if(k in p)set(k,p[k]===true?true:null);
 return next;
}
function find(id){const item=state.plans.get(String(id));if(!item)throw Error('Карточка устарела. Попросите конвертацию ещё раз.');return item;}
function snapshot(job){return {id:job.id,planId:job.planId,running:job.running,cancelled:!!job.cancelled,files:job.files.map(f=>({name:f.name,before:f.before,after:f.after||0,state:f.state,percent:f.percent||0,error:f.error||'',warning:f.warning||'',output:f.output?path.basename(f.output):'',missing:f.missing||''}))};}
function remember(s,job){
 // The card's message keeps the result, so the chat shows it after a restart.
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){
  if(m.extensionData?.converterCard?.id===job.planId){m.extensionData={...m.extensionData,converterCard:{...m.extensionData.converterCard,result:snapshot(job)}};s.dialogue.persist();return;}
 }
}
function notify(s,job){
 const done=job.files.filter(f=>['done','error','cancelled'].includes(f.state)).length,total=job.files.length;
 const current=job.files.find(f=>f.state==='running');
 if(job.running){const percent=Math.floor((done*100+(current?.percent||0))/total);publish(s,'converter:'+job.id,{text:'Конвертирую '+Math.min(done+1,total)+' из '+total+(current?' · '+current.name:''),busy:true,percent,kind:'info',version:'running:'+job.id});return;}
 const ok=job.files.filter(f=>f.state==='done'),failed=job.files.filter(f=>f.state==='error').length;
 const before=ok.reduce((a,f)=>a+f.before,0),after=ok.reduce((a,f)=>a+f.after,0);
 publish(s,'converter:'+job.id,{text:(job.cancelled?'Отменено. ':'')+'Готово: '+ok.length+' из '+total+(ok.length?', '+H(before)+' → '+H(after):'')+(failed?' · ошибок: '+failed:''),busy:false,kind:failed||job.cancelled?'attention':'success',version:'done:'+job.id});
}

function setup(s){
 const ipc={
  async thumbnail(id,index){const {plan}=find(id);const file=plan.files[Number(index)];if(!file)return '';try{return await deps.thumbnail(file);}catch{return '';}},
  // Edited chips: new estimate and what is missing, nothing written.
  update(id,patch){const item=find(id);item.plan=apply(item.plan,patch);const files=cardFiles(item.plan);const c=card(id,item.plan,files,ops.needs(item.plan,found(),deps.platform()));return c;},
  async chooseFolder(id){const item=find(id);const dir=await deps.chooseFolder(s.win);if(dir){if(!path.isAbsolute(dir)||!fs.statSync(dir).isDirectory())throw Error('Папка недоступна.');item.plan={...item.plan,outDir:dir};}return {outDir:item.plan.outDir};},
  resetFolder(id){const item=find(id);item.plan={...item.plan,outDir:''};return {outDir:''};},
  // Runs only from the card's «Конвертировать»: one job per card at a time.
  start(id,patch){
   const item=find(id);
   if(patch)item.plan=apply(item.plan,patch);
   if([...state.jobs.values()].some(j=>j.planId===id&&j.running))throw Error('Эта конвертация уже идёт.');
   const toolset=found(),needs=ops.needs(item.plan,toolset,deps.platform());
   if(needs==='ffmpeg')throw Error('Сначала скачайте ffmpeg — кнопка в карточке.');
   if(needs==='soffice')throw Error('Для документов нужен LibreOffice (soffice). Установите его и повторите.');
   const job={id:randomUUID(),planId:id,running:true,controller:new AbortController(),files:item.plan.files.map(f=>{let before=0;try{before=fs.statSync(f).size;}catch{/* gone */}return {input:f,name:path.basename(f),before,state:'waiting',percent:0};})};
   state.jobs.set(job.id,job);while(state.jobs.size>20){const old=[...state.jobs.values()].find(j=>!j.running);if(!old)break;state.jobs.delete(old.id);}
   let last=0;
   runner.run(job,item.plan,toolset,{signal:job.controller.signal,platform:deps.platform(),publish:j=>{if(Date.now()-last>250||!j.running){last=Date.now();notify(s,j);}}})
    .catch(e=>{for(const f of job.files)if(f.state==='running'||f.state==='waiting'){f.state='error';f.error=e.message;}job.running=false;notify(s,job);})
    .finally(()=>remember(s,job));
   return snapshot(job);
  },
  status(jobId){const job=state.jobs.get(String(jobId));if(!job)throw Error('Конвертация не найдена.');return snapshot(job);},
  cancel(jobId){const job=state.jobs.get(String(jobId));if(job?.running)job.controller.abort();return {stopped:!!job?.running};},
  // Only outputs of this run can be shown.
  reveal(jobId,index){const job=state.jobs.get(String(jobId));const f=job?.files[Number(index)];if(!f?.output||!fs.existsSync(f.output))throw Error('Файл не найден — возможно, его переместили.');deps.showItem(f.output);return {shown:true};},
  revealSource(id,index){const {plan}=find(id);const f=plan.files[Number(index)];if(!f)throw Error('Файл не найден.');deps.showItem(f);return {shown:true};},
  progress:()=>[...state.notices.values()],
  ffmpeg:()=>({present:!!found().ffmpeg,busy:!!state.download,sources:!!ffmpeg.sources(deps.platform(),process.arch)}),
  async downloadFfmpeg(){
   if(state.download)throw Error('ffmpeg уже скачивается — прогресс в уведомлениях.');
   if(found().ffmpeg)return {present:true};
   const controller=new AbortController();state.download=controller;
   const NOTICE='converter-ffmpeg';
   try{
    publish(s,NOTICE,{text:'Ожидаю подтверждения загрузки ffmpeg…',busy:true,kind:'info',version:'confirm'});
    const result=await ffmpeg.install({userData:deps.userData(),platform:deps.platform(),signal:controller.signal,
     confirm:async bytes=>{if(!require('../../features/extension-replies.cjs').needsApproval(bytes,s.settings))return true;
      return deps.confirm(s.win,'Скачать ffmpeg для Конвертера?','Статическая сборка ffmpeg '+ffmpeg.VERSION[deps.platform()]+' · около '+Math.ceil(bytes/1e6)+' МБ. Источник закреплён, архив проверяется по SHA-256.','Скачать');},
     status:(text,fraction)=>publish(s,NOTICE,{text:text+(fraction>=0&&fraction<=1?' · '+Math.round(fraction*100)+'%':''),busy:true,percent:Math.round(fraction*100),kind:'info',version:'download'})});
    publish(s,NOTICE,{text:'ffmpeg '+result.version+' готов. Можно конвертировать.',busy:false,kind:'success',version:'done'});
    return {present:true};
   }catch(e){
    publish(s,NOTICE,{text:controller.signal.aborted||e.cancelled?'Загрузка ffmpeg отменена.':e.message,busy:false,kind:controller.signal.aborted||e.cancelled?'info':'error',version:'error:'+Date.now()});
    if(e.cancelled||controller.signal.aborted)return {present:false,cancelled:true};
    throw e;
   }finally{state.download=null;}
  },
  cancelDownload(){state.download?.abort();return {stopped:!!state.download};}
 };
 return {ipc};
}
module.exports={name:'converter',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,state,deps,apply,summary,human:H};
