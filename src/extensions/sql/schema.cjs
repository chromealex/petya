// «SQL по словам», schemas: tables, columns, types and comments of each connection, read once and cached for a day
// in memory and in the company's data folder (<company>/extensions/sql/schema-<id>.json; names only, no data, no
// secrets). The model sees the schema as compact text; a large schema is cut to the tables the question is closest to.
const fs=require('node:fs');
const path=require('node:path');
const DAY=86400000;
const memory=new Map();

const file=(root,id)=>path.join(root,'extensions','sql','schema-'+String(id).replace(/[^a-z0-9-]/gi,'')+'.json');
function cached(root,id,{now=Date.now(),maxAge=DAY}={}){
 const hit=memory.get(id);if(hit&&now-hit.at<maxAge)return hit;
 if(!root)return null;
 try{const d=JSON.parse(fs.readFileSync(file(root,id),'utf8'));if(d&&Array.isArray(d.tables)&&now-d.at<maxAge){memory.set(id,d);return d;}}catch{/* not cached yet */}
 return null;
}
function store(root,id,schema,{now=Date.now()}={}){
 const d={...schema,at:now};memory.set(id,d);
 if(root)try{const f=file(root,id);fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});fs.writeFileSync(f+'.tmp',JSON.stringify(d),{mode:0o600});fs.renameSync(f+'.tmp',f);}catch{/* memory only */}
 return d;
}
function forget(root,id){memory.delete(id);if(root)try{fs.rmSync(file(root,id),{force:true});}catch{/* gone */}}

// Words of a question in a form that meets table and column names: lower case, «ё» → «е», short stems, and English
// names for common game-analytics words (игрок → player/user, платёж → payment/purchase …).
const DICT={игрок:['player','user','users','players','account'],пользовател:['user','users','account'],юзер:['user','users'],платеж:['payment','payments','purchase','revenue','transaction','order'],
 платёж:['payment','payments','purchase','revenue'],покупк:['purchase','order','payment','iap'],транзакц:['transaction','payment'],заказ:['order'],стран:['country','geo','region'],
 уровн:['level','lvl','stage'],уровен:['level','lvl'],событ:['event','events'],ивент:['event','events'],сесси:['session','sessions'],матч:['match','matches','game','battle'],
 бо:['battle','match'],устройств:['device','platform'],регистрац:['install','registration','signup','created','first'],установ:['install','installs'],дат:['date','day','time','timestamp'],
 день:['date','day'],недел:['week','date'],выручк:['revenue','amount','price'],сумм:['amount','sum','price','value'],клиент:['client','customer','user'],версия:['version','app_version'],
 верси:['version','app_version'],платформ:['platform','os']};
function words(text){
 const out=new Set();
 for(const raw of String(text||'').toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}_]+/gu)||[]){
  if(raw.length<2)continue;
  out.add(raw);if(/[а-я]/.test(raw)&&raw.length>4)out.add(raw.slice(0,Math.max(4,raw.length-2)));
  for(const [stem,list] of Object.entries(DICT))if(raw.startsWith(stem))list.forEach(w=>out.add(w));
 }
 return [...out];
}
function score(table,terms){
 const name=table.name.toLowerCase(),cols=table.columns.map(c=>c.name.toLowerCase()),comments=(table.comment+' '+table.columns.map(c=>c.comment).join(' ')).toLowerCase();
 let n=0;
 for(const t of terms){
  if(name.includes(t))n+=4;
  if(cols.some(c=>c===t))n+=3;else if(t.length>=3&&cols.some(c=>c.includes(t)))n+=1.5;
  if(t.length>=4&&comments.includes(t))n+=1;
 }
 return n;
}
// The schema as the model reads it: «table (rows ≈N) -- comment\n  column TYPE -- comment». At most `budget` characters,
// the closest tables first; tables cut entirely are listed by name at the end.
function compact(schema,question,{budget=12000}={}){
 const terms=words(question);
 const ranked=schema.tables.map((t,i)=>({t,i,s:score(t,terms)})).sort((a,b)=>b.s-a.s||a.i-b.i);
 const lines=[],left=[];let used=0;
 for(const {t} of ranked){
  const head=t.name+(t.rows!==null&&t.rows!==undefined?' (≈'+t.rows+' строк)':'')+(t.comment?' -- '+t.comment.slice(0,160):'');
  const cols=t.columns.slice(0,120).map(c=>'  '+c.name+' '+c.type+(c.comment?' -- '+c.comment.slice(0,100):''));
  const block=[head,...cols].join('\n');
  if(used+block.length>budget&&lines.length){left.push(t.name);continue;}
  lines.push(block);used+=block.length+1;
 }
 return lines.join('\n')+(left.length?'\nЕщё таблицы (без столбцов): '+left.slice(0,200).join(', '):'');
}
// A table the text names («схема таблицы events», «что в public.orders»), by exact name, then by its last part.
function find(schema,text){
 const t=' '+String(text||'').toLowerCase().replace(/[«»"'`]/g,' ')+' ';
 const tables=[...schema.tables].sort((a,b)=>b.name.length-a.name.length);
 const re=name=>new RegExp('(?:^|[^\\p{L}\\p{N}_.])'+name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}_])','u');
 return tables.find(x=>re(x.name).test(t))||tables.find(x=>x.name.includes('.')&&re(x.name.split('.').pop()).test(t))||null;
}
// Whether every table a query reads exists in the schema (by full or last name; BigQuery wildcard tables match their
// prefix). Returns the unknown names.
function unknown(schema,refs){
 const names=new Set(schema.tables.map(t=>t.name.toLowerCase())),last=new Set(schema.tables.map(t=>t.name.toLowerCase().split('.').pop()));
 const wild=schema.tables.filter(t=>t.name.endsWith('*')).map(t=>t.name.slice(0,-1).toLowerCase());
 return refs.filter(r=>{
  const full=r.parts.join('.').toLowerCase(),name=r.name.toLowerCase();
  if(names.has(full)||names.has(name)||last.has(name))return false;
  if(r.parts.length>=2&&['system','information_schema','pg_catalog'].includes(r.parts.at(-2).toLowerCase()))return false;
  if(name==='information_schema'||wild.some(w=>name.startsWith(w)||name.replace(/\*$/,'').startsWith(w)))return false;
  return true;
 }).map(r=>r.parts.join('.'));
}
module.exports={cached,store,forget,compact,find,unknown,words,score,DAY,file};
