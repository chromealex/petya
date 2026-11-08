// Grafana dashboard JSON → what Petya can run and draw. Pure functions, no network:
// - panels in reading order (rows, collapsed rows, the legacy `rows` schema), library panels merged by the caller;
// - templating variables: the current values, a pasted link's var-x, or an option named in the request; `$__all`;
//   interpolation of $x, ${x}, ${x:format}, [[x]] in the panel's targets;
// - time: Grafana's relative times (now-7d, now/d, now-1d/d), epoch ms, the panel's timeFrom / timeShift;
// - the /api/ds/query requests of a panel (datasource refs incl. a datasource variable, mixed datasources,
//   expressions), and the returned data frames → series / stat values / bars / table rows with units, decimals and
//   threshold colors from the panel's fieldConfig.
const DAY=86400000;
const UNIT_MS={s:1000,m:60000,h:3600000,d:DAY,w:7*DAY,M:30*DAY,y:365*DAY};

// --- Panels -------------------------------------------------------------------------------------------------
function panels(dashboard){
 const out=[];
 const add=(p,row)=>{if(!p||typeof p!=='object')return;if(p.type==='row'){for(const c of p.panels||[])add(c,p.title||'');return;}out.push({...p,row:row||''});};
 const y=p=>Number(p.gridPos?.y)||0,x=p=>Number(p.gridPos?.x)||0;
 if(Array.isArray(dashboard?.panels)){
  // An expanded row owns the panels below it up to the next row (by position); a collapsed row keeps its own.
  let row='';
  for(const p of dashboard.panels.filter(p=>p&&typeof p==='object').sort((a,b)=>y(a)-y(b)||x(a)-x(b))){if(p.type==='row'){row=String(p.title||'');for(const c of p.panels||[])add(c,row);continue;}add(p,row);}
 }
 // Schema before Grafana 5: dashboard.rows[].panels without gridPos.
 if(Array.isArray(dashboard?.rows))dashboard.rows.forEach((r,i)=>(r.panels||[]).forEach((p,j)=>add({...p,gridPos:p.gridPos||{x:j*6,y:i*10,w:p.span?p.span*2:12,h:8}},r.title||'')));
 return out.filter(p=>Number.isFinite(Number(p.id))).sort((a,b)=>y(a)-y(b)||x(a)-x(b));
}

// --- Variables ----------------------------------------------------------------------------------------------
const ALL='$__all';
const arr=v=>v===undefined||v===null?[]:Array.isArray(v)?v:[v];
const norm=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const escapeRe=s=>String(s).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&');

// The value of each dashboard variable: a link's var-x wins, then an option named in the request, then the
// dashboard's saved current value. `all` lists the real values `$__all` stands for.
function variables(dashboard,{link={},text=''}={}){
 const list=Array.isArray(dashboard?.templating?.list)?dashboard.templating.list:[];
 const words=norm(text);
 const out=[];
 for(const v of list){
  if(!v||!/^[\w-]{1,64}$/.test(String(v.name||'')))continue;
  const options=(Array.isArray(v.options)?v.options:[]).map(o=>({text:String(o?.text??o?.value??''),value:String(o?.value??o?.text??'')})).filter(o=>o.value!=='');
  if(v.type==='custom'&&!options.length&&typeof v.query==='string')for(const part of v.query.split(/,(?![^{]*})/)){const m=part.trim().match(/^(.*?)\s*:\s*(.*)$/);const o=m&&!/^https?$/.test(m[1])?{text:m[1],value:m[2]}:{text:part.trim(),value:part.trim()};if(o.value)options.push(o);}
  let value=arr(v.current?.value).map(String),label=arr(v.current?.text).map(String),from='dashboard';
  if(v.type==='constant'){value=[String(v.query??value[0]??'')];label=value;}
  if(link[v.name]?.length){value=link[v.name].map(String);label=value.map(x=>options.find(o=>o.value===x)?.text||x);from='link';}
  else if(words&&v.type!=='constant'&&v.type!=='datasource'&&v.type!=='interval'&&!v.hide){
   // An option named in the request («лиги gold»): whole words only, at least 2 letters, not a number alone.
   const named=options.filter(o=>o.value!==ALL&&o.text.length>=2&&!/^\d+$/.test(o.text)&&new RegExp('(?:^|[^\\p{L}\\p{N}_])'+escapeRe(norm(o.text))+'(?![\\p{L}\\p{N}_])','u').test(words));
   if(named.length){const pick=v.multi?named:[named.sort((a,b)=>b.text.length-a.text.length)[0]];value=pick.map(o=>o.value);label=pick.map(o=>o.text);from='request';}
  }
  const all=value.includes(ALL);
  const real=all?(v.allValue?[String(v.allValue)]:options.map(o=>o.value).filter(x=>x!==ALL)):value;
  out.push({name:String(v.name),label:String(v.label||v.name).slice(0,60),type:String(v.type||''),multi:!!v.multi,includeAll:!!v.includeAll,hide:Number(v.hide)||0,all,raw:all&&!!v.allValue,
   value,text:all?['Все']:(label.length?label:value),values:real,options:options.slice(0,50),from,regex:typeof v.regex==='string'?v.regex:''});
 }
 return out;
}

