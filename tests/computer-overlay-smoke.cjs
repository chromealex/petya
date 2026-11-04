const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {ComputerOverlay}=require('../src/computer-overlay.cjs');
app.whenReady().then(async()=>{
 app.dock?.hide();const overlay=new ComputerOverlay({BrowserWindow,screen});
 try{
 const bounds=screen.getPrimaryDisplay().bounds;
 await overlay.begin({type:'search'});overlay.update({window:{x:bounds.x+100,y:bounds.y+100,width:800,height:600,name:'Telegram'},pointer:{x:bounds.x+350,y:bounds.y+300}});
 await new Promise(r=>setTimeout(r,300));
 for(const kind of ['cursor','badge']){const win=overlay.windows[kind];assert.equal(win.isFocused(),false);assert.equal(win.isVisible(),true);const image=await win.webContents.capturePage();fs.writeFileSync('/tmp/petya-control-'+kind+'.png',image.toPNG());}
 assert.match(await overlay.windows.badge.webContents.executeJavaScript('document.body.innerText'),/Telegram/);
 overlay.finish(true);assert.equal(overlay.active,false);overlay.clear();assert.equal(overlay.windows.badge.isVisible(),false);
 console.log('Overlay UI: rendered cursor and badge, no focus, hide on stop passed');overlay.dispose();app.exit(0);
 }catch(e){console.error(e);overlay.dispose();app.exit(1);}
});
