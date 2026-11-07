const path=require('node:path');
const {RuntimeController}=require('../model-runtime/controller.cjs');
const {createInstallationResolver}=require('../model-runtime/installation.cjs');
const releases=require('../model-runtime/releases.json');
function create(s,{app,createController=options=>new RuntimeController(options),resolveInstallation,releaseAvailable}={}){
 const company=s.companyId;
 const available=releaseAvailable??releases.some(r=>r.model==='petya-v1'&&r.platform===process.platform&&r.arch===process.arch);
 const directory=path.join(app.getPath('userData'),'petya-models');
 const resolve=resolveInstallation||createInstallationResolver({installRoot:directory,runtimePython:path.join(app.getPath('userData'),'petya-runtime',process.platform==='win32'?'python.exe':'bin/python3'),releases});
 let closed=false;
 const check=()=>{if(closed||s.companyId!==company)throw Error('Компания закрыта. Повтори действие в текущей компании.');};
 const publicState=state=>({...state,releaseAvailable:available});
 const controller=createController({resolveInstallation:resolve,emit:state=>{
  if(!closed&&s.companyId===company&&s.win&&!s.win.isDestroyed()&&!s.win.webContents.isDestroyed())s.win.webContents.send('model-runtime-progress',publicState(state));
 }});
 const ipc={status:()=>{check();return publicState(controller.snapshot());},start:()=>{
  check();if(!available)throw Error('Проверенный выпуск petya-v1 для этой системы пока недоступен.');
  return publicState(controller.start());
 },stop:async()=>{check();return publicState(await controller.stop());}};
 const dispose=async()=>{closed=true;await controller.dispose();};
 app.once('before-quit',dispose);
 const chat=(body,options)=>{check();return controller.chat(body,options);};
 const routeRequest=require('../model-runtime/router.cjs').createRouter({getEndpoint:()=>s.settings.ollamaUrl,chat,check});
 return {ipc,modelRuntime:{routeRequest,invoke(method){if(!Object.hasOwn(ipc,method))throw Error('Неизвестная операция модели.');return ipc[method]();},chat,dispose}};
}
function register(server,z,ctx){
 for(const [name,method] of [['petya_model_status','status'],['start_petya_model','start'],['stop_petya_model','stop']])server.registerTool(name,{
  description:method==='status'?'Состояние собственного сервиса Пети и наличие допущенного релиза. Нужен доступ MCP ко всей компании.':method==='start'?'Запустить установленный и допущенный релиз petya-v1. Ничего не загружает и не меняет выбранную модель чата. Если petya-v1 уже выбрана, её запросы идут в этот сервис без отката в Ollama. Нужен доступ на редактирование всей компании.':'Остановить собственный сервис Пети и отменить его запросы. Нужен доступ на редактирование всей компании.',
  inputSchema:{},annotations:{readOnlyHint:method==='status',destructiveHint:false,openWorldHint:false}
 },async()=>{try{
  const check=()=>{ctx.check();if(ctx.access?.projectId||method!=='status'&&ctx.access?.mode!=='edit')throw Error('Нужен доступ ко всей компании с соответствующими правами.');};
  check();return await ctx.run(async()=>{check();const state=await ctx.modelRuntime(method);check();return {content:[{type:'text',text:JSON.stringify(state)}]};});
 }catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
}
module.exports={name:'modelRuntime',defaults:{},validate(){},create,setup:s=>create(s,{app:require('electron').app}),register};
