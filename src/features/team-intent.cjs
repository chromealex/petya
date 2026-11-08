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
 const format={type:'object',properties:{intent:{enum:INTENTS},confidence:{type:'number'},people:{type:'array',items:{type:'string'}}},required:['intent','confidence','people'],additionalProperties:false};
 return {model,stream:false,think:false,format,options:{temperature:0,num_predict:120,num_ctx:4096},messages:[
  {role:'system',content:'Определи, чего хочет пользователь рабочего ассистента. Справочник команды — карточки коллег: имя, роль, обязанности, проекты, почта, Slack, Jira. '+
   'fill — собрать коллег или дополнить справочник любыми сведениями (роли, обязанности, контакты, проекты, кто за что отвечает) из Slack и Jira; '+
   'existing — то же, но только для уже сохранённых коллег, без поиска новых людей (например, «добавь роли команде», «подтяни почты коллег»); '+
   'facts — пользователь сам сообщает сведения о коллегах, чтобы их записать («Полина теперь тестирует», «у Ивана почта ivan@…», «Олег — бэкенд»); '+
   'workload — посмотреть задачи, загрузку или статус работы коллег в Jira; '+
   'other — всё остальное, в том числе вопросы о команде, на которые нужно просто ответить. '+
   'people — имена из savedTeam (точно как там записаны), о ком вопрос: один человек по имени или все, кто подходит под названную группу по роли или обязанностям («бэк», «фронт», «тестировщики», «дизайн»); пустой список, если вопрос не о конкретных людях или о всей команде. Верни JSON.'},
  {role:'user',content:JSON.stringify({request:command,savedTeam:team.slice(0,100).map(m=>({name:m.name,role:m.role||'',responsibilities:String(m.responsibilities||'').slice(0,160)})),recent:(topic?.messages||[]).slice(-2).map(m=>({role:m.role,text:String(m.text||'').slice(0,300)}))})}]};
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
   const names=new Set(team.map(m=>m.name));
   return {intent:v.intent,people:[...new Set((Array.isArray(v.people)?v.people:[]).filter(n=>names.has(n)))].slice(0,12)};
  };
  const turn=async command=>{
   const text=String(command||'').trim();
   // About the team: team words, what someone is responsible for, or the name of a saved colleague.
   const team=require('../team.cjs').members(s.settings);
   const firstNames=m=>[m.name,...String(m.aliases||'').split(',')].map(n=>String(n||'').trim().split(/\s+/)[0]).filter(n=>n&&n.length>=3);
   const said=n=>new RegExp('(?:^|[^\\p{L}])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').slice(0,-1)+'\\p{L}{0,3}(?![\\p{L}])','iu').test(text);
   const mentioned=team.filter(m=>firstNames(m).some(said)),mentionsColleague=mentioned.length>0;
   // A group named by role («бэк», «тестировщики») when the words match a role or duty on a saved card.
   const words=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').split(/[^\p{L}]+/u).filter(w=>w.length>=3);
   const duties=new Set(team.flatMap(m=>words(m.role+' '+(m.responsibilities||''))));
   const common=(a,b)=>{let i=0;while(i<a.length&&a[i]===b[i])i++;return i;};
   const SMALL=new Set(['что','чем','кто','как','над','для','это','все','всех','так','где','сейчас','делают','занят','заняты','занимается','занимаются','работают','работает']);
   const mentionsRole=words(text).filter(w=>!SMALL.has(w)).some(w=>[...duties].some(d=>common(w,d)>=Math.min(5,w.length,d.length)));
   const WORK=/(?:чем|над\s+чем)\s+(?:\p{L}+\s+)?(?:занят|занима|работа)|что\s+(?:сейчас\s+)?делают|кто\s+(?:у\s+нас\s+)?(?:на|в)\s+\p{L}+/iu;
   if(!(ABOUT.test(text)||PERSON_FACT.test(text)||mentionsColleague||mentionsRole&&WORK.test(text))||shellCommand(text)||s.attachments?.list?.().length)return null;
   let intent,people=[];try{s.requestProgress?.report('Понимаю просьбу про команду');const v=await classify(text,s.dialogue.active());intent=v?.intent;people=v?.people||[];}catch(e){console.error('Team intent:',e.message);return null;}
   if(intent==='fill')return s.teamFill.turn(text,false,null,null,{force:true});
   if(intent==='existing')return s.teamFill.turn(text,false,null,null,{force:true,existing:true});
   // Facts the user states: the request itself is the source; every saved value must be quoted from it.
   if(intent==='facts')return s.teamFill.turn(text,false,null,null,{force:true});
   // A question about one named colleague («чем Аня занимается?», «над чем работает Полина»): the card and their
   // open Jira issues, instead of leaving the wording to chance further down the pipeline.
   const question=/\?\s*$|^(?:а\s+)?(?:чем|что|над чем|кто|какие|как)(?=\s)/iu.test(text);
   if((intent==='workload'||intent==='other')&&question&&s.teamLoad?.person){
    if(mentioned.length===1)return s.teamLoad.person(mentioned[0],text);
    // A group by role: the people the model picked from the saved cards, each with their open Jira issues.
    const group=team.filter(m=>people.includes(m.name));
    if(!mentioned.length&&group.length&&s.teamLoad.people)return s.teamLoad.people(group,text);
   }
   return null; // workload of the team and anything else: the usual pipeline (Jira reports, the model's answer)
  };
  return {teamIntent:{turn,classify}};
 }
};
