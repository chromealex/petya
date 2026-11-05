const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {Store}=require('./store.cjs');
const uuid=/^[a-f0-9-]{36}$/;
function createService({store,tenants,ready,run,now=Date.now,maxActive=1}){
 const jobs=new Map(store.ids().map(id=>[id,store.read(id)])),active=new Set();
 for(const job of jobs.values())if(['joining','waiting','recording'].includes(job.phase)){job.phase='error';job.message='Сервер записи перезапустился. Запись прервалась.';store.write(job.id,job);}
 const update=(job,patch)=>{Object.assign(job,patch);store.write(job.id,job);};
 const view=job=>({id:job.id,phase:job.phase,segments:job.segments||0,message:job.message||''});
 const server=http.createServer(async(req,res)=>{
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,200})$/)?.[1],tenant=token&&tenants[crypto.createHash('sha256').update(token).digest('hex')];
   if(!tenant||req.headers.origin)return send(403,{error:'Forbidden'});
   const u=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&u.pathname==='/health')return send(200,{ready:ready(),active:active.size});
   if(req.method==='POST'&&u.pathname==='/v1/bots'){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return send(413,{error:'Request too large'});}
    const data=JSON.parse(body),parsed=require('../../src/extensions/zoom-bot/meeting-link.cjs').parseJoinURL(data.url);
    if(!parsed||parsed.meetingId!==data.meetingId||!uuid.test(data.requestId)||!/^[-A-Za-z0-9_]{43}$/.test(data.oauthCredential)||typeof data.password!=='string'||data.password.length>100)return send(400,{error:'Invalid meeting'});
    const existing=[...jobs.values()].find(j=>j.tenant===tenant&&j.requestId===data.requestId);if(existing)return send(200,view(existing));
    if(!ready())return send(503,{error:'Zoom SDK is not configured'});
    if(active.size>=maxActive)return send(409,{error:'Recorder busy'});
    const job={id:crypto.randomUUID(),requestId:data.requestId,tenant,phase:'joining',at:now(),segments:0};jobs.set(job.id,job);update(job,{});active.add(job.id);
    Promise.resolve().then(()=>run(job,{...parsed,password:data.password||parsed.password,oauthCredential:data.oauthCredential},patch=>update(job,patch))).then(()=>{if(job.phase!=='recorded')update(job,{phase:'error',message:'Zoom завершился без подтверждения записи.'});},()=>update(job,{phase:'error',message:'Не удалось завершить запись Zoom. Проверьте разрешения и подключение приложения.'})).finally(()=>active.delete(job.id));
    return send(202,view(job));
   }
   const match=u.pathname.match(/^\/v1\/bots\/([a-f0-9-]{36})(?:\/(ack|audio\/(\d+)))?$/);const job=match&&jobs.get(match[1]);
   if(!job||job.tenant!==tenant)return send(404,{error:'Not found'});
   if(req.method==='GET'&&!match[2])return send(200,view(job));
   if(req.method==='GET'&&match[3]!==undefined){const i=Number(match[3]);if(job.phase!=='recorded'||i>=job.segments)return send(409,{error:'Recording is not ready'});return send(200,store.read(job.id+'-'+i));}
   if(req.method==='POST'&&match[2]==='ack'){
    if(!['recorded','done'].includes(job.phase))return send(409,{error:'Recording is not complete'});
    for(let i=0;i<job.segments;i++)store.remove(job.id+'-'+i);update(job,{phase:'done'});return send(200,view(job));
   }
   return send(405,{error:'Method not allowed'});
  }catch{send(400,{error:'Invalid request'});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 return {server,jobs,active};
}
if(require.main===module){
 const directory=process.env.ZOOM_DATA_DIR||'/var/lib/petya-zoom',store=new Store(directory,process.env.ZOOM_STORAGE_KEY||'');
 const ready=()=>!!(process.env.ZOOM_SDK_BINARY&&fs.existsSync(process.env.ZOOM_SDK_BINARY)&&process.env.ZOOM_CLIENT_ID&&process.env.ZOOM_CLIENT_SECRET);
 const run=(job,meeting,publish)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(__dirname,'worker.cjs')],{stdio:['pipe','pipe','ignore'],env:process.env});let pending='';
  child.stdin.end(JSON.stringify({id:job.id,meeting}));
  child.stdout.on('data',chunk=>{pending+=chunk;if(pending.length>65536){child.kill();return reject(Error('Worker output too large'));}let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{const data=JSON.parse(line);if(['joining','waiting','recording','recorded','error'].includes(data.phase))publish(data);}catch{}}});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Worker failed')));
 });
 const {server}=createService({store,tenants:JSON.parse(process.env.ZOOM_TENANTS||'{}'),ready,run});server.listen(Number(process.env.PORT||8790),'127.0.0.1');
}
module.exports={createService};
