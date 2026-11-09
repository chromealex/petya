// People records, text: an absence typed in the chat («Маша в отпуске с 10 по 20», «Олег на больничном до 20-го»,
// «Ваня взял отгул в пятницу») and colleagues named in any case («Маши», «с Олегом», «Марии») matched to «Команда».
// Moved here from «Планирование спринта» (which re-exports it) so every app reads absences the same way.
// Dates are whole local days, inclusive, as 'YYYY-MM-DD'.
const match=require('../team-match.cjs');
const DAY=86400000;
const pad=v=>String(v).padStart(2,'0');
const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());};
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const MONTHS=['январ','феврал','март','апрел','ма[йя]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const monthOf=word=>{const w=String(word||'').toLocaleLowerCase('ru');return MONTHS.findIndex(m=>new RegExp('^'+m,'u').test(w));};
const WEEKDAYS=[/^воскресен/u,/^понедельн/u,/^вторник/u,/^сред[уы]?$/u,/^четверг/u,/^пятниц/u,/^суббот/u];
const weekdayOf=word=>{const w=String(word||'').toLocaleLowerCase('ru');return WEEKDAYS.findIndex(r=>r.test(w));};
const ABSENT=/(?:в\s+отпуск\p{L}*|на\s+больничн\p{L}*|в\s+отгул\p{L}*|(?:взял\p{L}*|бер[её]т|возьм[её]т)\s+(?:отгул|выходн\p{L}*)|не\s+будет|отсутству\p{L}*|в\s+командировк\p{L}*|на\s+конференци\p{L}*|болеет|уезжа\p{L}*)/iu;
// «12–16», «с 12 по 16 ноября», «12.11–16.11», «12 ноября – 3 декабря», «до 20-го», «20 ноября» (one day).
const RANGE=/(?:с\s+)?(\d{1,2})(?:[./](\d{1,2}))?(?:\s+([а-яё]+))?\s*(?:[-–—]|по|до)\s*(\d{1,2})(?:[./](\d{1,2}))?(?:-?го)?(?:\s+([а-яё]+))?/iu;
const UNTIL=/(?:^|\s)до\s+(\d{1,2})(?:[./](\d{1,2}))?(?:-?го)?(?:\s+([а-яё]+))?/iu;
const SINGLE=/(?:^|\s)(\d{1,2})(?:[./](\d{1,2}))?(?:\s+([а-яё]+))?(?=\s|$|[,.!?])/iu;
const ON_WEEKDAY=/(?:^|\s)(?:в|во|на)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=\s|$|[,.!?])/iu;

// What kind of absence a word names: vacation, sick leave, a day off, or away (trip, conference, «не будет»).
function kindOf(text){
 const t=String(text||'');
 if(/больничн|болеет|\bsick\b/iu.test(t))return 'sick';
 if(/отгул|выходн|day[\s-]?off/iu.test(t))return 'dayoff';
 if(/отпуск|vacation|holiday/iu.test(t))return 'vacation';
 return 'away';
}

// A chat note about someone's absence: {who, from, to, kind} or null.
function parseNote(text,now=new Date()){
 const t=String(text||'').replace(/^петя[,!\s]+/iu,'').trim();
 const verb=ABSENT.exec(t);if(!verb)return null;
 const who=t.slice(0,verb.index).replace(/^(?:а\s+|кстати\s+|запомни,?\s*(?:что\s+)?|отметь,?\s*(?:что\s+)?|добавь,?\s*(?:что\s+)?)/iu,'').replace(/[,:]+$/,'').trim();
 if(!who||who.split(/\s+/).length>3||!/^\p{L}/u.test(who))return null;
 const rest=t.slice(verb.index+verb[0].length);
 // «не будет 5 минут», «с 10 до 12 часов», «до 18:00»: hours, not days.
 if(/\d{1,2}:\d{2}|(?:^|\s)(?:час\p{L}*|ч|минут\p{L}*|мин|вечер\p{L}*|утр\p{L}*|недел\p{L}*)(?=\s|$|[,.!?])/iu.test(rest))return null;
 const today=dayStart(now);let a,b;
 const month=(m,name)=>m?Number(m)-1:name&&monthOf(name)>=0?monthOf(name):null;
 // A single day or «до N» needs a month («20 ноября», «3.12») or «-го»; a bare number may be anything.
 const dated=x=>!!(x[2]||x[3]&&monthOf(x[3])>=0);
 const r=RANGE.exec(rest);
 if(r){
  const m2=month(r[5],r[6]),m1=month(r[2],r[3])??m2;
  a={d:Number(r[1]),m:m1};b={d:Number(r[4]),m:m2??m1};
 }else{
  const u=UNTIL.exec(rest),w=ON_WEEKDAY.exec(rest);
  if(u&&(dated(u)||/-?го(?=\s|$|[,.!?])/iu.test(u[0]))){a={d:today.getDate(),m:today.getMonth()};b={d:Number(u[1]),m:month(u[2],u[3])};}
  else if(/сегодня/iu.test(rest)){a=b={d:today.getDate(),m:today.getMonth()};}
  else if(/послезавтра/iu.test(rest)){const d=new Date(today);d.setDate(d.getDate()+2);a=b={d:d.getDate(),m:d.getMonth()};}
  else if(/завтра/iu.test(rest)){const d=new Date(today);d.setDate(d.getDate()+1);a=b={d:d.getDate(),m:d.getMonth()};}
  else if(w){const want=weekdayOf(w[1]),d=new Date(today);do d.setDate(d.getDate()+1);while(d.getDay()!==want);if(today.getDay()===want)d.setTime(today.getTime());a=b={d:d.getDate(),m:d.getMonth(),y:d.getFullYear()};}
  else{const one=SINGLE.exec(rest);if(!one||!dated(one))return null;a=b={d:Number(one[1]),m:month(one[2],one[3])};}
 }
 // Without a month: the nearest such days not entirely in the past.
 let from=new Date(a.y??today.getFullYear(),a.m??today.getMonth(),a.d),to=new Date(b.y??today.getFullYear(),b.m??(a.m??today.getMonth()),b.d);
 if(b.m==null&&a.m==null&&b.d<a.d)to=new Date(from.getFullYear(),from.getMonth()+1,b.d);
 if(to<from)to.setFullYear(to.getFullYear()+1);
 if(to<new Date(today.getTime()-DAY)){if(a.m==null){from.setMonth(from.getMonth()+1);to.setMonth(to.getMonth()+1);}else{from.setFullYear(from.getFullYear()+1);to.setFullYear(to.getFullYear()+1);}}
 if(from.getDate()!==a.d||to.getDate()!==b.d||(to-from)>120*DAY)return null;
 const k=kindOf(verb[0]);
 // Sprint planning has always called days off and trips «away»; the kind only labels the bar.
 return {who,from:ymd(from),to:ymd(to),kind:k};
}

