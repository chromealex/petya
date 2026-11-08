// App catalog by category: groups in order with counts, picking a whole category or a part of it,
// «Добавить выбранные» / «Добавить остальные», search across categories; screenshot for a visual check.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async code=>{for(let i=0;i<120;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 // The catalog is a modal dialog on top of the page: capture the window as it is (moving it would close it).
 const shot=async name=>{win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(250);require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),name+'.png'),(await win.webContents.capturePage()).toPNG());};
 await js('window.chatNavigationReady');win.setContentSize(1100,860);win.showInactive();
 await js("window.openAppCatalog()");await wait("document.querySelectorAll('.app-catalog-group').length>3");
 const order=await js("[...document.querySelectorAll('.app-catalog-group')].map(g=>g.dataset.category)");
 const expected=['gamedev','analytics','team','meetings','docs','dev','comms','computer','personal','creative','other'].filter(c=>order.includes(c));
 assert.deepEqual(order,expected,'categories keep their order');
 assert(await js("[...document.querySelectorAll('[data-category=creative] .app-catalog-row strong')].some(n=>n.textContent==='Художник')"),'existing apps are grouped too');
 assert(await js("[...document.querySelectorAll('[data-category=comms] .app-catalog-row strong')].some(n=>n.textContent==='Slack')"),'service modules get a category');
 // Download weights: the Artist row, the creative category button, nothing for apps without downloads.
 await wait("!!document.querySelector('.app-catalog-weight')&&[...document.querySelectorAll('.app-catalog-weight')].some(n=>n.textContent.startsWith('Вес загрузки'))");
 const artistWeight=await js("[...document.querySelectorAll('.app-catalog-row')].find(r=>r.querySelector('strong').textContent==='Художник').querySelector('.app-catalog-weight').textContent");
 assert.match(artistWeight,/^Вес загрузки: ≈ 2,2 ГБ$/);
 assert.match(await js("document.querySelector('[data-category=creative] .app-catalog-group-head button').textContent"),/≈ 2,2 ГБ/);
 assert.match(await js("[...document.querySelectorAll('.app-catalog-row')].find(r=>r.querySelector('strong').textContent==='Python').querySelector('.app-catalog-weight').textContent"),/Нужен Docker Desktop/);
 assert.equal(await js("!![...document.querySelectorAll('.app-catalog-row')].find(r=>r.querySelector('strong').textContent==='Регулярки и cron').querySelector('.app-catalog-weight')"),false,'apps without downloads show no weight line');
 // Pick the whole «Разработка» category, then leave one app out.
 const dev="document.querySelector('[data-category=dev]')";
 const missing=await js(`[...${dev}.querySelectorAll('.app-catalog-row .app-catalog-pick:not(:disabled)')].length`);
 assert(missing>=2,'at least two dev apps are not added yet');
 await js(`${dev}.querySelector('.app-catalog-group-head .app-catalog-pick').click()`);
 await wait(`document.querySelector('.app-catalog-bar span')?.textContent==='Выбрано: ${missing}'`);
 const left=await js(`${dev}.querySelectorAll('.app-catalog-row .app-catalog-pick:not(:disabled)')[0].closest('.app-catalog-row').querySelector('strong').textContent`);
 await js(`${dev}.querySelectorAll('.app-catalog-row .app-catalog-pick:not(:disabled)')[0].click()`);
 await wait(`${dev}.querySelector('.app-catalog-group-head .app-catalog-pick').indeterminate===true`);
 await shot('petya-app-catalog-picked');
 await js("document.querySelector('.app-catalog-bar .primary').click()");
 await wait(`document.querySelector('.app-catalog-bar').hidden&&${dev}.querySelectorAll('.app-catalog-row .app-catalog-pick:not(:disabled)').length===1`);
 assert.equal(await js(`${dev}.querySelector('.app-catalog-row .app-catalog-pick:not(:disabled)').closest('.app-catalog-row').querySelector('strong').textContent`),left,'only the unchecked app stays not added');
 const catalog=await js("window.petya.feature('extensionUI','catalog')");
 assert(catalog.filter(e=>e.category==='dev'&&e.setting&&!e.service&&e.name!==left).every(e=>e.installed),'picked extensions are saved as added');
 assert.equal(await js(`${dev}.querySelector('.app-catalog-group-head button').textContent`),'Добавить остальные (1)');
 await js(`${dev}.querySelector('.app-catalog-group-head button').click()`);
 await wait(`${dev}.querySelector('.app-catalog-group-head button').textContent==='Всё добавлено'`);
 // Search: a category name shows its apps, a near-empty query shows nothing.
 await js("{const s=document.querySelector('.app-catalog input[type=search]');s.value='Креатив';s.dispatchEvent(new Event('input'))}");
 await wait("document.querySelectorAll('.app-catalog-group').length===1&&!!document.querySelector('[data-category=creative]')");
 await js("{const s=document.querySelector('.app-catalog input[type=search]');s.value='';s.dispatchEvent(new Event('input'))}");
 await shot('petya-app-catalog');
 console.log('App catalog: categories in order with service modules, whole category / part picking, add selected and the rest, search by category passed');
}};
require('../src/main.cjs');
