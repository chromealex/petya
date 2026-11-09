// «История буфера»: a local history of copied text and pictures, off until the user switches it on (settings or the
// question in the chat). Encrypted with the OS keychain when available; the last 200 copies or 7 days. Copies from
// password managers (marked by the app or made while one was in front) and anything that looks like a password or a
// token are never stored (secrets.cjs). Pause and «Стереть всё».
// Chat: «что я копировал про API ключ» (search), «история буфера» (list), «вставь третье скопированное» (back on the
// clipboard, with «Вернуть прежнее»), «скопируй последнюю ссылку из буфера в Jira задачу BW-12» (a confirmation card;
// the comment is written by the tracker's `task-tracker` provider only when its button is pressed).
const path=require('node:path');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const secrets=require('./secrets.cjs');
const storage=require('./store.cjs');
const watcher=require('./watcher.cjs');
const ID='clipboard',BY='История буфера',DAY=86400000;

// --- Routing --------------------------------------------------------------------------------------------------------
const SUBJECT=/буфер\p{L}*(?:\s+обмена)?|скопированн\p{L}*|(?:что|когда|где)\s+(?:я\s+)?(?:копировал|скопировал)\p{L}*|clipboard/iu;
// Buffers that are not the clipboard, and questions about how copying works.
const AVOID=/(?:буфер\p{L}*\s+(?:кадр|глубин|вершин|индекс|команд|рендер|памяти|сокет|ввода|вывода|отрисовк|обмена\s+данными\s+между)|frame ?buffer|буферн\p{L}*\s+(?:зон|памят|раствор|государств)|размер\p{L}*\s+буфер|буфер\p{L}*\s+(?:в|на)\s+(?:шейдер|unity|юнити|коде|c\+\+|си)|в\s+буфер\p{L}*\s+(?:кадр|глубин)|^(?:очисти|почисти)\s+буфер\p{L}*(?:\s+обмена)?$)/iu;
const QUIET=/^(?:а\s+)?(?:как|что такое|зачем|почему)\s+(?!я\s)/iu;
const ORDINALS=[[/^перв/u,1],[/^втор/u,2],[/^трет/u,3],[/^четв[её]рт/u,4],[/^пят/u,5],[/^шест/u,6],[/^седьм/u,7],[/^восьм/u,8],[/^девят/u,9],[/^десят/u,10],[/^предпоследн/u,2],[/^последн/u,1]];
const KEY=/(?:^|[^\p{L}\d-])([A-Za-z][A-Za-z0-9_]{0,19}-\d{1,9})(?=$|[^\p{L}\d])/u;
const KIND=t=>/ссылк|линк|url/iu.test(t)?'link':/картинк|изображени|скрин|фото|снимок|рисун/iu.test(t)?'image':/текст/iu.test(t)?'text':'';
function ordinal(t){
 const m=/(?:№\s*|#)?(\d{1,3})(?:-?(?:е|й|ю|я|ое|ую|ий|ая))?\s+(?:скопированн|из\s+буфер|из\s+истори|ссылк|картинк|текст)/iu.exec(t);if(m)return Number(m[1]);
 for(const w of String(t).toLocaleLowerCase('ru').split(/[^\p{L}]+/u))for(const [r,n] of ORDINALS)if(r.test(w))return n;
 return 0;
}
function intent(text){
 const t=String(text||'').trim();
 if(/(?:сотри|стер\p{L}*|удали|очисти|почисти)\s+(?:всю\s+|все\s+|вс[её]\s+)?(?:истори\p{L}*\s+буфер|историю\s+копировани|скопированное)|стереть\s+вс[её]\s+(?:из\s+)?(?:истори|буфер)/iu.test(t))return {action:'wipe'};
 if(/(?:поставь|ставь)\s+.*буфер\p{L}*.*\s+на\s+паузу|(?:приостанови|останови)\s+(?:запис\p{L}*\s+|историю\s+)?буфер|пауз\p{L}*\s+(?:для\s+)?(?:истори\p{L}*\s+)?буфер/iu.test(t)){const h=/(\d{1,2})\s*час/iu.exec(t),m=/(\d{1,3})\s*мин/iu.exec(t);return {action:'pause',minutes:m?Number(m[1]):h?Number(h[1])*60:/на\s+час(?=$|[^\p{L}])/iu.test(t)?60:0};}
 if(/(?:возобнови|продолжи|сними\s+с\s+паузы)\s+(?:запис\p{L}*\s+|историю\s+)?буфер/iu.test(t))return {action:'resume'};
 if(/(?:выключи|отключи)\s+(?:историю\s+)?буфер/iu.test(t))return {action:'off'};
 if(/(?:включи|запоминай|начни\s+запоминать)\s+(?:историю\s+)?буфер|включи\s+историю\s+копирован/iu.test(t))return {action:'on'};
 const key=KEY.exec(t);
 if(key&&/ссылк|линк/iu.test(t)&&/(?:скопируй|добавь|отправь|перенеси|вставь|приложи|прикрепи|кинь|закинь)/iu.test(t)&&/(?:\s(?:в|к)\s)/iu.test(t))
  return {action:'link',issue:key[1].toUpperCase(),n:ordinal(t.replace(KEY,' '))||1};
 if(/(?:вставь|верни|положи|скопируй\s+(?:снова|обратно|опять|заново)|возьми)\s/iu.test(t)&&(ordinal(t)||/последн/iu.test(t)))
  return {action:'paste',n:ordinal(t)||1,kind:KIND(t)};
 const q=/(?:что|когда|где)\s+(?:я\s+)?(?:копировал|скопировал)\p{L}*\s+(?:про|о|об|насч[её]т|по\s+поводу|связанное\s+с|с|со)\s+(.+)$/iu.exec(t)||/(?:найди|поищи|ищи|покажи)\s+(?:в\s+)?(?:истори\p{L}*\s+)?буфер\p{L}*(?:\s+обмена)?\s+(?:про\s+|о\s+|об\s+)?(.+)$/iu.exec(t)||/(?:в\s+)?(?:истори\p{L}*\s+)?буфер\p{L}*\s+(?:про|о|об)\s+(.+)$/iu.exec(t);
 if(q){const query=q[1].replace(/[.…?!]+$/u,'').replace(/^(?:«|")|(?:»|")$/g,'').trim();if(query)return {action:'search',query:query.slice(0,120),kind:KIND(q[1])};}
 return {action:'list',kind:KIND(t)};
}
const wanted=text=>{const t=String(text||'');return SUBJECT.test(t)&&!AVOID.test(t)&&!QUIET.test(t.trim());};

// --- Search -----------------------------------------------------------------------------------------------------------
const norm=v=>String(v||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const STOP=new Set(['что','про','как','для','это','мне','или','все','всё','где','его','она','они','был','была','мой','моя']);
function terms(query){return [...new Set(norm(query).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=2&&!STOP.has(w)).map(w=>w.length>5?w.slice(0,w.length-2):w))].slice(0,8);}
function search(items,query){
 const words=terms(query);if(!words.length)return items;
 const need=words.length<=2?words.length:Math.ceil(words.length/2);
 return items.map(i=>{const hay=norm(i.kind==='text'?i.text:i.app);const hits=words.filter(w=>hay.includes(w)).length;return {i,hits};})
  .filter(x=>x.hits>=need).sort((a,b)=>b.hits-a.hits||b.i.at-a.i.at).map(x=>x.i);
}
const LINK=/https?:\/\/[^\s<>"'«»]+[^\s<>"'«».,;:!?)\]]/giu;
const linksOf=items=>items.filter(i=>i.kind==='text').flatMap(i=>[...i.text.matchAll(LINK)].map(m=>({item:i,url:m[0]})));
function filter(items,kind){
 if(kind==='image')return items.filter(i=>i.kind==='image');
 if(kind==='text')return items.filter(i=>i.kind==='text');
 if(kind==='link')return items.filter(i=>i.kind==='text'&&/https?:\/\/\S/i.test(i.text));
 return items;
}

// --- State ------------------------------------------------------------------------------------------------------------
const state={store:null,services:null,watch:null,foreground:null,skipped:{manager:0,secret:0},previous:null};
const deps={
 clipboard:()=>require('electron').clipboard,
 nativeImage:()=>require('electron').nativeImage,
 crypt(){try{const {safeStorage}=require('electron');if(safeStorage?.isEncryptionAvailable?.())return {encrypt:t=>safeStorage.encryptString(t),decrypt:b=>safeStorage.decryptString(b)};}catch{/* plain file with 0600 */}return {};},
 foreground:()=>{try{state.foreground=state.foreground||require('../../activity/foreground.cjs').create();return state.foreground.read();}catch{return Promise.resolve(null);}},
 now:()=>Date.now(),
 smoke:()=>process.env.PETYA_SMOKE_TEST==='1'
};
function storeOf(s){
 const dir=path.join(s.dataRoot||'.','extensions',ID);
 if(!state.store||state.store.dir!==dir)state.store=storage.create(dir,{...deps.crypt(),now:deps.now});
 return state.store;
}
const enabled=s=>s.settings.clipboardHistory==='true';
function paused(s){const v=String(s.settings.clipboardPausedUntil||'');if(!v)return false;if(v==='forever')return true;return Number(v)>deps.now();}
function status(s){
 const st=storeOf(s),items=st.list();
 return {enabled:enabled(s),paused:enabled(s)&&paused(s),pausedUntil:String(s.settings.clipboardPausedUntil||'')==='forever'?0:Number(s.settings.clipboardPausedUntil)||0,
  count:items.length,texts:items.filter(i=>i.kind==='text').length,images:items.filter(i=>i.kind==='image').length,encrypted:st.encrypted,bytes:st.bytes(),
  skipped:{...state.skipped},watching:!!state.watch?.running,limit:storage.LIMIT,days:storage.DAYS};
}
// Copies per day over the kept week, text and pictures apart (the card's bars).
function perDay(items,now=deps.now()){
 const start=new Date(now);start.setHours(0,0,0,0);
 return Array.from({length:7},(_,k)=>{const from=start.getTime()-(6-k)*DAY,to=from+DAY;const day=items.filter(i=>i.at>=from&&i.at<to);return {day:from,texts:day.filter(i=>i.kind==='text').length,images:day.filter(i=>i.kind==='image').length};});
}
const view=i=>i.kind==='text'?{id:i.id,at:i.at,kind:'text',app:i.app||'',text:i.text.slice(0,600),long:i.text.length>600,link:(i.text.match(LINK)||[])[0]||''}:{id:i.id,at:i.at,kind:'image',app:i.app||'',width:i.width,height:i.height,thumb:i.thumb||''};
function card(s,mode,extra={}){
 const items=storeOf(s).list();
 const numbered=new Map(items.map((i,k)=>[i.id,k+1]));
 const shown=(extra.items||items).slice(0,30).map(i=>({...view(i),n:numbered.get(i.id)}));
 return {clipboardHistory:{mode,at:deps.now(),status:status(s),days:perDay(items),total:(extra.items||items).length,items:shown,...extra.data}};
}

// --- Watching ---------------------------------------------------------------------------------------------------------
async function copied(s,{formats,text,image}){
 if(!kit.installed(s,ID)||!enabled(s)||paused(s))return;
 if(secrets.marked(formats)){state.skipped.manager++;return;}
 const front=await Promise.race([deps.foreground(),new Promise(r=>setTimeout(()=>r(null),1500))]).catch(()=>null);
 if(front&&secrets.privateApp(front.app,s.settings.clipboardPrivateApps)){state.skipped.manager++;return;}
 const app=front?.app&&!/^(?:petya|петя|electron)$/i.test(front.app)?front.app:'';
 if(text){if(secrets.looksSecret(text)){state.skipped.secret++;return;}storeOf(s).add({kind:'text',text,app});return;}
 if(image){
  let img=image;const size=img.getSize();
  if(Math.max(size.width,size.height)>1600)img=img.resize(size.width>=size.height?{width:1600}:{height:1600});
  const out=img.getSize(),thumb=img.resize(out.width/out.height>2?{width:192}:{height:96});
  storeOf(s).add({kind:'image',png:img.toPNG(),width:size.width,height:size.height,thumb:'data:image/jpeg;base64,'+thumb.toJPEG(70).toString('base64'),app});
 }
}
// One watcher for the app (the clipboard is the computer's), following the active company's services.
function sync(s){
 const want=!deps.smoke()&&kit.installed(s,ID)&&enabled(s)&&!paused(s);
 if(want&&!state.watch){state.watch=watcher.create({clipboard:deps.clipboard(),onCopy:change=>copied(state.services||s,change)});state.watch.start();}
 else if(!want&&state.watch){state.watch.stop();state.watch=null;}
}

// --- Actions ----------------------------------------------------------------------------------------------------------
function write(s,item){
 const clip=deps.clipboard();
 if(item.kind==='text')clip.writeText(item.text);
 else clip.writeImage(deps.nativeImage().createFromBuffer(storeOf(s).image(item.id)));
 state.watch?.settle();
}
function enable(s,on){
 s.saveSettings({clipboardHistory:on?'true':'false',...on?{}:{clipboardPausedUntil:''}});
 sync(s);return status(s);
}
const plural=n=>n+' '+kit.plural(n,['запись','записи','записей']);
const preview=i=>i.kind==='image'?'картинка '+i.width+'×'+i.height:'«'+i.text.replace(/\s+/g,' ').slice(0,60)+(i.text.length>60?'…':'')+'»';

function answer(s,command,want){
 const items=storeOf(s).list();
 if(want.action==='paste'){
  const pool=filter(items,want.kind);const item=pool[want.n-1];
  const what=want.kind==='link'?'ссылок':want.kind==='image'?'картинок':want.kind==='text'?'текстов':'записей';
  if(!item)return kit.reply(s,command,{by:BY,question:true,text:pool.length?'В истории только '+pool.length+' '+(want.kind?what:kit.plural(pool.length,['запись','записи','записей']))+'. Какую вернуть в буфер?':'История буфера пока пуста.'});
  state.previous=items[0]&&items[0].id!==item.id?items[0].id:null;
  if(want.kind==='link'){const url=(item.text.match(LINK)||[])[0];deps.clipboard().writeText(url);state.watch?.settle();}
  else write(s,item);
  return kit.reply(s,command,{by:BY,text:'Положил в буфер '+(want.n===1?'последнее':'№'+want.n)+(want.kind==='link'?' (ссылку)':'')+': '+preview(item)+'. Можно вставлять.',
   data:card(s,'paste',{items:[item,...items.filter(i=>i!==item)].slice(0,6),data:{pasted:{id:item.id,n:items.indexOf(item)+1,previous:state.previous}}})});
 }
 if(want.action==='link'){
  const links=linksOf(items);const hit=links[want.n-1];
  if(!hit)return kit.reply(s,command,{by:BY,question:true,text:links.length?'В истории только '+links.length+' '+kit.plural(links.length,['ссылка','ссылки','ссылок'])+'.':'В истории буфера нет ссылок за последние 7 дней.'});
  return kit.reply(s,command,{by:BY,text:'Добавить ссылку '+hit.url+' в '+want.issue+' комментарием? Проверьте в карточке и нажмите кнопку — без нажатия ничего не отправлю.',
   data:card(s,'link',{items:[hit.item],data:{link:{issue:want.issue,url:hit.url,id:hit.item.id,n:want.n}}})});
 }
 if(want.action==='search'){
  const found=filter(search(items,want.query),want.kind);
  const text=found.length?'Нашёл в истории буфера про «'+want.query+'»: '+plural(found.length)+'. Самое свежее: '+preview(found[0])+'.'
   :'Про «'+want.query+'» в истории буфера за '+storage.DAYS+' дней ничего нет. Пароли и токены Петя не сохраняет — их там и не будет.';
  return kit.reply(s,command,{by:BY,text,data:card(s,'search',{items:found,data:{query:want.query}})});
 }
 const pool=filter(items,want.kind);
 return kit.reply(s,command,{by:BY,text:items.length?'В истории буфера '+plural(items.length)+' за '+storage.DAYS+' дней'+(pool.length!==items.length?', из них подходит '+pool.length:'')+'. Вернуть в буфер — кнопкой в строке или «вставь третье скопированное».':'История буфера пуста — скопируйте что-нибудь.',data:card(s,'list',{items:pool})});
}

const CONSENT='История буфера выключена. Включить? Петя будет запоминать скопированный текст и картинки только на этом компьютере (зашифровано, 7 дней или 200 записей) и пропускать пароли, токены и копии из менеджеров паролей.';
async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 state.services=s;
 const want=intent(text);
 if(want.action==='wipe'){
  const n=storeOf(s).list().length;
  return ask({text:'Стереть всю историю буфера ('+plural(n)+')? Это нельзя отменить.',label:BY,options:['Стереть всё','Отмена'],strictChoices:true},a=>{
   if(!/стереть/iu.test(String(a)))return kit.reply(s,command,{by:BY,text:'Хорошо, история буфера осталась.'});
   storeOf(s).wipe();return kit.reply(s,command,{by:BY,text:'История буфера стёрта.'+(enabled(s)?' Запоминание продолжается с этого момента.':''),data:card(s,'list')});
  });
 }
 if(want.action==='off'){enable(s,false);return kit.reply(s,command,{by:BY,text:'История буфера выключена. Сохранённое осталось на компьютере — «стереть всё» удалит его.',data:card(s,'list')});}
 if(want.action==='pause'){
  if(!enabled(s))return kit.reply(s,command,{by:BY,text:'История буфера и так выключена.'});
  s.saveSettings({clipboardPausedUntil:want.minutes?String(deps.now()+want.minutes*60000):'forever'});sync(s);
  return kit.reply(s,command,{by:BY,text:want.minutes?'История буфера на паузе на '+want.minutes+' мин.':'История буфера на паузе. Скажите «возобнови историю буфера», чтобы продолжить.',data:card(s,'list')});
 }
 if(want.action==='resume'){
  if(!enabled(s))return kit.reply(s,command,{by:BY,text:'История буфера выключена — включить её можно словами «включи историю буфера».'});
  s.saveSettings({clipboardPausedUntil:''});sync(s);return kit.reply(s,command,{by:BY,text:'История буфера снова запоминает копии.',data:card(s,'list')});
 }
 if(want.action==='on'&&enabled(s))return kit.reply(s,command,{by:BY,text:'История буфера уже включена.',data:card(s,'list')});
 if(!enabled(s)){
  const items=storeOf(s).list();
  // Already kept copies can still be searched and pasted while history is off; nothing new is added.
  if(want.action!=='on'&&items.length)return answer(s,command,want);
  return ask({text:CONSENT,label:BY,options:['Включить историю','Не сейчас'],strictChoices:true},a=>{
   if(!/включить/iu.test(String(a)))return kit.reply(s,command,{by:BY,text:'Хорошо, история буфера остаётся выключенной. Включить её можно в настройках приложения.'});
   enable(s,true);
   return kit.reply(s,command,{by:BY,text:'История буфера включена. Петя запомнит то, что вы скопируете с этого момента.',data:card(s,'list')});
  });
 }
 if(want.action==='on')return kit.reply(s,command,{by:BY,text:'История буфера уже включена.',data:card(s,'list')});
 return answer(s,command,want);
}

function setup(s){
 state.services=s;sync(s);
 // One timer for the app: a later company's setup replaces the earlier one.
 clearInterval(state.timer);
 const timer=deps.smoke()?null:setInterval(()=>{try{sync(state.services||s);}catch{/* settings changing */}},5000);timer?.unref?.();
 state.timer=timer;
 return {ipc:{
  status:()=>status(s),
  list(query,kind){const items=storeOf(s).list();const found=filter(query?search(items,String(query).slice(0,120)):items,kind==='text'||kind==='image'||kind==='link'?kind:'');return card(s,query?'search':'list',{items:found,data:query?{query:String(query).slice(0,120)}:{}}).clipboardHistory;},
  // «В буфер» on a row (the user pressed it).
  copy(id){const item=storeOf(s).get(String(id));if(!item)throw Error('Этой записи уже нет в истории.');write(s,item);return {copied:true,text:'В буфере: '+preview(item)};},
  copyLink(id,url){const item=storeOf(s).get(String(id));if(!item||item.kind!=='text'||!item.text.includes(String(url)))throw Error('Этой ссылки уже нет в истории.');deps.clipboard().writeText(String(url));state.watch?.settle();return {copied:true};},
  image(id){return 'data:image/png;base64,'+storeOf(s).image(String(id)).toString('base64');},
  remove(id){return {removed:storeOf(s).remove(String(id))};},
  enable:on=>enable(s,!!on),
  pause(minutes){if(!enabled(s))throw Error('История буфера выключена.');const m=Math.max(0,Math.min(24*60,Number(minutes)||0));s.saveSettings({clipboardPausedUntil:m?String(deps.now()+m*60000):'forever'});sync(s);return status(s);},
  resume(){s.saveSettings({clipboardPausedUntil:''});sync(s);return status(s);},
  // «Стереть всё» after the user confirmed it in the card or settings.
  wipe(){const n=storeOf(s).wipe();state.skipped={manager:0,secret:0};return {removed:n,...status(s)};}
 }};
}
function teardown(){clearInterval(state.timer);state.watch?.stop();state.watch=null;state.foreground?.stop?.();state.foreground=null;}
function validate(next){
 if(next.clipboardHistory!==undefined&&!['true','false'].includes(String(next.clipboardHistory)))next.clipboardHistory='false';
 const p=next.clipboardPausedUntil;if(p!==undefined&&p!==''&&p!=='forever'&&!/^\d{10,15}$/.test(String(p)))next.clipboardPausedUntil='';
 if(next.clipboardPrivateApps!==undefined)next.clipboardPrivateApps=String(next.clipboardPrivateApps).slice(0,4000);
}
module.exports={name:'clipboard',defaults:{['extension_'+ID]:'false',clipboardHistory:'false',clipboardPausedUntil:'',clipboardPrivateApps:''},validate,setup,turn,teardown,wanted,intent,ordinal,search,terms,linksOf,copied,sync,state,deps};
