const {PythonRuntime,validate}=require('./runtime.cjs');
const {randomUUID}=require('node:crypto');
const cancel=require('../../answer-cancel.cjs');
const sessions=new WeakMap();
function setup(s){
 const runtime=s.pythonRuntime||new PythonRuntime();let operation=null,controller=null,runningCheck=null;
 function scoped(authorize=()=>{}){
  const dialogue=s.dialogue,topic=dialogue.active(),company=s.companyId,project=topic?.projectId||'general',version=topic?.versionIndex||0;
  return ()=>{cancel.check();authorize();if(!topic||s.dialogue!==dialogue||s.companyId!==company||dialogue.active()!==topic||topic.archived||(topic.versionIndex||0)!==version||(topic.projectId||'general')!==project||!dialogue.state.projects.some(p=>p.id===project&&!p.archived))throw Error('Чат, компания или проект изменились.');if(s.settings.extension_python!=='true')throw Error('Включите Python в каталоге расширений Пети.');};
 }
 function publish(id,text,busy,kind='info'){operation={id,title:'Python',text,busy,kind,version:busy?'running':kind};if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('python-progress',operation);}
 async function run(args,authorize=()=>{}){
  validate(args);const check=scoped(authorize);check();
  if(controller)throw Error('Python уже выполняет задачу.');
  runningCheck=check;controller=new AbortController();const own=controller,signal=cancel.signal(),abort=()=>own.abort();signal?.addEventListener('abort',abort,{once:true});
  const id='python:'+randomUUID();publish(id,'Выполняю Python в изолированном контейнере…',true);
  try{const result=await runtime.run(args,{signal:own.signal,check});check();publish(id,result.ok?'Расчёт завершён.':'В скрипте Python ошибка. Подробности в чате.',false,result.ok?'success':'error');return result;}
  catch(e){publish(id,e.message,false,'error');throw e;}
  finally{signal?.removeEventListener('abort',abort);controller=null;runningCheck=null;}
 }
 const api={run,status:()=>runtime.status(),progress:()=>operation,stop(){if(controller)runningCheck();controller?.abort();return {stopped:!!controller};}};
 sessions.set(s.dialogue,api);
 return {python:api,ipc:{status:api.status,progress:api.progress,stop:api.stop}};
}
function register(server,z,ctx){
 const api=sessions.get(ctx.dialogue);if(!api)return;
 const schema={chatId:z.string().min(1),version:z.number().int().nonnegative()};
 const check=args=>{ctx.check();const t=ctx.dialogue.active();if(!t||t.id!==args.chatId||t.archived||(t.versionIndex||0)!==args.version||!ctx.dialogue.state.projects.some(p=>p.id===(t.projectId||'general')&&!p.archived)||ctx.access?.projectId&&ctx.access.projectId!==(t.projectId||'general'))throw Error('Откройте разрешённый чат с указанной версией.');return t;};
 function tool(name,description,inputSchema,fn,edit=false){server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!edit,destructiveHint:false,openWorldHint:false}},async args=>{try{check(args);if(edit&&ctx.access?.mode!=='edit')throw Error('Нужен доступ edit.');const result=await fn(args);check(args);return {content:[{type:'text',text:JSON.stringify(result)}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});}
 tool('python_status','Готовность локального изолированного Python и лимиты прототипа.',schema,()=>api.status());
 if(ctx.access?.mode!=='edit')return;
 tool('run_python','Выполнить Python в локальном Linux-контейнере без сети и файлов компьютера. Нужны включённое расширение Python и edit. files — словарь текстов, доступный скрипту; результат stdout/stderr. Максимум 15 секунд и 256 МиБ. Записывает код и результат в текущий чат.',{...schema,code:z.string().min(1).max(24000),files:z.record(z.string(),z.string()).default({})},async args=>{
  const topic=check(args),authorize=()=>{check(args);if(ctx.access?.mode!=='edit')throw Error('Доступ edit отозван.');if(ctx.chatJobs?.busy(args.chatId))throw Error('Дождитесь завершения запроса в чате.');};
  authorize();const result=await ctx.run(()=>api.run(args,authorize));authorize();
  topic.messages.push({role:'assistant',at:Date.now(),by:'Python · MCP',text:format(result),pythonExecution:{code:args.code,...result}});ctx.dialogue.persist();ctx.changed?.({owner:topic.id,name:'run_python'});return result;
 },true);
 tool('stop_python','Остановить текущий запуск Python в указанном чате.',schema,()=>api.stop(),true);
}
function format(r){return (r.ok?'Python выполнен.':'Python завершился с ошибкой (код '+r.exitCode+').')+'\n\n'+(r.stdout||'(Нет вывода)')+(r.stderr?'\n\n'+r.stderr:'');}
module.exports={name:'python',defaults:{},setup,register,format};
