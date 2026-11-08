// Deterministic plain-text parsers for mail records: receipts and subscriptions (merchant, amount, currency,
// period, next charge), renewals (domains, certificates, licenses: what expires and when) and bookings (flights,
// hotels, trains: dates, places, confirmation code). Every field keeps the line it was read from as evidence.
// App stores and payment services (Apple, Google Play, PayPal…) are not the merchant: the item line names it.
const money=require('./money.cjs');
const dates=require('./dates.cjs');

const PLATFORMS=[[/@(?:[\w-]+\.)*apple\.com$/i,'Apple'],[/googleplay-noreply@google\.com$|@(?:[\w-]+\.)*play\.google\.com$/i,'Google Play'],[/@(?:[\w-]+\.)*paypal\.(?:com|ru|de)$/i,'PayPal'],
 [/@(?:[\w-]+\.)*stripe\.com$/i,'Stripe'],[/@(?:[\w-]+\.)*paddle\.com$/i,'Paddle'],[/@(?:[\w-]+\.)*fastspring\.com$/i,'FastSpring']];
const RECEIPT=/(?:receipt|invoice|payment|paid|charged|billed|order|purchase|your plan|subscription|membership|renew|чек|квитанц|счёт|счет|оплат|списан|заказ|покупк|подписк|продлен|платёж|платеж|тариф)/iu;
const SUBSCRIPTION=/(?:subscription|membership|your plan|renew|recurring|auto-?renew|monthly|annual(?:ly)?|yearly|per month|per year|\/\s?mo(?:nth)?\b|\/\s?yr\b|подписк|продлен|продлит|ежемесячн|ежегодн|в месяц|в год|тариф|автоплат[её]ж|абонент)/iu;
const TOTAL=/(?:total|amount|charged|billed|paid|price|итого|всего|сумма|списано|оплачено|к оплате|стоимость|цена)/iu;
const NEXT=/(?:next (?:billing|payment|charge|renewal)(?: date)?|renews(?: on)?|renew on|will (?:renew|be charged|bill)|renewal date|следующ\p{L}* (?:списани|платеж|платёж|оплат|продлени)|будет (?:продлен|списан)\p{L}*|продлится|дата (?:следующего )?(?:списания|продления|платежа))/iu;
const PERIODS=[['month',/(?:monthly|per month|a month|\/\s?mo(?:nth)?\b|ежемесячн\p{L}*|в месяц|месячн\p{L}*|\(monthly\)|1 month|1 мес)/iu],['year',/(?:annual(?:ly)?|yearly|per year|a year|\/\s?yr\b|ежегодн\p{L}*|в год|годов\p{L}*|\(annual\)|\(yearly\)|12 months|12 мес)/iu],
 ['week',/(?:weekly|per week|еженедельн\p{L}*|в неделю)/iu],['quarter',/(?:quarterly|ежеквартальн\p{L}*|в квартал|3 months|3 мес)/iu]];
