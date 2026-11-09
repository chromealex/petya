// «Запись экрана → баг»: «запиши баг» shows the screens and windows to choose from (never a silent recording); the
// chosen one is recorded with a small «Стоп» window, at most 2 minutes. Optionally the game's log (Unity Editor.log
// or Player.log) written meanwhile and the system info are added. Then a bug draft: steps (the user's), expected vs
// actual (the local model describes only the attached log lines, citing them), environment, attachments. The report
// goes to the project's tracker through `task-tracker` (its own preview confirms the task); the video and the log are
// attached to the created task on «Прикрепить запись и лог к KEY» with screenshot-task's Jira/Asana upload.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const attach=require('../screenshot-task/attach.cjs');
const unityLog=require('./unity-log.cjs');
const systemInfo=require('./system-info.cjs');
const drafts=require('./draft.cjs');
const recorder=require('./recorder.cjs');
const ID='screen-bug',BY='Запись экрана → баг',NOTICE='screen-bug-recording',KEEP=10;

// --- Routing --------------------------------------------------------------------------------------------------------
const START=/(?:^|[^\p{L}])(?:запиши|записать|запишем|сними|снять|начни\s+запись|запусти\s+запись|включи\s+запись)\s+(?:мне\s+|пожалуйста\s+)?(?:баг\p{L}*|экран\p{L}*|видео\s+(?:бага|с\s+экрана|экрана)|запись\s+экрана|ошибк\p{L}*\s+(?:на|с)\s+видео)(?=$|[^\p{L}])|запис\p{L}*\s+экрана\s+(?:для|под)\s+баг|(?:видео|запис\p{L}*)\s+бага|баг\s+(?:по|с|на)\s+видео/iu;
const DRAFT=/(?:оформи|составь|сделай|заведи|набросай)\s+баг\s+(?:по|из)\s+(?:последней\s+|этой\s+)?(?:записи|видео)(?:\s+экрана)?|баг\s+по\s+последней\s+записи/iu;
const STOP=/(?:останови|остановить|стоп|закончи|прекрати|заверши)\s+(?:запись\s+(?:экрана|бага)|записывать\s+экран)/iu;
// Meetings, voice, journal, decisions, worklogs, screenshots and a single screen's picture are other apps'.
const AVOID=/встреч|созвон|звонок|звонк|митинг|голос\p{L}*|аудио|подкаст|дневник|решени|врем\p{L}*\s+в|ворклог|скрин\p{L}*|скриншот\p{L}*|снимок|снимк|по\s+(?:этому\s+)?экрану|экран\p{L}*\s+(?:в|во)\s+(?:задач|jira|джир|тикет)/iu;
const QUIET=/^(?:а\s+)?(?:как|что такое|зачем|почему|не\s+(?:надо|нужно))\s/iu;
function intent(text){
 const t=String(text||'');
 if(QUIET.test(t.trim()))return null;
 if(STOP.test(t))return 'stop';
 if(DRAFT.test(t))return 'draft';
 if(START.test(t)&&!AVOID.test(t))return 'start';
 return null;
}
const wanted=text=>!!intent(text);
// «запиши баг: инвентарь не открывается» → the user's note.
function noteIn(text){const m=String(text||'').match(/(?:[:—–]|заметка:?)\s*(.+)$/u);return m?m[1].trim().slice(0,500):'';}

