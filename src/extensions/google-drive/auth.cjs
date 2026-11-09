// How «Google Диск» signs in, on top of the shared Google Workspace connection (src/google-workspace.cjs):
// - account: a Google account Petya already has for mail. Reading asks for drive.readonly and documents.readonly
//   together (finding files and reading a document's text with its headings); creating documents asks for drive.file
//   only after the user enables it in settings — that scope reaches only the files Petya itself creates;
// - service: a Google Cloud service-account key kept as this app's secret (googleDriveCredential); it reads what is
//   shared with its address. It cannot create documents the user would see.
const workspace=require('../../google-workspace.cjs');
const READ=['drive','docs'],WRITE='drive';

const googleAccounts=settings=>{
 const write=workspace.accounts(settings,WRITE);
 return workspace.accounts(settings,READ).map(a=>({...a,write:!!write.find(w=>w.key===a.key)?.write}));
};
const mode=settings=>settings.googleDriveAuth==='service'?'service':'account';
const wantsWrite=settings=>settings.googleDriveWrite==='true';
const serviceEmail=settings=>workspace.serviceEmail(settings.googleDriveCredential);
const chosen=settings=>{const a=workspace.chosen(settings,READ,settings.googleDriveAccount);return a?googleAccounts(settings).find(x=>x.key===a.key)||null:null;};
function connected(settings){return mode(settings)==='service'?!!settings.googleDriveCredential:!!chosen(settings);}
// Creating documents: on in settings, the own account path, and drive.file granted.
const writable=settings=>wantsWrite(settings)&&mode(settings)==='account'&&!!chosen(settings)?.write;
// An access token for reading (Drive and Docs) or for creating a document (drive.file).
function token(s,{write=false}={}){
 const settings=s.settings;
 if(mode(settings)==='service'){
  if(!settings.googleDriveCredential)return Promise.reject(Error('Загрузите JSON-ключ сервисного аккаунта в настройках «Google Диск».'));
  if(write)return Promise.reject(Error('Сервисный аккаунт создаёт документы в своём Диске, вы их не увидите. Подключите аккаунт Google в настройках «Google Диск».'));
  return workspace.token(s,READ,{mode:'service',credential:settings.googleDriveCredential});
 }
 const a=chosen(settings);
 if(!a)return Promise.reject(Error('Разрешите доступ к Google Диску для аккаунта Google в настройках «Google Диск».'));
 if(write&&!a.write)return Promise.reject(Error('Нужно разрешение Google на создание документов. Включите «Разрешить создавать документы» в настройках «Google Диск».'));
 return workspace.token(s,write?WRITE:READ,{mode:'account',account:a.key,write});
}
const who=settings=>mode(settings)==='service'?serviceEmail(settings):(chosen(settings)?.email||'');
module.exports={googleAccounts,mode,wantsWrite,serviceEmail,chosen,connected,writable,token,who,READ,WRITE};
