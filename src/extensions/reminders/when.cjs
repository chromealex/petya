// Time of a reminder in a Russian request, read by code (never by the model), in the computer's local time:
// «в 16:00», «через 2 часа», «через полчаса», «завтра утром», «в пятницу в 10», «15 ноября в 12:30»,
// «каждый понедельник в 10», «по будням в 9:30», «каждый день в 9». `parse` returns the moment, the repeat rule,
// how it was understood in words and the rest of the text (what to remind about).
const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
const WEEKDAYS=[
 {day:1,one:'понедельник',acc:'понедельник[ау]?',plural:'понедельникам'},
 {day:2,one:'вторник',acc:'вторник[ау]?',plural:'вторникам'},
 {day:3,one:'среду',acc:'сред[ауеы]',plural:'средам'},
 {day:4,one:'четверг',acc:'четверг[ау]?',plural:'четвергам'},
 {day:5,one:'пятницу',acc:'пятниц[ауеы]',plural:'пятницам'},
 {day:6,one:'субботу',acc:'суббот[ауеы]',plural:'субботам'},
 {day:0,one:'воскресенье',acc:'воскресень[еяю]',plural:'воскресеньям'}
];
const MONTHS=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const NUM={одну:1,одна:1,один:1,пару:2,две:2,два:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,пятнадцать:15,двадцать:20,тридцать:30,сорок:40,'сорок пять':45};
const B='(?<![\\p{L}\\d])',E='(?![\\p{L}\\d])';
const re=(s,f='iu')=>new RegExp(s,f);
const pad=v=>String(v).padStart(2,'0');
const hm=(h,m)=>pad(h)+':'+pad(m);
const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const atTime=(day,h,m)=>{const x=new Date(day);x.setHours(h,m,0,0);return x.getTime();};
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
const norm=t=>String(t||'').replace(/ё/g,'е').replace(/Ё/g,'Е');

// Removes a matched fragment from the working text, keeping spacing sane.
function cut(state,m){state.text=(state.text.slice(0,m.index)+' '+state.text.slice(m.index+m[0].length)).replace(/\s{2,}/g,' ');}

// «через 2 часа», «через полчаса», «через полтора часа», «через минуту», «через пару дней».
const RELATIVE=re(B+'через\\s+(?:(\\d+(?:[.,]\\d+)?|пару|полтора|полторы|одну|один|две|два|три|четыре|пять|шесть|семь|восемь|девять|десять|пятнадцать|двадцать|тридцать|сорок пять|сорок)\\s+)?(полчаса|минут\\p{L}*|мин|час\\p{L}*|дн\\p{L}*|день|сутки|недел\\p{L}*)'+E);
function relative(state,now){
 const m=RELATIVE.exec(state.text);if(!m)return null;
 const word=m[2].toLocaleLowerCase('ru');let n=m[1]===undefined?1:/^[\d.,]+$/.test(m[1])?Number(m[1].replace(',','.')):/^полтор/iu.test(m[1])?1.5:NUM[m[1].toLocaleLowerCase('ru')];
 if(!Number.isFinite(n)||n<=0)return null;
 let unit=/^полчаса/.test(word)?(n=n*0.5,HOUR):/^мин/.test(word)?MIN:/^час/.test(word)?HOUR:/^(?:дн|день|сутки)/.test(word)?DAY:7*DAY;
 const span=Math.round(n*unit);if(span<MIN||span>366*DAY)return {error:'Напомнить можно не раньше чем через минуту и не позже чем через год.'};
 cut(state,m);
 return {at:now+span,unit,words:'через '+m.slice(1).filter(Boolean).join(' ').toLocaleLowerCase('ru')};
}

