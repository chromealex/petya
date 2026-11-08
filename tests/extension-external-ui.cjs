// Installing an extension without rebuilding Petya, in the real window: the review dialog (warning, confirmation),
// the catalog's «Сторонние» filter, the extension's card in the chat loaded through petya-ext://, refused paths
// (other ids, main-process files, traversal, direct file:// loads), removal with confirmation, and the development
// folder reloading the card on save and reporting a broken file. Screenshots: petya-extension-*.png in the temp folder.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fixture=path.join(__dirname,'fixtures/extensions/word-count');
const cardShot=require('./card-shot.cjs');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,tries=150)=>{for(let i=0;i<tries;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 const shot=async name=>{win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(300);const file=path.join(os.tmpdir(),name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());return file;};
 const snap=async(selector,name)=>{const file=await cardShot(win,selector,name);await js("document.getElementById('card-shot')?.remove()");return file;};
 const {app}=require('electron');
 const root=path.join(app.getPath('userData'),'extensions');
 await js('window.chatNavigationReady');win.setContentSize(1280,860);win.showInactive();

 // Catalog: «Установить из файла…» with folder and archive choices.
 await js('window.openAppCatalog()');await wait("document.querySelectorAll('.app-catalog-group').length>3");
 assert.equal(await js("document.querySelector('.app-catalog-install').textContent"),'Установить из файла…');
 await js("document.querySelector('.app-catalog-install').click()");
 assert.deepEqual(await js("[...document.querySelectorAll('.app-catalog-file-menu button')].map(b=>b.dataset.kind)"),['zip','folder']);
 await js("document.querySelector('.app-catalog-install').click()");
 assert.equal(await js("!!document.querySelector('.app-rail-item[data-filter=external]')"),false,'no «Сторонние» before anything is installed');
 await js("document.querySelector('dialog.app-catalog').close()");

 // Review dialog: everything declared, a strong warning, install only after the box is checked.
 await js(`window.petya.feature('extensionUI','inspectPath',${JSON.stringify(fixture)}).then(r=>{window.__review=r;window.__installed=window.reviewExtension(r);})`);
 await wait("!!document.querySelector('dialog.extension-review[open]')");
 const text=await js("document.querySelector('.extension-review').innerText");
 for(const part of ['Счётчик слов','word-count','1.0.0','Петя · пример','Документы и знания','Полный доступ к компьютеру и данным','feature.cjs','Файлы'])assert(text.includes(part),'review shows '+part);
 assert.equal(await js("document.querySelector('.extension-review [data-action=install]').disabled"),true,'install needs the confirmation box');
 assert.equal(fs.existsSync(path.join(root,'word-count')),false,'nothing installed during review');
 const review=await shot('petya-extension-review');
 await js("document.querySelector('#extension-review-consent').click()");
 assert.equal(await js("document.querySelector('.extension-review [data-action=install]').disabled"),false);
 await js("document.querySelector('.extension-review [data-action=install]').click()");
 await wait("!document.querySelector('dialog.extension-review')");
 const result=await js('window.__installed');
 assert.equal(result.id,'word-count');assert.equal(result.restart,false);
 assert(fs.existsSync(path.join(root,'word-count','feature.cjs')),'installed into <userData>/extensions/<id>');

 // The catalog lists it under «Сторонние» with its mark, version, folder and removal.
 await js('window.openAppCatalog()');await wait("!!document.querySelector('.app-rail-item[data-filter=external]')");
 await js("document.querySelector('.app-rail-item[data-filter=external]').click()");
 assert.deepEqual(await js("[...document.querySelectorAll('.app-tile')].map(t=>t.dataset.app)"),['word-count']);
 assert.equal(await js("document.querySelector('.app-tile[data-app=word-count] .app-origin').textContent"),'Стороннее');
 assert.equal(await js("document.querySelector('.app-tile[data-app=word-count]').dataset.state"),'added');
 await js("document.querySelector('.app-tile[data-app=word-count] .app-tile-main').click()");await wait("!document.querySelector('.app-catalog-details').hidden");
 const details=await js("document.querySelector('.app-catalog-details').innerText");
 assert(details.includes('Версия 1.0.0')&&details.includes('Открыть папку'));
 assert.equal(await js("!!document.querySelector('.app-details-external button.delete-button')"),true,'removal is a red trash button');
 const catalogShot=await shot('petya-extension-catalog');
 await js("document.querySelector('dialog.app-catalog').close()");

 // Its card in the chat: scripts and styles come only through petya-ext://.
 const data={total:9,unique:6,top:[{word:'мыла',count:2},{word:'мама',count:1},{word:'раму',count:1},{word:'рама',count:1},{word:'маму',count:1},{word:'<img src=x onerror=alert(1)>',count:1}]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'Посчитай слова: …'},{role:'assistant',text:'Слов: 9, разных: 6.',by:'Счётчик слов',extensionData:{wordCard:${JSON.stringify(data)}}}],'Слова')`);
 await wait("document.querySelectorAll('.word-card').length===1");
 assert.equal(await js("document.querySelectorAll('.word-bars li').length"),6);
 assert.equal(await js("document.querySelectorAll('.word-card img').length"),0,'words are text, never HTML');
 assert.equal(await js("[...document.scripts].some(s=>s.src.startsWith('petya-ext://word-count/word-cards.js'))"),true);
 assert.equal(await js("getComputedStyle(document.querySelector('.word-bar')).backgroundColor"),'rgb(201, 237, 157)','its stylesheet loaded through the scheme');
 const card=await snap('.word-card','petya-extension-card');

 // Refused: main-process files, other ids, bundled files, traversal; direct file:// loads of installed code.
 // (the page itself may not fetch the scheme at all: connect-src stays 'self'; the main process checks statuses)
 assert.equal(await js("fetch('petya-ext://word-count/word-cards.js').then(()=>'read',()=>'refused')"),'refused');
 const status=url=>require('electron').net.fetch(url).then(r=>r.status,()=>0);
 const scriptLoads=url=>js(`new Promise(r=>{const s=document.createElement('script');s.src=${JSON.stringify(url)};s.onload=()=>r(true);s.onerror=()=>r(false);document.body.append(s);})`);
 assert.equal(await scriptLoads('petya-ext://word-count/feature.cjs'),false,'main-process code is not served to the page');
 assert.equal(await scriptLoads('petya-ext://regex-cron/regex-cards.js'),false,'the scheme serves no bundled files');
 assert.equal(await status('petya-ext://word-count/word-cards.js'),200);
 for(const url of ['petya-ext://word-count/feature.cjs','petya-ext://word-count/offer.cjs','petya-ext://regex-cron/regex-cards.js','petya-ext://word-count/%2e%2e/%2e%2e/settings.json','petya-ext://word-count/..%2f..%2fsettings.json','petya-ext://nope/a.js'])assert.notEqual(await status(url),200,'refused '+url);
 const direct='file://'+path.join(root,'word-count','word-cards.js');
 assert.equal(await js(`new Promise(r=>{const s=document.createElement('script');s.src=${JSON.stringify(direct)};s.onload=()=>r('loaded');s.onerror=()=>r('blocked');document.body.append(s);})`),'blocked','installed code is never loaded from disk directly');
 assert.equal(await js(`window.extensionHost.allowed(${JSON.stringify(direct)})`),false);
 assert.equal(await js("window.extensionHost.allowed('https://example.com/x.js')"),false);

 // Removal: inline confirmation, then the files and the catalog entry are gone, the scheme stops serving it.
 await js('window.openAppCatalog()');await wait("!!document.querySelector('.app-rail-item[data-filter=external]')");
 await js("document.querySelector('.app-rail-item[data-filter=external]').click()");
 await js("document.querySelector('.app-tile[data-app=word-count] .app-tile-main').click()");await wait("!document.querySelector('.app-catalog-details').hidden");
 await js("document.querySelector('.app-details-external button.delete-button').click()");
 await wait("!!document.querySelector('.app-details-confirm')");
 assert(fs.existsSync(path.join(root,'word-count')),'asks before deleting');
 const confirmShot=await shot('petya-extension-remove');
 await js("document.querySelector('.app-details-confirm [data-action=confirm-remove]').click()");
 await wait("!document.querySelector('.app-tile[data-app=word-count]')");
 assert.equal(fs.existsSync(path.join(root,'word-count')),false);
 assert.equal(await status('petya-ext://word-count/word-cards.js'),404);
 await js("document.querySelector('dialog.app-catalog').close()");

 // Development folder: loaded in place as «Разработка», reloaded when a file is saved.
 const dev=fs.mkdtempSync(path.join(os.tmpdir(),'petya-dev-ext-'));fs.cpSync(fixture,dev,{recursive:true});
 await js(`window.petya.feature('extensionUI','setDevFolderPath',${JSON.stringify(dev)})`);
 assert.equal((await js("window.petya.feature('extensionUI','devStatus')")).id,'word-count');
 await js("view('settings')");await wait("document.querySelector('#extension-development')?.innerText.includes('word-count')");
 const settingsShot=await snap('#extension-development','petya-extension-dev-settings');
 await js(`view('home');showDialogueMessages([{role:'assistant',text:'Слов: 9.',by:'Счётчик слов',extensionData:{wordCard:${JSON.stringify(data)}}}],'Слова')`);
 await wait("document.querySelectorAll('.word-card').length===1");
 assert.equal(await js("document.querySelector('.word-card').innerText.includes('готово')"),true);
 fs.writeFileSync(path.join(dev,'word-cards.js'),fs.readFileSync(path.join(dev,'word-cards.js'),'utf8').replace("label:'готово'","label:'обновлено'"));
 await wait("!!document.querySelector('.word-card')&&document.querySelector('.word-card').innerText.includes('обновлено')",200);
 const reloaded=await snap('.word-card','petya-extension-dev-reloaded');
 // A broken main-process file: a notification with the file, Petya keeps running.
 fs.writeFileSync(path.join(dev,'feature.cjs'),'module.exports={name:"wordCount",\n setup(){ return {;}\n};');
 await wait("[...document.querySelectorAll('.notification-item')].some(n=>n.dataset.kind==='error'&&n.innerText.includes('feature.cjs'))",200);
 assert.equal(await js("[...document.querySelectorAll('.notification-item[data-kind=error] button')].some(b=>b.textContent==='Открыть папку')"),true,'the error offers its folder');
 // (onboarding covers the first-run window: the notification card is captured on its own)
 const errorShot=await snap('.notification-item[data-kind=error]','petya-extension-dev-error');
 await js("window.petya.feature('extensionUI','clearDevFolder')");
 fs.rmSync(dev,{recursive:true,force:true});

 console.log('Screenshots:',[review,catalogShot,card,confirmShot,settingsShot,reloaded,errorShot].join(' '));
 console.log('External extension UI: review with warning and confirmation, «Сторонние» in the catalog, card through petya-ext://, refused paths and direct loads, removal with confirmation, development reload and error notification passed');
}};
require('../src/main.cjs');
