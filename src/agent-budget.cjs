const fs = require('node:fs');
function claudeBudget(data, now = Date.now()) {
  if (!data || !Number.isFinite(data.observedAt) || data.observedAt > now + 10000 || now - data.observedAt > 300000) return {state:'unknown',reason:'Нет свежих данных о лимитах Claude'};
  const windows = ['five_hour','seven_day','spend_limit'].map(key=>data.rate_limits?.[key]).filter(Boolean);
  const valid = windows.filter(w=>typeof w.used_percentage==='number' && Number.isFinite(w.used_percentage) && w.used_percentage>=0 && Number.isFinite(w.resets_at) && w.resets_at*1000>now);
  if (!valid.length) return {state:'unknown',reason:'Claude не сообщил действующие лимиты'};
  const remaining = Math.max(0,100-Math.max(...valid.map(w=>w.used_percentage)));
  return {state:remaining<=20?'low':'available',remaining,reason:`Остаток лимита Claude: ${Math.round(remaining)}%`};
}
function readBudget(file, now) {
  try { if(fs.statSync(file).size>16384) return {state:'unknown',reason:'Некорректные данные о лимитах Claude'}; return claudeBudget(JSON.parse(fs.readFileSync(file,'utf8')),now); }
  catch { return {state:'unknown',reason:'Лимиты Claude сейчас недоступны'}; }
}
module.exports={claudeBudget,readBudget};