// Multi-value formats (Grafana «Advanced variable format options»).
function format(values,fmt,dsType,raw,multi=values.length>1){
 const list=values.map(String);
 const quote=(q,x)=>q+x.replace(new RegExp(q,'g'),q==="'"?"''":'\\'+q)+q;
 switch(fmt){
  case 'csv':return list.join(',');
  case 'pipe':return list.join('|');
  case 'raw':return list.join(',');
  case 'json':return JSON.stringify(list);
  case 'regex':return list.length>1?'('+list.map(escapeRe).join('|')+')':escapeRe(list[0]||'');
  case 'singlequote':return list.map(x=>quote("'",x)).join(',');
  case 'doublequote':return list.map(x=>quote('"',x)).join(',');
  case 'sqlstring':return list.map(x=>"'"+x.replace(/'/g,"''")+"'").join(',');
  case 'distributed':return list.join(',');
  case 'text':return list.join(' + ');
  case 'queryparam':return list.map(x=>encodeURIComponent(x)).join('&');
  case 'lucene':return list.length>1?'('+list.map(x=>'"'+x.replace(/"/g,'\\"')+'"').join(' OR ')+')':list[0]||'';
  case 'glob':return list.length>1?'{'+list.join(',')+'}':list[0]||'';
 }
 if(raw)return list.join(',');
 // Defaults per datasource, as the datasources' own interpolation does: a single-value variable (not multi, no
 // «All») goes in as written; a multi-value one as a regex group, a quoted SQL list, a Lucene OR or a glob.
 if(!multi&&list.length<=1)return /mysql|postgres|mssql|clickhouse|bigquery|snowflake|athena|redshift|vertica|trino|databricks/.test(dsType||'')?(list[0]||'').replace(/'/g,"''"):list[0]||'';
 if(/prometheus|loki|tempo/.test(dsType||''))return list.length>1?'('+list.map(escapeRe).join('|')+')':escapeRe(list[0]||'').replace(/\\\//g,'/');
 if(/mysql|postgres|grafana-postgresql|mssql|clickhouse|bigquery|snowflake|athena|redshift|vertica|trino|databricks/.test(dsType||''))return list.map(x=>/^-?\d+(\.\d+)?$/.test(x)?x:"'"+x.replace(/'/g,"''")+"'").join(',');
 if(/elasticsearch|opensearch/.test(dsType||''))return list.length>1?'('+list.map(x=>'"'+x+'"').join(' OR ')+')':list[0]||'';
 if(/influx/.test(dsType||''))return list.length>1?'('+list.map(escapeRe).join('|')+')':escapeRe(list[0]||'');
 return list.length>1?'{'+list.join(',')+'}':list[0]||'';
}
// Builtins the frontend fills in itself (the backend handles $__interval, $__rate_interval, $__timeFilter …).
function interpolate(text,vars,{dsType,range,intervalMs,dashboard}={}){
 if(typeof text!=='string'||!text.includes('$')&&!text.includes('[['))return text;
 const by=new Map(vars.map(v=>[v.name,v]));
 const builtins={__from:range?String(range.from):null,__to:range?String(range.to):null,__dashboard:dashboard||null,__interval_ms:intervalMs?String(intervalMs):null};
 const one=(name,fmt,whole)=>{
  if(Object.prototype.hasOwnProperty.call(builtins,name)&&builtins[name]!==null)return builtins[name];
  const v=by.get(name);if(!v)return whole;
  if(v.type==='interval'&&/^(?:\$__)?auto/.test(v.values[0]||''))return intervalText(intervalMs||60000);
  return format(v.values,fmt,dsType,v.raw,v.multi||v.includeAll||v.values.length>1);
 };
 return text.replace(/\$\{([\w-]+)(?::([\w]+))?\}|\[\[([\w-]+)(?::([\w]+))?\]\]|\$([A-Za-z_][\w]*)/g,(whole,a,af,b,bf,c)=>one(a||b||c,af||bf||'',whole));
}
const interpolateDeep=(value,vars,opt)=>typeof value==='string'?interpolate(value,vars,opt):Array.isArray(value)?value.map(x=>interpolateDeep(x,vars,opt)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,x])=>[k,k==='datasource'||k==='refId'?x:interpolateDeep(x,vars,opt)])):value;

// --- Time -------------------------------------------------------------------------------------------------
function startOf(ms,unit,end){
 const d=new Date(ms);
 if(unit==='d')d.setHours(0,0,0,0);
 else if(unit==='h')d.setMinutes(0,0,0);
 else if(unit==='m')d.setSeconds(0,0);
 else if(unit==='w'){const k=(d.getDay()+6)%7;d.setDate(d.getDate()-k);d.setHours(0,0,0,0);}
 else if(unit==='M'){d.setDate(1);d.setHours(0,0,0,0);}
 else if(unit==='y'){d.setMonth(0,1);d.setHours(0,0,0,0);}
 if(!end)return d.getTime();
 if(unit==='d')d.setDate(d.getDate()+1);else if(unit==='h')d.setHours(d.getHours()+1);else if(unit==='m')d.setMinutes(d.getMinutes()+1);
 else if(unit==='w')d.setDate(d.getDate()+7);else if(unit==='M')d.setMonth(d.getMonth()+1);else if(unit==='y')d.setFullYear(d.getFullYear()+1);
 return d.getTime()-1;
}
// now, now-7d, now-1d/d, now/w, epoch ms, ISO date. Returns ms or null.
function time(raw,now,end=false){
 const t=String(raw??'').trim();
 if(/^\d{10,13}$/.test(t))return t.length===10?Number(t)*1000:Number(t);
 const m=t.match(/^now((?:[+-]\d+[smhdwMy])*)(?:\/([smhdwMy]))?$/);
 if(m){
  let ms=now;
  for(const [,sign,n,u] of m[1].matchAll(/([+-])(\d+)([smhdwMy])/g)){
   if(u==='M'||u==='y'){const d=new Date(ms);if(u==='M')d.setMonth(d.getMonth()+(sign==='-'?-1:1)*Number(n));else d.setFullYear(d.getFullYear()+(sign==='-'?-1:1)*Number(n));ms=d.getTime();}
   else ms+=(sign==='-'?-1:1)*Number(n)*UNIT_MS[u];
  }
  return m[2]?startOf(ms,m[2],end):ms;
 }
 const iso=Date.parse(t);return Number.isFinite(iso)&&/^\d{4}-\d{2}-\d{2}/.test(t)?iso:null;
}
const duration=t=>{const m=String(t||'').trim().match(/^>?(\d+(?:\.\d+)?)(ms|s|m|h|d|w|M|y)$/);return m?Number(m[1])*(m[2]==='ms'?1:UNIT_MS[m[2]]):null;};
// The time range of a panel: the dashboard's (or a link's / the request's) range, then the panel's relative time
// (timeFrom «7d» = the last 7 days) and time shift.
function range({from='now-6h',to='now'}={},now=Date.now(),panel={}){
 let a=time(from,now,false),b=time(to,now,true);
 if(a===null||b===null){a=now-6*3600000;b=now;}
 const rel=duration(String(panel.timeFrom||'').replace(/^now-/,''));
 // Grafana: a panel's relative time means «the last <timeFrom> up to now», whatever the dashboard range is.
 if(rel){b=now;a=now-rel;}
 const shift=duration(String(panel.timeShift||'').replace(/^now-/,''));
 if(shift){a-=shift;b-=shift;}
 return {from:Math.round(a),to:Math.round(b),raw:{from:String(from),to:String(to)},panel:rel||shift?{timeFrom:panel.timeFrom||'',timeShift:panel.timeShift||''}:null};
}
// Grafana's interval rounding (kbn.roundInterval, simplified): the nearest «nice» step at or above the raw one.
const STEPS=[1000,2000,5000,10000,15000,30000,60000,120000,300000,600000,900000,1800000,3600000,7200000,10800000,21600000,43200000,DAY,7*DAY,30*DAY,365*DAY];
function interval(r,maxDataPoints=300,min){
 const raw=Math.max(1,(r.to-r.from)/Math.max(1,maxDataPoints));
 const step=STEPS.find(x=>x>=raw)||STEPS.at(-1);
 return Math.max(step,duration(min)||0);
}
const intervalText=ms=>{for(const [u,k] of [['y',365*DAY],['w',7*DAY],['d',DAY],['h',3600000],['m',60000],['s',1000]])if(ms%k===0&&ms>=k)return ms/k+u;return ms+'ms';};

// --- Queries ----------------------------------------------------------------------------------------------
const MIXED='-- Mixed --',DASHBOARD='-- Dashboard --';
// A datasource ref → {uid, type}. `lookup(name|null)` resolves a legacy name or the default datasource (from
// /api/frontend/settings); a datasource variable is read from the dashboard variables first.
async function datasource(ref,vars,lookup){
 let r=ref;
 if(typeof r==='string'){
  const v=r.match(/^\$\{?([\w-]+)\}?$/);
  if(v){const x=vars.find(y=>y.name===v[1]);r=x?(x.values[0]||null):r;}
  if(r===MIXED)return {uid:MIXED,type:'mixed'};
  if(r===DASHBOARD)return {uid:DASHBOARD,type:'dashboard'};
  if(typeof r==='string'){const hit=await lookup(r);return hit||{uid:r,type:''};}
 }
 if(r&&typeof r==='object'){
  let uid=String(r.uid||'');
  const v=uid.match(/^\$\{?([\w-]+)\}?$/);
  if(v){const x=vars.find(y=>y.name===v[1]);const val=x?.values[0]||'';const hit=val?await lookup(val,true):null;return hit||{uid:val,type:String(r.type||'')};}
  if(uid)return {uid,type:String(r.type||'')};
 }
 return await lookup(null)||null;
}

// The /api/ds/query requests of a panel: one per datasource (Grafana refuses several datasources in one request
// unless server-side expressions join them; then everything goes in one request).
async function requests(panel,{vars,range:r,lookup,maxDataPoints=300,dashboard}){
 const ms=interval(r,panel.maxDataPoints||maxDataPoints,panel.interval);
 const panelDs=await datasource(panel.datasource,vars,lookup);
 if(panelDs?.uid===DASHBOARD)throw Error('Панель берёт данные другой панели (источник «-- Dashboard --»).');
 const queries=[];
 for(const t of Array.isArray(panel.targets)?panel.targets:[]){
  if(!t||t.hide===true)continue;
  let ds=t.datasource&&(typeof t.datasource==='string'||t.datasource.uid)?await datasource(t.datasource,vars,lookup):panelDs;
  if(!ds||ds.uid===MIXED)ds=panelDs&&panelDs.uid!==MIXED?panelDs:await lookup(null);
  if(!ds)throw Error('Не удалось определить источник данных панели.');
  const expr=ds.uid==='__expr__'||ds.type==='__expr__';
  const q=interpolateDeep({...t},vars,{dsType:ds.type,range:r,intervalMs:ms,dashboard});
  queries.push({...q,refId:String(t.refId||String.fromCharCode(65+queries.length)),datasource:expr?{type:'__expr__',uid:'__expr__',name:'Expression'}:{uid:ds.uid,...ds.type?{type:ds.type}:{}},intervalMs:ms,maxDataPoints:panel.maxDataPoints||maxDataPoints});
 }
 if(!queries.length)return [];
 if(queries.some(q=>q.datasource.uid==='__expr__'))return [{from:r.from,to:r.to,queries}];
 const groups=new Map();for(const q of queries){const k=q.datasource.uid;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(q);}
 return [...groups.values()].map(list=>({from:r.from,to:r.to,queries:list}));
}

// --- Frames -----------------------------------------------------------------------------------------------
// results[refId].frames[] → {refId, name, fields:[{name, type, labels, config, values}]}. A refId with an error
// becomes an error entry; the panel shows the error, other refIds still draw.
function frames(response,hidden=new Set()){
 const out=[],errors=[];
 for(const [refId,res] of Object.entries(response?.results||{})){
  if(hidden.has(refId))continue;
  if(res?.error){errors.push({refId,error:String(res.error).slice(0,300)});continue;}
  for(const f of Array.isArray(res?.frames)?res.frames:[]){
   const fields=Array.isArray(f?.schema?.fields)?f.schema.fields:[],values=Array.isArray(f?.data?.values)?f.data.values:[];
   out.push({refId,name:String(f?.schema?.name||''),meta:f?.schema?.meta||{},fields:fields.map((x,i)=>({name:String(x?.name||''),type:String(x?.type||''),labels:x?.labels&&typeof x.labels==='object'?x.labels:null,config:x?.config&&typeof x.config==='object'?x.config:{},values:Array.isArray(values[i])?values[i]:[]}))});
  }
 }
 return {frames:out,errors};
}
const isTime=f=>f.type==='time';
const isNumber=f=>f.type==='number'||(!f.type&&f.values.some(v=>typeof v==='number'));
const labelText=labels=>{const e=Object.entries(labels||{});return e.length===1?String(e[0][1]):e.map(([k,v])=>k+'='+v).join(', ');};
// The name Grafana shows for a field (simplified getFieldDisplayName).
function fieldName(field,frame,multipleFrames){
 const c=field.config||{};
 if(c.displayNameFromDS)return String(c.displayNameFromDS);
 if(c.displayName)return String(c.displayName);
 if(field.labels&&Object.keys(field.labels).length){const l=labelText(field.labels);return /^value$/i.test(field.name)||!field.name?l:field.name+' '+l;}
 if(/^value$/i.test(field.name)||!field.name)return frame.name||(multipleFrames?frame.refId:'')||field.name||frame.refId;
 return multipleFrames&&frame.name&&frame.name!==field.name?frame.name+' '+field.name:field.name;
}
// SQL long format (time, a string column, a value) → one series per string value, as Grafana's prepareTimeSeries does.
function wide(frame){
 const time=frame.fields.find(isTime),strings=frame.fields.filter(f=>f.type==='string'),nums=frame.fields.filter(f=>isNumber(f)&&!isTime(f));
 if(!time||!strings.length||!nums.length)return [frame];
 const groups=new Map();
 time.values.forEach((t,i)=>{const key=strings.map(s=>String(s.values[i]??'')).join(' ');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 return [...groups].map(([key,idx])=>({...frame,name:key,fields:[{...time,values:idx.map(i=>time.values[i])},...nums.map(n=>({...n,labels:{...n.labels,...Object.fromEntries(strings.map(s=>[s.name,String(s.values[idx[0]]??'')]))},config:{...n.config,displayNameFromDS:n.config.displayNameFromDS||(nums.length>1?key+' '+n.name:key)},values:idx.map(i=>n.values[i])}))]}));
}

// --- Field config: units, decimals, thresholds, colors ----------------------------------------------------
const COLORS={green:'#73bf69','dark-green':'#37872d','semi-dark-green':'#56a64b','light-green':'#96d98d','super-light-green':'#c8f2c2',
 red:'#f2495c','dark-red':'#c4162a','semi-dark-red':'#e02f44','light-red':'#ff7383','super-light-red':'#ffa6b0',
 orange:'#ff9830','dark-orange':'#fa6400','semi-dark-orange':'#ff780a','light-orange':'#ffb357','super-light-orange':'#ffcb7d',
 yellow:'#fade2a','dark-yellow':'#e0b400','semi-dark-yellow':'#f2cc0c','light-yellow':'#ffee52','super-light-yellow':'#fff899',
 blue:'#5794f2','dark-blue':'#1f60c4','semi-dark-blue':'#3274d9','light-blue':'#8ab8ff','super-light-blue':'#c0d8ff',
 purple:'#b877d9','dark-purple':'#8f3bb8','semi-dark-purple':'#a352cc','light-purple':'#ca95e5','super-light-purple':'#deb6f2',
 '#299c46':'#73bf69','rgba(237, 129, 40, 0.89)':'#ff9830','#d44a3a':'#f2495c'};
function color(name){
 const c=String(name||'').trim().toLowerCase();
 if(!c||c==='text'||c==='transparent')return null;
 if(COLORS[c])return COLORS[c];
 if(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/.test(c))return c;
 const m=c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/);
 if(m)return '#'+m.slice(1,4).map(x=>Math.min(255,Number(x)).toString(16).padStart(2,'0')).join('');
 return null;
}
// The panel's fieldConfig for one field: defaults, then overrides matched by name / regex / refId.
function config(panel,name,refId){
 const d=panel?.fieldConfig?.defaults||{};
 const out={unit:d.unit,decimals:d.decimals,min:d.min,max:d.max,thresholds:d.thresholds,color:d.color,displayName:d.displayName,mappings:d.mappings};
 for(const o of Array.isArray(panel?.fieldConfig?.overrides)?panel.fieldConfig.overrides:[]){
  const m=o?.matcher||{};let hit=false;
  try{hit=m.id==='byName'&&m.options===name||m.id==='byRegexp'&&new RegExp(m.options).test(name)||m.id==='byFrameRefID'&&m.options===refId;}catch{hit=false;}
  if(!hit)continue;
  for(const p of o.properties||[]){
   const k={unit:'unit',decimals:'decimals',min:'min',max:'max',thresholds:'thresholds',color:'color',displayName:'displayName',mappings:'mappings'}[p?.id];
   if(k)out[k]=p.value;
  }
 }
 return out;
}
function unitOf(c){const u=String(c.unit||'').slice(0,40);return /^[\w:./%$€£₽-]*$/.test(u)?u:'';}
const decimalsOf=c=>Number.isInteger(c.decimals)&&c.decimals>=0&&c.decimals<=10?c.decimals:null;
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
// Threshold steps → the color for a value (absolute or percentage of min..max).
function stepColor(c,value,min,max){
 const steps=Array.isArray(c.thresholds?.steps)?c.thresholds.steps:[];
 if(c.color?.mode==='fixed'&&c.color.fixedColor)return color(c.color.fixedColor);
 if(!steps.length||value===null)return null;
 const pct=c.thresholds?.mode==='percentage';
 const v=pct&&max!==null&&min!==null&&max>min?(value-min)/(max-min)*100:value;
 let pick=steps[0];for(const s of steps){const t=s?.value===null||s?.value===undefined?-Infinity:Number(s.value);if(v>=t)pick=s;}
 return color(pick?.color);
}
const thresholdList=c=>(Array.isArray(c.thresholds?.steps)?c.thresholds.steps:[]).slice(0,10).map(s=>({value:num(s?.value),color:color(s?.color)})).filter(s=>s.color);
// Value mappings of type «value» (e.g. 1 → «Up»): text and color.
function mapped(c,value){
 for(const m of Array.isArray(c.mappings)?c.mappings:[]){
  if(m?.type==='value'&&m.options&&Object.prototype.hasOwnProperty.call(m.options,String(value))){const r=m.options[String(value)]||{};return {text:r.text!==undefined?String(r.text).slice(0,60):null,color:color(r.color)};}
  if(m?.type==='range'&&m.options&&value!==null&&(m.options.from===null||value>=m.options.from)&&(m.options.to===null||value<=m.options.to)){const r=m.options.result||{};return {text:r.text!==undefined?String(r.text).slice(0,60):null,color:color(r.color)};}
 }
 return null;
}

// --- Reducers ---------------------------------------------------------------------------------------------
function reduce(values,calc){
 const nums=values.map(num),known=nums.filter(v=>v!==null);
 switch(calc){
  case 'last':return nums.length?nums.at(-1):null;
  case 'first':return nums.length?nums[0]:null;
  case 'firstNotNull':return known.length?known[0]:null;
  case 'mean':return known.length?known.reduce((a,b)=>a+b,0)/known.length:null;
  case 'sum':return known.reduce((a,b)=>a+b,0);
  case 'max':return known.length?Math.max(...known):null;
  case 'min':return known.length?Math.min(...known):null;
  case 'count':return values.length;
  case 'range':return known.length?Math.max(...known)-Math.min(...known):null;
  case 'delta':{let d=0;for(let i=1;i<known.length;i++){const x=known[i]-known[i-1];d+=x>=0?x:known[i];}return d;}
  case 'diff':return known.length?known.at(-1)-known[0]:null;
  case 'diffperc':return known.length&&known[0]?(known.at(-1)-known[0])/known[0]:null;
  case 'median':{if(!known.length)return null;const s=[...known].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
  default:return known.length?known.at(-1):null;// lastNotNull
 }
}
// At most n points: buckets averaged (keeps the shape of a long range).
function thin(points,n=360){
 if(points.length<=n)return points;
 const out=[],size=points.length/n;
 for(let i=0;i<n;i++){const part=points.slice(Math.floor(i*size),Math.floor((i+1)*size));const vs=part.map(p=>p[1]).filter(v=>v!==null);out.push([part[Math.floor(part.length/2)][0],vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null]);}
 return out;
}

// A stat tile's sparkline: at most 48 numbers.
const sparkline=values=>thin(values.map((v,i)=>[i,v]),48).map(p=>p[1]);

// --- Panel views ------------------------------------------------------------------------------------------
const KIND={timeseries:'timeseries',graph:'timeseries',trend:'timeseries',stat:'stat',singlestat:'stat',gauge:'stat',bargauge:'bars',barchart:'bars',piechart:'bars',table:'table','table-old':'table'};
const kind=type=>KIND[type]||'unsupported';
const MAX_SERIES=10,MAX_ROWS=50;

// Every numeric field with its time field: {name, refId, field, time:[ms], values:[n]}.
function numericSeries(list){
 const multi=new Set(list.map(f=>f.refId)).size>1||list.length>1;
 const out=[];
 for(const fr of list.flatMap(wide)){
  const t=fr.fields.find(isTime);
  for(const f of fr.fields){if(isTime(f)||!isNumber(f))continue;out.push({name:fieldName(f,fr,multi),refId:fr.refId,field:f,time:t?t.values.map(Number):null,values:f.values.map(num)});}
 }
 return out;
}

function view(panel,data,{range:r}){
 const type=String(panel.type||''),k=kind(type);
 const list=data.frames;
 const base={kind:k};
 const notes=[];
 if(Array.isArray(panel.transformations)&&panel.transformations.some(t=>!t?.disabled))notes.push('Преобразования панели (transformations) не применены — показаны исходные данные.');
 if(k==='timeseries'){
  const series=numericSeries(list).filter(x=>x.time);
  const shown=series.slice(0,MAX_SERIES).map(x=>{const c=config(panel,x.name,x.refId);return {name:x.name.slice(0,120),color:c.color?.mode==='fixed'?color(c.color.fixedColor):null,unit:unitOf(c),decimals:decimalsOf(c),
   points:thin(x.time.map((t,i)=>[t,x.values[i]]).filter(p=>Number.isFinite(p[0])).sort((a,b)=>a[0]-b[0]))};});
  const c=config(panel,'','');
  return {...base,series:shown,more:Math.max(0,series.length-MAX_SERIES),unit:unitOf(c),decimals:decimalsOf(c),min:num(c.min),max:num(c.max),thresholds:panel.fieldConfig?.defaults?.custom?.thresholdsStyle?.mode&&panel.fieldConfig.defaults.custom.thresholdsStyle.mode!=='off'?thresholdList(c):[],stack:panel.fieldConfig?.defaults?.custom?.stacking?.mode==='normal',bars:panel.fieldConfig?.defaults?.custom?.drawStyle==='bars',from:r.from,to:r.to,notes};
 }
 if(k==='stat'||k==='bars'){
  const ro=panel.options?.reduceOptions||{};
  const calc=String(Array.isArray(ro.calcs)&&ro.calcs[0]||(type==='singlestat'?(panel.valueName==='avg'?'mean':panel.valueName==='current'?'lastNotNull':panel.valueName||'mean'):'lastNotNull'));
  let series=numericSeries(list);
  if(ro.fields&&typeof ro.fields==='string'){try{const re=new RegExp(ro.fields.replace(/^\/(.*)\/[a-z]*$/,'$1'));const f=series.filter(x=>re.test(x.name)||re.test(x.field.name));if(f.length)series=f;}catch{/* Grafana's field filter is a name or /regex/ */}}
  let items=[];
  // values:true (or a bar chart / pie of rows): one item per row, named by the string column.
  const rows=ro.values===true||type==='barchart';
  if(rows){
   for(const fr of list){
    const label=fr.fields.find(f=>f.type==='string')||fr.fields.find(isTime);
    for(const f of fr.fields){if(!isNumber(f)||isTime(f))continue;const c=config(panel,f.name,fr.refId);
     f.values.slice(0,Number(ro.limit)||25).forEach((v,i)=>items.push({name:String(label?(label.type==='time'?new Date(Number(label.values[i])).toISOString():label.values[i]):f.name+' '+(i+1)).slice(0,80),value:num(v),c}));}
   }
  }else items=series.map(x=>({name:x.name,value:reduce(x.values,calc),c:config(panel,x.name,x.refId),spark:x.time&&k==='stat'&&(panel.options?.graphMode??'area')!=='none'?sparkline(x.values):null}));
  if(type==='piechart'){const total=items.reduce((a,b)=>a+(b.value||0),0);items.forEach(i=>{i.share=total>0&&i.value!==null?i.value/total:null;});}
  const limit=k==='stat'?8:16;
  // Without a configured min/max Grafana scales bars, gauges and percentage thresholds to the data.
  const dataMax=Math.max(0,...items.map(i=>i.value).filter(v=>v!==null));
  return {...base,calc,gauge:type==='gauge',pie:type==='piechart',orientation:String(panel.options?.orientation||'auto'),more:Math.max(0,items.length-limit),notes,
   items:items.slice(0,limit).map(i=>{const min=num(i.c.min)??(type==='gauge'||k==='bars'?0:null),max=num(i.c.max)??(unitOf(i.c)==='percent'?100:unitOf(i.c)==='percentunit'?1:k==='bars'||type==='gauge'?dataMax:null);const m=mapped(i.c,i.value);
    return {name:String(i.c.displayName&&items.length===1?i.c.displayName:i.name).slice(0,120),value:i.value,text:m?.text??null,unit:unitOf(i.c),decimals:decimalsOf(i.c),min,max,color:m?.color||stepColor(i.c,i.value,min??0,max??dataMax),thresholds:thresholdList(i.c),spark:i.spark||null,share:i.share??null};})};
 }
 if(k==='table'){
  const fr=list.length>1&&panel.options?.frameIndex?list[panel.options.frameIndex]||list[0]:list[0];
  if(!fr)return {...base,columns:[],rows:[],total:0,notes};
  const fields=fr.fields.filter(f=>!(panel.fieldConfig?.overrides||[]).some(o=>o?.matcher?.id==='byName'&&o.matcher.options===f.name&&(o.properties||[]).some(p=>p?.id==='custom.hidden'&&p.value===true)));
  const columns=fields.map(f=>{const c=config(panel,f.name,fr.refId);return {name:String(c.displayName||f.config.displayName||f.name).slice(0,80),type:isTime(f)?'time':isNumber(f)?'number':'string',unit:unitOf(c),decimals:decimalsOf(c)};});
  const n=Math.max(0,...fields.map(f=>f.values.length));
  let rows=Array.from({length:n},(_,i)=>fields.map(f=>{const v=f.values[i];return v===null||v===undefined?null:typeof v==='object'?JSON.stringify(v).slice(0,200):isNumber(f)||isTime(f)?num(v):String(v).slice(0,300);}));
  const sort=Array.isArray(panel.options?.sortBy)&&panel.options.sortBy[0];
  if(sort){const i=columns.findIndex(c=>c.name===sort.displayName);if(i>=0)rows.sort((a,b)=>{const x=a[i],y=b[i];const d=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''));return sort.desc?-d:d;});}
  if(list.length>1)notes.push('Показана первая таблица из '+list.length+'.');
  return {...base,columns,rows:rows.slice(0,MAX_ROWS),total:n,notes};
 }
 return {...base,reason:type?'Тип панели «'+type+'» не рисуется в чате.':'Панель без типа.'};
}

module.exports={panels,variables,format,interpolate,interpolateDeep,time,range,duration,interval,intervalText,datasource,requests,frames,numericSeries,fieldName,wide,color,config,stepColor,reduce,thin,view,kind,MIXED};
