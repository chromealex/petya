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

 // «С чего начать»: the buttons are the apps that declare a quick start, in their order, then the catalog.
 await js("view('settings');window.petyaTabs.select('settings','services')");
 await wait("document.querySelectorAll('.settings-start [data-quick-start]').length===4&&!document.querySelector('.settings-start').hidden");
 assert.deepEqual(await js("[...document.querySelectorAll('.settings-start [data-quick-start]')].map(b=>b.dataset.quickStart)"),['slack','jira','notion','mail']);
 assert.deepEqual(await js("[...document.querySelectorAll('.settings-start .actions button')].map(b=>b.textContent)"),en?['Slack','Jira','Notion','Mail','All apps…']:['Slack','Jira','Notion','Почта','Все приложения…']);
 await shot('quick-start',{rail:'wide'});await shot('quick-start-compact',{rail:'compact'});await shot('quick-start-narrow',{rail:'compact',size:[760,860]});
 // A button adds that app and opens its card; the start card goes once a service is added.
 await js("document.querySelector('.settings-start [data-quick-start=\"mail\"]').click()");
 await wait("(window.extensionHost.entries().find(e=>e.id==='mail')||{}).installed===true||moduleEnabled('gmail')");
 await wait("document.querySelector('.settings-start').hidden");
 assert.equal(await js("moduleEnabled('gmail')"),true,'«Почта» added');
 await js("window.extensionHost.remove('mail').catch(()=>{});const c=moduleChecks.get('gmail');if(c&&c.checked){c.checked=false;c.onchange();}");await settle();

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
 // Voice-command actions: Petya's own two, then those of added apps only.
 const options=()=>js("[...document.querySelectorAll('#learn-action option')].map(o=>o.value)");
 const refreshed=()=>js("refreshLearningActions().then(()=>true)");
 await js("window.extensionHost.remove('jira').catch(()=>{})");await refreshed();
 assert.deepEqual(await options(),['command','answer'],'no app actions without the apps');
 await js("window.extensionHost.open('jira',{stay:true})");await refreshed();
 assert.deepEqual(await options(),['command','answer','jira:bugs'],'Jira added: its action, not Google Play\'s');
 await js("window.petya.saveSettings({module_googleplay:'true'})");await refreshed();
 assert.deepEqual(await options(),['command','answer','jira:bugs','google-play:anr']);
 assert.deepEqual(await js("[...document.querySelectorAll('#learn-action option')].slice(2).map(o=>o.textContent)"),en?['Check bugs in Jira','Check ANR in Google Play']:['Проверить баги в Jira','Проверить ANR в Google Play']);
 // The editor is folded away on «Навыки» (commands are taught in the chat); shown here to look at the list.
 await js("view('learning');window.petyaTabs.select('learning','commands');{const f=$('learn-form');const h=f.closest('details')||f;h.classList.remove('never-shown');if(h.tagName==='DETAILS')h.open=true;f.closest('article')?.classList.remove('never-shown');editLearning({name:'Баги проекта',patterns:['что с багами в {query}'],action:'jira:bugs',output:'Покажи баги в проекте {query}'});f.scrollIntoView({block:'center'})}");
 assert.match(await js("$('learn-action-help').textContent"),en?/Jira/:/через Jira/);
 await shot('voice-actions',{rail:'wide'});await shot('voice-actions-compact',{rail:'compact'});
 // Without the app: a command keeps its action, shown as «not added», and runs as a chat command meanwhile.
 await js("window.petya.saveSettings({module_googleplay:'false'})");await js("window.extensionHost.remove('jira')");await refreshed();
 assert.deepEqual(await options(),['command','answer','jira:bugs']);
 assert.equal(await js("document.querySelector('#learn-action option[value=\"jira:bugs\"]').dataset.app"),'missing');
 await js("editLearning();{const f=$('learn-form');(f.closest('details')||f).classList.add('never-shown')}");await refreshed();
 assert.deepEqual(await options(),['command','answer']);

 // «Дни рождения»: the field on «Команда» cards comes from the app; the date stays in the record without it.
 const members=()=>js("window.petya.teamList().then(d=>d.members.map(m=>[m.name,m.birthday]))");
 await js("window.petya.teamSave({members:[{name:'Маша Иванова',role:'QA',projects:'Puzzle',birthday:'1996-05-14'},{name:'Олег Петров',role:'Android',birthday:'--05-20'}],notes:'',removed:[]})");
 await js("window.extensionHost.remove('birthdays').catch(()=>{})");await settle();
 await js("view('team');document.dispatchEvent(new Event('petya-team-updated'))");
 await wait("document.querySelectorAll('#team-list .team-member').length===2");
 assert.equal(await js("document.querySelectorAll('#team-list .team-person-field').length"),0,'no birthday field without the app');
 assert.equal(await js("document.querySelector('#team-list [data-field=\"birthday\"]').dataset.kept"),'true','kept as it is');
 await js("document.querySelector('#team-list [data-field=\"role\"]').value='QA lead';document.querySelector('#team-list [data-field=\"role\"]').dispatchEvent(new Event('input',{bubbles:true}))");
 await js("window.saveTeamNow()");
 assert.deepEqual(await members(),[['Маша Иванова','1996-05-14'],['Олег Петров','--05-20']],'saving the team without the app loses no date');
 await js("window.extensionHost.open('birthdays',{stay:true})");await settle();
 await wait("document.querySelectorAll('#team-list .team-person-field[data-person-field=\"birthday\"]').length===2");
 assert.equal(await js("document.querySelector('#team-list .team-person-field input[type=date]').value"),'1996-05-14');
 assert.match(await js("document.querySelector('#team-list .team-birthday-note').textContent"),en?/1996/:/1996/);
 assert.equal(await js("(()=>{const f=document.querySelector('#team-list .team-person-field'),card=f.closest('.team-member'),phone=card.querySelector('[data-field=\"phone\"]'),photo=card.querySelector('.team-photo');return !!(phone.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(f.compareDocumentPosition(photo)&Node.DOCUMENT_POSITION_FOLLOWING);})()"),true,'after the card\'s own fields, before the photo');
 await js("document.querySelectorAll('#team-list .team-member details').forEach((d,i)=>d.open=i===0);document.querySelector('#team-list .team-person-field').scrollIntoView({block:'center'})");
 await shot('team-birthday',{rail:'wide'});await shot('team-birthday-compact',{rail:'compact'});await shot('team-birthday-narrow',{rail:'compact',size:[760,860]});
 // Picking a date marks the team changed and saves it in the record.
 await js("{const d=document.querySelectorAll('#team-list .team-person-field input[type=date]')[1];d.value='1990-05-20';d.dispatchEvent(new Event('change',{bubbles:true}));}");
 assert.equal(await js("document.getElementById('team-form').classList.contains('is-dirty')"),true);
 await js("window.saveTeamNow()");
 assert.deepEqual((await members())[1],['Олег Петров','1990-05-20']);
 await js("window.extensionHost.remove('birthdays')");await settle();
 assert.equal(await js("document.querySelectorAll('#team-list .team-person-field').length"),0,'the field goes with the app');
 assert.equal(await js("document.querySelectorAll('#team-list [data-field=\"birthday\"]')[1].value"),'1990-05-20');

 console.log('Screenshots:',shots.join(' '));
 console.log('Apps own UI: mail rules tab, voice-command actions, birthday field passed');
}};
require('../src/main.cjs');
