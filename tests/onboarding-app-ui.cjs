// «Онбординг новичка» cards in the real chat: the draft (ten-day strip coloured by kind, items by day with sources,
// unchecking leaves an item out, another first day relabels the days, gaps, the welcome draft with the outgoing review
// and the messenger hand-off with the edited text; «Начать онбординг» sends exactly the choices once), the stored plan
// (a column fills as items are ticked, today marked, the red trash with «Отменить») and the list of plans. Names and
// titles never become HTML. Feature calls are stubbed.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return args[0]==='share-message'?[{id:'mattermost',name:'Mattermost',label:'Отправить в Mattermost'}]:[];
  if(name==='appLinks'&&method==='run'){calls.push(['link',...args]);return {text:'Передано в Mattermost'};}
  if(name==='outgoing'&&method==='review')return {text:args[0].text,findings:[{id:'x',provider:'tone-check',providerName:'Проверка тона',severity:'info',span:null,message:'Можно добавить, кто встретит в первый день.'}]};
  if(name==='onboarding'){calls.push([method,...args]);
   if(method==='state')return 'pending';
   if(method==='save')return {ok:true,planId:'plan-1',text:'План онбординга сохранён: пунктов — '+(9-args[1].skip.length)};
   if(method==='check')return {ok:true,done:args[2]!==false,count:1,total:9};
   if(method==='remove')return {ok:true,plan:{id:'plan-2'}};
   if(method==='restore'||method==='welcome')return {ok:true};
  }
  return null;
 });
 const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const workdays=(from,n)=>{const out=[];const d=new Date(from);d.setHours(12,0,0,0);while(out.length<n){if(d.getDay()!==0&&d.getDay()!==6)out.push(ymd(d));d.setDate(d.getDate()+1);}return out;};
 const next=new Date();next.setDate(next.getDate()+1);
 const days=workdays(next,10);
 const items=[
  {id:'a1',day:1,kind:'access',title:'Корпоративная почта',source:{label:'Чек-лист доступов'}},
  {id:'a2',day:1,kind:'access',title:'Доступ к staging и логам',source:{label:'Чек-лист доступов'}},
  {id:'d1',day:1,kind:'doc',title:'Бэкенд: как устроен сервер',source:{label:'Confluence',url:'https://studio.atlassian.net/wiki/spaces/GAME/pages/1'},note:'Архитектура сервера, деплой'},
  {id:'d2',day:2,kind:'doc',title:'docs/backend/README.md',source:{label:'Файлы проекта',path:'/work/game/docs/backend/README.md'},note:'Как запустить сервер локально'},
  {id:'p1',day:2,kind:'person',title:'Олег Смирнов',role:'Бэкенд-разработчик',source:{label:'Кто знает',url:'https://github.com/studio/game/commit/abc'},note:'знает «бэкенд»: код, Jira'},
  {id:'d3',day:3,kind:'doc',title:'<img src=x onerror=alert(1)>',source:{label:'Файлы · по смыслу',path:'/work/game/docs/STYLE.md'}},
  {id:'p2',day:3,kind:'person',title:'Иван Козлов',role:'Бэкенд, тимлид',source:{label:'Команда'},note:'та же роль в «Команде»'},
  {id:'t1',day:3,kind:'task',title:'GAME-41 · Логи запросов API',key:'GAME-41',source:{label:'Jira · good-first-issue',url:'https://studio.atlassian.net/browse/GAME-41'}},
  {id:'t2',day:6,kind:'task',title:'GAME-43 · Метрики сервера',key:'GAME-43',source:{label:'Jira · good-first-issue',url:'https://studio.atlassian.net/browse/GAME-43'}}];
 const welcome='Привет, Аня! Рады, что ты с нами в роли «бэкенд». В первый день помогу с доступами — их 2. На первой неделе — знакомства: Олег, Иван. Первая задача — GAME-41. Если что-то непонятно — пиши мне в любое время.';
 const draft={mode:'draft',draftId:'draft-1',name:'Аня Смирнова',role:'бэкенд',start:days[0],days,today:ymd(new Date()),items,gaps:['Документы: «Поиск по всему» не нашёл документов по «бэкенд» — добавьте ссылки вручную.'],welcome};
 // A plan that started three working days ago.
 const past=new Date();let back=0;while(back<2){past.setDate(past.getDate()-1);if(past.getDay()!==0&&past.getDay()!==6)back++;}
 const pdays=workdays(past,10);
 const plan={mode:'plan',planId:'plan-2',name:'Дима Петров',role:'геймдизайн',start:pdays[0],days:pdays,today:ymd(new Date()),day:3,welcome:'Привет, Дима!',
  items:items.map(i=>({...i,done:['a1','a2','d1','p1'].includes(i.id)}))};
 const list={mode:'list',today:ymd(new Date()),plans:[{planId:'plan-2',name:'Дима Петров',role:'геймдизайн',start:pdays[0],day:3,done:4,total:9},{planId:'plan-3',name:'Ира Лебедева',role:'QA',start:days[0],day:0,done:0,total:7}]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'подготовь онбординг для Ани, она бэкенд'},{role:'assistant',text:'Онбординг · Аня Смирнова …',by:'Онбординг новичка',extensionData:{onboardingCard:${JSON.stringify(draft)}}},
  {role:'user',text:'как идёт онбординг Димы'},{role:'assistant',text:'Онбординг · Дима Петров …',by:'Онбординг новичка',extensionData:{onboardingCard:${JSON.stringify(plan)}}},
  {role:'user',text:'покажи онбординг'},{role:'assistant',text:'Онбординги …',by:'Онбординг новичка',extensionData:{onboardingCard:${JSON.stringify(list)}}}],'Онбординг')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.onb-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 const q=(i,sel)=>js(`document.querySelectorAll('.onb-card')[${i}].querySelectorAll(${JSON.stringify(sel)}).length`);
 assert.equal(await q(0,'.onb-day'),10);assert.equal(await q(0,'.onb-day.is-today'),0,'the draft starts tomorrow');
 assert.equal(await q(0,'.onb-item'),9);assert.equal(await q(0,'.onb-gaps li'),1);assert.equal(await q(0,'.onb-seg.kind-access'),1);
 assert.equal(await js("[...document.querySelectorAll('.onb-title')].some(n=>n.textContent==='<img src=x onerror=alert(1)>')&&!document.querySelector('.onb-card img')"),true,'titles are text, never HTML');
 assert.equal(await js("document.querySelector('.onb-draft a.onb-title').href"),'https://studio.atlassian.net/wiki/spaces/GAME/pages/1');
 // Uncheck the third document and the second task; start a week later.
 await js(`(()=>{const c=document.querySelectorAll('.onb-card')[0];for(const d of c.querySelectorAll('.onb-group'))d.open=true;
  const boxes=[...c.querySelectorAll('.onb-item')];const off=i=>{const b=boxes[i].querySelector('.onb-check');b.checked=false;b.dispatchEvent(new Event('change'));};
  off(${items.findIndex(i=>i.id==='d3')});off(${items.findIndex(i=>i.id==='t2')});})()`);
 assert.equal(await q(0,'.onb-item.is-off'),2);
 const later=workdays(new Date(Date.now()+8*86400000),1)[0];
 await js(`(()=>{const i=document.querySelectorAll('.onb-card')[0].querySelector('.onb-start-input');i.value=${JSON.stringify(later)};i.dispatchEvent(new Event('change'));})()`);
 assert.equal(await q(0,'.onb-item.is-off'),2,'choices survive the new first day');
 // The welcome draft: edited, reviewed, handed to the messenger with the exact text.
 await js(`(()=>{const a=document.querySelectorAll('.onb-card')[0].querySelector('.onb-welcome-text');a.value=a.value.replace('Привет, Аня!','Привет, Аня! Это Петя.');a.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.onb-draft .kit-review:not([hidden])')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await q(0,'.kit-review-item'),1,'the outgoing review is shown');
 for(let i=0;i<60;i++){if(await js("!!document.querySelector('.onb-draft .kit-link')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("document.querySelector('.onb-draft .kit-link').click()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='link'))break;await new Promise(r=>setTimeout(r,30));}
 const link=calls.find(c=>c[0]==='link');assert.equal(link[1],'share-message');assert.equal(link[2],'mattermost');assert.match(link[3].text,/^Привет, Аня! Это Петя\. Рады/);
 await js("document.querySelectorAll('.onb-draft .onb-group').forEach((d,i)=>d.open=i===0)");
 await require('./card-shot.cjs')(win,'.onb-draft','petya-onboarding');
 // «Начать онбординг»: once, with the choices.
 await js("document.querySelector('#card-shot .onb-draft .kit-actions button.primary').click()");
 for(let i=0;i<60;i++){if(await js("!document.querySelector('#card-shot .onb-draft > .kit-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 const save=calls.filter(c=>c[0]==='save');assert.equal(save.length,1);
 assert.deepEqual(save[0].slice(1,2),['draft-1']);assert.equal(save[0][2].start,later);assert.deepEqual(save[0][2].skip,['d3','t2']);assert.match(save[0][2].welcome,/Это Петя/);
 assert.equal(await js("document.querySelector('#card-shot .onb-draft .kit-chip').textContent"),'сохранено');
 await js("document.getElementById('card-shot').remove()");
 // The plan: tick an item of today, the column and the facts update; the trash removes with «Отменить».
 assert.equal(await q(0,'.onb-day.is-today'),1);assert.equal(await q(0,'.onb-item.is-done'),4);
 const before=await js("document.querySelectorAll('.onb-plan .onb-fill')[2].style.height");
 await js("(()=>{const c=document.querySelector('.onb-plan');for(const d of c.querySelectorAll('.onb-group'))d.open=true;const b=[...c.querySelectorAll('.onb-item')].find(li=>!li.classList.contains('is-done')&&li.querySelector('.onb-title').textContent==='Иван Козлов').querySelector('.onb-check');b.checked=true;b.dispatchEvent(new Event('change'));})()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='check'))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='check'),['check','plan-2','p2',true]);
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.onb-plan .onb-fill')[2].style.height")!==before)break;await new Promise(r=>setTimeout(r,30));}
 assert.notEqual(await js("document.querySelectorAll('.onb-plan .onb-fill')[2].style.height"),before,'the day column fills');
 assert.equal(await q(1,'.onb-row'),2);
 await require('./card-shot.cjs')(win,'.onb-plan,.onb-listcard','petya-onboarding-plan');
 await js("document.querySelector('#card-shot .onb-plan .delete-button').click()");
 for(let i=0;i<60;i++){if(await js("!!document.querySelector('.onb-plan.is-removed')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='restore'))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='restore'),['restore',{id:'plan-2'}]);
 // The welcome block with its review and the hand-off button, drawn again for a close look.
 await js("document.getElementById('card-shot')?.remove()");
 await js(`showDialogueMessages([{role:'assistant',text:'Онбординг · Аня Смирнова …',by:'Онбординг новичка',extensionData:{onboardingCard:${JSON.stringify({...draft,draftId:'draft-9'})}}}],'Онбординг')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.onb-draft .kit-review:not([hidden])')&&!!document.querySelector('.onb-draft .kit-link')"))break;await new Promise(r=>setTimeout(r,50));}
 await require('./card-shot.cjs')(win,'.onb-draft .onb-welcome,.onb-draft > .kit-actions','petya-onboarding-welcome');
 console.log('Onboarding cards: draft with day strip, sources, skips, new first day, reviewed welcome hand-off and one save; plan ticking and undoable trash; list passed');
}};
require('../src/main.cjs');
