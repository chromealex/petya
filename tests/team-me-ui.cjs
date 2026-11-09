// «Это я» in «Команда»: one card at most, the «это вы» mark, saved and read back.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+code);};
 await js('window.chatNavigationReady');
 await js("window.petya.teamSave({members:[{name:'Alex Silaev',role:'Продюсер'},{name:'Денис Котов',role:'Backend'}],notes:''})");
 await js("document.querySelector('[data-view=\"team\"]').click()");await wait("document.querySelectorAll('#team-list .team-member').length===2");
 assert.equal(await js("document.querySelectorAll('#team-list .team-me').length"),2,'each card has «Это я»');
 await js("document.querySelectorAll('#team-list details').forEach(d=>d.open=true);document.querySelectorAll('#team-list .team-me')[0].click()");
 assert.equal(await js("document.querySelectorAll('#team-list .team-member.is-me').length"),1);
 await js("document.querySelectorAll('#team-list .team-me')[1].click()");
 assert.deepEqual(await js("[...document.querySelectorAll('#team-list [data-field=me]')].map(i=>i.value)"),['','true'],'marking another card unmarks the first');
 assert.notEqual(await js("getComputedStyle(document.querySelectorAll('#team-list .team-you')[1]).display"),'none','«это вы» next to the name');
 assert.equal(await js("getComputedStyle(document.querySelectorAll('#team-list .team-you')[0]).display"),'none','not on the other card');
 await js("$('team-save').click()");await new Promise(r=>setTimeout(r,500));
 const saved=await js("window.petya.teamList()");
 assert.deepEqual(saved.members.map(m=>m.me),['','true']);
 await js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('#team-list details').forEach(d=>d.open=false);document.querySelectorAll('#team-list details')[1].open=true");if(!win.isVisible())win.show();win.setSize(1280,860);win.webContents.invalidate();await new Promise(r=>setTimeout(r,700));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-team-me.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Team «Это я» UI: one card at most, «это вы» mark, saved and read back passed');
}};
require('../src/main.cjs');
