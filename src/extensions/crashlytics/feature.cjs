// «Firebase Crashlytics»: the BigQuery connection of the Crashlytics crash source (service-account key, Google Cloud
// project, dataset, apps, realtime tables, a bytes-billed limit). Chat requests are answered by «Крэши»; this feature
// owns the settings, their validation and the settings card ipc: key import, the table list and a dry-run check
// that shows how much a week's query would read.
const kit=require('../app-kit.cjs');
const bq=require('./client.cjs');
const source=require('./crash-source.cjs');
const account=require('../../google-service-account.cjs');
const ID='crashlytics';

function validate(next){
 const project=String(next.crashlyticsProject||'').trim();
 if(project&&!bq.PROJECT.test(project))throw Error('ID проекта Google Cloud: строчные латинские буквы, цифры и «-», например my-game-12345.');
 next.crashlyticsProject=project;
 const dataset=String(next.crashlyticsDataset||'').trim()||'firebase_crashlytics';
 if(!bq.DATASET.test(dataset))throw Error('Набор данных BigQuery: латиница, цифры и «_».');
 next.crashlyticsDataset=dataset;
 const tables=String(next.crashlyticsTables||'').split(',').map(t=>t.trim()).filter(Boolean);
 if(tables.length>30||tables.some(t=>!bq.TABLE.test(t)))throw Error('Приложения Crashlytics — имена таблиц вида com_studio_game_ANDROID или com_studio_game_IOS.');
 next.crashlyticsTables=[...new Set(tables)].join(',');
 if(!['true','false'].includes(next.crashlyticsRealtime))next.crashlyticsRealtime='false';
 const limit=Number(String(next.crashlyticsLimitGb||'5').replace(',','.'));
 if(!Number.isFinite(limit)||limit<0.1||limit>1000)throw Error('Лимит чтения BigQuery — от 0,1 до 1000 ГБ.');
 next.crashlyticsLimitGb=String(limit);
 const location=String(next.crashlyticsLocation||'').trim();
 if(location&&!bq.LOCATION.test(location))throw Error('Регион BigQuery указан неверно, например US, EU или europe-west1.');
 next.crashlyticsLocation=location;
}

function setup(s){
 const status=()=>{const c=bq.config(s);return {added:kit.installed(s,ID),hasKey:c.hasKey,project:c.project,dataset:c.dataset,tables:c.tables,realtime:c.realtime,limitGb:Number(s.settings.crashlyticsLimitGb||5),location:c.location,
  account:(()=>{try{return c.hasKey?account.parse(s.settings.crashlyticsCredential).client_email:'';}catch{return '';}})()};};
 return {ipc:{
  status,
  // The JSON key chosen in the settings card: checked here, kept as a secret; the project id is taken from it once.
  saveKey:text=>{
   if(typeof text!=='string'||text.length>20000)throw Error('Выберите JSON ключ сервисного аккаунта Google.');
   const key=account.parse(text);
   const values={crashlyticsCredential:JSON.stringify(key)};
   if(!s.settings.crashlyticsProject&&key.project_id&&bq.PROJECT.test(key.project_id))values.crashlyticsProject=key.project_id;
   s.saveSettings(values,true);return status();
  },
  clearKey:()=>{s.saveSettings({clear_crashlyticsCredential:true},true);return status();},
  tables:async()=>{if(!bq.connected(s.settings))throw Error('Сначала загрузите ключ и укажите проект.');return bq.tables(s);},
  // Dry run of a week's query: which tables are read and how many bytes it would process (nothing is billed).
  check:async()=>{if(!bq.connected(s.settings))throw Error('Сначала загрузите ключ и укажите проект.');return source.estimate(s);}
 }};
}
module.exports={name:'crashlytics',defaults:{['extension_'+ID]:'false',crashlyticsCredential:'',crashlyticsProject:'',crashlyticsDataset:'firebase_crashlytics',crashlyticsTables:'',crashlyticsRealtime:'false',crashlyticsLimitGb:'5',crashlyticsLocation:''},
 secrets:['crashlyticsCredential'],validate,setup};
