// «Проверка тона», softer wording from the local model, kept only when it is grounded: a replacement keeps the
// numbers, links, @mentions, #channels, task keys and `code` of what it replaces, adds none of its own, is in the
// same language and is not much longer. Anything else is dropped — a finding then simply has no suggestion.
const kit=require('../app-kit.cjs');
const {language}=require('../../features/outgoing.cjs');

// Facts a rewrite must not lose or invent.
const FACTS=/https?:\/\/\S+|[@#][\p{L}\p{N}_.-]+|(?<![\p{L}\p{N}-])[A-Z][A-Z0-9]+-\d+(?![\p{L}\p{N}])|`[^`]+`|\d+(?:[.,:]\d+)*/gu;
const facts=text=>(String(text).match(FACTS)||[]).map(f=>f.replace(/[.,]+$/,''));
const scriptOf=text=>{const cyr=(String(text).match(/[а-яё]/giu)||[]).length,lat=(String(text).match(/[a-z]/gi)||[]).length;return cyr+lat?cyr>=lat?'ru':'en':'';};

// Whether `replacement` may stand for `original` inside `whole` (the full draft).
function grounded(original,replacement,whole,lang){
 const r=String(replacement??'');
 if(!r.trim()||r.trim()===String(original).trim())return false;
 if(r.length>Math.max(80,String(original).length*1.6+40))return false;
 const want=lang||language(whole);
 const own=scriptOf(r.replace(FACTS,''));
 if(want&&own&&own!==want)return false;
 // Every fact of the original stays; every fact of the replacement exists somewhere in the draft.
 const have=facts(r),all=new Set(facts(whole));
 if(facts(original).some(f=>!have.includes(f)))return false;
 if(have.some(f=>!all.has(f)))return false;
 return true;
}

const SCHEMA={type:'object',properties:{
 replacements:{type:'array',items:{type:'object',properties:{index:{type:'integer'},replacement:{type:'string'}},required:['index','replacement']},maxItems:12},
 rewrite:{type:'string'}},required:['replacements','rewrite']};
const AUDIENCE={public:'публичный канал, читают многие, в том числе люди вне контекста',team:'коллеги в рабочем канале',direct:'личное сообщение одному человеку',customer:'игрок или клиент, человек вне команды'};

// Model suggestions for findings without one, and (when `rewrite`) a softer whole message.
// Returns {suggestions: Map(index → text), rewrite: string|''} — empty when there is no model or it answered badly.
async function soften(s,{text,findings,audience='team',lang,rewrite=false}){
 const open=findings.map((f,index)=>({index,f})).filter(({f})=>f.span&&f.suggestion===undefined);
 if(!open.length&&!rewrite)return {suggestions:new Map(),rewrite:''};
 const want=lang||language(text)||'ru';
 const r=await kit.modelJSON(s,{
  system:'Ты помогаешь смягчить рабочее сообщение, не меняя смысла. Для каждого фрагмента из issues предложи замену, которая звучит спокойно, вежливо и ясно, на том же языке ('+want+'), с теми же фактами: числа, сроки, ссылки, имена, номера задач остаются. Не добавляй новых фактов, обещаний и извинений, которых не было. replacement заменяет ровно fragment внутри текста, поэтому он должен вписываться в предложение. '+(rewrite?'В rewrite дай весь текст целиком, переписанный мягче и яснее с теми же фактами.':'rewrite оставь пустым.'),
  user:{text,audience:AUDIENCE[audience]||AUDIENCE.team,language:want,issues:open.map(({index,f})=>({index,fragment:f.span.text,problem:f.message}))},
  schema:SCHEMA,temperature:0.3,predict:900});
 const suggestions=new Map();
 for(const x of Array.isArray(r?.replacements)?r.replacements:[]){
  const item=open.find(o=>o.index===x?.index);if(!item)continue;
  const replacement=String(x.replacement??'').trim();
  if(grounded(item.f.span.text,replacement,text,want))suggestions.set(item.index,replacement);
 }
 const whole=rewrite&&typeof r?.rewrite==='string'?r.rewrite.trim():'';
 return {suggestions,rewrite:whole&&grounded(text,whole,text,want)&&whole.length<=text.length*1.6+80?whole:''};
}
module.exports={soften,grounded,facts};
