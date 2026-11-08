// Amounts of money in mail text: «799 ₽», «1 299,00 руб.», «$9.99», «US$ 12», «9,99 €», «EUR 1.299,00», «£4.49/mo»,
// «2 990 ₸», «USD 120.00». Returns [{amount, currency (ISO 4217), index, raw}] in text order. A number without a
// currency is not money. Thousands separators: space, NBSP, thin space, «,» or «.» before exactly three digits;
// the decimal separator is the last «,» / «.» followed by one or two digits.
const SYMBOLS=[['US$','USD'],['A$','AUD'],['C$','CAD'],['CA$','CAD'],['NZ$','NZD'],['HK$','HKD'],['S$','SGD'],['R$','BRL'],['₽','RUB'],['$','USD'],['€','EUR'],['£','GBP'],['₸','KZT'],['₴','UAH'],['₹','INR'],['₺','TRY'],['₾','GEL'],['֏','AMD'],['¥','JPY'],['₩','KRW'],['zł','PLN'],['Kč','CZK']];
const WORDS=[[/^(?:руб(?:лей|ля|ль)?\.?|р\.)$/iu,'RUB'],[/^(?:грн\.?|гривен|гривны)$/iu,'UAH'],[/^(?:тенге|тг\.?)$/iu,'KZT'],[/^(?:долл(?:аров|ара|ар)?\.?)$/iu,'USD'],[/^(?:евро)$/iu,'EUR'],[/^(?:бел\.?\s?руб\.?|BYN|Br)$/u,'BYN'],[/^(?:сум)$/iu,'UZS'],[/^(?:лари)$/iu,'GEL'],[/^(?:драм)$/iu,'AMD']];
const CODES=new Set('RUB RUR USD EUR GBP KZT UAH BYN UZS GEL AMD AZN KGS TJS TRY INR CNY JPY KRW PLN CZK CHF SEK NOK DKK CAD AUD NZD HKD SGD BRL MXN ILS AED SAR THB IDR VND MYR PHP ZAR HUF RON BGN RSD'.split(' '));
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const SYM='(?:'+SYMBOLS.map(([s])=>esc(s)).sort((a,b)=>b.length-a.length).join('|')+')';
const CODE='(?:'+[...CODES].join('|')+')';
const WORD='(?:руб(?:лей|ля|ль)?\\.?|р\\.|грн\\.?|гривен|гривны|тенге|тг\\.?|долл(?:аров|ара|ар)?\\.?|евро|бел\\.?\\s?руб\\.?|BYN|Br|сум|лари|драм)';
const NUM='(\\d{1,3}(?:[\\s\\u00a0\\u202f\\u2009][\\d]{3})+(?:[.,]\\d{1,2})?|\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
// prefix currency (symbol or code) then number, or number then suffix currency
const BEFORE=new RegExp('(?:^|[^\\p{L}\\d])(?:('+SYM+')|('+CODE+'))[\\s\\u00a0\\u202f]?'+NUM+'(?![\\d])','gu');
const AFTER=new RegExp('(?:^|[^\\p{L}\\d.,])'+NUM+'[\\s\\u00a0\\u202f]?(?:('+SYM+')|('+CODE+')(?![\\p{L}])|('+WORD+')(?![\\p{L}]))','gu');

function number(raw){
 let s=String(raw).replace(/[\s\u00a0\u202f\u2009]/g,'');
 const lastComma=s.lastIndexOf(','),lastDot=s.lastIndexOf('.');
 const last=Math.max(lastComma,lastDot);
 if(last>=0){
  const tail=s.length-last-1;
  // One kind of separator before exactly three digits («1,299», «1.299») is a thousands separator (not «0,999»).
  if(tail===3&&(lastComma<0||lastDot<0)&&!/^0[.,]/.test(s))s=s.replace(/[.,]/g,'');
  else{const int=s.slice(0,last).replace(/[.,]/g,'');s=int+'.'+s.slice(last+1);}
 }
 const n=Number(s);
 return Number.isFinite(n)?Math.round(n*100)/100:null;
}
const symbol=s=>SYMBOLS.find(([x])=>x===s)?.[1]||'';
const word=w=>{const t=String(w||'').trim();for(const [re,c] of WORDS)if(re.test(t))return c;return '';};

function amounts(text){
 const t=String(text||'');const out=[];
 for(const m of t.matchAll(BEFORE)){const currency=m[1]?symbol(m[1]):m[2]==='RUR'?'RUB':m[2];const amount=number(m[3]);if(amount!==null&&currency)out.push({amount,currency,index:m.index+m[0].indexOf(m[1]||m[2]),raw:m[0].replace(/^[^\p{L}\d$€£₽₸₴₹₺₾֏¥₩]+/u,'').trim()});}
 for(const m of t.matchAll(AFTER)){const currency=m[2]?symbol(m[2]):m[3]?(m[3]==='RUR'?'RUB':m[3]):word(m[4]);const amount=number(m[1]);const at=m.index+m[0].indexOf(m[1]);
  if(amount!==null&&currency&&!out.some(o=>Math.abs(o.index-at)<4))out.push({amount,currency,index:at,raw:m[0].replace(/^[^\d]+/,'').trim()});}
 return out.sort((a,b)=>a.index-b.index);
}
// «1 299,00 ₽» — for evidence checks: the amounts in a snippet.
const parse=text=>amounts(text)[0]||null;
module.exports={amounts,parse,number,CODES};
