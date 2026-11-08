// The period a time question is about, in local time: today (default), yesterday, a weekday of this week, this or
// last week (Monday to Sunday), this or last month, the last N days. Read by code, never the model.
const DAY=86400000;
const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime();};
const addDays=(t,n)=>{const d=new Date(t);d.setDate(d.getDate()+n);return d.getTime();};
const weekStart=t=>{const d=new Date(startOfDay(t));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();};
const monthStart=t=>{const d=new Date(startOfDay(t));d.setDate(1);return d.getTime();};
const WEEKDAYS=[/понедельник/iu,/вторник/iu,/сред[уаые]/iu,/четверг/iu,/пятниц/iu,/суббот/iu,/воскресень/iu];
const WORDS={один:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,десять:10,четырнадцать:14,тридцать:30};

// {kind:'day'|'week'|'month'|'days', label, phrase, from, to}: `phrase` is how a reply starts («за эту неделю»);
// `to` is never later than the end of today.
function parse(text,now=Date.now()){
 const t=String(text||'').toLocaleLowerCase();
 const today=startOfDay(now);
 const day=(from,label,phrase=label)=>({kind:'day',label,phrase,from,to:addDays(from,1)});
 if(/позавчера/u.test(t))return day(addDays(today,-2),'позавчера');
 if(/(?:^|[^\p{L}])вчера/u.test(t))return day(addDays(today,-1),'вчера');
 if(/прошл\p{L}*\s+недел|предыдущ\p{L}*\s+недел/u.test(t)){const a=addDays(weekStart(now),-7);return {kind:'week',label:'прошлая неделя',phrase:'за прошлую неделю',from:a,to:addDays(a,7)};}
 if(/(?:эт\p{L}*|текущ\p{L}*)\s+недел|за\s+неделю|недел[яюи](?=$|[^\p{L}])/u.test(t)){const a=weekStart(now);return {kind:'week',label:'эта неделя',phrase:'за эту неделю',from:a,to:addDays(today,1)};}
 if(/прошл\p{L}*\s+месяц/u.test(t)){const d=new Date(monthStart(now));d.setMonth(d.getMonth()-1);const a=d.getTime();return {kind:'month',label:'прошлый месяц',phrase:'за прошлый месяц',from:a,to:monthStart(now)};}
 if(/(?:эт\p{L}*|текущ\p{L}*)\s+месяц|за\s+месяц/u.test(t))return {kind:'month',label:'этот месяц',phrase:'за этот месяц',from:monthStart(now),to:addDays(today,1)};
 const n=/(?:за\s+)?(?:последни\p{L}*\s+)?(\d{1,2}|один|два|две|три|четыре|пять|шесть|семь|десять|четырнадцать|тридцать)\s+(?:дн\p{L}*|день)/u.exec(t);
 if(n){const k=Math.min(31,Math.max(1,/^\d+$/.test(n[1])?Number(n[1]):WORDS[n[1]]));return {kind:'days',label:'последние '+k+' дн.',phrase:'за последние '+k+' '+(k%10===1&&k%100!==11?'день':k%10>=2&&k%10<=4&&(k%100<10||k%100>=20)?'дня':'дней'),from:addDays(today,1-k),to:addDays(today,1)};}
 const w=WEEKDAYS.findIndex(r=>new RegExp('(?:^|[^\\p{L}])(?:в|во|за)\\s+'+r.source,'iu').test(t));
 if(w>=0){let a=addDays(weekStart(now),w);if(a>today)a=addDays(a,-7);return day(a,['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'][w],['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'][w]);}
 return day(today,'сегодня');
}
module.exports={parse,startOfDay,addDays,weekStart,DAY};
