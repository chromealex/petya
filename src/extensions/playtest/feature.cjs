// «Разбор плейтеста»: frustration moments in a recorded play session. The video comes from the chat (attached from
// disk, or attached earlier) or a path in the request; an optional event log (CSV/JSON: deaths, level start/end,
// purchases) is attached next to it. Frames are sampled locally (sampler.cjs), labelled in bounded batches by a local
// vision model when one is installed, the player's think-aloud comes from Petya's own video transcription, and
// moments.cjs keeps only moments with evidence (frame, verbatim quote, event). The analysis runs in the background with
// progress and «Отменить» in the notification center; the card fills in when it is done.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const events=require('./events.cjs');
const speech=require('./speech.cjs');
const moments=require('./moments.cjs');
const vision=require('./vision.cjs');
const ID='playtest',BY='Разбор плейтеста';

const SUBJECT=/плей-?тест\p{L}*|(?:^|[^\p{L}])play-?test\p{L}*|(?:где|когда|почему) игрок (?:застрял|застревает|запутал\p{L}*|бросил|сдал\p{L}*|злит\p{L}*)|момент\p{L}* фрустрац\p{L}*|фрустрац\p{L}* (?:игрок\p{L}*|в (?:этом|видео|записи))|запис\p{L}* (?:игровой сессии|плейтеста|игрока)/iu;
const QUIET=/^(?:а\s+)?(?:что такое|зачем нуж|как (?:провести|проводить|организовать))/iu;
const VIDEO=/\.(?:mp4|mov|webm)$/i;
const LOG=/\.(?:csv|tsv|json|txt|log)$/i;
const BATCH=8,CONCURRENCY=2;

const state={jobs:new Map(),notices:new Map()};
const deps={
 sampler:()=>require('./sampler.cjs'),
 // Petya's own video pipeline (frames + Whisper by fragments) for the speech of a file given by path.
 transcribe:async(s,file)=>{if(typeof s.attachments?.video!=='function')throw Error('Распознавание речи недоступно.');return s.attachments.video({filePath:file},path.basename(file));},
 cancelTranscription:()=>{try{require('../../video-reader.cjs').cancelVideo();}catch{/* outside Electron */}},
 installedModels:async s=>{try{const r=await s.optionalModels?.installed?.();return Array.isArray(r)?r:r?.names||[];}catch{return [];}},
 label:(s,args)=>vision.label(s,args),
 // A small thumbnail from a base64 JPEG/PNG (frames of an attachment without a path).
 thumb:image=>{try{const {nativeImage}=require('electron');let img=nativeImage.createFromBuffer(Buffer.from(image,'base64'));const sz=img.getSize();if(sz.width>176)img=img.resize({width:176});return img.toDataURL();}catch{return '';}},
 playAt:(file,at)=>require('./player.cjs').playAt(file,at),
 exists:file=>{try{return fs.statSync(file).isFile();}catch{return false;}}
};

// --- Inputs ---------------------------------------------------------------------------------------------------------
function written(text){
 const out=[],re=/«([^»]+?\.(?:mp4|mov|webm|csv|json|tsv|txt|log))»|"([^"]+?\.(?:mp4|mov|webm|csv|json|tsv|txt|log))"|`([^`]+?\.(?:mp4|mov|webm|csv|json|tsv|txt|log))`|((?:~|\/|[A-Za-z]:\\)[^\s"'«»`]+?\.(?:mp4|mov|webm|csv|json|tsv|txt|log))(?=$|[\s,;.!?)»])/giu;
 let m;while((m=re.exec(String(text||''))))out.push((m[1]||m[2]||m[3]||m[4]).trim());
 return [...new Set(out)].map(p=>p.startsWith('~')?path.join(require('node:os').homedir(),p.slice(1)):p);
}
function composer(s){
 let list=[];try{list=s.attachments?.list?.()||[];}catch{list=[];}
 return list.map(f=>({id:f.id,...(s.attachments.pending?.get?.(f.id)||{}),name:f.name}));
}
function inputs(s,text){
 const now=composer(s),topic=s.dialogue.active();
 const earlier=(topic?.attachments||[]).map(f=>({...f,earlier:true}));
 const paths=written(text);
 const videos=[...now.filter(f=>VIDEO.test(f.name||'')),...paths.filter(p=>VIDEO.test(p)).map(p=>({name:path.basename(p),localSourcePath:p,written:true}))];
 if(!videos.length)videos.push(...earlier.filter(f=>VIDEO.test(f.name||'')).slice(-1));
 const logs=[...now.filter(f=>LOG.test(f.name||'')),...paths.filter(p=>LOG.test(p)).map(p=>({name:path.basename(p),localSourcePath:p,written:true}))];
 if(!logs.length&&videos[0]?.earlier)logs.push(...earlier.filter(f=>LOG.test(f.name||'')&&events.looks(f.text||'')).slice(-1));
 return {videos,logs,used:[...now.filter(f=>VIDEO.test(f.name||'')||LOG.test(f.name||''))]};
}
function readLog(f){
 let text=f.text||'';
 if(f.localSourcePath){const st=fs.statSync(f.localSourcePath);if(st.size>20*1024*1024)throw Error('Журнал событий больше 20 МБ.');text=fs.readFileSync(f.localSourcePath,'utf8');}
 if(!events.looks(text))return null;
 return events.parse(text);
}
function adopt(s,used){
 if(!used.length)return;
 try{
  const rows=s.attachments.take(used.map(f=>f.id)),topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]),...rows.filter(f=>!topic.attachments?.some(old=>old.id===f.id))];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=rows.map(f=>s.attachments.info(f));
  for(const f of rows)s.attachments.remove(f.id);
  s.dialogue.persist();
 }catch{/* attachments stay in the composer */}
}

