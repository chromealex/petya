// «Генератор уровней»: maps for the user's RTS engine through the engine's own MCP server (rtsmcp). A chat request
// becomes map_generate arguments (rules by code, the local model fills the rest, the preset's schema checks them);
// the map is generated as a draft inside rtsmcp, validated and drawn on the card. The project folder is written
// only by «Сохранить в проект» (map_save through rtsmcp) after the user confirms, and an existing map is never
// overwritten without a second, explicit confirmation. Engine files are never edited. The engine is the user's
// own install when there is one; otherwise the card / settings download the ready package (engine.cjs).
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID,randomInt}=require('node:crypto');
const kit=require('../app-kit.cjs');
const engine=require('./engine.cjs');
const intent=require('./intent.cjs');
const maps=require('./maps.cjs');
const store=require('./store.cjs');
const {McpClient}=require('./mcp-client.cjs');
const ID='rts-levels',NAME='rtsLevels',BY='Генератор уровней';
const IDLE=10*60*1000;

const state={session:null,loaded:'',chain:Promise.resolve(),download:null,balances:new Map(),notices:new Map(),latest:null,services:null};
const deps={
 userData:()=>{try{return require('electron').app.getPath('userData');}catch{return '';}},
 platform:()=>process.platform,arch:()=>process.arch,env:()=>process.env,home:()=>os.homedir(),
 fetch:(...a)=>fetch(...a),raw:engine.RAW,api:engine.API,spawn:undefined,seed:()=>randomInt(1,100000),
 confirm:async(win,text,detail,button)=>{const {t}=require('../../interface-language.cjs');return (await require('../../app-dialog.cjs').showMessageBox(win,{message:t(text),detail:t(detail),buttons:[t('Отмена'),t(button)],defaultId:0,cancelId:0})).response===1;},
 chooseFolder:async win=>{const r=await require('electron').dialog.showOpenDialog(win,{title:require('../../interface-language.cjs').t('Папка RTS-проекта (с game.json)'),properties:['openDirectory']});return r.canceled?'':r.filePaths[0]||'';},
 launch:(cmd,args)=>{const child=require('node:child_process').spawn(cmd,args,{detached:true,stdio:'ignore',windowsHide:false});child.on('error',()=>{});child.unref();}
};

