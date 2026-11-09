// «Объясни график»: why a chart moved. The series comes from a card Petya drew in this chat (its own data: metrics,
// ad revenue, purchases, an SQL result over dates — series.cjs) or from a screenshot the user attached (read by the
// user's local vision model, only after the user downloaded it — vision.cjs, desktop-reply.cjs). Code finds the day it
// moved (detect.cjs) and correlates it with dated events of the connected apps: releases, incidents, crash spikes, UA
// campaigns, holidays (evidence.cjs). Every claimed cause cites its evidence with a date; when nothing fits, the answer
// is «Нет явной причины» with what was checked. No model writes the explanation.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const S=require('./series.cjs');
const detect=require('./detect.cjs');
const evidence=require('./evidence.cjs');
const vision=require('./vision.cjs');
const ID='chart-explain',BY='Объясни график';
const deps={now:()=>Date.now(),readers:null};

const num=(v,unit)=>{
 const cur=/^currency:([A-Z]{3})$/.exec(unit||'')?.[1];
 if(cur)try{return Number(v).toLocaleString('ru-RU',{style:'currency',currency:cur,maximumFractionDigits:Math.abs(v)>=100?0:2});}catch{/* plain */}
 return Number(v).toLocaleString('ru-RU',{maximumFractionDigits:Math.abs(v)>=100?0:2});
};
const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const pct=v=>(v>0?'+':'−')+(Math.round(Math.abs(v)*1000)/10).toLocaleString('ru-RU')+'%';
const KIND={release:'релиз',incident:'инцидент',crash:'крэши',campaign:'кампания',holiday:'праздник'};

function countries(chart){return [...new Set(['RU','US',...(chart.countries||[])])].slice(0,6);}
function text(card){
 const s=card.series,e=card.event;
 if(e.reason==='short')return 'На графике «'+s.label+'» слишком мало дней, чтобы найти изменение.';
 if(!e.notable)return 'На графике «'+s.label+'» нет заметного '+(e.direction==='up'?'роста':'падения')+(e.largest?': самое большое отклонение '+pct(e.largest.dev)+' ('+day(e.largest.date)+').':'.');
 let t=s.label+' '+(e.direction==='down'?'упал':'вырос')+' '+day(e.date)+': '+num(e.value,s.unit)+' против обычных ≈'+num(e.base,s.unit)+' ('+pct(e.dev)+')'+(e.onset!==e.date?(e.direction==='down'?', снижение началось ':', рост начался ')+day(e.onset):'')+'.';
 if(card.causes.length)t+=' Возможные причины: '+card.causes.map((c,i)=>(i+1)+') '+day(c.date)+' — '+c.title+' ('+c.source+')').join('; ')+'.';
 else t+=' Нет явной причины: рядом с этой датой нет релизов, инцидентов, всплесков крэшей, изменений кампаний или праздников в подключённых данных.';
 const off=card.checked.filter(x=>x.state==='none').map(x=>x.label);
 if(off.length)t+=' Не подключено: '+off.join(', ')+'.';
 if(card.source==='screenshot')t+=' Значения прочитаны с картинки локальной моделью — они приблизительные.';
 return t;
}

async function explain(s,{chart,series,direction,question,source,model=null,attachment=null}){
 const event=detect.find(series.points,direction);
 let causes=[],checked=[],window=null;
 if(event.notable){
  s.requestProgress?.report('Ищу, что произошло около '+day(event.onset));
  const r=await evidence.gather(s,{onset:event.onset,date:event.date,countries:countries(chart),now:deps.now()},deps.readers||evidence.READERS);
  causes=evidence.rank(r.items,{onset:event.onset,date:event.date,direction:event.direction});checked=r.checked;window=r.window;
 }
 const card={id:require('node:crypto').randomUUID(),state:'done',source,model,attachment,title:chart.title||'',question:String(question||'').slice(0,300),
  series:{label:series.label||chart.title||'График',unit:series.unit||'',points:series.points.slice(-60)},event,causes,checked,window:window?{from:window.from,to:window.to}:null,
  verdict:!event.notable?'flat':causes.length?'causes':'none',at:deps.now()};
 return card;
}

