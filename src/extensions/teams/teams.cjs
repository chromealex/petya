// What «Microsoft Teams» knows about Teams: its join links and the windows of a Teams call.
// Join links: https://teams.microsoft.com/l/meetup-join/… (the tenant in `context` is kept), the short
// https://teams.microsoft.com/meet/<id>?p=… and Teams (free) https://teams.live.com/meet/<id>?p=….
// A call window: the Teams desktop app (new Teams «ms-teams», classic «Teams») opens a call in its own window titled
// «<meeting> | Microsoft Teams»; Teams on the web shows the same title in the browser tab. The main window is
// «<section> | … | Microsoft Teams» («Чат | Анна | Microsoft Teams», «Calendar | Microsoft Teams»): not a call.
const {pageTitle,isBrowser}=require('../../desktop-windows.cjs');
const TRACKING=/^(?:utm_\w+|fbclid|gclid|mc_eid|mc_cid|_ga|ref|source)$/i;

// A Teams join link → {kind:'teams', key, url, name}, or null.
function recognizeLink(raw){
 let u;try{u=new URL(String(raw||'').trim().replace(/[.,;:!?)»]+$/,''));}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase().replace(/\.$/,'');u.hash='';
 const work=host==='teams.microsoft.com'&&(/^\/l\/meetup-join\/./.test(u.pathname)||/^\/meet\/\d{6,}\/?$/.test(u.pathname));
 const free=host==='teams.live.com'&&/^\/meet\/\d{6,}\/?$/.test(u.pathname);
 if(!work&&!free)return null;
 for(const k of [...u.searchParams.keys()])if(TRACKING.test(k))u.searchParams.delete(k);
 let path;try{path=decodeURIComponent(u.pathname);}catch{path=u.pathname;}
 return {kind:'teams',key:'teams:'+path.toLowerCase(),url:u.href,name:'Microsoft Teams'};
}
const joinLinks=[/https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\//i];

// The desktop app's processes (Windows); on macOS the owner is unknown and the title decides.
const APPS=/^(?:ms-teams|teams|msteams)$/i;
const SUFFIX=/\s*\|\s*Microsoft Teams(?:\s+classic|\s*\((?:work or school|free|для работы или учебы|бесплатно)\))?\s*$/iu;
// Sections of the main window and other windows that are not a call.
const NOT_CALL=/^(?:activity|activity feed|chat|chats|teams|calendar|calls|files|apps|assignments|communities|onedrive|approvals|planner|shifts|search|notifications?|settings|people|home|help|copilot|viva(?:\s+\p{L}+)?|meet|microsoft teams|sign in.*|действия|активность|лента|чат|чаты|команды|календарь|звонки|файлы|приложения|задания|сообщества|утверждения|смены|поиск|уведомления|параметры|настройки|люди|главная|справка|встречи|вход.*)$/iu;
// Windows Teams shows only during a call (sharing toolbar, compact view): a call without a name.
const CALL_BAR=/^(?:sharing control bar|screen sharing toolbar|meeting compact view|панель управления демонстрацией|компактный вид собрания)$/iu;
// A window title (and its process name, '' when unknown) → {title} of a Teams call, or null.
function callOf(windowTitle,app=''){
 if(app&&!APPS.test(String(app).replace(/\.exe$/i,''))&&!isBrowser(app))return null;
 const t=pageTitle(windowTitle).replace(/\s+/g,' ').trim();
 if(!SUFFIX.test(t))return null;
 const parts=t.replace(SUFFIX,'').split(/\s+\|\s+/).map(x=>x.trim()).filter(Boolean);
 if(parts.length!==1)return null;
 if(CALL_BAR.test(parts[0]))return {title:''};
 if(NOT_CALL.test(parts[0]))return null;
 return {title:parts[0].slice(0,200)};
}
module.exports={recognizeLink,joinLinks,callOf};
