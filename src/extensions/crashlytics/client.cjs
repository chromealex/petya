// Firebase Crashlytics through its BigQuery export. Crashlytics has no public REST API for issues; with the export
// enabled (Firebase console → Project settings → Integrations → BigQuery), every crash event lands in
// `<project>.firebase_crashlytics.<app id with _>_<ANDROID|IOS>` (and `…_REALTIME` with streaming export).
// Petya runs one read-only GoogleSQL query per request through the BigQuery REST API (`jobs.query`) with a Google
// Cloud service-account key (scope bigquery.readonly; IAM: BigQuery Job User on the project, Data Viewer on the
// dataset). Values always travel as query parameters; table names cannot, so they are validated before they reach
// the SQL. Every query names its columns (never SELECT *), filters on event_timestamp and carries
// `maximumBytesBilled`, so a query that would read more than the limit fails instead of being billed.
const account=require('../../google-service-account.cjs');
const ROOT='https://bigquery.googleapis.com/bigquery/v2';
const SCOPE='https://www.googleapis.com/auth/bigquery.readonly';
const PROJECT=/^(?:[a-z][a-z0-9.-]{0,61}[a-z0-9]:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATASET=/^[A-Za-z0-9_]{1,1024}$/;
const TABLE=/^[A-Za-z0-9_]{1,1000}_(ANDROID|IOS)$/;
const LOCATION=/^[A-Za-z0-9-]{2,40}$/;
const GB=1024**3;

function config(s){
 const v=s.settings;
 const tables=String(v.crashlyticsTables||'').split(',').map(t=>t.trim()).filter(Boolean);
 const limit=Number(v.crashlyticsLimitGb||5);
 return {project:String(v.crashlyticsProject||'').trim(),dataset:String(v.crashlyticsDataset||'').trim()||'firebase_crashlytics',tables,
  realtime:v.crashlyticsRealtime==='true',limitBytes:Math.round((Number.isFinite(limit)&&limit>0?limit:5)*GB),location:String(v.crashlyticsLocation||'').trim(),hasKey:!!v.crashlyticsCredential};
}
const connected=settings=>!!settings.crashlyticsCredential&&PROJECT.test(String(settings.crashlyticsProject||'').trim());

function explain(error){
 const detail=String(error?.detail||'');
 let text=error?.message||'BigQuery недоступен.';
 if(/bytesBilledLimitExceeded|exceeded limit for bytes billed/i.test(detail))text='Запрос к BigQuery прочитал бы больше лимита из настроек «Firebase Crashlytics». Сократите период или увеличьте лимит.';
 else if(error?.status===401)text='Google не принял ключ сервисного аккаунта для BigQuery. Загрузите ключ заново в настройках «Firebase Crashlytics».';
 else if(error?.status===403)text='Сервисному аккаунту не хватает прав BigQuery: нужны роли BigQuery Job User на проект и BigQuery Data Viewer на набор данных Crashlytics.';
 else if(error?.status===404)text='BigQuery не нашёл проект, набор данных или таблицу Crashlytics. Проверьте, что выгрузка в BigQuery включена в Firebase, и названия в настройках.';
 else if(error?.status===400&&/Unrecognized name|not found|No matching signature/i.test(detail))text='Схема выгрузки Crashlytics в BigQuery не совпала с ожидаемой: '+detail.replace(/\s+/g,' ').slice(0,200);
 const e=Error(text);e.status=error?.status;e.cause=error;return e;
}
async function api(s,path,{method='GET',body,query}={}){
 if(!s.settings.crashlyticsCredential)throw Error('Нет ключа сервисного аккаунта для BigQuery.');
 const token=await account.token(s.settings.crashlyticsCredential,SCOPE,s.request);
 const q=query?'?'+new URLSearchParams(query):'';
 try{return await s.request(ROOT+path+q,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{},timeoutMs:120000});}
 catch(e){throw explain(e);}
}
const projectPath=c=>{if(!PROJECT.test(c.project))throw Error('Укажите ID проекта Google Cloud в настройках «Firebase Crashlytics».');return '/projects/'+encodeURIComponent(c.project);};

