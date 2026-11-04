// Asana: projects, tasks, preview and apply IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const asana = new (require('./asana.cjs').Asana)({settings:()=>ctx.settings,request:ctx.request});
  ctx.handle('asanaVoicePrepare', async (command, contextId, projectKey = '') => {
    ctx.modules.assertEnabled(ctx.settings, 'asana');
    command = ctx.text(command,4000); const context = ctx.contextFor(contextId);
    return asana.prepareVoice(command, context, ctx.composeDraft, projectKey);
  });
  ctx.handle('asanaProjects', offset=>asana.projects(offset));
  ctx.handle('asanaTasks', (project,offset)=>asana.tasks(project,offset));
  ctx.handle('asanaTask', id=>asana.task(id));
  ctx.handle('asanaPreview', input=>asana.preview(input));
  ctx.handle('asanaApply', id=>asana.apply(id));
  ctx.handle('asanaContext', async id=>{const task=await asana.task(id);return ctx.addContext({source:'Asana',title:task.name,text:task.name+'\n'+(task.notes||'')});});
};
