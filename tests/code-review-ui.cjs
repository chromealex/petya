// «Код-ревью» card in the real chat: severity chips as filters, files with comment bars, excerpts with the marked
// line and highlighting, a suggestion as a diff, «Скрыть нит-пики», the confirmation row before the PR write.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const ex=(rows,target)=>rows.map(([n,text,kind])=>({n,text,kind:kind||'ctx',target:n===target}));
 const card={source:'pr',key:'acme/game#12@abc123def456',repo:'acme/game',number:12,url:'https://github.com/acme/game/pull/12',title:'Average and JSON loading',branch:'feature/average',base:'main',model:true,dropped:2,
  totals:{blocker:2,warning:2,nit:2,files:4,skipped:2,additions:96,deletions:14},
  files:[{path:'src/stats/average.js',status:'modified',additions:24,deletions:3,counts:{blocker:2,warning:1,nit:1}},{path:'src/api/load.ts',status:'modified',additions:18,deletions:4,counts:{blocker:0,warning:1,nit:0}},
   {path:'src/format.py',status:'added',additions:12,deletions:0,counts:{blocker:0,warning:0,nit:1}},{path:'src/ui/Button.tsx',status:'modified',additions:6,deletions:2,counts:{blocker:0,warning:0,nit:0}},
   {path:'package-lock.json',status:'skipped',reason:'lock',label:'lock-файл',additions:30,deletions:5,counts:{blocker:0,warning:0,nit:0}},{path:'dist/app.min.js',status:'skipped',reason:'generated',label:'сгенерированный файл',additions:6,deletions:0,counts:{blocker:0,warning:0,nit:0}}],
  comments:[
   {id:'c1',file:'src/stats/average.js',line:8,severity:'blocker',category:'bug',by:'model',lang:'js',comment:'Пустой список даст деление на ноль: функция вернёт NaN вместо 0.',suggestion:'  return list.length ? total / list.length : 0;',
    excerpt:ex([[6,'  const total = list.reduce((a, b) => a + b, 0);','add'],[7,'  // TODO handle empty lists','add'],[8,'  return total / list.length;','add'],[9,'}'],[10,'const awsKey = "AKIA…";','add']],8)},
   {id:'c2',file:'src/stats/average.js',line:10,severity:'blocker',category:'security',by:'check',lang:'js',comment:'Похоже на ключ доступа AWS прямо в коде. Уберите из диффа, перевыпустите ключ и читайте его из переменных окружения.',
    excerpt:ex([[8,'  return total / list.length;','add'],[9,'}'],[10,'const awsKey = "AKIA…";','add'],[11,'module.exports = { sum, average };','add']],10)},
   {id:'c3',file:'src/stats/average.js',line:null,severity:'warning',category:'test',by:'check',lang:'js',comment:'Код изменён, а тест tests/average.test.js — нет. Проверьте, что он покрывает новое поведение.',excerpt:[]},
   {id:'c4',file:'src/api/load.ts',line:12,severity:'warning',category:'bug',by:'model',lang:'js',comment:'Нет проверки res.ok: ответ сервера с ошибкой разберётся как JSON.',suggestion:'  if (!res.ok) throw new Error(res.statusText);\n  return res.json();',
    excerpt:ex([[10,'  const url = base + path;'],[11,'  const res = await fetch(url);','add'],[12,'  return res.json();','add'],[13,'}']],12)},
   {id:'c5',file:'src/stats/average.js',line:6,severity:'nit',category:'style',by:'check',lang:'js',comment:'Отладочный `console.log` — уберите или замените логгером.',excerpt:ex([[5,'function average(list) {','add'],[6,'  console.log("total", total);','add'],[7,'  // TODO handle empty lists','add']],6)},
   {id:'c6',file:'src/format.py',line:3,severity:'nit',category:'style',by:'model',lang:'py',comment:'f-строка читается проще, чем format().',suggestion:'    return f"{value:.2f} ₽"',excerpt:ex([[2,'def price(value):','add'],[3,'    return "{:.2f} ₽".format(value)  # <img src=x onerror=alert(1)>','add']],3)}]};
 await js("window.petya.saveSettings({extension_coder:'true'})");
 await js(`window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};
  view('home');showDialogueMessages([{role:'user',text:'сделай ревью PR 12'},{role:'assistant',text:'Ревью acme/game#12: 4 файла.',by:'Код-ревью',extensionData:{codeReview:${JSON.stringify(card)}}}]);`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.cr-card .kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.cr-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.cr-comment').length"),6);
 assert.equal(await js("document.querySelectorAll('.cr-card img').length"),0,'code is never HTML');
 assert.equal(await js("document.querySelector('.cr-line.target .cr-code').textContent"),'  return total / list.length;');
 assert.ok(await js("!!document.querySelector('.cr-line.target .cr-kw')"),'keywords are highlighted');
 assert.equal(await js("document.querySelectorAll('.cr-suggest .cr-line.del').length"),3,'the old line in each suggestion');
 assert.equal(await js("document.querySelectorAll('.cr-file.skipped').length"),2);
 assert.equal(await js("document.querySelector('.cr-file .cr-count.blocker').textContent"),'2');
 // «Скрыть нит-пики» hides the two nits; a severity chip filters.
 await js("document.querySelector('.cr-nits').click()");
 assert.equal(await js("[...document.querySelectorAll('.cr-comment')].filter(n=>!n.hidden).length"),4);
 assert.equal(await js("document.querySelector('.cr-nits').dataset.state"),'hidden');
 await js("document.querySelector('.cr-summary .kit-chip[data-severity=\"blocker\"]').click()");
 assert.equal(await js("[...document.querySelectorAll('.cr-comment')].filter(n=>!n.hidden).length"),2);
 await js("document.querySelector('.cr-summary .kit-chip[data-severity=\"blocker\"]').click()");
 // «Исправить» hands the visible comments to the Programmer (code-fix).
 await js("document.querySelector('.cr-card .kit-link').click()");
 for(let i=0;i<100&&!(await js('window.__asked.length'));i++)await new Promise(r=>setTimeout(r,30));
 const fix=await js('window.__asked[0]');
 assert.equal(fix[1],true);assert.match(fix[0],/^Исправь в коде проекта замечания код-ревью по PR acme\/game#12 \(ветка feature\/average\):\n1\. src\/stats\/average\.js:8 \[blocker\]/);
 assert.ok(!/console\.log/.test(fix[0]),'hidden nits are not sent');
 // The PR write needs the confirmation row.
 await js("document.querySelector('.cr-post').click()");
 assert.equal(await js("document.querySelectorAll('.kit-toast').length"),0,'no call before confirmation');
 assert.match(await js("document.querySelector('.cr-confirm').textContent"),/Комментариев: 4\. Отправить их в acme\/game#12 одним ревью от вашего имени\?/);
 await js("document.querySelector('.cr-nits').click()");
 const shot=await require('./card-shot.cjs')(win,'.cr-card','petya-code-review');
 await js("document.getElementById('card-shot').scrollTop=1e6;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(shot.replace(/\.png$/,'-bottom.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Screenshot: '+shot);
 await js("document.querySelector('.cr-confirm button.primary').click()");
 // The confirmed call reaches the app in the main process, which refuses a review it did not make itself.
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.kit-toast')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.kit-toast').textContent"),/карточка устарела/);
 console.log('Code review card: filters, excerpts, suggestion diff, nits toggle, code-fix and confirmed PR review passed');
}};
require('../src/main.cjs');
