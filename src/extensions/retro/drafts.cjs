// «Ретро», the drafts «что хорошо / что плохо / что попробовать». Every item names the facts it rests on (their ids);
// the local model only words the items, and code drops any item that cites no fact or a fact that does not exist,
// and any «хорошо» built only on bad facts (or «плохо» only on good ones). Without a model (or when it gives nothing
// usable for a column) the column is drafted from the facts by rules.
const kit=require('../app-kit.cjs');
const COLUMNS=['good','bad','try'];
const clip=(t,n=160)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};

// What to try, per kind of problem: a concrete next step, still tied to the fact.
const TRY={
 carry:f=>'Брать в спринт меньше и резать крупные задачи до старта: '+(f.value?f.value.count+' задач переехало':'перенос'),
 velocity:()=>'Сверять объём спринта со средней скоростью на планировании',
 bugs:f=>'Закладывать время на баги в начале спринта'+(f.value?.open?' — открыто '+f.value.open:''),
 ci:f=>'Назначать дежурного по сборке и чинить красный CI в тот же день'+(f.source?.label?' («'+clip(f.source.label,40)+'»)':''),
 incident:()=>'Разобрать инциденты на пост-мортеме и завести задачи на причины',
 estimate:()=>'Не брать задачи без оценки — оценивать на грумминге',
 complaint:f=>'Обсудить и договориться: '+clip(String(f.quote||f.text).replace(/^(?:Жалоба в чате|На встрече):\s*/,''),90),
 open:f=>'Вернуться к вопросу: '+clip(String(f.quote||f.text).replace(/^Осталось без решения:\s*/,''),100)
};

function rules(facts){
 const good=facts.filter(f=>f.tone==='good').slice(0,6).map(f=>({text:clip(f.text),facts:[f.id]}));
 const bad=facts.filter(f=>f.tone==='bad').slice(0,7).map(f=>({text:clip(f.text),facts:[f.id]}));
 const tried=[],seen=new Set();
 for(const f of facts.filter(x=>x.tone==='bad'||x.kind==='velocity'&&x.tone!=='good')){
  const make=TRY[f.kind];if(!make)continue;
  // One step per kind, except complaints and open questions, which are each their own.
  const key=['complaint','open'].includes(f.kind)?f.id:f.kind;
  if(seen.has(key))continue;seen.add(key);
  tried.push({text:clip(make(f)),facts:[f.id]});
  if(tried.length>=5)break;
 }
 return {good,bad,try:tried};
}

// Keeps model items that cite existing facts of a fitting tone; returns null for a column with nothing usable.
function check(columns,facts){
 const byId=new Map(facts.map(f=>[f.id,f]));
 const out={};
 for(const col of COLUMNS){
  const rows=[];
  for(const item of Array.isArray(columns?.[col])?columns[col]:[]){
   const text=clip(item?.text);
   const ids=[...new Set((Array.isArray(item?.facts)?item.facts:[]).map(String))].filter(id=>byId.has(id));
   if(text.length<6||!ids.length)continue;
   const tones=ids.map(id=>byId.get(id).tone);
   if(col==='good'&&tones.every(t=>t==='bad'))continue;
   if(col==='bad'&&tones.every(t=>t==='good'))continue;
   if(rows.some(r=>r.text.toLowerCase()===text.toLowerCase()))continue;
   rows.push({text,facts:ids});
   if(rows.length>=7)break;
  }
  out[col]=rows.length?rows:null;
 }
 return out;
}

async function model(s,facts){
 if(!s.settings.model||!facts.length)return null;
 const schema={type:'object',properties:Object.fromEntries(COLUMNS.map(c=>[c,{type:'array',maxItems:6,items:{type:'object',properties:{text:{type:'string'},facts:{type:'array',items:{type:'string'}}},required:['text','facts']}}])),required:COLUMNS};
 try{
  return await kit.modelJSON(s,{system:'Ты помогаешь подготовить ретроспективу спринта. Ниже факты спринта с номерами (F1, F2…). Составь три списка по-русски: good — что получилось хорошо, bad — что мешало, try — что попробовать в следующем спринте (конкретное действие). Каждый пункт — до 15 слов и обязательно с номерами фактов, на которых он основан. Только из этих фактов: без новых чисел, имён и событий.',
   user:{facts:facts.map(f=>({id:f.id,tone:f.tone,kind:f.kind,text:f.text}))},schema,predict:900,temperature:0.2});
 }catch{return null;}
}

// → {good, bad, try, by:'model'|'rules'|'mixed'}; items get stable ids for votes.
async function drafts(s,facts){
 const base=rules(facts);
 const checked=check(await model(s,facts),facts);
 let used=0;
 const out={};
 for(const col of COLUMNS){
  const rows=checked[col]||base[col];
  if(checked[col])used++;
  out[col]=rows.map((r,i)=>({id:col+'-'+(i+1),...r}));
 }
 out.by=used===3?'model':used?'mixed':'rules';
 return out;
}

module.exports={drafts,rules,check,COLUMNS,TRY};
