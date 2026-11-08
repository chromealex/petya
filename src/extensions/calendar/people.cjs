// People named in a calendar request («с Машей и Олегом») found in the team directory («Команда»):
// Russian case endings are folded («Машей» → «Маша», «Олегом» → «Олег»), aliases and Latin spellings count
// (team-match). A name that fits several members or has no email is a clarification, never a guess.
const teamMatch=require('../../team-match.cjs');
const EMAIL=/[^\s@,;<>«»"]+@[^\s@,;<>«»"]+\.[^\s@,;<>«»".]+/gu;
// Words that end the list of people: dates, times, durations, the rest of the request.
const STOP=/^(?:в|во|на|к|до|после|с|со|сегодня|завтра|послезавтра|этой|этот|следующ\p{L}*|утром|днём|днем|вечером|про|по|о|об|для|чтобы|минут\p{L}*|час\p{L}*|полчаса|встреч\p{L}*|созвон\p{L}*|\d.*)$/u;
const FILLER=/^(?:мной|меня|нами|всеми|ещё|еще|тоже|коллег\p{L}*|командой)$/u;

// Names after «с/со» up to the first word that is not a name: «с Машей, Олегом и Сашей в четверг» → three names.
function mentioned(text){
 const out=[],emails=[...String(text||'').matchAll(EMAIL)].map(m=>m[0].replace(/[.,;:!?]+$/,''));
 const clean=String(text||'').replace(EMAIL,' ');
 for(const m of clean.matchAll(/(?:^|[\s,(])(?:с|со)\s+([^.!?\n]+)/giu)){
  const words=m[1].split(/\s+/);let current=[];
  const push=()=>{if(current.length)out.push(current.join(' '));current=[];};
  for(const raw of words){
   const w=raw.replace(/[«»"(),;:]+/g,''),lower=w.toLocaleLowerCase(),comma=/[,;]$/.test(raw);
   if(!w||lower==='и'){push();continue;}
   if(STOP.test(lower))break;
   if(FILLER.test(lower)){push();continue;}
   // A name starts with a capital letter; a lower-case word ends the list (e.g. «с удовольствием»).
   if(!/^\p{Lu}[\p{L}-]*$/u.test(w))break;
   current.push(w);
   if(comma||current.length>=3)push();
  }
  push();
 }
 return {names:[...new Set(out)],emails:[...new Set(emails)]};
}
// Folded stem of a Russian first name in any case: «Машей», «Маши», «Маша» → «маш».
function stem(word){
 const w=String(word||'').toLocaleLowerCase().replace(/ё/g,'е');
 const cut=/(?:ой|ей|ою|ею|ем|ом|ым|им|ами|ями|ах|ях|ов|ев|ы|и|а|я|у|ю|е|о|й|ь)$/u.exec(w);
 const base=cut&&w.length-cut[0].length>=2?w.slice(0,-cut[0].length):w;
 return base;
}
// Stems match when equal, or one extends the other by a short suffix («иванов» / «иван» from «Ивановым» / «Иванов»).
const same=(a,b)=>a===b||Math.min(a.length,b.length)>=3&&Math.abs(a.length-b.length)<=2&&(a.startsWith(b)||b.startsWith(a));
function variants(member){
 return [member.name,...String(member.aliases||'').split(/[,;]/),member.jiraName,String(member.email||'').split('@')[0].replace(/[._-]+/g,' ')].map(v=>String(v||'').trim()).filter(Boolean);
}
// Members that fit one spoken name, best first.
function candidates(name,members){
 const words=name.split(/\s+/).map(stem);
 const rows=[];
 for(const m of members){
  let best=0;
  for(const v of variants(m)){
   const vw=v.split(/\s+/).map(stem);
   const hit=words.filter(w=>vw.some(v=>same(w,v))).length;
   if(hit===words.length)best=Math.max(best,hit===vw.length?3:2);
   else{const s=teamMatch.score(name,v);if(s>=2)best=Math.max(best,1);}
  }
  if(best)rows.push({m,best});
 }
 rows.sort((a,b)=>b.best-a.best);
 const top=rows.filter(r=>r.best===rows[0]?.best).map(r=>r.m);
 return top;
}
// {resolved:[{name,email}], problem:{name, kind:'ambiguous'|'missing'|'noemail', options}}
function resolve(names,members,fixed={}){
 const resolved=[];
 for(const name of names){
  if(Object.hasOwn(fixed,name)){const f=fixed[name];if(f)resolved.push(f);continue;}
  const found=candidates(name,members);
  if(found.length>1)return {resolved,problem:{name,kind:'ambiguous',options:found.slice(0,6)}};
  if(!found.length)return {resolved,problem:{name,kind:'missing',options:[]}};
  if(!found[0].email)return {resolved,problem:{name,kind:'noemail',member:found[0],options:[]}};
  resolved.push({name:found[0].name,email:found[0].email.toLowerCase()});
 }
 return {resolved,problem:null};
}
// Nominative short name for titles: the alias the user used if it matches, else the first word of the name.
const short=person=>String(person.name||person.email).split(/\s+/)[0];
module.exports={mentioned,stem,candidates,resolve,short,EMAIL};
