// Grafana as a query source for «SQL по словам» (contract: src/extensions/sql/sources.cjs). The SQL datasources a
// Viewer can see (GET /api/frontend/settings → datasources) become connections: PostgreSQL, MySQL and the ClickHouse
// plugin. Schemas and queries go through POST /api/ds/query with `rawSql` and the table format; Grafana runs them with
// the datasource's own (ideally read-only) database user. Every statement has already passed «SQL по словам»'s
// read-only validator for the datasource's dialect and the user's «Выполнить».
const client=require('./client.cjs');
const TYPES={'postgres':'postgres','grafana-postgresql-datasource':'postgres','mysql':'mysql','grafana-clickhouse-datasource':'clickhouse','vertamedia-clickhouse-datasource':'clickhouse'};
const SCHEMA={
 clickhouse:'SELECT table, name, type, comment FROM system.columns WHERE database = currentDatabase() ORDER BY table, position LIMIT 5000',
 postgres:"SELECT CASE WHEN c.table_schema = 'public' THEN c.table_name ELSE c.table_schema || '.' || c.table_name END AS t, c.column_name, c.data_type, COALESCE(col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position::int), '') AS comment FROM information_schema.columns c WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, c.ordinal_position LIMIT 5000",
 mysql:'SELECT table_name, column_name, data_type, column_comment FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position LIMIT 5000'
};

async function sources(s){
 const fe=await client.frontendSettings(s);
 return Object.entries(fe?.datasources||{}).map(([name,d])=>({name,uid:String(d?.uid||''),type:String(d?.type||'')})).filter(d=>d.uid&&TYPES[d.type]);
}
async function find(s,uid){const d=(await sources(s)).find(x=>x.uid===uid);if(!d)throw Error('Источник данных Grafana не найден или недоступен.');return d;}
// One frame of a /api/ds/query answer → columns and rows (values come column by column; time fields as epoch ms).
function frame(result){
 if(result?.error)throw Error('Grafana: '+String(result.error).slice(0,300));
 const f=(result?.frames||[])[0];if(!f)return {columns:[],rows:[]};
 const fields=f.schema?.fields||[],values=f.data?.values||[];
 const columns=fields.map(x=>({name:String(x.name),type:String(x.type||x.typeInfo?.frame||'')}));
 const n=Math.max(0,...values.map(v=>v?.length||0));
 const rows=[];
 for(let i=0;i<n;i++)rows.push(fields.map((x,k)=>{const v=values[k]?.[i];return x.type==='time'&&typeof v==='number'?new Date(v).toISOString():v??null;}));
 return {columns:columns.map(c=>c.type==='time'?{...c,type:'timestamp'}:c),rows};
}
async function raw(s,d,sql){
 const query={refId:'A',datasource:{uid:d.uid,type:d.type},rawSql:sql,...TYPES[d.type]==='clickhouse'?{format:1,queryType:'table',editorType:'sql'}:{format:'table'}};
 const r=await client.query(s,{from:'now-1h',to:'now',queries:[query]});
 return frame(r?.results?.A);
}
module.exports={
 id:'grafana',name:'Grafana',
 ready:settings=>client.connected(settings),
 async connections(s){return (await sources(s)).map(d=>({id:d.uid,name:d.name,dialect:TYPES[d.type]}));},
 async schema(s,uid){
  const d=await find(s,uid);
  const r=await raw(s,d,SCHEMA[TYPES[d.type]]);
  const tables=new Map();
  for(const [t,name,type,comment] of r.rows){if(!tables.has(t))tables.set(t,{name:String(t),comment:'',rows:null,columns:[]});tables.get(t).columns.push({name:String(name),type:String(type),comment:String(comment||'')});}
  return {database:d.name,tables:[...tables.values()]};
 },
 async run(s,uid,sql,{maxRows=500}={}){
  const d=await find(s,uid),started=Date.now();
  const r=await raw(s,d,sql);
  return {...r,rows:r.rows.slice(0,maxRows),truncated:r.rows.length>maxRows,elapsedMs:Date.now()-started};
 },
 frame,TYPES
};
