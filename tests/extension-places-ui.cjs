// Places apps add to Petya's interface (extension.json "ui", src/ui/extension-places.js, src/ui/page-tabs.js), in the
// real window with two installed fixture apps (tests/fixtures/extensions/ui-notes, ui-tips):
//  - the review dialog lists the rail item and the tabs an app adds;
//  - «Заметки» appears in the rail right after «Команда», opens its page (renderer through petya-ext://, IPC, onShow),
//    survives a window reload and disappears when the app is removed (an open page goes back to the previous one);
//  - «Подсказки» from ui-notes and «подсказки» from ui-tips are one tab on «Навыки» with a section per app (icon and
//    name headers, stable order); turning one app off or removing it leaves one section; removing both removes the tab;
//  - a tab on another app's page, a tab on «Команда» next to the page's own content;
//  - declarations that cannot be used: an unknown page (tab skipped) and a page id taken by another app (refused),
//    with clear errors in the dev console;
//  - the «Напоминания» tab of the reminders app on «Навыки» (on while the app is added, gone when it is off).
// Screenshots (temp folder, petya-places-*.png; with PETYA_INTERFACE_LANGUAGE=en the English ones, -en): wide rail,
// compact rail and a narrow window.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fixtures=path.join(__dirname,'fixtures/extensions');
const en=process.env.PETYA_INTERFACE_LANGUAGE==='en',suffix=en?'-en':'';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,tries=150)=>{for(let i=0;i<tries;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code+'\n'+JSON.stringify(await js("window.petyaTabs?.info('learning')")));};
 const clean=()=>js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove());document.getElementById('notice')?.setAttribute('hidden','');document.querySelectorAll('.ux-page-status').forEach(n=>n.hidden=true)");
 const shots=[];
 const shot=async(name,{rail='wide',size=[1280,860]}={})=>{
  win.setContentSize(...size);await clean();
  await js(`document.body.classList.toggle('rail-expanded',${rail==='wide'});document.querySelector('.notification-center,.notifications-panel')?.removeAttribute('open')`);
  win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(350);
  const file=path.join(os.tmpdir(),'petya-places-'+name+suffix+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());shots.push(file);return file;
 };
 const consoleLines=[];
 win.webContents.on('console-message',(event,...args)=>consoleLines.push(String(event?.message??args[1]??'')));
 const {app}=require('electron');const root=path.join(app.getPath('userData'),'extensions');
 const install=async dir=>{const review=await js(`window.petya.feature('extensionUI','inspectPath',${JSON.stringify(dir)})`);const result=await js(`window.petya.feature('extensionUI','installReviewed',${JSON.stringify(review.token)},true)`);assert.equal(result.restart,false);await js(`window.extensionHost.installed(${JSON.stringify(review.id)})`);return review;};
 const removeFiles=async id=>{await js(`window.petya.feature('extensionUI','removeExternal',${JSON.stringify(id)}).then(()=>window.extensionHost.refresh()).then(()=>document.dispatchEvent(new Event('petya-extensions-changed')))`);};
 const settle=()=>js('new Promise(r=>{const go=()=>window.extensionPlaces.sync().then(()=>setTimeout(r,120));go();})');
 const learningTabs=()=>js("[...document.querySelectorAll('#learning .page-tabs button')].map(b=>b.dataset.tabKey)");
 // The tab key is the name as shown (after translation): an installed app's own locales/en.json counts too.
 let tipsKey='';const keyOfTips=async()=>{tipsKey=await js("window.petyaTabs.key('Подсказки')");return tipsKey;};
 await js('window.chatNavigationReady');win.setContentSize(1280,860);win.showInactive();await clean();

 // Review: the rail item and the tabs are listed before anything is installed.
 const notesDir=path.join(fixtures,'ui-notes'),tipsDir=path.join(fixtures,'ui-tips');
 await js(`window.petya.feature('extensionUI','inspectPath',${JSON.stringify(notesDir)}).then(r=>{window.__installed=window.reviewExtension(r);})`);
 await wait("!!document.querySelector('dialog.extension-review[open]')");
 const review=await js("document.querySelector('.extension-review').innerText");
 for(const part of en?['Left menu items','Tabs on pages','Заметки']:['Пункты меню слева','Заметки','Вкладки на страницах','Навыки → Подсказки','Команда → Заметки о команде'])assert(review.includes(part),'the review lists '+part+'\n'+review);
 await shot('review');
 await js("document.querySelector('#extension-review-consent').click();document.querySelector('.extension-review [data-action=install]').click()");
 await wait("!document.querySelector('dialog.extension-review')");await js('window.__installed');
 await settle();

 // The rail item: right after «Команда», with its own stroke icon and label; opens the page drawn by the app.
 await wait("!!document.querySelector('aside nav .nav[data-view=\"ext-notes\"]')");
 assert.equal(await js("document.querySelector('aside nav .nav[data-view=\"ext-notes\"]').previousElementSibling.dataset.view"),'team');
 assert.equal(await js("!!document.querySelector('aside nav .nav[data-view=\"ext-notes\"] svg.nav-icon')"),true);
 await js("document.querySelector('aside nav .nav[data-view=\"ext-notes\"]').click()");
 await wait("document.body.dataset.view==='ext-notes'&&!!document.querySelector('#ext-notes .notes-card')");
 assert.equal(await js("document.querySelectorAll('#ext-notes .notes-list li').length"),3,'drawn from the app IPC');
 assert.equal(await js("[...document.scripts].some(s=>s.src.startsWith('petya-ext://ui-notes/notes-ui.js'))"),true,'loaded through petya-ext://');
 // onShow: every opening of the page lets the app refresh.
 const times=()=>js("Number(document.querySelector('#ext-notes .notes-shown').textContent.match(/\\d+$/)?.[0]||0)");
 await wait("/\\d$/.test(document.querySelector('#ext-notes .notes-shown').textContent)");await sleep(200);const before=await times();
 await js("view('home')");await js("document.querySelector('aside nav .nav[data-view=\"ext-notes\"]').click()");
 await sleep(300);assert.equal(await times(),before+1,'onShow ran again');
 assert.equal(await js("document.querySelector('aside nav .nav[data-view=\"ext-notes\"]').classList.contains('active')"),true);

 // Tabs from one app: «Подсказки» on «Навыки» (one section, no header needed), «Заметки о команде» next to «Команда».
 await js("view('learning')");await keyOfTips();
 assert.deepEqual((await learningTabs()).filter(k=>k===tipsKey).length,1);
 await js(`window.petyaTabs.select('learning',${JSON.stringify(tipsKey)})`);
 await wait("!!document.querySelector('#learning .page-tab-section[data-owner=\"ui-notes\"] .notes-tip')");
 assert.equal(await js("document.querySelector('#learning .page-tab-section[data-owner=\"ui-notes\"] .page-tab-owner').hidden"),true);
 assert.equal(await js("[...document.querySelectorAll('#learning>article')].every(a=>a.classList.contains('page-tab-off'))"),true,'the core cards are hidden on the app tab');
 await js("view('team')");
 assert.deepEqual(await js("[...document.querySelectorAll('#team .page-tabs button')].map(b=>b.dataset.tab)"),['main',await js("window.petyaTabs.key('Заметки о команде')")]);

 // The second app: the same tab name in other letters is the same tab, with a section per app, headers and order.
 await install(tipsDir);await settle();
 await js("view('learning')");await js(`window.petyaTabs.select('learning',${JSON.stringify(tipsKey)})`);
 await wait("document.querySelectorAll('#learning .page-tab-section:not([hidden])').length===2");
 assert.equal((await learningTabs()).filter(k=>k===tipsKey).length,1,'one tab for «Подсказки» and «подсказки»');
 assert.deepEqual(await js("[...document.querySelectorAll('#learning .page-tab-section:not([hidden])')].map(s=>s.dataset.owner)"),['ui-notes','ui-tips'],'order 10 before the default');
 assert.deepEqual(await js("[...document.querySelectorAll('#learning .page-tab-section:not([hidden]) .page-tab-owner')].map(h=>[h.hidden,!!h.querySelector('svg')])"),[[false,true],[false,true]],'headers with the app icon');
 assert.match(await js("document.querySelector('#learning .page-tab-section[data-owner=\"ui-tips\"] .tips-text').textContent"),/\S/);
 // A tab on another app's page: «Заметки» gets its own first tab and «Советы».
 await js("view('ext-notes')");
 assert.deepEqual(await js("[...document.querySelectorAll('#ext-notes .page-tabs button')].map(b=>b.dataset.tab)"),['main',await js("window.petyaTabs.key('Советы')")]);
 await js(`window.petyaTabs.select('ext-notes',window.petyaTabs.key('Советы'))`);
 assert.equal(await js("document.querySelector('#ext-notes .ext-page-body').classList.contains('page-tab-off')"),true);
 await js("window.petyaTabs.select('ext-notes','main')");

 // A window reload: the rail item, its place and the shared tab come back.
 win.webContents.reload();await sleep(500);await js('window.chatNavigationReady');await clean();await settle();
 await wait("!!document.querySelector('aside nav .nav[data-view=\"ext-notes\"]')");
 assert.equal(await js("document.querySelector('aside nav .nav[data-view=\"ext-notes\"]').previousElementSibling.dataset.view"),'team','same place after a reload');
 await js("view('learning')");await keyOfTips();await js(`window.petyaTabs.select('learning',${JSON.stringify(tipsKey)})`);
 await wait("document.querySelectorAll('#learning .page-tab-section:not([hidden])').length===2");
 // (screenshots after the reload: an installed app's own translations reach the window's text after it reloads)
 await sleep(300);
 await shot('learning-shared',{rail:'wide'});
 await shot('learning-shared-compact',{rail:'compact'});
 await shot('learning-shared-narrow',{rail:'compact',size:[760,860]});
 await js("view('ext-notes')");await js(`window.petyaTabs.select('ext-notes',window.petyaTabs.key('Советы'))`);
 await shot('page-tab',{rail:'wide'});await shot('page-compact',{rail:'compact'});
 await js("window.petyaTabs.select('ext-notes','main')");await shot('page',{rail:'wide'});
 await js("view('team')");await js("window.petyaTabs.select('team',window.petyaTabs.key('Заметки о команде'))");await shot('team-tab',{rail:'wide'});
 await js("view('learning')");

 // Turning one app off and on: its section goes and comes back live.
 await js("window.extensionHost.remove('ui-tips')");await settle();
 assert.deepEqual(await js("[...document.querySelectorAll('#learning .page-tab-section')].map(s=>s.dataset.owner)"),['ui-notes']);
 assert.equal(await js("document.querySelector('#learning .page-tab-section .page-tab-owner').hidden"),true,'one app: no header');
 assert.equal(await js("document.querySelector('#ext-notes .page-tabs').hidden"),true,'its tab on «Заметки» is gone');
 await js("window.extensionHost.open('ui-tips',{stay:true})");await settle();
 await wait("document.querySelectorAll('#learning .page-tab-section').length===2");
 // Removing one app leaves one section; removing the other (while its page is open) removes the tab and the page.
 await removeFiles('ui-tips');await settle();
 assert.deepEqual(await js("[...document.querySelectorAll('#learning .page-tab-section')].map(s=>s.dataset.owner)"),['ui-notes']);
 await js("view('learning')");await js("view('ext-notes')");
 await removeFiles('ui-notes');await settle();
 await wait("!document.querySelector('aside nav .nav[data-view=\"ext-notes\"]')");
 assert.equal(await js("document.getElementById('ext-notes')"),null);
 assert.equal(await js("document.body.dataset.view"),'learning','back to the page before');
 assert.equal((await learningTabs()).includes(tipsKey),false,'an empty tab disappears');
 assert.equal(await js("document.querySelectorAll('#team .page-tab-section').length"),0);
 assert.equal(await js("(()=>{const i=window.petyaTabs.info('learning');return !!i.tabs.find(t=>t.key===i.active)?.core;})()"),true,'a core tab is open again');
 assert.equal(await js("[...document.querySelectorAll('#learning>[data-page-tab]')].some(n=>!n.classList.contains('page-tab-off'))"),true,'with its content shown');

 // Declarations that cannot be used: a tab on an unknown page is skipped, a taken page id is refused — clear errors.
 const broken=fs.mkdtempSync(path.join(os.tmpdir(),'petya-ui-broken-'));
 const a=path.join(broken,'ui-first'),b=path.join(broken,'ui-second');
 for(const [dir,id,ui] of [[a,'ui-first',{pages:[{id:'board',title:'Доска',render:'renderBoard'}]}],[b,'ui-second',{pages:[{id:'board',title:'Доска 2',render:'renderBoard2'}],tabs:[{page:'nope',title:'Лишняя',render:'renderBoard2'}]}]]){
  fs.mkdirSync(dir);fs.copyFileSync(path.join(tipsDir,'icon.svg'),path.join(dir,'icon.svg'));
  fs.writeFileSync(path.join(dir,'board.js'),"window."+ui.pages[0].render+"=c=>{const p=document.createElement('p');p.className='board-ok';p.textContent='ok';c.append(p);};");
  fs.writeFileSync(path.join(dir,'extension.json'),JSON.stringify({id,name:id,description:'Проверка',category:'docs',icon:'icon.svg',setting:'extension_'+id,settings:false,scripts:[['board.js','message-format.js']],ui}));
  await install(dir);
 }
 await settle();
 assert.equal(await js("document.querySelectorAll('aside nav .nav[data-view=\"ext-board\"]').length"),1,'one page per id');
 assert.equal(await js("document.querySelector('aside nav .nav[data-view=\"ext-board\"]').dataset.extensionPage"),'ui-first','the first app keeps it');
 const errors=consoleLines.filter(l=>l.startsWith('[extensions]'));
 assert(errors.some(l=>l.includes('ui-second')&&l.includes('board')&&/занят|taken/.test(l)),'taken page id reported:\n'+errors.join('\n'));
 assert(errors.some(l=>l.includes('ui-second')&&l.includes('«nope»')),'unknown page reported:\n'+errors.join('\n'));
 for(const id of ['ui-first','ui-second'])await removeFiles(id);
 fs.rmSync(broken,{recursive:true,force:true});await settle();
 assert.equal(await js("!!document.querySelector('aside nav .nav[data-view=\"ext-board\"]')"),false);

 // The reminders app's tab on «Навыки»: there while the app is added, with its list card; gone when it is off.
 const svc=require('../src/extensions/reminders/feature.cjs').instance();
 svc.add({text:'Позвонить в банк',topicId:'',projectId:'general',time:{at:Date.now()+2*3600000}});
 svc.add({text:'Отправить отчёт по спринту',topicId:'',projectId:'general',time:{at:Date.now()+26*3600000}});
 const remindersKey=await js("window.petyaTabs.key('Напоминания')");
 assert.equal((await learningTabs()).includes(remindersKey),false,'no reminders tab without the app');
 await js("window.extensionHost.open('reminders',{stay:true})");await settle();
 await js("view('learning')");await js(`window.petyaTabs.select('learning',${JSON.stringify(remindersKey)})`);
 await wait("!!document.querySelector('#learning .page-tab-section[data-owner=\"reminders\"] .reminder-card .rem-row')");
 assert.equal(await js("document.querySelectorAll('#learning .page-tab-section[data-owner=\"reminders\"] .rem-row').length"),2);
 await shot('reminders-tab',{rail:'wide'});
 await js("window.extensionHost.remove('reminders')");await settle();
 assert.equal((await learningTabs()).includes(remindersKey),false,'the tab goes with the app');
 console.log('Screenshots:',shots.join(' '));
 console.log('Extension places UI: review lists menu items and tabs, rail item placed after «Команда», page with IPC and onShow, reload, shared tab with a section per app, turning off and removal, tab on another app\'s page, refused declarations, reminders tab passed');
}};
require('../src/main.cjs');
