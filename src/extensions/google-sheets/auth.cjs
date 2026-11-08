// How «Google Таблицы» signs in, on top of the shared Google Workspace connection (src/google-workspace.cjs):
// - account: a Google account Petya already has for mail, with the Sheets scope added by incremental consent —
//   spreadsheets.readonly first; spreadsheets (read and write) only after the user enables writing in settings;
// - service: a Google Cloud service-account key kept as this app's secret (googleSheetsCredential); spreadsheets
//   shared with its address are read (and written when writing is on and the sheet is shared as Editor).
const workspace=require('../../google-workspace.cjs');
const PRODUCT='sheets';
const {read:READ,write:WRITE}=workspace.SCOPES.sheets;

const googleAccounts=settings=>workspace.accounts(settings,PRODUCT);
const mode=settings=>settings.googleSheetsAuth==='service'?'service':'account';
const wantsWrite=settings=>settings.googleSheetsWrite==='true';
const serviceEmail=settings=>workspace.serviceEmail(settings.googleSheetsCredential);
const chosen=settings=>workspace.chosen(settings,PRODUCT,settings.googleSheetsAccount);
function connected(settings){return mode(settings)==='service'?!!settings.googleSheetsCredential:!!chosen(settings);}
// Writing is on in settings and the connection allows it (the service account's sharing is checked by Google).
function writable(settings){
 if(!wantsWrite(settings)||!connected(settings))return false;
 return mode(settings)==='service'||!!chosen(settings)?.write;
}
// An access token for the current path; a service account asks for the write scope whenever writing is on.
function token(s,{write=false}={}){
 const settings=s.settings;
 if(mode(settings)==='service'&&!settings.googleSheetsCredential)return Promise.reject(Error('Загрузите JSON-ключ сервисного аккаунта в настройках «Google Таблицы».'));
 if(mode(settings)!=='service'&&!chosen(settings))return Promise.reject(Error('Разрешите доступ к Google Таблицам для аккаунта Google в настройках «Google Таблицы».'));
 return workspace.token(s,PRODUCT,{mode:mode(settings),account:settings.googleSheetsAccount,credential:settings.googleSheetsCredential,write:write||mode(settings)==='service'&&wantsWrite(settings)});
}
// Who reads the sheets, for messages: «me@corp.ru» or the service account's address.
const who=settings=>mode(settings)==='service'?serviceEmail(settings):(chosen(settings)?.email||'');
module.exports={googleAccounts,mode,wantsWrite,serviceEmail,chosen,connected,writable,token,who,READ,WRITE,PRODUCT};
