// «Разбор плейтеста»: the game's event log (CSV or JSON) → [{t, type, kind, level, detail}] on the video's clock.
// Times may be seconds, «mm:ss», «hh:mm:ss», epoch seconds/milliseconds or ISO dates; absolute times are counted
// from a session/recording start event when there is one, otherwise from the first event. Kinds: death, retry,
// level_start, level_end, purchase, ui_miss, other.
// CSV with «,», «;» or tab (the most frequent one in the header) and quoted cells.
function csv(text){
 const src=String(text||'').replace(/^﻿/,''),first=src.split(/\r?\n/).find(l=>l.trim())||'';
 const count=c=>first.split(c).length-1,sep=[',',';','\t'].sort((a,b)=>count(b)-count(a))[0];
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell.trim()==='')quoted=true;
  else if(c===sep){row.push(cell.trim());cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(x=>x!==''))rows.push(row);row=[];}
  else cell+=c;
 }
 row.push(cell.trim());if(row.some(x=>x!==''))rows.push(row);
 return rows;
}
const num=v=>{const s=String(v??'').trim().replace(/^(-?\d+),(\d+)$/,'$1.$2');const n=s?Number(s):NaN;return Number.isFinite(n)?n:NaN;};

const TIME_KEYS=['time','t','timestamp','ts','sec','seconds','at','offset','videotime','время','секунда'];
const TYPE_KEYS=['event','type','name','action','eventname','событие','тип'];
const LEVEL_KEYS=['level','stage','location','checkpoint','map','zone','уровень','локация'];
const key=h=>String(h||'').toLowerCase().replace(/[^a-zа-я0-9]/g,'');

function kind(type){
 const t=String(type||'').toLowerCase();
 if(/death|died|die|dead|killed|fail|lose|lost|game_?over|смерт|погиб|умер|проигр|провал/.test(t))return 'death';
 if(/retry|restart|respawn|повтор|рестарт|заново/.test(t))return 'retry';
 if(/(?:level|stage|уров)\w*[_ -]?(?:start|begin|старт|начал)|^start/.test(t))return 'level_start';
 if(/(?:level|stage|уров)\w*[_ -]?(?:end|complete|finish|win|конец|пройден)|^(?:win|victory|complete)/.test(t))return 'level_end';
 if(/purchase|buy|iap|order|покупк|купил/.test(t))return 'purchase';
 if(/miss|empty_?tap|dead_?click|misclick|tap_?nothing|промах/.test(t))return 'ui_miss';
 if(/session_?start|recording_?start|video_?start|record_?start|начало записи/.test(t))return 'session_start';
 return 'other';
}
// Seconds from a time cell, or {abs: ms} for absolute moments.
function seconds(v){
 const s=String(v??'').trim();if(!s)return null;
 let m=s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:[.,]\d+)?)$/);
 if(m)return (Number(m[1]||0)*3600)+Number(m[2])*60+Number(m[3].replace(',','.'));
 const n=num(s);
 if(Number.isFinite(n)){if(n>1e12)return {abs:n};if(n>1e9)return {abs:n*1000};return n;}
 const d=Date.parse(s);return Number.isFinite(d)?{abs:d}:null;
}
function rowsFromJSON(text){
 let data;try{data=JSON.parse(text);}catch{throw Error('JSON журнала событий повреждён.');}
 const list=Array.isArray(data)?data:Array.isArray(data?.events)?data.events:Array.isArray(data?.log)?data.log:null;
 if(!list)throw Error('В JSON нет массива событий (events).');
 return list.filter(x=>x&&typeof x==='object');
}
function rowsFromCSV(text){
 const rows=csv(text);if(rows.length<2)throw Error('В журнале событий нет строк.');
 const h=rows[0];return rows.slice(1).map(r=>Object.fromEntries(h.map((name,i)=>[name,r[i]])));
}
const pick=(row,keys)=>{for(const [k,v] of Object.entries(row))if(keys.includes(key(k))&&v!==undefined&&v!==null&&String(v).trim()!=='')return {k,v};return null;};

// Whether a text looks like an event log (a time column and an event column).
function looks(text){
 try{
  const head=String(text||'').trim();
  const rows=/^[[{]/.test(head)?rowsFromJSON(head).slice(0,3):rowsFromCSV(head.split(/\r?\n/).slice(0,4).join('\n'));
  return rows.length>0&&rows.every(r=>pick(r,TIME_KEYS)&&pick(r,TYPE_KEYS));
 }catch{return false;}
}
function parse(text,{limit=5000}={}){
 const raw=/^\s*[[{]/.test(String(text))?rowsFromJSON(String(text)):rowsFromCSV(String(text));
 const out=[];let skipped=0;
 for(const row of raw.slice(0,limit)){
  const time=pick(row,TIME_KEYS),type=pick(row,TYPE_KEYS);
  const t=time?seconds(time.v):null;
  if(t===null||!type){skipped++;continue;}
  const level=pick(row,LEVEL_KEYS);
  const detail=Object.entries(row).filter(([k])=>![time.k,type.k,level?.k].includes(k)).map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join(', ').slice(0,200);
  out.push({t,type:String(type.v).slice(0,80),kind:kind(type.v),level:level?String(level.v).slice(0,80):'',detail});
 }
 // Absolute times → seconds from the session start (or the first event).
 const abs=out.filter(e=>typeof e.t==='object');
 if(abs.length){
  const start=out.find(e=>e.kind==='session_start'&&typeof e.t==='object')?.t.abs??Math.min(...abs.map(e=>e.t.abs));
  for(const e of abs)e.t=(e.t.abs-start)/1000;
 }
 const events=out.filter(e=>e.t>=0).sort((a,b)=>a.t-b.t);
 return {events,skipped:skipped+out.length-events.length,absolute:abs.length>0,truncated:raw.length>limit};
}
module.exports={parse,looks,kind,seconds};