// --- Progress ---------------------------------------------------------------------------------------------------------
function publish(s,id,item){
 const notice={id,title:BY,...item};state.notices.set(id,notice);
 while(state.notices.size>10)state.notices.delete(state.notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
function stage(s,job,text,percent){
 job.card={...job.card,stage:text,percent:Number.isFinite(percent)?Math.round(percent):null};
 publish(s,'playtest:'+job.id,{text:job.card.video.name+' · '+text,busy:true,...Number.isFinite(percent)?{percent:Math.round(percent)}:{},kind:'info',version:'run:'+job.id});
}
// The card's message keeps the result, so the chat shows it after a restart.
function remember(s,job){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){
  if(m.extensionData?.playtest?.id===job.id){m.extensionData={...m.extensionData,playtest:job.card};if(job.card.text)m.text=job.card.text;s.dialogue.persist();return;}
 }
}
const cancelled=()=>Object.assign(Error('Разбор плейтеста отменён.'),{cancelled:true});

// --- The analysis -------------------------------------------------------------------------------------------------------
async function mapLimit(list,limit,fn){const out=new Array(list.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,list.length)},async()=>{while(next<list.length){const i=next++;out[i]=await fn(list[i],i);}}));return out;}

async function analyse(s,job){
 const {signal}=job.controller,check=()=>{if(signal.aborted)throw cancelled();};
 const video=job.video,notes=[];
 const model=vision.pickModel(await deps.installedModels(s),s.optionalModels?.catalog||[]);
 const labelAll=async(frames,offset,total)=>{
  if(!model)return;
  await mapLimit(frames,CONCURRENCY,async f=>{check();try{f.label=await deps.label(s,{model,image:f.image,at:f.at,signal});}catch(e){if(signal.aborted)throw cancelled();f.label=null;job.visionErrors=(job.visionErrors||0)+1;}});
 };
 let frames=[],duration=video.duration||0,interval=5;
 if(video.localSourcePath&&deps.exists(video.localSourcePath)){
  stage(s,job,'Открываю видео',2);
  const sampler=deps.sampler();
  const clip=await sampler.open(video.localSourcePath,{signal});
  try{
   duration=clip.duration;
   const times=sampler.times(duration);interval=times.length>1?times[1]-times[0]:duration;
   for(let i=0;i<times.length;i+=BATCH){
    check();
    stage(s,job,(model?'Смотрю кадры':'Читаю кадры')+' '+Math.min(i+BATCH,times.length)+' из '+times.length,5+70*i/times.length);
    const batch=await clip.grab(times.slice(i,i+BATCH));
    await labelAll(batch,i,times.length);
    // Only labels, thumbnails and pixel statistics are kept; the model-sized JPEGs are dropped per batch.
    for(const f of batch){frames.push({at:f.at,diff:f.diff,hash:f.hash,thumb:f.thumb,label:f.label||null});}
   }
  }finally{clip.close();}
 }else if(video.frames?.length){
  // Attached without a path (e.g. imported from a chat): the reader's frames (up to 12) are all there is.
  duration=video.duration||video.frames.at(-1).at;interval=video.frames.length>1?video.frames[1].at-video.frames[0].at:duration;
  const list=video.frames.map(f=>({at:f.at,image:f.image}));
  stage(s,job,'Смотрю кадры вложения',10);
  await labelAll(list,0,list.length);
  frames=list.map(f=>({at:f.at,diff:null,hash:'',thumb:deps.thumb(f.image),label:f.label||null}));
  notes.push('Видео прикреплено без пути к файлу: доступно только '+frames.length+' кадров, простои по кадрам не ищу. Прикрепите файл с диска, чтобы разобрать плотнее.');
 }else throw Error('Видео недоступно на диске: '+(video.localSourcePath||video.name)+'.');
 check();

 // Speech: the transcript Petya already made for the attachment, or a fresh one for a path.
 let transcript=video.text||'',audio=video.audio||null;
 if(!transcript&&!audio&&video.localSourcePath){
  stage(s,job,'Распознаю речь игрока',78);
  const stop=()=>deps.cancelTranscription();signal.addEventListener('abort',stop,{once:true});
  try{const r=await deps.transcribe(s,video.localSourcePath);transcript=r?.text||'';audio=r?.audio||null;}
  catch(e){if(signal.aborted)throw cancelled();audio={status:'error',error:e.message};}
  finally{signal.removeEventListener('abort',stop);}
 }
 check();
 stage(s,job,'Ищу моменты',95);
 const said=speech.negative(transcript);
 const found=moments.detect({duration,frames,speech:said,events:job.events,interval});
 const near=t=>{let best=null;for(const f of frames)if(f.thumb&&(!best||Math.abs(f.at-t)<Math.abs(best.at-t)))best=f;return best&&Math.abs(best.at-t)<=Math.max(interval*1.5,6)?best:null;};
 for(const m of found){const f=near(m.t);if(f){m.thumb=f.thumb;m.frameAt=f.at;}}
 if(!model)notes.push('Модели для кадров нет: экраны провала и нажатия мимо не распознаю, простои считаю по изменению кадра. Скачайте '+vision.PREFERRED+' из карточки — разбор станет точнее.');
 if(job.visionErrors)notes.push('Модель не описала кадров: '+job.visionErrors+'.');
 if(audio?.status==='error')notes.push('Речь разобрана не полностью: '+audio.error);
 else if(!transcript)notes.push('Разборчивой речи игрока не нашёл.');
 if(job.logNote)notes.push(job.logNote);
 const top=moments.summary(found);
 const counts={};for(const m of found)counts[m.type]=(counts[m.type]||0)+1;
 return {duration:Math.round(duration*10)/10,interval:Math.round(interval*10)/10,frames:frames.length,model:model||'',moments:found,summary:top,counts,notes,
  speech:{status:audio?.status||(transcript?'complete':'none'),lines:speech.fragments(transcript).length},
  timeline:frames.map(f=>({at:f.at,screen:f.label?.screen||''}))};
}

