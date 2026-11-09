// Holidays that move game metrics, computed by code for any year: fixed dates, Easter (Western and Orthodox), US
// Thanksgiving with Black Friday and Cyber Monday, and tables for lunar holidays (Lunar New Year, Eid al-Fitr,
// Eid al-Adha) for 2024–2030. `near(date, days, countries)` lists those within ±days of a date.
const FIXED=[
 ['01-01','Новый год','*'],['12-31','Канун Нового года','*'],['01-02','Новогодние каникулы','RU'],['01-07','Рождество (православное)','RU'],
 ['02-14','День святого Валентина','*'],['02-23','День защитника Отечества','RU'],['03-08','Международный женский день','RU'],
 ['05-01','Праздник Весны и Труда','RU'],['05-09','День Победы','RU'],['06-12','День России','RU'],['11-04','День народного единства','RU'],
 ['07-04','День независимости','US'],['10-31','Хэллоуин','*'],['12-24','Сочельник','*'],['12-25','Рождество','*'],['12-26','День подарков','GB'],
 ['10-03','День германского единства','DE'],['05-05','День детей','JP'],['10-01','День образования КНР','CN'],['09-07','День независимости','BR']
];
const LUNAR={
 'Китайский Новый год':{CN:1,KR:1,VN:1,'*':0,dates:['2024-02-10','2025-01-29','2026-02-17','2027-02-06','2028-01-26','2029-02-13','2030-02-03']},
 'Ураза-байрам':{TR:1,SA:1,ID:1,EG:1,RU:0,'*':0,dates:['2024-04-10','2025-03-30','2026-03-20','2027-03-09','2028-02-26','2029-02-14','2030-02-04']},
 'Курбан-байрам':{TR:1,SA:1,ID:1,EG:1,RU:0,'*':0,dates:['2024-06-16','2025-06-06','2026-05-27','2027-05-16','2028-05-05','2029-04-24','2030-04-13']}
};
const key=t=>new Date(t).toISOString().slice(0,10);
const shift=(d,n)=>key(Date.parse(d+'T00:00:00Z')+n*86400000);
// Western Easter (anonymous Gregorian algorithm) and Orthodox Easter (Julian computus + 13 days, valid 1900–2099).
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return key(Date.UTC(y,month-1,day));}
function orthodoxEaster(y){const a=y%4,b=y%7,c=y%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7,month=Math.floor((d+e+114)/31),day=(d+e+114)%31+1;return shift(key(Date.UTC(y,month-1,day)),13);}
function thanksgiving(y){const first=new Date(Date.UTC(y,10,1)).getUTCDay();return key(Date.UTC(y,10,1+((4-first+7)%7)+21));}
function year(y){
 const out=FIXED.map(([md,name,country])=>({date:y+'-'+md,name,country}));
 out.push({date:easter(y),name:'Пасха',country:'*'},{date:orthodoxEaster(y),name:'Пасха (православная)',country:'RU'});
 const tg=thanksgiving(y);out.push({date:tg,name:'День благодарения',country:'US'},{date:shift(tg,1),name:'Чёрная пятница',country:'*'},{date:shift(tg,4),name:'Киберпонедельник',country:'*'});
 for(const [name,o] of Object.entries(LUNAR))for(const d of o.dates)if(d.startsWith(String(y)))out.push({date:d,name,country:Object.keys(o).filter(k=>k!=='dates'&&o[k]).join(',')||'*'});
 return out;
}
// Holidays within ±days of `date` for the countries (ISO codes; '*' — worldwide ones are always included).
function near(date,days=1,countries=['RU','US']){
 const y=Number(date.slice(0,4)),from=shift(date,-days),to=shift(date,days);
 const want=new Set(countries.map(c=>String(c).toUpperCase()));
 return [...year(y-1),...year(y),...year(y+1)].filter(h=>h.date>=from&&h.date<=to&&(h.country==='*'||h.country.split(',').some(c=>want.has(c))))
  .sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(date))-Math.abs(Date.parse(b.date)-Date.parse(date))||a.name.localeCompare(b.name));
}
module.exports={near,year,easter,orthodoxEaster,thanksgiving};
