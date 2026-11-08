// Dates, times and durations in Russian requests, read by code (not by the model), in the computer's local time:
// «сегодня», «завтра», «в пятницу», «на этой неделе», «12 ноября», «в 15:00», «в 3 дня», «на час», «полчаса».
const DAY=86400000;
const WEEKDAYS=[['воскресень[еяю]',0],['понедельник[ау]?',1],['вторник[ау]?',2],['сред[ауеы]',3],['четверг[ау]?',4],['пятниц[ауеы]',5],['суббот[ауеы]',6]];
const MONTHS=['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const NUMBERS={один:1,одну:1,одна:1,два:2,две:2,три:3,четыре:4,пять:5};

const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
// Monday-based week.
const weekStart=d=>{const x=startOfDay(d);return addDays(x,-((x.getDay()+6)%7));};
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const hm=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
function minutes(text){const m=/^(\d{1,2}):(\d{2})$/.exec(String(text||''));if(!m||+m[1]>24||+m[2]>59)return null;return +m[1]*60+ +m[2];}
const at=(day,mins)=>{const x=startOfDay(day);x.setMinutes(mins);return x;};

// The period the request is about: {from,to,label,single,explicit}. `to` is exclusive.
function range(text,now=new Date()){
 const t=String(text||'').toLocaleLowerCase().replace(/ё/g,'е');
 const today=startOfDay(now);
 const one=(day,label)=>({from:day,to:addDays(day,1),label,single:true,explicit:true});
 if(/послезавтра/u.test(t))return one(addDays(today,2),'послезавтра');
 if(/(?:^|[^\p{L}])завтра/u.test(t))return one(addDays(today,1),'завтра');
 if(/(?:^|[^\p{L}])вчера/u.test(t))return one(addDays(today,-1),'вчера');
 if(/(?:^|[^\p{L}])сегодня/u.test(t))return one(today,'сегодня');
 // «12 ноября», «12.11», «12.11.2026»; «в 15.30» is a time, not a date.
 const date=/(?<![\d.])(?<!(?:^|\s)(?:в|во|к|с|до)\s)(\d{1,2})(?:\s+([а-я]+)|\.(\d{1,2})(?:\.(\d{2,4}))?)(?![\d])/u.exec(t);
 if(date){
  const dd=+date[1];let month=null,year=now.getFullYear();
  if(date[2]){const i=MONTHS.findIndex((m,i)=>i===4?/^ма[йяе]/u.test(date[2]):date[2].startsWith(m));if(i>=0)month=i;}
  else{month=+date[3]-1;if(date[4])year=+date[4]<100?2000+ +date[4]:+date[4];}
  if(month!==null&&month>=0&&month<12&&dd>=1&&dd<=31){
   let day=new Date(year,month,dd);
   if(!date[4]&&day<today)day=new Date(year+1,month,dd);
   if(day.getDate()===dd)return one(day,day.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}));
  }
 }
 const next=/следующ\p{L}*|будущ\p{L}*/u.test(t);
 for(const [stem,wd] of WEEKDAYS){
  if(new RegExp('(?:^|[^\\p{L}])'+stem+'(?=$|[^\\p{L}])','u').test(t)){
   // «в пятницу» is the nearest one (today included); «в следующую пятницу» is in the next week.
   let diff=(wd-today.getDay()+7)%7;
   if(next&&weekStart(addDays(today,diff)).getTime()===weekStart(today).getTime())diff+=7;
   const day=addDays(today,diff);
   return one(day,dayLabel(day,now));
  }
 }
 if(/(?:на|в|по)\s+следующ\p{L}*\s+недел/u.test(t)){const from=addDays(weekStart(today),7);return {from,to:addDays(from,7),label:'на следующей неделе',single:false,explicit:true};}
 if(/(?:на|в)\s+(?:эт\p{L}*|текущ\p{L}*)\s+недел|до конца недели|на неделе|на неделю/u.test(t)){
  // The rest of this week; at the weekend «эта неделя» is practically the next one.
  let from=today,to=addDays(weekStart(today),7);
  if(today.getDay()===6||today.getDay()===0){from=addDays(weekStart(today),7);to=addDays(from,7);}
  return {from,to,label:'на этой неделе',single:false,explicit:true};
 }
 return null;
}
function dayLabel(day,now=new Date()){
 const diff=Math.round((startOfDay(day)-startOfDay(now))/DAY);
 if(diff===0)return 'сегодня';if(diff===-1)return 'вчера';if(diff===1)return 'завтра';if(diff===2)return 'послезавтра';
 return day.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
}
// A clock time: «в 15:00», «в 15.30», «в 9 утра», «в 3 дня», «в 7 вечера», «в 15 часов», «к 11».
function time(text){
 const t=String(text||'').toLocaleLowerCase();
 for(const m of t.matchAll(/(?:^|[^\p{L}\d])(?:в|во|к|с)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(час\p{L}*|утра|дня|вечера|ночи|мин\p{L}*))?(?![\d])/gu)){
  let h=+m[1];const min=m[2]?+m[2]:0,part=m[3]||'';
  if(/^мин/u.test(part))continue;
  // «в 3» without a time word is a time only with minutes or a part of day; «в 15» is clearly an hour.
  if(!m[2]&&!part&&h<8)continue;
  if(/дня|вечера/u.test(part)&&h<12)h+=12;
  if(/ночи/u.test(part)&&h===12)h=0;
  if(h>23||min>59)continue;
  return h*60+min;
 }
 return null;
}
// Meeting length in minutes: «на час», «полчаса», «на 45 минут», «полтора часа», «два часа».
function duration(text){
 const t=String(text||'').toLocaleLowerCase();
 if(/полтора\s+час/u.test(t))return 90;
 if(/полчаса|пол\s+часа/u.test(t))return 30;
 const mins=/(\d{1,3})\s*(?:мин|m\b)/u.exec(t);if(mins&&+mins[1]>=10&&+mins[1]<=480)return +mins[1];
 const hours=/(\d|один|одну|два|две|три|четыре)\s*час/u.exec(t);if(hours){const n=NUMBERS[hours[1]]||+hours[1];if(n>=1&&n<=8)return n*60;}
 if(/(?:^|[^\p{L}])час(?:а|ик)?(?=$|[^\p{L}])/u.test(t))return 60;
 return null;
}
module.exports={range,time,duration,dayLabel,startOfDay,addDays,weekStart,ymd,hm,minutes,at,DAY};
