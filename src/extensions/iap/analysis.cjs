// «Покупки в игре»: everything on the card is computed here, per currency — money in different currencies is never
// added up, compared as one number or converted.
//  - per currency: purchases, amount paid, refunds (count, amount, rate), net, revenue by product with shares, by
//    day, by store;
//  - payers (only from a source that knows buyers): distinct payers, new payers, ARPPU per currency
//    (amount / payers of that currency), first-purchase products, conversion to payers = the mean over days of
//    payers that day / DAU that day (DAU from a connected metrics source);
//  - blend: ROAS per spend currency = (purchases net in that currency + ad revenue when the currency is USD, the
//    ad sources' currency) / UA spend in that currency, with what was left out for being in another currency.
const PS=require('../../features/purchase-sources.cjs');
const round=(v,d=2)=>Math.round(v*10**d)/10**d;
const days=(a,b)=>{const out=[];for(let t=Date.parse(a+'T00:00:00Z');t<=Date.parse(b+'T00:00:00Z');t+=86400000)out.push(new Date(t).toISOString().slice(0,10));return out;};

function currencyBlock(rows,code,period){
 const mine=rows.filter(r=>r.currency===code);
 const total=PS.summarize(mine)[0]||{units:0,amount:0,refunds:0,refunded:0,net:0,refundRate:null};
 const products=PS.summarize(mine,['product']).map(p=>({product:p.product,title:p.title||'',type:p.type,units:p.units,amount:p.amount,refunds:p.refunds,refunded:p.refunded,net:p.net,
  share:total.amount>0?round(p.amount/total.amount,4):0,refundRate:p.refundRate===null?null:round(p.refundRate,4)})).sort((a,b)=>b.amount-a.amount||b.units-a.units);
 const byDay=new Map(PS.summarize(mine,['date']).map(d=>[d.date,d]));
 const series=days(period.start,period.end).map(d=>({date:d,amount:byDay.get(d)?.amount||0,refunded:byDay.get(d)?.refunded||0,units:byDay.get(d)?.units||0}));
 const stores=PS.summarize(mine,['store']).map(x=>({store:x.store,amount:x.amount,units:x.units}));
 return {currency:code,units:total.units,amount:total.amount,refunds:total.refunds,refunded:total.refunded,net:total.net,refundRate:total.refundRate===null?null:round(total.refundRate,4),
  products:products.slice(0,25),moreProducts:Math.max(0,products.length-25),days:series,stores};
}

// sources: [{id, name, rows, payers, notes}], dau: [{date, value}] | null, ads: {byDay:Map|{}, total, currency:'USD'} | null,
// spend: [{currency, spend}] | null.
function analyse({sources,period,dau=null,ads=null,spend=null}){
 const rows=sources.flatMap(x=>x.rows||[]);
 const codes=PS.currencies(rows);
 for(const r of rows)if(!codes.includes(r.currency))codes.push(r.currency);
 const currencies=codes.map(c=>currencyBlock(rows,c,period)).filter(b=>b.units||b.refunds);
 const known=sources.map(x=>x.payers).filter(Boolean);
 let payers=null;
 if(known.length){
  // Payers are distinct per source; two sources that both know buyers are not added (a buyer may be in both).
  const p=known[0];
  const byCurrency=p.byCurrency.map(c=>({currency:c.currency,payers:c.payers,amount:round(c.amount),arppu:c.payers>0?round(c.amount/c.payers,2):null}));
  let conversion=null;
  if(dau?.length&&p.days.length){
   const d=new Map(dau.map(x=>[x.date,x.value]));
   const pairs=p.days.filter(x=>d.get(x.date)>0).map(x=>({payers:x.payers,dau:d.get(x.date)}));
   const mean=f=>pairs.reduce((a,b)=>a+f(b),0)/pairs.length;
   if(pairs.length)conversion={value:round(mean(x=>x.payers/x.dau),5),days:pairs.length,payersPerDay:round(mean(x=>x.payers),1),dau:Math.round(mean(x=>x.dau))};
  }
  const firstTotal=p.first.reduce((a,b)=>a+b.payers,0);
  payers={source:sources.find(x=>x.payers===p)?.name||'',total:p.total,newPayers:p.newPayers,byCurrency,conversion,
   first:p.first.slice(0,12).map(f=>({...f,title:f.title||rows.find(r=>r.product===f.product&&r.title)?.title||'',share:firstTotal?round(f.payers/firstTotal,4):0})),
   days:p.days,several:known.length>1};
 }
 let blend=null;
 if(spend?.length){
  const out=[],left=[],spendLeft=[];
  for(const s of spend){
   const block=currencies.find(b=>b.currency===s.currency);
   const iap=block?block.net:0,ad=s.currency===(ads?.currency||'USD')&&ads?.total?ads.total:0;
   if(!s.spend)continue;
   // Spend in a currency nothing was earned in cannot be compared with anything: listed, not shown as 0%.
   if(!block&&!ad){spendLeft.push(s.currency);continue;}
   out.push({currency:s.currency,spend:round(s.spend),iap:round(iap),ads:round(ad),revenue:round(iap+ad),roas:round((iap+ad)/s.spend,4),roasIap:round(iap/s.spend,4)});
  }
  for(const b of currencies)if(!spend.some(s=>s.currency===b.currency))left.push(b.currency||'—');
  if(out.length)blend={rows:out,left,spendLeft,adsIncluded:!!ads?.total};
 }
 return {currencies,payers,blend,empty:!currencies.length};
}
module.exports={analyse,currencyBlock,days};
