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
  // Installed skill packages and skills from the open project's folders (skills/, .claude/skills, …) join the library.
  const projectSkills=()=>{try{const d=s.dialogue,project=d?.state?.projects?.find(p=>p.id===(d.active?.()?.projectId||d.state.activeProjectId));const own=(()=>{try{return s.installedSkills?.()||[];}catch{return [];}})();return [...own,...(project?require('../skill-library/project-skills.cjs').forProject(project,new Set(library.BUILTIN.map(x=>x.name))):[])];}catch{return [];}};
  let cached=null;
  const skills=()=>{const own=s.instructionSkills?.list?.()||[],extra=projectSkills(),key=[own,extra];if(cached&&cached.own===own&&cached.extra.length===extra.length&&cached.extra.every((x,i)=>x===extra[i]))return cached.list;cached={own,extra,list:[...extra,...library.library(own)]};return cached.list;};
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
   // A short follow-up to an answer made with a skill («Давай», «Что-то не в рифму», «Короче») keeps that skill.
   if(!skill&&s.settings.autoSkills!=='false'&&String(command).trim().length<=80){const last=[...(s.dialogue?.active?.()?.messages||[])].reverse().find(m=>m.role==='assistant');const name=/^скилл (\S+)$/u.exec(last?.by||'')?.[1];if(name)skill=skills().find(x=>x.name===name)||null;}
   if(skill){
    s.requestProgress?.report('Беру навык '+skill.name);
    // The skill's text for this request: whole when it fits, otherwise the sections it needs, compacted.
    let context;try{context=await require('../skill-library/context.cjs').prepare(skill,command,{request:s.request,settings:s.settings,progress:t=>s.requestProgress?.report(t)});}catch(e){if(e?.name==='AbortError')throw e;}
    chosen={command:String(command).trim(),skill:{name:skill.name,description:skill.description,body:skill.body,...context!==undefined?{context}:{}},at:Date.now()};
   }
   return skill;
  };
  // Whether the answer was actually built with the skill (a Jira report or a shortcut answer is not).
  const done=()=>{const used=!!chosen?.used;chosen=null;return used;};
  return {skillChoice:{choose,prepare,done,skills}};
 }
};
