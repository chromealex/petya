// «Kubernetes», what the cluster says, parsed: the context and namespace (from the settings or the kubeconfig),
// pods with their problems (CrashLoopBackOff, OOMKilled, restarts, image pulls), deployments with the rollout state
// computed the way `kubectl rollout status` does, warning events, one pod in detail, pod logs by a deployment's
// selector. Everything here only reads through kubectl.cjs `read`/`json`.
const K=require('./kubectl.cjs');

const BAD=new Set(['CrashLoopBackOff','ImagePullBackOff','ErrImagePull','CreateContainerConfigError','CreateContainerError','InvalidImageName','OOMKilled','Error','RunContainerError','ContainerCannotRun','DeadlineExceeded','Evicted']);
const age=iso=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toISOString():null;};

function container(st,spec={}){
 const state=st?.state||{},last=st?.lastState||{};
 const kind=Object.keys(state)[0]||'unknown';
 return {name:String(st?.name||spec.name||''),image:String(st?.image||spec.image||''),ready:!!st?.ready,restarts:Number(st?.restartCount)||0,
  state:kind,reason:String(state[kind]?.reason||''),message:String(state[kind]?.message||'').slice(0,400),exitCode:state.terminated?.exitCode??null,
  lastReason:String(last.terminated?.reason||''),lastExit:last.terminated?.exitCode??null,lastFinished:age(last.terminated?.finishedAt),
  limits:{memory:String(spec.resources?.limits?.memory||''),cpu:String(spec.resources?.limits?.cpu||'')}};
}
// The workload a pod belongs to: a ReplicaSet's name minus its template hash is the deployment.
function owner(p){
 const ref=(p.metadata?.ownerReferences||[])[0];
 if(!ref)return {kind:'',name:''};
 const hash=p.metadata?.labels?.['pod-template-hash'];
 if(ref.kind==='ReplicaSet'&&hash&&ref.name.endsWith('-'+hash))return {kind:'Deployment',name:ref.name.slice(0,-hash.length-1)};
 return {kind:String(ref.kind),name:String(ref.name)};
}
function pod(p){
 const specs=new Map((p.spec?.containers||[]).map(c=>[c.name,c]));
 const containers=(p.status?.containerStatuses||[]).map(st=>container(st,specs.get(st.name)));
 const inits=(p.status?.initContainerStatuses||[]).map(st=>container(st,{}));
 const all=[...inits,...containers];
 const waiting=all.find(c=>c.reason&&BAD.has(c.reason))||all.find(c=>c.state==='waiting'&&c.reason);
 const oom=all.find(c=>c.lastReason==='OOMKilled'||c.reason==='OOMKilled');
 const phase=String(p.status?.phase||'Unknown');
 const evicted=p.status?.reason==='Evicted';
 const reason=evicted?'Evicted':waiting?.reason||(p.metadata?.deletionTimestamp?'Terminating':phase);
 const restarts=containers.reduce((a,c)=>a+c.restarts,0);
 const readyCount=containers.filter(c=>c.ready).length;
 const o=owner(p);
 const labels=p.metadata?.labels||{};
 const problem=BAD.has(reason)||phase==='Failed'||phase==='Unknown'?'bad':(phase==='Pending'||readyCount<containers.length&&phase!=='Succeeded'||restarts>0||oom)?'warn':'ok';
 return {name:String(p.metadata?.name||''),namespace:String(p.metadata?.namespace||''),phase,reason,ready:readyCount+'/'+containers.length,readyCount,total:containers.length,restarts,
  oomKilled:!!oom,lastReason:oom?'OOMKilled':(containers.find(c=>c.lastReason)?.lastReason||''),node:String(p.spec?.nodeName||''),
  owner:o,app:String(labels['app.kubernetes.io/name']||labels.app||(o.kind==='Deployment'?o.name:'')||''),started:age(p.status?.startTime),problem,containers,
  message:String(p.status?.message||waiting?.message||'').slice(0,400)};
}
// The rollout state as `kubectl rollout status` decides it.
function deployment(d){
 const spec=d.spec||{},st=d.status||{};
 const want=spec.replicas??1,updated=st.updatedReplicas||0,ready=st.readyReplicas||0,available=st.availableReplicas||0,current=st.replicas||0;
 const progressing=(st.conditions||[]).find(c=>c.type==='Progressing');
 let status='complete',note='';
 if((st.observedGeneration||0)<(d.metadata?.generation||0)){status='progressing';note='ждёт применения новой спецификации';}
 else if(progressing?.reason==='ProgressDeadlineExceeded'){status='failed';note='выкатка не уложилась в срок (ProgressDeadlineExceeded)';}
 else if(updated<want){status='progressing';note='обновлено '+updated+' из '+want;}
 else if(current>updated){status='progressing';note='старых реплик ещё '+(current-updated);}
 else if(available<updated){status='progressing';note='доступно '+available+' из '+updated;}
 if(status==='complete'&&want===0)status='scaled-down';
 return {name:String(d.metadata?.name||''),namespace:String(d.metadata?.namespace||''),replicas:want,ready,updated,available,status,note,
  message:String(progressing?.message||'').slice(0,300),revision:String(d.metadata?.annotations?.['deployment.kubernetes.io/revision']||''),
  images:(spec.template?.spec?.containers||[]).map(c=>String(c.image||'')).slice(0,4),selector:spec.selector?.matchLabels||{},updatedAt:age(progressing?.lastUpdateTime)};
}
function event(e){
 const last=age(e.lastTimestamp||e.eventTime||e.series?.lastObservedTime||e.metadata?.creationTimestamp);
 return {type:String(e.type||'Normal'),reason:String(e.reason||''),object:String((e.involvedObject?.kind||'')+'/'+(e.involvedObject?.name||'')),kind:String(e.involvedObject?.kind||''),name:String(e.involvedObject?.name||''),
  message:String(e.message||'').replace(/\s+/g,' ').slice(0,400),count:Number(e.count||e.series?.count)||1,last};
}
// `[pod/api-7c9/api] 2026-11-09T10:00:00.123Z message` (kubectl logs --prefix --timestamps).
function logLine(line){
 const m=/^\[pod\/([^/\]]+)\/([^\]]+)\]\s+(\S+)\s?(.*)$/.exec(line)||/^()()(\d{4}-\d{2}-\d{2}T\S+)\s?(.*)$/.exec(line);
 if(!m||!Number.isFinite(Date.parse(m[3])))return null;
 return {pod:m[1],container:m[2],ts:m[3],message:m[4]};
}
const selector=labels=>Object.entries(labels||{}).filter(([k,v])=>/^[A-Za-z0-9._/-]{1,253}$/.test(k)&&/^[A-Za-z0-9._-]{0,63}$/.test(String(v))).map(([k,v])=>k+'='+v).join(',');

