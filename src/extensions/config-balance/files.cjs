// The project's side of «Конфиги и баланс»: game config files and balance tables found in the project folders
// (bounded walk, build/cache folders skipped), read without changing anything.
// Configs: Unity ScriptableObject `.asset` (MonoBehaviour fields, grouped by script), JSON (an array of objects, an
// object of objects, a wrapper with one list, or one object per file), CSV/TSV with an id column.
// Tables: CSV/TSV and XLSX (every sheet). Every config value keeps its file and line.
const fs=require('node:fs/promises');
const path=require('node:path');
const yaml=require('./unity-yaml.cjs');
const xlsx=require('./xlsx.cjs');
const table=require('../google-sheets/table.cjs');

const SKIP=new Set(['node_modules','.git','.svn','Library','Temp','Logs','obj','Build','Builds','build','dist','out','.gradle','.idea','.vs','Pods','DerivedData','PackageCache','vendor','.venv','venv','__pycache__','coverage','intermediates','ProjectSettings','UserSettings','Packages','StreamingAssets~']);
const NOT_CONFIG=/^(?:package(?:-lock)?|packages-lock|tsconfig.*|jsconfig|manifest|composer|appsettings.*|launchSettings|\.?eslintrc|\.?prettierrc|babel\.config|project|settings|[a-z]{2}(?:[-_][A-Za-z]{2,4})?)\.json$/i;
const ID_FIELDS=['id','Id','ID','key','Key','code','uid','name','Name'];
const MAX_FILE=4<<20,MAX_FIELDS=300;

// --- JSON with line numbers --------------------------------------------------------------------------------------
function jsonWithLines(text){
 let i=0,line=1;const s=String(text),lines={};
 const ws=()=>{while(i<s.length){const c=s[i];if(c==='\n'){line++;i++;}else if(c===' '||c==='\t'||c==='\r'||c==='\ufeff')i++;else break;}};
 function str(){const start=i;i++;while(i<s.length&&s[i]!=='"'){if(s[i]==='\\')i++;if(s[i]==='\n')line++;i++;}i++;return JSON.parse(s.slice(start,i));}
 function value(p,depth){
  if(depth>60)throw Error('too deep');
  ws();const c=s[i];
  if(c==='{'){i++;const o={};ws();if(s[i]==='}'){i++;return o;}
   for(;;){ws();const k=str();ws();if(s[i]!==':')throw Error('JSON: ожидалось «:»');i++;o[k]=value(p?p+'.'+k:k,depth+1);ws();if(s[i]===','){i++;continue;}if(s[i]==='}'){i++;return o;}throw Error('JSON повреждён');}}
  if(c==='['){i++;const a=[];ws();if(s[i]===']'){i++;return a;}
   for(;;){a.push(value(p+'['+a.length+']',depth+1));ws();if(s[i]===','){i++;continue;}if(s[i]===']'){i++;return a;}throw Error('JSON повреждён');}}
  lines[p]=line;
  if(c==='"')return str();
  const m=/^(?:-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null)/.exec(s.slice(i,i+64));if(!m)throw Error('JSON повреждён');
  i+=m[0].length;return JSON.parse(m[0]);
 }
 const v=value('',0);ws();if(i<s.length)throw Error('JSON повреждён');
 return {value:v,lines};
}

// --- Flattening: nested fields become paths («stats.hp», «levels[1].cost»); Unity references stay objects -----------
function flatten(value,prefix='',out={}){
 if(Object.keys(out).length>=MAX_FIELDS)return out;
 if(yaml.isRef(value)){out[prefix]={ref:true,fileID:value.fileID,guid:String(value.guid||'')};return out;}
 if(Array.isArray(value)){if(value.every(v=>v===null||typeof v!=='object')){out[prefix]=value.slice(0,50);return out;}value.slice(0,50).forEach((v,i)=>flatten(v,prefix+'['+i+']',out));return out;}
 if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))flatten(v,prefix?prefix+'.'+k:k,out);return out;}
 out[prefix]=value;return out;
}
const sub=(lines,prefix)=>{if(!prefix)return lines;const out={};for(const [k,v] of Object.entries(lines))if(k===prefix||k.startsWith(prefix+'.')||k.startsWith(prefix+'['))out[k.slice(prefix.length).replace(/^\./,'')]=v;return out;};
function idOf(fields,fallback){for(const k of ID_FIELDS){const v=fields[k];if((typeof v==='string'&&v.trim())||typeof v==='number')return String(v);}return fallback;}

