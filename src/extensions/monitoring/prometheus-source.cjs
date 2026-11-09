// Prometheus as a monitor source (src/features/monitor-sources.cjs), through its HTTP API (read-only):
//  - services: `up` (GET /api/v1/query) grouped by the service identity (service / app / job … labels), then
//    the golden signals of each service from PromQL templates (promql.cjs) over the period with
//    GET /api/v1/query_range — the last point is the current value, the series feed the sparklines;
//  - alerts: GET /api/v1/alerts (firing and pending alerting-rule instances);
//  - history: the built-in ALERTS{alertstate="firing"} series over the period (query_range) as alert intervals.
// Auth: an optional token (Bearer, or «user:password» → Basic) for a Prometheus behind a proxy.
const H=require('./http.cjs');
const P=require('./promql.cjs');
const {serviceOf,SERVICE_LABELS}=require('../../features/monitor-sources.cjs');
const MAX_SERVICES=24,MAX_DETAIL=12;

const base=settings=>{try{return H.base(settings.monitoringPrometheusUrl);}catch{return '';}};
const store=s=>require('./store.cjs').open(s);
async function api(s,path,params){
 const url=base(s.settings)+path+'?'+new URLSearchParams(params).toString();
 const r=await H.json(url,{headers:H.auth(s.settings.monitoringPrometheusToken)});
 if(r?.status!=='success')throw Error('Prometheus: '+(r?.error||'неожиданный ответ'));
 return r.data;
}
const instant=(s,query,time)=>api(s,'/api/v1/query',{query,time:String(time/1000)});
const range=(s,query,from,to)=>api(s,'/api/v1/query_range',{query,start:String(Math.floor(from/1000)),end:String(Math.floor(to/1000)),step:String(P.step(from,to))});
// Which label gave a service its name (to build its selector): the first identity label present.
function identity(labels,aliases){
 const name=serviceOf(labels,aliases);if(!name)return null;
 for(const key of SERVICE_LABELS){const v=String(labels[key]??'').trim();if(v&&(v.toLowerCase().replace(/\s+/g,'-')===name||aliases[v.toLowerCase()]===name))return {name,label:key.replace(/[^a-zA-Z0-9_]/g,'_'),value:v};}
 return {name,label:'instance',value:String(labels.instance||'')};
}
const points=r=>(r?.result?.[0]?.values||[]).map(([t,v])=>[Math.round(Number(t)*1000),Number(v)]).filter(p=>Number.isFinite(p[1]));

module.exports={
 id:'prometheus',name:'Prometheus',color:'#e5ce8c',
 names:[/(?:^|[^\p{L}])(?:prometheus|прометеус\p{L}*|прометей\p{L}*|promql)(?=$|[^\p{L}])/iu],
 ready:settings=>!!base(settings),
 async services(s,q){
  const data=await instant(s,'up',q.to);
  const by=new Map();
  for(const row of data?.result||[]){
   const id=identity(row.metric||{},q.aliases);if(!id)continue;
   const cur=by.get(id.name)||{...id,up:0,down:0};
   Number(row.value?.[1])===1?cur.up++:cur.down++;by.set(id.name,cur);
  }
  const config=store(s).services();
  // Services configured by hand but not seen in `up` are still asked about.
  for(const [name,c] of Object.entries(config))if(!by.has(name)&&c.selector)by.set(name,{name,label:'',value:'',up:0,down:0,configured:true});
  let list=[...by.values()];
  if(q.service)list=list.filter(x=>x.name===q.service);
  list.sort((a,b)=>(b.down>0)-(a.down>0)||a.name.localeCompare(b.name));
  list=list.slice(0,MAX_SERVICES);
  const window=String(s.settings.monitoringWindow||'5m');
  return Promise.all(list.map(async(x,i)=>{
   const c=config[x.name]||{};
   const status0=x.configured?'unknown':x.down&&!x.up?'critical':x.down?'warn':'ok';
   const out={name:x.name,status:status0,since:null,signals:{},series:{},note:x.down?x.down+' из '+(x.up+x.down)+' экз. не отвечают':''};
   // The background watch asks `light`: only `up`, no signal queries.
   if(q.light||i>=MAX_DETAIL&&!q.service)return out;
   const cfg={name:x.name,selector:c.selector||'',label:x.label,value:x.value,window:c.window||window,templates:c.templates||{}};
   await Promise.all(P.SIGNALS.map(async k=>{
    try{const pts=points(await range(s,P.render(k,cfg),q.from,q.to));if(pts.length){out.series[k]=pts;out.signals[k]=pts.at(-1)[1];}}
    catch{/* a signal without metrics stays empty */}
   }));
   const judged=P.judge(out.signals,c.thresholds||{});
   if(judged.status==='critical'||judged.status==='warn'&&out.status==='ok')out.status=judged.status;
   if(out.status!=='ok'){
    // Since when: the start of the current bad run in the series that made it bad, or of `up` going down.
    try{
     if(x.down){const pts=points(await range(s,P.render('up',cfg),q.from,q.to));let i=pts.length-1;while(i>0&&pts[i-1][1]===0)i--;if(pts.length)out.since=new Date(pts[i][0]).toISOString();}
     else{const k=judged.reasons[0],pts=out.series[k]||[],[warn]=({...P.THRESHOLDS,...c.thresholds})[k]||[Infinity];let i=pts.length-1;while(i>0&&pts[i-1][1]>=warn)i--;if(pts.length)out.since=new Date(pts[i][0]).toISOString();}
    }catch{/* since stays unknown */}
   }
   return out;
  }));
 },
 async alerts(s){
  const data=await api(s,'/api/v1/alerts',{});
  return (data?.alerts||[]).map(a=>({name:a.labels?.alertname,labels:a.labels,annotations:a.annotations,startsAt:a.activeAt,state:a.state==='pending'?'pending':'firing',severity:a.labels?.severity}));
 },
 async history(s,q){
  const data=await range(s,'ALERTS{alertstate="firing"}',q.from,q.to);
  const st=P.step(q.from,q.to)*1000,out=[],iso=t=>new Date(t).toISOString();
  for(const row of (data?.result||[]).slice(0,200)){
   const labels=row.metric||{},spans=[];let open=null;
   for(const t of (row.values||[]).map(([t])=>Math.round(Number(t)*1000))){if(open&&t-open.to<=st*1.5)open.to=t;else{if(open)spans.push(open);open={from:t,to:t};}}
   if(open)spans.push(open);
   for(const e of spans)out.push({service:serviceOf(labels,q.aliases),status:labels.severity==='critical'?'critical':'warn',title:labels.alertname||'ALERTS',kind:'alert',from:iso(e.from),to:q.to-e.to<=st*1.5?null:iso(e.to)});
  }
  return out;
 },
 // For tests and the settings card: the query one signal of a service would use.
 query:(signal,config)=>P.render(signal,config)
};
