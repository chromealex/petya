// «Скриншот → задача»: a region of the screen becomes a bug draft. The global shortcut (Cmd/Ctrl+Shift+2 by default,
// set in the app's settings) or «сделай баг из скриншота» starts the region picker; the chat gets a card with the
// image and annotation tools, a draft (title, steps, expected, actual) written by a local vision model from the
// image, the front window's title and the user's note, and the project's tracker through k.links('task-tracker').
// Nothing is created or uploaded without the user's press: the tracker's own flow previews and confirms the task,
// and the picture is attached to the created task by «Прикрепить скриншот к KEY».
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const vision=require('./vision.cjs');
const attach=require('./attach.cjs');
const {label:windowLabel}=require('./active-window.cjs');
const ID='screenshot-task',BY='Скриншот → задача',DEFAULT_SHORTCUT='CommandOrControl+Shift+2';

// «сделай баг из скриншота», «скрин в задачу», «заведи баг по этому экрану», «задачу по скрину».
const SHOT='(?:скрин\\p{L}*|скриншот\\p{L}*|снимк\\p{L}* экрана|снимок экрана|этому экрану|этого экрана|экрану|экрана)';
const WANT=new RegExp('(?:сделай|сделать|заведи|завести|создай|создать|оформи|оформить|запиши|записать|нужен|нужна)\\s+(?:мне\\s+)?(?:баг\\p{L}*|задач\\p{L}*|тикет\\p{L}*|issue|ишью|баг-репорт)\\s+(?:из|по|со|с|на основе)\\s+(?:этого\\s+|этому\\s+|моего\\s+|последнего\\s+)?'+SHOT+'|(?:скрин\\p{L}*|скриншот\\p{L}*)\\s+(?:в|во)\\s+(?:задач\\p{L}*|баг\\p{L}*|тикет\\p{L}*|jira|джир\\p{L}*|asana|асан\\p{L}*)|(?:баг|задач\\p{L}*)\\s+по\\s+(?:этому\\s+)?(?:скрин\\p{L}*|скриншот\\p{L}*|экрану)','iu');
// Talking about the feature, not asking for it.
const QUIET=/^(?:а\s+)?(?:как|что такое|зачем|почему|не\s+(?:надо|нужно|делай))/iu;
const wanted=text=>WANT.test(String(text||''))&&!QUIET.test(String(text||'').trim());
// «…: кнопка не нажимается» or «…, заметка: …» → the note for the model and the task.
function noteIn(text){const m=String(text||'').match(/(?:[:—–]|заметка:?|примечание:?)\s*(.+)$/u);return m?m[1].trim().slice(0,500):'';}

// Global shortcuts Petya or the system already use.
const RESERVED={
 'CommandOrControl+Shift+F12':'останавливает управление компьютером в Пете',
 'CommandOrControl+Shift+3':'снимок экрана macOS','CommandOrControl+Shift+4':'снимок области macOS','CommandOrControl+Shift+5':'панель снимков macOS',
 'CommandOrControl+Shift+Q':'выход из системы macOS','CommandOrControl+Q':'выход из приложения','CommandOrControl+W':'закрытие окна',
 'CommandOrControl+C':'копирование','CommandOrControl+V':'вставка','CommandOrControl+X':'вырезание','CommandOrControl+Z':'отмена'};
const MODS='(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|Shift|Super)';
function normalize(acc){
 const v=String(acc||'').trim();if(!v)return '';
 if(!new RegExp('^(?:'+MODS+'\\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1\\d|2[0-4]))$','i').test(v))throw Error('Сочетание: от одного до трёх модификаторов и клавиша, например CommandOrControl+Shift+2.');
 const parts=v.split('+'),key=parts.pop().toUpperCase();
 const mods=[...new Set(parts.map(m=>({cmdorctrl:'CommandOrControl',commandorcontrol:'CommandOrControl',cmd:'Command',command:'Command',ctrl:'Control',control:'Control',option:'Alt',alt:'Alt',shift:'Shift',super:'Super'})[m.toLowerCase()]))];
 if(!mods.some(m=>m!=='Shift'))throw Error('Нужен хотя бы один модификатор кроме Shift.');
 const order=['CommandOrControl','Command','Control','Alt','Super','Shift'];
 return [...mods.sort((a,b)=>order.indexOf(a)-order.indexOf(b)),key].join('+');
}
function conflict(acc){return RESERVED[acc]||'';}