// ---- engine ----------------------------------------------------------------------------------------------------
function found(s){return engine.detect({settingsPath:s.settings.rtsLevelsEnginePath||'',userData:deps.userData(),env:deps.env(),platform:deps.platform(),home:deps.home()});}
const current=s=>engine.best(found(s));
const SOURCE={settings:'путь из настроек',path:'rtsmcp из PATH',home:'~/RTSEngine',download:'скачан Петей'};
async function latest({force=false}={}){
 if(!force&&state.latest&&Date.now()-state.latest.at<6*3600*1000)return state.latest.pkg;
 const pkg=await engine.latest({platform:deps.platform(),arch:deps.arch(),fetchImpl:deps.fetch,raw:deps.raw,api:deps.api});
 state.latest={at:Date.now(),pkg};return pkg;
}
function publish(s,id,item){
 const notice={id,title:BY,...item};state.notices.set(id,notice);
 while(state.notices.size>10)state.notices.delete(state.notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
// The rtsmcp session of the current engine: started on first use, closed when idle or when the engine changes.
function session(s){
 const e=current(s);
 if(!e)throw Object.assign(Error('Движок RTS не найден.'),{noEngine:true});
 const key=e.rtsmcp+'\n'+e.engine;
 if(state.session&&state.session.key===key&&!state.session.client.closed&&state.session.client.child?.exitCode==null){clearTimeout(state.session.idle);}
 else{
  state.session?.client.close();state.loaded='';
  const client=new McpClient({command:e.rtsmcp,args:engine.mcpArgs(e),cwd:path.dirname(e.rtsmcp),timeout:120000,spawnImpl:deps.spawn,name:'petya-rts-levels'});
  state.session={key,client,engine:e,idle:null};
 }
 const sess=state.session;
 sess.idle=setTimeout(()=>{if(state.session===sess){sess.client.close();state.session=null;state.loaded='';}},IDLE);sess.idle.unref?.();
 return sess;
}
// rtsmcp has one open game and map: every use goes through this queue.
function exclusive(fn){const run=state.chain.then(fn,fn);state.chain=run.catch(()=>{});return run;}
async function withDraft(s,draft,fn){
 return exclusive(async()=>{
  const sess=session(s),mcp=sess.client;
  const mark=draft.id+':'+draft.rev;
  if(state.loaded!==mark||mcp.closed){state.loaded='';await maps.build(mcp,draft);state.loaded=mark;}
  return fn(mcp);
 });
}

// ---- drafts and cards ------------------------------------------------------------------------------------------
function titleOf(request,v){
 if(v.title)return v.title;
 const parts=[];
 if(v.river)parts.push('Река посередине');
 parts.push(v.teams?v.teams.join(' на '):v.gen.players+' '+kit.plural(v.gen.players,['игрок','игрока','игроков']));
 if(!v.river)parts.unshift(v.presetTitle.replace(/\s*\(.*\)\s*$/,''));
 if(v.gen.symmetry!=='auto'&&v.gen.symmetry!=='none'&&!v.river)parts.push('симметричная');
 if(v.gen.params.resources>1)parts.push('больше ресурсов');else if(v.gen.params.resources<1)parts.push('меньше ресурсов');
 return parts.join(' · ');
}
function card(s,draft,view){
 const e=current(s);
 return {type:'map',id:draft.id,rev:draft.rev,title:draft.title,folder:draft.folder,projectName:path.basename(draft.folder),
  file:draft.saved?.file||draft.file,saved:draft.saved||null,
  preset:{id:draft.gen.preset,title:draft.presetTitle||draft.gen.preset},seed:draft.gen.seed,players:draft.gen.players,symmetry:draft.gen.symmetry,
  teams:draft.teams||null,river:draft.river||null,params:draft.gen.params||{},
  size:[view.width,view.height],preview:view.preview,roster:view.players,issues:view.issues,errors:view.errors,
  paths:view.paths,connected:view.connected,pathSpread:view.pathSpread,objects:view.objects,
  edits:(draft.edits||[]).map(x=>x.label),balance:draft.balance||null,editor:!!e?.editor,platform:deps.platform(),at:new Date().toISOString()};
}
// The card's message keeps the newest state, so the chat shows it after a restart.
function remember(s,data){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){
  if(m.extensionData?.rtsLevels?.type==='map'&&m.extensionData.rtsLevels.id===data.id){m.extensionData={...m.extensionData,rtsLevels:data};}
 }
 try{s.dialogue?.persist?.();}catch{/* not saved */}
}
function draftInChat(s){
 const topic=s.dialogue?.active?.();
 for(const m of [...(topic?.messages||[])].reverse()){const d=m.extensionData?.rtsLevels;if(d?.type==='map'&&!d.discarded)return store.getDraft(s,d.id);}
 return null;
}
function load(s,id){const d=store.getDraft(s,id);if(!d)throw Error('Черновик не найден — возможно, его удалили. Попросите карту ещё раз.');if(!store.isGame(d.folder))throw Error('Папка проекта недоступна: '+d.folder);return d;}
async function render(s,draft){
 return withDraft(s,draft,async mcp=>{const view=await maps.describe(mcp,draft);draft.hash=view.hash;store.putDraft(s,draft);return card(s,draft,view);});
}
function summary(c){
 const who=c.teams?c.teams.join(' на '):c.players+' '+kit.plural(c.players,['игрок','игрока','игроков']);
 const check=c.errors?'Проверка: '+c.errors+' '+kit.plural(c.errors,['ошибка','ошибки','ошибок'])+'.':'Проверка без ошибок.';
 return 'Черновик «'+c.title+'»: '+c.size[0]+'×'+c.size[1]+', '+who+', пресет «'+c.preset.title+'», сид '+c.seed+'. '+check+' В проект ничего не записано — «Сохранить в проект» на карточке.';
}

// ---- chat turns ------------------------------------------------------------------------------------------------
function engineCard(s,command,{unsupported='',pkg=null}={}){
 return {type:'engine',command,platform:deps.platform(),unsupported,size:pkg?.size||null,version:pkg?.version||'',commit:pkg?.commit||'',busy:!!state.download};
}
async function needEngine(s,command){
 let pkg=null,unsupported='';
 try{pkg=await latest();if(pkg.unsupported){unsupported=pkg.unsupported;pkg=null;}}catch(e){unsupported='';pkg=null;}
 const text=unsupported?unsupported:'Для карт нужен движок RTS (rtsmcp). Установленного на этом компьютере я не нашёл: скачайте готовую сборку кнопкой в карточке или укажите папку движка в настройках → «Генератор уровней».';
 return kit.reply(s,command,{by:BY,question:true,text,data:{rtsLevels:engineCard(s,command,{unsupported,pkg})}});
}
async function askFolder(s,command,resume){
 const options=[];
 try{
  const list=await exclusive(()=>session(s).client.call('list_projects',{}));
  for(const p of list?.projects||[]){const dir=p.dir||p.path||p.folder;if(dir&&store.isGame(dir))options.push(dir);}
 }catch{/* only typed paths */}
 for(const dir of store.projectFolders(s))if(store.isGame(dir)&&!options.includes(dir))options.push(dir);
 return require('../../input-required.cjs').ask({text:'Для какого RTS-проекта делать карту? Выберите папку с game.json или напишите путь — запомню её для этого проекта Пети.',label:'Папка RTS-проекта',placeholder:'Например: ~/RTSProjects/MyGame',options:options.slice(0,6)},
  answer=>{store.setFolder(s,answer);return resume();});
}
async function generate(s,command,request,{retried=false}={}){
 const folder=store.folder(s);
 if(!folder)return askFolder(s,command,()=>generate(s,command,request,{retried:true}));
 const presets=await exclusive(async()=>{const mcp=session(s).client;await mcp.call('open_game',{game:folder});state.loaded='';return mcp.call('gen_presets',{});});
 let req=request;
 try{
  const model=await kit.modelJSON(s,{system:intent.modelPrompt(presets),user:command,schema:intent.MODEL_SCHEMA,predict:300});
  req=intent.merge(request,model);
 }catch{/* rules only */}
 const v=intent.validate(req,presets,{seed:deps.seed()});
 const draft={id:randomUUID(),rev:1,folder,petyaProject:store.project(s).id,gen:v.gen,presetTitle:v.presetTitle,river:v.river,teams:v.teams,title:titleOf(req,v),edits:[],saved:null,balance:null,command:String(command).slice(0,300)};
 draft.file=maps.proposeFile(folder,draft);
 const c=await render(s,draft);
 return kit.reply(s,command,{by:BY,text:summary(c),data:{rtsLevels:c}});
}
async function applyEdit(s,draft,edit){
 const plan=await withDraft(s,draft,async mcp=>{const view=await maps.describe(mcp,draft);draft.kinds=draft.kinds||null;return {view,plan:maps.planEdit(draft,view,edit)};});
 if(plan.plan.error)return {error:plan.plan.error};
 const before=plan.view.hash;
 if(plan.plan.calls){
  await withDraft(s,draft,mcp=>maps.run(mcp,plan.plan.calls));
  draft.edits.push({label:edit.label,calls:plan.plan.calls,before,...(plan.plan.river?{river:draft.river}:{})});
  if(plan.plan.river)draft.river=plan.plan.river;
  draft.rev++;state.loaded=draft.id+':'+draft.rev;
 }else{
  const prev={};for(const k of Object.keys(plan.plan.recipe))prev[k]=draft[k];
  Object.assign(draft,plan.plan.recipe);
  // positions of earlier edits were measured on the old map
  draft.edits=[{label:edit.label,recipe:prev,dropped:draft.edits}];
  draft.rev++;
 }
 return {card:await render(s,draft)};
}
async function undo(s,draft){
 const last=draft.edits.at(-1);
 if(!last)return {error:'Правок нет — это исходный вариант карты.'};
 if(last.calls){
  const ok=await withDraft(s,draft,async mcp=>{for(const _ of last.calls)await mcp.call('undo',{});const view=await maps.describe(mcp,draft);return view.hash===last.before;});
  draft.edits.pop();if('river' in last)draft.river=last.river;
  draft.rev++;if(ok)state.loaded=draft.id+':'+draft.rev;else state.loaded='';
 }else{Object.assign(draft,last.recipe);draft.edits=last.dropped||[];draft.rev++;}
 return {card:await render(s,draft)};
}
async function variant(s,draft){draft.gen={...draft.gen,seed:draft.gen.seed+1};draft.edits=[];draft.balance=null;draft.saved=null;draft.file=maps.proposeFile(draft.folder,draft);draft.rev++;return render(s,draft);}
async function projectsTurn(s,command){
 const list=await exclusive(()=>session(s).client.call('list_projects',{}));
 const folder=store.folder(s),seen=new Set(),projects=[];
 const add=(dir,name,source)=>{if(!dir||seen.has(dir)||!store.isGame(dir))return;seen.add(dir);projects.push({dir,name:String(name||path.basename(dir)).slice(0,80),source,current:dir===folder,maps:countMaps(dir)});};
 if(folder)add(folder,'',  'chosen');
 for(const p of list?.projects||[])add(p.dir||p.path||p.folder,p.name,'recent');
 for(const dir of store.projectFolders(s))add(dir,'','petya');
 const templates=(list?.templates||[]).map(t=>({id:String(t.id).slice(0,40),name:String(t.name||t.id).slice(0,60)})).slice(0,40);
 const text=projects.length?'RTS-проекты: '+projects.length+'. '+(folder?'Для этого проекта Пети выбран «'+path.basename(folder)+'».':'Выберите, для какого делать карты.'):'Проектов RTS-движка я не нашёл. Выберите папку проекта (с game.json) в карточке.';
 return kit.reply(s,command,{by:BY,text,data:{rtsLevels:{type:'projects',projects,templates,folder,petyaProject:store.project(s).name}}});
}
function countMaps(dir){try{return fs.readdirSync(path.join(dir,'maps')).filter(f=>f.endsWith('.json')).length;}catch{return 0;}}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID))return null;
 const draft=draftInChat(s);
 const what=intent.classify(text,{draft:!!draft,rtsProject:!!store.folder(s)});
 if(!what)return null;
 if(!current(s))return needEngine(s,text);
 try{
  if(what.kind==='projects')return await projectsTurn(s,text);
  if(what.kind==='choose')return await askFolder(s,text,()=>projectsTurn(s,text));
  if(what.kind==='generate')return await generate(s,text,what.request);
  if(!draft)return null;
  if(what.kind==='variant'){const c=await variant(s,draft);return kit.reply(s,text,{by:BY,text:summary(c),data:{rtsLevels:c}});}
  const r=what.kind==='undo'?await undo(s,draft):await applyEdit(s,draft,what.edit);
  if(r.error)return kit.reply(s,text,{by:BY,text:r.error});
  return kit.reply(s,text,{by:BY,text:(what.kind==='undo'?'Отменил последнюю правку. ':'Готово: '+what.edit.label.toLowerCase()+'. ')+summary(r.card),data:{rtsLevels:r.card}});
 }catch(e){
  if(e?.name==='InputRequired')throw e;
  if(e?.noEngine)return needEngine(s,text);
  return kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message});
 }
}