const DOMAIN=/(?:^|[^\w.@-])((?:[a-zа-я0-9](?:[a-zа-я0-9-]{0,61}[a-zа-я0-9])?\.)+(?:com|net|org|ru|io|dev|app|games?|gg|me|co|рф|su|info|biz|tech|studio|online|site|store|xyz|ai|uk|de|kz|by|ua))(?![\w-])/iu;
const EXPIRES=/(?:expir\p{L}*|expires|will expire|истека\p{L}*|истечени\p{L}*|истёк|истек\p{L}*|действ\p{L}* до|valid (?:until|through)|оплачен до|продлить до|renew by|renewal due|due for renewal)/iu;
const CODE=/(?:booking (?:reference|code|number|id)|confirmation (?:code|number|#)|reservation (?:code|number)|record locator|PNR|код бронировани\p{L}*|номер бронировани\p{L}*|номер брони|номер заказа|код заказа|бронь №|booking №)\s*[:#№]?\s*([A-Z0-9][A-Z0-9-]{4,14})/iu;
const BOOKINGS=[['flight',/(?:flight|boarding pass|e-ticket|itinerary receipt|airline|рейс|авиабилет|посадочн\p{L}*|электронн\p{L}* билет|маршрутн\p{L}* квитанц)/iu],
 ['hotel',/(?:hotel|check-?in|check-?out|your stay|reservation at|booking\.com|airbnb|отел\p{L}*|гостиниц\p{L}*|заезд|выезд|проживани\p{L}*|апартамент\p{L}*)/iu],
 ['train',/(?:train|railway|rail ticket|coach \d|carriage|поезд|ржд|вагон|ж\/д|железнодорожн\p{L}*|электричк\p{L}*|сапсан|ласточк\p{L}*)/iu]];

const clip=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,240);
function sender(from){
 const m=/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(from||''));
 const address=(m?m[2]:String(from||'')).trim().toLowerCase(),display=(m?m[1]:'').trim();
 return {address,display,domain:address.split('@')[1]||''};
}
// A sender's display name without «no-reply», «Billing», «Team»…; or the domain's name.
function merchantOf(s){
 let n=s.display.replace(/\b(?:no-?reply|noreply|do-not-reply|billing|receipts?|payments?|invoices?|accounts?|team|support|notifications?|info|orders?|store|subscriptions?|via [^,]+)\b/gi,'').replace(/[|·•,:–—-]+\s*$/,'').replace(/^\s*[|·•,:–—-]+/,'').replace(/\s{2,}/g,' ').trim();
 if(n.length>=2&&!/@/.test(n))return n.slice(0,60);
 const parts=s.domain.split('.').filter(p=>!/^(?:mail|email|e|em|info|news|notify|notifications|billing|accounts?|no-?reply|service|support|ru|com|net|org|io|co|uk)$/i.test(p));
 const base=parts.at(-1)||s.domain.split('.')[0]||'';
 return base?base[0].toUpperCase()+base.slice(1):'';
}
const lineOf=(lines,re)=>lines.find(l=>re.test(l))||'';
function periodOf(lines,subject){for(const [p,re] of PERIODS){const l=lineOf([subject,...lines],re);if(l)return {value:p,evidence:l};}return null;}
// The amount to keep: on a «total» line first, then on a subscription line, then the first one.
function amountOf(lines){
 const found=[];
 lines.forEach((l,i)=>{for(const a of money.amounts(l))found.push({...a,line:l,i});});
 if(!found.length)return null;
 const total=found.filter(a=>TOTAL.test(a.line)&&!/(?:tax|vat|ндс|налог|discount|скидк|subtotal|подытог)/iu.test(a.line));
 const pick=total.at(-1)||found.find(a=>SUBSCRIPTION.test(a.line))||found[0];
 return {amount:pick.amount,currency:pick.currency,evidence:pick.line};
}
function nextOf(lines,ref){
 for(let i=0;i<lines.length;i++){
  if(!NEXT.test(lines[i]))continue;
  const d=dates.parse(lines[i].slice(lines[i].search(NEXT)),ref)||dates.parse(lines[i+1]||'',ref);
  if(d)return {value:d,evidence:dates.parse(lines[i],ref)?lines[i]:lines[i]+' '+lines[i+1]};
 }
 return null;
}
// The item a store receipt is for: «Apple One Individual (Monthly)», «Subscription: Duolingo Super», «Товар: …».
function itemOf(lines){
 for(const l of lines){
  let m=/^\s*(.{2,60}?)\s*\((?:monthly|annual|yearly|weekly|ежемесячно|ежегодно|еженедельно|1 month|1 year|1 мес\.?|1 год)\)/iu.exec(l);if(m)return {value:m[1].trim(),evidence:l};
  m=/^\s*(?:subscription|item|product|plan|подписка|товар|продукт|тариф)\s*[:\t]\s*(.{2,60}?)\s*(?:\t|$|\s{2,}|[-–—]\s)/iu.exec(l);if(m&&!money.amounts(m[1]).length)return {value:m[1].trim(),evidence:l};
 }
 return null;
}