function finalText(card){
 if(card.status==='cancelled')return 'Разбор плейтеста «'+card.video.name+'» отменён.';
 if(card.status==='error')return 'Не получилось разобрать плейтест: '+card.error;
 const n=card.moments.length;
 if(!n)return 'Разобрал «'+card.video.name+'» ('+moments.clock(card.duration)+'): моментов фрустрации с доказательствами не нашёл.';
 return 'Разобрал «'+card.video.name+'» ('+moments.clock(card.duration)+'): '+n+' '+kit.plural(n,['момент','момента','моментов'])+'. '+card.summary.map(x=>x.text).join('; ')+'.';
}
async function run(s,job){
 try{
  const result=await analyse(s,job);
  job.card={...job.card,...result,status:'done',stage:'',percent:100};
  publish(s,'playtest:'+job.id,{text:job.card.video.name+' · '+(result.moments.length?'моментов: '+result.moments.length:'моментов не найдено'),busy:false,kind:'success',version:'done:'+job.id});
 }catch(e){
  const stopped=e.cancelled||job.controller.signal.aborted;
  job.card={...job.card,status:stopped?'cancelled':'error',error:stopped?'':e.message,stage:'',percent:null};
  publish(s,'playtest:'+job.id,{text:job.card.video.name+' · '+(stopped?'разбор отменён':e.message),busy:false,kind:stopped?'info':'error',version:'end:'+job.id});
 }finally{
  job.running=false;job.card.text=finalText(job.card);remember(s,job);
 }
}

