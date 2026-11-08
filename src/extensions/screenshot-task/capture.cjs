// «Скриншот → задача»: a region of the screen. Uses Petya's own screen capture path (desktopCapturer with the macOS
// screen recording permission flow of src/computer-setup.cjs): the display under the cursor is taken at full
// resolution, shown in a frameless picker window (region.html) where the user drags a rectangle, and cropped.
// Petya's own window steps aside while the screen is taken, and comes back after.
const path=require('node:path');

const PERMISSION_TEXT='Чтобы снять экран, разрешите Пете запись экрана: я открыл «Системные настройки → Конфиденциальность и безопасность → Запись экрана». Включите там Петю и повторите.';
// region.html has no preload and does not load the DOM translator: its hint arrives translated in the URL hash.
const HINT='Выделите область · Enter — весь экран · Esc — отмена';
function regionHash(language=require('../../interface-language.cjs')){
 return 'hint='+encodeURIComponent(language.t(HINT))+'&lang='+encodeURIComponent(language.state().language);
}

// Crop rectangle in image pixels from the picker's CSS rectangle (clamped to the image).
function cropRect(r,{scaleX,scaleY,width,height}){
 const x=Math.max(0,Math.round(r.x*scaleX)),y=Math.max(0,Math.round(r.y*scaleY));
 return {x,y,width:Math.max(1,Math.min(width-x,Math.round(r.w*scaleX))),height:Math.max(1,Math.min(height-y,Math.round(r.h*scaleY)))};
}
const parseAnswer=title=>{
 const v=String(title||'');if(!v.startsWith('petya-region:'))return null;
 const rest=v.slice(13);if(rest==='cancel'||rest==='full')return {kind:rest};
 try{const r=JSON.parse(rest);if([r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0)return {kind:'rect',rect:r};}catch{/* not ours */}
 return {kind:'cancel'};
};

function permitted(electron,platform=process.platform){return platform!=='darwin'||electron.systemPreferences.getMediaAccessStatus('screen')==='granted';}
// Asks macOS once (getSources shows the system prompt) and opens the privacy pane when still not allowed.
async function ensurePermission(electron,{platform=process.platform,smoke=false}={}){
 if(permitted(electron,platform))return true;
 await electron.desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1,height:1}}).catch(()=>{});
 if(permitted(electron,platform))return true;
 if(!smoke)await electron.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch(()=>{});
 return false;
}

// The picker window; resolves with {kind:'rect',rect}|{kind:'full'}|{kind:'cancel'}.
function pick(electron,display,imageUrl,{timeout=120000}={}){
 return new Promise(resolve=>{
  const b=display.bounds;
  const win=new electron.BrowserWindow({x:b.x,y:b.y,width:b.width,height:b.height,frame:false,show:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,enableLargerThanScreen:true,backgroundColor:'#000000',
   webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});
  win.setAlwaysOnTop(true,'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true,{visibleOnFullScreen:true});
  let settled=false;
  const finish=answer=>{if(settled)return;settled=true;clearTimeout(timer);if(!win.isDestroyed())win.destroy();resolve(answer);};
  const timer=setTimeout(()=>finish({kind:'cancel'}),timeout);
  win.webContents.on('page-title-updated',(e,title)=>{const a=parseAnswer(title);if(a)finish(a);});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('closed',()=>finish({kind:'cancel'}));
  win.loadFile(path.join(__dirname,'region.html'),{hash:regionHash()}).then(()=>win.webContents.executeJavaScript('window.petyaShot('+JSON.stringify(imageUrl)+')')).then(()=>{win.show();win.focus();}).catch(()=>finish({kind:'cancel'}));
 });
}

// The whole flow: permission, step aside, take the display, pick, crop. Returns {png, width, height} or
// {cancelled:true} or {permission:false, text}.
async function captureRegion({electron=require('electron'),win,platform=process.platform,smoke=false,picker=pick,delay=350,context=null}={}){
 if(!await ensurePermission(electron,{platform,smoke}))return {permission:false,text:PERMISSION_TEXT};
 const {screen,desktopCapturer}=electron;
 const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
 const hidden=!!(win&&!win.isDestroyed()&&win.isVisible()&&win.isFocused());
 if(hidden){win.hide();await new Promise(r=>setTimeout(r,delay));}
 try{
  // What is in front once Petya stepped aside (app and window title), read before the picker covers it.
  const window=context?await Promise.resolve().then(context).catch(()=>null):null;
  const sf=display.scaleFactor||1,size={width:Math.round(display.bounds.width*sf),height:Math.round(display.bounds.height*sf)};
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:size});
  const source=sources.find(x=>String(x.display_id)===String(display.id))||sources[0];
  if(!source||source.thumbnail.isEmpty())return {permission:false,text:PERMISSION_TEXT};
  const image=source.thumbnail,real=image.getSize();
  const answer=await picker(electron,display,image.toDataURL());
  if(answer.kind==='cancel')return {cancelled:true};
  const cropped=answer.kind==='full'?image:image.crop(cropRect(answer.rect,{scaleX:real.width/display.bounds.width,scaleY:real.height/display.bounds.height,width:real.width,height:real.height}));
  const out=cropped.getSize();
  return {png:cropped.toPNG(),width:out.width,height:out.height,window:window||{app:'',title:''}};
 }finally{if(hidden&&!win.isDestroyed()){win.show();win.focus();}}
}
module.exports={captureRegion,pick,cropRect,parseAnswer,ensurePermission,regionHash,PERMISSION_TEXT,HINT};
