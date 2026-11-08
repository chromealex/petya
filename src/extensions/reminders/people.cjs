// A colleague named in a request («Олег», «с Машей», «Марией») found in «Команда»: name, aliases, email, Slack ID.
// Russian case endings are dropped before comparing, so «с Машей» finds the alias «Маша» and «Олегом» finds «Олег».
const team=require('../../team.cjs');
const norm=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
// The stem of one Russian first name in any case: «Машей» → «маш», «Олегом» → «олег», «Марии» → «мари».
function stem(word){
 const w=norm(word);
 const s=w.replace(/(?:ой|ей|ем|ом|ью|ю|у|е|ы|и|а|я)$/u,'');
 return s.length>=3?s:w;
}
function members(settings){try{return team.members(settings);}catch{return [];}}
// Everyone whose first name or alias starts with the stem; one person or several (ambiguous) or none.
function find(settings,name){
 const want=stem(name);if(want.length<3)return [];
 return members(settings).filter(m=>{
  const names=[m.name.split(/\s+/)[0],...String(m.aliases||'').split(/[,;]/),...String(m.name).split(/\s+/)].map(norm).filter(Boolean);
  return names.some(n=>n===norm(name)||n.startsWith(want)&&n.length-want.length<=3);
 }).map(m=>({name:m.name,email:norm(m.email),slackId:m.slackId||m.accounts?.slack?.id||''}));
}
module.exports={find,stem,norm};
