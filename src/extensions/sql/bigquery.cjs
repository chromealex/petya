// BigQuery through the REST API with a Google Cloud service-account key (the shared JWT path,
// src/google-service-account.cjs; scope bigquery.readonly; IAM: BigQuery Job User on the project, Data Viewer on the
// dataset). The schema comes from tables.list + tables.get (free metadata calls, column descriptions included); the
// cost is a dry run of jobs.query (totalBytesProcessed, nothing billed); the run is jobs.query with
// `maximumBytesBilled` from the connection, so a query that would read more fails instead of being billed.
const account=require('../../google-service-account.cjs');
const ROOT='https://bigquery.googleapis.com/bigquery/v2';
const SCOPE='https://www.googleapis.com/auth/bigquery.readonly';
const GB=1024**3;

function explain(error){
 const detail=String(error?.detail||'');
 let text=error?.message||'BigQuery недоступен.';
 if(/bytesBilledLimitExceeded|exceeded limit for bytes billed/i.test(detail))text='Запрос прочитал бы больше лимита BigQuery из настроек «SQL по словам». Сузьте период или увеличьте лимит.';
 else if(error?.status===401)text='Google не принял ключ сервисного аккаунта для BigQuery. Загрузите ключ заново в настройках «SQL по словам».';
 else if(error?.status===403)text='Сервисному аккаунту не хватает прав BigQuery: нужны роли BigQuery Job User на проект и BigQuery Data Viewer на набор данных.';
 else if(error?.status===404)text='BigQuery не нашёл проект, набор данных или таблицу из запроса.';
 else if(error?.status===400){const m=/"message"\s*:\s*"([^"]{1,300})"/.exec(detail);if(m)text='BigQuery: '+m[1];}
 const e=Error(text);e.status=error?.status;e.cause=error;return e;
}
async function api(s,key,path,{method='GET',body,query}={}){
 if(!key)throw Error('Нет ключа сервисного аккаунта для BigQuery: загрузите его в настройках «SQL по словам».');
 const token=await account.token(key,SCOPE,s.request);
 const q=query?'?'+new URLSearchParams(query):'';
 try{return await s.request(ROOT+path+q,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{},timeoutMs:120000});}
 catch(e){throw explain(e);}
}
const projectPath=conn=>'/projects/'+encodeURIComponent(conn.project);

// Nested RECORD fields become dotted names (two levels), as they are written in GoogleSQL.
function flatten(fields,prefix='',depth=0){
 const out=[];
 for(const f of fields||[]){
  const name=prefix+f.name,type=(f.mode==='REPEATED'?'ARRAY<':'')+(f.type==='RECORD'?'STRUCT':f.type)+(f.mode==='REPEATED'?'>':'');
  out.push({name,type,comment:String(f.description||'').slice(0,200)});
  if((f.type==='RECORD'||f.type==='STRUCT')&&depth<1)out.push(...flatten(f.fields,name+'.',depth+1));
 }
 return out;
}
async function schema(s,conn,key,{maxTables=60}={}){
 const names=[];let pageToken;
 for(let page=0;page<5;page++){
  const r=await api(s,key,projectPath(conn)+'/datasets/'+encodeURIComponent(conn.dataset)+'/tables',{query:{maxResults:'1000',...pageToken?{pageToken}:{}}});
  for(const t of r?.tables||[])if(typeof t?.tableReference?.tableId==='string')names.push({id:t.tableReference.tableId,type:t.type||''});
  pageToken=r?.nextPageToken;if(!pageToken)break;
 }
 // Sharded tables (events_20261101, events_20261102 …) are one wildcard table for the model.
 const shards=new Map(),plain=[];
 for(const n of names){const m=/^(.*_)(\d{8})$/.exec(n.id);if(m){const k=m[1];if(!shards.has(k)||shards.get(k).id<n.id)shards.set(k,n);}else plain.push(n);}
 const picked=[...plain,...[...shards.values()]].slice(0,maxTables);
 const tables=[];
 for(let i=0;i<picked.length;i+=6){
  const part=await Promise.all(picked.slice(i,i+6).map(async n=>{
   const t=await api(s,key,projectPath(conn)+'/datasets/'+encodeURIComponent(conn.dataset)+'/tables/'+encodeURIComponent(n.id));
   const shard=/^(.*_)(\d{8})$/.exec(n.id);
   return {name:shard?shard[1]+'*':n.id,comment:String(t?.description||'').slice(0,300)+(shard?(t?.description?' · ':'')+'шардированная таблица: '+shard[1]+'YYYYMMDD, фильтр по _TABLE_SUFFIX':''),
    rows:t?.numRows!==undefined?Number(t.numRows):null,bytes:t?.numBytes!==undefined?Number(t.numBytes):null,columns:flatten(t?.schema?.fields)};
  }));
  tables.push(...part);
 }
 return {database:conn.project+'.'+conn.dataset,tables,more:Math.max(0,plain.length+shards.size-picked.length)};
}

