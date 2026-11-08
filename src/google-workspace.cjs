// Shared Google Workspace connection for Google apps (Sheets now; Docs and Drive next). It owns both ways in:
// - account: a Google account Petya already has for mail (the shared OAuth Desktop client in the Gmail credential).
//   Each product's scopes are added by incremental consent (`include_granted_scopes`), read first, write only when
//   the app asks for it; granted scopes are stored with the account's tokens and refreshed by the mail client.
// - service: a Google Cloud service-account key (the app keeps it as its own secret); tokens come from the JWT bearer
//   grant in src/google-service-account.cjs and are cached per key and scope.
// An app passes its product and its own settings (which path, which account, the key); this module names no app.
const serviceAccount=require('./google-service-account.cjs');

const SCOPES={
 sheets:{read:'https://www.googleapis.com/auth/spreadsheets.readonly',write:'https://www.googleapis.com/auth/spreadsheets'},
 docs:{read:'https://www.googleapis.com/auth/documents.readonly',write:'https://www.googleapis.com/auth/documents'},
 drive:{read:'https://www.googleapis.com/auth/drive.readonly',write:'https://www.googleapis.com/auth/drive.file'}
};
const product=name=>{const p=SCOPES[name];if(!p)throw Error('Неизвестный продукт Google: '+name);return p;};
// A broader scope covers the narrower one: spreadsheets ⊃ spreadsheets.readonly, documents ⊃ documents.readonly.
// Drive: drive.file only reaches files the app created, so it does not mean reading; the full `drive` scope covers both.
const FULL_DRIVE='https://www.googleapis.com/auth/drive';
function covers(scopes,name,write){
 const p=product(name),set=new Set(scopes);
 if(write)return set.has(p.write)||name==='drive'&&set.has(FULL_DRIVE);
 return set.has(p.read)||name!=='drive'&&set.has(p.write)||name==='drive'&&set.has(FULL_DRIVE);
}
// Google accounts from mail with what each may do in a product: [{key, id, email, label, read, write}].
function accounts(settings,name){
 let c={};try{c=JSON.parse(settings.gmailCredential||'{}')||{};}catch{c={};}
 return (Array.isArray(c.accounts)?c.accounts:[]).filter(a=>a?.id).map(a=>{
  const scopes=String(a.tokens?.scope||'').split(/\s+/).filter(Boolean);
  const write=covers(scopes,name,true);
  return {key:'google:'+a.id,id:a.id,email:String(a.email||''),label:String(a.label||''),read:covers(scopes,name,false),write};
 });
}
// The account an app uses: its chosen one while it still has read access, otherwise the first one that has.
function chosen(settings,name,key){const ready=accounts(settings,name).filter(a=>a.read);return ready.find(a=>a.key===key)||ready[0]||null;}
function serviceEmail(credential){try{return credential?serviceAccount.parse(credential).client_email:'';}catch{return '';}}

// An access token. `via`: {mode:'account'|'service', account?: key, credential?: JSON}.
async function token(s,name,{mode='account',account:key='',credential='',write=false}={}){
 const p=product(name);
 if(mode==='service'){if(!credential)throw Error('Загрузите JSON-ключ сервисного аккаунта Google.');return serviceAccount.token(credential,write?p.write:p.read,s.request);}
 const a=chosen(s.settings,name,key);
 if(!a)throw Error('Разрешите доступ Google для аккаунта в настройках приложения.');
 if(write&&!a.write)throw Error('Нужно разрешение Google на запись. Разрешите его в настройках приложения.');
 const manager=s.mailAccounts?.google;if(!manager)throw Error('Аккаунты Google ещё загружаются. Повторите через минуту.');
 return manager.client(a.id).access();
}
// Incremental consent for a product's scope through the mail sign-in. `watch` reports the outcome once the browser
// step ends: onDone({ok, account, error}). Returns the pending login.
async function consent(s,name,{account:key='',write=false,poll=1000,now=()=>Date.now(),onDone=()=>{}}={}){
 const p=product(name),manager=s.mailAccounts?.google;if(!manager)throw Error('Аккаунты Google ещё загружаются.');
 const target=key?accounts(s.settings,name).find(a=>a.key===key):null;
 const has=a=>write?a.write:a.read;
 const before=new Set(accounts(s.settings,name).filter(has).map(a=>a.key));
 await manager.start({scopes:[write?p.write:p.read],email:target?.email||''});
 const started=now();
 const timer=setInterval(()=>{
  const login=manager.login;if(login?.pending&&now()-started<310000)return;
  clearInterval(timer);
  const after=accounts(s.settings,name).filter(has);
  const fresh=after.find(a=>!before.has(a.key))||after.find(a=>a.key===key);
  onDone(login?.lastError?{ok:false,error:login.lastError}:fresh?{ok:true,account:fresh}:{ok:false,error:'Доступ не выдан. Отметьте разрешение Google на странице входа и повторите.'});
 },poll);
 timer.unref?.();
 return {stop(){clearInterval(timer);manager.login?.stop?.();}};
}
const configured=s=>{try{return !!s.mailAccounts?.google?.status().configured;}catch{return false;}};
module.exports={SCOPES,accounts,chosen,serviceEmail,token,consent,configured,parseKey:serviceAccount.parse};
