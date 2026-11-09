// «A/B-тесты»: the statistics, all in code. Nothing here guesses: every number on the card comes from these
// functions applied to the numbers the user gave.
// Distributions: normal (erf series / erfc continued fraction), Student t (regularized incomplete beta),
// chi-square (regularized incomplete gamma); log-gamma by Lanczos. Accuracy is ~1e-10 or better, which is far
// beyond what a p-value needs.

const SQRT2=Math.SQRT2,SQRTPI=Math.sqrt(Math.PI);

// erf(x) by its Taylor series for |x|<3, erfc(x) by Lentz's continued fraction otherwise.
function erfc(x){
 if(x<0)return 2-erfc(-x);
 if(x<3){
  let sum=0,term=x,n=0;
  while(Math.abs(term)>1e-17*Math.abs(sum)||n<3){sum+=term/(2*n+1);n++;term*=-x*x/n;if(n>200)break;}
  return 1-2/SQRTPI*sum;
 }
 // erfc(x) = exp(-x²)/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + …))))
 const tiny=1e-300;let f=x,C=x,D=0;
 for(let i=1;i<300;i++){
  const a=i/2;D=x+a*D;if(Math.abs(D)<tiny)D=tiny;C=x+a/C;if(Math.abs(C)<tiny)C=tiny;D=1/D;const delta=C*D;f*=delta;if(Math.abs(delta-1)<1e-16)break;
 }
 return Math.exp(-x*x)/SQRTPI/f;
}
const normCdf=z=>0.5*erfc(-z/SQRT2);
const normPdf=z=>Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);

// Inverse normal: Acklam's rational approximation refined by one Halley step.
function normInv(p){
 if(!(p>0&&p<1))return p===0?-Infinity:p===1?Infinity:NaN;
 const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239];
 const b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572];
 const c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
 const d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
 const lo=0.02425;let x;
 if(p<lo){const q=Math.sqrt(-2*Math.log(p));x=(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
 else if(p<=1-lo){const q=p-0.5,r=q*q;x=(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
 else{const q=Math.sqrt(-2*Math.log(1-p));x=-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
 const e=normCdf(x)-p,u=e*Math.sqrt(2*Math.PI)*Math.exp(x*x/2);
 return x-u/(1+x*u/2);
}

function lnGamma(x){
 const g=7,coef=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
 if(x<0.5)return Math.log(Math.PI/Math.sin(Math.PI*x))-lnGamma(1-x);
 x-=1;let a=coef[0];const t=x+g+0.5;
 for(let i=1;i<g+2;i++)a+=coef[i]/(x+i);
 return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a);
}

// Regularized incomplete beta I_x(a,b) (Numerical Recipes betacf).
function betacf(a,b,x){
 const tiny=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
 if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
 for(let m=1;m<=500;m++){
  const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));
  d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;
  aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
  d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const del=d*c;h*=del;
  if(Math.abs(del-1)<1e-15)break;
 }
 return h;
}
function betai(a,b,x){
 if(x<=0)return 0;if(x>=1)return 1;
 const bt=Math.exp(lnGamma(a+b)-lnGamma(a)-lnGamma(b)+a*Math.log(x)+b*Math.log(1-x));
 return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b;
}
// Two-sided p-value of Student's t and the t quantile (by bisection on the CDF).
const tTwoSided=(t,df)=>!Number.isFinite(df)||df>1e7?2*normCdf(-Math.abs(t)):betai(df/2,0.5,df/(df+t*t));
function tInv(p,df){
 // Upper quantile for P(T<=t)=p, p>0.5.
 if(!Number.isFinite(df)||df>1e7)return normInv(p);
 let lo=0,hi=1;while(tTwoSided(hi,df)/2>1-p&&hi<1e6)hi*=2;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(tTwoSided(mid,df)/2>1-p)lo=mid;else hi=mid;if(hi-lo<1e-12)break;}
 return (lo+hi)/2;
}