function body(conn,sql,{dryRun=false,maxRows=500}={}){
 return {query:sql,useLegacySql:false,dryRun,maximumBytesBilled:String(Math.round(conn.limitGb*GB)),timeoutMs:20000,maxResults:maxRows,
  defaultDataset:{projectId:conn.project,datasetId:conn.dataset},formatOptions:{useInt64Timestamp:true},...conn.location?{location:conn.location}:{}};
}
async function estimate(s,conn,key,sql){
 const r=await api(s,key,projectPath(conn)+'/queries',{method:'POST',body:body(conn,sql,{dryRun:true})});
 return {kind:'bytes',value:Number(r?.totalBytesProcessed)||0,limit:Math.round(conn.limitGb*GB)};
}
// One BigQuery value by its field: numbers, ISO time for TIMESTAMP (int64 microseconds), nested records as JSON.
function value(field,v){
 if(v===null||v===undefined)return null;
 if(field.mode==='REPEATED'||field.type==='RECORD'||field.type==='STRUCT')return JSON.stringify(plain(field,v));
 if(['INTEGER','INT64'].includes(field.type)){const n=Number(v);return Number.isSafeInteger(n)?n:String(v);}
 if(['FLOAT','FLOAT64','NUMERIC','BIGNUMERIC'].includes(field.type))return Number(v);
 if(field.type==='TIMESTAMP')return new Date(Number(v)/1000).toISOString();
 if(field.type==='BOOLEAN'||field.type==='BOOL')return v==='true'||v===true;
 return String(v);
}
function plain(field,v){
 if(field.mode==='REPEATED')return (Array.isArray(v)?v:[]).map(x=>plain({...field,mode:'NULLABLE'},x?.v));
 if(field.type==='RECORD'||field.type==='STRUCT'){const o={};(field.fields||[]).forEach((f,i)=>{o[f.name]=plain(f,v?.f?.[i]?.v);});return o;}
 return v===null||v===undefined?null:value(field,v);
}
async function query(s,conn,key,sql,{maxRows=500}={}){
 const started=Date.now();
 let r=await api(s,key,projectPath(conn)+'/queries',{method:'POST',body:body(conn,sql,{maxRows})});
 for(let i=0;i<8&&r&&r.jobComplete===false;i++){
  const job=r.jobReference;if(!job?.jobId)break;
  r=await api(s,key,projectPath(conn)+'/queries/'+encodeURIComponent(job.jobId),{query:{timeoutMs:'20000',maxResults:String(maxRows),'formatOptions.useInt64Timestamp':'true',...job.location?{location:job.location}:{}}});
 }
 if(!r||r.jobComplete===false)throw Error('BigQuery не успел выполнить запрос. Повторите позже.');
 if(r.errors?.length)throw explain({status:400,detail:JSON.stringify(r.errors)});
 const fields=r.schema?.fields||[];
 const columns=fields.map(f=>({name:f.name,type:(f.mode==='REPEATED'?'ARRAY<':'')+f.type+(f.mode==='REPEATED'?'>':'')}));
 const rows=(r.rows||[]).map(row=>fields.map((f,i)=>value(f,row?.f?.[i]?.v)));
 return {columns,rows,elapsedMs:Date.now()-started,bytesRead:Number(r.totalBytesProcessed)||0,cacheHit:!!r.cacheHit,truncated:Number(r.totalRows||0)>rows.length};
}
module.exports={ROOT,SCOPE,GB,schema,estimate,query,flatten,value,explain};
