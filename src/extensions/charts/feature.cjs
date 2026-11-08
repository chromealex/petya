// Charts plugin, main process: teaches the chat model to answer with a ```chart block when a diagram is asked for.
// Rendering lives in chart-cards.js; data comes from the answer itself or from other plugins (chart-reply.cjs).
const asks=/(?:диаграмм|график|пончик|кругов|доли\b|долю|распредел|соотношен|chart|donut|pie)/iu;
function rule(topic){
 const last=[...(topic?.messages||[])].reverse().find(m=>m.role==='user')?.text||'';
 if(!asks.test(last))return '';
 return 'Если просят диаграмму или доли, добавь в конец answer блок:\n```chart\n{"type":"donut","title":"Название","unit":"","rows":[{"label":"Категория","value":12}]}\n```\nТип "donut" для долей целого, "bars" для сравнения. Только числа из разговора или справочных данных, не выдумывай. 2–12 строк.';
}
module.exports={name:'charts',setup(){require('../../dialogue-request.cjs').rules.push(rule);return {};},rule};
