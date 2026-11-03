const {app}=require('electron');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-web-test-'));app.setPath('userData',dir);
app.whenReady().then(async()=>{const {SearchBrowser}=require('../src/search-browser.cjs');const browser=new SearchBrowser({enabled:()=>true});try{try{const links=await browser.search('Electron Tray documentation');if(!links.length)throw Error('No search results');console.log('Google browser search: '+links.length+' public results');}catch(e){if(e.code!=='BROWSER_ATTENTION')throw e;console.log('Google browser attention flow verified: '+e.code);}
 const page=await browser.read('https://www.electronjs.org/docs/latest/api/tray');if(!page.text.includes('Tray'))throw Error('Public page not read');console.log('Chromium reader: official Electron documentation read');browser.stop();app.exit(0);
}catch(e){console.error(e.message);browser.stop();app.exit(1);}});
app.on('quit',()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}});