// --- CSV -------------------------------------------------------------------------------------------------------------
function csv(text){
 const t=String(text).replace(/^\ufeff/,'');
 const first=t.split('\n',1)[0];
 const delim=[['\t',(first.match(/\t/g)||[]).length],[';',(first.match(/;/g)||[]).length],[',',(first.match(/,/g)||[]).length]].sort((a,b)=>b[1]-a[1])[0][0];
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<t.length;i++){
  const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
  if(c==='"'&&cell==='')q=true;
  else if(c===delim){row.push(cell);cell='';}
  else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
  if(rows.length>20000)break;
 }
 if(cell!==''||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 return rows;
}
const NUM=/^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
const typed=v=>typeof v==='string'&&NUM.test(v.trim())?Number(v.trim().replace(',','.')):v;
// rows (values) → the shape the card and matcher use: text, numbers, header.
function shape(rows){
 const width=Math.min(100,Math.max(0,...rows.map(r=>r.length)));
 const text=rows.map(r=>Array.from({length:width},(_,i)=>r[i]===undefined||r[i]===null?'':typeof r[i]==='number'?String(r[i]):String(r[i])));
 const numbers=rows.map(r=>Array.from({length:width},(_,i)=>{const v=typed(r[i]);return typeof v==='number'&&Number.isFinite(v)?v:null;}));
 const g=table.grid(text,numbers.map((r,y)=>r.map((n,x)=>n??text[y][x])),{rows:5000,cols:100});
 return {text:g.text,numbers:g.numbers,header:table.header(g.text,g.numbers)};
}

// --- Config files -----------------------------------------------------------------------------------------------------
function jsonObjects(text,rel){
 const {value,lines}=jsonWithLines(text);
 const base=path.basename(rel).replace(/\.json$/i,'');
 const make=(obj,prefix,fallback)=>{const fields=flatten(obj);return {id:idOf(fields,fallback),name:String(fields.name??fields.Name??fields.displayName??''),fields,lines:sub(lines,prefix),prefix};};
 const objs=v=>Array.isArray(v)&&v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x));
 if(objs(value))return value.map((o,i)=>make(o,'['+i+']',base+'['+i+']'));
 if(value&&typeof value==='object'){
  const lists=Object.entries(value).filter(([,v])=>objs(v));
  if(lists.length===1&&Object.keys(value).length<=3)return lists[0][1].map((o,i)=>make(o,lists[0][0]+'['+i+']',base+'['+i+']'));
  const entries=Object.entries(value);
  if(entries.length>=2&&entries.every(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)))return entries.map(([k,o])=>{const m=make(o,k,k);if(!['id','Id','ID','key'].some(f=>f in o))m.id=k;return m;});
  return [make(value,'',base)];
 }
 return [];
}
function csvObjects(text){
 const s=shape(csv(text));if(s.header<0)return [];
 const head=s.text[s.header];
 const idCol=head.findIndex(h=>/^(?:id|key|code|name)$/i.test(h.trim()));const key=idCol>=0?idCol:0;
 const out=[];
 for(let r=s.header+1;r<s.text.length;r++){
  const fields={},lines={};
  head.forEach((h,c)=>{if(!h)return;fields[h]=s.numbers[r][c]??s.text[r][c];lines[h]=r+1;});
  out.push({id:String(s.text[r][key]||'row'+(r+1)),name:'',fields,lines,row:r});
 }
 return out;
}
const hasNumbers=list=>list.some(o=>Object.values(o.fields).some(v=>typeof v==='number'));

async function walk(roots,{depth=10,dirs=8000}={}){
 const files=[];let visited=0;const queue=roots.map(r=>({dir:r,level:0,root:r}));
 while(queue.length&&visited<dirs){
  const {dir,level,root}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(level<depth&&!SKIP.has(item.name)&&!item.name.startsWith('.'))queue.push({dir:full,level:level+1,root});}
   else if(item.isFile())files.push({full,root,name:item.name});
   if(files.length>60000)return files;
  }
 }
 return files;
}
async function head(file,n=4096){const h=await fs.open(file,'r');try{const b=Buffer.alloc(n);const {bytesRead}=await h.read(b,0,n,0);return b.subarray(0,bytesRead).toString('utf8');}finally{await h.close();}}
async function small(file,limit=MAX_FILE){const st=await fs.stat(file);if(st.size>limit)return null;return fs.readFile(file);}

