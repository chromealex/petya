// «Kubernetes», the command line layer: finds `kubectl` and runs it without a shell, with a timeout, a capped
// output and an explicit context and namespace. Only read verbs pass `read` (get, describe, logs, top, rollout
// status/history, config views, version); the two writes — `rollout restart` and `scale` of a deployment — are
// built here from a checked action by `write`, which the extension calls only from the card's confirming button.
// exec, attach, port-forward, cp, delete, apply, edit, patch and the like never run; nor do flags that would
// change who kubectl acts as or where it connects (--as, --token, --server, --kubeconfig).
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');

function binary({platform=process.platform,env=process.env,exists=fs.existsSync,custom=''}={}){
 if(custom){try{return exists(custom)&&!fs.statSync(custom).isDirectory()?custom:null;}catch{return null;}}
 const exe=platform==='win32'?'kubectl.exe':'kubectl';
 const dirs=[...String(env.PATH||env.Path||'').split(path.delimiter).filter(Boolean),
  ...(platform==='darwin'?['/usr/local/bin','/opt/homebrew/bin','/Applications/Docker.app/Contents/Resources/bin',path.join(env.HOME||'','.rd','bin')]:[]),
  ...(platform==='win32'?[path.join(env.ProgramFiles||'C:\\Program Files','Docker','Docker','resources','bin'),path.join(env.USERPROFILE||'','.kube','bin')]:[]),
  ...(platform==='linux'?['/usr/bin','/usr/local/bin','/snap/bin']:[])];
 for(const dir of dirs){const file=path.join(dir,exe);try{if(exists(file)&&!fs.statSync(file).isDirectory())return file;}catch{/* unreadable dir */}}
 return null;
}

class KubectlError extends Error{
 constructor(kind,message,detail=''){super(message);this.name='KubectlError';this.kind=kind;this.detail=String(detail).slice(0,2000);}
}
function classify(error,stderr=''){
 const t=String(stderr||'')+'\n'+String(error?.message||'');
 if(error?.code==='ENOENT')return new KubectlError('missing','Команда kubectl не найдена.',t);
 if(error?.killed||error?.code==='ETIMEDOUT'||/timed out|i\/o timeout|context deadline exceeded|Client\.Timeout/i.test(String(stderr||''))&&!/Forbidden/.test(t))return new KubectlError('timeout','Кластер не ответил вовремя.',t);
 if(/current-context is not set|no configuration has been provided|context ".*" does not exist|no context exists/i.test(t))return new KubectlError('config','В kubeconfig нет выбранного контекста кластера.',t);
 if(/Unable to connect to the server|connection refused|no such host|dial tcp|EOF$/im.test(t))return new KubectlError('unreachable','Кластер недоступен: проверьте сеть, VPN и контекст.',t);
 if(/Unauthorized|You must be logged in|token has expired|credentials/i.test(t))return new KubectlError('auth','Кластер не принял учётные данные: войдите заново (например, обновите токен облака).',t);
 if(/Forbidden|forbidden/.test(t))return new KubectlError('forbidden','Нет прав: '+(/User "[^"]*" cannot [^\n]*/.exec(t)?.[0]||'кластер запретил это действие').slice(0,300),t);
 if(/NotFound|not found/i.test(t))return new KubectlError('notfound',(/Error from server \(NotFound\):\s*([^\n]*)/.exec(t)?.[1]||'Объект не найден.').slice(0,300),t);
 const line=String(stderr||error?.message||'').trim().split('\n').filter(Boolean).at(-1)||'ошибка kubectl';
 return new KubectlError('failed',line.replace(/^error:\s*/i,'').slice(0,400),t);
}

function exec(file,args,{timeout=20000,maxBuffer=16*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  execFile(file,args,{timeout,maxBuffer,windowsHide:true,shell:false,env:{...process.env,KUBECTL_INTERACTIVE_DELETE:'false'}},(error,stdout,stderr)=>{
   if(error){error.stderr=String(stderr||'');if(error.killed)error.message+=' (timed out)';reject(error);}
   else resolve({stdout:String(stdout||''),stderr:String(stderr||'')});
  });
 });
}

