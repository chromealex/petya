// «Аномалии», the detector: every series (feeds.cjs) is scored for each asked day against its robust baseline
// (stats.cjs); missing days and short histories become notes, never anomalies; the same move seen in a total and in
// a segment (a platform, a country, an ad network), or by two sources, is shown once; muted kinds are left out; the
// rest is ranked by impact. Everything here is code; no model is involved.
const {shift,baseline,score,SENSITIVITY}=require('./stats.cjs');

// Per metric: how it is named, its unit nouns, the volume below which nothing is called, the weight in the ranking,
// which direction is bad (for the colour), and the follow-up question for «Почему?» to the app that owns the data.
const METRICS={
 'metrics:dau':{label:'DAU',noun:['активный игрок','активных игрока','активных игроков'],volume:100,weight:2,bad:'down',floor:5},
 'metrics:new':{label:'установки',noun:['установка','установки','установок'],volume:100,weight:2,bad:'down',floor:5},
 'metrics:revenue':{label:'выручка',money:true,volume:20,weight:3,bad:'down',floor:1},
 'crashes:events':{label:'крэши',noun:['крэш','крэша','крэшей'],volume:20,weight:2,bad:'up',floor:2},
 'support:tickets':{label:'обращения в поддержку',noun:['обращение','обращения','обращений'],volume:10,weight:1,bad:'up',floor:1},
 'ads:revenue':{label:'выручка с рекламы',money:true,volume:20,weight:3,bad:'down',floor:1},
 'reviews:rating':{label:'средняя оценка',stars:true,volume:5,absolute:0.4,weight:2,bad:'down',floor:0.1},
 'reviews:negative':{label:'плохие отзывы',noun:['плохой отзыв','плохих отзыва','плохих отзывов'],volume:5,weight:1.5,bad:'up',floor:1}
};
const COUNTRY={BR:'Бразилии',US:'США',RU:'России',DE:'Германии',GB:'Великобритании',FR:'Франции',JP:'Японии',KR:'Кореи',TR:'Турции',IN:'Индии',MX:'Мексики',ES:'Испании',IT:'Италии',CA:'Канады',
 KZ:'Казахстана',ID:'Индонезии',PH:'Филиппин',VN:'Вьетнама',TH:'Таиланда',PL:'Польши',UA:'Украины',CN:'Китая',AU:'Австралии',AR:'Аргентины',SA:'Саудовской Аравии',EG:'Египта',NL:'Нидерландов'};
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
const num=(v,d=0)=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:d});
const meta=x=>METRICS[x.kind+':'+x.metric]||{label:x.metric,volume:10,weight:1,bad:'down',floor:1};
function segmentPhrase(seg){
 if(!seg)return '';
 if(seg.key==='platform')return ' на '+seg.label;
 if(seg.key==='country')return ' из '+(COUNTRY[seg.value]||seg.value);
 if(seg.key==='network')return ' в сети '+seg.label;
 if(seg.key==='store')return ' в '+seg.label;
 return ' · '+seg.label;
}
function money(unit,v){
 const cur=String(unit||'').split(':')[1]||'';const sign=v<0?'−':'+',a=num(Math.abs(Math.round(v)));
 return cur==='USD'?sign+'$'+a:cur==='RUB'?sign+a+' ₽':cur==='EUR'?sign+'€'+a:sign+a+(cur?' '+cur:'');
}
// «−1 240 установок», «+$310», «−1,3★».
function deltaText(x){
 const m=meta(x),d=x.value-x.median;
 if(m.stars)return (d<0?'−':'+')+num(Math.abs(d),1)+'★';
 if(m.money)return money(x.unit,d);
 const n=Math.round(Math.abs(d));return (d<0?'−':'+')+num(n)+' '+plural(n,m.noun||['','','']);
}
const pct=x=>x.median?(x.change<0?'−':'+')+num(Math.abs(Math.round(x.change*100)))+'%':'+'+num(Math.round(x.value));
function dayLabel(day,yesterday){
 if(day===yesterday)return 'Вчера';
 if(day===shift(yesterday,-1))return 'Позавчера';
 return new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
}
// «Вчера установки из Бразилии −40%», «Вчера средняя оценка в App Store 3,1★ (обычно 4,4★)».
function headline(x,yesterday){
 const m=meta(x),what=m.label+segmentPhrase(x.segment);
 const tail=m.stars?' '+num(x.value,1)+'★ (обычно '+num(x.median,1)+'★)':' '+pct(x);
 return dayLabel(x.day,yesterday)+' '+what+tail;
}
// The follow-up for «Почему?»: a request the app that owns the data answers with its own card.
function why(x,yesterday){
 const when=x.day===yesterday?'вчера':'за неделю',seg=x.segment;
 const platform=seg?.key==='platform'?' на '+seg.label:'';
 switch(x.kind){
  case 'metrics':return x.metric==='dau'?'DAU за 2 недели'+platform:x.metric==='new'?'сколько новых игроков за 2 недели'+platform:'выручка игры за 2 недели'+platform;
  case 'crashes':return 'топ крэшей '+when+' в '+x.sourceName;
  case 'support':return 'что жалуются в поддержку '+when;
  case 'ads':return 'выручка с рекламы '+when+(seg?.key==='network'?' по сетям':seg?.key==='platform'?' на '+seg.label:'');
  case 'reviews':return 'плохие отзывы за неделю в '+x.sourceName;
  default:return '';
 }
}
const segKey=seg=>seg?seg.key+'='+seg.value:'all';
// What «Не показывать такое» mutes: this metric of this kind, in this segment, in this direction (any source).
const muteKey=x=>[x.kind,x.metric,segKey(x.segment),x.direction].join('|');
function muted(x,rules){return rules.some(r=>{const [k,m,s,d]=String(r.key||'').split('|');return k===x.kind&&m===x.metric&&(s==='*'||s===segKey(x.segment))&&(d==='*'||d===x.direction);});}
function muteLabel(x){return meta(x).label+segmentPhrase(x.segment)+(x.direction==='up'?': рост':': падение');}

