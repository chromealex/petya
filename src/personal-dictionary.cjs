const {randomUUID}=require('node:crypto');
const clean=s=>String(s||'').trim().replace(/[.!?]+$/u,'').replace(/\s+/g,' ');
const key=s=>clean(s).toLocaleLowerCase().replace(/ё/g,'е');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function rule(input){
 const from=clean(input?.from),to=clean(input?.to),scope=clean(input?.scope);
 if(!from||!to||from.length>1000||to.length>2000||scope.length>100)throw new Error('Укажите исходную фразу, значение и при необходимости ключ проекта.');
 if(key(from)===key(to))throw new Error('Фраза и значение совпадают.');
 return {id:input.id||randomUUID(),from,to,scope,kind:input.kind==='correction'?'correction':'alias',enabled:input.enabled!==false};
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
function correction(command,topic){
 const m=/^(?:нет[,\s—-]*)?(?:(?:ты )?неправильно понял[,\s—-]*)?я имел[а]? в виду[,:\s—-]+(.+)/iu.exec(command);
 if(!m)return null;
 if(m[1].trim().split(/\s+/).length<2||/^(?:другой|другую|что-то|кого-то)(?:\s|$)/iu.test(m[1]))return {error:'Повторите правильную фразу целиком после «я имел в виду», чтобы я не потерял остальную часть просьбы.'};
 const previous=[...(topic?.messages||[])].reverse().find(m=>m.role==='user'&&!/я имел[а]? в виду/iu.test(m.text));
 if(!previous)return {error:'Не нашёл предыдущую фразу. Добавьте исправление в разделе «Обучение → Личный словарь».'};
 return rule({from:previous.originalText||previous.text,to:m[1],scope:topic?.jiraProject||'',kind:'correction'});
}
module.exports={rule,applyRules,correction,key};