function create(kubectl=K.create(),{settings=()=>({})}={}){
 // The context and namespace: the extension's settings, else the kubeconfig's current context and its namespace.
 async function target(){
  const st=settings();
  let context=String(st.kubernetesContext||'').trim(),namespace=String(st.kubernetesNamespace||'').trim();
  if(!context||!namespace){
   const cfg=await kubectl.json(['config','view','--minify'],{scoped:false,context:context||undefined});
   const ctx=(cfg.contexts||[])[0];
   context=context||String(cfg['current-context']||ctx?.name||'');
   namespace=namespace||String(ctx?.context?.namespace||'default');
  }
  if(!context)throw new K.KubectlError('config','В kubeconfig нет выбранного контекста кластера.');
  return {context,namespace};
 }
 async function contexts(){
  const {stdout}=await kubectl.read(['config','get-contexts','-o','name'],{scoped:false});
  return stdout.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,50);
 }
 const scope=t=>({context:t.context,namespace:t.namespace});
 async function pods(t){return ((await kubectl.json(['get','pods'],scope(t))).items||[]).map(pod);}
 async function deployments(t){return ((await kubectl.json(['get','deployments'],scope(t))).items||[]).map(deployment);}
 async function events(t,{name,kind}={}){
  const args=['get','events'];
  if(name&&K.NAME.test(name))args.push('--field-selector=involvedObject.name='+name+(kind?',involvedObject.kind='+kind:''));
  return ((await kubectl.json(args,scope(t))).items||[]).map(event).sort((a,b)=>String(b.last).localeCompare(String(a.last)));
 }
 async function overview(){
  const t=await target();
  const [p,d,e]=await Promise.all([pods(t),deployments(t),events(t)]);
  return {...t,pods:p,deployments:d,events:e.filter(x=>x.type!=='Normal').slice(0,30),normalEvents:e.filter(x=>x.type==='Normal').length};
 }
 async function podDetail(name){
  if(!K.NAME.test(name))throw new K.KubectlError('refused','Недопустимое имя пода.');
  const t=await target();
  const p=pod(await kubectl.json(['get','pod',name],scope(t)));
  const ev=await events(t,{name,kind:'Pod'}).catch(()=>[]);
  let describe='';try{describe=(await kubectl.read(['describe','pod',name],scope(t))).stdout.slice(-6000);}catch{/* optional */}
  let lines=[];
  const crashed=p.containers.find(c=>c.restarts>0)||p.containers[0];
  if(crashed){
   const args=['logs',name,'--container='+crashed.name,'--tail=60','--timestamps'];
   try{lines=(await kubectl.read(p.restarts?[...args,'--previous']:args,scope(t))).stdout.split('\n').filter(Boolean);}
   catch{try{lines=(await kubectl.read(args,scope(t))).stdout.split('\n').filter(Boolean);}catch{lines=[];}}
  }
  return {...t,pod:p,events:ev.slice(0,20),describe,logs:lines.slice(-60).map(l=>{const x=logLine(l);return x?{ts:x.ts,text:x.message}:{ts:null,text:l.slice(0,1000)};}),previous:!!p.restarts};
 }
 async function rollout(name){
  if(!K.NAME.test(name))throw new K.KubectlError('refused','Недопустимое имя деплоймента.');
  const t=await target();
  const d=deployment(await kubectl.json(['get','deployment',name],scope(t)));
  let text='';try{text=(await kubectl.read(['rollout','status','deployment/'+name,'--watch=false'],scope(t))).stdout.trim().slice(0,600);}catch(e){text=e.message;}
  const sel=selector(d.selector);
  const p=sel?((await kubectl.json(['get','pods','--selector='+sel],scope(t))).items||[]).map(pod):[];
  const ev=await events(t,{name,kind:'Deployment'}).catch(()=>[]);
  return {...t,deployment:d,statusText:text,pods:p,events:ev.slice(0,10)};
 }
 // Pod logs of one workload: by the deployment's selector, or `app=<name>` when there is no such deployment.
 async function logs(service,{from,tail=500}){
  if(!K.NAME.test(service))throw new K.KubectlError('refused','Недопустимое имя сервиса.');
  const t=await target();
  let sel='';
  try{sel=selector(deployment(await kubectl.json(['get','deployment',service],scope(t))).selector);}catch(e){if(e.kind!=='notfound')throw e;}
  sel=sel||'app='+service;
  const {stdout}=await kubectl.read(['logs','--selector='+sel,'--all-containers=true','--prefix=true','--timestamps=true','--since-time='+from,'--tail='+Math.max(1,Math.min(5000,tail)),'--max-log-requests=10','--ignore-errors=true'],{...scope(t),timeout:40000});
  return {...t,selector:sel,lines:stdout.split('\n').map(logLine).filter(Boolean)};
 }
 return {target,contexts,pods,deployments,events,overview,podDetail,rollout,logs,kubectl};
}
module.exports={create,pod,deployment,event,logLine,selector,BAD};
