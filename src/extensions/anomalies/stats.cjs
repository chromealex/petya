// Robust statistics of «Аномалии»: a day's value against the same weekday of the four weeks before (median and MAD,
// so one odd week does not move the baseline), with a minimum effect size and a minimum volume so small numbers and
// tiny moves are never called anomalies. Pure functions; dates are 'YYYY-MM-DD' keys.
const DAY=86400000;
const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*DAY).toISOString().slice(0,10);
function median(values){const a=[...values].sort((x,y)=>x-y),n=a.length;if(!n)return null;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;}
function mad(values,m=median(values)){return values.length?median(values.map(v=>Math.abs(v-m))):null;}

// Sensitivity presets: how many robust sigmas and how big a relative move make an anomaly.
const SENSITIVITY={low:{k:4,effect:0.3},normal:{k:3,effect:0.2},high:{k:2.5,effect:0.12}};

// The baseline of `day` in a series (Map date → value): the same weekday 1–4 weeks back when at least three are there;
// otherwise, for short histories (14-day crash stats, 7-day review feeds), the 7–14 days right before it, marked
// `recent` (weekly seasonality cannot be seen then). Null when there is not enough history.
function baseline(points,day,{weeks=4}={}){
 const same=[];for(let w=1;w<=weeks;w++){const d=shift(day,-7*w);if(points.has(d))same.push({date:d,value:points.get(d)});}
 if(same.length>=3)return {kind:'weekday',points:same,values:same.map(p=>p.value)};
 const recent=[];for(let i=1;i<=14;i++){const d=shift(day,-i);if(points.has(d))recent.push({date:d,value:points.get(d)});}
 if(recent.length>=7)return {kind:'recent',points:recent,values:recent.map(p=>p.value)};
 return null;
}

// Scores one value against its baseline. `rules` per metric: {volume: minimum of max(value, median) to count at all,
// absolute?: minimum absolute move (for averages like the star rating, instead of the relative effect), floor?: a
// minimum sigma in the metric's own units}. Returns {anomaly, direction, value, median, sigma, z, change, band}.
function score(value,base,{k=3,effect=0.2}={},rules={}){
 const m=median(base.values),d=mad(base.values,m);
 // MAD is 0 for a flat history: a floor of 3% of the median (and the metric's own floor) keeps z finite and sane.
 const sigma=Math.max(1.4826*d,Math.abs(m)*0.03,rules.floor||0,1e-9);
 const z=(value-m)/sigma,change=m?(value-m)/Math.abs(m):null;
 const big=rules.absolute!=null?Math.abs(value-m)>=rules.absolute:change===null?value>=(rules.volume||0):Math.abs(change)>=effect;
 const enough=Math.max(Math.abs(value),Math.abs(m))>=(rules.volume||0);
 return {anomaly:Math.abs(z)>=k&&big&&enough,direction:value>=m?'up':'down',value,median:m,sigma,z,change,band:[m-k*sigma,m+k*sigma],enough};
}

module.exports={DAY,shift,median,mad,baseline,score,SENSITIVITY};