// Clock time: «в 16:00», «в 9.30», «в 4 дня», «в 9 утра», «в 15 часов», «к 11», «на 16:00», «в полдень».
const CLOCK=re(B+'(?:в|во|к|на|около)\\s+(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*(час\\p{L}*|ч\\.?|утра|дня|вечера|ночи))?'+E);
function clock(state){
 const noon=re(B+'(?:в|к)\\s+(полдень|полночь)'+E).exec(state.text);
 if(noon){cut(state,noon);return {h:/полдень/iu.test(noon[1])?12:0,m:0};}
 for(const m of state.text.matchAll(new RegExp(CLOCK.source,'giu'))){
  let h=Number(m[1]);const min=m[2]?Number(m[2]):0,part=(m[3]||'').toLocaleLowerCase('ru');
  // «через 2 дня в 3» — «в 3» alone is a time; «на 2 дня» is not («на» needs minutes or a part of day).
  if(/^на$/iu.test(m[0].split(/\s/)[0])&&!m[2])continue;
  if(/дня|вечера/.test(part)&&h<12)h+=12;
  else if(/ночи/.test(part)&&h===12)h=0;
  else if(!part&&!m[2]&&h>=1&&h<=6)h+=12; // «в 4» is four in the afternoon, not at night
  if(h>23||min>59)continue;
  cut(state,m);return {h,m:min};
 }
 return null;
}
// «утром», «днём», «вечером», «ночью» — a default time of day.
const PARTS=[[re(B+'(?:утром|с утра|утро)'+E),9,0,'утром'],[re(B+'(?:днем|днём|в обед|в обеденное время)'+E),13,0,'днём'],[re(B+'(?:вечером|вечер)'+E),19,0,'вечером'],[re(B+'(?:ночью)'+E),23,0,'ночью']];
function partOfDay(state){
 for(const [r,h,m,label] of PARTS){const x=r.exec(norm(state.text));if(x){cut(state,x);return {h,m,label};}}
 return null;
}

// Repeats: «каждый день», «ежедневно», «по будням», «каждый понедельник и пятницу», «по средам», «каждое утро».
function repeat(state){
 const t=norm(state.text);
 let m=re(B+'(?:каждый\\s+будний\\s+день|по\\s+будням|в\\s+будни|каждый\\s+рабочий\\s+день|по\\s+рабочим\\s+дням)'+E).exec(t);
 if(m){cut(state,m);return {days:[1,2,3,4,5]};}
 m=re(B+'(?:по\\s+выходным|каждые\\s+выходные|в\\s+выходные)'+E).exec(t);
 if(m){cut(state,m);return {days:[6,0]};}
 m=re(B+'(?:каждый\\s+день|ежедневно|каждые\\s+сутки)'+E).exec(t);
 if(m){cut(state,m);return {days:[0,1,2,3,4,5,6]};}
 m=re(B+'каждое\\s+утро'+E).exec(t);
 if(m){cut(state,m);return {days:[0,1,2,3,4,5,6],h:9,m:0};}
 m=re(B+'каждый\\s+вечер'+E).exec(t);
 if(m){cut(state,m);return {days:[0,1,2,3,4,5,6],h:19,m:0};}
 const one=WEEKDAYS.map(w=>w.acc).join('|'),many=WEEKDAYS.map(w=>w.plural).join('|');
 m=re(B+'(?:кажд\\p{L}*\\s+(?:'+one+')(?:\\s*(?:,|и)\\s*(?:в\\s+|во\\s+)?(?:'+one+'))*|по\\s+(?:'+many+')(?:\\s*(?:,|и)\\s*(?:по\\s+)?(?:'+many+'))*)'+E).exec(t);
 if(m){
  const days=WEEKDAYS.filter(w=>re(B+'(?:'+w.acc+'|'+w.plural+')'+E).test(m[0])).map(w=>w.day);
  cut(state,m);return {days};
 }
 m=re(B+'(?:каждую\\s+неделю|еженедельно|раз\\s+в\\s+неделю)'+E).exec(t);
 if(m){cut(state,m);return {days:null};}
 return null;
}
// Fixes the Russian of one-day repeats: «каждый пятницу» → «каждую пятницу».
function repeatWords(days){
 if(days.length===7)return 'каждый день';
 if(days.length===5&&[1,2,3,4,5].every(d=>days.includes(d)))return 'по будням';
 if(days.length===2&&days.includes(6)&&days.includes(0))return 'по выходным';
 if(days.length===1){const w=WEEKDAYS.find(x=>x.day===days[0]);return ({3:'каждую среду',5:'каждую пятницу',6:'каждую субботу',0:'каждое воскресенье'})[w.day]||'каждый '+w.one;}
 return 'по '+WEEKDAYS.filter(w=>days.includes(w.day)).map(w=>w.plural).join(' и ');
}

