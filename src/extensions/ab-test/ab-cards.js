// «A/B-тесты», renderer: the verdict chip, variants as rows with their rate and confidence interval on a common
// axis, the lift of each variant over the control with its interval around zero, the SRM check, the power line
// (planned sample, progress, days to wait) and warnings. «Сколько ещё ждать?» asks the chat (the app computes the
// days from the traffic); «Скопировать отчёт» copies the plain-text report computed by the app.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('ab-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=(v,d=1)=>Number(v).toLocaleString(locale(),{maximumFractionDigits:d});
 const pct=(v,d=1)=>num(v*100,d)+'%';
 const signed=(v,d=1)=>(v>0?'+':v<0?'−':'')+num(Math.abs(v)*100,d)+'%';
 const pText=p=>p<0.0001?'p<'+num(0.0001,4):'p='+num(Number(p.toPrecision(2)),6);
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const METHOD={z:'z-тест двух долей',welch:'t-тест Уэлча',bootstrap:'бутстрэп'};
 const copy=async(k,text)=>{try{await navigator.clipboard.writeText(text);k.toast('Отчёт скопирован');}catch{k.toast('Не удалось скопировать',{error:true});}};

 // Position on the common axis, in percent of the track.
 const at=(axis,v)=>Math.max(0,Math.min(100,(v-axis.min)/((axis.max-axis.min)||1)*100));
 function intervalBar(k,axis,{value,low,high},cls=''){
  const track=k.el('div','ab-track '+cls);
  if(low!=null&&high!=null){const range=k.el('span','ab-range');range.style.left=at(axis,low)+'%';range.style.width=Math.max(0.6,at(axis,high)-at(axis,low))+'%';track.append(range);}
  const dot=k.el('span','ab-dot');dot.style.left=at(axis,value)+'%';track.append(dot);
  return track;
 }

 function variants(k,c){
  const box=k.el('div','ab-variants');box.setAttribute('role','table');
  const rateOf=v=>c.metric==='conversion'?pct(v.rate,2):num(v.rate,2);
  const ciOf=v=>c.metric==='conversion'?pct(v.ci.low,2)+' – '+pct(v.ci.high,2):num(v.ci.low,2)+' – '+num(v.ci.high,2);
  const best=c.verdict?.variant;
  c.variants.forEach((v,i)=>{
   const row=k.el('div','ab-row'+(i===0?' control':'')+(v.name===best?' winner':''));row.setAttribute('role','row');row.dataset.variant=v.name;
   const name=k.el('div','ab-name');name.append(raw(k.el('strong',null,v.name)));if(i===0)name.append(k.el('small',null,'контроль'));
   const rate=k.el('div','ab-rate');rate.append(k.el('strong',null,rateOf(v)),k.el('small',null,ciOf(v)));
   const bar=intervalBar(k,c.axis,{value:v.rate,low:v.ci.low,high:v.ci.high});bar.title=(c.metric==='conversion'?'Конверсия ':'Среднее ')+rateOf(v)+', 95% интервал '+ciOf(v);
   const n=k.el('div','ab-n');n.append(k.el('strong',null,num(v.users,0)),k.el('small',null,c.metric==='conversion'?num(v.conversions,0)+' '+plural(v.conversions,['конверсия','конверсии','конверсий']):plural(v.users,['игрок','игрока','игроков'])));
   row.append(name,rate,bar,n);box.append(row);
  });
  const axis=k.el('div','ab-axis');const f=x=>c.metric==='conversion'?pct(x,1):num(x,2);axis.append(k.el('span',null,f(c.axis.min)),k.el('span',null,f((c.axis.min+c.axis.max)/2)),k.el('span',null,f(c.axis.max)));
  box.append(axis);return box;
 }

 // Lift of each variant over the control: point and interval on an axis symmetric around zero.
 function lifts(k,c){
  const box=k.el('div','ab-lifts');
  const span=Math.max(0.02,...c.comparisons.flatMap(x=>x.lift?[Math.abs(x.lift.low),Math.abs(x.lift.high)]:[]));
  const axis={min:-span*1.1,max:span*1.1};
  for(const x of c.comparisons){
   const row=k.el('div','ab-lift'+(x.significant?(x.diff.value>0?' up':' down'):''));row.dataset.variant=x.name;
   const label=k.el('div','ab-lift-label');label.append(raw(k.el('strong',null,x.name)),k.el('span',null,' против '),raw(k.el('span',null,c.variants[0].name)));
   const value=k.el('div','ab-lift-value');
   if(x.lift){value.append(k.el('strong',null,signed(x.lift.value)),k.el('small',null,'['+signed(x.lift.low)+'; '+signed(x.lift.high)+']'));}
   else value.append(k.el('strong',null,num(x.diff.value,3)));
   const track=x.lift?intervalBar(k,axis,x.lift,'lift'):k.el('div','ab-track lift');
   const zero=k.el('span','ab-zero');zero.style.left=at(axis,0)+'%';track.prepend(zero);
   const p=k.el('div','ab-p');p.append(k.el('strong',null,pText(x.pAdjusted)),k.el('small',null,METHOD[x.method]+(c.comparisons.length>1?' · Холм':'')));
   p.title=x.method==='bootstrap'?'Бутстрэп: '+x.rounds+' повторов, seed '+x.seed:x.method==='welch'?'t='+num(x.stat,2)+', df='+num(x.df,1):'z='+num(x.stat,2);
   row.append(label,value,track,p);box.append(row);
  }
  return box;
 }

 function srmLine(k,c){
  const s=c.srm;if(!s)return null;
  const line=k.el('div','ab-line ab-srm'+(s.flagged?' alert':''));
  line.append(k.chip({label:s.flagged?'SRM':'разбиение ок',tone:s.flagged?'alert':'done',title:'Хи-квадрат на число игроков в группах против плана'}),
   k.el('span',null,'Факт '+s.observed.map(x=>pct(x,1)).join(' / ')+' · план '+s.expected.map(x=>pct(x,0)).join(' / ')+' · χ²='+num(s.chi2,2)+', '+pText(s.p)));
  return line;
 }

 function powerLine(k,c){
  const p=c.power;if(!p?.required)return null;
  const box=k.el('div','ab-power');
  const head=k.el('div','ab-power-head');
  const done=Math.min(1,p.current/p.required);
  head.append(k.el('span',null,'Мощность '+num(p.power*100,0)+'% для эффекта '+signed(p.mde,0)+(p.mdeGiven?'':' (по умолчанию)')+': нужно '+num(p.required,0)+' на группу, сейчас '+num(p.current,0)),k.el('strong',null,pct(done,0)));
  const bar=k.el('div','ab-progress');const fill=k.el('span');fill.style.width=(done*100)+'%';if(done>=1)fill.classList.add('full');bar.append(fill);
  bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(Math.round(done*100)));
  const notes=[];
  if(p.detectable!=null)notes.push('сейчас заметен эффект от '+signed(p.detectable,1));
  if(p.waitDays!=null)notes.push(p.waitDays>0?'ещё ~'+p.waitDays+' '+plural(p.waitDays,['день','дня','дней'])+' при '+num(p.dailyTraffic,0)+' в день':'выборки хватает');
  box.append(head,bar);if(notes.length)box.append(k.el('small',null,notes.join(' · ')));
  return box;
 }

 function planBody(k,c){
  const box=k.el('div','ab-plan');
  const head=k.el('div','ab-plan-head');
  head.append(k.el('strong',null,num(c.required,0)),k.el('span',null,' на группу · всего '+num(c.total,0)+(c.days?' · ~'+c.days+' '+plural(c.days,['день','дня','дней'])+' при '+num(c.dailyTraffic,0)+' в день':'')));
  box.append(head,k.el('small','ab-plan-note','Конверсия '+pct(c.baseline,2)+', α='+num(c.alpha,2)+', мощность '+num(c.power*100,0)+'%. Чем меньше эффект, тем больше игроков:'));
  const max=Math.max(...c.options.map(o=>o.required));
  const list=k.el('div','ab-plan-bars');
  for(const o of c.options){
   const row=k.el('div','ab-plan-row'+(o.current?' current':''));
   const bar=k.el('div','ab-plan-bar');const fill=k.el('span');fill.style.width=Math.max(1,Math.sqrt(o.required/max)*100)+'%';bar.append(fill);
   row.append(k.el('span','ab-plan-mde',signed(o.mde,0)),bar,k.el('span','ab-plan-n',num(o.required,0)));row.title=signed(o.mde,0)+': '+num(o.required,0)+' на группу';list.append(row);
  }
  box.append(list,k.el('small','ab-plan-note','Длина полос — по корню из числа игроков.'));
  return box;
 }

 function assignmentBody(k,c){
  const box=k.el('div','ab-variants');
  for(const v of c.variants){
   const row=k.el('div','ab-row');row.dataset.variant=v.name;
   const name=k.el('div','ab-name');name.append(raw(k.el('strong',null,v.name)));
   const rate=k.el('div','ab-rate');rate.append(k.el('strong',null,pct(v.rate,2)),k.el('small',null,'план '+pct(v.expected,0)));
   const track=intervalBar(k,c.axis,{value:v.rate});const plan=k.el('span','ab-expected');plan.style.left=at(c.axis,v.expected)+'%';plan.title='План '+pct(v.expected,0);track.append(plan);
   const n=k.el('div','ab-n');n.append(k.el('strong',null,num(v.users,0)),k.el('small',null,plural(v.users,['игрок','игрока','игроков'])));
   row.append(name,rate,track,n);box.append(row);
  }
  return box;
 }

 window.renderAbTestCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.ab-card'))return;
  const body=k.el('div','ab-body');
  if(c.verdict?.detail||c.verdict?.kind){
   const v=k.el('p','ab-verdict tone-'+(c.verdict.tone||'none'));v.dataset.kind=c.verdict.kind;
   const text=c.mode==='plan'?null:k.el('span','ab-verdict-text',c.summary||'');
   if(text){raw(text);v.append(text);body.append(v);}
  }
  if(c.mode==='plan')body.append(planBody(k,c));
  else if(c.metric==='assignment'){body.append(assignmentBody(k,c));const s=srmLine(k,c);if(s)body.append(s);}
  else{
   body.append(variants(k,c));
   if(c.comparisons?.length)body.append(lifts(k,c));
   const s=srmLine(k,c);if(s)body.append(s);
   const p=powerLine(k,c);if(p)body.append(p);
  }
  if(c.warnings?.length){const ul=k.el('ul','ab-warnings');for(const w of c.warnings)ul.append(k.el('li',null,w));body.append(ul);}
  const key=c.mode==='plan'?'План теста':c.metric==='assignment'?'Проверка разбиения':c.metric==='conversion'?'Конверсия':'Среднее на игрока';
  const subtitle=[c.file?c.file:'',c.mode==='plan'?'':c.variants?.length?c.variants.length+' '+plural(c.variants.length,['группа','группы','групп']):'',c.heavy?'бутстрэп':''].filter(Boolean).join(' · ');
  const actions=[];
  if(c.mode!=='plan'&&c.metric!=='assignment'&&c.power?.required&&c.verdict?.kind!=='srm')actions.push({label:'Сколько ещё ждать?',primary:c.verdict?.kind==='early',run:()=>k.ask('Сколько ещё ждать A/B-тест?',{send:true})});
  if(c.report)actions.push({label:'Скопировать отчёт',run:()=>copy(k,c.report)});
  const card=k.card({app:'A/B',initial:'AB',color:'#4a5a8a',key,status:{label:c.verdict?.label||'',tone:c.verdict?.tone||'',title:c.verdict?.detail||''},subtitle,body,actions,className:'ab-card'});
  card.dataset.verdict=c.verdict?.kind||'';
  const sub=card.querySelector('.kit-subtitle');if(sub&&c.file)raw(sub);
  parent.append(card);
 };
})();
