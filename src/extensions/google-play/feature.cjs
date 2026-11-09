// «Google Play»: the Google Play Console service module (module «googleplay»). It owns the connection (the settings card
// settings.js: one-click Google sign-in or a service-account key, stored as `googlePlayCredential`), the Android
// vitals reader (client.cjs), ANR in the chat (the «anr» dialogue kind, anr-kind.cjs, and the tool router's «anr»,
// route-tool.cjs), the ANR card (vitals-cards.js, result.cjs), its voice-command action and the crash source of
// «Крэши». On dashboards `dashboard.load` runs the same reader and turns its rows into the same `playVitals` card data,
// so the widget is the ANR card the chat shows. Moved from Petya's core (src/google-play.cjs, the IPC in main.cjs, the
// card in src/ui/dialogue.js); the settings keys stay, so a saved connection keeps working.
const {GooglePlay,credential,login}=require('./client.cjs');
const result=require('./result.cjs');
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const ANR=new RegExp(W+'(?:anr|анр)\\p{L}{0,3}'+E+'|'+W+'зависани\\p{L}*','iu');
// How-to and talk about ANR, and anything that changes something, are not widgets.
const QUIET=/^(?:а\s+)?(?:что такое|зачем|почему|как (?:подключить|настроить|считается|работает|снизить|уменьшить|исправить)|объясни)|(?:исправ|почин|пофикс|созда|заведи|напиши|отправ)\p{L}*/iu;
const connected=settings=>settings?.module_googleplay!=='false'&&!!settings?.googlePlayCredential;
// One reader per services object (it caches the app list); the dialogue kind, the dashboard and the IPC share it.
const readers=new WeakMap();
function reader(s){
 if(!s||typeof s!=='object')return new GooglePlay({settings:()=>({}),request:async()=>{throw Error('Google Play ещё загружается.');}});
 if(!readers.has(s))readers.set(s,new GooglePlay({settings:()=>s.settings,request:(...args)=>s.request(...args)}));
 return readers.get(s);
}

const dashboard={
 accepts:text=>{const t=String(text||'').trim();return !!t&&t.length<=300&&ANR.test(t)&&!QUIET.test(t);},
 size:'m',
 choosable:true,
 widgets:[{title:'ANR за неделю',command:'ANR за неделю'}],
 ready:connected,
 connect:()=>({names:['Google Play Console'],where:'Подключения → «Google Play Console»',offers:[]}),
 async load(s,command,{topic,selected}={}){
  if(!connected(s.settings))throw Error('Google Play не подключён: Подключения → «Google Play Console».');
  const play=new GooglePlay({settings:()=>s.settings,request:s.request});
  // The app chosen on the card (`selected`, apps/<package>) is the reader's own choice for this topic.
  const scope=topic||{};if(/^apps\/[a-zA-Z0-9._-]+$/.test(String(selected||'')))scope.playApp=selected;
  const answer=await play.read(String(command||''),scope,'');
  // Several apps and none named or chosen: the card asks which one (the choice is kept with the widget).
  if(answer?.question)return {choice:{text:'В Google Play несколько приложений — выберите, чьи ANR показывать.',find:'Найти приложение: название или пакет',empty:'Ничего не нашлось — проверьте, что у аккаунта есть доступ к приложению в Play Console.',options:answer.options||[]}};
  const data=result.extract(answer);
  return {text:String(answer?.text||''),extensionData:data||null};
 }
};

function setup(s){
 const electron=()=>require('electron');
 const show=()=>{const w=s.win;if(!w||w.isDestroyed?.())return;if(w.isMinimized?.())w.restore();w.show?.();w.focus?.();};
 const ipc={
  // A service-account key chosen in the system dialog (the path never comes from the page).
  async importKey(){
   const picked=await electron().dialog.showOpenDialog(s.win,{title:'Ключ сервисного аккаунта Google Play',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
   if(picked.canceled)return null;
   const fs=require('node:fs'),file=picked.filePaths[0];if(fs.statSync(file).size>20000)throw Error('Файл ключа слишком большой.');
   return s.saveSettings({googlePlayCredential:JSON.stringify(credential(fs.readFileSync(file,'utf8'))),module_googleplay:'true'},true);
  },
  // One click: sign in with Google in the browser; the service account key stays as the fallback.
  async connect(){
   const client=require('../../integration-clients.cjs').load().google;
   const saved=s.saveSettings({googlePlayCredential:JSON.stringify(await login({client:client&&{client_id:client.client_id,client_secret:client.client_secret},open:url=>electron().shell.openExternal(url),request:s.request})),module_googleplay:'true'},true);
   show(); // the person comes back from the browser: Petya's window is in front
   let apps=null;try{apps=(await reader(s).apps()).length;}catch{}
   return {...saved,playApps:apps};
  },
  disconnect:()=>s.saveSettings({clear_googlePlayCredential:true},true),
  check:async()=>({apps:await reader(s).apps()})
 };
 return {ipc};
}
module.exports={name:'googlePlay',
 defaults:{googlePlayCredential:''},secrets:['googlePlayCredential'],limits:{googlePlayCredential:20000},
 publicFlags:settings=>({hasGooglePlay:!!settings.googlePlayCredential}),
 validate(){},setup,teardown(){},dashboard,reader};