// ---- engine download -------------------------------------------------------------------------------------------
const NOTICE='rts-levels-engine';
const H=n=>Math.max(1,Math.round(n/1e6))+' МБ';
async function verifyEngine(found){
 const client=new McpClient({command:found.rtsmcp,args:engine.mcpArgs(found),cwd:path.dirname(found.rtsmcp),timeout:30000,spawnImpl:deps.spawn});
 try{const tools=await client.listTools();if(!tools.some(t=>t.name==='map_generate'))throw Error('В этом rtsmcp нет генератора карт (map_generate).');return tools.length;}
 catch(e){throw Error('Скачанный rtsmcp не запустился на этом компьютере: '+e.message);}
 finally{client.close();}
}
async function downloadEngine(s,{update=false}={}){
 if(state.download)throw Error('Движок уже скачивается — прогресс в уведомлениях.');
 const have=current(s);
 if(have&&have.source!=='download')return {present:true,source:have.source};
 const controller=new AbortController();state.download=controller;
 try{
  publish(s,NOTICE,{text:'Проверяю последнюю сборку движка…',busy:true,kind:'info',version:'check'});
  const pkg=await latest({force:true});
  if(pkg.unsupported)throw Error(pkg.unsupported);
  if(have?.source==='download'&&have.commit===pkg.commit){publish(s,NOTICE,{text:'Движок '+pkg.version+' ('+pkg.commit+') уже последний.',busy:false,kind:'success',version:'same'});return {present:true,latest:true};}
  const result=await engine.install({userData:deps.userData(),pkg,signal:controller.signal,platform:deps.platform(),fetchImpl:deps.fetch,
   confirm:async bytes=>{if(!require('../../features/extension-replies.cjs').needsApproval(bytes,s.settings))return true;
    return deps.confirm(s.win,update?'Обновить движок RTS?':'Скачать движок RTS?','Готовая сборка '+pkg.version+' ('+pkg.commit+') · '+H(bytes)+' с GitHub (chromealex/rts-engine, ветка builds). Архив проверяется по '+(pkg.sha256?'SHA-256':'контрольной сумме GitHub')+'.',update?'Обновить':'Скачать');},
   status:(stage,fraction)=>publish(s,NOTICE,{text:{download:'Скачиваю движок'+(fraction!=null?' · '+Math.round(fraction*100)+'%':''),unpack:'Распаковываю движок',verify:'Проверяю rtsmcp'}[stage],busy:true,...(stage==='download'&&fraction!=null?{percent:Math.round(fraction*100)}:{}),kind:'info',version:stage}),
   verify:verifyEngine});
  state.session?.client.close();state.session=null;state.loaded='';
  publish(s,NOTICE,{text:'Движок '+result.version+' ('+result.commit+') готов.',busy:false,kind:'success',version:'done'});
  return {present:true,version:result.version,commit:result.commit};
 }catch(e){
  const cancelled=controller.signal.aborted||e.cancelled;
  publish(s,NOTICE,{text:cancelled?'Загрузка движка отменена.':e.message,busy:false,kind:cancelled?'info':'error',version:'error:'+Date.now()});
  if(cancelled)return {present:false,cancelled:true};
  throw e;
 }finally{state.download=null;}
}
async function status(s,{check=false}={}){
 const list=found(s),best=engine.best(list);
 let update=null,pkg=null,error='';
 if(check||!best||best.source==='download'){
  try{pkg=await latest({force:check});}catch(e){error='Не удалось проверить сборки движка: '+e.message;}
  if(pkg&&!pkg.unsupported&&best?.source==='download'&&best.commit!==pkg.commit)update={version:pkg.version,commit:pkg.commit,size:pkg.size};
 }
 const folder=store.folder(s);
 return {engine:best?{source:best.source,label:SOURCE[best.source],rtsmcp:best.rtsmcp,engine:best.engine,editor:best.editor||'',version:best.version||'',commit:best.commit||''}:null,
  settingsPath:s.settings.rtsLevelsEnginePath||'',settingsMissing:list.some(e=>e.source==='settings'&&e.missing),
  package:pkg&&!pkg.unsupported?{version:pkg.version,commit:pkg.commit,size:pkg.size}:null,unsupported:pkg?.unsupported||'',update,error,
  busy:!!state.download,folder,petyaProject:store.project(s).name};
}

