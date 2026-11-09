// «SQL по словам», where queries run: the app's own connections (ClickHouse, PostgreSQL, BigQuery from its settings)
// and query sources of other apps. An extension that can run read-only SQL somewhere (Grafana datasources through
// /api/ds/query, a data warehouse gateway …) declares in its extension.json
//   "provides": { "query-source": "query-source.cjs" }
// (the `provides` map read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, ready(settings) -> bool,
//     async connections(services) -> [{id, name, dialect: 'clickhouse'|'postgres'|'bigquery'|'mysql'}],
//     async schema(services, connectionId) -> {database?, tables:[{name, comment?, rows?, columns:[{name, type, comment?}]}]},
//     async estimate?(services, connectionId, sql) -> {kind:'bytes'|'rows'|'unknown', value?, limit?, cost?, note?},
//     async run(services, connectionId, sql, {maxRows}) -> {columns:[{name, type}], rows:[[…]], truncated?, elapsedMs?, bytesRead?} }
// Every statement reaches `run` only after this app's validator (validate.cjs, by the connection's dialect) and the
// user's «Выполнить» (or the auto-run threshold); the source must still run it read-only on its side.
// A source counts only while its extension is added (catalog switch) and ready (connected).
const C=require('./connections.cjs');
const clickhouse=require('./clickhouse.cjs');
const postgres=require('./postgres.cjs');
const bigquery=require('./bigquery.cjs');
const KIND='query-source';
const deps={connect:undefined};

function load(dir){
 return require('../../features/app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.ready!=='function'||typeof p.connections!=='function'||typeof p.schema!=='function'||typeof p.run!=='function'||p.estimate!==undefined&&typeof p.estimate!=='function')throw Error('Invalid query source '+x.extension+'/'+x.file);
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
let loaded=null;
const registry=()=>loaded||(loaded=load());

// Every connection the request may use: own ones first, then each ready source's.
async function all(s,{sources=registry()}={}){
 const own=C.load(s.settings).filter(c=>c.kind!=='bigquery'||C.bigQueryKey(s.settings)).map(c=>({...c,label:C.label(c)}));
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const external=[];
 for(const x of sources){
  let ready=false;try{ready=added(x)&&!!x.source.ready(s.settings||{});}catch{ready=false;}
  if(!ready)continue;
  try{
   for(const c of await x.source.connections(s)){
    if(!c||typeof c.id!=='string'||!C.DIALECT[c.dialect]&&c.dialect!=='mysql')continue;
    external.push({id:'src:'+x.id+':'+c.id,name:String(c.name||c.id).slice(0,60),kind:x.id,dialect:c.dialect,external:x,remote:c.id,label:String(c.name||c.id).slice(0,60)+' · '+x.name});
   }
  }catch{/* a source that fails to list is skipped */}
 }
 return [...own,...external];
}

// The engine of one connection: schema, estimate and run with the right credentials.
function engine(s,conn){
 const password=()=>C.secrets(s.settings)[conn.id]||'';
 if(conn.external){
  const src=conn.external.source;
  return {
   schema:()=>src.schema(s,conn.remote),
   estimate:sql=>typeof src.estimate==='function'?src.estimate(s,conn.remote,sql):Promise.resolve({kind:'unknown'}),
   run:(sql,o)=>src.run(s,conn.remote,sql,o)
  };
 }
 if(conn.kind==='clickhouse')return {schema:()=>clickhouse.schema(s,conn,password()),estimate:sql=>clickhouse.estimate(s,conn,password(),sql),run:(sql,o)=>clickhouse.query(s,conn,password(),sql,o)};
 if(conn.kind==='postgres')return {schema:()=>postgres.schema(conn,password(),{connect:deps.connect}),estimate:sql=>postgres.estimate(conn,password(),sql,{connect:deps.connect}),run:(sql,o)=>postgres.query(conn,password(),sql,{...o,connect:deps.connect})};
 if(conn.kind==='bigquery'){const key=()=>C.bigQueryKey(s.settings);return {schema:()=>bigquery.schema(s,conn,key()),estimate:sql=>bigquery.estimate(s,conn,key(),sql),run:(sql,o)=>bigquery.query(s,conn,key(),sql,o)};}
 throw Error('Неизвестный вид подключения.');
}
module.exports={KIND,load,all,engine,deps,registry,reset:()=>{loaded=null;}};