// --- State ------------------------------------------------------------------------------------------------------------
const state={picks:new Map(),active:null,done:new Map(),pending:null,handoffs:new Map(),operation:null};
const deps={
 electron:()=>require('electron'),
 userData:()=>{try{return require('electron').app.getPath('userData');}catch{return os.tmpdir();}},
 home:()=>os.homedir(),platform:()=>process.platform,env:()=>process.env,now:()=>Date.now(),
 smoke:()=>process.env.PETYA_SMOKE_TEST==='1',
 permission:async()=>require('../screenshot-task/capture.cjs').ensurePermission(require('electron'),{smoke:process.env.PETYA_SMOKE_TEST==='1'}),
 // Screens and windows with small previews; Petya's own windows are left out.
 sources:async s=>{
  const {desktopCapturer}=require('electron');
  const own=new Set();try{own.add(s.win.getMediaSourceId());}catch{/* no window */}
  const list=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:240,height:150},fetchWindowIcons:false});
  return list.filter(x=>!own.has(x.id)&&!/^(?:Петя|Petya)$/i.test(x.name));
 },
 record:options=>recorder.start(options),
 logs:()=>unityLog.candidates({platform:deps.platform(),home:deps.home(),env:deps.env()}),
 system:unity=>systemInfo.gather({unity}),
 showItem:file=>require('electron').shell.showItemInFolder(file),
 openDialog:async(win,options)=>require('electron').dialog.showOpenDialog(win,options)
};
const dir=()=>path.join(deps.userData(),'screen-bug');
const fileOf=(id,ext)=>{if(!/^[0-9a-f-]{36}$/.test(String(id)))throw Error('Запись не найдена.');return path.join(dir(),id+ext);};
function prune(){
 try{const metas=fs.readdirSync(dir()).filter(f=>/^[0-9a-f-]{36}\.json$/.test(f)).map(f=>({id:f.slice(0,36),t:fs.statSync(path.join(dir(),f)).mtimeMs})).sort((a,b)=>b.t-a.t);
  for(const {id} of metas.slice(KEEP)){for(const ext of ['.webm','.log.txt','.json'])fs.rmSync(path.join(dir(),id+ext),{force:true});state.done.delete(id);}}catch{/* nothing stored yet */}
}
function meta(id){
 if(state.done.has(id))return state.done.get(id);
 try{const m=JSON.parse(fs.readFileSync(fileOf(id,'.json'),'utf8'));state.done.set(id,m);return m;}catch{throw Error('Запись не найдена — запишите баг заново.');}
}
function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}
const clock=ms=>{const sec=Math.round(ms/1000);return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
const thumbOf=src=>{try{const t=src.thumbnail;if(!t||t.isEmpty())return '';return 'data:image/jpeg;base64,'+t.toJPEG(70).toString('base64');}catch{return '';}};

// --- Turns ------------------------------------------------------------------------------------------------------------
async function pickTurn(s,command){
 if(state.active)return kit.reply(s,command,{by:BY,text:'Уже идёт запись экрана — нажмите «Стоп» в окошке записи.'});
 if(!await deps.permission())return kit.reply(s,command,{by:BY,question:true,text:'Чтобы записать экран, разрешите Пете запись экрана: «Системные настройки → Конфиденциальность и безопасность → Запись экрана». Включите там Петю и повторите.'});
 let sources=[];
 try{sources=await deps.sources(s);}catch(e){return kit.reply(s,command,{by:BY,error:true,text:'Не получилось получить список окон: '+e.message});}
 if(!sources.length)return kit.reply(s,command,{by:BY,error:true,text:'Не нашёл ни экранов, ни окон для записи.'});
 const id=randomUUID(),note=noteIn(command);
 let screens=0;
 const list=sources.slice(0,24).map(src=>{const kind=/^screen:/.test(src.id)?'screen':'window';return {id:src.id,kind,name:kind==='screen'?'Экран '+(++screens):String(src.name||'').slice(0,120),thumb:thumbOf(src)};});
 let logs=[];try{logs=deps.logs().slice(0,6).map(l=>({file:l.file,label:l.label,kind:l.kind,mtime:l.mtime}));}catch{logs=[];}
 state.picks.set(id,{id,at:deps.now(),note,sources:new Map(sources.map(x=>[x.id,x])),logs:new Set(logs.map(l=>l.file))});
 while(state.picks.size>3)state.picks.delete(state.picks.keys().next().value);
 const text='Выберите окно игры или экран — запись начнётся только после «Начать запись» и остановится по «Стоп» или через 2 минуты.'+(logs.length?' Нашёл лог: '+logs[0].label+'.':'');
 return kit.reply(s,command,{by:BY,text,data:{screenBug:{stage:'pick',pick:id,note,sources:list,logs,max:recorder.MAX_MS,at:deps.now()}}});
}
async function draftTurn(s,command){
 let id=state.pending&&deps.now()-(state.done.get(state.pending)?.at||0)<3600000?state.pending:null;
 if(!id){try{const m=fs.readdirSync(dir()).filter(f=>/^[0-9a-f-]{36}\.json$/.test(f)).map(f=>({id:f.slice(0,36),t:fs.statSync(path.join(dir(),f)).mtimeMs})).sort((a,b)=>b.t-a.t)[0];id=m?.id||null;}catch{id=null;}}
 if(!id)return kit.reply(s,command,{by:BY,question:true,text:'Записи пока нет. Скажите «запиши баг», выберите окно игры и нажмите «Начать запись».'});
 state.pending=null;
 const m=meta(id);
 const lines=m.log?.lines||[];
 s.requestProgress?.report?.('Составляю баг по записи');
 const d=await drafts.draft(s,{lines,note:m.note,window:m.source});
 const text=(d.title?'Набросал баг: «'+d.title+'». ':'Запись готова. ')+(d.model?'Поле «Фактически» — по строкам лога, номера строк отмечены. ':'')+'Допишите шаги, проверьте текст и выберите трекер — задачу создам только после вашего подтверждения, запись и лог прикреплю по вашему нажатию.';
 return kit.reply(s,command,{by:BY,text,data:{screenBug:{stage:'report',id,at:m.at,source:m.source,kind:m.kind,duration:m.duration,bytes:m.bytes,poster:m.poster,reason:m.reason,note:m.note,
  video:{name:attachName(id,m,'.webm'),bytes:m.bytes},log:m.log?{label:m.log.label,file:m.log.file,mode:m.log.mode,lines:m.log.lines,errors:m.log.errors,warnings:m.log.warnings,hidden:m.log.hidden,truncated:m.log.truncated,unity:m.log.unity,name:attachName(id,m,'.log.txt')}:null,
  system:m.system||[],draft:d}}});
}
async function turn(s,command){
 const text=String(command||'');
 const want=intent(text);
 if(!want||!kit.installed(s,ID))return null;
 if(want==='stop'){if(!state.active)return kit.reply(s,command,{by:BY,text:'Сейчас ничего не записывается.'});state.active.controller.stop();return kit.reply(s,command,{by:BY,text:'Останавливаю запись — черновик бага появится следом.'});}
 if(want==='draft')return draftTurn(s,command);
 return pickTurn(s,command);
}

// --- Recording ----------------------------------------------------------------------------------------------------------
const attachName=(id,m,ext)=>'bug-'+(String(m.source||'screen').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,40)||'screen')+'-'+String(id).slice(0,8)+ext;
async function finalize(s,active,result){
 const stopped=deps.now();
 const m={id:active.id,at:stopped,started:active.started,source:active.source,kind:active.kind,note:active.note,duration:result.duration||stopped-active.started,bytes:result.bytes,poster:result.poster||'',reason:result.reason||'stop',log:null,system:[]};
 if(active.log){
  try{const x=unityLog.excerpt(active.log,{offset:active.offset,started:active.started,stopped,seconds:30});m.log={...x,label:active.logLabel||x.label};fs.writeFileSync(fileOf(active.id,'.log.txt'),unityLog.asText(x),{mode:0o600});}
  catch(e){m.log={file:active.log,label:active.logLabel||path.basename(active.log),mode:'offset',lines:[],errors:0,warnings:0,hidden:0,truncated:false,unity:'',error:e.message};}
 }
 if(active.system){try{m.system=await deps.system(m.log?.unity||'');}catch{m.system=[];}}
 fs.writeFileSync(fileOf(active.id,'.json'),JSON.stringify(m),{mode:0o600});
 state.done.set(active.id,m);prune();
 return m;
}
async function begin(s,pickId,sourceId,options={}){
 if(state.active)throw Error('Уже идёт запись.');
 const pick=state.picks.get(String(pickId));
 if(!pick)throw Error('Список окон устарел — скажите «запиши баг» ещё раз.');
 const source=pick.sources.get(String(sourceId));
 if(!source)throw Error('Это окно уже недоступно — выберите другое.');
 const log=options.log?String(options.log):'';
 if(log&&!pick.logs.has(log))throw Error('Этот лог не из списка — выберите его кнопкой «Другой лог…».');
 let offset=0;if(log){try{offset=fs.statSync(log).size;}catch{throw Error('Лог не найден: '+path.basename(log));}}
 const id=randomUUID();
 fs.mkdirSync(dir(),{recursive:true,mode:0o700});
 const kind=/^screen:/.test(source.id)?'screen':'window';
 const active={id,pickId:pick.id,source:kind==='screen'?'Экран':String(source.name||''),kind,note:pick.note,log,logLabel:options.logLabel?String(options.logLabel).slice(0,120):'',offset,started:deps.now(),system:options.system!==false};
 state.active=active;
 let controller;
 try{controller=await deps.record({source,file:fileOf(id,'.webm'),max:recorder.MAX_MS});}
 catch(e){state.active=null;throw Error('Запись не началась: '+e.message);}
 active.controller=controller;
 publish(s,{text:'Идёт запись: '+active.source+' · до '+clock(recorder.MAX_MS)+'. Остановить — «Стоп» в окошке записи.',busy:true,kind:'info',version:'rec:'+id,recording:id});
 controller.done.then(async result=>{
  state.active=null;
  if(!result.bytes){publish(s,{text:'Запись пустая — окно закрылось или запись не началась. Попробуйте ещё раз.',busy:false,kind:'error',version:'empty:'+id});return;}
  const m=await finalize(s,active,result);
  state.pending=id;
  publish(s,{text:'Запись готова ('+clock(m.duration)+(m.reason==='cap'?', остановлена на лимите 2 минуты':'')+') — открываю черновик бага.',busy:false,kind:'success',version:'done:'+id,recording:id,ready:true});
 },e=>{state.active=null;publish(s,{text:'Запись прервалась: '+e.message,busy:false,kind:'error',version:'error:'+id});});
 return {recording:id,max:recorder.MAX_MS,started:active.started};
}