// Parses one config file (also used for old versions from git): → [{id, name, fields, lines}] or null.
function parseConfig(rel,text){
 try{
  if(/\.asset$/i.test(rel)){
   const list=yaml.scriptables(text);
   return list.map(o=>{const fields=flatten(o.fields);return {id:idOf(fields,o.name||path.basename(rel,'.asset')),name:o.name,fields,lines:o.lines,script:o.script};});
  }
  if(/\.json$/i.test(rel))return jsonObjects(text,rel);
  if(/\.[ct]sv$/i.test(rel))return csvObjects(text);
 }catch{return null;}
 return null;
}

// The whole scan: config sets and tables, plus the script names of `.cs.meta` (class names for asset sets).
async function scan(roots,{assets=5000}={}){
 const all=await walk(roots);
 const rel=f=>path.relative(f.root,f.full).split(path.sep).join('/');
 const scripts=new Map();
 for(const f of all.filter(f=>f.name.endsWith('.cs.meta')).slice(0,8000)){try{const g=/guid:\s*([0-9a-f]{32})/.exec(await head(f.full,400))?.[1];if(g)scripts.set(g,f.name.replace(/\.cs\.meta$/,''));}catch{/* unreadable meta */}}
 const sets=new Map(),tables=[];
 const add=(id,label,kind,file,objects,root)=>{if(!sets.has(id))sets.set(id,{id,label,kind,root,files:[],objects:[]});const s=sets.get(id);if(!s.files.includes(file))s.files.push(file);for(const o of objects)s.objects.push({...o,file});};
 let assetCount=0;
 for(const f of all){
  const r=rel(f),lower=f.name.toLowerCase();
  try{
   if(lower.endsWith('.asset')){
    if(++assetCount>assets)continue;
    const h=await head(f.full);if(!/MonoBehaviour:/.test(h)||/m_SharedData:|m_TableCollectionName:/.test(h))continue;
    const buf=await small(f.full);if(!buf)continue;
    const objects=parseConfig(r,buf.toString('utf8'));if(!objects?.length||!hasNumbers(objects))continue;
    const guid=objects[0].script||'none';
    add('asset:'+guid,(scripts.get(guid)||'ScriptableObject')+' · '+path.posix.dirname(r),'asset',r,objects,f.root);
   }else if(lower.endsWith('.json')&&!NOT_CONFIG.test(f.name)){
    const buf=await small(f.full,2<<20);if(!buf)continue;
    const objects=parseConfig(r,buf.toString('utf8'));if(!objects?.length||!hasNumbers(objects))continue;
    if(objects.length===1)add('json-dir:'+path.posix.dirname(r),path.posix.dirname(r)+'/*.json','json',r,objects,f.root);
    else add('json:'+r,r,'json',r,objects,f.root);
   }else if(/\.(?:csv|tsv)$/.test(lower)){
    const buf=await small(f.full);if(!buf)continue;const text=buf.toString('utf8');
    // A CSV named or kept as a balance table is the table, not a config.
    const objects=/balance|баланс/i.test(r)?null:parseConfig(r,text);if(objects?.length&&hasNumbers(objects))add('csv:'+r,r,'csv',r,objects,f.root);
    tables.push({id:'file:'+r,label:r,source:{type:'file',path:r,root:f.root},...shape(csv(text))});
   }else if(lower.endsWith('.xlsx')){
    const buf=await small(f.full,20<<20);if(!buf)continue;
    for(const sh of xlsx.sheets(buf))tables.push({id:'file:'+r+'#'+sh.name,label:r+' · '+sh.name,source:{type:'file',path:r,sheet:sh.name,root:f.root},...shape(sh.rows)});
   }
  }catch{/* a broken file is skipped */}
 }
 return {sets:[...sets.values()],tables:tables.filter(t=>t.header>=0&&t.text.length>t.header+1),roots,metaFiles:all.filter(f=>f.name.endsWith('.meta')).map(f=>f.full)};
}
// Every asset guid in the project (from .meta files), for dangling-reference checks.
async function guids(metaFiles,{limit=40000}={}){
 const out=new Set();
 for(const f of metaFiles.slice(0,limit)){try{const g=/guid:\s*([0-9a-f]{32})/.exec(await head(f,300))?.[1];if(g)out.add(g);}catch{/* unreadable */}}
 return out;
}
module.exports={scan,guids,parseConfig,jsonWithLines,flatten,csv,shape,walk};
