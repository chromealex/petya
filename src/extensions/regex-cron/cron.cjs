// Cron expressions: parsing (5 fields, lists, ranges, steps, month/day names, @daily…), a Russian description
// and the next run times. Day of month and day of week follow cron: when both are restricted, either matches.
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
const ALIASES={'@yearly':'0 0 1 1 *','@annually':'0 0 1 1 *','@monthly':'0 0 1 * *','@weekly':'0 0 * * 0','@daily':'0 0 * * *','@midnight':'0 0 * * *','@hourly':'0 * * * *'};
const FIELDS=[{name:'минуты',min:0,max:59},{name:'часы',min:0,max:23},{name:'дни месяца',min:1,max:31},{name:'месяцы',min:1,max:12,names:MONTHS,offset:1},{name:'дни недели',min:0,max:7,names:DAYS}];

function field(text,spec){
 const values=new Set();
 const num=t=>{const lower=t.toLowerCase();const i=spec.names?.indexOf(lower);if(i>=0)return i+(spec.offset||0);if(!/^\d+$/.test(t))throw Error('Непонятное значение «'+t+'» в поле «'+spec.name+'».');return Number(t);};
 for(const part of text.split(',')){
  const [range,stepText]=part.split('/');
  const step=stepText===undefined?1:Number(stepText);
  if(!Number.isInteger(step)||step<1)throw Error('Шаг в поле «'+spec.name+'» должен быть целым больше нуля.');
  let from,to;
  if(range==='*'){from=spec.min;to=spec.max;}
  else if(range.includes('-')){[from,to]=range.split('-').map(num);}
  else{from=num(range);to=stepText===undefined?from:spec.max;}
  if(from<spec.min||to>spec.max||from>to)throw Error('Поле «'+spec.name+'»: допустимо '+spec.min+'–'+spec.max+'.');
  for(let v=from;v<=to;v+=step)values.add(v);
 }
 return values;
}
function parse(expression){
 const raw=String(expression||'').trim();
 const text=ALIASES[raw.toLowerCase()]||raw;
 const parts=text.split(/\s+/);
 if(parts.length===6)throw Error('Это cron с секундами или годом (6 полей). Петя разбирает классический cron из 5 полей.');
 if(parts.length!==5)throw Error('В cron должно быть 5 полей: минуты, часы, день месяца, месяц, день недели.');
 const [minute,hour,day,month,weekday]=parts.map((p,i)=>field(p,FIELDS[i]));
 if(weekday.has(7)){weekday.delete(7);weekday.add(0);}
 return {expression:raw,fields:parts,minute,hour,day,month,weekday,anyDay:parts[2]==='*',anyWeekday:parts[4]==='*'};
}
function matchesDay(c,date){
 const d=c.day.has(date.getDate()),w=c.weekday.has(date.getDay());
 if(c.anyDay&&c.anyWeekday)return true;
 if(c.anyDay)return w;
 if(c.anyWeekday)return d;
 return d||w;
}
// Next `count` run times after `from` (local time), searched day by day for up to five years.
function next(c,from=new Date(),count=5){
 const out=[];
 const day=new Date(from.getFullYear(),from.getMonth(),from.getDate());
 const hours=[...c.hour].sort((a,b)=>a-b),minutes=[...c.minute].sort((a,b)=>a-b);
 for(let i=0;i<366*5&&out.length<count;i++,day.setDate(day.getDate()+1)){
  if(!c.month.has(day.getMonth()+1)||!matchesDay(c,day))continue;
  for(const h of hours)for(const m of minutes){
   const t=new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,m);
   if(t>from&&out.length<count)out.push(t);
  }
 }
 return out;
}
const pad=n=>String(n).padStart(2,'0');
const MONTH_NAMES=['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const DAY_NAMES=['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'];
const list=values=>{const a=[...values].sort((x,y)=>x-y);return a.length>6?a.slice(0,6).join(', ')+'…':a.join(', ');};
const contiguous=values=>{const a=[...values].sort((x,y)=>x-y);return a.length>1&&a.at(-1)-a[0]===a.length-1;};
function step(text){const m=/^\*\/(\d+)$/.exec(text);return m?Number(m[1]):null;}
// A plain Russian description: «каждые 15 минут», «в 09:30 по будням», «в 03:00 1-го числа».
function describe(c){
 const [mi,ho,da,mo,wd]=c.fields;
 let time;
 if(c.minute.size===60&&c.hour.size===24)time='каждую минуту';
 else if(step(mi)&&c.hour.size===24)time='каждые '+step(mi)+' мин';
 else if(step(mi)&&contiguous(c.hour))time='каждые '+step(mi)+' мин с '+pad(Math.min(...c.hour))+':00 до '+pad(Math.max(...c.hour))+':'+pad(Math.max(...c.minute));
 else if(c.minute.size===1&&c.hour.size===24)time='каждый час в '+pad([...c.minute][0])+' мин';
 else if(c.minute.size===1&&step(ho))time='каждые '+step(ho)+' ч в '+pad([...c.minute][0])+' мин';
 else if(c.minute.size*c.hour.size<=6)time='в '+[...c.hour].sort((a,b)=>a-b).flatMap(h=>[...c.minute].sort((a,b)=>a-b).map(m=>pad(h)+':'+pad(m))).join(', ');
 else time='в минуты '+list(c.minute)+(c.hour.size===24?' каждого часа':' часов '+list(c.hour));
 const parts=[time];
 const weekdays=[...c.weekday].sort((a,b)=>a-b).join(',');
 if(!c.anyWeekday){
  if(weekdays==='1,2,3,4,5')parts.push('по будням');
  else if(weekdays==='0,6')parts.push('по выходным');
  else parts.push('в '+[...c.weekday].sort((a,b)=>(a||7)-(b||7)).map(d=>DAY_NAMES[d]).join(', '));
 }
 if(!c.anyDay)parts.push((c.anyWeekday?'':'или ')+(step(da)?'каждые '+step(da)+' дн.':list(c.day)+'-го числа'));
 if(mo!=='*')parts.push('в '+[...c.month].sort((a,b)=>a-b).map(m=>MONTH_NAMES[m-1]).join(', '));
 return parts.join(' ');
}
// A cron expression inside free text («что значит */15 9-18 * * 1-5?»).
function find(text){
 const alias=/(?:^|\s)(@(?:yearly|annually|monthly|weekly|daily|midnight|hourly))\b/i.exec(text);
 if(alias)return alias[1];
 const token='(?:\\*|\\d+|[a-z]{3})(?:-(?:\\d+|[a-z]{3}))?(?:\\/\\d+)?(?:,(?:\\*|\\d+|[a-z]{3})(?:-(?:\\d+|[a-z]{3}))?(?:\\/\\d+)?)*';
 const m=new RegExp('(?:^|[\\s`«"\'(])('+token+'(?:\\s+'+token+'){4,5})(?=$|[\\s`»"\').,?!])','i').exec(text);
 return m?m[1]:null;
}
module.exports={parse,next,describe,find};