// ---- setup -----------------------------------------------------------------------------------------------------
function setup(s){
 state.services=s;
 try{const u=deps.userData();if(u)engine.cleanup(u);}catch{/* best effort */}
 const mapCard=async(id,fn)=>{const draft=load(s,id);const c=await fn(draft);remember(s,c);return c;};
 const ipc={
  status:(options)=>status(s,{check:!!options?.check}),
  progress:()=>[...state.notices.values()],
  async setEnginePath(p){
   const value=String(p||'').trim();
   if(value&&!engine.fromPath(value,deps.platform()))throw Error('Здесь нет rtsmcp. Укажите папку движка (с bin/rtsmcp) или сам rtsmcp.');
   s.saveSettings({rtsLevelsEnginePath:value},true);state.session?.client.close();state.session=null;state.loaded='';
   return status(s);
  },
  download:()=>downloadEngine(s),
  update:()=>downloadEngine(s,{update:true}),
  cancelDownload(){state.download?.abort();return {stopped:!!state.download};},
  async chooseProject(){const dir=await deps.chooseFolder(s.win);if(dir)store.setFolder(s,dir);return status(s);},
  setProject(dir){store.setFolder(s,dir);return status(s);},
  variant:id=>mapCard(id,draft=>variant(s,draft)),
  async undo(id){const draft=load(s,id);const r=await undo(s,draft);if(r.error)throw Error(r.error);remember(s,r.card);return r.card;},
  refresh:id=>mapCard(id,draft=>render(s,draft)),
  // «Сохранить в проект»: the renderer has asked; an existing file needs `overwrite` from a second question.
  async save(id,options={}){
   const draft=load(s,id);
   const file=maps.checkFile(options.file||draft.file);
   const r=await withDraft(s,draft,mcp=>maps.save(mcp,draft,{file,overwrite:options.overwrite===true}));
   if(r.exists)return {exists:true,file:r.file};
   draft.saved={file:r.file,at:new Date().toISOString(),overwritten:!!r.overwritten};draft.file=r.file;
   state.loaded='';draft.rev++;
   const c=await render(s,draft);remember(s,c);
   return {saved:true,card:c};
  },
  // «Удалить черновик»: the draft goes; a map already saved to the project stays there.
  discard(id){
   const draft=store.getDraft(s,id);store.dropDraft(s,id);
   if(state.loaded.startsWith(id+':'))state.loaded='';
   for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.rtsLevels?.id===id)m.extensionData={...m.extensionData,rtsLevels:{...m.extensionData.rtsLevels,discarded:true}};
   try{s.dialogue?.persist?.();}catch{/* not saved */}
   return {discarded:true,saved:draft?.saved?.file||''};
  },
  async balance(id,options={}){
   const draft=load(s,id);
   if(state.balances.has(id))throw Error('Проверка баланса этой карты уже идёт.');
   const runs=Math.max(2,Math.min(8,Number(options.runs)||4));
   const controller=new AbortController();state.balances.set(id,controller);
   const notice='rts-levels-balance:'+id;
   publish(s,notice,{text:'Матчи ботов на «'+draft.title+'»: '+runs+' '+kit.plural(runs,['сид','сида','сидов'])+'…',busy:true,kind:'info',version:'run'});
   try{
    draft.balance=await withDraft(s,draft,mcp=>maps.balance(mcp,{runs,seconds:900},{signal:controller.signal,timeout:runs*240000}));
    store.putDraft(s,draft);
    const c=await render(s,draft);remember(s,c);
    publish(s,notice,{text:'Баланс «'+draft.title+'» готов: '+draft.balance.players.map(p=>p.name+' '+Math.round(p.winRate*100)+'%').join(', '),busy:false,kind:'success',version:'done'});
    return c;
   }catch(e){
    const cancelled=controller.signal.aborted;
    publish(s,notice,{text:cancelled?'Проверка баланса отменена.':'Проверка баланса не удалась: '+e.message,busy:false,kind:cancelled?'info':'error',version:'error'});
    if(cancelled){state.session?.client.close();state.session=null;state.loaded='';return {cancelled:true};}
    throw e;
   }finally{state.balances.delete(id);}
  },
  cancelBalance(id){const c=state.balances.get(String(id));c?.abort();return {stopped:!!c};},
  // «Открыть в редакторе»: the engine's own editor with the project (and the saved map).
  openEditor(id){
   const draft=load(s,id),e=current(s);
   if(!e?.editor)throw Error('Редактор движка не найден рядом с rtsmcp.');
   const args=['--project',draft.folder,...(e.engine?['--engine',e.engine]:[]),...(draft.saved?['--map',path.join(draft.folder,draft.saved.file)]:[])];
   if(e.editor.endsWith('.app'))deps.launch('/usr/bin/open',['-n',e.editor,'--args',...args]);
   else deps.launch(e.editor,args);
   return {opened:true};
  }
 };
 return {ipc};
}
function teardown(){
 state.session?.client.close();state.session=null;state.loaded='';
 state.download?.abort();for(const c of state.balances.values())c.abort();
}
function validate(next){
 const p=String(next.rtsLevelsEnginePath||'').trim();
 if(p&&p.length>1000)throw Error('Слишком длинный путь к движку.');
}
module.exports={name:NAME,defaults:{['extension_'+ID]:'false',rtsLevelsEnginePath:''},validate,setup,turn,teardown,state,deps,status,summary,titleOf,card};
