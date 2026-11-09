// «AppMetrica»: the connection (OAuth token, applications, revenue currency) of the first metrics source of
// «Метрики игры». It answers no chat requests itself: the metrics card reads it through `metrics-source.cjs`.
const client=require('./client.cjs');
const ID='appmetrica';

function validate(next){
 const apps=String(next.appmetricaApps||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(apps.length>20||apps.some(x=>!client.ID.test(x)))throw Error('ID приложений AppMetrica — числа через запятую.');
 next.appmetricaApps=[...new Set(apps)].join(',');
 if(next.appmetricaCurrency&&!client.CURRENCIES.includes(next.appmetricaCurrency))throw Error('Валюта выручки: RUB, USD или EUR.');
 if(next.appmetricaAppNames){let v;try{v=JSON.parse(next.appmetricaAppNames);}catch{throw Error('Некорректные названия приложений.');}
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>200)throw Error('Некорректные названия приложений.');
  next.appmetricaAppNames=JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k])=>client.ID.test(k)).map(([k,n])=>[k,String(n).slice(0,80)])));}
}

function setup(s){
 return {ipc:{
  status:()=>{const c=client.config(s);return {hasToken:!!c.token,apps:c.apps,currency:c.currency};},
  applications:async()=>{if(!String(s.settings.appmetricaToken||'').trim())throw Error('Сначала сохраните OAuth-токен AppMetrica.');return client.applications(s);}
 }};
}
module.exports={name:'appmetrica',defaults:{['extension_'+ID]:'false',appmetricaToken:'',appmetricaApps:'',appmetricaAppNames:'{}',appmetricaCurrency:'RUB'},
 secrets:['appmetricaToken'],validate,setup,turn:async()=>null};
