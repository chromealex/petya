// Paid services from mail records (src/features/mail-records.cjs): subscription records and repeated receipts of one
// merchant become one service with its charges, period (stated in the mail or inferred from the intervals between
// charges), next charge (stated, or the last charge plus the period), monthly equivalent and status. Renewals
// (domains, certificates, licenses) are listed by expiry. No currency conversion: totals are per currency.
const {merchantKey}=require('../../mail-records/store.cjs');
const DAY=86400000;
const PERIOD_DAYS={week:7,month:30.44,quarter:91.3,year:365.25};
const MONTHLY={week:52/12,month:1,quarter:1/3,year:1/12};
const parse=d=>{const [y,m,x]=String(d).split('-').map(Number);return new Date(y,m-1,x).getTime();};
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function addPeriod(date,period){const d=new Date(parse(date));if(period==='month')d.setMonth(d.getMonth()+1);else if(period==='year')d.setFullYear(d.getFullYear()+1);else if(period==='quarter')d.setMonth(d.getMonth()+3);else if(period==='week')d.setDate(d.getDate()+7);return ymd(d.getTime());}
function infer(dates){
 if(dates.length<2)return null;
 const gaps=dates.slice(1).map((d,i)=>(parse(d)-parse(dates[i]))/DAY).sort((a,b)=>a-b);
 const median=gaps[Math.floor(gaps.length/2)];
 if(median>=6&&median<=8)return 'week';if(median>=26&&median<=35)return 'month';if(median>=85&&median<=95)return 'quarter';if(median>=350&&median<=380)return 'year';
 return null;
}
const round=n=>Math.round(n*100)/100;

// {services, renewals, totals:[{currency, monthly, yearly}], upcoming} as of `now`.
function build(records,{now=Date.now(),hidden=[]}={}){
 const today=ymd(now);
 const groups=new Map();
 for(const r of records){
  if(r.type!=='subscription'&&r.type!=='receipt')continue;
  const k=merchantKey(r.merchant)+'|'+r.currency;
  if(!merchantKey(r.merchant)||hidden.includes(merchantKey(r.merchant)))continue;
  const g=groups.get(k)||{key:merchantKey(r.merchant),merchant:r.merchant,currency:r.currency,rows:[]};g.rows.push(r);groups.set(k,g);
 }
 const services=[];
 for(const g of groups.values()){
  const rows=g.rows.sort((a,b)=>a.date.localeCompare(b.date));
  const subs=rows.filter(r=>r.type==='subscription');
  const charges=[...new Map(rows.map(r=>[r.date+'|'+r.amount,{date:r.date,amount:r.amount,url:r.message?.url||'',id:r.id}])).values()];
  const stated=[...subs].reverse().find(r=>r.period)?.period||null;
  const inferred=infer(charges.map(c=>c.date));
  // A one-off receipt is not a service; repeated receipts at a regular interval are.
  if(!subs.length&&!inferred)continue;
  const period=stated||inferred;
  const last=charges.at(-1);
  let next=[...subs].reverse().find(r=>r.nextCharge)?.nextCharge||'';
  if(next&&next<today&&period){while(next<today)next=addPeriod(next,period);}
  if(!next&&period){next=addPeriod(last.date,period);let guard=0;while(next<today&&guard++<60)next=addPeriod(next,period);}
  const lapsed=period?(parse(today)-parse(last.date))/DAY>PERIOD_DAYS[period]*1.6:false;
  const monthly=period?round(last.amount*MONTHLY[period]):null;
  const latest=rows.at(-1);
  services.push({key:g.key,merchant:latest.merchant||g.merchant,item:latest.item||'',platform:latest.platform||'',currency:g.currency,amount:last.amount,period,periodSource:stated?'mail':inferred?'history':'',
   next:lapsed?'':next,days:next&&!lapsed?Math.round((parse(next)-parse(today))/DAY):null,monthly,status:lapsed?'lapsed':'active',
   charges:charges.slice(-12),url:last.url,evidence:latest.evidence||{},records:rows.map(r=>r.id)});
 }
 services.sort((a,b)=>(a.status==='lapsed')-(b.status==='lapsed')||(a.days??1e9)-(b.days??1e9)||(b.monthly||0)-(a.monthly||0));
 const totals=new Map();
 for(const s of services)if(s.status==='active'&&s.monthly!==null){const t=totals.get(s.currency)||{currency:s.currency,monthly:0,count:0};t.monthly=round(t.monthly+s.monthly);t.count++;totals.set(s.currency,t);}
 const renewals=records.filter(r=>r.type==='renewal'&&r.renewal?.expires>=ymd(now-7*DAY)).map(r=>({id:r.id,kind:r.renewal.kind,name:r.renewal.name,expires:r.renewal.expires,
  days:Math.round((parse(r.renewal.expires)-parse(today))/DAY),merchant:r.merchant,amount:r.amount??null,currency:r.currency||'',url:r.message?.url||''}))
  .sort((a,b)=>a.expires.localeCompare(b.expires));
 const seen=new Set();const uniqueRenewals=renewals.filter(r=>{const k=r.kind+'|'+r.name;if(seen.has(k))return false;seen.add(k);return true;});
 return {services,renewals:uniqueRenewals,totals:[...totals.values()].map(t=>({...t,yearly:round(t.monthly*12)})).sort((a,b)=>b.monthly-a.monthly),
  week:services.filter(s=>s.days!==null&&s.days>=0&&s.days<=7).length+uniqueRenewals.filter(r=>r.days>=0&&r.days<=7).length};
}
module.exports={build,infer,addPeriod,ymd};
