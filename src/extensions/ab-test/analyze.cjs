// «A/B-тесты»: from parsed numbers to the card — tests, intervals, SRM, power and an honest verdict.
// The first variant is the control; every other variant is compared with it, p-values Holm-corrected when there
// are several. Heavy-tailed per-user values (revenue) get a seeded bootstrap interval instead of the t interval.
const st=require('./stats.cjs');
const DEFAULT_MDE=0.10,ALPHA=0.05,POWER=0.8,SRM_P=0.001;
const MIN_USERS=100,MIN_CONVERSIONS=10;

const ru=(n,digits=1)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:digits,minimumFractionDigits:0});
const pct=(v,digits=1)=>(v>0?'+':v<0?'−':'')+ru(Math.abs(v)*100,digits)+'%';
const pText=p=>p<0.0001?'p<0,0001':'p='+ru(Number(p.toPrecision(2)),6);
const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
const ci=(r,f=pct)=>'['+f(r.low)+'; '+f(r.high)+']';

function validate(input){
 const v=input?.variants;
 if(!Array.isArray(v)||v.length<2)throw Error('Нужны хотя бы две группы с числами.');
 if(v.length>8)throw Error('Слишком много групп: до восьми.');
 for(const x of v){
  if(x.values){if(x.values.length<2||x.values.some(n=>!Number.isFinite(n)))throw Error('В группе «'+x.name+'» мало значений.');continue;}
  if(!(Number.isFinite(x.users)&&x.users>0&&Number.isSafeInteger(Math.round(x.users))))throw Error('В группе «'+x.name+'» не указано число игроков.');
  if(input.metric==='conversion'&&!(Number.isFinite(x.conversions)&&x.conversions>=0&&x.conversions<=x.users))throw Error('В группе «'+x.name+'» конверсий больше, чем игроков, или их нет.');
  if(input.metric==='mean'&&!(Number.isFinite(x.mean)&&Number.isFinite(x.sd)&&x.sd>=0&&x.users>1))throw Error('В группе «'+x.name+'» нужны среднее, стандартное отклонение и число игроков.');
 }
 const names=v.map(x=>String(x.name));if(new Set(names).size!==names.length)throw Error('Группы названы одинаково.');
}

