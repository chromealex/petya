// Petya's own uptime checks as a monitor source (src/features/monitor-sources.cjs). The checks and their results
// live in the local store (store.cjs); this file only reads them:
//  - services: one per service named by the checks (worst check wins), latency p95 and failure share as signals;
//  - history: failed runs (consecutive failed probes) as outages of kind «uptime».
// Ready once at least one check is saved (`monitoringUptimeChecks` counts them).
const U=require('./uptime.cjs');
const store=s=>require('./store.cjs').open(s);
const RANK={unknown:0,ok:1,warn:2,critical:3};

module.exports={
 id:'uptime',name:'Проверки доступности',color:'#c9ed9d',
 names:[/аптайм\p{L}*|uptime|(?:провер\p{L}* доступност\p{L}*)/iu],
 ready:settings=>Number(settings.monitoringUptimeChecks)>0,
 async services(s,q){
  const st=store(s),by=new Map();
  for(const c of st.checks().filter(c=>c.enabled!==false)){
   const now=U.status(st,c),x=U.stats(st,c,{now:q.now,days:1,from:q.from});
   const cur=by.get(c.service)||{name:c.service,status:'unknown',since:null,signals:{errorRate:null,latencyP95:null,rps:null,saturation:null},series:{},note:''};
   if(RANK[now.status]>RANK[cur.status]){cur.status=now.status;cur.since=now.since;cur.note=now.status!=='ok'?c.name+': '+(x.last?.error||'TLS скоро истекает'):'';}
   if(x.latencyP95!==null)cur.signals.latencyP95=Math.max(cur.signals.latencyP95||0,x.latencyP95/1000);
   if(x.percent!==null)cur.signals.errorRate=Math.max(cur.signals.errorRate||0,1-x.percent);
   if(!cur.series.latencyP95&&x.latency.length)cur.series.latencyP95=x.latency.filter(p=>p[1]!==null).map(([t,v])=>[t,v/1000]);
   by.set(c.service,cur);
  }
  return [...by.values()].filter(x=>!q.service||x.name===q.service);
 },
 async history(s,q){
  const st=store(s),out=[];
  for(const c of st.checks())for(const f of U.stats(st,c,{now:q.now,from:q.from}).failures)
   out.push({service:c.service,status:'critical',from:new Date(f.from).toISOString(),to:f.to?new Date(f.to).toISOString():null,title:c.name+(f.error?': '+f.error:''),kind:'uptime'});
  return out;
 }
};
