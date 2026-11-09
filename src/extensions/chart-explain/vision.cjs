// «Объясни график» from a screenshot: the user's local vision model (the one «Скриншот → задача» uses — gemma3:4b
// or another installed vision model, see src/extensions/screenshot-task/vision.cjs) reads the main line's points with
// their axis labels; code turns the labels into dates and checks the values. Nothing leaves the computer; without a
// vision model nothing is read — the card offers the download (optional models, with its own progress).
const shot=require('../screenshot-task/vision.cjs');
const {localEndpoint}=require('../../core.cjs');
const SCHEMA={type:'object',properties:{title:{type:'string'},metric:{type:'string'},unit:{type:'string'},year:{type:'integer'},
 points:{type:'array',maxItems:120,items:{type:'object',properties:{x:{type:'string'},y:{type:'number'}},required:['x','y']}}},required:['points']};
// The model prompt (one literal: it is not interface text).
const SYSTEM='Ты читаешь график со скриншота. Верни точки основной линии (или столбцов) слева направо: x — подпись дня на оси X ровно как на картинке (например «4 нояб.», «2026-11-04», «04.11», «Nov 4»), y — значение по оси Y. Если подписан не каждый день, оцени промежуточные точки по сетке и подпиши их соседними датами. Не выдумывай то, чего не видно. title — заголовок графика, metric — что измеряется, unit — единица, year — год, если он написан.';
const MONTHS=[/^янв|^jan/i,/^фев|^feb/i,/^мар|^mar/i,/^апр|^apr/i,/^ма[йя]|^may/i,/^июн|^jun/i,/^июл|^jul/i,/^авг|^aug/i,/^сен|^sep/i,/^окт|^oct/i,/^ноя|^nov/i,/^дек|^dec/i];
const iso=(y,m,d)=>m>=1&&m<=12&&d>=1&&d<=31?new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10):null;
// An axis label → 'YYYY-MM-DD' (the year from the chart, or the latest one not in the future), or null.
function date(label,{year=null,now=Date.now()}={}){
 const t=String(label||'').trim().replace(/\s+/g,' ');
 let m=/^(\d{4})-(\d{2})-(\d{2})/.exec(t);if(m)return iso(+m[1],+m[2],+m[3]);
 const today=new Date(now),guess=(mo,d)=>{if(year)return iso(year,mo,d);const v=iso(today.getUTCFullYear(),mo,d);return v&&Date.parse(v)>now+86400000?iso(today.getUTCFullYear()-1,mo,d):v;};
 m=/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/.exec(t);if(m)return m[3]?iso(m[3].length===2?2000+ +m[3]:+m[3],+m[2],+m[1]):guess(+m[2],+m[1]);
 m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);if(m)return m[3]?iso(m[3].length===2?2000+ +m[3]:+m[3],+m[1],+m[2]):guess(+m[1],+m[2]);
 m=/^(\d{1,2})\s+([\p{L}]+)\.?(?:\s+(\d{4}))?/u.exec(t);if(m){const mo=MONTHS.findIndex(r=>r.test(m[2]))+1;if(mo)return m[3]?iso(+m[3],mo,+m[1]):guess(mo,+m[1]);}
 m=/^([\p{L}]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/u.exec(t);if(m){const mo=MONTHS.findIndex(r=>r.test(m[1]))+1;if(mo)return m[3]?iso(+m[3],mo,+m[2]):guess(mo,+m[2]);}
 return null;
}
// The model's answer → {title, metric, unit, points:[{date, value}]} or null when it is not a usable daily series.
function tidy(r,{now=Date.now()}={}){
 if(!r||!Array.isArray(r.points))return null;
 const year=Number.isInteger(r.year)&&r.year>2000&&r.year<2100?r.year:null;
 const raw=r.points.map(p=>({date:date(p?.x,{year,now}),value:Number(p?.y)})).filter(p=>Number.isFinite(p.value));
 const dated=raw.filter(p=>p.date);
 if(dated.length<4||dated.length<raw.length*0.7)return {undated:true,title:String(r.title||'').slice(0,120),points:[]};
 const by=new Map();for(const p of dated)by.set(p.date,p.value);
 const points=[...by].sort((a,b)=>a[0].localeCompare(b[0])).map(([d,value])=>({date:d,value}));
 return {title:String(r.title||'').slice(0,120),metric:String(r.metric||'').slice(0,80),unit:String(r.unit||'').slice(0,20),points};
}
async function installed(s){try{const r=await s.optionalModels?.installed?.();return Array.isArray(r)?r:Array.isArray(r?.names)?r.names:[];}catch{return [];}}
async function state(s){
 const model=shot.pickModel(await installed(s),s.optionalModels?.catalog||[]);
 const entry=(s.optionalModels?.catalog||[]).find(m=>m.name===shot.PREFERRED);
 return {model,name:shot.PREFERRED,size:entry?.size||3.3e9};
}
async function read(s,{model,image,now=Date.now()}){
 const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:300000,
  body:JSON.stringify({model,stream:false,think:false,format:SCHEMA,options:{temperature:0.1,num_predict:2500,num_ctx:8192},
   messages:[{role:'system',content:SYSTEM},{role:'user',content:'Прочитай этот график.',images:[image]}]})});
 try{return tidy(JSON.parse(response?.message?.content||'null'),{now});}catch{return null;}
}
module.exports={date,tidy,state,read,installed,SCHEMA};
