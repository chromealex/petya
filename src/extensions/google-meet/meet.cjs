// What «Google Meet» knows about Google Meet: its join links and the title of a browser tab with a call.
// Join link: https://meet.google.com/abc-defg-hij (any case, a trailing slash, query and tracking dropped).
// A call tab: the browser window's title is the active tab's, «Meet – abc-defg-hij» or «Meet: Название встречи»
// (Chrome, Edge, Safari, Arc, Firefox, Yandex; the browser's own suffix is cut by src/desktop-windows.cjs).
// Meet's home page («Google Meet»), a new tab or Google's product pages are not calls.
const {pageTitle}=require('../../desktop-windows.cjs');
const CODE=/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

// A Meet join link → {kind:'meet', key, url, name}, or null.
function recognizeLink(raw){
 let u;try{u=new URL(String(raw||'').trim().replace(/[.,;:!?)»]+$/,''));}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 if(u.hostname.toLowerCase().replace(/\.$/,'')!=='meet.google.com')return null;
 const m=/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/i.exec(u.pathname);if(!m)return null;
 const code=m[1].toLowerCase();
 return {kind:'meet',key:'meet:'+code,url:'https://meet.google.com/'+code,name:'Google Meet'};
}
const joinLinks=[/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?![a-z])/i];

// Not a call even when titled «Meet – …» / «Google Meet – …».
const NOT_CALL=/^(?:google\s+meet|meet|новая\s+вкладка|new\s+tab|главная|home|start|начало|landing|видеовстречи.*|video\s+(?:calls?|conferencing|meetings?).*|premium\s+video\s+meetings.*|online\s+web.*|вы\s+покинули\s+(?:встречу|видеовстречу).*|you\s+left\s+the\s+meeting.*|встреча\s+завершена.*|meeting\s+ended.*)$/iu;
// A window title → {code, title} of a Meet call, or null. `title` is the meeting name when the tab shows one.
function callOf(windowTitle){
 const t=pageTitle(windowTitle).replace(/\s+/g,' ').trim();
 const m=/^(?:google\s+)?meet\s*[–—:-]\s*(.{1,200})$/iu.exec(t);if(!m)return null;
 const rest=m[1].trim();
 if(!rest||NOT_CALL.test(rest)||/\|\s*Google/i.test(rest))return null;
 if(CODE.test(rest.toLowerCase()))return {code:rest.toLowerCase(),title:''};
 // «Google Meet – …» is Meet's own page unless it names a meeting code.
 if(/^google\s/i.test(t))return null;
 return {code:'',title:rest};
}
module.exports={recognizeLink,joinLinks,callOf};