const state={pending:null,shots:new Map(),registered:'',shortcutError:'',busy:false};
const deps={
 electron:()=>require('electron'),
 userData:()=>{try{return require('electron').app.getPath('userData');}catch{return require('node:os').tmpdir();}},
 capture:opts=>require('./capture.cjs').captureRegion(opts),
 activeWindow:()=>require('./active-window.cjs').activeWindow(),
 installedModels:async s=>{try{return (await s.optionalModels?.installed?.())||[];}catch{return [];}},
 // Downscaled PNG (≤1280 px) for the model, from the annotated picture when there is one.
 forModel:file=>{const {nativeImage}=require('electron');let img=nativeImage.createFromPath(file);const sz=img.getSize();if(Math.max(sz.width,sz.height)>1280)img=img.resize(sz.width>=sz.height?{width:1280}:{height:1280});return img.toPNG().toString('base64');},
 copyImage:file=>{const {clipboard,nativeImage}=require('electron');clipboard.writeImage(nativeImage.createFromPath(file));},
 showItem:file=>require('electron').shell.showItemInFolder(file),
 smoke:()=>process.env.PETYA_SMOKE_TEST==='1'
};
const dir=()=>path.join(deps.userData(),'screenshot-task');
const fileOf=(id,annotated=false)=>{if(!/^[0-9a-f-]{36}$/.test(String(id)))throw Error('Снимок не найден.');return path.join(dir(),id+(annotated?'-annotated':'')+'.png');};
const current=id=>{const a=fileOf(id,true);return fs.existsSync(a)?a:fileOf(id);};
// Keeps the last 40 shots (with their annotation files).
function prune(){
 try{const files=fs.readdirSync(dir()).filter(f=>/^[0-9a-f-]{36}\.png$/.test(f)).map(f=>({f,t:fs.statSync(path.join(dir(),f)).mtimeMs})).sort((a,b)=>b.t-a.t);
  for(const {f} of files.slice(40)){const id=f.slice(0,36);for(const x of [id+'.png',id+'-annotated.png',id+'.json'])fs.rmSync(path.join(dir(),x),{force:true});}}catch{/* nothing stored yet */}
}
function store(shot){
 const id=randomUUID();fs.mkdirSync(dir(),{recursive:true,mode:0o700});
 fs.writeFileSync(fileOf(id),shot.png,{mode:0o600});
 const meta={id,width:shot.width,height:shot.height,window:shot.window||{app:'',title:''},at:Date.now()};
 fs.writeFileSync(path.join(dir(),id+'.json'),JSON.stringify({...meta,shapes:[]}),{mode:0o600});
 state.shots.set(id,meta);prune();return meta;
}
function meta(id){
 if(state.shots.has(id))return state.shots.get(id);
 try{fileOf(id);const m=JSON.parse(fs.readFileSync(path.join(dir(),id+'.json'),'utf8'));state.shots.set(id,m);return m;}catch{throw Error('Снимок не найден — сделайте новый.');}
}

async function visionState(s){
 const names=await deps.installedModels(s);
 const model=vision.pickModel(names,s.optionalModels?.catalog||[]);
 const entry=(s.optionalModels?.catalog||[]).find(m=>m.name===vision.PREFERRED);
 return {model,size:entry?.size||3.3e9,name:vision.PREFERRED};
}
async function draftFor(s,shot,note){
 const v=await visionState(s);
 if(!v.model)return {draft:null,vision:v};
 s.requestProgress?.report?.('Описываю скриншот ('+v.model+')');
 let draft=null,error='';
 try{draft=await vision.describe(s,{model:v.model,image:deps.forModel(current(shot.id)),window:windowLabel(shot.window),note});}
 catch(e){error=e.message;}
 return {draft,vision:v,error};
}

