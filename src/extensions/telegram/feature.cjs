// The Telegram app's main-process side: the personal-account source (source.cjs: login by QR or phone, chosen chats,
// sync into the context memory, media downloads), its settings, the IPC its settings card calls (`telegram*`) and the
// background sync. It plugs into Petya through registries: a background job (src/features/service-jobs.cjs), chat
// routes and the answer context (src/features/chat-routes.cjs), media (media-source.cjs) and a tool-router capability.
const modules=require('../../modules.cjs');
function setup(s){
 const source=new (require('./source.cjs').TelegramSource)({load:()=>JSON.parse(s.settings.telegramCredential||'{}'),save:value=>s.saveSettings({telegramCredential:Object.keys(value).length?JSON.stringify(value):'',clear_telegramCredential:!Object.keys(value).length},true),enabled:()=>modules.enabled(s.settings,'telegram'),days:()=>Number(s.settings.contextDays),store:s.memory});
 const builtIn=()=>s.clientDefaults?.telegram;
 s.handle('telegramStatus',()=>source.status());
 s.handle('telegramStart',input=>source.start({...input,apiId:input?.apiId||builtIn()?.apiId,apiHash:input?.apiHash||builtIn()?.apiHash}));
 s.handle('telegramQr',input=>source.qr({apiId:input?.apiId||builtIn()?.apiId,apiHash:input?.apiHash||builtIn()?.apiHash}));
 s.handle('telegramRespond',(phase,value)=>source.respond(phase,value));
 s.handle('telegramCancel',()=>source.stop());
 s.handle('telegramDisconnect',()=>source.disconnect());
 s.handle('telegramDialogs',()=>source.dialogs());
 s.handle('telegramSelect',ids=>source.select(ids));
 s.handle('telegramSync',()=>source.sync());
 s.handle('telegramGuide',()=>require('electron').shell.openExternal('https://my.telegram.org/apps'));
 try{require('electron').app?.on?.('will-quit',()=>source.stop());}catch{}
 s.serviceJobs?.add({id:'telegram',
  tick(){if(!s.smoke&&modules.enabled(s.settings,'telegram')&&s.settings.telegramAutoSync==='true'&&s.settings.telegramCredential&&!source.busy&&Date.now()>=source.nextSync)source.sync().catch(e=>{source.state.message=e.message;});},
  busy:()=>!!source.busy,
  // Switched off: the open login and sync stop at once. The source itself did not change, so nothing is reset.
  changed(previous,next){if(next.module_telegram==='false'&&previous.module_telegram!=='false')source.stop();return false;},
  clear:()=>source.stop()
 });
 return {telegram:{source}};
}
module.exports={
 name:'telegram',
 defaults:{telegramCredential:'',telegramAutoSync:'false'},
 secrets:['telegramCredential'],
 // The saved session with the chosen chats can be long.
 limits:{telegramCredential:100000},
 publicFlags:settings=>({hasTelegram:!!settings.telegramCredential}),
 validate(next){if(!['true','false'].includes(next.telegramAutoSync))throw Error('Некорректная настройка telegramAutoSync');},
 serviceName:'Telegram',
 setup
};
