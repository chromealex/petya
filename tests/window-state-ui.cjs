const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,screen}=require('electron');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-window-state-'));app.setPath('userData',root);
const feature=require('../src/features/window-state.cjs');
app.whenReady().then(async()=>{
 const make=()=>new BrowserWindow({show:false,width:1180,height:840,minWidth:880,minHeight:640});
 let first,second;
 try{
  const expected=feature.fit({x:55,y:65,width:950,height:690},screen.getAllDisplays());
  first=make();feature.setup({win:first});first.setBounds(expected);first.show();
  first.on('close',e=>{e.preventDefault();first.hide();});first.close();assert(!first.isVisible());first.show();assert.deepEqual(first.getBounds(),expected);
  first.hide();assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'window-state.json'))).bounds,expected);first.destroy();
  second=make();feature.setup({win:second});assert.deepEqual(second.getBounds(),expected);second.show();assert.deepEqual(second.getBounds(),expected);
  assert.deepEqual(feature.fit({x:99999,y:-99999,width:2000,height:2000},[{workArea:{x:0,y:0,width:1200,height:800}}]),{x:0,y:0,width:1200,height:800});
  console.log('Window state: close to tray, reopen, recreated window and disconnected display bounds passed');
 }finally{if(first&&!first.isDestroyed())first.destroy();if(second&&!second.isDestroyed())second.destroy();fs.rmSync(root,{recursive:true,force:true});}
 app.exit(0);
}).catch(e=>{console.error(e);fs.rmSync(root,{recursive:true,force:true});app.exit(1);});
