// «Воронки»: every number on the card is computed here.
// An ordered funnel: a player enters with the first occurrence of step 1 inside the period; step k counts when the
// player sent its event at or after the moment step k−1 was reached (the earliest such occurrence), up to the end of
// the period. Two inputs give the same result shape:
//  - journeys (AppMetrica Logs API): per player the times of each step's events → exact counts and exact medians;
//  - buckets (SQL): per segment, step and time bucket the number of players → exact counts, medians to a bucket.
const DAY=86400000;
// Lower bounds (seconds) of the time buckets the SQL query returns; the last one is open.
const BUCKETS=[0,10,30,60,120,300,600,1800,3600,7200,21600,86400,259200,604800];
const SEGMENTS=['platform','country','version'];
const TOP=6;

const median=list=>{if(!list.length)return null;const a=[...list].sort((x,y)=>x-y),m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const quantile=(list,q)=>{if(!list.length)return null;const a=[...list].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(q*(a.length-1)+0.5))];};

// The moments a player reached each step (ms), as far as they got; [] when the player did not enter in [from, end].
function walk(times,steps,from,end){
 const out=[];let at=-Infinity;
 for(let k=0;k<steps.length;k++){
  const list=times?.[steps[k].event]||[];
  const hit=k===0?list.find(t=>t>=from&&t<=end):list.find(t=>t>=at&&t<=end);
  if(hit===undefined)break;
  out.push(hit);at=hit;
 }
 return out;
}
function steps(counts,list){
 const first=counts[0]||0;
 return list.map((s,i)=>({event:s.event,label:s.label,users:counts[i]||0,fromStart:first>0?(counts[i]||0)/first:null,fromPrev:i===0?null:counts[i-1]>0?(counts[i]||0)/counts[i-1]:null,lost:i===0?0:Math.max(0,(counts[i-1]||0)-(counts[i]||0))}));
}
// The step with the largest loss share (the main drop-off), or -1.
function worst(rows){let at=-1,share=-1;rows.forEach((r,i)=>{if(i&&r.fromPrev!==null&&1-r.fromPrev>share&&rows[i-1].users>0){share=1-r.fromPrev;at=i;}});return at;}
function segmentRows(groups,stepsList){
 const rows=[...groups].map(([value,counts])=>({value,counts})).sort((a,b)=>b.counts[0]-a.counts[0]||a.value.localeCompare(b.value));
 const top=rows.filter(r=>r.value!=='').slice(0,TOP),rest=rows.filter(r=>!top.includes(r));
 if(rest.length){const sum=stepsList.map((_,i)=>rest.reduce((n,r)=>n+(r.counts[i]||0),0));if(sum[0])top.push({value:'',other:true,counts:sum});}
 return top.map(r=>({value:r.value,other:!!r.other||r.value==='',users:r.counts,conversion:r.counts[0]?r.counts[r.counts.length-1]/r.counts[0]:null,fromStart:r.counts.map(c=>r.counts[0]?c/r.counts[0]:null)}));
}

// journeys: [{user, platform, country, version, times:{event:[ms ascending]}}]; from/to: 'YYYY-MM-DD' inclusive.
function fromJourneys(journeys,list,{from,to}){
 const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z')+DAY-1;
 const counts=list.map(()=>0),gaps=list.slice(1).map(()=>[]);
 const groups=Object.fromEntries(SEGMENTS.map(d=>[d,new Map()]));
 for(const j of journeys){
  const reached=walk(j.times,list,start,end);if(!reached.length)continue;
  reached.forEach((t,i)=>{counts[i]++;if(i)gaps[i-1].push((t-reached[i-1])/1000);});
  for(const d of SEGMENTS){const v=String(j[d]||'');const g=groups[d];if(!g.has(v))g.set(v,list.map(()=>0));const c=g.get(v);reached.forEach((_,i)=>c[i]++);}
 }
 const rows=steps(counts,list);
 return {steps:rows,worst:worst(rows),
  times:gaps.map((g,i)=>({from:i,to:i+1,n:g.length,median:median(g),p90:quantile(g,0.9),exact:true})),
  segments:Object.fromEntries(SEGMENTS.map(d=>[d,segmentRows(groups[d],list)]).filter(([,r])=>r.length>1||r.length===1&&r[0].value!=='')),
  conversion:counts[0]?counts[counts.length-1]/counts[0]:null,players:counts[0]};
}

// rows: [{seg, step (1-based), bucket (index into BUCKETS, or -1 on step 1), users}] where seg '__all__' is the total
// and other values are the segment `dimension`.
function bucketMedian(hist){
 const n=hist.reduce((a,b)=>a+b,0);if(!n)return null;
 let run=0;for(let i=0;i<hist.length;i++){run+=hist[i];if(run>=n/2)return {lo:BUCKETS[i],hi:BUCKETS[i+1]??null};}
 return null;
}
function fromBuckets(rows,list,{dimension=null}={}){
 const counts=list.map(()=>0),hist=list.slice(1).map(()=>BUCKETS.map(()=>0)),groups=new Map();
 for(const r of rows){
  const k=Number(r.step)-1,users=Math.max(0,Math.round(Number(r.users)||0));
  if(!(k>=0&&k<list.length)||!users)continue;
  if(String(r.seg)==='__all__'){counts[k]+=users;const b=Number(r.bucket);if(k>0&&b>=0&&b<BUCKETS.length)hist[k-1][b]+=users;}
  else if(dimension){const v=String(r.seg??'');if(!groups.has(v))groups.set(v,list.map(()=>0));groups.get(v)[k]+=users;}
 }
 const rowsOut=steps(counts,list);
 return {steps:rowsOut,worst:worst(rowsOut),
  times:hist.map((h,i)=>{const m=bucketMedian(h);return {from:i,to:i+1,n:h.reduce((a,b)=>a+b,0),median:null,range:m,exact:false};}),
  segments:dimension&&groups.size?{[dimension]:segmentRows(groups,list)}:{},
  conversion:counts[0]?counts[counts.length-1]/counts[0]:null,players:counts[0]};
}

// The table for «Выгрузить в Google Таблицы».
function table(result){
 return result.steps.map((s,i)=>{const t=i?result.times[i-1]:null;
  return [i+1,s.label,s.event,s.users,s.fromStart===null?'':Math.round(s.fromStart*10000)/100,s.fromPrev===null?'':Math.round(s.fromPrev*10000)/100,s.lost,t?.median!=null?Math.round(t.median):t?.range?String(t.range.lo)+'–'+(t.range.hi??'∞'):''];});
}
module.exports={BUCKETS,SEGMENTS,walk,fromJourneys,fromBuckets,bucketMedian,median,quantile,table};