// Crashlytics tables of the dataset: batch tables `<app>_<ANDROID|IOS>`, realtime ones with `_REALTIME`.
async function tables(s){
 const c=config(s);if(!DATASET.test(c.dataset))throw Error('Набор данных BigQuery указан неверно.');
 const names=[];let pageToken;
 for(let page=0;page<10;page++){
  const r=await api(s,projectPath(c)+'/datasets/'+encodeURIComponent(c.dataset)+'/tables',{query:{maxResults:'1000',...pageToken?{pageToken}:{}}});
  for(const t of r?.tables||[])if(typeof t?.tableReference?.tableId==='string')names.push(t.tableReference.tableId);
  pageToken=r?.nextPageToken;if(!pageToken)break;
 }
 return {batch:names.filter(n=>TABLE.test(n)).sort(),realtime:names.filter(n=>/_(ANDROID|IOS)_REALTIME$/.test(n)).sort()};
}

// GoogleSQL for one request. Per table only columns the export documents for that platform; titles come from the
// first exception on Android and from the blamed frame on Apple platforms.
const COLUMNS={
 ANDROID:"COALESCE(exceptions[SAFE_OFFSET(0)].type, blame_frame.symbol) AS title, exceptions[SAFE_OFFSET(0)].exception_message AS subtitle",
 IOS:"COALESCE(blame_frame.file, blame_frame.symbol) AS title, blame_frame.symbol AS subtitle"
};
// `realtime`: the batch tables whose `_REALTIME` twin exists (streaming export) and is read too; events in both are
// counted once by event_id.
function build({project,dataset,tables,realtime=[],release=false}){
 if(!PROJECT.test(project)||!DATASET.test(dataset)||!tables.length||tables.some(t=>!TABLE.test(t)))throw Error('Таблицы Crashlytics указаны неверно.');
 const parts=[],params=[];
 tables.forEach((table,i)=>{
  const platform=table.match(TABLE)[1];
  params.push({name:'app'+i,parameterType:{type:'STRING'},parameterValue:{value:table}});
  for(const name of realtime.includes(table)?[table,table+'_REALTIME']:[table])parts.push(
   'SELECT @app'+i+' AS app, \''+platform+'\' AS platform, bundle_identifier, issue_id, event_id, event_timestamp, installation_uuid, application.display_version AS version, '+COLUMNS[platform]+
   ", IF(blame_frame.file IS NULL, blame_frame.symbol, CONCAT(blame_frame.file, ':', CAST(blame_frame.line AS STRING))) AS culprit"+
   ' FROM `'+project+'.'+dataset+'.'+name+'` WHERE event_timestamp >= @from AND event_timestamp < @end AND error_type IN UNNEST(@types)'+(release?' AND application.display_version = @version':''));
 });
 const sql=['WITH events AS (',parts.join('\n UNION ALL\n'),'),',
  "daily AS (SELECT app, issue_id, FORMAT_TIMESTAMP('%F', event_timestamp) AS day, COUNT(DISTINCT event_id) AS n FROM events WHERE event_timestamp >= @chart GROUP BY app, issue_id, day),",
  'issues AS (SELECT app, ANY_VALUE(platform) AS platform, MAX(bundle_identifier) AS bundle, issue_id, MAX(title) AS title, MAX(subtitle) AS subtitle, MAX(culprit) AS culprit,',
  ' COUNT(DISTINCT IF(event_timestamp >= @start, event_id, NULL)) AS events, COUNT(DISTINCT IF(event_timestamp >= @start, installation_uuid, NULL)) AS users,',
  ' MIN(event_timestamp) AS first_seen, MAX(event_timestamp) AS last_seen, ARRAY_AGG(DISTINCT version IGNORE NULLS LIMIT 5) AS versions',
  ' FROM events GROUP BY app, issue_id)',
  'SELECT i.app, i.platform, i.bundle, i.issue_id, i.title, i.subtitle, i.culprit, i.events, i.users, i.first_seen, i.last_seen, i.versions,',
  ' ARRAY(SELECT AS STRUCT d.day, d.n FROM daily d WHERE d.app = i.app AND d.issue_id = i.issue_id ORDER BY d.day) AS daily, COUNT(*) OVER () AS total',
  'FROM issues i WHERE i.events > 0 ORDER BY i.events DESC LIMIT 100'].join('\n');
 return {sql,params};
}
const timestamp=(name,iso)=>({name,parameterType:{type:'TIMESTAMP'},parameterValue:{value:new Date(iso).toISOString()}});
// Parameters of one request: the period, how far back «new» looks, the chart's first day, crash types, the version.
function parameters({from,start,end,chart,version}){
 return [timestamp('from',from),timestamp('start',start),timestamp('end',end),timestamp('chart',chart),
  {name:'types',parameterType:{type:'ARRAY',arrayType:{type:'STRING'}},parameterValue:{arrayValues:[{value:'FATAL'}]}},
  ...version!==undefined?[{name:'version',parameterType:{type:'STRING'},parameterValue:{value:String(version)}}]:[]];
}

