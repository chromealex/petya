const {randomUUID}=require('node:crypto');
const source=require('../extensions/layout/source.cjs');
const markup=require('../extensions/layout/markup.cjs');
const sessions=new WeakMap();
function setup(s,request=fetch){
 const proposals=new Map();let operation=null;
 const active=()=>s.dialogue.active();
 function scope(){const t=active();return JSON.stringify([s.companyId,t?.id,t?.projectId,t?.versionIndex,s.settings.unityUrl,s.settings.unityToken,s.settings.layoutFigmaToken,s.settings.layoutZeplinToken]);}
 function available(provider){
  const t=active(),p=s.dialogue.state.projects.find(p=>p.id===t?.projectId);
  if(!t||t.archived||!p||p.archived)throw Error('Откройте чат в доступном проекте.');
  if(s.settings.module_unity!=='true'||p.disabledServices?.includes('unity'))throw Error('Для вёрстки включите Unity в каталоге и настройках проекта.');
  if(p.disabledServices?.includes(provider))throw Error('Сервис макетов выключен в этом проекте.');
  const token=s.settings[provider==='figma'?'layoutFigmaToken':'layoutZeplinToken'];
  if(!token)throw Error('Подключите '+(provider==='figma'?'Figma':'Zeplin')+' в разделе «Вёрстка Unity».');
  return token;
 }
 function publish(text,busy,kind='info'){
  operation={id:'layout',title:'Вёрстка Unity',text,busy,kind};
  if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',operation);
 }
 async function run(work){
  if(operation?.busy)throw Error('Дождитесь завершения вёрстки.');
  publish('Читаю макет…',true);
  try{const result=await work();publish('Готово.',false,'success');return result;}
  catch(e){publish(e.message,false,'error');throw e;}
 }
 async function prepare(input,verify=()=>{}){
  const ref=source.source(input),token=available(ref.provider),owner=scope();
  const check=()=>{verify();available(ref.provider);if(owner!==scope())throw Error('Чат или подключение изменились. Повторите запрос.');};
  check();
  return run(async()=>{
   const data=await source.read(ref,token,request);check();
   const result={id:randomUUID(),source:ref.url,provider:ref.provider,...markup.generate(data,ref.provider)};
   if(proposals.size>=20)proposals.delete(proposals.keys().next().value);
   proposals.set(result.id,{owner,result});return result;
  });
 }
 async function apply(id,instance,verify=()=>{}){
  const entry=proposals.get(id);
  if(!entry||entry.owner!==scope())throw Error('Подготовьте макет заново в текущем чате.');
  const check=()=>{verify();available(entry.result.provider);if(entry.owner!==scope())throw Error('Чат или подключение изменились.');};
  check();
  return run(async()=>{
   publish('Ожидаю подтверждения импорта в Unity…',true);
   const result=await s.unity.invoke(active().id,'call_tool',{name:'execute_code',arguments:{action:'execute',code:markup.code(entry.result.uxml),safety_checks:true}},check,instance);
   check();if(result.isError)throw Error(result.content?.find(c=>c.type==='text')?.text||'Ошибка Unity.');
   let payload=result.structuredContent;
   if(!payload){try{payload=JSON.parse(result.content?.find(c=>c.type==='text')?.text);}catch{}}
   if(payload?.success===false)throw Error(payload.message||'Unity не выполнила импорт.');
   if(!result.editors)proposals.delete(id);
   return result;
  });
 }
 async function turn(command,check=()=>{}){
  const url=command.match(/https:\/\/[^\s<>]+/u)?.[0];
  let text;
  if(!url)text='Пришлите ссылку на фрейм Figma с node-id или экран Zeplin. Требуются Unity и токен выбранного сервиса в разделе «Вёрстка Unity».';
  else {const result=await prepare({url},check);text='Подготовлена базовая вёрстка «'+result.name+'»: '+result.layers+' слоёв. '+result.warnings.join(' ');s.dialogue.rememberAction(command,text);const t=active();t.messages.at(-1).layoutProposal=result; s.dialogue.persist();return {handled:true,text,by:'Вёрстка Unity',topicId:t.id,messages:t.messages};}
  s.dialogue.rememberAction(command,text);return {handled:true,text,topicId:active().id,messages:active().messages};
 }
 const ipc={prepare,apply,status:()=>operation};sessions.set(s.dialogue,ipc);
 return {layout:{prepare,apply,turn},ipc};
}
function register(server,z,ctx){
 const session=sessions.get(ctx.dialogue);if(!session||ctx.access?.mode!=='edit')return;
 for(const [name,description,schema,invoke] of [
  ['prepare_unity_layout','Прочитать фрейм Figma или экран Zeplin и подготовить базовый UXML. Требуются Unity и токен сервиса.',source.schema.shape,(a,check)=>session.prepare({url:a.url},check)],
  ['apply_unity_layout','Импортировать подготовленный UXML в Assets/PetyaLayouts после подтверждения в приложении. Требуется execute_code в Unity.',{proposalId:z.string().uuid(),instance:z.string().max(256).optional()},(a,check)=>session.apply(a.proposalId,a.instance,check)]
 ])server.registerTool(name,{description,inputSchema:{chatId:z.string().min(1),...schema}},async a=>{
  const check=()=>{ctx.check();const t=ctx.dialogue.active();if(!t||t.id!==a.chatId||t.archived||ctx.access.projectId&&ctx.access.projectId!==t.projectId)throw Error('Откройте разрешённый чат.');if(ctx.chatJobs?.busy(t.id))throw Error('Дождитесь завершения запроса в чате.');};
  try{check();const data=await ctx.run(()=>invoke(a,check));check();return {content:[{type:'text',text:JSON.stringify(data)}]};}
  catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
 });
}
module.exports={name:'layout',defaults:{layoutFigmaToken:'',layoutZeplinToken:''},secrets:['layoutFigmaToken','layoutZeplinToken'],validate(){},setup,register};
