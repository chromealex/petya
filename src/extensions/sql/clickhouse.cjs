// ClickHouse through its HTTP interface (POST <url>/?database=…, body = the query, `FORMAT JSONCompact`), credentials in
// the X-ClickHouse-User / X-ClickHouse-Key headers. Every request carries `readonly=1` as the last URL setting, after
// the limits (max_execution_time, max_result_rows with result_overflow_mode=break), because once readonly=1 applies no
// later setting may change. A user whose profile is already read-only refuses any setting (code 164): then the query
// is repeated with readonly=1 alone and the LIMIT the validator put into the query. Values reach the schema query as
// HTTP query parameters ({db:String} ↔ param_db), never inside the SQL text.
const READONLY_CODE=/Code:\s*164\b|READONLY|Cannot modify '[^']+' setting in readonly mode/i;

function headers(conn,password){
 return {'Content-Type':'text/plain; charset=utf-8','X-ClickHouse-User':conn.user||'default',...password?{'X-ClickHouse-Key':password}:{}};
}
function explain(error){
 const detail=String(error?.detail||'').replace(/\s+/g,' ').trim();
 let text=error?.message||'ClickHouse недоступен.';
 if(error?.status===401||error?.status===403||/Code:\s*(?:516|192|193|194)\b|AUTHENTICATION_FAILED|Authentication failed/i.test(detail))text='ClickHouse не принял логин или пароль. Проверьте их в настройках «SQL по словам».';
 else if(/Code:\s*497\b|ACCESS_DENIED|Not enough privileges/i.test(detail))text='У пользователя ClickHouse нет прав на эту таблицу: '+detail.replace(/^Code:\s*\d+\.\s*DB::Exception:\s*/,'').slice(0,200);
 else if(/Code:\s*159\b|TIMEOUT_EXCEEDED/i.test(detail))text='ClickHouse не уложился в 30 секунд. Сузьте период или добавьте фильтр.';
 else if(/Code:\s*\d+/.test(detail))text='ClickHouse: '+detail.replace(/^Code:\s*\d+\.\s*DB::Exception:\s*/,'').replace(/\s*\(version [^)]*\)\s*$/,'').slice(0,300);
 else if(error?.code==='ECONNREFUSED'||/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(error?.message||'')+String(error?.cause?.code||'')))text='ClickHouse не отвечает по адресу из настроек.';
 const e=Error(text);e.status=error?.status;e.cause=error;return e;
}
async function send(s,conn,password,sql,{params={},maxRows=500,timeoutSec=30,limits=true}={}){
 const url=new URL(conn.url.replace(/\/$/,'')+'/');
 url.searchParams.set('database',conn.database||'default');
 for(const [k,v] of Object.entries(params))url.searchParams.set('param_'+k,String(v));
 if(limits){
  url.searchParams.set('max_execution_time',String(timeoutSec));
  url.searchParams.set('max_result_rows',String(maxRows));
  url.searchParams.set('result_overflow_mode','break');
 }
 url.searchParams.set('readonly','1');
 return s.request(url.toString(),{method:'POST',headers:headers(conn,password),body:sql+'\nFORMAT JSONCompact',timeoutMs:(timeoutSec+15)*1000});
}
async function query(s,conn,password,sql,options={}){
 const started=Date.now();
 let r;
 try{r=await send(s,conn,password,sql,options);}
 catch(e){
  if(!READONLY_CODE.test(String(e?.detail||'')))throw explain(e);
  try{r=await send(s,conn,password,sql,{...options,limits:false});}catch(e2){throw explain(e2);}
 }
 if(!r||!Array.isArray(r.meta)||!Array.isArray(r.data))throw Error('ClickHouse вернул ответ не в формате JSONCompact.');
 const columns=r.meta.map(m=>({name:String(m.name),type:String(m.type)}));
 const rows=r.data.map(row=>row.map((v,i)=>value(columns[i]?.type,v)));
 return {columns,rows,elapsedMs:Math.round((Number(r.statistics?.elapsed)||0)*1000)||Date.now()-started,rowsRead:Number(r.statistics?.rows_read)||0,bytesRead:Number(r.statistics?.bytes_read)||0,
  truncated:Number(r.rows_before_limit_at_least||0)>rows.length};
}
// 64-bit integers come as strings (output_format_json_quote_64bit_integers): numbers when exact, text otherwise.
function value(type,v){
 if(v===null||v===undefined)return null;
 const t=String(type||'').replace(/^(?:Nullable|LowCardinality)\((.*)\)$/,'$1');
 if(/^(?:U?Int\d+|Float\d+|Decimal)/.test(t)&&typeof v==='string'&&/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v)){const n=Number(v);return Number.isSafeInteger(n)||!/^-?\d+$/.test(v)?n:v;}
 if(typeof v==='object')return JSON.stringify(v);
 return v;
}

// Tables and columns of the connection's database, with comments where the server keeps them.
async function schema(s,conn,password){
 const cols=await query(s,conn,password,'SELECT table, name, type, comment FROM system.columns WHERE database = {db:String} ORDER BY table, position',{params:{db:conn.database||'default'},maxRows:20000});
 let info={rows:[]};
 try{info=await query(s,conn,password,'SELECT name, comment, engine, total_rows FROM system.tables WHERE database = {db:String} AND NOT is_temporary',{params:{db:conn.database||'default'},maxRows:5000});}catch{/* older servers: no comments */}
 const tables=new Map();
 for(const [table,name,type,comment] of cols.rows){
  if(!tables.has(table))tables.set(table,{name:table,comment:'',rows:null,engine:'',columns:[]});
  tables.get(table).columns.push({name,type,comment:comment||''});
 }
 for(const [name,comment,engine,rows] of info.rows){const t=tables.get(name);if(t){t.comment=comment||'';t.engine=engine||'';t.rows=rows===null?null:Number(rows);}}
 return {database:conn.database||'default',tables:[...tables.values()]};
}
// EXPLAIN ESTIMATE: rows and marks ClickHouse expects to read per table (MergeTree tables only).
async function estimate(s,conn,password,sql){
 try{
  const r=await query(s,conn,password,'EXPLAIN ESTIMATE '+sql,{maxRows:1000});
  const at=name=>r.columns.findIndex(c=>c.name===name);
  const rows=r.rows.reduce((n,row)=>n+(Number(row[at('rows')])||0),0);
  return {kind:'rows',value:rows,tables:r.rows.length};
 }catch(e){return {kind:'unknown',note:e.message};}
}
module.exports={query,schema,estimate,value,explain,send};
