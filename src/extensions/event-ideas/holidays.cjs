// «Идеи для ивентов»: holidays by region, computed in code for any year — nothing is looked up.
//  - fixed dates and weekday rules (Thanksgiving, Black Friday, Mother's Day, Carnival from Easter);
//  - Easter, Western and Orthodox (the computus from «Объясни график»);
//  - the Chinese lunisolar calendar from astronomy: new moons (Meeus, ch. 49) and the Sun's longitude (ch. 25);
//    month 1 is the lunation that holds the principal term 330° (Lunar New Year), month 8 holds 180° (Mid-Autumn);
//    in China's (UTC+8) or Korea's (UTC+9) local date;
//  - Islamic holidays from the arithmetic (tabular) calendar — observed dates follow the crescent, so they are marked
//    «± 1 день»; Diwali from the new moon of Kartika in India's time, also approximate.
// Every holiday has an event window (when a themed in-game event usually runs), a theme for the mechanic and regions.
const ce=require('../chart-explain/holidays.cjs');
const DAY=86400000;
const key=t=>new Date(t).toISOString().slice(0,10);
const shift=(d,n)=>key(Date.parse(d+'T00:00:00Z')+n*DAY);
const rad=d=>d*Math.PI/180;
const jdOf=ms=>ms/DAY+2440587.5;
const msOf=jd=>(jd-2440587.5)*DAY;
const local=(jd,hours)=>key(msOf(jd)+hours*3600000);

// Mean new moon k (k = 0 near 2000-01-06) with the main periodic terms; ΔT ≈ 69 s is subtracted (TT → UT).
function newMoon(k){
 const T=k/1236.85,E=1-0.002516*T-0.0000074*T*T;
 const M=rad(2.5534+29.1053567*k-0.0000014*T*T),Mp=rad(201.5643+385.81693528*k+0.0107582*T*T+0.00001238*T*T*T),F=rad(160.7108+390.67050284*k-0.0016118*T*T),Om=rad(124.7746-1.56375588*k+0.0020672*T*T);
 const s=Math.sin;
 let jd=2451550.09766+29.530588861*k+0.00015437*T*T;
 jd+=-0.4072*s(Mp)+0.17241*E*s(M)+0.01608*s(2*Mp)+0.01039*s(2*F)+0.00739*E*s(Mp-M)-0.00514*E*s(Mp+M)+0.00208*E*E*s(2*M)-0.00111*s(Mp-2*F)-0.00057*s(Mp+2*F)
  +0.00056*E*s(2*Mp+M)-0.00042*s(3*Mp)+0.00042*E*s(M+2*F)+0.00038*E*s(M-2*F)-0.00024*E*s(2*Mp-M)-0.00017*s(Om)-0.00007*s(Mp+2*M)+0.00004*s(2*Mp-2*F)+0.00004*s(3*M)
  +0.00003*s(Mp+M-2*F)+0.00003*s(2*Mp+2*F)-0.00003*s(Mp+M+2*F)+0.00003*s(Mp-M+2*F)-0.00002*s(Mp-M-2*F)-0.00002*s(3*Mp+M)+0.00002*s(4*Mp);
 return jd-69/86400;
}
// New moons whose local date falls in [from, to].
function newMoons(from,to,hours){
 const k0=Math.floor((Date.parse(from)-Date.UTC(2000,0,6))/(29.530588861*DAY))-1;
 const out=[];for(let k=k0;;k++){const jd=newMoon(k);const d=local(jd,hours);if(d>to)break;if(d>=from)out.push({jd,date:d});}
 return out;
}
// The Sun's apparent longitude (degrees) and the moment it reaches a given longitude near a date.
function sunLongitude(jd){
 const T=(jd-2451545)/36525;
 const L0=280.46646+36000.76983*T+0.0003032*T*T,M=rad(357.52911+35999.05029*T-0.0001537*T*T);
 const C=(1.914602-0.004817*T-0.000014*T*T)*Math.sin(M)+(0.019993-0.000101*T)*Math.sin(2*M)+0.000289*Math.sin(3*M);
 const om=rad(125.04-1934.136*T);
 return ((L0+C-0.00569-0.00478*Math.sin(om))%360+360)%360;
}
function solarTerm(year,longitude,approx){
 let jd=jdOf(Date.UTC(year,approx[0]-1,approx[1]));
 for(let i=0;i<8;i++){const d=((longitude-sunLongitude(jd)+540)%360)-180;jd+=d*365.2422/360;}
 return jd;
}
// The first day of the lunar month that holds a principal term, in local time.
function monthHolding(year,longitude,approx,hours){
 const term=local(solarTerm(year,longitude,approx),hours);
 const moons=newMoons(shift(term,-35),shift(term,35),hours);
 const i=moons.findIndex((m,j)=>m.date<=term&&(!moons[j+1]||moons[j+1].date>term));
 return i>=0?moons[i].date:null;
}
const lunarNewYear=(y,hours=8)=>monthHolding(y,330,[2,19],hours);
const midAutumn=(y,hours=8)=>{const m=monthHolding(y,180,[9,23],hours);return m?shift(m,14):null;};