// A day: «сегодня», «завтра», «послезавтра», «в пятницу», «в следующий вторник», «15 ноября», «15.11», «15 числа».
function day(state,now){
 const t=norm(state.text),today=startOfDay(now);
 let m=re(B+'послезавтра'+E).exec(t);if(m){cut(state,m);return {date:addDays(today,2),words:'послезавтра'};}
 m=re(B+'завтра'+E).exec(t);if(m){cut(state,m);return {date:addDays(today,1),words:'завтра'};}
 m=re(B+'сегодня'+E).exec(t);if(m){cut(state,m);return {date:today,words:'сегодня',today:true};}
 m=re(B+'(\\d{1,2})\\s+('+MONTHS.join('|')+')\\p{L}*(?:\\s+(\\d{4}))?'+E).exec(t);
 if(m){
  const month=MONTHS.findIndex(x=>re('^'+x).test(m[2]));let year=m[3]?Number(m[3]):today.getFullYear();
  let date=new Date(year,month,Number(m[1]));
  if(date.getDate()!==Number(m[1]))return {error:'Такой даты нет.'};
  if(!m[3]&&date<today)date=new Date(year+1,month,Number(m[1]));
  cut(state,m);return {date,words:null};
 }
 m=re('(?<![\\d.:])(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?(?![\\d:])').exec(t);
 if(m&&!re(B+'(?:в|к|на)\\s+$').test(t.slice(0,m.index))){
  let year=m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):today.getFullYear();
  let date=new Date(year,Number(m[2])-1,Number(m[1]));
  if(date.getDate()!==Number(m[1])||date.getMonth()!==Number(m[2])-1)return {error:'Такой даты нет.'};
  if(!m[3]&&date<today)date=new Date(year+1,Number(m[2])-1,Number(m[1]));
  cut(state,m);return {date,words:null};
 }
 m=re(B+'(\\d{1,2})(?:-?го)?\\s+числа'+E).exec(t);
 if(m){
  const n=Number(m[1]);let date=new Date(today.getFullYear(),today.getMonth(),n);
  if(date<today||date.getDate()!==n)date=new Date(today.getFullYear(),today.getMonth()+1,n);
  if(date.getDate()!==n)return {error:'Такой даты нет.'};
  cut(state,m);return {date,words:null};
 }
 for(const w of WEEKDAYS){
  m=re(B+'(?:в|во)\\s+(?:(следующ\\p{L}*|эт\\p{L}*)\\s+)?'+w.acc+E).exec(t);
  if(!m)continue;
  // «в пятницу» is the nearest one after today; «в следующую пятницу» is in the next week.
  let diff=(w.day-today.getDay()+7)%7;if(diff===0)diff=7;
  const monday=d=>addDays(startOfDay(d),-((d.getDay()+6)%7)).getTime();
  if(m[1]&&/^след/iu.test(m[1])&&monday(addDays(today,diff))===monday(today))diff+=7;
  cut(state,m);return {date:addDays(today,diff),words:null,weekday:true};
 }
 return null;
}

// Next moment of a repeat rule at h:m strictly after `after`.
function nextRepeat(rule,after){
 for(let i=0;i<=8;i++){
  const d=addDays(startOfDay(after),i);
  if(!rule.days.includes(d.getDay()))continue;
  const t=atTime(d,rule.h,rule.m);if(t>after)return t;
 }
 return null;
}

