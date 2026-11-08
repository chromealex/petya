// Translates missing strings with the local model. Placeholders and tags are replaced with numbered markers
// (⟦1⟧, ⟦2⟧) before the model sees the text, restored afterwards, and the result is checked by code:
// a lost, duplicated or invented marker, or a placeholder set that differs from the source, is a failure.
const kit=require('../app-kit.cjs');
const checks=require('./checks.cjs');
const langs=require('./langs.cjs');

function protect(text){
 const tokens=[];
 const masked=text.replace(checks.TOKEN,t=>{if(t==='%%')return t;tokens.push(t);return '⟦'+tokens.length+'⟧';});
 return {masked,tokens};
}
function restore(text,tokens){
 const found=String(text).match(/⟦\d+⟧/g)||[];
 const expected=tokens.map((_,i)=>'⟦'+(i+1)+'⟧');
 if(found.length!==expected.length||[...found].sort().join()!==[...expected].sort().join())return null;
 return String(text).replace(/⟦(\d+)⟧/g,(_,n)=>tokens[n-1]);
}
const SCHEMA={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{id:{type:'integer'},text:{type:'string'}},required:['id','text']}}},required:['items']};

// items: [{key, source}] → {done: Map key→text, failed: [{key, reason}]}. progress(done,total) after every batch.
async function translate(s,items,{from,to,size=20,progress=()=>{},check=()=>{}}){
 const done=new Map(),failed=[];
 const system='Ты переводчик интерфейса мобильной игры. Переведи каждую строку с языка «'+langs.name(from)+'» на язык «'+langs.name(to)+'». '+
  'Маркеры вида ⟦1⟧ — это подстановки: перенеси каждый маркер в перевод ровно один раз и без изменений. Сохраняй переводы строк и краткость: это кнопки и подписи. '+
  'Не добавляй пояснений. Верни items с теми же id.';
 const run=async batch=>{
  const prepared=batch.map((x,i)=>({...x,id:i+1,...protect(x.source)}));
  let answer=null;
  try{answer=await kit.modelJSON(s,{system,user:{items:prepared.map(p=>({id:p.id,text:p.masked}))},schema:SCHEMA,predict:Math.min(4000,400+prepared.reduce((n,p)=>n+p.masked.length*3,0)),temperature:0.1});}
  catch(e){if(/Модель изменилась/.test(e.message))throw e;return prepared.map(p=>({key:p.key,reason:'модель не ответила: '+e.message}));}
  const byId=new Map((answer?.items||[]).map(r=>[Number(r.id),r.text]));
  const bad=[];
  for(const p of prepared){
   const raw=byId.get(p.id);
   if(typeof raw!=='string'||!raw.trim()){bad.push({key:p.key,reason:'нет перевода в ответе модели'});continue;}
   const text=restore(raw.trim(),p.tokens);
   if(text===null){bad.push({key:p.key,reason:'модель потеряла или изменила плейсхолдеры'});continue;}
   const m=checks.mismatch(p.source,text);
   if(m){bad.push({key:p.key,reason:'плейсхолдеры не совпадают: '+checks.describe(m)});continue;}
   done.set(p.key,text);
  }
  return bad;
 };
 let retry=[];
 for(let i=0;i<items.length;i+=size){check();retry.push(...await run(items.slice(i,i+size)));progress(Math.min(items.length,i+size),items.length);}
 // One more attempt for failures, in small batches; what fails again is reported, never written.
 if(retry.length){const again=items.filter(x=>retry.some(r=>r.key===x.key));const last=new Map(retry.map(r=>[r.key,r.reason]));retry=[];
  for(let i=0;i<again.length;i+=5){check();for(const r of await run(again.slice(i,i+5)))failed.push({key:r.key,reason:r.reason||last.get(r.key)});}}
 return {done,failed};
}
module.exports={translate,protect,restore};
