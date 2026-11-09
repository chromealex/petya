// Mail: Google and Microsoft accounts and their IPC. What to read and how is the «Почта» app's
// (src/extensions/mail), which reads through these accounts.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const clientDefaults=require('./integration-clients.cjs').load();
  const mailOptions=key=>({load:()=>JSON.parse(ctx.settings[key]||'{}'),save:value=>{ctx.saveSettings({[key]:JSON.stringify(value)},true);ctx.show?.();},enabled:()=>ctx.modules.enabled(ctx.settings,'gmail'),open:url=>require('electron').shell.openExternal(url)});
  const gmail=new (require('./mail-accounts.cjs').MailAccounts)({google:mailOptions('gmailCredential'),microsoft:mailOptions('microsoftCredential')});
  for(const [provider,manager] of [['google',gmail.google],['microsoft',gmail.microsoft]])if(clientDefaults[provider]&&!manager.status().configured)manager.importClient(clientDefaults[provider]);
  ctx.handle('microsoftConfigure',id=>{gmail.microsoft.importClient(require('./outlook.cjs').clientConfig({client_id:id}));return gmail.status();});
  ctx.handle('microsoftStart',()=>gmail.microsoft.start());
  ctx.handle('mailCancel',()=>{gmail.google.login.stop();gmail.microsoft.login.stop();return gmail.status();});

  ctx.app.on('will-quit',()=>gmail.stop());
  ctx.handle('gmailStatus',()=>gmail.status());
  ctx.handle('gmailRename',(id,label)=>gmail.rename(id,label));
  ctx.handle('gmailImport',async()=>{
    const result=await require('electron').dialog.showOpenDialog(ctx.win,{title:'OAuth JSON Google — Desktop app',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled)return;
    const file=result.filePaths[0];if(ctx.fs.statSync(file).size>20000)throw Error('Слишком большой JSON.');const client=require('./gmail.cjs').clientConfig(ctx.fs.readFileSync(file,'utf8'));gmail.importClient(client);
  });
  ctx.handle('gmailStart',()=>gmail.start());ctx.handle('gmailDisconnect',id=>gmail.disconnect(id));
  ctx.handle('gmailGuide',()=>require('electron').shell.openExternal('https://developers.google.com/identity/protocols/oauth2/native-app'));
  return {clientDefaults,mailAccounts:gmail};
};
