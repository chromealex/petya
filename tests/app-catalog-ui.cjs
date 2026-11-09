// App catalog: rail with counts and filters, category sections with app tiles, search by name/description/example,
// details panel (examples, connection, downloads, neighbours), add from a tile, from details and several at once,
// «Нужно подключить» for an added app without its service, Esc closing details first; screenshots for a visual check.
// PETYA_INTERFACE_LANGUAGE=en runs a short English pass that reports any Russian text left in the catalog.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const english=process.env.PETYA_INTERFACE_LANGUAGE==='en';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async code=>{for(let i=0;i<120;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 // The catalog is a modal dialog on top of the page: capture the window as it is (moving it would close it).
 const shot=async name=>{win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(250);fs.writeFileSync(path.join(os.tmpdir(),name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const search=text=>js(`{const s=document.querySelector('.app-catalog-search input');s.value=${JSON.stringify(text)};s.dispatchEvent(new Event('input'))}`);
 const tile=id=>`document.querySelector('.app-tile[data-app="${id}"]')`;
 const rail=id=>`document.querySelector('.app-rail-item[data-filter="${id}"] .app-rail-count')?.textContent`;
 const shown=()=>js("[...document.querySelectorAll('.app-tile')].map(t=>t.dataset.app)");
 await js('window.chatNavigationReady');win.setContentSize(1280,860);win.showInactive();
 await js("window.openAppCatalog()");await wait("document.querySelectorAll('.app-catalog-group').length>3");

 if(english){
  // Soft check: list Russian text that reached the catalog untranslated (examples, statuses, sections).
  await wait("!!document.querySelector('.app-weight')");
  await js(`${tile('crashes')}.querySelector('.app-tile-action').click()`);await wait(`${tile('crashes')}.dataset.state==='connect'`);
  await js(`${tile('crashes')}.querySelector('.app-tile-main').click()`);await wait("!document.querySelector('.app-catalog-details').hidden");
  const russian=await js("[...new Set((document.querySelector('.app-catalog').innerText.match(/[^\\n]*[А-Яа-яЁё][^\\n]*/g)||[]))]");
  if(russian.length)console.warn('Untranslated catalog text:',russian.join(' | '));
  assert.equal(await js("document.querySelector('.app-catalog h2').textContent"),'App catalog');
  await shot('petya-catalog-en');
  win.setContentSize(760,860);await sleep(400);await shot('petya-catalog-en-narrow');
  console.log('App catalog (English): '+(russian.length?russian.length+' untranslated lines reported':'no Russian text')+', screenshots passed');
  return;
 }

 // Sections keep the category order; services and extensions share them.
 const order=await js("[...document.querySelectorAll('.app-catalog-group')].map(g=>g.dataset.category)");
 const expected=['gamedev','analytics','team','meetings','docs','dev','comms','computer','personal','creative','other'].filter(c=>order.includes(c));
 assert.deepEqual(order,expected,'categories keep their order');
 assert(await js(`!!document.querySelector('[data-category=creative] .app-tile[data-app=artist]')`),'existing apps are grouped');
 assert(await js(`!!document.querySelector('[data-category=comms] .app-tile[data-app=slack]')`),'service modules get a category');
 // Rail: «Все» counts every tile, nothing is added yet, no «Требуют настройки» while nothing needs it.
 const total=(await shown()).length;assert(total>=25,'all apps are shown');
 assert.equal(await js(rail('all')),String(total));assert.equal(await js(rail('added')),'0');
 assert.equal(await js("!!document.querySelector('.app-rail-item[data-filter=connect]')"),false);
 assert.match(await js(rail('dev')),/^0\/\d+$/);
 // Every tile has a distinct icon (stroke svg or the service's own artwork), no checkbox clutter until hover/select.
 assert(await js("[...document.querySelectorAll('.app-tile .app-icon')].every(i=>i.querySelector('svg,img'))"),'every tile has an icon');
 assert.equal(await js("getComputedStyle(document.querySelector('.app-tile-pick')).opacity"),'0');
 // Every app not yet added shows its size: «≈» only where a download size is an estimate; never «Без загрузок».
 await wait(`!!${tile('artist')}.querySelector('.app-weight')`);
 assert.match(await js(`${tile('artist')}.querySelector('.app-weight').textContent`),/^≈ 2,2 ГБ$/);
 assert.match(await js("document.querySelector('[data-category=creative] .app-catalog-add-all').textContent"),/≈ 2,2 ГБ/);
 assert.match(await js(`${tile('regex-cron')}.querySelector('.app-weight')?.textContent||''`),/^\d[\d\s ,]* (КБ|МБ)$/,'an app without downloads shows its own exact size');
 assert.equal(await js("document.querySelector('.app-catalog').textContent.includes('Без загрузок')"),false);
 await shot('petya-catalog-wide');

 // Search: by name, by an example phrase only, by category name; nothing found shows a hint.
 await search('крэши');await wait("document.querySelectorAll('.app-tile').length>=1");
 assert((await shown()).includes('crashes'),'«крэши» finds Крэши');
 await search('пиксель-арт');await wait("document.querySelectorAll('.app-tile').length===1");
 assert.deepEqual(await shown(),['artist'],'an example phrase finds its app');
 assert.equal(await js("!!document.querySelector('.app-catalog-add-all')"),false,'no «add the whole category» while searching');
 await search('Креатив');await wait("document.querySelectorAll('.app-catalog-group').length===1&&!!document.querySelector('[data-category=creative]')");
 await search('нет такого приложения');await wait("!!document.querySelector('.app-catalog-empty')");
 await search('');await wait(`document.querySelectorAll('.app-tile').length===${total}`);

 // Add Крэши from its tile without a Sentry token: added, but «Нужно подключить» with «Подключить».
 await js(`${tile('crashes')}.querySelector('.app-tile-action').click()`);
 await wait(`${tile('crashes')}?.dataset.state==='connect'`);
 assert.equal(await js(`${tile('crashes')}.querySelector('.app-status').textContent`),'Нужно подключить');
 assert.equal(await js(`${tile('crashes')}.querySelector('.app-tile-action').dataset.action`),'connect');
 assert.equal(await js(rail('connect')),'1');assert.equal(await js(rail('added')),'1');
 assert(await js("document.querySelector('.app-catalog').open"),'adding keeps the catalog open');
 // Filters: «Требуют настройки» and «Добавленные» show only those apps.
 await js("document.querySelector('.app-rail-item[data-filter=connect]').click()");await wait("document.querySelectorAll('.app-tile').length===1");
 assert.deepEqual(await shown(),['crashes']);
 await js("document.querySelector('.app-rail-item[data-filter=added]').click()");await wait("document.querySelector('.app-rail-item[data-filter=added]').getAttribute('aria-current')==='true'");
 assert.deepEqual(await shown(),['crashes']);
 // A single category.
 await js("document.querySelector('.app-rail-item[data-filter=dev]').click()");await wait("document.querySelectorAll('.app-catalog-group').length===1");
 assert.equal(await js("document.querySelector('.app-catalog-group').dataset.category"),'dev');
 await js("document.querySelector('.app-rail-item[data-filter=all]').click()");await wait(`document.querySelectorAll('.app-tile').length===${total}`);

 // Details: Крэши shows its examples, its service and its neighbours; Esc closes the details, not the catalog.
 await js(`${tile('crashes')}.querySelector('.app-tile-main').click()`);await wait("document.querySelector('.app-catalog-details')?.dataset.app==='crashes'&&!document.querySelector('.app-catalog-details').hidden");
 assert(await js("document.querySelectorAll('.app-catalog-details .app-say').length")>=3,'examples are listed');
 assert(await js("document.querySelector('.app-catalog-details').textContent.includes('Sentry')"));
 assert.equal(await js("document.querySelector('.app-details-state[data-state]').textContent"),'Не подключено');
 const neighbours=await js("[...document.querySelectorAll('.app-links dt')].map(n=>n.textContent)");
 assert(neighbours.includes('Задача в трекер')&&neighbours.includes('Починка кода'),'works with: '+neighbours);
 assert.equal(await js("document.activeElement===document.querySelector('.app-catalog-details')"),true,'details take the focus');
 await shot('petya-catalog-details');
 await js("document.querySelector('.app-catalog-details').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
 await wait("document.querySelector('.app-catalog-details').hidden");
 assert(await js("document.querySelector('.app-catalog')?.open===true"),'Esc closes the details first');
 // «/» focuses search.
 await js("document.querySelector('.app-catalog-content').dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true}))");
 assert(await js("document.activeElement===document.querySelector('.app-catalog-search input')"));
 // Downloads in details: Python needs Docker Desktop; the Programmer's model is optional.
 await js(`${tile('python')}.querySelector('.app-tile-main').click()`);await wait("document.querySelector('.app-catalog-details')?.dataset.app==='python'");
 assert(await js("document.querySelector('.app-catalog-details').textContent.includes('Нужен Docker Desktop')"));
 await js(`${tile('coder')}.querySelector('.app-tile-main').click()`);await wait("document.querySelector('.app-catalog-details')?.dataset.app==='coder'");
 assert(await js("document.querySelector('.app-catalog-details').textContent.includes('по желанию')"));
 await js(`${tile('regex-cron')}.querySelector('.app-tile-main').click()`);await wait("document.querySelector('.app-catalog-details')?.dataset.app==='regex-cron'");
 assert.equal(await js("[...document.querySelectorAll('.app-details-section h4')].some(h=>h.textContent==='Загрузки')"),false,'no downloads section without downloads');

 // Add from details, then an example goes into the composer (not sent) and the catalog closes.
 await js("document.querySelector('.app-details-actions .primary').click()");
 await wait(`${tile('regex-cron')}?.dataset.state==='added'&&document.querySelector('.app-catalog-details .app-status')?.dataset.state==='added'`);
 const phrase=await js("document.querySelector('.app-catalog-details .app-say').dataset.phrase");
 await js("document.querySelector('.app-catalog-details .app-say').click()");
 await wait("!document.querySelector('.app-catalog')");
 assert.equal(await js("$('command').value"),phrase,'the example is in the composer');
 await js("$('command').value=''");

 // Several at once: «Выбрать несколько», pick two not added dev apps, the bar adds them; then «Добавить остальные».
 await js("window.openAppCatalog()");await wait("document.querySelectorAll('.app-tile').length>20");
 await js("document.querySelector('.app-catalog-select').click()");await wait("document.querySelector('.app-catalog').classList.contains('selecting')");
 const dev="document.querySelector('[data-category=dev]')";
 const missing=await js(`[...${dev}.querySelectorAll('.app-tile[data-state=""]')].map(t=>t.dataset.app)`);
 assert(missing.length>=3,'at least three dev apps are not added yet');
 for(const id of missing.slice(0,2))await js(`${tile(id)}.querySelector('.app-tile-main').click()`);
 await wait("document.querySelector('.app-catalog-bar-note')?.textContent.startsWith('Выбрано: 2')");
 await shot('petya-catalog-picked');
 await js("document.querySelector('.app-catalog-bar .primary').click()");
 await wait(`document.querySelector('.app-catalog-bar').hidden&&${missing.slice(0,2).map(id=>tile(id)+".dataset.state").join('&&')}`);
 const catalog=await js("window.petya.feature('extensionUI','catalog')");
 for(const id of missing.slice(0,2)){const e=catalog.find(x=>x.id===id);if(e&&!e.service)assert(e.installed,id+' saved as added');}
 const left=missing.length-2;
 assert.match(await js(`${dev}.querySelector('.app-catalog-add-all').textContent`),new RegExp('^Добавить остальные \\('+left+'\\)( · ≈? ?[\\d\\s ,]+ (КБ|МБ|ГБ))?$'),'the rest, with their size');
 // Muted offers come back when their app is added.
 await js("window.petya.saveSettings({extensionOffersMuted:JSON.stringify(['dependencies','pull-requests'])})");
 await js(`${dev}.querySelector('.app-catalog-add-all').click()`);
 await wait(`${dev}.querySelector('.app-catalog-all-added')?.textContent==='Всё добавлено'`);
 const muted=await js("window.petya.feature('extensionOffers','muted')");
 assert(!muted.includes('dependencies')&&!muted.includes('pull-requests'),'adding unmutes offers: '+muted);
 // A service module from its tile: the module switch flow, then «Нужно подключить» without a token.
 await js(`${tile('slack')}.querySelector('.app-tile-action').click()`);
 await wait(`${tile('slack')}?.dataset.state==='connect'`);
 assert(await js("moduleEnabled('slack')"),'Slack module is on');
 // Remove from details.
 await js(`${tile('regex-cron')}.querySelector('.app-tile-main').click()`);await wait("!!document.querySelector('.app-details-remove')");
 await js("document.querySelector('.app-details-remove').click()");await wait(`!${tile('regex-cron')}.dataset.state`);
 await shot('petya-catalog');
 win.setContentSize(760,860);await sleep(400);await shot('petya-catalog-narrow');
 await js("document.querySelector('.app-catalog')?.close()");
 console.log('App catalog: rail counts and filters, sections, search by example, details with examples/connection/downloads/neighbours, Esc order, add from tile/details/selection/category, needs-connection status, unmute, remove passed');
}};
require('../src/main.cjs');