async function start(s,command){
 const text=String(command);
 const {videos,logs,used}=inputs(s,text);
 if(!videos.length)return kit.reply(s,command,{by:BY,question:true,text:'Пришлите запись плейтеста (MP4, MOV или WebM) кнопкой «Прикрепить» или путём к файлу. Если есть журнал событий игры (CSV или JSON со временем: смерти, начало и конец уровня, покупки), прикрепите его рядом — моменты станут точнее.'});
 const video=videos[0];
 if(video.written&&!deps.exists(video.localSourcePath))return kit.reply(s,command,{by:BY,error:true,text:'Не нашёл видео '+video.localSourcePath+'.'});
 if(!video.localSourcePath&&!video.frames?.length)return kit.reply(s,command,{by:BY,question:true,text:'Видео «'+video.name+'» прикреплено без пути к файлу и без кадров. Прикрепите его с диска кнопкой «Прикрепить» или напишите путь к файлу.'});
 const busy=[...state.jobs.values()].find(j=>j.running&&j.video.localSourcePath&&j.video.localSourcePath===video.localSourcePath);
 if(busy)return kit.reply(s,command,{by:BY,text:'Уже разбираю «'+video.name+'» — прогресс в уведомлениях, карточка заполнится сама.'});
 let parsed={events:[]},logNote='',logName='';
 for(const f of logs){
  try{const r=readLog(f);if(r){parsed=r;logName=f.name;if(r.skipped)logNote='В журнале пропущено строк без времени или типа: '+r.skipped+'.';if(r.absolute)logNote=(logNote?logNote+' ':'')+'Время журнала абсолютное: отсчитываю от начала сессии (или первого события) — проверьте, что запись началась тогда же.';break;}}
  catch(e){logNote='Журнал «'+f.name+'» не прочитан: '+e.message;}
 }
 if(logs.length&&!logName&&!logNote)logNote='Файл «'+logs[0].name+'» не похож на журнал событий (нужны колонки времени и события).';
 const id=randomUUID();
 const job={id,running:true,controller:new AbortController(),video:{name:video.name,localSourcePath:video.localSourcePath||'',frames:video.frames,duration:video.duration,text:video.text||'',audio:video.audio||null},events:parsed.events,logNote,
  card:{id,status:'running',stage:'Готовлю',percent:0,video:{name:video.name,path:video.localSourcePath||''},log:logName?{name:logName,events:parsed.events.length}:null,moments:[],summary:[],notes:[]}};
 state.jobs.set(id,job);
 while(state.jobs.size>20){const old=[...state.jobs.values()].find(j=>!j.running);if(!old)break;state.jobs.delete(old.id);}
 const note=videos.length>1?' Видео несколько — беру первое: «'+video.name+'».':'';
 const reply=kit.reply(s,command,{by:BY,text:'Разбираю плейтест «'+video.name+'»'+(logName?' с журналом «'+logName+'»':'')+'. Это займёт несколько минут — прогресс и «Отменить» в уведомлениях, карточка заполнится сама.'+note,data:{playtest:job.card}});
 adopt(s,used);
 job.promise=run(s,job);
 return reply;
}

// Videos a card may open: the running jobs' and those recorded in the chats' playtest cards.
function knownVideo(s,id){
 const job=state.jobs.get(String(id));if(job?.video.localSourcePath)return job.video.localSourcePath;
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.playtest?.id===id&&m.extensionData.playtest.video?.path)return m.extensionData.playtest.video.path;
 return '';
}
function setup(s){
 return {ipc:{
  status(id){const job=state.jobs.get(String(id));return job?job.card:null;},
  cancel(id){const job=state.jobs.get(String(id));if(job?.running)job.controller.abort();return {stopped:!!job?.running};},
  progress:()=>[...state.notices.values()],
  // «Открыть на этом месте»: Petya's player at the second, or the system player.
  async open(id,at){const file=knownVideo(s,String(id));if(!file)throw Error('Видео этого разбора не найдено.');if(!deps.exists(file))throw Error('Видео больше нет по пути '+file+'.');return deps.playAt(file,Math.max(0,Number(at)||0));},
  async vision(){const model=vision.pickModel(await deps.installedModels(s),s.optionalModels?.catalog||[]);return {model,name:vision.PREFERRED};},
  // The user pressed «Скачать модель для кадров»: the optional-models download (progress in notifications).
  downloadModel(){if(!s.optionalModels?.download)throw Error('Загрузка моделей недоступна.');return s.optionalModels.download(vision.PREFERRED);}
 }};
}
const wanted=text=>SUBJECT.test(String(text||''))&&!QUIET.test(String(text||'').trim());
async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 return start(s,text);
}
module.exports={name:'playtestApp',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,wanted,start,inputs,state,deps,finalText};
