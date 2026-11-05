// Grades one live-check turn: the global checks every answer must pass, plus the case's own expectations
// (src/live-cases.cjs). Returns the list of failed checks; an empty list is a pass.
const re=v=>v instanceof RegExp?v:new RegExp(v,'iu');
function grade(r,checks={}){
 const fail=[],text=String(r?.text||''),by=String(r?.by||'');
 if(r?.failure)fail.push('нет ответа: '+r.failure);
 else if(r?.error)fail.push('ошибка');
 if(!text.trim())fail.push('пустой ответ');
 if(/\{"(?:understood|answer|intent|skill)"|<selected_skill>|\bundefined\b|\[object Object\]|\bNaN\b/u.test(text))fail.push('служебный текст в ответе');
 if(!checks.en&&text.trim()&&!/\p{Script=Cyrillic}/u.test(text))fail.push('ответ не по-русски');
 // Petya speaks «на ты»: a formal «вы» to the user is a mistake (quotes and «вы» in drafts for others are fine).
 if(/(?:^|[.!?]\s+)(?:Вы|Вам|Вас|Ваш\p{L}*)\s/u.test(text)&&!checks.formalOk)fail.push('обращение на «вы»');
 if(checks.by&&!re(checks.by).test(by))fail.push('обработчик «'+by+'», ожидался /'+checks.by+'/');
 if(checks.notBy&&re(checks.notBy).test(by))fail.push('обработчик «'+by+'» не ожидался');
 if(checks.has&&!re(checks.has).test(text))fail.push('нет /'+checks.has+'/');
 if(checks.not&&re(checks.not).test(text))fail.push('есть /'+checks.not+'/');
 if(checks.question===true&&!r?.question)fail.push('ожидался уточняющий вопрос');
 if(checks.question===false&&r?.question)fail.push('лишний уточняющий вопрос');
 return fail;
}
// A short summary of a report: totals and failures grouped by scenario.
function summary(report){
 const turns=report.scenarios.flatMap(s=>s.turns.map(t=>({...t,scenario:s.name})));
 const failed=turns.filter(t=>t.fail?.length);
 return {total:turns.length,passed:turns.length-failed.length,failed:failed.length,avgMs:Math.round(turns.reduce((n,t)=>n+(t.ms||0),0)/Math.max(1,turns.length)),
  byScenario:Object.fromEntries(report.scenarios.map(s=>[s.name,s.turns.filter(t=>t.fail?.length).length+'/'+s.turns.length]))};
}
module.exports={grade,summary};
