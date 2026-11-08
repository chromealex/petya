// Model extraction for mail the deterministic parsers did not understand: the local model answers in a strict JSON
// schema where every field carries `evidence`, a verbatim quote from the message. Code then keeps only what it can
// check: the quote must occur in the message (whitespace-insensitive), an amount and currency must be read back from
// their quote, a date from its quote, the merchant must appear in its quote. A record without its key fields checked
// is dropped. Nothing is guessed: unknown fields stay empty.
const money=require('./money.cjs');
const dates=require('./dates.cjs');
const field=(value)=>({type:'object',properties:{value,evidence:{type:'string'}},required:['value','evidence']});
const SCHEMA={type:'object',properties:{records:{type:'array',maxItems:3,items:{type:'object',properties:{
 type:{type:'string',enum:['subscription','receipt','booking','renewal','none']},
 merchant:field({type:'string'}),
 amount:field({type:'number'}),
 currency:field({type:'string'}),
 period:field({type:'string',enum:['month','year','week','quarter','none']}),
 nextCharge:field({type:'string'}),
 bookingKind:field({type:'string',enum:['flight','hotel','train','bus','car','event','none']}),
 code:field({type:'string'}),
 start:field({type:'string'}),
 end:field({type:'string'}),
 place:field({type:'string'}),
 renewalKind:field({type:'string',enum:['domain','certificate','license','none']}),
 name:field({type:'string'}),
 expires:field({type:'string'})
},required:['type','merchant']}}},required:['records']};
const SYSTEM='Извлеки из письма структурированные записи: подписка или чек (продавец, сумма, валюта ISO, период, дата следующего списания), бронь (вид, код подтверждения, даты, место), продление (домен, сертификат или лицензия и дата окончания). Для каждого поля дай evidence — точную цитату из письма, без изменений. Если поля нет в письме — value пустое, evidence пустая. Даты — в формате ГГГГ-ММ-ДД. Если записей нет — type none.';

const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
// A quote is verbatim when it occurs in the message text (spaces normalized, case-insensitive), 4–300 characters.
const verbatim=(quote,text)=>{const q=norm(quote);return q.length>=4&&q.length<=300&&norm(text).includes(q);};

function check(raw,text,ref){
 const evidence={};
 const ok=(key,f)=>f&&typeof f==='object'&&f.value!==undefined&&f.value!==''&&f.value!=='none'&&verbatim(f.evidence,text)?(evidence[key]=String(f.evidence).trim().slice(0,300),true):false;
 const r={type:raw.type,evidence,source:'model'};
 if(ok('merchant',raw.merchant)&&norm(raw.merchant.evidence).includes(norm(raw.merchant.value)))r.merchant=String(raw.merchant.value).trim().slice(0,80);else delete evidence.merchant;
 if(ok('amount',raw.amount)){
  const read=money.amounts(raw.amount.evidence).find(a=>Math.abs(a.amount-Number(raw.amount.value))<0.01);
  const currency=String(raw.currency?.value||'').toUpperCase();
  if(read&&(!currency||currency===read.currency)){r.amount=read.amount;r.currency=read.currency;}else delete evidence.amount;
 }
 if(ok('period',raw.period)){const p=String(raw.period.value);const words={month:/month|mo\b|месяц|ежемесяч/iu,year:/year|annual|yr\b|год|ежегод/iu,week:/week|недел/iu,quarter:/quarter|квартал/iu};
  if(words[p]?.test(raw.period.evidence))r.period=p;else delete evidence.period;}
 const date=(key,f)=>{if(!ok(key,f))return '';const d=dates.parse(f.evidence,ref);if(d&&d===String(f.value).slice(0,10))return d;delete evidence[key];return '';};
 if(r.type==='subscription'||r.type==='receipt'){
  r.nextCharge=date('nextCharge',raw.nextCharge);
  if(!r.merchant||!r.amount)return null;
  if(r.type==='receipt'&&r.period)r.type='subscription';
  r.period=r.period||null;
 }else if(r.type==='booking'){
  const kind=String(raw.bookingKind?.value||'');
  const code=ok('code',raw.code)&&norm(raw.code.evidence).includes(norm(raw.code.value))?String(raw.code.value).trim().toUpperCase().slice(0,20):(delete evidence.code,'');
  const start=date('start',raw.start),end=date('end',raw.end);
  const place=ok('place',raw.place)&&norm(raw.place.evidence).includes(norm(raw.place.value))?String(raw.place.value).trim().slice(0,120):(delete evidence.place,'');
  if(!['flight','hotel','train','bus','car','event'].includes(kind)||!(code||start))return null;
  r.booking={kind,code,start,end,place};r.merchant=r.merchant||'';
 }else if(r.type==='renewal'){
  const kind=String(raw.renewalKind?.value||'');
  const name=ok('name',raw.name)&&norm(raw.name.evidence).includes(norm(raw.name.value))?String(raw.name.value).trim().slice(0,120):(delete evidence.name,'');
  const expires=date('expires',raw.expires);
  if(!['domain','certificate','license'].includes(kind)||!name||!expires)return null;
  r.renewal={kind,name,expires};r.merchant=r.merchant||'';
 }else return null;
 return r;
}
// `ask(system, user, schema)` → the model's JSON (kit.modelJSON-like); `message` {from, subject, text, at}.
async function extract(ask,message){
 const text=String(message.text||'').slice(0,6000);
 const full=(message.subject||'')+'\n'+text;
 const answer=await ask(SYSTEM,{from:message.from,subject:message.subject,date:new Date(message.at||Date.now()).toISOString().slice(0,10),text},SCHEMA);
 return (Array.isArray(answer?.records)?answer.records:[]).filter(x=>x&&x.type!=='none').map(x=>check(x,full,message.at)).filter(Boolean);
}
module.exports={extract,check,verbatim,SCHEMA};
