// «Профайлер» cards in the real chat: the budget bar, the frame timeline, ranked markers per thread with tabs, GC,
// explanations, the fps chip re-computing shares, and the before/after diff with ▲▼. Card data comes from the real
// readers on the fixture files.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const parse=require('../src/extensions/profiler/parse.cjs');
const analyze=require('../src/extensions/profiler/analyze.cjs');
const F=n=>fs.readFileSync(path.join(__dirname,'fixtures/profiler',n),'utf8');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const markers=parse.parse('before-markerTable.csv',F('before-markerTable.csv'));
 const single=analyze.single(analyze.merge([markers,parse.parse('before-frameTime.csv',F('before-frameTime.csv'))]),60);
 const trace=analyze.single(parse.parse('trace.json',F('trace.json')),60);trace.id='c';trace.hints={classes:[],files:[]};
 single.name='markerTable.csv + frameTime.csv';single.id='a';single.hints={classes:['EnemyAI'],files:['Game/Assets/Scripts/AI/EnemyAI.cs']};
 single.explain=[{marker:'Physics.Simulate',fact:'Physics.Simulate 6,2 мс — 37% от 16,7 мс бюджета',why:'физика: много активных Rigidbody и коллайдеров или маленький Fixed Timestep (несколько шагов физики за кадр).'},
  {marker:'Camera.Render',fact:'Camera.Render 3,9 мс — 23% от 16,7 мс бюджета',why:'рендер: число объектов и draw calls, тени, постобработка.'}];single.explainedBy='reference';
 const diff=analyze.diff(markers,parse.parse('after-markerTable.csv',F('after-markerTable.csv')),60);diff.names=['before-markerTable.csv','after-markerTable.csv'];diff.id='b';diff.hints={classes:[],files:[]};
 diff.notes=['<img src=x onerror=alert(1)>'];
 await js(`view('home');showDialogueMessages([{role:'user',text:'разбери профайлер'},{role:'assistant',text:'Кадр ~17,2 мс.',by:'Профайлер',extensionData:{profiler:${JSON.stringify(single)}}},{role:'user',text:'разбери трассу chrome'},{role:'assistant',text:'Кадр ~16 мс.',by:'Профайлер',extensionData:{profiler:${JSON.stringify(trace)}}},{role:'user',text:'сравни профайл до и после'},{role:'assistant',text:'Хуже стало: Canvas.BuildBatch.',by:'Профайлер',extensionData:{profiler:${JSON.stringify(diff)}}}],'Профайлер')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.prof-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.prof-card').length"),3);
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=single] .prof-seg:not(.rest):not(.free)').length"),6,'four top-level segments (Unity) and two (trace)');
 assert.ok(await js("parseFloat(document.querySelector('.prof-line').style.left)>90"),'the budget line sits near the right edge for a frame over budget');
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=single] .prof-timeline')[0].querySelectorAll('rect').length"),300);
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=single] .prof-timeline')[0].querySelectorAll('rect.spike').length"),4);
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=single]')[0].querySelectorAll('.prof-tabs button').length"),0,'one thread: no tabs');
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=single]')[1].querySelectorAll('.prof-tabs button').length"),3,'main / render / jobs');
 assert.match(await js("document.querySelector('.prof-card[data-mode=single] .kit-chip.tone-alert')?.textContent||''"),/над бюджетом/);
 assert.equal(await js("[...document.querySelectorAll('.prof-card[data-mode=single] .prof-share')].find(n=>n.closest('tr').textContent.includes('Physics.Simulate')).textContent"),'37%');
 // Render tab.
 await js("[...document.querySelectorAll('.prof-card[data-mode=single]')[1].querySelectorAll('.prof-tabs button')][1].click()");
 assert.match(await js("document.querySelectorAll('.prof-card[data-mode=single]')[1].querySelector('.kit-table tbody tr').textContent"),/Draw Scene/);
 // fps chip: 30 fps → twice the budget, the card is within budget.
 await js("document.querySelector('.prof-card[data-mode=single] .kit-chip[aria-haspopup]').click()");
 for(let i=0;i<50;i++){if(await js("!!document.querySelector('.kit-menu-item')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.includes('30 fps')).click()");
 for(let i=0;i<50;i++){if(await js("document.querySelector('.prof-card[data-mode=single] .kit-chip.tone-done')!==null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.prof-card[data-mode=single] .kit-chip.tone-done').textContent"),/в бюджете/);
 await js("document.querySelector('.prof-card[data-mode=single] .kit-chip[aria-haspopup]').click()");
 for(let i=0;i<50;i++){if(await js("!!document.querySelector('.kit-menu-item')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.includes('60 fps')).click()");
 await new Promise(r=>setTimeout(r,150));
 // Diff.
 assert.equal(await js("document.querySelectorAll('.prof-card[data-mode=diff] .prof-delta.worse').length>=2"),true);
 assert.match(await js("document.querySelector('.prof-card[data-mode=diff] .prof-delta.worse').textContent"),/▲ \+1,7 мс/);
 assert.match(await js("document.querySelector('.prof-card[data-mode=diff] .prof-delta.better').textContent"),/▼/);
 assert.equal(await js("document.querySelectorAll('.prof-card img').length"),0,'notes are text, never HTML');
 assert.ok(await js("[...document.querySelectorAll('.prof-card button')].some(b=>b.textContent==='Что оптимизировать?')"));
 assert.equal(await js("document.querySelectorAll('.prof-card .kit-links[data-kind=code-fix]').length"),3,'the coding hand-off goes through k.links');
 assert.match(await js("document.querySelector('.prof-same').textContent"),/Без заметных изменений.*9 маркеров/);
 const file=await require('./card-shot.cjs')(win,'.prof-card','petya-profiler');
 // The cards are taller than the window: more shots further down.
 for(const [i,y] of [[2,760],[3,1520],[4,2280]]){await js('document.getElementById("card-shot").scrollTop='+y);await new Promise(r=>setTimeout(r,200));require('node:fs').writeFileSync(file.replace('.png','-'+i+'.png'),(await win.webContents.capturePage()).toPNG());}
 console.log('Profiler cards: budget bar, timeline, thread tabs, fps chip, explanations, before/after diff ▲▼ passed ('+file+')');
}};
require('../src/main.cjs');
