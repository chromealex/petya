// The Slack/Jira build flows of «Сборки», per company (they used to live in Petya's core):
//  - build-watch.cjs: «следи за билдом 123» from a reviewed Slack thread — polls the thread for the CI bot's result;
//  - build-question.cjs: «спроси, что с билдом» — asks the person responsible in Slack, then reports the answer;
//  - build-repair.cjs (+ build-repair-sources.cjs): «почини билд» — reads the failing build's log from a Jira issue,
//    a Slack thread or an attached file and hands the repair to an agent (Claude / Codex), optionally reporting back.
// Their state stays where it always was: the company's encrypted review memory (services.reviewState, shared with the
// Slack review flow), so nothing is migrated. They tick in the background while the company is open, reset when
// the Slack connection, the project or the company changes (src/features/lifecycle.cjs), and keep only what is
// younger than the context retention («Хранить контекст»).
const DAY=86400000;
const RESET_KEYS=['module_slack','slackCredential','slackToken','slackChannels','contextDays','slackAutoSync'];
const slackReady=settings=>require('../../modules.cjs').enabled(settings,'slack')&&!!(settings.slackToken||settings.slackCredential);
function create(s,{added}){
 const company=s.companyId,open=()=>s.companyId===company&&!s.companySwitching?.();
 // Without the review memory (unit tests of the app's other parts) the flows keep their rows in memory only.
 const state=s.reviewState||{lessons:[],watches:[]},save=()=>s.saveReview?.();
 // Build watches older than a week are forgotten when the company opens (they end within a day anyway).
 state.watches=(state.watches||[]).filter(w=>w.at>=Date.now()-7*DAY);
 const settings=()=>s.settings,notify=text=>s.notify?.(text);
 const watch=new (require('./build-watch.cjs').BuildWatch)({state,save,request:s.request,settings,enabled:()=>open()&&added()&&slackReady(s.settings),notify});
 const question=new (require('./build-question.cjs').BuildQuestion)({state,save,request:s.request,settings,enabled:()=>open()&&added()&&slackReady(s.settings),dialogue:s.dialogue,store:s.memory,notify});
 const sources=require('./build-repair-sources.cjs');
 const repairSources=new sources.RepairSources({workspace:s.workspace,slack:()=>question,settings,
  jiraDownload:file=>{s.modules.assertEnabled(s.settings,'jira');return sources.jiraLog(file,{settings,workspace:s.workspace,rewrite:(...args)=>s.atlassianOAuth.rewrite(...args)});},
  slackToken:async()=>s.settings.slackCredential?(await s.serviceOAuth.slack.token(s.settings.slackCredential)).accessToken:s.settings.slackToken});
 const repair=new (require('./build-repair.cjs').BuildRepair)({state,save,sources:repairSources,agents:s.agents,dialogue:s.dialogue,store:s.memory,settings,enabled:()=>open()&&added()&&s.modules.enabled(s.settings,'ai'),notify});
 const reset=()=>{repair.reset();question.reset();watch.reset();};
 // Rows older than the context retention go, as the rest of the company's context does.
 function prune(){
  const cutoff=Date.now()-Number(s.settings.contextDays)*DAY;let changed=false;
  if(state.repairs){const keep=state.repairs.filter(r=>r.at>=cutoff);if(keep.length!==state.repairs.length){repair.reset();state.repairs=keep;changed=true;}}
  if(state.buildQuestions){const keep=state.buildQuestions.filter(r=>r.at>=cutoff);if(keep.length!==state.buildQuestions.length){question.reset();state.buildQuestions=keep;changed=true;}}
  if(state.watches){const keep=state.watches.filter(w=>w.at>=cutoff);if(keep.length!==state.watches.length){watch.reset();state.watches=keep;changed=true;}}
  if(changed)save();
 }
 let busy=false;
 async function tick(){
  if(busy||!open())return;busy=true;
  try{prune();await watch.tick();await question.tick();await repair.tick();}
  catch(error){console.error('Builds:',error?.message||error);}
  finally{busy=false;}
 }
 const lifecycle=require('../../features/lifecycle.cjs');
 lifecycle.on('settings-saved',({before,after})=>{if(RESET_KEYS.some(key=>before?.[key]!==after?.[key]))reset();prune();},company);
 lifecycle.on('project-switched',()=>{question.reset();repair.reset();},company);
 lifecycle.on('topic-removed',({id})=>{if(id)watch.stop(id);},company);
 lifecycle.on('contexts-cleared',()=>{repair.reset();state.repairs=[];question.reset();state.buildQuestions=[];watch.reset();state.watches=[];save();},company);
 lifecycle.on('company-closing',()=>reset(),company);
 return {watch,question,repair,reset,prune,tick,company};
}
module.exports={create,RESET_KEYS};
