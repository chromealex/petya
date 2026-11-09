// The mail connection of «Почта»: Google and Microsoft accounts Petya reads (Gmail, Outlook.com, Hotmail, Microsoft
// 365; read-only), kept in the settings `gmailCredential` / `microsoftCredential` (as before the app owned them, so
// saved accounts keep working). The accounts are also the shared Google / Microsoft sign-in other apps build on
// (Календарь, Google Диск, Google Таблицы read `services.mailAccounts`); the settings card is settings.js.
// Moved from Petya's core (src/mail-setup.cjs, src/mail-accounts.cjs) into the app; the IPC is the app's feature IPC.
const {MailAccounts}=require('./accounts.cjs');
const LIMIT=200000;

function create(s,{electron=()=>require('electron'),clients=()=>require('../../integration-clients.cjs').load()}={}){
 const open=url=>electron().shell.openExternal(url);
 // The person comes back from the browser after signing in: Petya's window is in front again.
 const show=()=>{const w=s.win;if(!w||w.isDestroyed?.())return;if(w.isMinimized?.())w.restore();w.show?.();w.focus?.();};
 const options=key=>({load:()=>JSON.parse(s.settings[key]||'{}'),save:value=>{s.saveSettings({[key]:JSON.stringify(value)},true);show();},enabled:()=>s.modules.enabled(s.settings,'gmail'),open});
 const accounts=new MailAccounts({google:options('gmailCredential'),microsoft:options('microsoftCredential')});
 let defaults={};try{defaults=clients()||{};}catch(e){console.error('Mail clients:',e.message);}
 for(const [provider,manager] of [['google',accounts.google],['microsoft',accounts.microsoft]])if(defaults[provider]&&!manager.status().configured)manager.importClient(defaults[provider]);
 const id=v=>{if(typeof v!=='string'||!v||v.length>200)throw Error('Выберите подключённый аккаунт.');return v;};
 const ipc={
  accountStatus:()=>accounts.status(),
  accountRename:(account,label)=>accounts.rename(id(account),label),
  accountDisconnect:account=>accounts.disconnect(id(account)),
  accountStart:()=>accounts.start(),
  accountCancel(){accounts.google.login.stop();accounts.microsoft.login.stop();return accounts.status();},
  async accountImportGoogle(){
   const result=await electron().dialog.showOpenDialog(s.win,{title:'OAuth JSON Google — Desktop app',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
   if(result.canceled)return;
   const fs=require('node:fs'),file=result.filePaths[0];if(fs.statSync(file).size>20000)throw Error('Слишком большой JSON.');
   accounts.importClient(require('./gmail.cjs').clientConfig(fs.readFileSync(file,'utf8')));
  },
  accountGuide:()=>open('https://developers.google.com/identity/protocols/oauth2/native-app'),
  accountConfigureMicrosoft(clientId){if(typeof clientId!=='string'||clientId.length>100)throw Error('Укажите Application (client) ID приложения Microsoft.');accounts.microsoft.importClient(require('./outlook.cjs').clientConfig({client_id:clientId}));return accounts.status();},
  accountStartMicrosoft:()=>accounts.microsoft.start()
 };
 return {accounts,ipc};
}
// The settings the connection keeps (Petya's settings store, the OS keychain): defaults, secrets, the size each may
// reach (up to 20 accounts with tokens), and the flag the window reads instead of the secret.
const settings={
 defaults:{gmailCredential:'',microsoftCredential:''},
 secrets:['microsoftCredential','gmailCredential'],
 limits:{gmailCredential:LIMIT,microsoftCredential:LIMIT},
 publicFlags:s=>({hasGmail:!!s.gmailCredential}),
 // `input` is what was asked to be saved, before the store cuts values to `limits`: too many accounts is refused.
 validate(next,input={}){
  if(typeof input.microsoftCredential==='string'&&input.microsoftCredential.length>LIMIT)throw Error('Too many Microsoft accounts.');
  if(typeof input.gmailCredential==='string'&&input.gmailCredential.length>LIMIT)throw Error('Слишком большой объём данных аккаунтов Gmail.');
 }
};
module.exports={create,settings};