function receipt(m,lines,s){
 const amount=amountOf(lines);if(!amount)return null;
 const head=m.subject+'\n'+lines.slice(0,12).join('\n');
 if(!RECEIPT.test(head)&&!RECEIPT.test(lines.join('\n')))return null;
 const platform=PLATFORMS.find(([re])=>re.test(s.address));
 const item=itemOf(lines);
 const merchant=platform?(item?.value||platform[1]):merchantOf(s);
 if(!merchant)return null;
 const period=periodOf(lines,m.subject);
 const next=nextOf(lines,m.at);
 const isSub=!!(period||next||SUBSCRIPTION.test(m.subject)||SUBSCRIPTION.test(lines.slice(0,20).join(' ')));
 const evidence={merchant:platform&&item?item.evidence:'From: '+m.from,amount:amount.evidence};
 if(period)evidence.period=period.evidence;if(next)evidence.nextCharge=next.evidence;
 return {type:isSub?'subscription':'receipt',merchant,amount:amount.amount,currency:amount.currency,period:period?.value||null,nextCharge:next?.value||'',date:dates.ymd(m.at||Date.now()),
  platform:platform?.[1]||'',evidence};
}
function renewal(m,lines,s){
 const all=m.subject+'\n'+lines.join('\n');
 if(!EXPIRES.test(all))return null;
 const kind=/(?:ssl|tls|certificate|сертификат)/iu.test(all)?'certificate':/(?:domain|домен)/iu.test(all)?'domain':/(?:licen[cs]e|лицензи)/iu.test(all)?'license':null;
 if(!kind)return null;
 const expiryLine=lines.find(l=>EXPIRES.test(l)&&dates.parse(l,m.at))||(EXPIRES.test(m.subject)&&dates.parse(m.subject,m.at)?m.subject:'');
 if(!expiryLine)return null;
 const expires=dates.parse(expiryLine.slice(Math.max(0,expiryLine.search(EXPIRES))),m.at)||dates.parse(expiryLine,m.at);
 let name='',nameLine='';
 if(kind==='domain'||kind==='certificate'){
  const near=[expiryLine,m.subject,...lines.filter(l=>/(?:domain|домен|certificate|сертификат|common name)/iu.test(l)),...lines];
  for(const l of near){const d=DOMAIN.exec(l);if(d&&!s.domain.endsWith(d[1].toLowerCase())){name=d[1].toLowerCase();nameLine=l;break;}}
 }else{const item=itemOf(lines);name=item?.value||merchantOf(s);nameLine=item?.evidence||'From: '+m.from;}
 if(!name||!expires)return null;
 const amount=amountOf(lines);
 return {type:'renewal',merchant:kind==='license'?merchantOf(s)||name:merchantOf(s),renewal:{kind,name,expires},date:dates.ymd(m.at||Date.now()),
  ...amount?{amount:amount.amount,currency:amount.currency}:{},evidence:{name:nameLine,expires:expiryLine,...amount?{amount:amount.evidence}:{}}};
}
function booking(m,lines,s){
 const all=m.subject+'\n'+lines.join('\n');
 const code=CODE.exec(all);if(!code)return null;
 // The kind with the most words (the subject counts thrice): «электронный билет на поезд» is a train, not a flight.
 const score=re=>(re.test(m.subject)?3:0)+(all.match(new RegExp(re.source,'giu'))||[]).length;
 const best=BOOKINGS.map(([k,re])=>[k,score(re)]).sort((a,b)=>b[1]-a[1])[0];
 const kind=best[1]?best[0]:'';if(!kind)return null;
 const codeLine=(m.subject.match(CODE)?m.subject:lines.find(l=>CODE.test(l)))||'';
 const dateLines=lines.filter(l=>dates.parse(l,m.at)&&/(?:depart|arriv|check-?in|check-?out|вылет|прилет|прилёт|отправлени|прибыти|заезд|выезд|date|дата|когда|from|to|с |по )/iu.test(l)).slice(0,4);
 const found=dateLines.flatMap(l=>dates.all(l,m.at).map(d=>d.value));
 const route=lines.map(l=>/(?:^|\s)([A-ZА-ЯЁ][\p{L} .-]{1,40}?)\s*(?:→|->|—|–|-)\s*([A-ZА-ЯЁ][\p{L} .-]{1,40}?)\s*$/u.exec(l)).find(Boolean);
 return {type:'booking',merchant:merchantOf(s),date:found[0]||dates.ymd(m.at||Date.now()),
  booking:{kind,code:code[1].toUpperCase(),start:found[0]||'',end:found[1]||'',...route?{from:route[1].trim(),to:route[2].trim()}:{}},
  evidence:{code:codeLine,...dateLines.length?{start:dateLines[0]}:{},...route?{route:route[0].trim()}:{}}};
}
// Records found in one message {from, subject, text, at} by the built-in parsers.
function parse(m){
 const lines=String(m.text||'').split(/\n+/).map(l=>clip(l.replace(/\t+/g,' \t ').replace(/\s*\t\s*/g,'  '))).filter(Boolean).slice(0,400);
 const s=sender(m.from);
 const msg={...m,subject:clip(m.subject)};
 const out=[];
 const r=renewal(msg,lines,s);if(r)out.push(r);
 const b=!r&&booking(msg,lines,s);if(b)out.push(b);
 const p=!r&&!b&&receipt(msg,lines,s);if(p)out.push(p);
 return out;
}
module.exports={parse,sender,merchantOf,amountOf,periodOf,nextOf,itemOf,RECEIPT,SUBSCRIPTION};