// Tabular Islamic calendar (civil epoch): Julian day of an Islamic date, and the Gregorian dates of a holiday in a year.
function islamicJD(y,m,d){return d+Math.ceil(29.5*(m-1))+(y-1)*354+Math.floor((3+11*y)/30)+1948439.5-1;}
function islamic(year,month,day){
 const out=[];const ah=Math.round((year-622)*33/32);
 for(const y of [ah-1,ah,ah+1,ah+2]){const d=key(msOf(islamicJD(y,month,day))+12*3600000);if(d.startsWith(String(year)))out.push(d);}
 return out;
}
// Diwali (Lakshmi Puja): the new moon of Kartika — the one between mid-October and mid-November in India's time.
function diwali(y){const m=newMoons(y+'-10-13',y+'-11-15',5.5)[0];return m?local(m.jd-0.5,5.5):null;}
function mothersDayUS(y){const first=new Date(Date.UTC(y,4,1)).getUTCDay();return key(Date.UTC(y,4,1+((7-first)%7)+7));}

// themes: gifts (presents, a calendar), spooky, love, sale, lunar, family, harvest, patriotic, festival, spring.
const REGION_NAMES={global:'весь мир',RU:'Россия',US:'США',GB:'Великобритания',DE:'Германия',FR:'Франция',BR:'Бразилия',MX:'Мексика',CN:'Китай',TW:'Тайвань',KR:'Корея',JP:'Япония',IN:'Индия',TR:'Турция',SA:'Саудовская Аравия',AE:'ОАЭ',EG:'Египет',ID:'Индонезия',VN:'Вьетнам'};
const MENA=['TR','SA','AE','EG','ID'];
function year(y){
 const H=[];
 const add=(id,name,date,regions,theme,window,approx=false)=>{if(date)H.push({id:id+'-'+y,name,date,regions,theme,start:shift(date,window[0]),end:shift(date,window[1]),approx});};
 add('new-year','Новый год',y+'-01-01',['global'],'gifts',[-6,7]);
 add('christmas','Рождество',y+'-12-25',['global','US','GB','DE','FR','BR','MX'],'gifts',[-7,2]);
 add('orthodox-christmas','Рождество (православное)',y+'-01-07',['RU'],'gifts',[-2,1]);
 add('valentine','День святого Валентина',y+'-02-14',['global'],'love',[-4,2]);
 add('feb23','День защитника Отечества',y+'-02-23',['RU'],'patriotic',[-3,1]);
 add('mar8','Международный женский день',y+'-03-08',['RU'],'love',[-4,1]);
 add('victory','День Победы',y+'-05-09',['RU'],'patriotic',[-3,1]);
 add('knowledge','День знаний',y+'-09-01',['RU'],'family',[-6,1]);
 add('unity','День народного единства',y+'-11-04',['RU'],'patriotic',[-2,1]);
 add('halloween','Хэллоуин',y+'-10-31',['global'],'spooky',[-7,2]);
 add('easter','Пасха',ce.easter(y),['global','US','GB','DE','FR','BR','MX'],'spring',[-5,2]);
 add('orthodox-easter','Пасха (православная)',ce.orthodoxEaster(y),['RU'],'spring',[-3,1]);
 add('carnival','Карнавал',shift(ce.easter(y),-47),['BR'],'festival',[-4,1]);
 const tg=ce.thanksgiving(y);
 add('thanksgiving','День благодарения',tg,['US'],'family',[-3,1]);
 add('black-friday','Чёрная пятница',shift(tg,1),['global'],'sale',[-1,3]);
 add('mothers-day','День матери',mothersDayUS(y),['US'],'love',[-3,0]);
 add('july4','День независимости США',y+'-07-04',['US'],'patriotic',[-3,1]);
 add('dia-muertos','День мёртвых',y+'-11-02',['MX'],'spooky',[-3,0]);
 add('dia-criancas','День детей',y+'-10-12',['BR'],'family',[-4,1]);
 add('golden-week-jp','Золотая неделя',y+'-04-29',['JP'],'festival',[0,7]);
 add('golden-week-cn','Неделя Дня образования КНР',y+'-10-01',['CN'],'festival',[-1,6]);
 add('lunar-new-year','Китайский Новый год',lunarNewYear(y),['CN','TW','VN','global'],'lunar',[-3,10]);
 add('seollal','Соллаль',lunarNewYear(y,9),['KR'],'lunar',[-2,2]);
 add('mid-autumn','Праздник середины осени',midAutumn(y),['CN','TW','VN'],'harvest',[-5,2]);
 add('chuseok','Чхусок',midAutumn(y,9),['KR'],'harvest',[-2,2]);
 for(const d of islamic(y,9,1))add('ramadan','Начало Рамадана',d,MENA,'family',[0,29],true);
 for(const d of islamic(y,10,1))add('eid-al-fitr','Ураза-байрам',d,MENA,'gifts',[-1,3],true);
 for(const d of islamic(y,12,10))add('eid-al-adha','Курбан-байрам',d,MENA,'family',[-2,3],true);
 add('diwali','Дивали',diwali(y),['IN'],'festival',[-4,2],true);
 return H;
}
// Holidays whose event window starts in [from, to] (or is running at `from`), for the regions; global ones always.
function upcoming(from,to,regions=['global']){
 const want=new Set(regions.length?regions:['global']);want.add('global');
 const y0=Number(from.slice(0,4)),y1=Number(to.slice(0,4));
 const list=[];for(let y=y0-1;y<=y1+1;y++)list.push(...year(y));
 return list.filter(h=>h.end>=from&&h.start<=to&&h.regions.some(r=>want.has(r))).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
module.exports={year,upcoming,lunarNewYear,midAutumn,islamic,diwali,newMoon,newMoons,sunLongitude,solarTerm,REGION_NAMES,shift};
