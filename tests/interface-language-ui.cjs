// English interface in the real window: static markup, dynamic notices and settings are translated
// before paint, chat message text is left as written, and the settings card shows the choice.
// Run: npx electron tests/interface-language-ui.cjs
process.env.PETYA_SMOKE_TEST='1';process.env.PETYA_INTERFACE_LANGUAGE='en';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout '+code);};
 const shell=await js(`(()=>({lang:document.documentElement.lang,nav:[...document.querySelectorAll('.nav')].map(b=>b.textContent.trim()),status:$('status').textContent,russian:(document.querySelector('aside').innerText+' '+document.querySelector('main>header').innerText).match(/[А-Яа-яЁё]{3,}/g)}))()`);
 assert.equal(shell.lang,'en');
 assert.ok(shell.nav.some(text=>text.includes('Assistant'))&&shell.nav.some(text=>text.includes('History')),shell.nav.join(' | '));
 assert.equal(shell.russian,null,'Russian left in the sidebar or header: '+shell.russian);
 // Text set later by code is translated too, including composed strings.
 await js("notice('Изменения не сохранены.')");
 assert.equal(await js("$('notice').firstChild.textContent"),'Changes not saved.');
 // Chat message text is user/model content and stays as written.
 const kept=await js("(()=>{const m=document.createElement('div');m.className='message-content';m.textContent='Сохранить';document.body.append(m);return new Promise(r=>setTimeout(()=>{r(m.textContent);m.remove();}))})()");
 assert.equal(kept,'Сохранить');
 await js("view('settings')");await wait("!!document.querySelector('#interface-language select option')");
 const card=await js("(()=>{const s=document.querySelector('#interface-language select');return {value:s.value,options:[...s.options].map(o=>o.textContent),title:document.querySelector('#interface-language h2').textContent}})()");
 assert.equal(card.title,'Interface language');
 assert.equal(card.value,'en');
 assert.deepEqual(card.options.slice(1),['Русский','English']);
 assert.match(card.options[0],/^[A-Za-z ]+ \((English|Русский)\)$/);
 console.log('Interface language UI: English shell, dynamic text, untouched chat text and settings choice passed');
}};
require('../src/main.cjs');
