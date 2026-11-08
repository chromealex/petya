const {session}=require('electron');const BrowserWindow=require('./browser-window.cjs');
const {publicURL}=require('./public-web.cjs');
const configuredSessions=new WeakSet();
function linksFrom(snapshot){const rows=[];for(const item of snapshot.links||[]){try{let u=new URL(item.url);if(/(^|\.)google\.[a-z.]+$/i.test(u.hostname)&&u.pathname==='/url')u=new URL(u.searchParams.get('q')||u.searchParams.get('url'));u=publicURL(u.href);if(/(^|\.)(?:google\.[a-z.]+|googleusercontent.com|gstatic.com|youtube.com)$/i.test(u.hostname)||!item.title||rows.some(r=>r.url===u.href))continue;rows.push({url:u.href,title:item.title.slice(0,180)});}catch{}if(rows.length===5)break;}return rows;}
// Google changes its markup: take result links with a heading first, then any external link of the results area.
const snapshotScript=`(()=>{const area=document.querySelector('#rso')||document.querySelector('#search')||document.body;const seen=new Set();const links=[];
 for(const a of [...area.querySelectorAll('a[href]')]){const h=a.querySelector('h3,[role=heading]');const title=(h?.innerText||a.innerText||'').trim().split('\\n')[0];if(!title||title.length<4||seen.has(a.href))continue;seen.add(a.href);links.push({url:a.href,title,heading:!!h});}
 links.sort((x,y)=>Number(y.heading)-Number(x.heading));
 return {url:location.href,text:(document.body?.innerText||'').slice(0,60000),links};})()`;
