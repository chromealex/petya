// AppMetrica as a «metrics-source» of «Метрики игры» (see src/extensions/metrics/sources.cjs for the contract).
// DAU and new users come from the audience namespace (ym:u:activeUsers, ym:u:newUsers), revenue from the revenue
// namespace (ym:r2:revenue<currency>, in-app plus ad revenue when configured), retention from cohorts by install
// day (ym:u:profileInstallDate × ym:u:date). A metric AppMetrica refuses or has no data for is reported as
// unavailable instead of failing the whole card.
const client=require('./client.cjs');

function pickApp(s,app){
 const c=client.config(s);
 if(app&&c.apps.includes(String(app)))return String(app);
 return c.apps[0]||null;
}
const quiet=async(work,fallback)=>{try{return await work();}catch(e){if(e.status===401||e.status===429)throw e;return fallback(e);}};

module.exports={
 id:'appmetrica',name:'AppMetrica',
 ready:settings=>settings.extension_appmetrica==='true'&&client.connected(settings),
 apps:settings=>{let names={};try{names=JSON.parse(settings.appmetricaAppNames||'{}')||{};}catch{names={};}
  return String(settings.appmetricaApps||'').split(',').map(x=>x.trim()).filter(x=>client.ID.test(x)).map(id=>({id,name:String(names[id]||id).slice(0,80)}));},
 async fetch(s,q){
  const id=pickApp(s,q.app);if(!id)throw Error('В настройках «AppMetrica» не выбрано приложение.');
  const {currency}=client.config(s),dims={platform:q.platform||null,version:q.version||null,app:id};
  const series=[],unavailable=[];
  const want=q.metrics||['dau','new','revenue'];
  // Audience: a failure here is the whole source's failure (wrong app, token, quota).
  const [dau,fresh]=await client.daily(s,{id,metrics:['ym:u:activeUsers','ym:u:newUsers'],from:q.from,to:q.to,platform:q.platform,version:q.version});
  if(want.includes('dau'))series.push({metric:'dau',unit:'users',series:dau,dimensions:dims});
  if(want.includes('new'))series.push({metric:'new',unit:'users',series:fresh,dimensions:dims});
  if(want.includes('revenue')){
   const rev=await quiet(()=>client.daily(s,{id,metrics:['ym:r2:revenue<currency>'],from:q.from,to:q.to,platform:q.platform,version:q.version,currency}).then(r=>r[0]),e=>{unavailable.push({metric:'revenue',reason:'Выручка недоступна: '+e.message});return null;});
   if(rev&&rev.some(p=>p.value>0))series.push({metric:'revenue',unit:'currency:'+currency,series:rev,dimensions:dims});
   else if(rev)unavailable.push({metric:'revenue',reason:'Нет данных о выручке: в AppMetrica не настроен учёт покупок (Revenue) или их не было.'});
  }
  return {app:id,series,unavailable};
 },
 async retention(s,q){
  const id=pickApp(s,q.app);if(!id)return null;
  return {cohorts:await client.cohorts(s,{id,from:q.from,to:q.to,platform:q.platform,version:q.version})};
 },
 async facets(s,q){
  const id=pickApp(s,q.app);if(!id)return {versions:[],platforms:[]};
  return {versions:await quiet(()=>client.versions(s,{id,from:q.from,to:q.to,platform:q.platform}),()=>[]),platforms:['android','ios']};
 }
};
