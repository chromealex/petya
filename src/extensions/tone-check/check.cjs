// «Проверка тона» as an outgoing check (src/features/outgoing.cjs): before a send confirmation in the channels
// chosen in its settings, harsh, passive-aggressive, shouted or unclear phrasing is shown with softer variants
// for the exact fragments (a whole-message rewrite is only in the chat, «смягчи»). The model gets at most 3.5 s inside
// the pipeline's 6 s budget, so the rules' findings always arrive.
const {review,checks}=require('./review.cjs');
module.exports={
 id:'tone-check',name:'Проверка тона',order:100,timeoutMs:6000,
 ready:settings=>settings['extension_tone-check']==='true',
 fits:(channel,settings)=>checks(channel.service,settings),
 async check(s,draft){
  const r=await review(s,{text:draft.text,audience:draft.channel.audience,lang:draft.language},{budget:3500,rewrite:false});
  return r.findings.map(f=>({severity:f.severity,span:f.span,message:f.message,kind:f.kind,...f.suggestion!==undefined?{suggestion:f.suggestion}:{}}));
 }
};