// Takes the region now (or uses the one the shortcut just took) and answers with the card.
async function cardTurn(s,command){
 let shot=state.pending&&Date.now()-state.pending.at<180000?state.pending:null;
 state.pending=null;
 if(!shot){
  if(state.busy)return kit.reply(s,command,{by:BY,text:'Уже выбираю область экрана — закончите выделение или нажмите Esc.'});
  state.busy=true;
  try{
   // The front window is read after Petya stepped aside, so it is the window the bug is about.
   const taken=await deps.capture({win:s.win,smoke:deps.smoke(),context:()=>deps.activeWindow()});
   if(taken.permission===false)return kit.reply(s,command,{by:BY,question:true,text:taken.text});
   if(taken.cancelled)return kit.reply(s,command,{by:BY,text:'Снимок отменён. Скажите «сделай баг из скриншота» или нажмите '+shortcutLabel(s)+', когда будете готовы.'});
   shot=store(taken);
  }finally{state.busy=false;}
 }
 const note=noteIn(command);
 const {draft,vision:v,error}=await draftFor(s,shot,note);
 const where=windowLabel(shot.window);
 const text=draft?'Набросал баг по скриншоту'+(where?' («'+where+'»)':'')+': «'+draft.title+'». Проверьте текст, отметьте на картинке главное и выберите трекер — без вашего нажатия ничего не создам.'
  :v.model?'Скриншот готов, но описание не получилось'+(error?' ('+error+')':'')+'. Заполните поля сами или нажмите «Составить описание» ещё раз.'
  :'Скриншот готов. Чтобы Петя сам описал баг по картинке, нужна модель для скриншотов ('+v.name+') — скачайте её из карточки или заполните поля сами.';
 return kit.reply(s,command,{by:BY,text,data:{screenshotTask:{id:shot.id,width:shot.width,height:shot.height,window:where,note,draft,vision:{model:v.model,name:v.name,size:v.size},at:shot.at}}});
}
const shortcutLabel=s=>{const acc=s.settings.screenshotTaskShortcut??DEFAULT_SHORTCUT;return acc?acc.replace('CommandOrControl',process.platform==='darwin'?'Cmd':'Ctrl'):'сочетание клавиш';};

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 return cardTurn(s,text);
}

// Shortcut: registered while the app is added; a press takes the region at once (the screen as it is) and asks
// the chat to open the card through the ordinary request «скрин в задачу».
function makeShortcut(s){
 async function pressed(){
  if(state.busy)return;
  state.busy=true;
  try{
   const taken=await deps.capture({win:s.win,smoke:deps.smoke(),context:()=>deps.activeWindow()});
   if(taken.permission===false){publish(s,{text:taken.text,kind:'attention'});return;}
   if(taken.cancelled)return;
   state.pending=store(taken);
   if(s.win&&!s.win.isDestroyed()){if(s.win.isMinimized())s.win.restore();s.win.show();s.win.focus();}
   publish(s,{text:'Снимок готов — открываю карточку в чате.',kind:'success',shot:state.pending.id});
  }catch(e){publish(s,{text:'Не получилось снять экран: '+e.message,kind:'error'});}
  finally{state.busy=false;}
 }
 function sync(){
  if(deps.smoke())return;
  let globalShortcut;try{globalShortcut=deps.electron().globalShortcut;}catch{return;}
  let want='';
  try{want=kit.installed(s,ID)?normalize(s.settings.screenshotTaskShortcut??DEFAULT_SHORTCUT):'';}catch{want='';}
  if(want===state.registered)return;
  if(state.registered){try{globalShortcut.unregister(state.registered);}catch{/* already gone */}state.registered='';}
  state.shortcutError='';
  if(!want)return;
  if(conflict(want)){state.shortcutError='Сочетание занято: '+conflict(want)+'.';return;}
  let ok=false;try{ok=globalShortcut.register(want,()=>{pressed();});}catch{ok=false;}
  if(ok)state.registered=want;else state.shortcutError='Сочетание '+want+' уже занято другой программой. Выберите другое в настройках приложения.';
 }
 return {pressed,sync};
}
function publish(s,item){
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',{id:'screenshot-task-shot',title:BY,busy:false,version:String(Date.now()),...item});}catch{/* window closing */}
}