// One BigQuery row ({f:[{v}]}) by its schema into a plain object. TIMESTAMPs come as int64 microseconds
// (formatOptions.useInt64Timestamp), INTEGERs as strings, REPEATED and RECORD fields nested.
function value(field,v){
 if(v===null||v===undefined)return null;
 if(field.mode==='REPEATED')return (Array.isArray(v)?v:[]).map(x=>value({...field,mode:'NULLABLE'},x?.v));
 if(field.type==='RECORD'||field.type==='STRUCT')return record(field.fields||[],v);
 if(['INTEGER','INT64','FLOAT','FLOAT64','NUMERIC'].includes(field.type))return Number(v);
 if(field.type==='TIMESTAMP')return new Date(Number(v)/1000).toISOString();
 if(field.type==='BOOLEAN'||field.type==='BOOL')return v==='true'||v===true;
 return String(v);
}
function record(fields,row){const out={};fields.forEach((f,i)=>{out[f.name]=value(f,row?.f?.[i]?.v);});return out;}
const rows=(schema,list)=>(list||[]).map(r=>record(schema?.fields||[],r));

// jobs.query, waiting for a long query through getQueryResults. dryRun returns only the bytes it would read.
async function query(s,{sql,params,dryRun=false}){
 const c=config(s),path=projectPath(c);
 const body={query:sql,useLegacySql:false,parameterMode:'NAMED',queryParameters:params,maximumBytesBilled:String(c.limitBytes),
  timeoutMs:20000,maxResults:1000,formatOptions:{useInt64Timestamp:true},...c.location?{location:c.location}:{},...dryRun?{dryRun:true}:{}};
 let r=await api(s,path+'/queries',{method:'POST',body});
 if(dryRun)return {bytes:Number(r?.totalBytesProcessed)||0};
 for(let i=0;i<8&&r&&r.jobComplete===false;i++){
  const job=r.jobReference;if(!job?.jobId)break;
  r=await api(s,path+'/queries/'+encodeURIComponent(job.jobId),{query:{timeoutMs:'20000',maxResults:'1000','formatOptions.useInt64Timestamp':'true',...job.location?{location:job.location}:{}}});
 }
 if(!r||r.jobComplete===false)throw Error('BigQuery не успел выполнить запрос. Повторите позже.');
 if(r.errors?.length)throw explain({status:400,detail:JSON.stringify(r.errors)});
 return {rows:rows(r.schema,r.rows),bytes:Number(r.totalBytesProcessed)||0};
}
module.exports={ROOT,SCOPE,PROJECT,DATASET,TABLE,LOCATION,GB,config,connected,explain,api,tables,build,parameters,query,rows,record};
