// Matching a balance table with a config set, comparing them and checking configs against a schema. All code:
// - key: the table column and object key (id, name, a string field, the file name) whose values overlap most;
// - columns ↔ fields: by name (with Russian ↔ English game words) or by agreeing values on the matched rows;
// - comparison: sheet value vs config value per mapped cell, with delta and status;
// - schema: types, required fields, ranges and enums inferred from the data, plus the user's overrides; references
//   to other configs' ids and Unity asset guids; duplicate keys.
const table=require('../google-sheets/table.cjs');

const SYNONYMS={
 урон:['damage','dmg','attack','atk','power'],атака:['attack','atk','damage'],сила:['power','strength','str'],
 здоров:['hp','health','maxhp','maxhealth','life'],хп:['hp','health','maxhp'],жизн:['hp','health','life','lives'],
 брон:['armor','armour','defense','defence','def'],защит:['defense','defence','armor','def'],
 скорост:['speed','spd','movespeed','rate'],скоростатак:['attackspeed','atkspeed','attackrate','firerate'],
 дальност:['range','distance','radius'],радиус:['radius','range'],цен:['cost','price','gold'],стоимост:['cost','price'],
 имя:['name','displayname','title'],назван:['name','displayname','title'],уровен:['level','lvl'],опыт:['xp','exp','experience'],
 кулдаун:['cooldown','cd'],перезарядк:['cooldown','reload','reloadtime'],время:['time','duration'],шанс:['chance','probability'],
 крит:['crit','critchance','critical'],мана:['mana','mp'],золот:['gold','coins'],наград:['reward','rewards'],вес:['weight'],
 количеств:['count','amount','qty'],экономик:['economy','economics','shop'],магазин:['shop','store'],волн:['wave','waves'],враг:['enemy','enemies','mob'],оруж:['weapon','weapons'],класс:['class','role','type'],роль:['role','class'],тип:['type','kind'],предмет:['item','id','name'],юнит:['unit','id','name']
};
const tokens=s=>String(s||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLocaleLowerCase().replace(/ё/g,'е').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const flat=s=>tokens(s).join('');
// English words a header means: «Скорость атаки» → attackspeed, «Урон» → damage, dmg, attack…
function meanings(header){
 const t=tokens(header);const out=new Set([t.join('')]);
 const joined=t.map(w=>table.stem(w)).join('');
 for(const [ru,en] of Object.entries(SYNONYMS)){if(joined===ru||t.length===1&&table.stem(t[0]).startsWith(ru)||t.length>1&&joined.startsWith(ru)&&ru.length>=joined.length-3)for(const e of en)out.add(e);}
 return out;
}
function nameScore(header,field){
 const f=flat(field.split('.').pop().replace(/\[\d+\]/g,'')),full=flat(field);
 const m=meanings(header);
 if(m.has(f)||m.has(full))return 1;
 for(const w of m)if(w.length>=4&&(f.startsWith(w)||w.startsWith(f)&&f.length>=4))return 0.7;
 return 0;
}
const norm=v=>String(v??'').toLocaleLowerCase().replace(/ё/g,'е').replace(/[\s_\-.]+/g,'');
const NUM=/^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;
function number(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&NUM.test(v.trim()))return Number(v.trim().replace(',','.'));return null;}
function bool(v){const t=String(v).trim().toLocaleLowerCase();return ['true','да','yes'].includes(t)?true:['false','нет','no'].includes(t)?false:null;}
// Whether a table cell and a config value mean the same: numbers by value, 0/1 against booleans, text trimmed.
function same(a,b){
 if(b&&typeof b==='object'&&b.ref)return false;
 const x=number(a),y=number(b);
 if(x!==null&&y!==null)return Math.abs(x-y)<=1e-6*Math.max(1,Math.abs(x),Math.abs(y));
 const p=bool(a),q=typeof b==='boolean'?b:bool(b);
 if(p!==null&&(q!==null||y===0||y===1))return p===(q!==null?q:y===1);
 if(Array.isArray(b))return norm(a)===norm(b.join(','));
 return String(a??'').trim()===String(b??'').trim();
}
const cellValue=(t,r,c)=>t.numbers[r]?.[c]??t.text[r]?.[c]??'';
const keyOf=(o,how)=>how==='id'?o.id:how==='name'?o.name:how==='file'?String(o.file||'').split('/').pop().replace(/\.[^.]+$/,''):o.fields[how];