// Regularized upper incomplete gamma Q(a,x) (series for x<a+1, continued fraction otherwise).
function gammq(a,x){
 if(x<=0)return 1;
 const gln=lnGamma(a);
 if(x<a+1){
  let ap=a,sum=1/a,del=sum;
  for(let n=0;n<1000;n++){ap++;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*1e-16)break;}
  return 1-sum*Math.exp(-x+a*Math.log(x)-gln);
 }
 const tiny=1e-300;let b=x+1-a,c=1/tiny,d=1/b,h=d;
 for(let i=1;i<1000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<tiny)d=tiny;c=b+an/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<1e-16)break;}
 return Math.exp(-x+a*Math.log(x)-gln)*h;
}
const chiSquareSf=(x,df)=>gammq(df/2,x/2);

const zFor=alpha=>normInv(1-alpha/2);

// Wilson score interval for x successes of n.
function wilson(x,n,alpha=0.05){
 if(!(n>0))return {low:0,high:0};
 const z=zFor(alpha),p=x/n,z2=z*z,den=1+z2/n,center=(p+z2/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;
 return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}

// Two-proportion z-test (pooled SE for the test, unpooled for the CI of the difference) and the relative lift
// with a delta-method CI on the log of the ratio.
function twoProportions(xA,nA,xB,nB,alpha=0.05){
 const pA=xA/nA,pB=xB/nB,pool=(xA+xB)/(nA+nB);
 const se0=Math.sqrt(pool*(1-pool)*(1/nA+1/nB));
 const z=se0>0?(pB-pA)/se0:0,p=se0>0?2*normCdf(-Math.abs(z)):1;
 const se=Math.sqrt(pA*(1-pA)/nA+pB*(1-pB)/nB),q=zFor(alpha);
 const diff={value:pB-pA,low:pB-pA-q*se,high:pB-pA+q*se};
 let lift=null;
 if(xA>0&&xB>0){
  const r=Math.log(pB/pA),s=Math.sqrt((1-pA)/(nA*pA)+(1-pB)/(nB*pB));
  lift={value:pB/pA-1,low:Math.exp(r-q*s)-1,high:Math.exp(r+q*s)-1};
 }
 return {pA,pB,z,p,diff,lift};
}

// Welch's t-test from summaries; the lift CI uses the delta method on the ratio of means.
function welch(a,b,alpha=0.05){
 const vA=a.sd*a.sd/a.n,vB=b.sd*b.sd/b.n,se=Math.sqrt(vA+vB);
 const df=se>0?(vA+vB)**2/(vA*vA/(a.n-1)+vB*vB/(b.n-1)):Infinity;
 const t=se>0?(b.mean-a.mean)/se:0,p=se>0?tTwoSided(t,df):1,q=tInv(1-alpha/2,df);
 const diff={value:b.mean-a.mean,low:b.mean-a.mean-q*se,high:b.mean-a.mean+q*se};
 let lift=null;
 if(a.mean>0){
  const r=b.mean/a.mean,s=Math.sqrt(vB/(a.mean*a.mean)+b.mean*b.mean*vA/a.mean**4);
  lift={value:r-1,low:r-1-q*s,high:r-1+q*s};
 }
 return {t,df,p,diff,lift};
}

function summary(values){
 const n=values.length;let mean=0;for(const v of values)mean+=v;mean/=n||1;
 let m2=0,m3=0;for(const v of values){const d=v-mean;m2+=d*d;m3+=d*d*d;}
 const sd=n>1?Math.sqrt(m2/(n-1)):0,pop=Math.sqrt(m2/(n||1));
 return {n,mean,sd,skew:pop>0?m3/n/pop**3:0,zeros:values.filter(v=>v===0).length/(n||1)};
}

// Small, fast, seeded PRNG: the same data gives the same bootstrap interval every time.
function mulberry32(seed){let t=seed>>>0;return ()=>{t=(t+0x6D2B79F5)>>>0;let r=Math.imul(t^(t>>>15),1|t);r=(r+Math.imul(r^(r>>>7),61|r))^r;return ((r^(r>>>14))>>>0)/4294967296;};}
function quantile(sorted,q){const i=(sorted.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}
// Percentile bootstrap of the difference of means and of the relative lift (B resamples, fixed seed).
function bootstrap(a,b,{rounds=2000,seed=42,alpha=0.05}={}){
 const rand=mulberry32(seed),nA=a.length,nB=b.length,diffs=new Float64Array(rounds),lifts=[];
 for(let r=0;r<rounds;r++){
  let sA=0,sB=0;
  for(let i=0;i<nA;i++)sA+=a[(rand()*nA)|0];
  for(let i=0;i<nB;i++)sB+=b[(rand()*nB)|0];
  const mA=sA/nA,mB=sB/nB;diffs[r]=mB-mA;if(mA>0)lifts.push(mB/mA-1);
 }
 const d=[...diffs].sort((x,y)=>x-y),l=lifts.sort((x,y)=>x-y);
 // Two-sided bootstrap p-value: twice the share of resampled differences on the other side of zero.
 const below=d.filter(x=>x<=0).length/rounds,above=d.filter(x=>x>=0).length/rounds;
 return {rounds,seed,diff:{low:quantile(d,alpha/2),high:quantile(d,1-alpha/2)},lift:l.length>rounds/2?{low:quantile(l,alpha/2),high:quantile(l,1-alpha/2)}:null,p:Math.min(1,2*Math.min(below,above))};
}

// Sample size per group to detect p1 → p1·(1+mde) (two-sided, no continuity correction; Fleiss).
function sampleSizeProportions(p1,mde,alpha=0.05,power=0.8){
 const p2=p1*(1+mde);if(!(p1>0&&p1<1&&p2>0&&p2<1&&mde!==0))return Infinity;
 const za=zFor(alpha),zb=normInv(power),pbar=(p1+p2)/2;
 return Math.ceil((za*Math.sqrt(2*pbar*(1-pbar))+zb*Math.sqrt(p1*(1-p1)+p2*(1-p2)))**2/(p2-p1)**2);
}
// Sample size per group for a difference of means delta with a common sd (normal approximation).
function sampleSizeMeans(sd,delta,alpha=0.05,power=0.8){
 if(!(sd>0&&delta!==0))return Infinity;
 return Math.ceil(2*((zFor(alpha)+normInv(power))*sd/delta)**2);
}
// Power of the two-proportion test at n per group for p1 → p2.
function powerProportions(p1,p2,n,alpha=0.05){
 const za=zFor(alpha),pbar=(p1+p2)/2,s0=Math.sqrt(2*pbar*(1-pbar)/n),s1=Math.sqrt((p1*(1-p1)+p2*(1-p2))/n);
 return s1>0?normCdf((Math.abs(p2-p1)-za*s0)/s1):0;
}
// Smallest relative effect detectable with the given n per group (bisection on the sample size formula).
function mdeProportions(p1,n,alpha=0.05,power=0.8){
 if(!(p1>0&&p1<1&&n>1))return null;
 let lo=1e-6,hi=Math.min(50,(1-1e-9)/p1-1);
 if(sampleSizeProportions(p1,hi,alpha,power)>n)return null;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(sampleSizeProportions(p1,mid,alpha,power)>n)lo=mid;else hi=mid;if(hi-lo<1e-9)break;}
 return hi;
}
const mdeMeans=(sd,mean,n,alpha=0.05,power=0.8)=>sd>0&&mean>0&&n>1?(zFor(alpha)+normInv(power))*sd*Math.sqrt(2/n)/mean:null;

// Holm–Bonferroni step-down adjustment; returns adjusted p-values in the input order.
function holm(pvalues){
 const order=pvalues.map((p,i)=>[p,i]).sort((x,y)=>x[0]-y[0]),m=pvalues.length,out=new Array(m);let running=0;
 order.forEach(([p,i],k)=>{running=Math.max(running,Math.min(1,(m-k)*p));out[i]=running;});
 return out;
}

// Sample ratio mismatch: chi-square goodness of fit of the assignment counts against the planned split.
function srm(counts,weights){
 const total=counts.reduce((a,b)=>a+b,0),w=weights&&weights.length===counts.length?weights:counts.map(()=>1),ws=w.reduce((a,b)=>a+b,0);
 let chi=0;counts.forEach((c,i)=>{const e=total*w[i]/ws;chi+=(c-e)**2/e;});
 return {chi2:chi,df:counts.length-1,p:chiSquareSf(chi,counts.length-1),expected:w.map(x=>x/ws)};
}

module.exports={erfc,normCdf,normPdf,normInv,lnGamma,betai,tTwoSided,tInv,gammq,chiSquareSf,wilson,twoProportions,welch,summary,mulberry32,bootstrap,
 sampleSizeProportions,sampleSizeMeans,powerProportions,mdeProportions,mdeMeans,holm,srm};
