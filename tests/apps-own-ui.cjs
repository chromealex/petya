// What apps own in Petya's own pages, in the real window (docs/extensions.md §8a):
//  - «Почта»: the «Почтовые правила» tab on «Навыки» (rules listed with what they read, on/off, edit form, delete with
//    «Отменить»), there only while «Почта» is added;
//  - voice-command actions in the command editor on «Навыки»: only «Выполнить команду в чате», «Ответить заданным
//    текстом» and the actions of added apps (Jira, Google Play);
//  - «Дни рождения»: the birthday field on «Команда» cards, only while the app is added; the value survives saving
//    the team without the app;
//  - «С чего начать» on «Настройки» → «Сервисы»: the buttons come from the apps that declare a quick start.
// Screenshots (temp folder, petya-own-*.png; with PETYA_INTERFACE_LANGUAGE=en the English ones, -en): wide and compact
// rail, and a narrow window.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const en=process.env.PETYA_INTERFACE_LANGUAGE==='en',suffix=en?'-en':'';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,tries=150)=>{for(let i=0;i<tries;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 const clean=()=>js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove());document.getElementById('notice')?.setAttribute('hidden','');document.querySelectorAll('.ux-page-status').forEach(n=>n.hidden=true)");
 const shots=[];
 const shot=async(name,{rail='wide',size=[1280,860],keepToasts=false}={})=>{
  win.setContentSize(...size);if(!keepToasts)await clean();
  await js(`document.body.classList.toggle('rail-expanded',${rail==='wide'});document.querySelector('.notification-center,.notifications-panel')?.removeAttribute('open')`);
  win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(350);
  const file=path.join(os.tmpdir(),'petya-own-'+name+suffix+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());shots.push(file);return file;
 };
 const settle=()=>js('new Promise(r=>{const go=()=>window.extensionPlaces.sync().then(()=>setTimeout(r,120));go();})');
 const tabs=page=>js(`[...document.querySelectorAll('#${page} .page-tabs button')].map(b=>b.dataset.tabKey)`);
 await js('window.chatNavigationReady');win.setContentSize(1280,860);win.showInactive();await clean();

 // «Почта» → «Почтовые правила» on «Навыки».
 const mail=require('../src/extensions/mail/feature.cjs').instance();
 for(const r of mail.list())mail.remove(r.id);
 mail.put({name:'Утренняя почта',phrases:['что там в почте','мне кто-нибудь написал'],days:3,unread:true,skipPromotions:true,priority:['Полина'],allAccounts:true,accounts:[],instructions:'Выдели вопросы ко мне и сроки.',enabled:true});
 mail.put({name:'Рассылки за неделю',phrases:['что в рассылках'],days:7,unread:false,skipPromotions:false,priority:[],allAccounts:true,accounts:[],instructions:'Только темы.',enabled:false});
 const mailKey=await js("window.petyaTabs.key('Почтовые правила')");
 await js("window.extensionHost.remove('mail').catch(()=>{})");await settle();
 assert.equal((await tabs('learning')).includes(mailKey),false,'no mail rules tab without «Почта»');
 await js("window.extensionHost.open('mail',{stay:true})");await settle();
 await js("view('learning')");await js(`window.petyaTabs.select('learning',${JSON.stringify(mailKey)})`);
 await wait("document.querySelectorAll('#learning .page-tab-section[data-owner=\"mail\"] .mail-rule').length===2");
 assert.equal(await js("document.querySelectorAll('#learning .mail-rule.off').length"),1,'the switched-off rule looks off');
 assert.equal(await js("document.querySelector('#learning .mail-rule .mail-rule-phrases').textContent"),'«что там в почте», «мне кто-нибудь написал»');
 assert.equal(await js("document.querySelector('#learning .mail-rule .mail-rule-phrases').hasAttribute('data-no-i18n')"),true);
 await shot('mail-rules',{rail:'wide'});await shot('mail-rules-compact',{rail:'compact'});await shot('mail-rules-narrow',{rail:'compact',size:[760,860]});
 // Delete with «Отменить», then the edit form.
 await js("document.querySelectorAll('#learning .mail-rule .delete-button')[1].click()");
 await wait("document.querySelectorAll('#learning .mail-rule').length===1");
 assert.equal(mail.list().length,1);
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent===(window.t||String)('Отменить')).click()");
 await wait("document.querySelectorAll('#learning .mail-rule').length===2");
 assert.equal(mail.list().find(r=>r.name==='Рассылки за неделю')?.enabled,false,'restored as it was');
 await js("[...document.querySelectorAll('#learning .mail-rule')][0].querySelectorAll('.kit-actions button')[2].click()");
 await wait("!!document.querySelector('#learning .mail-rule-form')");
 assert.equal(await js("document.querySelector('#learning .mail-rule-form input').value"),'Утренняя почта');
 await shot('mail-rule-form',{rail:'wide'});
 await js("[...document.querySelectorAll('#learning .mail-rule-form button')].at(-1).click()");
 await wait("!document.querySelector('#learning .mail-rule-form')");
 await js("window.extensionHost.remove('mail')");await settle();
 assert.equal((await tabs('learning')).includes(mailKey),false,'the tab goes with the app');
 console.log('Screenshots:',shots.join(' '));
 console.log('Apps own UI: mail rules tab passed');
}};
require('../src/main.cjs');