// The best (column, object key) pair: most table rows that find an object.
function keyMatch(t,set){
 const head=t.text[t.header]||[],rows=t.text.slice(t.header+1);
 const ways=['id','name','file',...new Set(set.objects.flatMap(o=>Object.entries(o.fields).filter(([,v])=>typeof v==='string').map(([k])=>k)))].slice(0,60);
 let best=null;
 for(let c=0;c<head.length;c++){
  const values=new Set(rows.map(r=>norm(r[c])).filter(Boolean));if(values.size<1)continue;
  for(const how of ways){
   const keys=new Set(set.objects.map(o=>norm(keyOf(o,how))).filter(Boolean));
   let hit=0;for(const v of values)if(keys.has(v))hit++;
   const score=hit+(how==='id'?0.3:how==='name'?0.2:0);
   if(hit>=Math.min(2,set.objects.length)&&(!best||score>best.score))best={column:head[c],col:c,field:how,matched:hit,score};
  }
 }
 return best;
}
// Proposed column ↔ field pairs. `saved` (the user's confirmed mapping) wins; the model may add pairs for leftovers.
function propose(t,set,key){
 const head=t.text[t.header]||[];
 const fields=[...new Set(set.objects.flatMap(o=>Object.entries(o.fields).filter(([,v])=>v===null||typeof v!=='object'||Array.isArray(v)).map(([k])=>k)))];
 const index=objectIndex(set,key);
 const used=new Set([key.field]),pairs=[];
 const candidates=[];
 for(let c=0;c<head.length;c++){
  if(c===key.col||!head[c])continue;
  for(const f of fields){
   if(used.has(f))continue;
   const byName=nameScore(head[c],f);
   let agree=0,seen=0;
   for(let r=t.header+1;r<t.text.length;r++){const o=index.get(norm(t.text[r][key.col]));if(!o||!(f in o.fields))continue;const v=cellValue(t,r,c);if(v==='')continue;seen++;if(same(v,o.fields[f]))agree++;}
   const byValues=seen>=2?agree/seen:0;
   if(byName>=0.7||byValues>=0.6)candidates.push({column:head[c],col:c,field:f,how:byName>=0.7?'name':'values',score:byName*2+byValues});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const taken=new Set();
 for(const x of candidates){if(taken.has(x.col)||used.has(x.field))continue;taken.add(x.col);used.add(x.field);pairs.push({column:x.column,col:x.col,field:x.field,how:x.how});}
 return {pairs:pairs.sort((a,b)=>a.col-b.col),fields,unmatched:head.map((h,c)=>({column:h,col:c})).filter(x=>x.column&&x.col!==key.col&&!taken.has(x.col))};
}
function objectIndex(set,key){const m=new Map();for(const o of set.objects){const k=norm(keyOf(o,key.field));if(k&&!m.has(k))m.set(k,o);}return m;}

// Sheet vs configs for every mapped cell. Statuses: same, diff, no-object (row without config), no-row (config
// without row), no-field (the object lacks the field).
function compare(t,set,mapping){
 const key=mapping.key,index=objectIndex(set,key),rows=[],seen=new Set();
 for(let r=t.header+1;r<t.text.length;r++){
  const raw=t.text[r][key.col];if(!String(raw||'').trim())continue;
  const o=index.get(norm(raw));const label=String(raw).trim();
  if(!o){rows.push({key:label,object:label,status:'no-object',row:r});continue;}
  seen.add(o);
  for(const p of mapping.columns){
   const sheet=cellValue(t,r,p.col),has=p.field in o.fields,config=has?o.fields[p.field]:null;
   if(sheet===''&&!has)continue;
   const status=!has?'no-field':same(sheet,config)?'same':'diff';
   const x=number(sheet),y=number(config);
   rows.push({key:label,object:o.name||o.id,objectId:o.id,file:o.file,line:o.lines?.[p.field]||null,field:p.field,column:p.column,sheet,config:config&&typeof config==='object'&&!Array.isArray(config)?'(ссылка)':config,
    delta:status==='diff'&&x!==null&&y!==null?Math.round((x-y)*1e6)/1e6:null,status,row:r,col:p.col});
  }
 }
 for(const o of set.objects)if(!seen.has(o)&&keyOf(o,key.field))rows.push({key:String(keyOf(o,key.field)),object:o.name||o.id,objectId:o.id,file:o.file,status:'no-row'});
 const count=s=>rows.filter(x=>x.status===s).length;
 return {rows,counts:{same:count('same'),diff:count('diff'),noObject:count('no-object'),noRow:count('no-row'),noField:count('no-field')}};
}

// --- Schema ---------------------------------------------------------------------------------------------------------
const typeOf=v=>v===null||v===undefined||v===''?'empty':v&&typeof v==='object'&&v.ref?'ref':Array.isArray(v)?'list':typeof v==='number'?'number':typeof v==='boolean'?'bool':'string';
function median(list){const a=[...list].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;}
// Edit distance with transpositions («meele» → «melee» is one edit).
function distance(a,b){if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
// Rules per field inferred from the set's objects, merged with the user's overrides ({required,min,max,enum,ref}).
function infer(set,overrides={}){
 const fields=[...new Set(set.objects.flatMap(o=>Object.keys(o.fields)))].filter(f=>!/\[\d+\]/.test(f)||set.objects.length<3);
 const n=set.objects.length,rules=[];
 for(const f of fields){
  const values=set.objects.map(o=>o.fields[f]);
  const types={};for(const v of values){const t=typeOf(v);types[t]=(types[t]||0)+1;}
  const filled=values.filter(v=>typeOf(v)!=='empty');
  const type=Object.entries(types).filter(([t])=>t!=='empty').sort((a,b)=>b[1]-a[1])[0]?.[0]||'empty';
  const rule={field:f,type,present:filled.length,inferred:{}};
  if(n>=3&&filled.length/n>=0.75&&type!=='list'&&type!=='ref')rule.inferred.required=true;
  if(type==='number'){
   const nums=filled.filter(v=>typeof v==='number');
   if(nums.length>=4&&nums.filter(v=>v>=0).length/nums.length>=0.75)rule.inferred.min=0;
   const pos=nums.filter(v=>v>0);if(pos.length>=5)rule.inferred.outlier=median(pos)*10;
  }
  if(type==='string'){
   const strs=filled.filter(v=>typeof v==='string');const distinct=new Set(strs);
   if(strs.length>=4&&distinct.size<=Math.ceil(strs.length*0.75)&&distinct.size<strs.length)rule.inferred.enum=[...distinct].sort();
   if(/(?:Id|_id|ID|To|Ref)$/.test(f.split('.').pop()))rule.inferred.ref=true;
  }
  const o=overrides[f]||{};
  rule.required=o.required??rule.inferred.required??false;
  rule.min=o.min??rule.inferred.min;rule.max=o.max;rule.enum=o.enum??null;rule.ref=o.ref??rule.inferred.ref??false;rule.user=!!overrides[f];
  rules.push(rule);
 }
 return rules;
}
// Issues: {severity:'error'|'warning', kind, object, field, file, line, value, message}.
function validate(set,{overrides={},ids=new Set(),guids=null,sheetDuplicates=[]}={}){
 const rules=infer(set,overrides),issues=[];
 const push=(severity,kind,o,field,value,message)=>issues.push({severity,kind,object:o?.name||o?.id||'',objectId:o?.id||'',file:o?.file||'',line:field&&o?.lines?.[field]||null,field:field||'',value:value===undefined?'':value,message});
 const byId=new Map();for(const o of set.objects){const k=norm(o.id);if(byId.has(k))push('error','duplicate',o,'',o.id,'Повторяется ключ «'+o.id+'» (ещё в '+byId.get(k).file+').');else byId.set(k,o);}
 for(const d of sheetDuplicates)issues.push({severity:'error',kind:'duplicate',object:d.key,objectId:'',file:'',line:null,field:'',value:d.key,message:'В таблице ключ «'+d.key+'» встречается в строках '+d.rows.join(', ')+'.'});
 for(const r of rules){
  for(const o of set.objects){
   const v=o.fields[r.field],t=typeOf(v);
   if(t==='empty'){if(r.required)push(r.user?'error':'warning','required',o,r.field,'','Не заполнено «'+r.field+'»'+(r.user?' (обязательное поле).':' (есть у остальных).'));continue;}
   if(r.type!=='empty'&&t!==r.type&&!(r.type==='number'&&t==='bool')&&!(r.type==='string'&&t==='ref')){push('error','type',o,r.field,v,'«'+r.field+'» должно быть '+({number:'числом',string:'текстом',bool:'да/нет',list:'списком',ref:'ссылкой'}[r.type]||r.type)+', а здесь «'+String(Array.isArray(v)?v.join(', '):v)+'».');continue;}
   if(t==='number'){
    if(r.min!==undefined&&v<r.min)push(r.user?'error':'warning','range',o,r.field,v,'«'+r.field+'» = '+v+' меньше '+(r.user?'минимума ':'')+r.min+'.');
    else if(r.max!==undefined&&v>r.max)push('error','range',o,r.field,v,'«'+r.field+'» = '+v+' больше максимума '+r.max+'.');
    else if(!r.user&&r.inferred.outlier&&v>r.inferred.outlier)push('warning','range',o,r.field,v,'«'+r.field+'» = '+v+' — в 10 раз больше обычного.');
   }
   if(t==='string'){
    if(r.enum&&!r.enum.includes(v))push('error','enum',o,r.field,v,'«'+v+'» нет среди значений «'+r.field+'»: '+r.enum.join(', ')+'.');
    else if(!r.user&&r.inferred.enum){const count=set.objects.filter(x=>x.fields[r.field]===v).length;const near=r.inferred.enum.find(e=>e!==v&&distance(e,v)<=(v.length<6?1:2)&&set.objects.filter(x=>x.fields[r.field]===e).length>count);if(count===1&&near)push('warning','enum',o,r.field,v,'«'+v+'» похоже на опечатку: обычно «'+near+'».');}
    if(r.ref&&ids.size&&!ids.has(norm(v)))push('error','ref',o,r.field,v,'«'+r.field+'» ссылается на «'+v+'», такого объекта в конфигах нет.');
   }
   if(t==='ref'&&guids&&v.guid&&/^[0-9a-f]{32}$/.test(v.guid)&&!guids.has(v.guid))push('error','ref',o,r.field,v.guid,'«'+r.field+'» ссылается на ассет, которого нет в проекте (guid '+v.guid.slice(0,8)+'…).');
  }
 }
 const order={error:0,warning:1};
 return {rules:rules.map(({inferred,...r})=>({...r,auto:inferred})),issues:issues.sort((a,b)=>order[a.severity]-order[b.severity])};
}
function duplicates(t,col){const seen=new Map();for(let r=t.header+1;r<t.text.length;r++){const k=norm(t.text[r][col]);if(!k)continue;if(!seen.has(k))seen.set(k,{key:String(t.text[r][col]).trim(),rows:[]});seen.get(k).rows.push(r+1);}return [...seen.values()].filter(x=>x.rows.length>1);}
module.exports={keyMatch,propose,compare,infer,validate,duplicates,same,norm,nameScore,meanings,number,objectIndex,keyOf,tokens};