function analyze(input,{seed=42,rounds=2000}={}){
 validate(input);
 if(input.metric==='assignment')return assignment(input);
 const alpha=input.alpha||ALPHA,power=POWER,metric=input.metric;
 const warnings=[];
 // Per-variant summaries.
 const variants=input.variants.map(x=>{
  if(metric==='conversion'){const rate=x.conversions/x.users;return {name:String(x.name),users:x.users,conversions:x.conversions,rate,ci:st.wilson(x.conversions,x.users,alpha)};}
  const s=x.values?st.summary(x.values):{n:x.users,mean:x.mean,sd:x.sd,skew:0,zeros:0};
  const half=st.tInv(1-alpha/2,s.n-1)*s.sd/Math.sqrt(s.n);
  return {name:String(x.name),users:s.n,rate:s.mean,sd:s.sd,skew:s.skew,zeros:s.zeros,ci:{low:s.mean-half,high:s.mean+half},values:x.values};
 });
 const heavy=metric==='mean'&&variants.every(v=>v.values)&&variants.some(v=>Math.abs(v.skew)>2||v.zeros>0.5);
 const control=variants[0];
 // Comparisons with the control.
 const comparisons=variants.slice(1).map(v=>{
  if(metric==='conversion'){const r=st.twoProportions(control.conversions,control.users,v.conversions,v.users,alpha);return {name:v.name,method:'z',p:r.p,lift:r.lift,diff:r.diff,stat:r.z};}
  const w=st.welch({mean:control.rate,sd:control.sd,n:control.users},{mean:v.rate,sd:v.sd,n:v.users},alpha);
  if(heavy){
   const b=st.bootstrap(control.values,v.values,{rounds,seed,alpha});
   const mid=control.rate>0?v.rate/control.rate-1:null;
   return {name:v.name,method:'bootstrap',p:b.p,rounds:b.rounds,seed:b.seed,welchP:w.p,diff:{value:v.rate-control.rate,...b.diff},lift:b.lift&&mid!==null?{value:mid,...b.lift}:null,stat:w.t,df:w.df};
  }
  return {name:v.name,method:'welch',p:w.p,diff:w.diff,lift:w.lift,stat:w.t,df:w.df};
 });
 const adjusted=comparisons.length>1?st.holm(comparisons.map(c=>c.p)):comparisons.map(c=>c.p);
 comparisons.forEach((c,i)=>{c.pAdjusted=adjusted[i];c.significant=c.method==='bootstrap'?adjusted[i]<alpha&&(c.diff.low>0||c.diff.high<0):adjusted[i]<alpha;});
 if(comparisons.length>1)warnings.push('Групп больше двух: p-value скорректированы методом Холма.');
 if(heavy)warnings.push('Распределение с тяжёлым хвостом: интервалы — бутстрэп ('+rounds+' повторов, seed '+seed+').');

 // Sample ratio mismatch on assignment counts.
 let srm=null;
 const counts=variants.map(v=>v.users);
 if(counts.every(n=>n>0)){
  const r=st.srm(counts,input.split);
  srm={p:r.p,chi2:r.chi2,expected:r.expected,observed:counts.map(n=>n/counts.reduce((a,b)=>a+b,0)),flagged:r.p<SRM_P,planned:input.split||null};
 }

 // Power: sample size per group for the MDE, the MDE detectable now, and how long to wait.
 const mde=input.mde||DEFAULT_MDE;
 const minUsers=Math.min(...counts),total=counts.reduce((a,b)=>a+b,0);
 let required=Infinity,detectable=null;
 if(metric==='conversion'){required=st.sampleSizeProportions(control.rate,mde,alpha,power);detectable=st.mdeProportions(control.rate,minUsers,alpha,power);}
 else{const sd=Math.sqrt(variants.reduce((a,v)=>a+v.sd*v.sd,0)/variants.length);required=st.sampleSizeMeans(sd,control.rate*mde,alpha,power);detectable=st.mdeMeans(sd,control.rate,minUsers,alpha,power);}
 const daily=input.dailyTraffic||(input.days>0?total/input.days:null);
 const remaining=Number.isFinite(required)?Math.max(0,required*variants.length-total):null;
 const wait=daily>0&&remaining!==null?Math.ceil(remaining/daily):null;
 const powerInfo={mde,mdeGiven:!!input.mde,alpha,power,required:Number.isFinite(required)?required:null,current:minUsers,share:Number.isFinite(required)?Math.min(1,minUsers/required):null,
  detectable,dailyTraffic:daily?Math.round(daily):null,trafficGiven:!!input.dailyTraffic,days:input.days||null,waitDays:wait};

 // Verdict.
 const few=minUsers<MIN_USERS||metric==='conversion'&&variants.some(v=>v.conversions<MIN_CONVERSIONS);
 const powered=Number.isFinite(required)&&minUsers>=required;
 const best=comparisons.filter(c=>c.significant).sort((a,b)=>Math.abs(b.lift?.value??b.diff.value)-Math.abs(a.lift?.value??a.diff.value))[0];
 let verdict;
 if(srm?.flagged)verdict={kind:'srm',label:'SRM — проверьте разбиение',tone:'alert'};
 else if(few)verdict={kind:'early',label:'рано',tone:'progress'};
 else if(best){
  const up=best.diff.value>0,effect=best.lift?pct(best.lift.value)+' '+ci(best.lift):(metric==='mean'?ru(best.diff.value,2):pct(best.diff.value))+' '+ci(best.diff,v=>ru(v,2));
  verdict={kind:up?'better':'worse',variant:best.name,label:best.name+(up?' лучше':' хуже'),detail:pText(best.pAdjusted)+', '+effect,tone:up?'done':'alert'};
 }
 else if(powered)verdict={kind:'nodiff',label:'разницы не видно',tone:''};
 else verdict={kind:'early',label:'рано',tone:'progress'};
 if(best&&!powered)warnings.push('Значимость получена до набора выборки ('+ru(minUsers,0)+' из '+ru(required,0)+' на группу). Если смотрите на результат каждый день, шанс ложной победы выше '+ru(alpha*100,0)+'%: дождитесь плана или используйте последовательный тест.');
 else if(input.peeking)warnings.push('Подглядывание: решение «остановить, как только p<'+ru(alpha,2)+'» завышает долю ложных побед. Зафиксируйте размер выборки заранее.');
 if(srm?.flagged)warnings.unshift('Игроки разделились не так, как планировали ('+srm.observed.map(x=>ru(x*100,1)+'%').join(' / ')+' при плане '+srm.expected.map(x=>ru(x*100,0)+'%').join(' / ')+', '+pText(srm.p)+'). Результатам сравнения нельзя верить, пока не найдена причина.');
 if(few)warnings.push('Мало данных: нужно хотя бы '+MIN_USERS+' игроков'+(metric==='conversion'?' и '+MIN_CONVERSIONS+' конверсий':'')+' в каждой группе.');

 // A common axis for the rate bars: all intervals fit.
 const lo=Math.min(...variants.map(v=>v.ci.low)),hi=Math.max(...variants.map(v=>v.ci.high)),pad=(hi-lo)*0.08||Math.abs(hi)*0.1||0.01;
 const axis={min:metric==='conversion'?Math.max(0,lo-pad):lo-pad,max:metric==='conversion'?Math.min(1,hi+pad):hi+pad};
 const card={metric,alpha,variants:variants.map(({values,...v})=>v),comparisons,srm,power:powerInfo,verdict,warnings,axis,heavy,source:input.source||'text'};
 card.summary=summaryText(card);card.report=report(card);
 return card;
}

