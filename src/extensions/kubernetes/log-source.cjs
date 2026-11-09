// Log source «Kubernetes» (src/features/log-sources.cjs): pod logs of one workload through
//   kubectl logs --selector=<the deployment's selector> --all-containers --prefix --timestamps --since-time=<from>
// in the context and namespace of «Kubernetes» (settings or kubeconfig). kubectl has no server-side search, so the
// query is plain text and levels, words and the end of the period are applied here, after reading.
// Only live pods have logs; lines rotated away by the kubelet are gone (Loki or Elasticsearch keep history).
const L=require('../../features/log-sources.cjs');
const K=require('./kubectl.cjs');
const runtime=require('./runtime.cjs');

const custom=settings=>String(settings.kubernetesKubectl||'').trim();
module.exports={
 id:'kubernetes',name:'Kubernetes',language:'text',
 names:[/(?:^|[^\p{L}])(?:kubernetes|k8s|кубер\p{L}*|kubectl|кубектл\p{L}*|под(?:а|ов|ы|ах)|pods?)(?=$|[^\p{L}])/iu],
 maxRangeHours:48,maxLimit:1000,
 prompt:'Назови сервис (деплоймент) в services; query — одно слово или фраза для поиска в строках.',
 ready:settings=>!!K.binary({custom:custom(settings)}),
 hint:settings=>K.binary({custom:custom(settings)})?'':'Нужна команда kubectl и kubeconfig — см. «Kubernetes» в настройках.',
 compile:f=>(f.contains||[])[0]||'',
 async search(s,spec,{check}={}){
  const services=spec.filters.services.filter(x=>K.NAME.test(x)).slice(0,3);
  if(!services.length)throw Object.assign(Error('Для логов из Kubernetes нужен сервис (деплоймент).'),{need:'service'});
  const cluster=runtime.cluster(s);
  const wide=spec.filters.levels.length||spec.filters.contains.length||spec.query;
  const entries=[];let scope=null;
  for(const service of services){
   const r=await cluster.logs(service,{from:spec.range.from,tail:wide?spec.limit*5:spec.limit});
   check?.();scope=r;
   for(const x of r.lines)entries.push({ts:x.ts,message:x.message,service,labels:{pod:x.pod,container:x.container,namespace:r.namespace,app:service}});
  }
  const needle=[spec.query,...spec.filters.contains].filter(Boolean).map(v=>v.toLowerCase());
  const out=entries.filter(e=>{
   const m=e.message.toLowerCase();
   if(Date.parse(e.ts)>Date.parse(spec.range.to))return false;
   if(needle.some(n=>!m.includes(n)))return false;
   if(spec.filters.exclude.some(n=>m.includes(n.toLowerCase())))return false;
   return !spec.filters.levels.length||spec.filters.levels.includes(L.levelOf(e.message,{}));
  });
  return {entries:out,total:out.length,truncated:out.length>spec.limit,notes:['Kubernetes ('+scope.context+', '+scope.namespace+'): только живые поды; строки, которые kubelet уже ротировал, не видны.']};
 },
 async services(s){const c=runtime.cluster(s);return (await c.deployments(await c.target())).map(d=>d.name);}
};
