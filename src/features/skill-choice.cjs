// Feature: Petya picks a fitting skill for a request on its own — a bug report, release notes, a retro,
// a reply to a store review — from the built-in library (src/skill-library) and the user's enabled skills.
// A lexical shortlist keeps the model's choice small and cheap; the model then picks one skill or none.
// The chosen skill only shapes the answer (src/dialogue-request.cjs adds its instructions); it never
// grants tools or access. «/name» or «скилл name» still runs a skill explicitly.
const library=require('../skill-library/index.cjs');
const MIN_SCORE=2,MIN_CONFIDENCE=.7,TTL=5*60000;
function request(model,command,candidates,topic){
 const names=candidates.map(s=>s.name);
 const format={type:'object',properties:{skill:{enum:[...names,'']},confidence:{type:'number'}},required:['skill','confidence'],additionalProperties:false};
 return {model,stream:false,think:false,format,options:{temperature:0,num_predict:80,num_ctx:4096},messages:[
  {role:'system',content:'Ты выбираешь скилл — инструкцию, как оформить ответ рабочего ассистента. Выбери один скилл, только если пользователь просит сделать именно то, что он описывает: '+
   'составить, оформить, разобрать, спланировать, проверить или написать такой результат. Если запрос — болтовня, вопрос о факте, просьба показать данные из сервисов (задачи, баги, письма, Slack), '+
   'посчитать, запомнить или выполнить действие, верни skill="". Совпадение отдельных слов не повод выбирать скилл. Верни JSON.'},
  {role:'user',content:JSON.stringify({request:command,recent:(topic?.messages||[]).slice(-2).map(m=>({role:m.role,text:String(m.text||'').slice(0,300)})),skills:candidates.map(s=>({name:s.name,description:s.description}))})}]};
}
module.exports={
 name:'skill-choice',
 defaults:{autoSkills:'true'},
 request,MIN_SCORE,
 setup(s){
  let chosen=null; // {command, skill, at}: read by the dialogue request built for this command
  const dialogueRequest=require('../dialogue-request.cjs');
  dialogueRequest.skill=command=>{if(!chosen||Date.now()-chosen.at>TTL||String(command).trim()!==chosen.command)return null;chosen.used=true;return chosen.skill;};
  const skills=()=>library.library(s.instructionSkills?.list?.()||[]);
  const choose=async command=>{
   const text=String(command||'').trim();
   if(!text||s.settings.autoSkills==='false'||!s.settings.model||s.settings.semanticTools==='false')return null;
   const short=library.shortlist(text,skills()).filter(r=>r.score>=MIN_SCORE);
   if(!short.length)return null;
   const candidates=short.map(r=>r.skill);
   const r=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request(s.settings.model,text,candidates,s.dialogue?.active?.()))});
   let v;try{v=JSON.parse(r?.message?.content||'null');}catch{return null;}
   if(!v||typeof v.confidence!=='number'||v.confidence<MIN_CONFIDENCE)return null;
   return candidates.find(c=>c.name===v.skill)||null;
  };
  // Called right before the final answer: the chosen skill applies to this one command only.
  const prepare=async command=>{
   chosen=null;let skill=null;
   try{skill=await choose(command);}catch(e){console.error('Skill choice:',e.message);}
   if(skill){chosen={command:String(command).trim(),skill,at:Date.now()};s.requestProgress?.report('Беру скилл '+skill.name);}
   return skill;
  };
  // Whether the answer was actually built with the skill (a Jira report or a shortcut answer is not).
  const done=()=>{const used=!!chosen?.used;chosen=null;return used;};
  return {skillChoice:{choose,prepare,done,skills}};
 }
};
