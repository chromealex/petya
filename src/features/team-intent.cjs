// Feature: requests about the team are understood by meaning, not by a list of phrases. When a message is about
// colleagues at all, the local model decides once what the user wants: to fill or complete the team directory
// (any field — roles, responsibilities, contacts, projects), to record facts the user states about colleagues,
// to see workload in Jira, or something else. Regex routing stays as the fallback when no model is available.
const ABOUT=/(?:команд|коллег|сотрудник|участник|людей|люди|человек|роли|роль|ролей|должност|обязанност|кто\s+(?:чем|за\s+что|у\s+нас)|справочник)/iu;
const PERSON_FACT=/(?:отвечает\s+за|занимается|теперь\s+(?:в|на|тестиру|дела|веде)|почт[аы]\s|e-?mail|[\w.-]+@[\w-]+\.\w+|\bslack\s*id|в\s+jira\s+(?:он|она))/iu;
const INTENTS=['fill','existing','facts','workload','other'];
// A shell or console «команда» is not the team.
const shellCommand=text=>/(?:пример\p{L}*|напиши|какая|какую|подскажи|синтаксис\p{L}*)\s+(?:\S+\s+)?команд|команд\p{L}*\s+(?:для|в\s+терминал|git|гит|bash|docker|npm|linux|консол|shell)/iu.test(text);
function request(model,command,topic,team){
 const format={type:'object',properties:{intent:{enum:INTENTS},confidence:{type:'number'}},required:['intent','confidence'],additionalProperties:false};
 return {model,stream:false,think:false,format,options:{temperature:0,num_predict:120,num_ctx:4096},messages:[
  {role:'system',content:'Определи, чего хочет пользователь рабочего ассистента. Справочник команды — карточки коллег: имя, роль, обязанности, проекты, почта, Slack, Jira. '+
   'fill — собрать коллег или дополнить справочник любыми сведениями (роли, обязанности, контакты, проекты, кто за что отвечает) из Slack и Jira; '+
   'existing — то же, но только для уже сохранённых коллег, без поиска новых людей (например, «добавь роли команде», «подтяни почты коллег»); '+
   'facts — пользователь сам сообщает сведения о коллегах, чтобы их записать («Полина теперь тестирует», «у Ивана почта ivan@…», «Олег — бэкенд»); '+
   'workload — посмотреть задачи, загрузку или статус работы коллег в Jira; '+
   'other — всё остальное, в том числе вопросы о команде, на которые нужно просто ответить. Верни JSON.'},
  {role:'user',content:JSON.stringify({request:command,savedTeam:team.length,recent:(topic?.messages||[]).slice(-2).map(m=>({role:m.role,text:String(m.text||'').slice(0,300)}))})}]};
}
module.exports={
 name:'team-intent',
 ABOUT,PERSON_FACT,request,
 setup(s){
  const classify=async(command,topic)=>{
   if(!s.settings.model||s.settings.semanticTools==='false')return null;
   const team=require('../team.cjs').members(s.settings);
   const r=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request(s.settings.model,command,topic,team))});
   let v;try{v=JSON.parse(r?.message?.content||'null');}catch{return null;}
   if(!v||!INTENTS.includes(v.intent)||typeof v.confidence!=='number'||v.confidence<.75)return null;
   return v.intent;
  };
  const turn=async command=>{
   const text=String(command||'').trim();
   // About the team: team words, what someone is responsible for, or the name of a saved colleague.
   const names=require('../team.cjs').members(s.settings).flatMap(m=>[m.name,...String(m.aliases||'').split(',')].map(n=>String(n||'').trim().split(/\s+/)[0]).filter(n=>n&&n.length>=3));
   const mentionsColleague=names.some(n=>new RegExp('(?:^|[^\\p{L}])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').slice(0,-1)+'\\p{L}{0,3}(?![\\p{L}])','iu').test(text));
   if(!(ABOUT.test(text)||PERSON_FACT.test(text)||mentionsColleague)||shellCommand(text)||s.attachments?.list?.().length)return null;
   let intent;try{s.requestProgress?.report('Понимаю просьбу про команду');intent=await classify(text,s.dialogue.active());}catch(e){console.error('Team intent:',e.message);return null;}
   if(intent==='fill')return s.teamFill.turn(text,false,null,null,{force:true});
   if(intent==='existing')return s.teamFill.turn(text,false,null,null,{force:true,existing:true});
   // Facts the user states: the request itself is the source; every saved value must be quoted from it.
   if(intent==='facts')return s.teamFill.turn(text,false,null,null,{force:true});
   return null; // workload and anything else: the usual pipeline (Jira reports, the model's answer)
  };
  return {teamIntent:{turn,classify}};
 }
};
