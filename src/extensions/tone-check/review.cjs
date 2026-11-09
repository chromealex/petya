// «Проверка тона», one review of a draft: the rules find the spans, the local model (within a time budget)
// suggests softer wording for those without a mechanical fix. Used by the outgoing check (check.cjs) before a
// send confirmation and by the chat turns «как это звучит», «смягчи сообщение» (feature.cjs).
const rules=require('./rules.cjs');
const {soften}=require('./soften.cjs');
const {language}=require('../../features/outgoing.cjs');

const SERVICES=['slack','discord','store-reviews','support','mail','github','other'];
const sensitivity=settings=>rules.LEVELS[settings?.toneCheckSensitivity]?settings.toneCheckSensitivity:'medium';
const channels=settings=>{const list=String(settings?.toneCheckChannels??SERVICES.join(',')).split(',').map(x=>x.trim()).filter(x=>SERVICES.includes(x));return list;};
// Whether drafts for this service are checked; services Petya learns later count as «other».
const checks=(service,settings)=>{const list=channels(settings);return list.includes(SERVICES.includes(service)?service:'other');};

async function review(s,{text,audience='team',lang},{rewrite=false,budget=3500}={}){
 const want=lang||language(text)||'ru';
 const findings=rules.findings(text,{sensitivity:sensitivity(s.settings),audience}).map(f=>({...f}));
 let model=!!s.settings?.model,timedOut=false,whole='';
 const needs=findings.some(f=>f.span&&f.suggestion===undefined);
 if(model&&(needs||rewrite)&&(findings.length||rewrite)){
  let timer;
  const limit=new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;resolve(null);},budget);});
  let r=null;
  try{r=await Promise.race([soften(s,{text,findings,audience,lang:want,rewrite}),limit]);}catch{r=null;}finally{clearTimeout(timer);}
  if(r){for(const [index,suggestion] of r.suggestions)findings[index].suggestion=suggestion;whole=r.rewrite;}
 }
 return {text,language:want,audience,sensitivity:sensitivity(s.settings),findings,rewrite:whole,model,timedOut};
}
module.exports={review,channels,checks,sensitivity,SERVICES};
