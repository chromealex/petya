// Calendar dates in mail text, English and Russian: «December 9, 2026», «Dec 9, 2026», «9 December 2026», «9 дек.
// 2026», «9 декабря 2026 г.», «09.12.2026», «2026-12-09», «12/09/2026» (slashes are month/day/year), and without a year
// («9 декабря», «Dec 9») the first such day on or after `ref` (the message date). Returns 'YYYY-MM-DD' or null.
const MONTHS=[
 ['jan','январ','янв'],['feb','феврал','фев'],['mar','март','мар'],['apr','апрел','апр'],['may','ма[йя]','мая'],['jun','июн'],['jul','июл'],['aug','август','авг'],['sep','сентябр','сен'],['oct','октябр','окт'],['nov','ноябр','ноя'],['dec','декабр','дек']
];
const MONTH='((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?|(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\\p{L}*|(?:янв|фев|мар|апр|авг|сен|окт|ноя|дек)\\.?)';
const pad=v=>String(v).padStart(2,'0');
const iso=(y,m,d)=>{const t=new Date(y,m-1,d);return t.getFullYear()===y&&t.getMonth()===m-1&&t.getDate()===d?y+'-'+pad(m)+'-'+pad(d):null;};
function month(word){const w=String(word||'').toLocaleLowerCase().replace(/\.$/,'');const i=MONTHS.findIndex(list=>list.some(p=>new RegExp('^'+p,'u').test(w)));return i>=0?i+1:0;}
const year=y=>{const n=Number(y);return n<100?2000+n:n;};
function withoutYear(m,d,ref){
 const r=new Date(ref||Date.now());
 for(const y of [r.getFullYear(),r.getFullYear()+1]){const v=iso(y,m,d);if(v&&new Date(y,m-1,d).getTime()>=new Date(r.getFullYear(),r.getMonth(),r.getDate()).getTime())return v;}
 return null;
}
const PATTERNS=[
 // 2026-12-09
 [/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/u,m=>iso(+m[1],+m[2],+m[3])],
 // 09.12.2026 / 9.12.26
 [/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?![\d.]\d)/u,m=>iso(year(m[3]),+m[2],+m[1])],
 // 12/09/2026 (US)
 [/(?:^|[^\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/u,m=>iso(+m[3],+m[1],+m[2])],
 // December 9, 2026 / Dec 9 2026 / Dec. 9th, 2026
 [new RegExp('(?:^|[^\\p{L}])'+MONTH+'\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)','iu'),m=>month(m[1])?iso(+m[3],month(m[1]),+m[2]):null],
 // 9 December 2026 / 9 декабря 2026 г.
 [new RegExp('(?:^|[^\\d])(\\d{1,2})(?:st|nd|rd|th)?\\s+'+MONTH+',?\\s+(\\d{4})(?!\\d)','iu'),m=>month(m[2])?iso(+m[3],month(m[2]),+m[1]):null]
];
const NO_YEAR=[
 [new RegExp('(?:^|[^\\d])(\\d{1,2})\\s+'+MONTH+'(?![\\p{L}\\d])','iu'),m=>[month(m[2]),+m[1]]],
 [new RegExp('(?:^|[^\\p{L}])'+MONTH+'\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d])','iu'),m=>[month(m[1]),+m[2]]]
];
// The first date in the text (earliest position wins between formats).
function parse(text,ref){
 const t=String(text||'');let best=null;
 for(const [re,fn] of PATTERNS){const m=re.exec(t);if(!m)continue;const v=fn(m);if(v&&(!best||m.index<best.index))best={index:m.index,value:v};}
 if(best)return best.value;
 for(const [re,fn] of NO_YEAR){const m=re.exec(t);if(!m)continue;const [mo,d]=fn(m);if(mo&&d){const v=withoutYear(mo,d,ref);if(v)return v;}}
 return null;
}
// Every date in the text, in order (for «from … to …» of bookings).
function all(text,ref){
 const out=[];let rest=String(text||''),offset=0;
 for(let i=0;i<6&&rest;i++){
  let best=null;
  for(const [re,fn] of PATTERNS){const m=re.exec(rest);if(!m)continue;const v=fn(m);if(v&&(!best||m.index<best.index))best={index:m.index,len:m[0].length,value:v};}
  if(!best)for(const [re,fn] of NO_YEAR){const m=re.exec(rest);if(!m)continue;const [mo,d]=fn(m);const v=mo&&d?withoutYear(mo,d,ref):null;if(v&&(!best||m.index<best.index))best={index:m.index,len:m[0].length,value:v};}
  if(!best)break;
  out.push({value:best.value,index:offset+best.index});offset+=best.index+best.len;rest=rest.slice(best.index+best.len);
 }
 return out;
}
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
module.exports={parse,all,ymd,iso};
