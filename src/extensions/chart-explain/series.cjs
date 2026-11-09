// «Объясни график»: the daily series of a card Petya drew in this chat, read from the card's own data (never from a
// picture of it). Adapters by card kind:
//   metricsCard (Метрики игры) — DAU, new players, revenue lines of the first source;
//   adRevenue (Реклама и монетизация) — revenue per day, in total and per network;
//   iapCard (Покупки в игре) — paid amount per day, per currency;
//   sqlQuery (SQL по словам) — a result drawn as lines over dates.
// Each gives {kind, title, series:[{id, metric, label, unit, points:[{date, value}], segment?}], countries?}.
const DATE=/^\d{4}-\d{2}-\d{2}/;
const points=(dates,values)=>dates.map((d,i)=>({date:String(d).slice(0,10),value:values[i]})).filter(p=>DATE.test(p.date)&&Number.isFinite(p.value));
const ADAPTERS={
 metricsCard(c){
  const b=c?.sources?.[0];if(!b?.chart?.dates)return null;
  const METRIC={dau:'dau',new:'new',revenue:'revenue'};
  return {kind:'metricsCard',title:'Метрики игры · '+b.name+(b.app?' · '+b.app:''),platform:c.platform||null,
   series:b.chart.lines.map(l=>({id:l.metric,metric:METRIC[l.metric]||l.metric,label:l.label,unit:l.unit,points:points(b.chart.dates,l.values)}))};
 },
 adRevenue(c){
  const days=c?.chart?.days;if(!Array.isArray(days))return null;
  const nets=(c.chart.series||[]).map(s=>({id:'ads:'+s.id,metric:'ads',label:'Реклама · '+s.label,unit:'currency:USD',points:points(days,s.values),segment:{key:'network',value:s.label}}));
  const total=days.map((_,i)=>(c.chart.series||[]).reduce((a,s)=>a+(Number(s.values[i])||0),0));
  return {kind:'adRevenue',title:'Реклама и монетизация',series:[{id:'ads',metric:'ads',label:'Выручка с рекламы',unit:'currency:USD',points:points(days,total)},...nets],countries:(c.countries||[]).slice(0,5).map(x=>x.country)};
 },
 iapCard(c){
  if(!Array.isArray(c?.currencies)||!c.currencies.length)return null;
  return {kind:'iapCard',title:'Покупки в игре',series:c.currencies.map(b=>({id:'iap:'+b.currency,metric:'iap',label:'Покупки'+(b.currency?' · '+b.currency:''),unit:b.currency?'currency:'+b.currency:'amount',points:b.days.map(d=>({date:d.date,value:d.amount}))}))};
 },
 sqlQuery(c){
  const ch=c?.result?.chart;if(ch?.type!=='line'||!Array.isArray(ch.series))return null;
  const series=ch.series.map((s,i)=>({id:'sql:'+i,metric:null,label:s.name||c.result.columns?.[s.column]?.name||'Значение',unit:'',points:(s.points||[]).map(p=>({date:String(p.x).slice(0,10),value:Number(p.y)})).filter(p=>DATE.test(p.date)&&Number.isFinite(p.value))})).filter(s=>s.points.length);
  return series.length?{kind:'sqlQuery',title:'SQL · '+String(c.question||'').slice(0,80),series}:null;
 }
};
// The newest card with a usable series in the last messages of the chat.
function fromTopic(topic,{limit=16}={}){
 const messages=(topic?.messages||[]).slice(-limit).reverse();
 for(const m of messages){
  for(const [key,adapt] of Object.entries(ADAPTERS)){
   const data=m.extensionData?.[key];if(!data)continue;
   let out=null;try{out=adapt(data);}catch{out=null;}
   if(out?.series?.some(s=>s.points.length>=4))return {...out,messageAt:m.at||null};
  }
 }
 return null;
}
// The series the question is about: the named metric, otherwise the first one with enough days.
function pick(chart,metric){
 const ok=chart.series.filter(s=>s.points.length>=4&&!s.segment);
 return (metric&&ok.find(s=>s.metric===metric))||ok[0]||chart.series.find(s=>s.points.length>=4)||null;
}
module.exports={ADAPTERS,fromTopic,pick};