async function turn(s,command){
 const t=String(command||'');
 const k=query.about(t);
 if(!k||!kit.installed(s,ID))return null;
 // A screenshot in the composer goes through desktop-reply.cjs (the attachments flow); here only chat cards.
 if(s.attachments?.list?.().some(f=>f.image))return null;
 const chart=S.fromTopic(s.dialogue.active());
 if(!chart){
  if(k==='metric')return null;
  return kit.reply(s,t,{by:BY,question:true,text:'Какой график объяснить? Прикрепите скриншот графика и спросите снова — или сначала покажите его в чате («DAU за неделю», «выручка с рекламы за неделю»).'});
 }
 const series=S.pick(chart,query.metric(t));
 if(!series)return kit.reply(s,t,{by:BY,question:true,text:'В последней карточке нет ряда по дням, который можно объяснить.'});
 try{
  const card=await explain(s,{chart,series,direction:query.direction(t),question:t,source:'card'});
  card.cardKind=chart.kind;
  return kit.reply(s,t,{by:BY,text:text(card),data:{chartExplain:card}});
 }catch(e){return kit.failure(s,command,BY,e);}
}

// The screenshot path (desktop-reply.cjs): the image of an attachment adopted into the chat.
async function screenshotTurn(s,command,{image,attachment}){
 const v=await vision.state(s);
 if(!v.model){
  const card={id:require('node:crypto').randomUUID(),state:'needs-model',source:'screenshot',attachment,question:String(command).slice(0,300),vision:v,at:deps.now()};
  return kit.reply(s,command,{by:BY,text:'Чтобы прочитать график со скриншота, нужна локальная модель для картинок ('+v.name+'). Скачайте её из карточки — скриншот никуда не отправляется.',data:{chartExplain:card}});
 }
 s.requestProgress?.report('Читаю график со скриншота ('+v.model+')');
 const read=await vision.read(s,{model:v.model,image,now:deps.now()});
 if(!read||read.undated||read.points.length<4){
  const card={id:require('node:crypto').randomUUID(),state:'unreadable',source:'screenshot',attachment,model:v.model,question:String(command).slice(0,300),undated:!!read?.undated,at:deps.now()};
  return kit.reply(s,command,{by:BY,error:!read,text:read?.undated?'Модель прочитала график, но не даты на оси X — без дат причины не сопоставить. Прикрепите скриншот, где видны подписи дней.':'Модель не смогла прочитать точки графика. Попробуйте скриншот крупнее, с подписями осей.',data:{chartExplain:card}});
 }
 const chart={kind:'screenshot',title:read.title,series:[{id:'shot',metric:null,label:read.metric||read.title||'График со скриншота',unit:read.unit&&/^[A-Z]{3}$/.test(read.unit)?'currency:'+read.unit:'',points:read.points}]};
 const card=await explain(s,{chart,series:chart.series[0],direction:query.direction(command),question:command,source:'screenshot',model:v.model,attachment});
 return kit.reply(s,command,{by:BY,text:text(card),data:{chartExplain:card}});
}

function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.chartExplain?.id===id)return {topic,message:m,card:m.extensionData.chartExplain};
 return null;
}
function setup(s){
 return {ipc:{
  // «Скачать модель для графиков»: the optional-models download with its own notification; nothing else.
  downloadModel(){if(!s.optionalModels?.download)throw Error('Загрузка моделей недоступна.');return s.optionalModels.download(require('../screenshot-task/vision.cjs').PREFERRED);},
  vision:()=>vision.state(s),
  // «Прочитать график» after the download: the image is the attachment kept in that chat.
  async read(id){
   const hit=findCard(s,String(id||''));if(!hit)throw Error('Карточка не найдена.');
   const file=(hit.topic.attachments||[]).find(a=>a.id===hit.card.attachment);
   if(!file?.image)throw Error('Скриншот больше не доступен. Прикрепите его снова.');
   const v=await vision.state(s);if(!v.model)throw Error('Модель для картинок ещё не скачана.');
   const read=await vision.read(s,{model:v.model,image:file.image,now:deps.now()});
   if(!read||read.undated||read.points.length<4)throw Error(read?.undated?'Модель не прочитала даты на оси X.':'Модель не смогла прочитать точки графика.');
   const chart={kind:'screenshot',title:read.title,series:[{id:'shot',label:read.metric||read.title||'График со скриншота',unit:read.unit&&/^[A-Z]{3}$/.test(read.unit)?'currency:'+read.unit:'',points:read.points}]};
   const card={...await explain(s,{chart,series:chart.series[0],direction:query.direction(hit.card.question),question:hit.card.question,source:'screenshot',model:v.model,attachment:hit.card.attachment}),id:hit.card.id};
   hit.message.extensionData={...hit.message.extensionData,chartExplain:card};hit.message.text=text(card);s.dialogue.persist();
   return card;
  }
 }};
}
module.exports={name:'chartExplain',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,screenshotTurn,explain,text,deps,teardown(){}};
