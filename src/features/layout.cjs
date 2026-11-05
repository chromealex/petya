const {randomUUID}=require('node:crypto');
const source=require('../extensions/layout/source.cjs');
const markup=require('../extensions/layout/markup.cjs');
const assets=require('../extensions/layout/assets.cjs');
const importer=require('../extensions/layout/import.cjs');
const sessions=new WeakMap();
function setup(s,request=fetch,dependencies={}){
 const proposals=new Map();let operation=null;
 const active=()=>s.dialogue.active();
 const dialog=()=>dependencies.dialog||require('electron').dialog;
 function scope(){const t=active();return JSON.stringify([s.companyId,t?.id,t?.projectId,t?.versionIndex,s.settings.unityUrl,s.settings.unityToken,s.settings.layoutFigmaToken,s.settings.layoutZeplinToken]);}
 function available(provider){
  const t=active(),p=s.dialogue.state.projects.find(p=>p.id===t?.projectId);
  if(!t||t.archived||!p||p.archived)throw Error('Откройте чат в доступном проекте.');
  if(s.settings.module_unity!=='true'||p.disabledServices?.includes('unity'))throw Error('Для вёрстки включите Unity в каталоге и настройках проекта.');
  if(p.disabledServices?.includes(provider))throw Error('Сервис макетов выключен в этом проекте.');
  const token=s.settings[provider==='figma'?'layoutFigmaToken':'layoutZeplinToken'];
  if(!token)throw Error('Подключите '+(provider==='figma'?'Figma':'Zeplin')+' в разделе «Вёрстка Unity».');return token;
 }
 function publish(text,busy,kind='info'){operation={id:'layout',title:'Вёрстка Unity',text,busy,kind};if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',operation);}
 async function run(work){if(operation?.busy)throw Error('Дождитесь завершения вёрстки.');publish('Готовлю интерфейс…',true);try{const result=await work();publish(result.editors?'Выберите редактор Unity.':'Готово.',false,'success');return result;}catch(e){publish(e.message,false,'error');throw e;}}
 function view(entry){
  const result={id:entry.id,source:entry.ref.url,provider:entry.ref.provider,...markup.generate(entry.data,entry.ref.provider,{responsive:entry.responsive,images:entry.images,fonts:entry.fonts})};
  result.assets=entry.files.map(f=>({name:f.name,bytes:f.data.length}));result.bytes=result.assets.reduce((n,f)=>n+f.bytes,0);result.ready=result.fonts.every(f=>f.ready);
  return result;
 }
 function proposal(id,verify=()=>{}){
  verify();const entry=proposals.get(id);if(!entry||entry.owner!==scope())throw Error('Подготовьте макет заново в текущем чате.');available(entry.ref.provider);return entry;
 }
 async function prepare(input,verify=()=>{}){
  const parsed=source.schema.parse(input),ref=source.source(parsed),token=available(ref.provider),owner=scope();
  const check=()=>{verify();available(ref.provider);if(owner!==scope())throw Error('Чат или подключение изменились. Повторите запрос.');};check();
  return run(async()=>{
   publish('Читаю макет…',true);const data=await source.read(ref,token,request);check();
   const media=await assets.collect(data,ref,token,{request,check,report:text=>publish(text,true)});check();
   const entry={id:randomUUID(),owner,ref,data,fonts:{},files:media.files,images:media.images,responsive:parsed.responsive};
   const result=view(entry);if(proposals.size>=5)proposals.delete(proposals.keys().next().value);proposals.set(entry.id,entry);return result;
  });
 }
 function addFont(id,key,base64,verify=()=>{}){
  if(operation?.busy)throw Error('Дождитесь завершения вёрстки.');const entry=proposal(id,verify),required=view(entry).fonts.find(f=>f.key===key);
  if(!required)throw Error('В макете нет такого шрифта.');
  if(typeof base64!=='string'||base64.length>16*1024*1024||!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Некорректные данные шрифта.');
  const data=Buffer.from(base64,'base64'),ext=assets.fontType(data),name='fonts/font-'+key+'.'+ext;
  const files=entry.files.filter(f=>!f.name.startsWith('fonts/font-'+key+'.'));
  if(files.reduce((n,f)=>n+f.data.length,0)+data.length>assets.MAX_TOTAL)throw Error('Ресурсы превышают 48 МиБ.');
  entry.files=[...files,{name,data}];entry.fonts[key]=name;return view(entry);
 }
 async function pickFont(id,key,verify=()=>{}){
  proposal(id,verify);
  const selected=await dialog().showOpenDialog(s.win,{title:'Выберите файл нужного семейства и начертания',properties:['openFile'],filters:[{name:'Шрифт',extensions:['ttf','otf']}]});
  proposal(id,verify);if(selected.canceled)return view(proposal(id,verify));
  const fs=require('node:fs/promises'),file=await fs.open(selected.filePaths[0],'r');
  try{const stat=await file.stat();if(!stat.isFile()||stat.size>12*1024*1024)throw Error('Шрифт превышает 12 МиБ.');const data=await file.readFile();proposal(id,verify);return addFont(id,key,data.toString('base64'),verify);}finally{await file.close();}
 }
 async function apply(id,instance,verify=()=>{}){
  const entry=proposal(id,verify),design=view(entry);if(!design.ready)throw Error('Добавьте файлы всех шрифтов макета перед импортом.');
  const check=()=>{proposal(id,verify);};
  return run(async()=>{
   const result=await (dependencies.importer||importer.apply)(s.settings,design,entry.files,{instance,check,report:text=>publish(text,true),confirm:async (selected,scene)=>{
    publish('Ожидаю подтверждения размещения интерфейса…',true);
    const answer=await dialog().showMessageBox(s.win,{message:'Разместить интерфейс в активной сцене Unity?',detail:[design.name,selected||'Подключённый редактор',scene?.name||'Активная сцена',design.layers+' слоёв · '+design.assets.length+' ресурсов · '+(design.bytes/1048576).toFixed(1)+' МиБ',design.responsive?'Auto Layout и привязки из макета':'Фиксированная вёрстка','Будут созданы новые ресурсы и объект UIDocument. Сцена останется несохранённой; объект можно отменить через Undo.'].join('\n'),buttons:['Отмена','Импортировать и разместить'],defaultId:0,cancelId:0});check();return answer.response===1;
   }});check();if(!result.editors)proposals.delete(id);return result;
  });
 }
 async function turn(command,check=()=>{}){
  const url=command.match(/https:\/\/[^\s<>]+/u)?.[0];let text;
  if(!url)text='Пришлите ссылку на фрейм Figma с node-id или экран Zeplin. Требуются Unity и токен сервиса в разделе «Вёрстка Unity».';
  else{const result=await prepare({url},check);text='Подготовлен интерфейс «'+result.name+'»: '+result.layers+' слоёв, '+result.assets.length+' ресурсов.'+(result.ready?' Можно разместить в сцене.':' Выберите файлы шрифтов перед импортом.')+' '+result.warnings.join(' ');s.dialogue.rememberAction(command,text);const t=active();t.messages.at(-1).layoutProposal=result;s.dialogue.persist();return {handled:true,text,by:'Вёрстка Unity',topicId:t.id,messages:t.messages};}
  s.dialogue.rememberAction(command,text);return {handled:true,text,topicId:active().id,messages:active().messages};
 }
 const ipc={prepare,apply,addFont,pickFont,proposal:(id,check)=>view(proposal(id,check)),status:()=>operation};sessions.set(s.dialogue,ipc);return {layout:{prepare,apply,turn},ipc};
}
function register(server,z,ctx){
 const session=sessions.get(ctx.dialogue);if(!session||ctx.access?.mode!=='edit')return;
 for(const [name,description,schema,invoke] of [
  ['get_unity_layout_proposal','Просмотреть подготовленный интерфейс, ресурсы и недостающие шрифты.',{proposalId:z.string().uuid()},(a,c)=>session.proposal(a.proposalId,c)],
  ['prepare_unity_layout','Прочитать макет Figma/Zeplin, загрузить изображения и подготовить адаптивный интерфейс. Возвращает необходимые шрифты.',source.schema.shape,(a,c)=>session.prepare({url:a.url,responsive:a.responsive},c)],
  ['set_unity_layout_font','Добавить файл TTF/OTF нужного семейства и начертания в подготовленный макет. Данные base64; файл должен быть разрешён для использования в проекте.',{proposalId:z.string().uuid(),fontKey:z.string().regex(/^[a-f0-9]{16}$/),base64:z.string().min(1).max(16*1024*1024)},(a,c)=>session.addFont(a.proposalId,a.fontKey,a.base64,c)],
  ['pick_unity_layout_font','Открыть в Пете выбор TTF/OTF для шрифта макета.',{proposalId:z.string().uuid(),fontKey:z.string().regex(/^[a-f0-9]{16}$/)},(a,c)=>session.pickFont(a.proposalId,a.fontKey,c)],
  ['apply_unity_layout','Импортировать изображения, шрифты, UXML и PanelSettings; разместить UIDocument в активной сцене после подтверждения в Пете. Сцену пользователь сохраняет сам; Undo отменяет создание объекта.',{proposalId:z.string().uuid(),instance:z.string().max(256).optional()},(a,c)=>session.apply(a.proposalId,a.instance,c)]
 ])server.registerTool(name,{description,inputSchema:{chatId:z.string().min(1),...schema}},async a=>{
  const check=()=>{ctx.check();const t=ctx.dialogue.active();if(!t||t.id!==a.chatId||t.archived||ctx.access.projectId&&ctx.access.projectId!==t.projectId)throw Error('Откройте разрешённый чат.');if(ctx.chatJobs?.busy(t.id))throw Error('Дождитесь завершения запроса в чате.');};
  try{check();const data=await ctx.run(()=>invoke(a,check));check();return {content:[{type:'text',text:JSON.stringify(data)}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
 });
}
module.exports={name:'layout',defaults:{layoutFigmaToken:'',layoutZeplinToken:''},secrets:['layoutFigmaToken','layoutZeplinToken'],validate(){},setup,register};
