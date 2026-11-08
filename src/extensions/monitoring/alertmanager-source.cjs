// Alertmanager as a monitor source (src/features/monitor-sources.cjs), API v2:
//  - alerts: GET /api/v2/alerts?active=true&silenced=true&inhibited=true (silenced ones are marked, not hidden);
//  - silences: GET /api/v2/silences (read);
//  - silence: POST /api/v2/silences {matchers, startsAt, endsAt, createdBy, comment} → {silenceID} — the only write
//    of «Мониторинг», called only from the card's confirmation button with the exact matchers and duration shown.
const H=require('./http.cjs');

const base=settings=>{try{return H.base(settings.monitoringAlertmanagerUrl);}catch{return '';}};
const headers=s=>H.auth(s.settings.monitoringAlertmanagerToken);

module.exports={
 id:'alertmanager',name:'Alertmanager',color:'#f0b4a8',
 names:[/(?:^|[^\p{L}])(?:alertmanager|алертменеджер\p{L}*|алерт-менеджер\p{L}*)(?=$|[^\p{L}])/iu],
 ready:settings=>!!base(settings),
 async alerts(s){
  const list=await H.json(base(s.settings)+'/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=false',{headers:headers(s)});
  if(!Array.isArray(list))throw Error('Alertmanager вернул некорректный список алертов.');
  return list.map(a=>({id:'am:'+a.fingerprint,fingerprint:a.fingerprint,name:a.labels?.alertname,labels:a.labels,annotations:a.annotations,startsAt:a.startsAt,severity:a.labels?.severity,
   silenced:(a.status?.silencedBy||[]).length>0,state:'firing',url:a.generatorURL||''}));
 },
 async silences(s){
  const list=await H.json(base(s.settings)+'/api/v2/silences',{headers:headers(s)});
  return (Array.isArray(list)?list:[]).map(x=>({id:x.id,matchers:x.matchers,startsAt:x.startsAt,endsAt:x.endsAt,createdBy:x.createdBy,comment:x.comment,state:x.status?.state}));
 },
 async silence(s,{matchers,startsAt,endsAt,comment,createdBy}){
  const r=await H.json(base(s.settings)+'/api/v2/silences',{method:'POST',headers:headers(s),body:{matchers,startsAt,endsAt,createdBy,comment}});
  if(!r?.silenceID)throw Error('Alertmanager не вернул номер тишины.');
  return {id:r.silenceID};
 },
 // The silence page in Alertmanager's own UI.
 silenceUrl:(settings,id)=>base(settings)?base(settings)+'/#/silences/'+encodeURIComponent(id):''
};
