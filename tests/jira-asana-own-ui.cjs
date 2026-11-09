// What Jira and Asana own in Petya's own pages, in the real window: the Jira connection card on «Настройки» comes from
// the Jira app (window.addConnectionCard: Atlassian sign-in, disconnect, the manual token folded), the «Jira» row of
// «В сервисах» on «Команда» cards comes from it too (window.petyaTeamServices: search in the allowed projects), and the
// Asana card from the Asana app. Screenshots (temp folder, petya-jira-asana-*.png; with PETYA_INTERFACE_LANGUAGE=en
// the English ones, -en).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const en=process.env.PETYA_INTERFACE_LANGUAGE==='en',suffix=en?'-en':'';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' in: '+code.slice(0,160));}),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async(code,tries=150)=>{for(let i=0;i<tries;i++){if(await js(code))return;await sleep(80);}throw Error('Timeout '+code);};
 const clean=()=>js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove());document.getElementById('notice')?.setAttribute('hidden','')");
 const shot=async(name,size=[1280,900])=>{win.setContentSize(...size);await clean();win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await sleep(350);
  const file=path.join(os.tmpdir(),'petya-jira-asana-'+name+suffix+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());return file;};
 await js('window.chatNavigationReady');win.showInactive();await clean();
 const t=text=>en?js('window.t('+JSON.stringify(text)+')'):text;

 // «Настройки»: the Jira card is the app's, with the Atlassian sign-in and the token folded away.
 await js("window.enableAppModule('jira')");await wait("moduleEnabled('jira')");
 await wait("!!document.querySelector('#settings-form [data-service=\"jira\"] .connection-status')");
 assert.equal(await js("typeof window.addConnectionCard"),'function');
 const jira="document.querySelector('#settings-form [data-service=\"jira\"]')";
 const labels=await js(`[...${jira}.querySelectorAll('.actions button')].map(b=>b.textContent)`);
 assert.ok(labels.includes(await t('Подключить Jira и Confluence')),'Atlassian sign-in: '+labels);
 assert.ok(labels.includes(await t('Отключить Atlassian')),'Atlassian disconnect: '+labels);
 assert.equal(await js(`!!${jira}.querySelector('details details [name="jiraToken"]')`),true,'the API token sits in «Ручное подключение по токену»');
 assert.equal(await js("typeof window.petyaAtlassian?.connect"),'function','Confluence reaches the shared sign-in');
 await js("view('settings')");await js(`window.revealSettings?.(${jira});${jira}.querySelectorAll('details').forEach(d=>d.open=d.classList.contains('settings-disclosure')||d.classList.contains('connection-options'))`);await sleep(300);await js(`${jira}.scrollIntoView({block:'start'})`);
 const settingsShot=await shot('settings');

 // «Команда»: the Jira row comes from the app and opens its people search.
 await js("window.petya.teamSave({members:[{name:'Денис Котов',role:'Backend',jiraId:'acc-1',jiraName:'Denis Kotov'}],notes:''})");
 await js("document.querySelector('[data-view=\"team\"]').click()");await wait("document.querySelectorAll('#team-list .team-member').length===1");
 await js("document.querySelectorAll('#team-list details').forEach(d=>d.open=true)");
 const rows=await js("[...document.querySelectorAll('#team-list .team-account-service')].map(n=>n.textContent)");
 assert.deepEqual(rows.slice(0,3),['Slack','Jira',await t('Встречи')],'Slack, then the apps\' rows, then meetings: '+rows);
 const row="[...document.querySelectorAll('#team-list .team-account')].find(r=>r.querySelector('.team-account-service').textContent==='Jira')";
 assert.match(await js(`${row}.querySelector('dl').textContent`),/Denis Kotov/,'an older card\'s Jira fields show in the row');
 await js(`${row}.querySelector('.team-account-tools button').click()`);
 await wait(`!${row}.querySelector('.team-account-link').hidden`);
 assert.equal(await js(`${row}.querySelector('.team-account-link input').value`),'Denis Kotov');
 await js(`${row}.querySelector('.team-account-link input').scrollIntoView({block:'center'})`);
 const teamShot=await shot('team');
 // «Отвязать» clears the Jira fields of the card too.
 await js(`[...${row}.querySelectorAll('.team-account-tools button')][1].click()`);
 assert.equal(await js("document.querySelector('#team-list [data-field=\"jiraId\"]').value"),'');

 // Asana: its card on «Настройки» is drawn by the Asana app.
 assert.equal(await js("!!document.querySelector('#settings-form [data-service=\"asana\"]')"),true,'Asana card');
 assert.equal(await js("!!document.getElementById('asana')"),true,'Asana page');
 console.log('Jira and Asana own UI: Jira connection card with Atlassian sign-in, Jira row on «Команда», Asana card ('+[settingsShot,teamShot].map(f=>path.basename(f)).join(', ')+') passed');
}};
require('../src/main.cjs');