const dayWords=(at,now)=>{
 const diff=Math.round((startOfDay(at)-startOfDay(now))/DAY);
 if(diff===0)return 'сегодня';if(diff===1)return 'завтра';if(diff===2)return 'послезавтра';
 const d=new Date(at),w=WEEKDAYS.find(x=>x.day===d.getDay());
 return (w.day===2?'во ':'в ')+w.one+', '+d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',...(d.getFullYear()!==new Date(now).getFullYear()?{year:'numeric'}:{})})+',';
};
// How Petya understood the time, in words: «сегодня в 18:30», «завтра в 10:00», «каждый понедельник в 10:00».
function describe(item,now=Date.now()){
 if(item.repeat)return repeatWords(item.repeat.days)+' в '+hm(item.repeat.h,item.repeat.m);
 const d=new Date(item.at);
 return dayWords(item.at,now)+' в '+hm(d.getHours(),d.getMinutes());
}
// The absolute date: «понедельник, 9 ноября 2026, 18:30».
function absolute(at){
 const d=new Date(at);
 return d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+hm(d.getHours(),d.getMinutes());
}

// The time of a reminder in `text`: {at, repeat, words, rest, defaulted} | {error} | {needTime, rest, date} | null.
// `rest` is the text without the time words.
function parse(text,now=Date.now(),{defaultTime=[10,0]}={}){
 const state={text:' '+String(text||'')+' '};
 const rel=relative(state,now);
 if(rel?.error)return rel;
 if(rel){
  // «через 2 дня в 15:00»: whole days move the date, the clock time sets the hour.
  const t=rel.unit>=DAY?clock(state):null;
  if(t){const at=atTime(startOfDay(rel.at),t.h,t.m);return {at,repeat:null,words:rel.words+' в '+hm(t.h,t.m),rest:state.text.trim()};}
  return {at:rel.at,repeat:null,words:rel.words,rest:state.text.trim()};
 }
 const rule=repeat(state);
 const when=day(state,now);
 if(when?.error)return when;
 const time=clock(state);
 const part=time?null:partOfDay(state);
 if(!rule&&!when&&!time&&!part)return null;
 const h=time?.h??part?.h??rule?.h,m=time?.m??part?.m??rule?.m;
 if(rule){
  let days=rule.days||[new Date(when?.date||now).getDay()];
  const r={days:[...new Set(days)].sort(),h:h??defaultTime[0],m:m??defaultTime[1]};
  const at=nextRepeat(r,now);
  return {at,repeat:r,words:repeatWords(r.days)+' в '+hm(r.h,r.m),rest:state.text.trim(),defaulted:h===undefined};
 }
 if(!when){
  // Only a time: today if it is still ahead, otherwise tomorrow.
  let at=atTime(startOfDay(now),h,m);
  if(at<=now)at=atTime(addDays(startOfDay(now),1),h,m);
  return {at,repeat:null,words:dayWords(at,now)+' в '+hm(h,m),rest:state.text.trim()};
 }
 if(h===undefined){
  if(when.today)return {needTime:true,date:when.date.getTime(),rest:state.text.trim()};
  const at=atTime(when.date,defaultTime[0],defaultTime[1]);
  return {at,repeat:null,words:dayWords(at,now)+' в '+hm(defaultTime[0],defaultTime[1]),rest:state.text.trim(),defaulted:true};
 }
 const at=atTime(when.date,h,m);
 if(at<=now)return {error:'Это время уже прошло: '+dayWords(at,now)+' в '+hm(h,m)+'.',past:true,rest:state.text.trim()};
 return {at,repeat:null,words:dayWords(at,now)+' в '+hm(h,m),rest:state.text.trim()};
}
// Only a time answer to «Во сколько?»: «в 18», «18:30», «через час», «вечером».
function answer(text,now=Date.now(),date=null){
 const t=String(text||'').trim();
 const bare=/^(\d{1,2})(?:[:.](\d{2}))?$/.exec(t);
 const parsed=parse(bare?'в '+t:t,now);
 if(!parsed||parsed.error||parsed.needTime)return parsed;
 if(date&&!parsed.repeat&&!/^через/.test(parsed.words)){
  const d=new Date(parsed.at),at=atTime(new Date(date),d.getHours(),d.getMinutes());
  if(at>now)return {...parsed,at,words:dayWords(at,now)+' в '+hm(d.getHours(),d.getMinutes())};
 }
 return parsed;
}

module.exports={parse,answer,describe,absolute,nextRepeat,repeatWords,dayWords,plural,hm,startOfDay,addDays,MIN,HOUR,DAY,WEEKDAYS};
