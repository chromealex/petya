// «Релизный чек-лист» card in the real chat: the progress ring, grouped items with status icons, app chips, verdicts
// and evidence links (unsafe links and HTML stay text), manual checkboxes that call the app and move the ring, a
// follow-up button per item, «Перепроверить», and the settings card's template editor.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const wait=async(code,tries=200)=>{for(let i=0;i<tries;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+code.slice(0,120));};
 await js('window.chatNavigationReady');
 const auto=(id,group,title,app,status,summary,evidence=[],extra={})=>({id,group,title,kind:'auto',check:id+'.x',status,summary,evidence,app,extension:app,custom:false,customGroup:false,...extra});
 const manual=(id,group,title,done)=>({id,group,title,kind:'manual',status:done?'ok':'todo',done,summary:'',evidence:[],custom:false,customGroup:false});
 const items=[
  auto('ci','Сборка','CI зелёный на релизной ветке','Сборки','problem','На release/1.5 упал «Android» #128.',[{text:'Android #128 — упал',url:'https://github.com/studio/towers/actions/runs/128'},{text:'iOS #77 — успешно',url:'https://github.com/studio/towers/actions/runs/77'}],{action:{label:'Почему упала',ask:'почему упала сборка на ветке release/1.5'}}),
  auto('versions','Сборка','Номера версии и сборки согласованы','Релизный чек-лист','ok','Версия 1.5 везде одинаковая (Unity, Android, iOS).',[{text:'ProjectSettings/ProjectSettings.asset: версия 1.5.0, Android versionCode 42, iOS build 42'},{text:'android/app/build.gradle: версия 1.5, Android versionCode 42'},{text:'ios/Towers/Info.plist: версия 1.5.0, iOS build 42'}]),
  auto('size','Сборка','Размер билда без резкого роста и замечаний','Размер билда','ok','Рост +3,2 МБ — в пределах нормы.',[{text:'towers-1.5.0.apk (1.5.0, 42): 148,3 МБ, было 145,1 МБ в towers-1.4.0.apk'}],{action:{label:'Размер билда',ask:'сравни размер двух последних билдов'}}),
  auto('crashes','Качество','Нет новых крэшей, crash-free не хуже прошлой версии','Крэши','problem','Sentry: новых крэшей — 2; Sentry: crash-free упал с 99,8% до 99,1%.',[{text:'Sentry: «NullReferenceException in ShopWindow.Open» — 140 событий, 60 польз.',url:'https://sentry.io/organizations/studio/issues/1/'},{text:'Sentry: «<img src=x onerror=alert(1)>» — 30 событий',url:'javascript:alert(1)'}],{action:{label:'Крэши релиза',ask:'новые крэши после релиза 1.5'}}),
  auto('blockers','Качество','Нет открытых блокирующих багов в версии','Jira','ok','Блокирующих багов нет; открытых задач в версии — 3.',[{text:'Открытых задач в версии 1.5: 3.',url:'https://studio.atlassian.net/issues/?jql=fixVersion%3D1.5'}]),
  manual('smoke','Качество','Смоук-тест на реальных устройствах пройден',true),
  auto('reviews','Стор и игроки','Оценки после прошлой версии не просели','Отзывы в сторах','missing','Нет приложения «Отзывы в сторах».'),
  auto('notes','Стор и игроки','Патчноут готов на всех языках и в лимитах сторов','Патчноуты','unknown','Патчноут к 1.5 ещё не составлен.',[],{action:{label:'Написать патчноут',ask:'напиши патчноут к версии 1.5'}}),
  manual('store-page','Стор и игроки','Скриншоты и описание в сторах обновлены',false),
  auto('loc','Контент','Нет непереведённых строк','Локализация','ok','Переведено полностью: английский, немецкий, бразильский португальский.'),
  auto('deps','Код','Нет уязвимых зависимостей','Зависимости','unknown','Подключите папку проекта.',[],{connect:true}),
  manual('server','Запуск','Сервер и удалённые конфиги готовы к версии',false),
  {...manual('custom','Своя группа','Предупредить комьюнити в Discord за сутки',false),custom:true,customGroup:true}
 ];
 const counts={total:items.length,ok:0,problem:0,unknown:0,missing:0,todo:0};for(const i of items)counts[i.status]++;
 const card={id:'c1',project:{id:'general',name:'Общее'},version:'1.5',previous:'1.4',branch:'release/1.5',checkedAt:new Date(Date.now()-120000).toISOString(),items,counts,
  share:'Релиз 1.5 (Towers): готово 6 из 13.',tasks:['Релиз 1.5: CI зелёный на релизной ветке — упал Android #128']};
 // The real app answers the ticks: the checklist is added and the card belongs to the general project.
 await js("window.petya.saveSettings({'extension_release-checklist':'true'})");
 await js(`view('home');showDialogueMessages([{role:'user',text:'готов ли релиз 1.5'},{role:'assistant',text:'Релиз 1.5: готово 6 из 13.',by:'Релизный чек-лист',extensionData:{releaseChecklist:${JSON.stringify(card)}}}],'Релиз')`);
 await wait("document.querySelectorAll('.rc-card').length===1");
 assert.equal(await js("document.querySelector('.rc-ring-label').textContent"),counts.ok+'/'+counts.total);
 assert.equal(await js("document.querySelector('.rc-ring-arc').classList.contains('alert')"),true,'problems colour the ring');
 assert.equal(await js("document.querySelectorAll('.rc-group').length"),7);
 assert.equal(await js("document.querySelectorAll('.rc-item').length"),items.length);
 assert.equal(await js("document.querySelectorAll('.rc-icon.problem').length"),2);
 assert.equal(await js("document.querySelectorAll('.rc-icon.missing').length"),1);
 assert.equal(await js("document.querySelectorAll('.rc-check').length"),4);
 assert.equal(await js("document.querySelectorAll('.rc-card img').length"),0,'service text is never HTML');
 assert.equal(await js("[...document.querySelectorAll('.rc-evidence a')].some(a=>a.href.startsWith('javascript'))"),false,'unsafe links stay text');
 assert.equal(await js("document.querySelector('[data-item=\"crashes\"] .rc-evidence').hasAttribute('data-no-i18n')"),true);
 assert.equal(await js("document.querySelector('[data-item=\"custom\"] .rc-name').hasAttribute('data-no-i18n')"),true,'user-written items are not translated');
 assert.equal(await js("document.querySelector('[data-item=\"smoke\"] .rc-name').hasAttribute('data-no-i18n')"),false);
 assert.equal(await js("document.querySelectorAll('.rc-action').length"),4);
 // A manual tick calls the app and moves the ring.
 await js("document.querySelector('[data-item=\"store-page\"] .rc-check').click()");
  await wait(`document.querySelector('.rc-ring-label').textContent==='${counts.ok+1}/${counts.total}'`);
 assert.equal(await js("document.querySelector('[data-item=\"store-page\"]').dataset.status"),'ok');
 assert.match(await js("document.querySelector('.rc-card .kit-actions').textContent"),/Перепроверить/);
 // The tick was saved by the app: the template editor's project has it per release (read back through the app).
 assert.equal(await js("window.petya.feature('releaseChecklist','template','general').then(r=>r.items.some(i=>i.id==='store-page'))"),true);
 // Settings card: the template editor lists the default items with their checks.
 await js("window.extensionHost.open('release-checklist',{stay:true})");await wait("!!document.querySelector('[data-extension=\"release-checklist\"]')");
 await js("{view('settings');const c=document.querySelector('[data-extension=\"release-checklist\"]');c.hidden=false;c.querySelector('details')&&(c.querySelector('details').open=true);document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'release-checklist'}))}");await wait("document.querySelectorAll('[data-extension=\"release-checklist\"] .rc-row').length>10");
 assert.equal(await js("document.querySelector('[data-extension=\"release-checklist\"] .rc-row .rc-item-check').value"),'ci.green');
 assert.equal(await js("document.querySelectorAll('[data-extension=\"release-checklist\"] .rc-row .delete-button').length>10"),true,'remove is the red trash button');
 await require('./card-shot.cjs')(win,'[data-extension="release-checklist"]','petya-release-checklist-settings',{width:700});
 await js("document.getElementById('card-shot').remove()");
 await js("view('home')");
 await require('./card-shot.cjs')(win,'.rc-card','petya-release-checklist');
 // The lower half of the card as a second picture (the window is shorter than the card).
 await js("(()=>{const box=[...document.querySelectorAll('#card-shot')].at(-1);box.scrollTop=box.scrollHeight;return 0;})()");await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-release-checklist-2.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Release checklist card: ring, groups, status icons, evidence links, safe text, manual tick moving the ring passed');
}};
require('../src/main.cjs');