const NAME=/^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const CONTEXT=/^[A-Za-z0-9][A-Za-z0-9_.:@/+-]{0,250}$/;
const FORBIDDEN_FLAGS=/^(?:--as(?:-group|-uid)?|--token|--server|-s|--kubeconfig|--username|--password|--client-key|--client-certificate|--certificate-authority|--insecure-skip-tls-verify|--raw|-f|--filename|--overrides|-it?|--stdin|--tty|-k|--kustomize)(?:=|$)/;
// The read verbs and their allowed second word.
const READ={get:null,describe:null,logs:null,top:['pod','pods','node','nodes'],version:null,
 rollout:['status','history'],config:['current-context','get-contexts','view']};
function checkRead(args){
 if(!Array.isArray(args)||!args.length||args.some(a=>typeof a!=='string'||/[\r\n\0]/.test(a)||a.length>400))throw new KubectlError('refused','Недопустимые аргументы kubectl.');
 const [verb,second]=args;
 if(!Object.hasOwn(READ,verb))throw new KubectlError('refused','Петя не выполняет kubectl '+verb.slice(0,40)+': только чтение.');
 if(READ[verb]&&!READ[verb].includes(second))throw new KubectlError('refused','Петя не выполняет kubectl '+verb+' '+String(second||'').slice(0,40)+'.');
 for(const a of args)if(FORBIDDEN_FLAGS.test(a))throw new KubectlError('refused','Флаг '+a.split('=')[0]+' не используется.');
}
// A write from the card: restart or scale one deployment, in an explicit context and namespace.
function writeArgs(action){
 const {verb,name,namespace,context}=action||{};
 if(!NAME.test(String(name||''))||!NAME.test(String(namespace||''))||context&&!CONTEXT.test(String(context)))throw new KubectlError('refused','Недопустимое имя объекта.');
 const scope=['--namespace='+namespace,...(context?['--context='+context]:[])];
 if(verb==='restart')return ['rollout','restart','deployment/'+name,...scope];
 if(verb==='scale'){
  const n=Number(action.replicas);
  if(!Number.isInteger(n)||n<0||n>100)throw new KubectlError('refused','Число реплик — от 0 до 100.');
  return ['scale','deployment/'+name,'--replicas='+n,...scope];
 }
 throw new KubectlError('refused','Петя умеет только перезапускать и масштабировать деплойменты.');
}
// The exact command line the card shows before the user confirms.
const quoteArg=a=>/^[\w@%+=:,./-]+$/.test(a)?a:"'"+a.replace(/'/g,"'\\''")+"'";
const command=action=>['kubectl',...writeArgs(action)].map(quoteArg).join(' ');

function create({find=binary,runner=exec,custom=()=>''}={}){
 const file=()=>find({custom:custom()});
 async function run(args,{timeout=20000}={}){
  const f=file();
  if(!f)throw new KubectlError('missing','Команда kubectl не найдена.');
  try{return await runner(f,args,{timeout});}
  catch(e){throw classify(e,e.stderr);}
 }
 // Reads: the scope flags are added here so a request can never drop them.
 async function read(args,{context,namespace,timeout=20000,scoped=true}={}){
  checkRead(args);
  if(context&&!CONTEXT.test(context))throw new KubectlError('refused','Недопустимое имя контекста.');
  if(namespace&&!NAME.test(namespace))throw new KubectlError('refused','Недопустимое имя пространства имён.');
  const scope=scoped?[...(namespace?['--namespace='+namespace]:[]),...(context?['--context='+context]:[]),'--request-timeout='+Math.max(5,Math.round(timeout/1000)-2)+'s']:(context?['--context='+context]:[]);
  return run([...args,...scope],{timeout});
 }
 async function json(args,opts){
  const {stdout}=await read([...args,'-o','json'],opts);
  try{return JSON.parse(stdout);}catch{throw new KubectlError('failed','kubectl вернул некорректный JSON.');}
 }
 async function write(action,{timeout=30000}={}){return run([...writeArgs(action),'--request-timeout=20s'],{timeout});}
 return {read,json,write,binary:file};
}
module.exports={binary,create,classify,exec,checkRead,writeArgs,command,KubectlError,NAME,CONTEXT};
