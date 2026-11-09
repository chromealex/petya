// A small Model Context Protocol client over stdio: JSON-RPC 2.0, one message per line (the transport rtsmcp and
// most local MCP servers speak). initialize → notifications/initialized → tools/list, tools/call; every request has
// a timeout; the child process dies with Petya (exit hooks) and with close().
const {spawn}=require('node:child_process');

const PROTOCOL='2025-06-18';
const MAX_LINE=64*1024*1024;
const live=new Set();
let hooked=false;
function hookExit(){
 if(hooked)return;hooked=true;
 const killAll=()=>{for(const child of live){try{child.kill();}catch{/* gone */}}live.clear();};
 process.once('exit',killAll);
 try{require('electron').app?.on?.('will-quit',killAll);}catch{/* outside Electron */}
}

class McpError extends Error{constructor(message,{code,tool}={}){super(message);this.name='McpError';this.code=code;this.tool=tool;}}

class McpClient{
 constructor({command,args=[],cwd,env,timeout=60000,spawnImpl=spawn,name='petya'}){
  this.command=command;this.args=args;this.cwd=cwd;this.env=env;this.timeout=timeout;this.spawnImpl=spawnImpl;this.name=name;
  this.child=null;this.pending=new Map();this.seq=0;this.buffer='';this.stderr='';this.ready=null;this.closed=false;this.info=null;this.tools=null;
 }
 get alive(){return !!this.child&&this.child.exitCode===null&&!this.closed;}
 start(){
  if(this.ready)return this.ready;
  hookExit();
  this.ready=(async()=>{
   const child=this.spawnImpl(this.command,this.args,{cwd:this.cwd,env:this.env||process.env,stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
   this.child=child;live.add(child);
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>this.onData(chunk));
   child.stderr?.on('data',chunk=>{this.stderr=(this.stderr+chunk).slice(-4000);});
   child.stdin.on('error',()=>{/* the exit handler reports */});
   const failed=new Promise((_,reject)=>{
    child.once('error',e=>{this.fail(new McpError('Не удалось запустить '+this.command+': '+e.message,{code:e.code}));reject(e);});
   });
   child.once('exit',(code,signal)=>{live.delete(child);this.fail(new McpError('MCP-сервер завершился'+(code!==null?' с кодом '+code:signal?' ('+signal+')':'')+(this.stderr.trim()?': '+this.stderr.trim().split('\n').pop():''),{code:'EXIT'}));});
   failed.catch(()=>{});
   this.info=await Promise.race([this.request('initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:this.name,version:'1'}}),failed]);
   this.notify('notifications/initialized',{});
   return this.info;
  })();
  this.ready.catch(()=>this.close());
  return this.ready;
 }
 onData(chunk){
  this.buffer+=chunk;
  if(this.buffer.length>MAX_LINE){this.fail(new McpError('Слишком длинный ответ MCP-сервера.'));this.close();return;}
  let i;
  while((i=this.buffer.indexOf('\n'))>=0){
   const line=this.buffer.slice(0,i).trim();this.buffer=this.buffer.slice(i+1);
   if(!line)continue;
   let msg;try{msg=JSON.parse(line);}catch{continue;}  // servers may log non-JSON lines to stdout
   if(msg&&msg.id!==undefined&&msg.id!==null&&this.pending.has(msg.id)&&(msg.result!==undefined||msg.error)){
    const p=this.pending.get(msg.id);this.pending.delete(msg.id);clearTimeout(p.timer);
    if(msg.error)p.reject(new McpError(String(msg.error.message||'Ошибка MCP'),{code:msg.error.code}));else p.resolve(msg.result);
   }
  }
 }
 fail(error){for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(error);this.pending.delete(id);}}
 write(msg){
  if(!this.child||this.closed)throw new McpError('MCP-сервер не запущен.');
  this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',...msg})+'\n');
 }
 notify(method,params){try{this.write({method,params});}catch{/* closed */}}
 request(method,params,{timeout=this.timeout,signal}={}){
  return new Promise((resolve,reject)=>{
   const id=++this.seq;
   const timer=setTimeout(()=>{this.pending.delete(id);this.notify('notifications/cancelled',{requestId:id,reason:'timeout'});reject(new McpError('MCP-сервер не ответил за '+Math.round(timeout/1000)+' с ('+method+').',{code:'TIMEOUT'}));},timeout);
   this.pending.set(id,{resolve,reject,timer});
   if(signal){const abort=()=>{if(!this.pending.has(id))return;clearTimeout(timer);this.pending.delete(id);this.notify('notifications/cancelled',{requestId:id,reason:'cancelled'});reject(Object.assign(new McpError('Отменено.',{code:'ABORT'}),{cancelled:true}));};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});}
   try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
  });
 }
 async listTools(){await this.start();const r=await this.request('tools/list',{});this.tools=Array.isArray(r?.tools)?r.tools:[];return this.tools;}
 // Calls a tool and returns its answer: the JSON object when the text content is JSON, else {text}. A tool error
 // (isError, or an {"error"} object) throws McpError with the server's message.
 async call(name,args={},options){
  await this.start();
  const r=await this.request('tools/call',{name,arguments:args},options);
  const parts=Array.isArray(r?.content)?r.content:[];
  const text=parts.filter(p=>p?.type==='text').map(p=>p.text).join('\n');
  let value;try{value=JSON.parse(text);}catch{value={text};}
  if(r?.isError||value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.error==='string'&&Object.keys(value).length<=2)throw new McpError(String(value?.error||text||'Ошибка инструмента '+name),{tool:name});
  return value;
 }
 close(){
  if(this.closed)return;this.closed=true;
  const child=this.child;
  this.fail(new McpError('MCP-сервер закрыт.',{code:'CLOSED'}));
  if(!child)return;
  try{child.stdin.end();}catch{/* gone */}
  const t=setTimeout(()=>{try{child.kill();}catch{/* gone */}},1500);t.unref?.();
  child.once('exit',()=>clearTimeout(t));
 }
}
module.exports={McpClient,McpError,PROTOCOL,live};
