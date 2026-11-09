// «Объясни график»: where the series moved. For every day with at least 3 earlier days, its deviation from the median
// of up to 7 earlier days; the largest deviation in the asked direction (or either) is the event. A move under 8% is
// «no notable change». The onset is the first day of the run of days that stayed at least half as far off; the move
// is a «step» when the days after it stay off, a «spike» when they come back.
const MIN=0.08;
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function deviations(points){
 const out=[];
 for(let i=3;i<points.length;i++){
  const base=median(points.slice(Math.max(0,i-7),i).map(p=>p.value));
  if(!(base>0))continue;
  out.push({i,date:points[i].date,value:points[i].value,base,dev:points[i].value/base-1});
 }
 return out;
}
function find(points,direction=null){
 const list=deviations(points);
 if(!list.length)return {notable:false,reason:'short'};
 const pickOne=dir=>dir==='down'?list.reduce((a,b)=>b.dev<a.dev?b:a):dir==='up'?list.reduce((a,b)=>b.dev>a.dev?b:a):list.reduce((a,b)=>Math.abs(b.dev)>Math.abs(a.dev)?b:a);
 const best=pickOne(direction);
 const dir=best.dev<0?'down':'up';
 if(Math.abs(best.dev)<MIN||(direction&&dir!==direction))return {notable:false,reason:'flat',largest:{date:best.date,dev:best.dev,value:best.value,base:best.base},direction:direction||dir};
 // Onset: walk back while the earlier days were at least 40% as far off, measured against the same baseline.
 let start=best.i;
 while(start-1>=3){const v=points[start-1].value/best.base-1;if(dir==='down'?v<=best.dev*0.4:v>=best.dev*0.4)start--;else break;}
 const after=points.slice(best.i+1);
 const recovered=after.length?after.some(p=>dir==='down'?p.value/best.base-1>best.dev/2:p.value/best.base-1<best.dev/2):null;
 return {notable:true,direction:dir,date:best.date,onset:points[start].date,value:best.value,base:best.base,dev:best.dev,shape:after.length?(recovered?'spike':'step'):'last',lastDate:points.at(-1).date};
}
module.exports={find,deviations,median,MIN};
