// Appearance in the window: the theme applies before paint, «Оформление» switches light/dark, presets and the
// text size (page zoom), and the small dashboard window follows the same theme.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async(win,{app})=>{
 const js=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));
 await js('window.chatNavigationReady');
 assert.match(await js('document.documentElement.dataset.theme'),/^(?:light|dark)$/,'a theme is set at startup');
 await js("view('settings')");await wait(300);
 await js("const c=document.getElementById('appearance');const d=c.querySelector('details');if(d)d.open=true;");
 const click=label=>js("[...document.querySelectorAll('#appearance .appearance-chip')].find(b=>b.textContent==="+JSON.stringify(label)+").click()");
 await click('Тёмная');await wait(400);assert.equal(await js('document.documentElement.dataset.theme'),'dark');
 await click('Светлая');await wait(400);assert.equal(await js('document.documentElement.dataset.theme'),'light');
 assert.equal(await js("getComputedStyle(document.body).backgroundColor"),'rgb(244, 246, 243)','light tokens are in effect');
 assert.equal(await js("[...document.querySelectorAll('#appearance .appearance-tile')].length"),3,'light presets are shown');
 await js("[...document.querySelectorAll('#appearance .appearance-tile')].find(t=>t.title==='Бумага').click()");await wait(400);
 assert.equal(await js("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()"),'#f6f2ea','the preset applies its tokens');
 await click('Крупнее');await wait(400);assert.equal(win.webContents.getZoomFactor(),1.12,'text size is the page zoom');
 const r=await js("window.petya.feature('appearance','get')");assert.equal(r.mode,'light');assert.equal(r.light,'paper');assert.equal(r.size,'large');
 await js("window.petya.feature('appearance','reset')");await wait(300);assert.equal(win.webContents.getZoomFactor(),1);
 console.log('Appearance UI: theme at startup, light/dark switch, preset tokens, text size as zoom, saved state and reset passed');
}};
require('../src/main.cjs');
