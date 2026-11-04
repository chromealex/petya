// Computer control: overlay, access, natural-language intents, approvals and IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const controlOverlay=new (require('./computer-overlay.cjs').ComputerOverlay)({BrowserWindow:ctx.BrowserWindow,screen:require('electron').screen});
  const computerFile=ctx.path.join(ctx.app.getPath('userData'),'computer-access.json');
  const computer=new (require('./computer-control.cjs').ComputerControl)({
    visual:ctx.smoke?null:controlOverlay,
    access:()=>process.platform!=='darwin'||ctx.systemPreferences.isTrustedAccessibilityClient(false),
    load:()=>ctx.smoke?null:(ctx.fs.existsSync(computerFile)?JSON.parse(ctx.fs.readFileSync(computerFile,'utf8')):null),
    save:value=>{if(ctx.smoke)return;ctx.fs.writeFileSync(computerFile+'.tmp',JSON.stringify(value),{mode:0o600});ctx.fs.renameSync(computerFile+'.tmp',computerFile);}
  });
  const computerIntent=new (require('./computer-intent.cjs').ComputerIntent)({computer,model:async command=>{
    if(!ctx.settings.model)return null;
    const base=new URL(ctx.core.localEndpoint(ctx.settings.ollamaUrl));
    const info=await ctx.request(new URL('/api/show',base).href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:ctx.settings.model})});
    if(info.remote_host||info.remote_model||/cloud/i.test(ctx.settings.model))throw Error('Нужна локальная модель.');
    return ctx.request(base.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./computer-intent.cjs').routingRequest(ctx.settings.model,command))});
  }});
  const computerApproval=new (require('./computer-approval.cjs').ComputerApproval)({computer,scope:()=>JSON.stringify([ctx.companyId,ctx.dialogue.state.activeProjectId,ctx.dialogue.state.activeId]),execute:async(command,action)=>{if(action?.type==='teamFillScreen')return ctx.teamFill.fromScreen(command);if(action?.type==='slackDigestScreen')return ctx.slackDigest.fromScreen(command);const result=await computer.execute(action);const rows=(result.observation?.results||[]).slice(0,12);return {handled:true,text:result.text+(rows.length?'\nНа экране:\n'+rows.map(r=>r.text).join('\n'):result.observation?.empty?'\nНичего не найдено.':'')};}});
  ctx.handle('computerApprove',(id,allow)=>computerApproval.decide(id,allow));
  ctx.handle('computerStatus',()=>computer.status());
  ctx.handle('computerApps',()=>computer.apps());
  ctx.handle('computerStart',options=>computer.start(options));
  ctx.handle('computerStop',()=>computer.stop());
  ctx.handle('computerAction',action=>computer.execute(action));
  ctx.handle('computerCommand',async value=>{const command=ctx.text(value,4000);const result=await computer.command(command)||await computerIntent.turn(command);if(!result)throw Error('Неизвестная команда управления. Используйте примеры под полем.');return result;});
  ctx.handle('computerPermission',()=>{if(process.platform==='darwin')ctx.systemPreferences.isTrustedAccessibilityClient(true);return computer.status();});
  require('electron').globalShortcut.register('CommandOrControl+Shift+F12',()=>computer.stop());
  ctx.app.on('before-quit',()=>{computer.suspend();controlOverlay.dispose();});
  ctx.powerMonitor.on('lock-screen',()=>computer.suspend());
  return {computer,computerApproval,computerIntent};
};
