// Petya's own dialogs replace the system ones: a main-process question (showMessageBox) appears in the window in
// the app's style and returns the pressed button; Esc picks cancel; window.petyaConfirm gives a red «Удалить».
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=c=>win.webContents.executeJavaScript(c);
 const wait=async(c,label)=>{for(let i=0;i<150;i++){if(await js(c))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+(label||c));};
 await js('window.chatNavigationReady');win.show();
 const bridge=require('../src/app-dialog.cjs');
 for(let i=0;i<50;i++){if(await js("typeof window.petyaConfirm==='function'"))break;await new Promise(r=>setTimeout(r,40));}
 await js("window.petya.feature('appDialog','ready')");
 // A question from the main process.
 const asked=bridge.showMessageBox(win,{type:'warning',message:'Удалить компанию «Тест»?',detail:'Данные уйдут в Корзину.',buttons:['Удалить','Отмена'],defaultId:1,cancelId:1});
 await wait("!!document.querySelector('dialog.app-dialog[open]')",'dialog shown');
 assert.equal(await js("document.querySelector('.app-dialog-title').textContent"),'Удалить компанию «Тест»?');
 assert.deepEqual(await js("[...document.querySelectorAll('.app-dialog-actions button')].map(b=>b.textContent)"),['Отмена','Удалить'],'cancel first');
 await js("[...document.querySelectorAll('.app-dialog-actions button')].find(b=>b.textContent==='Удалить').click()");
 assert.equal((await asked).response,0);
 // Esc means cancel.
 const second=bridge.showMessageBox(win,{message:'Скачать Художника?',buttons:['Скачать','Не сейчас'],defaultId:0});
 await wait("!!document.querySelector('dialog.app-dialog[open]')");
 await js("document.querySelector('dialog.app-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))");
 assert.equal((await second).response,1);
 // From the interface: «Удалить …?» → a red «Удалить»; the answer is a boolean.
 const confirmed=js("window.petyaConfirm('Удалить дашборд «Релиз»?')");
 await wait("!!document.querySelector('dialog.app-dialog[open] .app-dialog-danger')",'red delete');
 assert.equal(await js("document.querySelector('.app-dialog-danger').textContent"),'Удалить');
 await js("document.querySelector('.app-dialog-danger').click()");assert.equal(await confirmed,true);
 // A hidden window falls back to the system dialog (not tested here: it would block).
 console.log('App dialogs: main-process question in the window, cancel by Esc, red delete in confirm passed');
}};
require('../src/main.cjs');