function setup(s){
 return {ipc:{
  status:()=>({active:state.active?{id:state.active.id,started:state.active.started,source:state.active.source,max:recorder.MAX_MS}:null,operation:state.operation}),
  progress:()=>state.operation,
  // «Начать запись» under the chosen window (the user pressed it).
  start:(pickId,sourceId,options)=>begin(s,pickId,sourceId,options&&typeof options==='object'?options:{}),
  stop(){if(!state.active)return {stopped:false};state.active.controller?.stop();return {stopped:true};},
  // «Другой лог…»: a file from the system dialog only.
  async chooseLog(pickId){
   const pick=state.picks.get(String(pickId));if(!pick)throw Error('Список окон устарел — скажите «запиши баг» ещё раз.');
   const r=await deps.openDialog(s.win&&!s.win.isDestroyed?.()?s.win:undefined,{title:'Лог игры',properties:['openFile'],filters:[{name:'Log',extensions:['log','txt']}]});
   if(r.canceled||!r.filePaths?.[0])return {canceled:true};
   const file=r.filePaths[0];if(!fs.statSync(file).isFile())throw Error('Это не файл.');
   pick.logs.add(file);return {file,label:path.basename(file)};
  },
  poster(id){return meta(String(id)).poster||'';},
  reveal(id){meta(String(id));deps.showItem(fileOf(String(id),'.webm'));return {shown:true};},
  // The card handed the report to a tracker: remember when, to find the task it creates.
  handoff(id,provider){meta(String(id));if(!['jira','asana'].includes(provider))return {attachable:false};state.handoffs.set(String(id),{provider,at:Date.now()-2000});return {attachable:true};},
  recent(id){const h=state.handoffs.get(String(id));if(!h)return [];const topic=s.dialogue.active();return attach.recent(topic?.messages||[],h.at,{jiraUrl:s.settings.jiraUrl||''}).filter(x=>x.provider===h.provider);},
  // «Прикрепить запись и лог к KEY» (the user pressed it): the video and the log excerpt, each one upload.
  async attach(id,provider,target,what){
   const m=meta(String(id)),key=attach.parseTarget(provider,target),want={video:what?.video!==false,log:what?.log!==false&&!!m.log};
   const done=[];
   if(want.video)done.push(await attach.upload(s,{provider,key,file:fileOf(m.id,'.webm'),name:attachName(m.id,m,'.webm'),type:'video/webm'}));
   if(want.log&&fs.existsSync(fileOf(m.id,'.log.txt')))done.push(await attach.upload(s,{provider,key,file:fileOf(m.id,'.log.txt'),name:attachName(m.id,m,'.log.txt'),type:'text/plain'}));
   if(!done.length)throw Error('Нечего прикреплять — отметьте запись или лог.');
   const where=provider==='jira'?key:'задаче Asana';
   return {provider,key,url:done[0].url,files:done.map(d=>d.name),text:(want.video&&want.log&&done.length===2?'Запись и лог прикреплены к ':want.video?'Запись прикреплена к ':'Лог прикреплён к ')+where+'.'};
  }
 }};
}
function teardown(){try{state.active?.controller?.stop();}catch{/* window gone */}}
module.exports={name:'screenBug',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,teardown,intent,wanted,noteIn,finalize,state,deps};
