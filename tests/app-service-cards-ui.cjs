// The service cards apps own in «Настройки» → «Сервисы», in the real window: «Почта» (Google / Microsoft accounts,
// src/extensions/mail/settings.js), «Google Play Console» (src/extensions/google-play/settings.js) and «Notion»
// (src/extensions/notion/settings.js on Petya's shared service card). Each shows while its module is on and goes when it
// is off; the cards talk to their apps' IPC; the Notion check saves and checks through the app's connection-check.
// Screenshots (temp folder, petya-app-service-*.png; with PETYA_INTERFACE_LANGUAGE=en the English ones, -en).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const en=process.env.PETYA_INTERFACE_LANGUAGE==='en',suffix=en?'-en':'';
require.cache[require.resolve('./smoke.cjs')]={exports:async(win,workspace)=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,tries=150)=>{for(let i=0;i<tries;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 const clean=()=>js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove());");
 const shots=[];
 const shot=async(name,service,{size=[1280,860]}={})=>{
  win.setContentSize(...size);await clean();
  await js(`(()=>{const card=document.querySelector('[data-service="${service}"]');window.revealSettings?.(card);const d=card.querySelector('.settings-disclosure');if(d)d.open=true;card.scrollIntoView({block:'start'});})()`);
  win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(350);
  const file=path.join(os.tmpdir(),'petya-app-service-'+name+suffix+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());shots.push(file);return file;
 };
 const module=(id,on)=>js(`(async()=>{const c=moduleChecks.get('${id}');if(c.checked!==${on}){c.checked=${on};await c.onchange();}return moduleEnabled('${id}');})()`);
 await js('window.chatNavigationReady');win.setContentSize(1280,860);win.showInactive();await clean();
 await js("view('settings');window.petyaTabs.select('settings','services')");

 // Off: no card shows.
 for(const id of ['gmail','googleplay','notion'])assert.equal(await module(id,false),false);
 for(const id of ['gmail','googleplay','notion'])assert.equal(await js(`document.querySelector('[data-service="${id}"]').hidden`),true,id+' hidden while off');

 // «Почта»: the accounts card, its IPC is the app's.
 assert.equal(await module('gmail',true),true);
 await wait("!document.querySelector('[data-service=\"gmail\"]').hidden&&!!document.getElementById('gmail-status').textContent");
 const status=await js("window.petya.feature('mail','accountStatus')");
 assert.equal(status.connected,false);assert.ok(status.microsoft,'both providers');
 assert.equal(await js("!!document.getElementById('gmail-start')&&!!document.getElementById('microsoft-start')&&!!document.getElementById('mail-cancel')"),true);
 assert.equal(await js("document.getElementById('gmail-status').textContent"),en?'Add a mail account.':'Добавьте почтовый аккаунт.');
 assert.equal(await js("getComputedStyle(document.getElementById('gmail-accounts')).display!=='none'"),true);
 await shot('mail','gmail');

 // «Google Play Console»: not connected, the key under «Другой способ».
 assert.equal(await module('googleplay',true),true);
 await wait("!document.querySelector('[data-service=\"googleplay\"]').hidden");
 assert.equal(await js("document.querySelector('[data-service=\"googleplay\"] .connection-status').textContent"),en?'Not connected':'Не подключено');
 assert.equal(await js("document.querySelector('[data-service=\"googleplay\"] .primary').hidden"),false,'«Подключить» while not connected');
 await shot('google-play','googleplay');

 // «Notion»: Petya's shared service card; «Сохранить и проверить» goes to the app's check (stubbed Notion API).
 assert.equal(await module('notion',true),true);
 await wait("!document.querySelector('[data-service=\"notion\"]').hidden");
 const notion="document.querySelector('[data-service=\"notion\"]')";
 assert.equal(await js(notion+".querySelector('.actions .primary').textContent"),en?'Connect Notion':'Подключить Notion');
 assert.equal(await js(notion+".querySelectorAll('[name=\"notionToken\"]').length"),1);
 assert.equal(await js(notion+".querySelector('.connection-help')?.closest('details')!==null"),true,'the step-by-step help is folded');
 workspace.request=async url=>{assert.equal(new URL(url).origin,'https://api.notion.com');return {results:[{object:'page',id:'p1'}]};};
 await js(notion+".querySelector('.settings-disclosure').open=true;"+notion+".querySelector('.connection-options').open=true;document.getElementById('settings-form').elements.notionToken.value='fixture-token';"+notion+".querySelector('.connection-options > button.primary').click()");
 await wait(notion+".querySelector('.connection-status').textContent.length>0&&!"+notion+".querySelector('.connection-options > button.primary').disabled");
 assert.match(await js(notion+".querySelector('.connection-status').textContent"),en?/^Connected/:/^Подключено/);
 const saved=await js('window.petya.settings()');assert.equal(saved.notionToken,'','the token never reaches the window');assert.equal(saved.hasNotionToken,true);
 await js(notion+".querySelector('.connection-options').open=false");
 await shot('notion','notion');
 await shot('notion-narrow','notion',{size:[760,860]});

 // Off again: the cards go.
 for(const id of ['gmail','googleplay','notion'])await module(id,false);
 for(const id of ['gmail','googleplay','notion'])assert.equal(await js(`document.querySelector('[data-service="${id}"]').hidden`),true,id+' hidden again');
 console.log('Screenshots:',shots.join(' '));
 console.log('Service cards UI: «Почта», «Google Play Console» and «Notion» cards from their apps, shown with their modules, app IPC and checks passed');
}};
require('../src/main.cjs');
