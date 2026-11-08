// «Размер билда» cards in the real chat: data computed from the fixture builds (diff of two APKs and one AAB),
// stacked bars, legend, top grown files, warnings, «Показать все файлы», and file names never parsed as HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const analyze=require('../src/extensions/build-size/analyze.cjs');
 const fix=name=>path.join(__dirname,'fixtures/build-size',name);
 const diff=await analyze.diff(await analyze.inspect(fix('towers-1.4.0.apk')),await analyze.inspect(fix('towers-1.5.0.apk')));
 // A hostile file name must stay text.
 diff.grown[1]={...diff.grown[1],path:'assets/<img src=x onerror=alert(1)>.bundle'};
 const single=await analyze.single(await analyze.inspect(fix('towers-1.5.0.aab')));
 const messages=[{role:'user',text:'почему билд вырос'},{role:'assistant',text:analyze.text(diff),by:'Размер билда',extensionData:{buildSize:diff}},
  {role:'user',text:'из чего состоит aab'},{role:'assistant',text:analyze.text(single),by:'Размер билда',extensionData:{buildSize:single}}];
 await js(`view('home');showDialogueMessages(${JSON.stringify(messages)},'Билды')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.bsize-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.bsize-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.bsize-card')[0].querySelectorAll('.bsize-row').length"),2,'before and after bars');
 assert.ok(await js("document.querySelectorAll('.bsize-card')[0].querySelectorAll('.bsize-seg').length")>=8);
 assert.match(await js("document.querySelector('.bsize-delta-big').textContent"),/^\+370 КБ · \+76,9%$/);
 assert.equal(await js("document.querySelectorAll('.bsize-card')[0].querySelectorAll('.kit-table tbody tr').length"),diff.grown.length);
 assert.equal(await js("document.querySelectorAll('.bsize-card img').length"),0,'file names are never HTML');
 assert.ok(await js("document.querySelectorAll('.bsize-card .bsize-path[data-no-i18n]').length")>=10,'paths are left to the translator');
 assert.ok(await js("document.querySelectorAll('.bsize-card')[0].querySelectorAll('.bsize-warnings li.warn').length")>=3);
 assert.equal(await js("document.querySelectorAll('.bsize-card')[1].querySelectorAll('.bsize-modules .kit-chip').length"),2,'AAB modules');
 assert.equal(await js("document.querySelector('.bsize-all').hidden"),true);
 await js("document.querySelectorAll('.bsize-card')[0].querySelector('.kit-actions button').click()");
 assert.equal(await js("document.querySelector('.bsize-all').hidden"),false);
 assert.equal(await js("document.querySelectorAll('.bsize-card')[0].querySelectorAll('.bsize-file').length"),diff.files.length);
 await js("document.querySelectorAll('.bsize-card')[0].querySelector('.kit-actions button[data-open=\"true\"]').click()");
 const file=await require('./card-shot.cjs')(win,'.bsize-card','petya-build-size');
 // The second card and the warnings are below the fold: scroll the overlay and capture again.
 await js("document.getElementById('card-shot').scrollTop=760");await new Promise(r=>setTimeout(r,200));
 const lower=path.join(require('node:os').tmpdir(),'petya-build-size-2.png');require('node:fs').writeFileSync(lower,(await win.webContents.capturePage()).toPNG());
 console.log('Build size cards: before/after stacked bars, legend, top grown table, warnings, AAB modules, all files toggle passed · '+file+' · '+lower);
}};
require('../src/main.cjs');