// «Маши», «Олегу», «Мария Петрова»: a member of «Команда» by name, alias or the Jira name, also in another case.
// A word matches a name word with a case ending: «Маши» — «Маша», «Олегу» — «Олег», not «Пётр» — «Петрова».
const low=w=>String(w||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const sameWord=(w,n)=>w===n||n.length>=3&&w.length-n.length<=2&&w.length>=n.length&&w.startsWith(n.length>3?n.slice(0,-1):n)||n.length>3&&w.length===n.length&&w.slice(0,-1)===n.slice(0,-1);
const latinSame=(a,b)=>match.latin(a)===match.latin(b);
const nameWords=m=>[m.name,m.jiraName,...String(m.aliases||'').split(/[,;]/)].join(' ').split(/[\s-]+/).filter(Boolean).map(low);
function member(who,members){
 const asked=String(who).split(/[\s-]+/).filter(w=>w.length>=2).map(low);
 if(!asked.length)return null;
 const hits=members.filter(m=>asked.every(a=>nameWords(m).some(n=>sameWord(a,n))));
 if(hits.length===1)return hits[0];
 const direct=hits.length?null:match.match(who,members);
 return direct&&asked.every(a=>nameWords(direct).some(n=>sameWord(a,n)||latinSame(a,n)))?direct:null;
}
// Everyone a word or name can mean («Олег» with two Олегов in the team → both).
function candidates(who,members){
 const asked=String(who).split(/[\s-]+/).filter(w=>w.length>=2).map(low);
 if(!asked.length)return [];
 return members.filter(m=>asked.every(a=>nameWords(m).some(n=>sameWord(a,n))));
}
// Colleagues named anywhere in a phrase: two-word names first («Машу Петрову»), then single words. Words that are
// common Russian words are not names even when an alias equals them. Returns {member} | {many:[members]} | null.
const NOT_NAMES=new Set(['что','как','кто','когда','где','мне','мой','моя','мои','его','ему','она','они','это','этой','этот','неделе','недели','отпуск','отпуске','итоги','встреча','встречи','встрече','подготовь','запиши','обещал','обещала','обещания','команды','команда','всех','все','сегодня','завтра','вернется','вернётся','выйдет','будет']);
function mentioned(text,members){
 const words=String(text||'').split(/[^\p{L}-]+/u).filter(w=>w.length>=3&&!NOT_NAMES.has(low(w)));
 const found=new Map(),ambiguous=[];
 for(let i=0;i<words.length;i++){
  const two=i+1<words.length?member(words[i]+' '+words[i+1],members):null;
  if(two){found.set(two.name,two);i++;continue;}
  const one=member(words[i],members);
  if(one){found.set(one.name,one);continue;}
  const many=candidates(words[i],members);if(many.length>1)ambiguous.push(many);
 }
 if(found.size===1)return {member:[...found.values()][0]};
 if(found.size>1)return {many:[...found.values()]};
 if(ambiguous.length)return {many:ambiguous[0]};
 return null;
}
const memberKey=m=>m.jiraId||m.email||m.name;
// Calendar titles that say someone is away: vacation, out of office, sick leave, a day off.
const OOO=/отпуск|vacation|holiday|\booo\b|out of office|больничн|\bsick\b|day[\s-]?off|отгул|выходн\p{L}*\s+день/iu;
module.exports={parseNote,member,candidates,mentioned,memberKey,kindOf,OOO,ymd,dayStart,monthOf,weekdayOf,DAY};
