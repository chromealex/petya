// «Симуляция баланса»: the game economy read from the project's configs through «Конфиги и баланс»' readers
// (src/extensions/config-balance/files.cjs: Unity ScriptableObject .asset, JSON, CSV — every value keeps its file and
// line). Code recognises, by field names only:
//  - sources: rewards per win / loss / any action and per day (winGold, rewards.victory.coins, dailyLoginBonus…);
//  - sinks: prices of items and upgrades (a set of objects with a price/cost field, or price fields of one object);
//  - the XP curve: objects with a level and an XP field, or one numeric array named like xpPerLevel;
//  - hints for the loop: battlesPerDay / winRate fields, if a config has them.
// Nothing is guessed by a model; everything found is shown on the card with its file and line for the user to confirm.
const files=require('../config-balance/files.cjs');

// camelCase, snake_case, dots and indices → lowercase tokens.
function tokens(path){
 return String(path||'').replace(/\[\d+\]/g,' ').replace(/([a-zа-яё])([A-ZА-ЯЁ])/gu,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2')
  .split(/[^\p{L}\p{N}]+/u).map(t=>t.toLowerCase()).filter(Boolean);
}
const XP=/^(?:xp|exp|experience|опыт\p{L}*)$/u;
const CURRENCY=/^(?:gold|golds|coin|coins|soft|softs|money|cash|silver|gem|gems|crystal|crystals|diamond|diamonds|hard|hards|ruby|rubies|token|tokens|ticket|tickets|key|keys|star|stars|energy|stamina|золот\p{L}*|монет\p{L}*|кристалл\p{L}*|алмаз\p{L}*|гем\p{L}*|энерги\p{L}*)$/u;
const CANON={golds:'gold',coins:'coin',softs:'soft',gems:'gem',crystals:'crystal',diamonds:'diamond',hards:'hard',rubies:'ruby',tokens:'token',tickets:'ticket',keys:'key',stars:'star'};
const SOURCE=/^(?:reward|rewards|income|bonus|prize|prizes|award|awards|payout|gain|gains|earn|earned|earning|drop|drops|loot|награда|награды|бонус)$/u;
const SINK=/^(?:price|prices|cost|costs|fee|цена|стоимость)$/u;
const WIN=/^(?:win|wins|victory|victories|won|winner|winning|победа|победу|победы)$/u;
const LOSS=/^(?:loss|losses|lose|lost|defeat|defeats|losing|поражение|проигрыш)$/u;
const DAILY=/^(?:daily|day|login|logins|ежедневн\p{L}*|вход)$/u;
const ACTION=/^(?:battle|battles|match|matches|fight|fights|round|rounds|game|games|stage|stages|mission|missions|run|runs|бой|матч)$/u;
const LEVEL=/^(?:level|lvl|lv|уровень)$/u;
const NOT_REWARD=/^(?:chance|rate|probability|weight|multiplier|mult|count|max|min|limit|cap|duration|time|cooldown|seconds|minutes|hours|id|index)$/u;

const canon=t=>CANON[t]||t;
function resourceOf(list){const x=list.find(t=>XP.test(t));if(x)return 'xp';const c=list.find(t=>CURRENCY.test(t));return c?canon(c):null;}
function triggerOf(list){
 if(list.some(t=>WIN.test(t)))return 'win';
 if(list.some(t=>LOSS.test(t)))return 'loss';
 if(list.some(t=>DAILY.test(t)))return 'daily';
 if(list.some(t=>ACTION.test(t)))return 'action';
 return null;
}
const num=v=>typeof v==='number'&&Number.isFinite(v);
const short=f=>String(f||'').split('/').pop();
const labelOf=o=>String(o.name||o.id||'').trim();

// One config set → sources, sinks, curve candidates, hints.
function readSet(set,out){
 const multi=set.objects.length>1;
 // XP curve as a set of objects with a level and an XP field.
 if(multi){
  const sample=set.objects[0];
  const keys=Object.keys(sample.fields);
  const lv=keys.find(k=>tokens(k).length===1&&LEVEL.test(tokens(k)[0]));
  const xp=keys.find(k=>k!==lv&&!k.includes('.')&&tokens(k).some(t=>XP.test(t))&&!tokens(k).some(t=>SOURCE.test(t)||WIN.test(t)||LOSS.test(t)));
  if(lv&&xp&&set.objects.filter(o=>num(o.fields[lv])&&num(o.fields[xp])).length>=3){
   const rows=set.objects.filter(o=>num(o.fields[lv])&&num(o.fields[xp])).map(o=>({level:o.fields[lv],xp:o.fields[xp],file:o.file,line:o.lines?.[xp]||0})).sort((a,b)=>a.level-b.level);
   out.curves.push({field:xp,file:rows[0].file,line:rows[0].line,rows,kindHint:curveHint(tokens(xp))});
   return;
  }
 }
 for(const o of set.objects){
  const name=labelOf(o);
  // A price field of an object in a list of objects is one sink (an item, an upgrade, a unit).
  let priced=false;
  for(const [path,value] of Object.entries(o.fields)){
   const t=tokens(path);if(!t.length)continue;
   // A numeric array named like an XP table.
   if(Array.isArray(value)&&value.length>=3&&value.every(num)&&t.some(x=>XP.test(x))&&(t.some(x=>LEVEL.test(x))||t.some(x=>/^(?:per|table|curve|levels|next|required|thresholds?)$/.test(x)))){
    out.curves.push({field:path,file:o.file,line:o.lines?.[path]||0,values:value,kindHint:curveHint(t)});continue;
   }
   if(!num(value))continue;
   if(/^(?:battles?|matches|fights|games|rounds|actions|sessions)perday$/.test(t.join(''))||(t.includes('per')&&t.includes('day')&&t.some(x=>ACTION.test(x)||x==='actions'||x==='sessions'))){out.hints.actionsPerDay={value,file:o.file,line:o.lines?.[path]||0,field:path};continue;}
   if(/^(?:win)(?:rate|chance|probability|ratio)$/.test(t.join(''))){out.hints.winRate={value:value>1?value/100:value,file:o.file,line:o.lines?.[path]||0,field:path};continue;}
   if(t.some(x=>NOT_REWARD.test(x)))continue;
   const resource=resourceOf(t);
   const trigger=triggerOf(t);
   // A cost of the action itself (energy per battle) is not a sink of the economy.
   if(t.some(x=>SINK.test(x))){
    if(trigger&&trigger!=='daily'){out.notes.push({kind:'action-cost',field:path,file:o.file,line:o.lines?.[path]||0,value});continue;}
    if(value<=0||priced&&!resource)continue;
    const currency=resource||currencyField(o)||null;
    out.sinks.push({id:o.file+'#'+(name||path)+'#'+path,label:multi||!name?(name||path):path,object:name,resource:currency,price:value,file:o.file,line:o.lines?.[path]||0,field:path});
    priced=true;continue;
   }
   const reward=t.some(x=>SOURCE.test(x));
   if(trigger&&resource&&value>0&&(reward||trigger==='win'||trigger==='loss'||trigger==='daily')){
    out.sources.push({id:o.file+'#'+path+'#'+name,label:path,object:multi?name:'',trigger,resource,amount:value,file:o.file,line:o.lines?.[path]||0,field:path});
   }else if(reward&&resource&&value>0&&!multi){
    // «rewards.gold» without a trigger: paid for every action.
    out.sources.push({id:o.file+'#'+path,label:path,object:'',trigger:'action',resource,amount:value,file:o.file,line:o.lines?.[path]||0,field:path});
   }
  }
 }
}
function currencyField(o){
 for(const k of ['currency','Currency','priceCurrency','costCurrency','валюта']){const v=o.fields[k];if(typeof v==='string'&&v.trim()){const t=tokens(v);const c=resourceOf(t);return c||canon(t[0]||'');}}
 return null;
}
function curveHint(t){
 if(t.some(x=>/^(?:total|cumulative|accumulated|sum|threshold|thresholds)$/.test(x)))return 'cumulative';
 if(t.some(x=>/^(?:next|tonext|required|need|needed|up|per|delta)$/.test(x)))return 'per-level';
 return null;
}
// Curve candidates → thresholds: XP needed in total to reach level i+1 (thresholds[0] = 0 for level 1).
function thresholds(curve,kind){
 const values=curve.values?curve.values.slice():curve.rows.map(r=>r.xp);
 const firstLevel=curve.rows?curve.rows[0].level:1;
 if(kind==='cumulative'){
  // A table that does not start at 0 lists the thresholds of the levels after the first one.
  const out=values.slice();
  if(out[0]!==0)out.unshift(0);
  for(let i=1;i<out.length;i++)if(out[i]<out[i-1])out[i]=out[i-1];
  return out;
 }
 // Per level: values[i] = XP to go from the i-th level of the table to the next one. A table that starts at level 2
 // («xp to reach level 2») is the same list.
 const out=[0];let sum=0;for(const v of values){sum+=Math.max(0,v);out.push(sum);}
 if(curve.rows&&firstLevel<=1&&values[0]===0)out.splice(1,1);
 return out;
}
function curveKind(curve){
 if(curve.kindHint)return curve.kindHint;
 const v=curve.values||curve.rows.map(r=>r.xp);
 if(v[0]===0&&v.every((x,i)=>!i||x>=v[i-1]))return 'cumulative';
 return 'per-level';
}

// The whole economy of the scanned project.
function detect(scan){
 const out={sources:[],sinks:[],curves:[],hints:{},notes:[]};
 for(const set of scan.sets)readSet(set,out);
 // The same reward read twice (an .asset and its JSON export) is kept once.
 const seen=new Set();out.sources=out.sources.filter(x=>{const k=x.trigger+'|'+x.resource+'|'+x.amount+'|'+x.field;if(seen.has(k))return false;seen.add(k);return true;});
 const curve=out.curves.sort((a,b)=>(b.values||b.rows).length-(a.values||a.rows).length)[0]||null;
 const currencies=[...new Set([...out.sources.map(x=>x.resource),...out.sinks.map(x=>x.resource)].filter(r=>r&&r!=='xp'))];
 // The main currency: the one the most sources pay.
 const count=r=>out.sources.filter(x=>x.resource===r).length;
 const main=currencies.slice().sort((a,b)=>count(b)-count(a))[0]||null;
 for(const x of out.sinks)if(!x.resource)x.resource=main;
 const sinks=out.sinks.filter(x=>x.resource&&x.resource!=='xp').sort((a,b)=>a.price-b.price).slice(0,200);
 let kind=curve?curveKind(curve):null;
 return {
  sources:out.sources.slice(0,60),sinks,currencies,main,
  curve:curve?{field:curve.field,file:curve.file,line:curve.line,kind,levels:(curve.values||curve.rows).length,raw:(curve.values||curve.rows.map(r=>r.xp)).slice(0,200),firstLevel:curve.rows?curve.rows[0].level:1}:null,
  hints:out.hints,notes:out.notes.slice(0,20),
  files:[...new Set([...out.sources,...sinks].map(x=>x.file).concat(curve?[curve.file]:[]))].slice(0,30)
 };
}
// Thresholds for a curve shown on the card, with the user's choice of how to read it.
function levels(curve,kind=curve?.kind){
 if(!curve)return null;
 return thresholds({values:curve.raw,rows:curve.firstLevel>1?curve.raw.map((xp,i)=>({level:curve.firstLevel+i,xp})):null,kindHint:kind},kind);
}
async function read(roots){const scan=await files.scan(roots);return {scan,economy:detect(scan)};}
module.exports={tokens,detect,levels,thresholds,read,short};