function setup(s){
 const shortcut=makeShortcut(s);
 shortcut.sync();
 if(!deps.smoke()){const timer=setInterval(shortcut.sync,3000);timer.unref?.();try{deps.electron().app.on('will-quit',()=>{clearInterval(timer);try{deps.electron().globalShortcut.unregister(state.registered);}catch{/* quitting */}});}catch{/* outside Electron */}}
 const handoffs=new Map();
 return {ipc:{
  // The picture for the editor: the original plus the shapes saved last time.
  image(id){const m=meta(id);let shapes=[];try{shapes=JSON.parse(fs.readFileSync(path.join(dir(),id+'.json'),'utf8')).shapes||[];}catch{/* none */}
   return {url:'data:image/png;base64,'+fs.readFileSync(fileOf(id)).toString('base64'),width:m.width,height:m.height,shapes};},
  // The annotated picture (flattened PNG from the canvas) and its shapes for later edits.
  save(id,dataUrl,shapes){
   meta(id);const m=String(dataUrl||'').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
   if(!m)throw Error('Картинка не сохранилась.');const png=Buffer.from(m[1],'base64');
   if(png.length>25*1024*1024||png.readUInt32BE(0)!==0x89504e47)throw Error('Картинка не сохранилась.');
   if(!Array.isArray(shapes)||shapes.length>200)throw Error('Слишком много пометок.');
   fs.writeFileSync(fileOf(id,true),png,{mode:0o600});
   const file=path.join(dir(),id+'.json');const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   fs.writeFileSync(file,JSON.stringify({...saved,shapes:JSON.parse(JSON.stringify(shapes)).slice(0,200)}),{mode:0o600});
   return {saved:true,bytes:png.length};
  },
  // A new draft from the (annotated) picture and the note; or what is missing for it.
  async draft(id,note){const m=meta(id);const r=await draftFor(s,m,String(note||'').slice(0,500));if(!r.vision.model)return {needsModel:true,vision:r.vision};if(!r.draft)throw Error('Модель не смогла описать скриншот'+(r.error?': '+r.error:'.'));return {draft:r.draft,vision:r.vision};},
  vision:()=>visionState(s),
  // The optional-models download (progress in the notification center); the user pressed «Скачать модель».
  downloadModel(){if(!s.optionalModels?.download)throw Error('Загрузка моделей недоступна.');return s.optionalModels.download(vision.PREFERRED);},
  copy(id){deps.copyImage(current(id));return {copied:true};},
  reveal(id){deps.showItem(current(id));return {shown:true};},
  // The card handed the draft to a tracker: remember when, to find the task it creates.
  handoff(id,provider){meta(id);if(!['jira','asana'].includes(provider))return {attachable:false};handoffs.set(id,{provider,at:Date.now()-2000});return {attachable:true};},
  recent(id){const h=handoffs.get(id);if(!h)return [];const topic=s.dialogue.active();return attach.recent(topic?.messages||[],h.at,{jiraUrl:s.settings.jiraUrl||''}).filter(x=>x.provider===h.provider);},
  // Upload after the press of «Прикрепить скриншот к KEY».
  async attach(id,provider,target){const m=meta(id);const key=attach.parseTarget(provider,target);
   const done=await attach.upload(s,{provider,key,file:current(id),name:attach.fileName(id,windowLabel(m.window))});
   return {...done,text:'Скриншот прикреплён к '+(provider==='jira'?key:'задаче Asana')+'.'};},
  shortcut:()=>({accelerator:s.settings.screenshotTaskShortcut??DEFAULT_SHORTCUT,registered:state.registered,error:state.shortcutError,default:DEFAULT_SHORTCUT}),
  setShortcut(value){const acc=normalize(value);if(acc&&conflict(acc))throw Error('Сочетание занято: '+conflict(acc)+'.');s.saveSettings({screenshotTaskShortcut:acc});shortcut.sync();return {accelerator:acc,registered:state.registered,error:state.shortcutError};},
  // For the settings button «Проверить»: the same as pressing the shortcut.
  capture:()=>shortcut.pressed()
 }};
}
function validate(next){
 if(next.screenshotTaskShortcut===undefined)return;
 try{const acc=normalize(next.screenshotTaskShortcut);next.screenshotTaskShortcut=acc&&conflict(acc)?DEFAULT_SHORTCUT:acc;}catch{next.screenshotTaskShortcut=DEFAULT_SHORTCUT;}
}
module.exports={name:'screenshotTask',defaults:{['extension_'+ID]:'false',screenshotTaskShortcut:DEFAULT_SHORTCUT},validate,setup,turn,wanted,noteIn,normalize,conflict,state,deps,makeShortcut,DEFAULT_SHORTCUT};
