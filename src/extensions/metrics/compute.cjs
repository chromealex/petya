// «Метрики игры»: everything on the card is computed here from the sources' daily series — period totals and
// their change against the previous period of the same length, ARPDAU, the anomaly flags (a day more than 3σ away
// from the same weekday of the 4 previous weeks) and the retention cohorts D1/D7/D30 by install week.
const DAY=86400000;
const key=ms=>new Date(ms).toISOString().slice(0,10);
const at=date=>Date.parse(date+'T00:00:00Z');
const shift=(date,days)=>key(at(date)+days*DAY);
const range=(from,to)=>{const out=[];for(let t=at(from);t<=at(to);t+=DAY)out.push(key(t));return out;};

// The calendar of a request: complete days only (today is still being counted).
// current = the last N complete days, previous = the N days before, chart = at least 14 days,
// fetch = from the earliest day needed (previous period, or 4 weeks before the chart for the anomaly baseline).
function window(days,now=new Date()){
 const today=key(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
 const end=shift(today,-1),start=shift(end,-(days-1));
 const prevEnd=shift(start,-1),prevStart=shift(prevEnd,-(days-1));
 const chartDays=Math.max(days,14),chartStart=shift(end,-(chartDays-1));
 const from=[prevStart,shift(chartStart,-28)].sort()[0];
 return {today,start,end,prevStart,prevEnd,chartStart,from,to:end,days};
}

const values=(series,dates)=>{const by=new Map(series.map(p=>[p.date,p.value]));return dates.map(d=>by.has(d)?by.get(d):null);};
const sum=list=>list.reduce((a,v)=>a+(v||0),0);
const known=list=>list.filter(v=>v!==null);
const change=(now,before)=>Number.isFinite(now)&&Number.isFinite(before)&&before>0?now/before-1:null;

// Same-weekday baseline: the 4 previous weeks. Flags |x − mean| > 3σ (sample σ); needs all 4 points and σ > 0.
function anomalies(series,dates,metric){
 const by=new Map(series.map(p=>[p.date,p.value])),out=[];
 for(const d of dates){
  const x=by.get(d);if(!Number.isFinite(x))continue;
  const base=[7,14,21,28].map(k=>by.get(shift(d,-k)));
  if(base.some(v=>!Number.isFinite(v)))continue;
  const mean=base.reduce((a,b)=>a+b,0)/4,sd=Math.sqrt(base.reduce((a,b)=>a+(b-mean)**2,0)/3);
  if(sd>0&&Math.abs(x-mean)>3*sd)out.push({date:d,metric,value:x,mean,sd,z:(x-mean)/sd,direction:x>mean?'up':'down'});
 }
 return out;
}

// Weekly cohort rows: for D-n, the returned users of every install day whose day n is already complete, over the
// size of those same cohorts. Cells that no cohort of the week has reached yet stay empty.
function retention(cohorts,{end,weeks=6}={}){
 if(!Array.isArray(cohorts)||!cohorts.length)return null;
 const monday=date=>{const t=at(date),w=(new Date(t).getUTCDay()+6)%7;return key(t-w*DAY);};
 const groups=new Map();
 for(const c of cohorts){if(!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!(c.size>0))continue;const w=monday(c.date);if(!groups.has(w))groups.set(w,[]);groups.get(w).push(c);}
 const rows=[...groups].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,weeks).map(([week,list])=>{
  const cell=n=>{const ready=list.filter(c=>shift(c.date,n)<=end&&Number.isFinite(c.returned?.[n]));const size=sum(ready.map(c=>c.size));return size>0?{value:sum(ready.map(c=>c.returned[n]))/size,size,cohorts:ready.length}:null;};
  return {week,size:sum(list.map(c=>c.size)),d1:cell(1),d7:cell(7),d30:cell(30)};
 });
 return rows.length?{rows}:null;
}
// Period retention for a KPI tile: cohorts installed in [from, to] whose day n is complete by `end`.
function periodRetention(cohorts,n,from,to,end){
 const ready=(cohorts||[]).filter(c=>c.date>=from&&c.date<=to&&shift(c.date,n)<=end&&c.size>0&&Number.isFinite(c.returned?.[n]));
 const size=sum(ready.map(c=>c.size));return size>0?sum(ready.map(c=>c.returned[n]))/size:null;
}

// One source's block of the card.
function block({id,name,app,series,cohorts,unavailable,currency},w){
 const get=m=>series.find(x=>x.metric===m);
 const cur=range(w.start,w.end),prev=range(w.prevStart,w.prevEnd),chart=range(w.chartStart,w.end);
 const kpis=[],lines=[];
 const dau=get('dau'),fresh=get('new'),rev=get('revenue');
 if(dau){
  const a=known(values(dau.series,cur)),b=known(values(dau.series,prev));
  const now=a.length?sum(a)/a.length:null,before=b.length?sum(b)/b.length:null;
  kpis.push({id:'dau',label:w.days===1?'DAU':'DAU в среднем',value:now,previous:before,change:change(now,before),unit:'users'});
  lines.push({metric:'dau',label:'DAU',unit:'users',values:values(dau.series,chart),previous:values(dau.series,chart.map(d=>shift(d,-w.days)))});
 }
 if(fresh){
  const now=sum(values(fresh.series,cur)),before=sum(values(fresh.series,prev));
  kpis.push({id:'new',label:'Новые игроки',value:now,previous:before,change:change(now,before),unit:'users'});
  lines.push({metric:'new',label:'Новые',unit:'users',values:values(fresh.series,chart),previous:values(fresh.series,chart.map(d=>shift(d,-w.days)))});
 }
 if(cohorts){
  // D1 of cohorts installed in the period (the last day's D1 is not complete yet, so it falls out by itself).
  const now=periodRetention(cohorts,1,shift(w.start,-1),w.end,w.end),before=periodRetention(cohorts,1,shift(w.prevStart,-1),shift(w.prevEnd,-1),w.end);
  if(now!==null)kpis.push({id:'d1',label:'Ретеншн D1',value:now,previous:before,change:before!==null?now-before:null,unit:'share',points:true});
 }
 if(rev){
  const now=sum(values(rev.series,cur)),before=sum(values(rev.series,prev));
  kpis.push({id:'revenue',label:'Выручка',value:now,previous:before,change:change(now,before),unit:rev.unit});
  lines.push({metric:'revenue',label:'Выручка',unit:rev.unit,values:values(rev.series,chart),previous:values(rev.series,chart.map(d=>shift(d,-w.days)))});
  if(dau){
   const da=sum(values(dau.series,cur)),db=sum(values(dau.series,prev));
   const now2=da>0?now/da:null,before2=db>0?before/db:null;
   kpis.push({id:'arpdau',label:'ARPDAU',value:now2,previous:before2,change:change(now2,before2),unit:rev.unit,precise:true});
  }
 }
 const flags=[...(dau?anomalies(dau.series,chart,'dau'):[]),...(fresh?anomalies(fresh.series,chart,'new'):[]),...(rev?anomalies(rev.series,chart,'revenue'):[])].sort((a,b)=>a.date.localeCompare(b.date));
 return {id,name,app:app||null,currency:currency||null,kpis,chart:{dates:chart,from:w.start,to:w.end,lines},anomalies:flags,retention:retention(cohorts,{end:w.end}),unavailable:unavailable||[]};
}
module.exports={window,anomalies,retention,periodRetention,block,range,shift,key,change};
