// Telegram: source, login, dialogs and sync IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  ctx.telegramSource=new (require('./telegram.cjs').TelegramSource)({load:()=>JSON.parse(ctx.settings.telegramCredential||'{}'),save:value=>ctx.saveSettings({telegramCredential:Object.keys(value).length?JSON.stringify(value):'',clear_telegramCredential:!Object.keys(value).length},true),enabled:()=>ctx.modules.enabled(ctx.settings,'telegram'),days:()=>Number(ctx.settings.contextDays),store:ctx.memory});
  ctx.handle('telegramStatus',()=>ctx.telegramSource.status());
  ctx.handle('telegramStart',input=>{const builtIn=ctx.clientDefaults.telegram;return ctx.telegramSource.start({...input,apiId:input?.apiId||builtIn?.apiId,apiHash:input?.apiHash||builtIn?.apiHash});});
  ctx.handle('integrationClients',()=>({telegram:!!ctx.clientDefaults.telegram,google:!!ctx.clientDefaults.google,microsoft:!!ctx.clientDefaults.microsoft}));
  ctx.handle('telegramRespond',(phase,value)=>ctx.telegramSource.respond(phase,value));
  ctx.handle('telegramCancel',()=>ctx.telegramSource.stop());
  ctx.handle('telegramDisconnect',()=>ctx.telegramSource.disconnect());
  ctx.handle('telegramDialogs',()=>ctx.telegramSource.dialogs());
  ctx.handle('telegramSelect',ids=>ctx.telegramSource.select(ids));
  ctx.handle('telegramSync',()=>ctx.telegramSource.sync());
  ctx.handle('telegramGuide',()=>ctx.shell.openExternal('https://my.telegram.org/apps'));
  ctx.app.on('will-quit',()=>ctx.telegramSource.stop());
};
