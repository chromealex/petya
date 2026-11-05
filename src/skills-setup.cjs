// Skills: instruction skills, work skills, task duplicates and attachment inspection.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const skillModule=require('./instruction-skills.cjs'),skillFile=ctx.path.join(ctx.dataRoot,'instruction-skills.json');
  const loadSkills=ctx.fs.existsSync(skillFile)?JSON.parse(ctx.safeStorage.decryptString(Buffer.from(JSON.parse(ctx.fs.readFileSync(skillFile,'utf8')).encrypted,'base64'))):[];
  const saveInstructionSkills=state=>{if(!ctx.safeStorage.isEncryptionAvailable())throw Error('Хранилище ОС недоступно.');ctx.fs.writeFileSync(skillFile+'.tmp',JSON.stringify({encrypted:ctx.safeStorage.encryptString(JSON.stringify({version:3,skills:state})).toString('base64')}),{mode:0o600});ctx.fs.renameSync(skillFile+'.tmp',skillFile);};
  const needsSkillMigration=Array.isArray(loadSkills)||loadSkills.version<3;
  const migrated=needsSkillMigration?require('./work-skills.cjs').migrate(loadSkills):loadSkills.skills;
  const instructionSkills=new skillModule.InstructionSkills({state:migrated,save:saveInstructionSkills});if(needsSkillMigration)saveInstructionSkills(instructionSkills.list());
  const workSkills=new (require('./work-skills.cjs').WorkSkills)({skills:instructionSkills,dialogue:ctx.dialogue,workspace:ctx.workspace,settings:()=>ctx.settings,request:ctx.request,
   connection:()=>JSON.stringify([ctx.settings.jiraUrl,ctx.settings.jiraProjects,ctx.settings.jiraProject,ctx.settings.module_jira,ctx.settings.atlassianCredential,ctx.settings.jiraToken,ctx.settings.jiraEmail]),
   read:(command,scope)=>ctx.jiraInsights.read(command,scope,'','tasks',{wholeProject:true,reportRows:true}),
   meetings:()=>ctx.memory.prune().filter(c=>/встреч|meeting|zoom/iu.test(c.source||'')).slice(-20).map(c=>({name:c.title+' · '+new Date(c.at).toLocaleString('ru-RU'),text:c.text})),
   answer:args=>skillModule.runSkill({...args,dialogue:ctx.dialogue,settings:{...ctx.settings},request:ctx.request,company:ctx.companies.get(ctx.companyId).name})});
  const taskDuplicates=new (require('./task-duplicates.cjs').TaskDuplicates)({workspace:ctx.workspace,state:ctx.reviewState,save:ctx.saveReview,context:()=>({id:ctx.dialogue.active()?.id,jiraProject:ctx.dialogue.active()?.jiraProject,projectMemoryId:ctx.dialogue.active()?.projectMemoryId})});
  ctx.workspace.beforeCreate=id=>taskDuplicates.assertSubmission(id);
  ctx.handle('skillsContinue',id=>workSkills.choose(ctx.text(id,200)));
  ctx.handle('skillsDraft',id=>{const context=workSkills.context(ctx.text(id,100));ctx.snapshots.set(context.id,context);return context;});
  ctx.handle('skillsList',()=>instructionSkills.list());ctx.handle('skillsSave',value=>instructionSkills.put(value));ctx.handle('skillsDelete',id=>instructionSkills.remove(id));
  ctx.handle('skillsParse',markdown=>skillModule.parseMarkdown(markdown));
  ctx.handle('skillsExport',id=>{const skill=instructionSkills.list().find(s=>s.id===id);if(!skill)throw Error('Скилл не найден.');return skillModule.markdown(skill);});
  const executeSkill=async(command,ids)=>{const selected=instructionSkills.resolve(command);if(!selected)return null;const files=ids?ctx.attachments.take(ids):undefined;const result=await workSkills.turn(selected,command,files)||await skillModule.runSkill({selected,command,dialogue:ctx.dialogue,settings:{...ctx.settings},request:ctx.request,company:ctx.companies.get(ctx.companyId).name,files,...require('./chat-attribution.cjs').contextExcerpt(ctx.memory.prune().slice(-10))});if(ids)for(const id of ids)ctx.attachments.remove(id);return result;};
  const inspectAttachments=async(ids,question)=>{
    const caption=String(question||'').trim();
    question=caption?ctx.text(caption,4000):require('./attachment-assistant.cjs').briefFileQuestion;
    const files=ctx.attachments.take(ids), dialogue=ctx.dialogue, at=Date.now();
    let topic=dialogue.active();
    if(!topic){
      topic={id:ctx.randomUUID(),title:'Файлы: '+files.map(f=>f.name).join(', ').slice(0,70),kind:'chat',projectId:dialogue.state.activeProjectId,messages:[]};
      dialogue.state.topics.push(topic);
      dialogue.state.activeId=topic.id;
    }
    if(dialogue.running.has(topic.id))throw Error('Дождитесь ответа в этом чате.');
    dialogue.running.add(topic.id);
    try{
      topic.at=at;
      topic.attachments=[...(topic.attachments||[]),...files];
      topic.messages.push({role:'user',text:caption,at,attachments:files.map(f=>ctx.attachments.info(f)),...(topic.nextQuote?{replyTo:topic.nextQuote}:{})});
      delete topic.nextQuote;
      dialogue.persist();
      for(const id of ids)ctx.attachments.remove(id);
      let answer,error=false;
      try{
        if(!caption && files.every(f=>f.modelFormat))answer=files.map(f=>f.name+' — '+f.note).join('\n')+'\nОткройте «Показать 3D» под файлом.';
        else answer=await ctx.analyzeMaterials({...topic,attachments:files},question);
      }
      catch(e){answer=e.message;error=true;}
      if(!dialogue.state.topics.includes(topic))return {handled:true,text:'Чат удалён.'};
      topic.messages.push({role:'assistant',text:answer,error,...(error?{retryStep:'files'}:{}),usedMaterials:error?[]:require('./chat-attribution.cjs').fileRefs(files,answer),at:Date.now()});
      dialogue.persist();
      return {handled:true,text:answer,error,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
    }finally{dialogue.running.delete(topic.id);}
  };
  ctx.handle('attachmentInspect',async(ids,command)=>{
    if (!String(command||'').trim()) return inspectAttachments(ids,'');
    const request = ctx.text(command,4000);
    const reply = await require('./features/extension-replies.cjs').turnForAttachments(ctx,ids,request);
    if (reply) return reply;
    return (await executeSkill(request,ids)) || (require('./team-fill.cjs').isTeamFill(command)?ctx.teamFill.turn(request):inspectAttachments(ids,command));
  });
  return {instructionSkills,inspectAttachments,executeSkill,taskDuplicates,workSkills};
};
