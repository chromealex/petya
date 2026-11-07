const {randomUUID}=require('node:crypto');
const clean=s=>String(s||'').trim().replace(/[.!?]+$/u,'').replace(/\s+/g,' ');
const key=s=>clean(s).toLocaleLowerCase().replace(/ё/g,'е');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function rule(input){
 const from=clean(input?.from),to=clean(input?.to),scope=clean(input?.scope);
 if(!from||!to||from.length>1000||to.length>2000||scope.length>100)throw new Error('Укажите исходную фразу, значение и при необходимости ключ проекта.');
 if(key(from)===key(to))throw new Error('Фраза и значение совпадают.');
 return {id:input.id||randomUUID(),from,to,scope,kind:input.kind==='correction'?'correction':'alias',enabled:input.enabled!==false,...input.origin==='chat'?{origin:'chat'}:{}};
}
function applyRules(command,rules,scope=''){
 const eligible=rules.filter(r=>r.enabled&&(!r.scope||key(r.scope)===key(scope)));
 const scoped=new Map();for(const r of eligible){const k=r.kind+':'+key(r.from);if(!scoped.has(k)||r.scope)scoped.set(k,r);}
 const matches=[...scoped.values()].filter(r=>r.kind==='correction'&&key(r.from)===key(command));
 if(matches.length)return {text:matches[0].to,rules:[matches[0]]};
 const aliases=[...scoped.values()].filter(r=>r.kind==='alias').sort((a,b)=>b.from.length-a.from.length);
 if(!aliases.length)return {text:command,rules:[]};
 // One pass: replacements cannot trigger other replacements or match parts of names.
 const re=new RegExp('(?<![\\p{L}\\p{N}_])('+aliases.map(r=>escape(r.from).replace(/[её]/giu,'[её]')).join('|')+')(?![\\p{L}\\p{N}_])','giu');
 const used=[];const text=command.replace(re,value=>{const r=aliases.find(r=>key(r.from)===key(value));if(!r)return value;if(!used.includes(r))used.push(r);return r.to;});if(text.length>4000)throw new Error('После применения словаря фраза стала слишком длинной. Сократите правило.');return {text,rules:used};
}
// Corrections of Petya's last answer, in the user's own words:
//  • the right request: «нет, я имел в виду X», «я имел ввиду не это, а X», «не то — мне нужен X», «речь о X»;
//  • how it should have been done: «не так надо было, надо списком», «лучше короче»;
//  • only that it was wrong: «я не это имел в виду», «не так», «не то» — then Petya asks what was meant.
// Returns a dictionary rule, {refine:text}, {ask:true}, {error} or null.
const MEANT=/(?:я\s+)?(?:имел[аи]?|имелось|подразумевал[аи]?)\s+(?:в\s*виду|ввиду)|я\s+(?:хотел[аи]?|просил[аи]?)(?:\s+(?:сказать|спросить|узнать|увидеть))?|речь\s+(?:шла\s+)?(?:о|об|про)|я\s+(?:спрашивал[аи]?\s+)?про|мне\s+нужн[аоы]?|нужн[аоы]\s+было|надо\s+было|лучше(?:\s+бы)?|вместо\s+этого|правильно\s+(?:так|будет)/iu;
const WRONG=/^(?:нет|неа|не-а|ну\s+нет|не\s+совсем|ты\s+(?:неправильно|не\s+так|не)\s+понял[а]?|неправильно(?:\s+понял[а]?)?|не\s+(?:то|это|так|туда|о\s+том|про\s+то|об\s+этом)|ошибся|ошибка|мимо|это\s+не\s+то|не\s+то\s+(?:что|ты)|я\s+(?:не\s+(?:это|то|так|об\s+этом|про\s+это)\s+(?:имел[аи]?\s+(?:в\s*виду|ввиду)|просил[аи]?|хотел[аи]?|спрашивал[аи]?)|(?:имел[аи]?\s+(?:в\s*виду|ввиду)|просил[аи]?|хотел[аи]?)\s+не\s+(?:это|то|так))|не\s+так\s+(?:надо|нужно)\s+было|(?:надо|нужно)\s+было\s+не\s+так|(?:совсем\s+)?не\s+(?:тот|та|те)\s+\S+)(?=$|\s*[,.!—:;-]|\s+(?:а|мне|я|нужн|надо|речь))/iu;
const BARE=/^(?:и\s+)?(?:не\s+(?:тот|та|те)\s+\S+|(?:ответ|результат|задач[аи]|проект|чат|файл|версия)\s+не\s+(?:тот|та|те|то))$/iu;
function correction(command,topic){
 const text=String(command||'').trim().replace(/[.!…]+$/u,'');
 if(!text||text.length>600||/\?$/u.test(text)||/^(?:что|почему|как)\s/iu.test(text))return null;
 const wrong=WRONG.exec(text);if(!wrong&&!/^(?:нет[,\s—-]+)?(?:ты\s+неправильно\s+понял[а]?[,\s—-]+)?я\s+имел[аи]?\s+(?:в\s*виду|ввиду)[,:\s—-]/iu.test(text))return null;
 const previous=[...(topic?.messages||[])].reverse().find(m=>m.role==='user'&&!correction.is(m.text));
 const answered=(topic?.messages||[]).some(m=>m.role==='assistant');
 // What follows the rejection: the right request or how it should have been done.
 let rest=wrong?text.slice(wrong[0].length):text;
 rest=rest.replace(/^[\s,.!—:;-]+/u,'').replace(/^(?:а|но|и|просто|вообще)\s+/iu,'');
 const meant=MEANT.exec(rest);let value='',refine=false;
 if(meant&&meant.index<=12){value=rest.slice(meant.index+meant[0].length).replace(/^[\s,:—-]+/u,'').replace(/^(?:не\s+(?:это|то)[,\s]+а\s+)/iu,'');refine=/надо|нужн[оа]\s+было|лучше|правильно|^речь|про$/iu.test(meant[0].trim());}
 else if(rest)value=rest.replace(/^(?:а|мне|нужн[аоы]?)\s+/iu,'');
 value=value.trim();
 if(!previous)return wrong&&!value?null:{error:'Не нашёл, что поправить. Напишите просьбу целиком.'};
 // A bare «нет» answers Petya's own question; only a rejection of an answer asks what was meant.
 const last=[...(topic?.messages||[])].reverse().find(m=>m.role==='assistant');
 if(!value){if(!answered||topic?.pending||/\?\s*$/u.test(String(last?.text||''))&&/^(?:нет|неа|не-а|ну\s+нет)$/iu.test(text)||(!wrong&&!BARE.test(text)))return null;return {ask:true,from:previous.originalText||previous.text};}
 if(/^(?:другой|другую|другое|что-то|кого-то|иначе)(?:\s|$)/iu.test(value)&&value.split(/\s+/).length<3)return {ask:true,from:previous.originalText||previous.text};
 if(refine||value.split(/\s+/).length<2)return {refine:value,from:previous.originalText||previous.text};
 return rule({from:previous.originalText||previous.text,to:value,scope:topic?.jiraProject||'',kind:'correction',origin:'chat'});
}
correction.is=text=>!!WRONG.exec(String(text||'').trim())||/^(?:нет[,\s—-]+)?я\s+имел[аи]?\s+(?:в\s*виду|ввиду)/iu.test(String(text||'').trim());
module.exports={rule,applyRules,correction,key};
