// A fake `kubectl` for tests: a node script in a temp folder put first on PATH. It answers the read commands
// «Kubernetes» and its log source use with realistic JSON (a namespace with a CrashLoopBackOff pod, an OOMKilled
// pod, a rolling deployment, warning events), records every argv into FAKE_KUBECTL_LOG, applies restart/scale to
// its own state file, and can pretend the cluster is unreachable, forbidden or hanging (FAKE_KUBECTL_MODE).
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const NOW=Date.now();
const ago=min=>new Date(NOW-min*60e3).toISOString();
function container(name,image,{ready=true,restarts=0,state={running:{startedAt:ago(30)}},last={}}={}){return {name,image,ready,restartCount:restarts,state,lastState:last};}
function pod(name,{app,hash,phase='Running',statuses,limits={memory:'256Mi'},node='node-a'}){
 return {metadata:{name,namespace:'shop',labels:{app,'pod-template-hash':hash},ownerReferences:[{kind:'ReplicaSet',name:app+'-'+hash}]},
  spec:{nodeName:node,containers:statuses.map(s=>({name:s.name,image:s.image,resources:{limits}}))},status:{phase,startTime:ago(120),containerStatuses:statuses}};
}
function fixture(){
 return {
  config:{'current-context':'prod-eu',contexts:[{name:'prod-eu',context:{cluster:'prod-eu',namespace:'shop',user:'me'}}]},
  contexts:['prod-eu','staging'],
  pods:[
   pod('api-7c9d8-x2k4p',{app:'api',hash:'7c9d8',statuses:[container('api','registry.example.com/api:1.8.2')]}),
   pod('api-7c9d8-q9w1z',{app:'api',hash:'7c9d8',statuses:[container('api','registry.example.com/api:1.8.2')]}),
   pod('payments-5f6b7-abcde',{app:'payments',hash:'5f6b7',statuses:[container('payments','registry.example.com/payments:2.3.0',{ready:false,restarts:14,state:{waiting:{reason:'CrashLoopBackOff',message:'back-off 5m0s restarting failed container=payments'}},last:{terminated:{reason:'Error',exitCode:1,finishedAt:ago(2)}}})]}),
   pod('worker-6d5c4-zzz11',{app:'worker',hash:'6d5c4',statuses:[container('worker','registry.example.com/worker:0.9.1',{restarts:3,last:{terminated:{reason:'OOMKilled',exitCode:137,finishedAt:ago(40)}}})],limits:{memory:'128Mi'}}),
   pod('web-8a7b6-ppp22',{app:'web',hash:'8a7b6',phase:'Pending',statuses:[container('web','registry.example.com/web:3.0.0',{ready:false,state:{waiting:{reason:'ContainerCreating'}}})]})
  ],
  deployments:[
   {name:'api',replicas:2,ready:2,updated:2,available:2},{name:'payments',replicas:1,ready:0,updated:1,available:0,deadline:true},
   {name:'worker',replicas:1,ready:1,updated:1,available:1},{name:'web',replicas:3,ready:2,updated:1,available:2}
  ].map(d=>({metadata:{name:d.name,namespace:'shop',generation:4,annotations:{'deployment.kubernetes.io/revision':'7'}},
   spec:{replicas:d.replicas,selector:{matchLabels:{app:d.name}},template:{spec:{containers:[{name:d.name,image:'registry.example.com/'+d.name+':1'}]}}},
   status:{observedGeneration:4,replicas:d.replicas,readyReplicas:d.ready,updatedReplicas:d.updated,availableReplicas:d.available,
    conditions:[{type:'Progressing',reason:d.deadline?'ProgressDeadlineExceeded':'NewReplicaSetAvailable',message:d.deadline?'ReplicaSet "payments-5f6b7" has timed out progressing.':'ok',lastUpdateTime:ago(5)}]}})),
  events:[
   {type:'Warning',reason:'BackOff',message:'Back-off restarting failed container payments in pod payments-5f6b7-abcde',count:61,lastTimestamp:ago(1),involvedObject:{kind:'Pod',name:'payments-5f6b7-abcde'}},
   {type:'Warning',reason:'Unhealthy',message:'Readiness probe failed: HTTP probe failed with statuscode: 503',count:4,lastTimestamp:ago(3),involvedObject:{kind:'Pod',name:'payments-5f6b7-abcde'}},
   {type:'Warning',reason:'FailedScheduling',message:'0/3 nodes are available: 3 Insufficient memory.',count:2,lastTimestamp:ago(6),involvedObject:{kind:'Pod',name:'web-8a7b6-ppp22'}},
   {type:'Normal',reason:'Pulled',message:'Container image already present on machine',count:1,lastTimestamp:ago(8),involvedObject:{kind:'Pod',name:'api-7c9d8-x2k4p'}}
  ],
  logs:{
   payments:['[pod/payments-5f6b7-abcde/payments] '+ago(4)+' INFO starting payments 2.3.0','[pod/payments-5f6b7-abcde/payments] '+ago(3)+' ERROR failed to connect to postgres at 10.0.0.12:5432: connection refused','[pod/payments-5f6b7-abcde/payments] '+ago(2)+' FATAL cannot start without database'],
   api:['[pod/api-7c9d8-x2k4p/api] '+ago(9)+' INFO GET /health 200','[pod/api-7c9d8-q9w1z/api] '+ago(5)+' ERROR upstream payments timeout after 3000ms','[pod/api-7c9d8-x2k4p/api] '+ago(1)+' WARN slow request /checkout 2300ms']
  }
 };
}
function install(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-kubectl-'));
 const data=path.join(dir,'fixture.json');fs.writeFileSync(data,JSON.stringify(fixture()));
 const log=path.join(dir,'calls.log');
 const script=`#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
const mode=process.env.FAKE_KUBECTL_MODE||'';
if(mode==='unreachable'){process.stderr.write('Unable to connect to the server: dial tcp 10.1.1.1:443: connect: connection refused\\n');process.exit(1);}
if(mode==='forbidden'){process.stderr.write('Error from server (Forbidden): pods is forbidden: User "dev" cannot list resource "pods" in API group "" in the namespace "shop"\\n');process.exit(1);}
if(mode==='slow'){setTimeout(()=>{},60000);return;}
const d=JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'));
const out=v=>{process.stdout.write(typeof v==='string'?v:JSON.stringify(v));process.exit(0);};
const flag=n=>{const a=args.find(x=>x.startsWith('--'+n+'='));return a?a.slice(n.length+3):null;};
const [verb,what,name]=args;
if(verb==='config'&&what==='view')out(d.config);
if(verb==='config'&&what==='get-contexts')out(d.contexts.join('\\n')+'\\n');
if(flag('namespace')&&flag('namespace')!=='shop'){process.stderr.write('Error from server (NotFound): namespaces "'+flag('namespace')+'" not found\\n');process.exit(1);}
if(verb==='get'&&what==='pods'){const sel=flag('selector');out({items:sel?d.pods.filter(p=>p.metadata.labels.app===sel.split('=')[1]):d.pods});}
if(verb==='get'&&what==='pod'){const p=d.pods.find(x=>x.metadata.name===name);if(!p){process.stderr.write('Error from server (NotFound): pods "'+name+'" not found\\n');process.exit(1);}out(p);}
if(verb==='get'&&what==='deployments')out({items:d.deployments});
if(verb==='get'&&what==='deployment'){const x=d.deployments.find(y=>y.metadata.name===name);if(!x){process.stderr.write('Error from server (NotFound): deployments.apps "'+name+'" not found\\n');process.exit(1);}out(x);}
if(verb==='get'&&what==='events'){const f=args.find(x=>x.startsWith('--field-selector='));const n=f&&/involvedObject.name=([^,]+)/.exec(f)[1];out({items:n?d.events.filter(e=>e.involvedObject.name===n):d.events});}
if(verb==='describe')out('Name:         '+name+'\\nNamespace:    shop\\nStatus:       Running\\nEvents:\\n  Warning  BackOff  1m  kubelet  Back-off restarting failed container\\n');
if(verb==='rollout'&&what==='status')out(name==='deployment/payments'?'Waiting for deployment "payments" rollout to finish: 0 of 1 updated replicas are available...\\n':'deployment "'+name.split('/')[1]+'" successfully rolled out\\n');
if(verb==='logs'){
 const sel=flag('selector');
 if(sel){const app=sel.split('=')[1];out((d.logs[app]||[]).join('\\n')+'\\n');}
 out(d.logs.payments.map(l=>l.replace(/^\\[[^\\]]+\\] /,'')).join('\\n')+'\\n');
}
if(verb==='rollout'&&what==='restart'){const x=d.deployments.find(y=>'deployment/'+y.metadata.name===name);x.metadata.annotations['deployment.kubernetes.io/revision']='8';fs.writeFileSync(${JSON.stringify(data)},JSON.stringify(d));out(name+' restarted\\n');}
if(verb==='scale'){const x=d.deployments.find(y=>'deployment/'+y.metadata.name===what);const n=Number(flag('replicas'));x.spec.replicas=n;x.status.replicas=n;x.status.readyReplicas=Math.min(n,x.status.readyReplicas);x.status.updatedReplicas=n;fs.writeFileSync(${JSON.stringify(data)},JSON.stringify(d));out(what+' scaled\\n');}
process.stderr.write('error: unknown command "'+args.join(' ')+'"\\n');process.exit(1);
`;
 const file=path.join(dir,process.platform==='win32'?'kubectl.exe':'kubectl');
 fs.writeFileSync(file,script,{mode:0o755});
 return {dir,log,data,calls:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[],reset:()=>{fs.writeFileSync(log,'');fs.writeFileSync(data,JSON.stringify(fixture()));}};
}
module.exports={install,fixture,NOW};
