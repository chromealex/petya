// «Пример: аналитика игры» — a dashboard with made-up numbers, to see what analytics looks like on a dashboard
// before an analytics app is connected. Every widget is a snapshot and the dashboard is marked «Демо-данные».
const DAY=86400000;
// Stable pseudo-random noise, so the example looks the same every time.
const noise=seed=>()=>{seed=(seed*16807)%2147483647;return seed/2147483647-0.5;};
function example(now=Date.now()){
  const r=noise(42),days=30;
  const date=i=>new Date(now-(days-1-i)*DAY).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','');
  const labels=Array.from({length:days},(_,i)=>date(i));
  const weekly=i=>[1.12,0.95,0.92,0.94,0.97,1.04,1.18][new Date(now-(days-1-i)*DAY).getDay()];
  const dau=labels.map((_,i)=>Math.round((39000+i*320)*weekly(i)*(1+r()*0.05)));
  const installs=labels.map((_,i)=>Math.round((5200+i*40+(i>=21&&i<=24?2600:0))*weekly(i)*(1+r()*0.08)));
  const revenue=labels.map((_,i)=>Math.round(dau[i]*(0.24+i*0.0012)*(1+r()*0.1)));
  const sum=a=>a.reduce((s,v)=>s+v,0),last=(a,n)=>a.slice(-n),pct=(a,b)=>Math.round(1000*(a-b)/b)/10;
  const dauNow=Math.round(sum(last(dau,7))/7),dauBefore=Math.round(sum(dau.slice(-14,-7))/7);
  const revNow=sum(last(revenue,7)),revBefore=sum(revenue.slice(-14,-7));
  const arpdau=Math.round(100*revNow/sum(last(dau,7)))/100,arpBefore=Math.round(100*revBefore/sum(dau.slice(-14,-7)))/100;
  const widgets=[
    {title:'Ключевые метрики · 7 дней',size:'w',data:{charts:[{type:'kpi',items:[
      {label:'DAU',value:dauNow,delta:pct(dauNow,dauBefore),trend:dau.slice(-14),hint:'Среднее за 7 дней против предыдущих 7'},
      {label:'Выручка',value:revNow,unit:'$',delta:pct(revNow,revBefore),trend:revenue.slice(-14)},
      {label:'ARPDAU',value:arpdau,unit:'$',delta:pct(arpdau,arpBefore),trend:revenue.slice(-14).map((v,i)=>v/dau.slice(-14)[i])},
      {label:'Удержание D1',value:41.3,unit:'%',delta:-1.2,deltaUnit:'pp',trend:[43.1,42.8,42.5,42.9,42.1,41.8,41.6,41.3]},
      {label:'Crash-free',value:99.4,unit:'%',delta:0.3,deltaUnit:'pp',trend:[98.9,99.0,99.1,99.0,99.2,99.3,99.4]}]}]}},
    {title:'Игроки и установки',size:'l',data:{charts:[{type:'line',labels,series:[{label:'DAU',values:dau},{label:'Установки',values:installs}]}]}},
    {title:'Платформы · DAU',size:'s',data:{charts:[{type:'donut',rows:[{label:'Android',value:Math.round(dauNow*0.64)},{label:'iOS',value:dauNow-Math.round(dauNow*0.64)}]}]}},
    {title:'Выручка по дням',size:'m',data:{charts:[{type:'line',unit:'$',labels,series:[{label:'Выручка',values:revenue}]}]}},
    {title:'Удержание по когортам',size:'m',data:{charts:[{type:'line',unit:'%',labels:['D0','D1','D3','D7','D14','D30'],series:[{label:'Октябрь',values:[100,43.1,28.4,19.2,13.5,9.1]},{label:'Ноябрь',values:[100,41.3,27.9,19.8,null,null]}]}]}},
    {title:'Выручка по странам · 30 дней',size:'m',data:{charts:[{type:'bars',unit:'$',rows:[{label:'США',value:Math.round(sum(revenue)*0.34)},{label:'Германия',value:Math.round(sum(revenue)*0.14)},{label:'Япония',value:Math.round(sum(revenue)*0.11)},{label:'Великобритания',value:Math.round(sum(revenue)*0.09)},{label:'Бразилия',value:Math.round(sum(revenue)*0.07)},{label:'Другие',value:Math.round(sum(revenue)*0.25)}]}]}},
    {title:'Воронка обучения',size:'m',data:{charts:[{type:'bars',unit:'%',rows:[{label:'Запуск',value:100},{label:'Первый бой',value:86},{label:'Постройка бункера',value:71},{label:'Первая покупка',value:12}]}]}}
  ].map(w=>({...w,source:{kind:'snapshot'},at:now}));
  return {title:'Пример · аналитика игры',demo:true,widgets};
}
module.exports={example};
