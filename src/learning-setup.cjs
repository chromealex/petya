// Learning: dictionary rules, undo, daily brief and learned skills.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const dictionary=require('./personal-dictionary.cjs');
  ctx.handle('dictionarySave',input=>ctx.learning.putRule(input));
  ctx.handle('dictionaryDelete',id=>ctx.learning.removeRule(id));
  const dictionaryScope=command=>{
    const global=dictionary.applyRules(command,ctx.learning.list().dictionary,'').text;
    const keys=require('./jira-routing.cjs').allowed(ctx.settings).filter(k=>new RegExp('(?<![A-Za-z0-9_])'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z0-9_])','i').test(global));
    return keys.length===1?keys[0]:keys.length>1?'':ctx.dialogue.active()?.jiraProject||'';
  };
  const undoLast=id=>{
    const info=ctx.learning.undoInfo();if(!info)return {handled:true,text:'Нет локального действия для отмены. Поддерживаются навыки и правила словаря.'};
    const external=Math.max(0,...ctx.agents.records.map(r=>r.at||0),...ctx.workspace.history.flatMap(r=>[r.at||0,...(r.operations||[]).map(o=>o.at||0)]));
    if(external>=info.at)return {handled:true,text:'После этого локального действия Петя передавал или менял задачу. Отозвать выполненную работу автоматически нельзя. Изменения Jira можно проверить в разделе «История».',openHistory:true};
    return {handled:true,text:ctx.learning.undo(id||info.id)};
  };
  ctx.handle('undoInfo',()=>ctx.learning.undoInfo());ctx.handle('undoLast',undoLast);
  const dailyBrief=()=>require('./daily-brief.cjs').dailyBrief({records:ctx.agents.records,jira:ctx.workspace.history,contexts:ctx.memory.prune(),slackEnabled:ctx.modules.enabled(ctx.settings,'slack')});
  ctx.handle('dailyBrief',dailyBrief);
  // Knowledge from the chat kept elsewhere counts too: recurring commands, and what apps keep themselves (growth-source).
  const extra=()=>[...(ctx.recurring?.list()||[]).map(r=>({key:'recurring:'+r.id,title:r.command,points:15,at:r.createdAt||null,source:'Повторяющаяся команда из чата',learned:'Сам делаю «'+r.command+'» '+r.schedule+' и пишу результат в чат «По расписанию».'})),...(ctx.services?require('./growth-sources.cjs').items(ctx.services):[])];
  ctx.handle('learningList',()=>({...ctx.learning.list(),growthSummary:ctx.learning.growth(extra())}));
  ctx.handle('growthNote',(key,text)=>{ctx.learning.growthNote(key,text);return ctx.learning.growth(extra());});
  ctx.handle('learningSave',skill=>ctx.learning.put(skill));
  ctx.handle('learningDelete',id=>ctx.learning.remove(id));
  ctx.handle('learningTest',(command,draft)=>ctx.learning.preview(ctx.text(command,4000),draft));
  return {dailyBrief,dictionary,dictionaryScope,undoLast};
};