// A real check from Google: the «sorry» page, a CAPTCHA frame, the consent page or a sign-in.
const blocked=snap=>{try{const u=new URL(snap.url);if(/^\/sorry\//.test(u.pathname)||/(^|\.)consent\.google\./.test(u.hostname)||/(^|\.)accounts\.google\./.test(u.hostname))return true;}catch{}return /(?:unusual traffic|необычн\p{L}* трафик|не робот|I'm not a robot|recaptcha|Прежде чем перейти к Google|Before you continue to Google)/iu.test(snap.text||'');};
// The useful part of a results page: the text after the search box, without Google's menus and footer.
function resultsText(text,query){
 const lines=String(text||'').split('\n').map(s=>s.trim()).filter(s=>s.length>1);
 const skip=/^(?:Все|Картинки|Видео|Новости|Покупки|Карты|Книги|Ещё|Инструменты|Режим ИИ|Войти|Настройки|Справка|Конфиденциальность|Условия|All|Images|Videos|News|Shopping|Maps|Books|More|Tools|AI Mode|Sign in|Settings|Help|Privacy|Terms|Feedback|Отзыв)$/iu;
 const kept=lines.filter(s=>!skip.test(s)&&s!==query);
 const body=kept.join('\n');
 return body.length>=300?body.slice(0,10000):'';
}
class SearchBrowser{
 constructor({enabled,onAction,onReturn,dataRoot}){this.dataRoot=dataRoot;this.enabled=enabled;this.onAction=onAction;this.onReturn=onReturn;this.windows=new Set();}
 check(){if(!this.enabled())throw Error('Модуль поиска выключен.');}
 window(persistent){const ses=require('./company-browser-session.cjs').companySession(session,this.dataRoot,persistent?'petya-web-search':'petya-web-read',persistent);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);if(!configuredSessions.has(ses)){configuredSessions.add(ses);ses.on('will-download',e=>e.preventDefault());}
  const win=new BrowserWindow({width:1150,height:850,show:false,skipTaskbar:true,title:'Петя · Поиск в интернете',autoHideMenuBar:true,webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});this.windows.add(win);if(persistent&&this.onAction)require('./browser-toolbar.cjs')(win,{label:'Поиск',actionLabel:'Продолжить поиск',onAction:this.onAction,onReturn:this.onReturn});win.webContents.setAudioMuted(true);win.webContents.on('page-title-updated',event=>event.preventDefault());win.webContents.on('did-navigate',(_event,url)=>{try{win.setTitle('Петя · '+new URL(url).origin);}catch{}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guard=(event,address)=>{try{publicURL(address);}catch{event.preventDefault();}};win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);win.on('closed',()=>this.windows.delete(win));return win;
 }
 async load(win,url){this.check();let timer;try{await Promise.race([(async()=>{try{await win.loadURL(publicURL(url).href);}catch(e){if(e.code!=='ERR_ABORTED'&&e.errno!==-3)throw e;while(!win.isDestroyed()&&win.webContents.isLoadingMainFrame())await new Promise(r=>setTimeout(r,200));if(win.isDestroyed())throw Error('Окно браузера закрыто.');}})(),new Promise((_,reject)=>{timer=setTimeout(()=>{if(!win.isDestroyed())win.webContents.stop();reject(Error('Страница не загрузилась за 25 секунд.'));},25000);})]);}finally{clearTimeout(timer);}this.check();}
 show(){this.check();if(this.browser&&!this.browser.isDestroyed()){this.browser.show();this.browser.focus();return;}this.browser=this.window(true);this.browser.show();return this.load(this.browser,'https://www.google.com/');}
 // The search runs in a hidden window; it is shown only while Google asks for a check (CAPTCHA, consent, sign-in).
 async search(query,resume=false){this.check();if(!this.browser||this.browser.isDestroyed()){this.browser=this.window(true);resume=false;}
  if(!resume)await this.load(this.browser,'https://www.google.com/search?'+new URLSearchParams({q:query,hl:'ru'}));
  const snap=await this.browser.webContents.executeJavaScript(snapshotScript);const url=new URL(snap.url);
  if(!/(^|\.)google\.[a-z.]+$/i.test(url.hostname)||url.pathname!=='/search'||url.searchParams.get('q')!==query)throw this.attention('Вернитесь к выдаче Google для текущего вопроса, затем нажмите «Продолжить поиск».');
  if(blocked(snap)){this.browser.show();this.browser.focus();throw this.attention('Google просит проверку: пройди её в окне браузера Пети, и поиск продолжится («Продолжить поиск»).');}
  let rows=linksFrom(snap);
  // No check and no results in Google's markup: the same query in DuckDuckGo's plain results, still hidden.
  if(!rows.length)rows=await this.duck(query).catch(()=>[]);
  // Google often answers on the results page itself (its overview and the snippets): that text is a source too.
  const page=resultsText(snap.text,query);
  if(page)rows=[{url:snap.url,title:'Выдача Google: '+query.slice(0,120),text:page},...rows].slice(0,6);
  if(!rows.length)throw Error('Google и DuckDuckGo ничего не нашли по запросу «'+query+'». Попробуй сформулировать иначе.');
  if(this.browser.isVisible())this.browser.hide();return rows;
 }
 async duck(query){const win=this.window(false);try{await this.load(win,'https://html.duckduckgo.com/html/?'+new URLSearchParams({q:query,kl:'ru-ru'}));const snap=await win.webContents.executeJavaScript(`(()=>({links:[...document.querySelectorAll('a.result__a')].map(a=>({url:a.href,title:a.innerText}))}))()`);
  return (snap.links||[]).map(l=>{try{const u=new URL(l.url);const real=u.searchParams.get('uddg');return {url:publicURL(real||l.url).href,title:String(l.title||'').slice(0,180)};}catch{return null;}}).filter(l=>l&&l.title&&!/duckduckgo\.com$/i.test(new URL(l.url).hostname)).slice(0,5);}finally{if(!win.isDestroyed())win.destroy();}}
 attention(message){const error=Error(message);error.code='BROWSER_ATTENTION';return error;}
 async read(url){this.check();const win=this.window(false);try{await this.load(win,url);const result=await win.webContents.executeJavaScript(`(()=>({url:location.href,text:(document.querySelector('main')||document.querySelector('article')||document.body)?.innerText?.slice(0,16000)||''}))()`);publicURL(result.url);this.check();return result;}finally{if(!win.isDestroyed())win.destroy();}}
 stop(){for(const win of this.windows)if(!win.isDestroyed())win.destroy();this.windows.clear();}
}
module.exports={SearchBrowser,linksFrom,resultsText,blocked:snap=>blocked(snap)};
