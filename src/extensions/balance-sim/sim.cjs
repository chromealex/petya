// «Симуляция баланса»: a deterministic Monte Carlo of N free-to-play players over D days on the economy read from the
// configs. Same seed and inputs → the same numbers, so a «what if» is compared against the baseline with the same
// random draws. The loop, as the user confirmed it on the card:
//  - every player has an activity multiplier (log-normal, σ = 0.4, mean 1): some play more than others;
//  - actions per day ~ Poisson(actionsPerDay × multiplier); a day with at least one action pays the daily rewards;
//  - every action is a win with probability winRate (wins pay the win rewards, losses the loss rewards, both the
//    «any action» rewards);
//  - at the end of the day a player buys the cheapest sinks he can afford, in price order, once each (when spending
//    is on); the XP total gives the level through the curve.
// Output: percentile bands (p10, p25, p50, p75, p90) per day for the level and every currency, and the day each
// milestone is reached (level N, earning N of a currency, buying every sink) as percentiles over players.
const P=[10,25,50,75,90];

function rng(seed){
 let a=(Number(seed)>>>0)||1;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function normal(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function poisson(r,lambda){
 if(lambda<=0)return 0;
 if(lambda>30)return Math.max(0,Math.round(lambda+Math.sqrt(lambda)*normal(r)));
 const L=Math.exp(-lambda);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;
}
function pct(sorted,p){if(!sorted.length)return null;const i=Math.min(sorted.length-1,Math.max(0,Math.ceil(p/100*sorted.length)-1));return sorted[i];}
const bands=values=>{const s=Float64Array.from(values).sort();const o={};for(const p of P)o['p'+p]=round(pct(s,p));return o;};
const round=v=>v===null?null:Math.round(v*100)/100;
function levelOf(xp,th){let lo=0,hi=th.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(th[mid]<=xp)lo=mid;else hi=mid-1;}return lo+1;}

// model = {sources:[{trigger, resource, amount}], sinks:[{resource, price}], thresholds:[…] | null}
// params = {players, days, actionsPerDay, winRate, seed, spend}
// goals = {levels:[N], earn:[{resource, amount}]}
function run(model,params,goals={}){
 const players=clamp(params.players,10,5000,1000),days=clamp(params.days,1,365,30);
 const lambda=clampF(params.actionsPerDay,0,500,10),p=clampF(params.winRate,0,1,0.5),spend=params.spend!==false;
 const r=rng(params.seed??42);
 const resources=[...new Set([...model.sources.map(x=>x.resource),...model.sinks.map(x=>x.resource)].filter(x=>x&&x!=='xp'))];
 const pay={win:[],loss:[],action:[],daily:[]};
 for(const x of model.sources)if(pay[x.trigger]&&Number.isFinite(x.amount))pay[x.trigger].push([x.resource,x.amount]);
 const sinks={};for(const res of resources)sinks[res]=model.sinks.filter(x=>x.resource===res&&x.price>0).map(x=>x.price).sort((a,b)=>a-b);
 const th=Array.isArray(model.thresholds)&&model.thresholds.length>1?model.thresholds:null;
 const maxLevel=th?th.length:null;
 const levelGoals=(goals.levels||[]).filter(n=>Number.isInteger(n)&&n>1&&(!maxLevel||n<=maxLevel));
 const earnGoals=(goals.earn||[]).filter(g=>resources.includes(g.resource)&&g.amount>0);
 // Purchases in a currency nothing pays for (hard currency without donations) never happen; «all purchases» counts the rest.
 const earnable=resources.filter(res=>model.sources.some(x=>x.resource===res&&x.amount>0));
 const allSinks=earnable.reduce((n,res)=>n+sinks[res].length,0);
 // Per day, per player.
 const lv=Array.from({length:days},()=>new Float64Array(players));
 const bal=Object.fromEntries(resources.map(res=>[res,Array.from({length:days},()=>new Float64Array(players))]));
 const firstLevel=levelGoals.map(()=>new Float64Array(players).fill(Infinity));
 const firstEarn=earnGoals.map(()=>new Float64Array(players).fill(Infinity));
 const firstAll=new Float64Array(players).fill(Infinity);
 const spent=Object.fromEntries(resources.map(res=>[res,0]));
 let actionsTotal=0,winsTotal=0;
 for(let i=0;i<players;i++){
  const mult=Math.exp(0.4*normal(r)-0.08);// mean 1 for σ = 0.4
  let xp=0;const b=Object.fromEntries(resources.map(res=>[res,0])),earned=Object.fromEntries(resources.map(res=>[res,0])),next=Object.fromEntries(resources.map(res=>[res,0]));
  const add=(list)=>{for(const [res,v] of list){if(res==='xp')xp+=v;else if(res in b){b[res]+=v;earned[res]+=v;}}};
  for(let d=0;d<days;d++){
   const n=poisson(r,lambda*mult);
   if(n>0)add(pay.daily);
   for(let k=0;k<n;k++){const win=r()<p;if(win){add(pay.win);winsTotal++;}else add(pay.loss);add(pay.action);}
   actionsTotal+=n;
   if(spend)for(const res of resources){const list=sinks[res];while(next[res]<list.length&&b[res]>=list[next[res]]){b[res]-=list[next[res]];spent[res]+=list[next[res]];next[res]++;}}
   const level=th?levelOf(xp,th):1;
   lv[d][i]=level;
   for(const res of resources)bal[res][d][i]=b[res];
   levelGoals.forEach((n,g)=>{if(level>=n&&firstLevel[g][i]===Infinity)firstLevel[g][i]=d+1;});
   earnGoals.forEach((x,g)=>{if(earned[x.resource]>=x.amount&&firstEarn[g][i]===Infinity)firstEarn[g][i]=d+1;});
   if(spend&&allSinks&&firstAll[i]===Infinity&&earnable.every(res=>next[res]>=sinks[res].length))firstAll[i]=d+1;
  }
 }
 const milestone=(arr,label,extra)=>{
  const s=Float64Array.from(arr).sort();const reached=s.filter(Number.isFinite).length;
  const at=p=>{const v=pct(s,p);return Number.isFinite(v)?v:null;};
  return {label,...extra,p10:at(10),p50:at(50),p90:at(90),reached:reached/players};
 };
 const milestones=[
  ...levelGoals.map((n,g)=>milestone(firstLevel[g],'level',{level:n})),
  ...earnGoals.map((x,g)=>milestone(firstEarn[g],'earn',{resource:x.resource,amount:x.amount})),
  ...(spend&&allSinks?[milestone(firstAll,'sinks',{count:allSinks})]:[])
 ];
 return {
  players,days,seed:params.seed??42,actionsPerDay:lambda,winRate:p,spend,
  level:th?lv.map(bands):null,maxLevel,
  currency:Object.fromEntries(resources.map(res=>[res,bal[res].map(bands)])),
  milestones,
  // Checks for the card: the realised averages agree with the inputs.
  realised:{actionsPerDay:round(actionsTotal/players/days),winRate:actionsTotal?round(winsTotal/actionsTotal):null},
  spent:Object.fromEntries(resources.map(res=>[res,Math.round(spent[res]/players)]))
 };
}
function clamp(v,lo,hi,d){const n=Math.round(Number(v));return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;}
function clampF(v,lo,hi,d){const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;}
// Expected income per active day of an average player, by resource (used to propose the horizon and by «Идеи для
// ивентов» for costs).
function expected(model,{actionsPerDay,winRate}){
 const out={};const add=(res,v)=>{out[res]=(out[res]||0)+v;};
 for(const x of model.sources){
  const k=x.trigger==='win'?actionsPerDay*winRate:x.trigger==='loss'?actionsPerDay*(1-winRate):x.trigger==='action'?actionsPerDay:1;
  add(x.resource,x.amount*k);
 }
 return out;
}
// A «what if» applied to a copy of the model: multiply or set the matched sources / sinks.
function apply(model,change){
 const hit=new Set(change.ids||[]);
 const f=v=>change.op==='set'?change.value:v*change.value;
 return {...model,sources:model.sources.map(x=>hit.has(x.id)?{...x,amount:f(x.amount)}:x),sinks:model.sinks.map(x=>hit.has(x.id)?{...x,price:f(x.price)}:x)};
}
module.exports={run,expected,apply,rng,poisson,pct,levelOf,P};
