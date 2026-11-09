// One-time move of what Petya's core kept before 0.15 into this app, run when the app is set up for a company
// (bundled apps are set up whether or not they are added, so nothing waits for the user to add it):
//  - the core reminders (the learned-skills state's `reminders`: {id, text, due, state, skill}) — pending ones become
//    this app's time reminders with the same id, text and time (they never had a repeat or a chat; they fire into
//    the «Напоминания» chat), delivered ones become done reminders for the journal, cancelled ones are dropped;
//  - learned voice commands with the old action «напоминание» ({delay}, {message}) become commands that ask this app:
//    «Напомни через {delay}: {message}».
// When anything still active moved, the app is added in this company (it is local: no network, no downloads), so
// those reminders keep firing and stay visible on «Навыки» → «Напоминания»; a one-time note says so.
const COMMAND='Напомни через {delay}: {message}';

function migrate(s,reminders){
 const learning=s.learning;
 if(!learning||typeof learning.take!=='function')return null;
 // Copied into this app's store first, taken out of the learning state after: a failed write loses nothing.
 const legacy=learning.list().reminders;
 const commands=(learning.list().skills||[]).filter(k=>k&&k.action==='reminder');
 if(!Array.isArray(legacy)&&!commands.length)return null;
 const rows=[];
 for(const r of Array.isArray(legacy)?legacy:[]){
  if(!r||typeof r.text!=='string'||!Number.isFinite(r.due))continue;
  if(r.state==='pending'||r.state==='delivered')rows.push({id:r.id,text:r.text,at:r.due,status:r.state==='pending'?'active':'done',original:r.skill?String(r.skill):''});
 }
 const moved=reminders.adopt(rows.filter(r=>r.status==='active'));
 reminders.adopt(rows.filter(r=>r.status==='done'));
 if(legacy!==undefined){try{learning.take('reminders');}catch(e){console.error('Reminders migration:',e.message);}}
 let rewritten=0;
 for(const k of commands){
  try{if(learning.replaceSkill(k.id,{action:'command',output:COMMAND}))rewritten++;}
  catch(e){console.error('Reminders migration: command «'+k.name+'»:',e.message);}
 }
 const added=!!(moved||rewritten)&&s.settings?.extension_reminders!=='true';
 if(added)s.saveSettings?.({extension_reminders:'true'});
 if(moved||rewritten)reminders.note({kind:'migrated',moved,commands:rewritten,added,seen:false});
 return {moved,commands:rewritten,added};
}
module.exports={migrate,COMMAND};
