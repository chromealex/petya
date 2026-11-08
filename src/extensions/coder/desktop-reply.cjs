// Chat entry point of the coding extension: new coding requests, follow-ups and decisions on an open result.
const intent=require('./intent.cjs');
const open=topic=>{const run=topic?.codingRuns?.find(r=>r.id===topic.codingRunId);return !!run&&['review','running','empty'].includes(run.state);};
module.exports={
 type:'coder',name:'Программист',requiresChat:true,
 description:'Петя сам пишет и правит код проекта в отдельной ветке и показывает дифф. Запрос: «Напиши функцию…», «Исправь баг в модуле…», «Добавь тесты для…».',
 acceptsFiles:()=>false,
 matches(command,{topic}={}){
  if(open(topic)&&(intent.decision(command)||intent.refinement(command)))return true;
  return intent.isCoding(command);
 },
 async turn(s,command,context,check){
  check();
  const kind=open(context.topic)?intent.decision(command):'';
  if(kind)return s.coder.decide(kind,command,check);
  if(open(context.topic))return s.coder.refine(command,check);
  return s.coder.start(command,check);
 }
};
