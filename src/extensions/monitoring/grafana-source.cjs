// Grafana alerting (unified alerting) as a monitor source (src/features/monitor-sources.cjs), read-only:
// GET /api/prometheus/grafana/api/v1/rules — Grafana-managed alert rules in the Prometheus-compatible format
// ({status, data:{groups:[{name, rules:[{name, state, labels, annotations, alerts:[{labels, annotations, state,
// activeAt, value}]}]}]}}); every alert instance in state Alerting/Firing (or Pending) becomes an alert.
// Auth: a service account token (Bearer, role Viewer is enough). Silences in Grafana are not created by Petya.
const H=require('./http.cjs');

const base=settings=>{try{return H.base(settings.monitoringGrafanaUrl);}catch{return '';}};
const STATE=v=>{const s=String(v||'').toLowerCase();return s==='alerting'||s==='firing'?'firing':s==='pending'?'pending':'';};

module.exports={
 id:'grafana',name:'Grafana',color:'#86c2ff',
 names:[/(?:^|[^\p{L}])(?:grafana|графан\p{L}*)(?=$|[^\p{L}])/iu],
 ready:settings=>!!base(settings)&&!!settings.monitoringGrafanaToken,
 async alerts(s){
  const r=await H.json(base(s.settings)+'/api/prometheus/grafana/api/v1/rules',{headers:H.auth(s.settings.monitoringGrafanaToken)});
  if(r?.status&&r.status!=='success')throw Error('Grafana: '+(r.error||'неожиданный ответ'));
  const out=[];
  for(const g of r?.data?.groups||[])for(const rule of g.rules||[]){
   if(rule.type&&rule.type!=='alerting')continue;
   for(const a of rule.alerts||[]){
    const state=STATE(a.state);if(!state)continue;
    const labels={alertname:rule.name,...rule.labels,...a.labels};
    out.push({name:rule.name,labels,annotations:{...rule.annotations,...a.annotations},startsAt:a.activeAt,severity:labels.severity,state,
     url:base(s.settings)+'/alerting/list?search='+encodeURIComponent('rule:"'+rule.name+'"')});
   }
  }
  return out;
 }
};
