// How «Google Таблицы» signs in. Two paths:
// - account: a Google account Petya already has for mail (the shared OAuth Desktop client), with the Sheets scope
//   added by incremental consent: spreadsheets.readonly first; spreadsheets (read and write) only after the user
//   enables writing in settings. Tokens stay in the mail credential; the granted scopes are stored with them.
// - service: a Google Cloud service-account key (kept as a secret); spreadsheets shared with its address are read
//   (and written when writing is on and the sheet is shared as Editor).
const account=require('../../google-service-account.cjs');
const {READ,WRITE}=require('./client.cjs');

function googleAccounts(settings){
 let c={};try{c=JSON.parse(settings.gmailCredential||'{}')||{};}catch{c={};}
 return (Array.isArray(c.accounts)?c.accounts:[]).filter(a=>a?.id).map(a=>{
  const scopes=String(a.tokens?.scope||'').split(/\s+/);
  const write=scopes.includes(WRITE);
  return {key:'google:'+a.id,id:a.id,email:String(a.email||''),label:String(a.label||''),read:write||scopes.includes(READ),write};
 });
}
const mode=settings=>settings.googleSheetsAuth==='service'?'service':'account';
const wantsWrite=settings=>settings.googleSheetsWrite==='true';
function serviceEmail(settings){try{return settings.googleSheetsCredential?account.parse(settings.googleSheetsCredential).client_email:'';}catch{return '';}}
// The account in use: the chosen one if it still has access, otherwise the first one that has.
function chosen(settings){
 const ready=googleAccounts(settings).filter(a=>a.read);
 return ready.find(a=>a.key===settings.googleSheetsAccount)||ready[0]||null;
}
function connected(settings){
 if(mode(settings)==='service')return !!settings.googleSheetsCredential;
 return !!chosen(settings);
}
// Writing is on in settings and the connection allows it (the service account's sharing is checked by Google).
function writable(settings){
 if(!wantsWrite(settings)||!connected(settings))return false;
 return mode(settings)==='service'||!!chosen(settings)?.write;
}
// An access token for the current path. `write` asks for the read-write scope.
async function token(s,{write=false}={}){
 const settings=s.settings;
 if(mode(settings)==='service'){
  if(!settings.googleSheetsCredential)throw Error('Загрузите JSON-ключ сервисного аккаунта в настройках «Google Таблицы».');
  return account.token(settings.googleSheetsCredential,write||wantsWrite(settings)?WRITE:READ,s.request);
 }
 const a=chosen(settings);
 if(!a)throw Error('Разрешите доступ к Google Таблицам для аккаунта Google в настройках «Google Таблицы».');
 if(write&&!a.write)throw Error('Для записи разрешите доступ «чтение и запись» в настройках «Google Таблицы».');
 const manager=s.mailAccounts?.google;if(!manager)throw Error('Аккаунты Google ещё загружаются. Повторите через минуту.');
 return manager.client(a.id).access();
}
// Who reads the sheets, for messages: «me@corp.ru» or the service account's address.
const who=settings=>mode(settings)==='service'?serviceEmail(settings):(chosen(settings)?.email||'');
module.exports={googleAccounts,mode,wantsWrite,serviceEmail,chosen,connected,writable,token,who,READ,WRITE};
