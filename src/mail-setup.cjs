// Mail: Google and Microsoft accounts, mail skills and their IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const clientDefaults=require('./integration-clients.cjs').load();
  const mailOptions=key=>({load:()=>JSON.parse(ctx.settings[key]||'{}'),save:value=>ctx.saveSettings({[key]:JSON.stringify(value)},true),enabled:()=>ctx.modules.enabled(ctx.settings,'gmail'),open:url=>require('electron').shell.openExternal(url)});
  const gmail=new (require('./mail-accounts.cjs').MailAccounts)({google:mailOptions('gmailCredential'),microsoft:mailOptions('microsoftCredential')});
  for(const [provider,manager] of [['google',gmail.google],['microsoft',gmail.microsoft]])if(clientDefaults[provider]&&!manager.status().configured)manager.importClient(clientDefaults[provider]);
  ctx.handle('microsoftConfigure',id=>{gmail.microsoft.importClient(require('./outlook.cjs').clientConfig({client_id:id}));return gmail.status();});
  ctx.handle('microsoftStart',()=>gmail.microsoft.start());
  ctx.handle('mailCancel',()=>{gmail.google.login.stop();gmail.microsoft.login.stop();return gmail.status();});

  ctx.app.on('will-quit',()=>gmail.stop());
  const mailSkill=new (require('./mail-skill.cjs').MailSkill)({learning:ctx.learning,gmail,model:async(system,data,format)=>{
    if(!ctx.settings.model)throw Error('Настройте локальную модель Ollama.');
    const response=await ctx.request(ctx.core.localEndpoint(ctx.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:ctx.settings.model,stream:false,think:false,...format?{format}:{},options:{num_predict:1800},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});
    const content=response.message?.content||'';return format?JSON.parse(content):content;
  }});
  ctx.handle('gmailStatus',()=>gmail.status());
  ctx.handle('gmailRename',(id,label)=>gmail.rename(id,label));
  ctx.handle('gmailImport',async()=>{
    const result=await require('electron').dialog.showOpenDialog(ctx.win,{title:'OAuth JSON Google — Desktop app',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled)return;
    const file=result.filePaths[0];if(ctx.fs.statSync(file).size>20000)throw Error('Слишком большой JSON.');const client=require('./gmail.cjs').clientConfig(ctx.fs.readFileSync(file,'utf8'));gmail.importClient(client);
  });
  ctx.handle('gmailStart',()=>gmail.start());ctx.handle('gmailDisconnect',id=>gmail.disconnect(id));
  ctx.handle('gmailGuide',()=>require('electron').shell.openExternal('https://developers.google.com/identity/protocols/oauth2/native-app'));
  ctx.handle('mailSkills',()=>({recipes:mailSkill.list(),draft:mailSkill.draft()}));
  ctx.handle('mailSkillSave',input=>{const value=mailSkill.put(input);mailSkill.setDraft(null);return value;});ctx.handle('mailSkillDelete',id=>mailSkill.remove(id));ctx.handle('mailSkillTest',input=>mailSkill.run(input));
  return {mailSkill,clientDefaults};
};
