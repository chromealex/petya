// A dashboard widget from a web page (source {kind:'web', url, query}): for services Petya has no app for
// (an analytics site, an internal admin page). The page opens hidden in the chat browser's session — where the
// person signed in — its visible text is read, and the figures the widget asks for are picked out by the local
// model; without a model the page's own text is shown. A sign-in page is reported, never filled in.
const SIGN_IN=/(?:^|\/)(?:login|log-in|signin|sign-in|sign_in|auth|sso|oauth|account\/login)(?:[/?#.]|$)/i;

async function readPage(s,url,{timeoutMs=30000,settle=2500}={}){
 const {BrowserWindow,session}=require('electron');
 const ses=require('./company-browser-session.cjs').companySession(session,s.dataRoot,s.chatBrowser?.WEB||'petya-web-search',true);
 const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 try{
  let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Страница не открылась за '+Math.round(timeoutMs/1000)+' с.')),timeoutMs);});
  try{await Promise.race([win.loadURL(url),timeout]);}finally{clearTimeout(timer);}
  // Dashboards draw their numbers after the page loads: give scripts a moment.
  await new Promise(r=>setTimeout(r,settle));
  return await win.webContents.executeJavaScript(`(()=>({url:location.href,title:document.title,password:!!document.querySelector('input[type=password]'),
   text:(document.querySelector('main')||document.body)?.innerText?.replace(/\\n{3,}/g,'\\n\\n').slice(0,20000)||''}))()`,true);
 }finally{if(!win.isDestroyed())win.destroy();}
}
const signIn=page=>!!page&&(page.password||SIGN_IN.test(new URL(page.url).pathname));

// The figures for the widget's question, as «Название: значение» lines taken from the page.
async function summarize(s,query,page){
 const text=String(page.text||'').trim();if(!text)throw Error('На странице нет текста — возможно, данные ещё грузятся.');
 if(!s.settings?.model)return text.slice(0,1500);
 try{
  const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,options:{temperature:0,num_predict:500},messages:[
   {role:'system',content:'Из текста веб-страницы выпиши показатели, которые относятся к запросу. Каждая строка: «Название: значение» (с единицами и периодом, если они есть). Только то, что есть в тексте, ничего не придумывай. Не больше 12 строк. Если подходящих показателей нет, ответь одним словом: НЕТ.'},
   {role:'user',content:'Запрос: '+String(query||'основные показатели').slice(0,300)+'\n\nСтраница «'+String(page.title||'').slice(0,200)+'»:\n'+text.slice(0,12000)}]})});
  const out=String(response?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
  if(!out||/^нет\.?$/iu.test(out))return text.slice(0,1500);
  return out.slice(0,2000);
 }catch{return text.slice(0,1500);}
}

async function load(s,src,{read=readPage}={}){
 const page=await read(s,src.url);
 const host=(()=>{try{return new URL(page.url).host;}catch{return src.url;}})();
 if(signIn(page))throw Error('Нужно войти на '+host+': «Открыть в браузере» в меню виджета, войдите — дальше данные будут браться оттуда.');
 return {data:null,text:await summarize(s,src.query,page)};
}
module.exports={load,readPage,signIn,summarize,SIGN_IN};