// The last 35 days for the sparkline: values (null where missing), which of them form the baseline, the band.
function spark(points,day,base,band){
 const dates=[];for(let i=34;i>=0;i--)dates.push(shift(day,-i));
 const used=new Set(base.points.map(p=>p.date));
 return {dates,values:dates.map(d=>points.has(d)?points.get(d):null),baseline:dates.map(d=>used.has(d)),band,index:dates.length-1};
}

// Scores every series for every day in `days`. Returns {items, notes, sources, hidden}.
function detect(series,{days,yesterday,sensitivity='normal',mutes=[]}){
 const preset=SENSITIVITY[sensitivity]||SENSITIVITY.normal;
 const found=[],notes=[],missing=new Map(),short=new Map();
 // A source whose every series lacks the day (or reads 0 where its baseline is busy) has not delivered that day yet.
 const bySource=new Map();for(const x of series){const k=x.kind+':'+x.source;bySource.set(k,[...(bySource.get(k)||[]),x]);}
 for(const day of days){
  for(const [src,list] of bySource){
   const silent=list.every(x=>{const p=x.points.find(p=>p.date===day);if(!p)return true;if(p.value!==0)return false;const b=baseline(new Map(x.points.map(q=>[q.date,q.value])),day);return !!b&&(b.values.reduce((a,v)=>a+v,0)/b.values.length)>=meta(x).volume;});
   if(silent){const x=list[0];missing.set(src+'|'+day,{kind:x.kind,source:x.source,sourceName:x.sourceName,day});continue;}
   for(const x of list){
    const points=new Map(x.points.map(p=>[p.date,p.value])),vol=new Map(x.points.map(p=>[p.date,p.volume]));
    if(!points.has(day))continue;
    const base=baseline(points,day);
    if(!base){if(!x.segment)short.set(x.kind+':'+x.source+':'+x.metric,{kind:x.kind,source:x.source,sourceName:x.sourceName,metric:x.metric});continue;}
    const m=meta(x),value=points.get(day);
    const r=score(value,base,preset,{volume:m.stars?0:m.volume,absolute:m.absolute,floor:m.floor});
    // Averages count only with enough ratings behind them on that day.
    if(m.stars&&!((vol.get(day)||0)>=m.volume))continue;
    if(!r.anomaly)continue;
    const item={key:x.key,kind:x.kind,source:x.source,sourceName:x.sourceName,metric:x.metric,unit:x.unit,segment:x.segment,app:x.app||null,day,
     value,median:r.median,change:r.change,z:Math.round(r.z*10)/10,direction:r.direction,band:r.band,baselineKind:base.kind,
     bad:r.direction===m.bad,volume:m.stars?vol.get(day):Math.max(Math.abs(value),Math.abs(r.median))};
    item.impact=Math.round(m.weight*(m.stars?Math.abs(value-r.median):Math.min(5,Math.abs(r.change??1)))*Math.log10(10+item.volume)*100)/100;
    item.spark=spark(points,day,base,r.band);
    found.push(item);
   }
  }
 }
 // One move, one row: across sources (same kind, metric, segment, day, direction) the strongest stays.
 const merged=new Map();
 for(const x of found){const k=[x.kind,x.metric,segKey(x.segment),x.day,x.direction].join('|');const old=merged.get(k);
  if(!old){merged.set(k,{...x,also:[]});continue;}
  const [keep,drop]=x.impact>old.impact?[{...x,also:old.also}, old]:[old,x];keep.also=[...new Set([...keep.also,drop.sourceName])].filter(n=>n!==keep.sourceName);merged.set(k,keep);}
 // A total and its segments: the segment that explains most of the move is the headline, the total its context.
 const groups=new Map();
 for(const x of merged.values()){const k=[x.kind,x.source,x.metric,x.day,x.direction].join('|');groups.set(k,[...(groups.get(k)||[]),x]);}
 const items=[];
 for(const list of groups.values()){
  const total=list.find(x=>!x.segment),parts=list.filter(x=>x.segment).sort((a,b)=>Math.abs(b.value-b.median)-Math.abs(a.value-a.median));
  if(total&&parts.length){
   const best=parts[0];
   if(Math.abs(best.value-best.median)>=0.5*Math.abs(total.value-total.median))items.push({...best,impact:Math.max(best.impact,total.impact),context:{change:total.change,value:total.value,median:total.median},related:parts.slice(1).map(p=>p.segment.label)});
   else items.push({...total,related:parts.map(p=>p.segment.label)});
  }else if(parts.length>3)items.push({...parts[0],related:parts.slice(1).map(p=>p.segment.label)});
  else items.push(...(total?[total]:parts));
 }
 let hidden=0;
 const shown=[];
 for(const x of items){x.mute=muteKey(x);if(muted(x,mutes)){hidden++;continue;}x.headline=headline(x,yesterday);x.delta=deltaText(x);x.ask=why(x,yesterday);x.muteLabel=muteLabel(x);x.id=x.key+'@'+x.day;shown.push(x);}
 shown.sort((a,b)=>b.impact-a.impact||a.headline.localeCompare(b.headline));
 for(const m of missing.values())notes.push({...m,missing:true,text:m.sourceName+': нет данных за '+dayLabel(m.day,yesterday).toLowerCase()+' — источник ещё не прислал их, это не аномалия.'});
 for(const sh of short.values())notes.push({...sh,short:true,text:sh.sourceName+' · '+meta(sh).label+': мало истории для сравнения (нужно хотя бы 3 таких же дня недели или 7 дней подряд).'});
 // «Пульс»: every top-level metric read for the last day — its value, the usual value and its band — so the card
 // shows the quiet metrics too (what was checked, not only what moved). Sorted by what matters most.
 const watched=[];
 for(const x of series){
  if(x.segment)continue;const points=new Map(x.points.map(p=>[p.date,p.value]));if(!points.has(yesterday))continue;
  const base=baseline(points,yesterday);if(!base)continue;
  const m=meta(x),value=points.get(yesterday),r=score(value,base,preset,{volume:m.stars?0:m.volume,absolute:m.absolute,floor:m.floor});
  watched.push({key:x.key,kind:x.kind,source:x.source,sourceName:x.sourceName,metric:x.metric,label:m.label,unit:x.unit,value,median:r.median,change:r.change,band:r.band,weight:m.weight,
   bad:r.anomaly?r.direction===m.bad:null,spark:spark(points,yesterday,base,r.band)});
 }
 watched.sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label));
 return {items:shown,notes,hidden,watched};
}
module.exports={METRICS,detect,headline,deltaText,why,muteKey,muteLabel,muted,segmentPhrase,dayLabel,meta};
