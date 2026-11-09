// Jira: routing, documents, metadata, people, batches and history actions IPC.
// Set up by the Jira feature (feature.cjs): shared state comes through ctx (live getters over the services).
module.exports=ctx=>{
  const routing = new (require('./routing.cjs').JiraRouting)(ctx.workspace);
  ctx.handle('routeJira', async(command,id,project,issueType)=>{
    command=ctx.text(command,4000);const context=ctx.contextFor(id);const remembered=ctx.projectMemory.get(context.projectMemoryId);const explicit=require('./selection.cjs').keys(ctx.settings.jiraProjects||ctx.settings.jiraProject).some(key=>new RegExp('(?:^|[^a-z0-9])'+key+'(?:$|[^a-z0-9])','i').test(command));const known=!explicit&&remembered?.jira?.site===ctx.settings.jiraUrl?remembered.jira.key:'';const result=await routing.resolve(command,context,project||known,issueType);
    const target=ctx.dialogue.active()||ctx.dialogue.state;
    target.lastRouting={project:result.project||'',name:result.name||'',reason:result.reason,source:context.source+' · '+context.title,at:Date.now()};ctx.dialogue.persist();return result;
  });
  const routed = id => id ? routing.settings(id) : (() => { throw new Error('Сначала определите проект по контексту задачи.'); })();
  // Planning without a Jira project is fine when Jira is not connected (the plan goes to Asana).
  const planSettings = id => { const live = ctx.workspace.settings(); return id || require('../../workload.cjs').sources(live, ctx.modules).jira ? routed(id) : { ...live, jiraProject: '' }; };
  // The running decomposition, so a reopened window shows its progress.
  ctx.handle('decomposeStatus', () => ctx.workspace.decomposing);
  ctx.handle('searchDocs', (id, query) => ctx.workspace.searchDocs(ctx.contextFor(id), query));
  ctx.handle('jiraChoices', project => require('./selection.cjs').choices(ctx.workspace, ctx.settings, project));
  ctx.handle('taskMetrics',input=>require('./metrics.cjs').read(ctx.workspace,input));
  ctx.handle('jiraMetadata', (boardId, routeId) => ctx.workspace.metadata(boardId, routed(routeId)));
  ctx.handle('jiraPeople', (query, routeId) => ctx.workspace.people(query, routed(routeId)));
  ctx.handle('prepareBatch', async (command, id, docs, boardId, routeId) => {
    command = ctx.text(command, 4000);
    if (ctx.delegation(command)?.mine) { const me = await ctx.workspace.api('/rest/api/3/myself'); if (!me?.accountId) throw new Error('Не удалось определить ваш аккаунт Jira.'); command += '\nТекущий пользователь («я»): ' + me.displayName + ', accountId=' + me.accountId; }
    const context=ctx.contextFor(id);if(context.skillDraftId){const selected=routed(routeId),prepared=await ctx.workSkills.prepare(context.skillDraftId,boardId,selected);return ctx.taskDuplicates.prepare(context.skillDraftId,prepared,selected);}
    return ctx.workspace.prepare(command, context, docs, boardId, planSettings(routeId));
  });
  ctx.handle('submitBatch', async input => {const selected=routed(input.routeId),checked=await ctx.taskDuplicates.guard(input,selected);return ctx.workspace.submit(checked,selected);});
  ctx.handle('batchHistory', () => ctx.workspace.history);
  ctx.handle('previewHistoryEdit', (id, instruction, keys) => ctx.workspace.actions.previewEdit(id, instruction, keys));
  ctx.handle('previewHistoryUndo', (id, operationId, keys) => ctx.workspace.actions.previewUndo(id, operationId, keys));
  ctx.handle('applyHistoryChange', (id, confirmDelete) => ctx.workspace.actions.apply(id, confirmDelete));
  ctx.handle('openDocument', id => { const doc = ctx.workspace.docs.get(id); if (!doc) throw new Error('Документ недоступен.'); return require('electron').shell.openExternal(doc.url); });
  return {routed};
};