// Only assignment counts («A 50000, B 49000 — есть ли SRM?»): the split check alone.
function assignment(input){
 const counts=input.variants.map(v=>v.users),total=counts.reduce((a,b)=>a+b,0),r=st.srm(counts,input.split);
 const srm={p:r.p,chi2:r.chi2,expected:r.expected,observed:counts.map(n=>n/total),flagged:r.p<SRM_P,planned:input.split||null};
 const verdict=srm.flagged?{kind:'srm',label:'SRM — проверьте разбиение',tone:'alert'}:{kind:'ok',label:'разбиение в порядке',tone:'done'};
 const variants=input.variants.map((v,i)=>({name:String(v.name),users:v.users,rate:srm.observed[i],expected:srm.expected[i]}));
 const warnings=srm.flagged?['Игроки разделились не так, как планировали: ищите причину (фильтры после разбиения, падения в одной ветке, боты) до того, как читать результат.']:[];
 const card={metric:'assignment',alpha:ALPHA,variants,comparisons:[],srm,power:null,verdict,warnings,axis:{min:0,max:Math.min(1,Math.max(...srm.observed,...srm.expected)*1.15)},source:input.source||'text'};
 card.summary=srm.flagged?'SRM: группы разделились не по плану (χ²='+ru(srm.chi2,2)+', '+pText(srm.p)+') — проверьте разбиение.':'SRM не видно: '+srm.observed.map(x=>ru(x*100,2)+'%').join(' / ')+' при плане '+srm.expected.map(x=>ru(x*100,0)+'%').join(' / ')+' ('+pText(srm.p)+').';
 card.report='Проверка разбиения (SRM): '+variants.map(v=>v.name+' '+ru(v.users,0)).join(', ')+'\nχ²='+ru(srm.chi2,3)+', '+pText(srm.p)+' — '+verdict.label;
 return card;
}
function rateText(card,v){return card.metric==='conversion'?ru(v.rate*100,2)+'%':ru(v.rate,2);}
function summaryText(card){
 const v=card.verdict,first=card.comparisons[0];
 if(v.kind==='srm')return 'SRM: группы разделились не по плану ('+pText(card.srm.p)+') — сначала проверьте разбиение.';
 if(v.kind==='better'||v.kind==='worse')return v.label+' ('+v.detail+').';
 const p=card.comparisons.length===1?' '+first.name+' против '+card.variants[0].name+': '+(first.lift?pct(first.lift.value):'')+', '+pText(first.pAdjusted)+'.':'';
 if(v.kind==='nodiff')return 'Разницы не видно.'+p+' Выборки хватает, чтобы заметить '+pct(card.power.mde,0)+'.';
 const need=card.power.required?' Для эффекта '+pct(card.power.mde,0)+' нужно ~'+ru(card.power.required,0)+' игроков на группу, сейчас '+ru(card.power.current,0)+'.':'';
 return 'Рано делать вывод.'+p+need;
}
function report(card){
 const lines=['A/B-тест: '+(card.metric==='conversion'?'конверсия':'среднее на игрока')+', α='+ru(card.alpha,2)];
 for(const v of card.variants)lines.push(v.name+': '+ru(v.users,0)+' '+plural(v.users,['игрок','игрока','игроков'])+(card.metric==='conversion'?', '+ru(v.conversions,0)+' '+plural(v.conversions,['конверсия','конверсии','конверсий']):'')+' — '+rateText(card,v)+' '+ci(v.ci,x=>card.metric==='conversion'?ru(x*100,2)+'%':ru(x,2)));
 for(const c of card.comparisons)lines.push(c.name+' против '+card.variants[0].name+': '+(c.lift?pct(c.lift.value)+' '+ci(c.lift):ru(c.diff.value,3))+', '+pText(c.pAdjusted)+(card.comparisons.length>1?' (Холм)':'')+' · '+({z:'z-тест двух долей',welch:'t-тест Уэлча',bootstrap:'бутстрэп'})[c.method]);
 if(card.srm)lines.push('SRM: '+pText(card.srm.p)+(card.srm.flagged?' — разбиение нарушено':' — в порядке'));
 const p=card.power;if(p.required)lines.push('Мощность '+ru(p.power*100,0)+'%: для '+pct(p.mde,0)+' нужно '+ru(p.required,0)+' на группу, сейчас '+ru(p.current,0)+(p.waitDays!==null&&p.waitDays>0?', ещё ~'+p.waitDays+' дн.':''));
 lines.push('Вывод: '+card.verdict.label+(card.verdict.detail?' ('+card.verdict.detail+')':''));
 for(const w of card.warnings)lines.push('⚠ '+w);
 return lines.join('\n');
}
// «Сколько нужно игроков для теста»: sample size per group for a baseline conversion and an MDE, with a small
// table of neighbouring effects, and the duration when daily traffic is known.
function plan({baseline,mde=DEFAULT_MDE,alpha=ALPHA,power=POWER,groups=2,dailyTraffic=null}){
 if(!(baseline>0&&baseline<1))throw Error('Нужна текущая конверсия от 0 до 100%.');
 if(!(mde>0&&baseline*(1+mde)<1))throw Error('Минимальный эффект указан неверно.');
 const required=st.sampleSizeProportions(baseline,mde,alpha,power);
 const options=[...new Set([0.02,0.05,0.1,0.15,0.2,mde])].filter(x=>baseline*(1+x)<1).sort((a,b)=>a-b).map(x=>({mde:x,required:st.sampleSizeProportions(baseline,x,alpha,power),current:x===mde}));
 const days=dailyTraffic>0?Math.ceil(required*groups/dailyTraffic):null;
 const card={mode:'plan',metric:'conversion',baseline,mde,alpha,power,groups,required,total:required*groups,dailyTraffic:dailyTraffic||null,days,options,
  verdict:{kind:'plan',label:'план',tone:''},warnings:[]};
 card.summary='Чтобы заметить '+pct(mde,0)+' к конверсии '+ru(baseline*100,2)+'% (α='+ru(alpha,2)+', мощность '+ru(power*100,0)+'%), нужно '+ru(required,0)+' '+plural(required,['игрок','игрока','игроков'])+' на группу, всего '+ru(card.total,0)+(days?' — это ~'+days+' '+plural(days,['день','дня','дней'])+' при '+ru(dailyTraffic,0)+' в день':'')+'.';
 card.report='План A/B-теста\n'+card.summary+'\n'+options.map(o=>pct(o.mde,0)+': '+ru(o.required,0)+' на группу').join('\n');
 return card;
}
module.exports={analyze,plan,validate,summaryText,report,DEFAULT_MDE};
