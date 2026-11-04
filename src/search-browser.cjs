const {session}=require('electron');const BrowserWindow=require('./browser-window.cjs');
const {publicURL}=require('./public-web.cjs');
function linksFrom(snapshot){const rows=[];for(const item of snapshot.links||[]){try{let u=new URL(item.url);if(/(^|\.)google\.[a-z.]+$/i.test(u.hostname)&&u.pathname==='/url')u=new URL(u.searchParams.get('q')||u.searchParams.get('url'));u=publicURL(u.href);if(/(^|\.)(?:google\.[a-z.]+|googleusercontent.com|gstatic.com|youtube.com)$/i.test(u.hostname)||!item.title||rows.some(r=>r.url===u.href))continue;rows.push({url:u.href,title:item.title.slice(0,180)});}catch{}if(rows.length===5)break;}return rows;}
const snapshotScript=`(()=>({url:location.href,text:(document.body?.innerText||'').slice(0,60000),links:[...document.querySelectorAll('a')].filter(a=>a.querySelector('h3')).map(a=>({url:a.href,title:a.querySelector('h3').innerText}))}))()`;
class SearchBrowser{
 constructor({enabled,onAction,onReturn}){this.enabled=enabled;this.onAction=onAction;this.onReturn=onReturn;this.windows=new Set();}
 check(){if(!this.enabled())throw Error('Модуль поиска выключен.');}
 window(persistent){const partition=persistent?'persist:petya-web-search':'petya-web-read';const ses=session.fromPartition(partition);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);if(!this.sessions?.has(ses)){this.sessions ||= new Set();this.sessions.add(ses);ses.on('will-download',e=>e.preventDefault());}
  const win=new BrowserWindow({width:1150,height:850,show:false,skipTaskbar:true,title:'Петя · Поиск в интернете',autoHideMenuBar:true,webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});this.windows.add(win);if(persistent&&this.onAction)require('./browser-toolbar.cjs')(win,{label:'Поиск',actionLabel:'Продолжить поиск',onAction:this.onAction,onReturn:this.onReturn});win.webContents.setAudioMuted(true);win.webContents.on('page-title-updated',event=>event.preventDefault());win.webContents.on('did-navigate',(_event,url)=>{try{win.setTitle('Петя · '+new URL(url).origin);}catch{}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guard=(event,address)=>{try{publicURL(address);}catch{event.preventDefault();}};win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);win.on('closed',()=>this.windows.delete(win));return win;
 }
 async load(win,url){this.check();let timer;try{await Promise.race([(async()=>{try{await win.loadURL(publicURL(url).href);}catch(e){if(e.code!=='ERR_ABORTED'&&e.errno!==-3)throw e;while(!win.isDestroyed()&&win.webContents.isLoadingMainFrame())await new Promise(r=>setTimeout(r,200));if(win.isDestroyed())throw Error('Окно браузера закрыто.');}})(),new Promise((_,reject)=>{timer=setTimeout(()=>{if(!win.isDestroyed())win.webContents.stop();reject(Error('Страница не загрузилась за 25 секунд.'));},25000);})]);}finally{clearTimeout(timer);}this.check();}
 show(){this.check();if(this.browser&&!this.browser.isDestroyed()){this.browser.show();this.browser.focus();return;}this.browser=this.window(true);this.browser.show();return this.load(this.browser,'https://www.google.com/');}
 async search(query,resume=false){this.check();if(!this.browser||this.browser.isDestroyed()){this.browser=this.window(true);resume=false;}this.browser.show();
  if(!resume)await this.load(this.browser,'https://www.google.com/search?'+new URLSearchParams({q:query,hl:'ru'}));
  const snap=await this.browser.webContents.executeJavaScript(snapshotScript);const url=new URL(snap.url);
  if(!/(^|\.)google\.[a-z.]+$/i.test(url.hostname)||url.pathname!=='/search'||url.searchParams.get('q')!==query)throw this.attention('Вернитесь к выдаче Google для текущего вопроса, затем нажмите «Продолжить поиск».');
  const rows=linksFrom(snap);if(!rows.length)throw this.attention('Google пока не показал доступную выдачу. Проверьте окно браузера Пети: возможно, нужно принять условия или пройти CAPTCHA. Затем нажмите «Продолжить поиск».');return rows;
 }
 attention(message){const error=Error(message);error.code='BROWSER_ATTENTION';return error;}
 async read(url){this.check();const win=this.window(false);try{await this.load(win,url);const result=await win.webContents.executeJavaScript(`(()=>({url:location.href,text:(document.querySelector('main')||document.querySelector('article')||document.body)?.innerText?.slice(0,16000)||''}))()`);publicURL(result.url);this.check();return result;}finally{if(!win.isDestroyed())win.destroy();}}
 stop(){for(const win of this.windows)if(!win.isDestroyed())win.destroy();this.windows.clear();}
}
module.exports={SearchBrowser,linksFrom};
