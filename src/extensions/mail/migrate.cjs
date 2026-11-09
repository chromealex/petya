// One-time move of the mail rules Petya's core kept before 0.16 into this app, run when the app is set up for a
// company (bundled apps are set up whether or not they are added, so nothing waits for the user):
//  - the learned-skills state's `recipes` (the rules, same ids and contents) and `mailDraft` (an unfinished teaching
//    in the chat) go to the app's own rules.json;
//  - they are copied first and taken out of the learned-skills state after, so a failed write loses nothing: the
//    next start tries again.
// Their «Развитие» points stay: the app reports its rules to the growth scale (growth-source.cjs) under the same
// keys the core used, so the earned events stay active. Nothing is added or switched on: the rules work as before
// while «Почта» is added and show on «Навыки» → «Почтовые правила».
function migrate(s,rules){
 const learning=s.learning;
 if(!learning||typeof learning.take!=='function')return null;
 const state=learning.list();
 const legacy=Array.isArray(state.recipes)?state.recipes:null,draft=state.mailDraft&&typeof state.mailDraft==='object'?state.mailDraft:null;
 if(!legacy&&!('mailDraft' in state))return null;
 const {moved,left}=rules.adopt(legacy||[],draft);
 // Only after the app's file holds them; a rule that could not move keeps the old state as it is.
 if(left.length){console.error('Mail rules migration: '+left.length+' rule(s) could not move; the old state is kept');return {moved,left,draft:!!draft};}
 if(legacy)learning.take('recipes');
 if('mailDraft' in state)learning.take('mailDraft');
 return {moved,left,draft:!!draft};
}
module.exports={migrate};
