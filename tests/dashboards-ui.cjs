// Dashboards in the app: «Сделать дашбордом» in the chat header, the dashboard in place of the chat (the sidebar
// stays), widgets drawn by the extension renderers and refreshed, the sidebar row, «В дашборд…» on an answer,
// the start screen of the project, and «Собери дашборд: …» in the chat.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const shots=process.env.DASH_SHOTS||'';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(code,label)=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout: '+(label||code)+' DBG '+await js("JSON.stringify({screen:document.querySelector('.dash-screen')?.hidden,widgets:[...document.querySelectorAll('.dash-widget')].map(w=>w.dataset.kind+':'+w.querySelector('h3').textContent),toasts:[...document.querySelectorAll('.kit-toast,#notice')].map(t=>t.textContent).join('|'),cls:document.querySelector('#home .chat-shell')?.className})"));};
 const shot=async name=>{if(!shots)return;await js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove())");if(!win.isVisible())win.show();win.setSize(1440,900);win.webContents.invalidate();await new Promise(r=>setTimeout(r,700));const img=await win.webContents.capturePage();require('node:fs').writeFileSync(require('node:path').join(shots,name+'.png'),img.toPNG());};
 const s=globalThis.petyaTestServices;
 // A read the dashboard can refresh: the «Крэши» extension answers with a chart (stands in for Sentry here).
 const crashes=require('../src/extensions/crashes/feature.cjs');let reads=0;
 crashes.turn=async(sx,command)=>{reads++;return require('../src/extensions/app-kit.cjs').reply(sx,command,{by:'Крэши',text:'Крэшей: '+reads,data:{charts:[{type:'bars',title:'Крэши по дням',rows:[{label:'пн',value:3+reads},{label:'вт',value:5},{label:'ср',value:2}]}]}});};
 s.settings.extension_crashes='true';
 await js('window.chatNavigationReady');await js("view('home')");
 const send=require('./chat-send.cjs')(win);await js("selectDialogueTopic('')");await send('Привет');
 const id=await js('topicSelect.value');assert(id);
 const topic=s.dialogue.state.topics.find(t=>t.id===id),now=Date.now();
 topic.messages.push({role:'user',text:'Петя, крэши за неделю',at:now},{role:'assistant',text:'Крэшей: 0',by:'Крэши',extensionData:{charts:[{type:'donut',title:'Крэши',rows:[{label:'Android',value:4},{label:'iOS',value:2}]}]},at:now+1},
  {role:'user',text:'какие платформы',at:now+2},{role:'assistant',text:'Платформы',extensionData:{charts:[{type:'donut',title:'Платформы',rows:[{label:'Android',value:7},{label:'iOS',value:3}]}]},at:now+3});
 s.dialogue.persist();await js('selectDialogueTopic('+JSON.stringify(id)+')');
 // The chat header offers to make a dashboard of it.
 await wait("document.getElementById('chat-dashboard-open')?.textContent.includes('Сделать дашбордом')",'header button');
 await js("document.getElementById('chat-dashboard-open').click()");
 await wait("!document.querySelector('.dash-screen').hidden&&document.querySelectorAll('.dash-widget').length===3",'dashboard shown (the smoke greeting carries a chart too)');
 assert.equal(await js("getComputedStyle(document.querySelector('#home .chat-feed')).display"),'none','the dashboard takes the chat\'s place');
 assert(await js("!!document.querySelector('#project-sidebar')&&getComputedStyle(document.querySelector('#project-sidebar')).display!=='none'"),'the sidebar stays');
 await wait("document.querySelector('.dash-widget[data-kind=extension] .chart-card')&&document.querySelector('.dash-widget[data-kind=extension] .dash-widget-meta time')",'refreshed widget drawn by the charts renderer');
 assert(reads>=1);assert.equal(s.dialogue.state.topics.find(t=>t.id===id).messages.length,6,'refresh writes nothing to the chat');
 assert.equal(await js("document.querySelector('.dash-widget[data-kind=snapshot] .dash-widget-meta').textContent.startsWith('снимок')"),true);
 await wait("[...document.querySelectorAll('.project-dashboard-row button')].some(b=>b.getAttribute('aria-current')==='true')",'sidebar row');
 await shot('dashboard');
 // Widget menu: size.
 await js("document.querySelector('.dash-widget[data-kind=extension] .dash-widget-tools .dash-tool:last-child').click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent==='Во всю ширину')",'widget menu');
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent==='Во всю ширину').click()");
 await wait("document.querySelector('.dash-widget[data-kind=extension]')?.dataset.size==='w'",'resized');
 // Adder: ready widgets of connected apps.
 await js("[...document.querySelectorAll('.dash-head-tools button')].find(b=>b.textContent==='Добавить виджет').click()");
 await wait("[...document.querySelectorAll('.dash-chip')].some(c=>c.textContent.includes('Новые крэши'))",'catalog chips');
 await shot('dashboard-adder');
 await js("[...document.querySelectorAll('.dash-chip')].find(c=>c.textContent.includes('Новые крэши')).click()");
 await wait("document.querySelectorAll('.dash-widget').length===4",'widget added');
 // Start screen of the project.
 await js("document.querySelector('.dash-head-tools .dash-tool').click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent.startsWith('Показывать при открытии проекта'))");
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.startsWith('Показывать при открытии проекта')).click()");
 await wait("[...document.querySelectorAll('.dash-badge')].some(b=>b.textContent==='Стартовый экран проекта')",'start badge');
 // Back to the chat; a new chat shows the start dashboard under «Чем помочь?».
 await js("document.querySelector('.dash-head-title .dash-tool').click()");
 await wait("document.querySelector('.dash-screen').hidden&&getComputedStyle(document.querySelector('#home .chat-feed')).display!=='none'",'back to chat');
 await wait("document.getElementById('chat-dashboard-open').textContent.includes('Дашборд')&&!document.getElementById('chat-dashboard-open').textContent.includes('Сделать')",'header now opens it');
 await js("selectDialogueTopic('')");
 await wait("!document.querySelector('.dash-start').hidden&&document.querySelectorAll('.dash-start .dash-widget').length===4",'start screen');
 await shot('start-screen');
 // «В дашборд…» on an answer with a card.
 await js('selectDialogueTopic('+JSON.stringify(id)+')');
 await wait("[...document.querySelectorAll('.answer-menu-items button')].some(b=>b.textContent==='В дашборд…')",'pin item');
 await js("(()=>{const b=[...document.querySelectorAll('.answer-menu-items button')].filter(b=>b.textContent==='В дашборд…').at(-1);b.closest('details').open=true;b.click();})()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent==='Новый дашборд')",'pin menu');
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent==='Новый дашборд').click()");
 await wait("[...document.querySelectorAll('.kit-toast')].some(t=>t.textContent.includes('в «Мой дашборд»'))",'pinned');
 // «Собери дашборд: …» in the chat: the reply has a button that opens it.
 await send('Собери дашборд «Релиз»: крэши за неделю');
 await wait("[...document.querySelectorAll('.dash-open-reply')].some(b=>b.textContent.includes('Релиз'))",'compose reply');
 await js("[...document.querySelectorAll('.dash-open-reply')].find(b=>b.textContent.includes('Релиз')).click()");
 await wait("document.querySelector('.dash-head h1')?.textContent==='Релиз'",'composed dashboard opened');
 const rows=await js("[...document.querySelectorAll('.project-dashboard-row .project-chat-title')].map(n=>n.textContent)");
 assert(rows.includes('Релиз')&&rows.includes('Мой дашборд'),'all dashboards in the sidebar: '+rows);
 await shot('composed');
 // Jira cards on a dashboard are drawn by the Jira renderer, as in the chat.
 const jt=s.dialogue.state.topics.find(t=>t.id===id);jt.messages.push({role:'user',text:'что в работе',at:Date.now()},{role:'assistant',text:'2 задачи',jiraItems:[{key:'BW-1',site:'https://bw.atlassian.net',summary:'Падает загрузка уровня',status:'В работе',category:'indeterminate',assignee:'Полина',priority:'High',type:'Bug'},{key:'BW-2',site:'https://bw.atlassian.net',summary:'Новый экран магазина',status:'К выполнению',category:'new',assignee:'',priority:'Medium',type:'Task'}],at:Date.now()+1});
 const jdash=await js("document.querySelector('.dash-screen').dataset.id");
 s.dialogue.persist();await js("window.petya.feature('dashboards','pin',"+JSON.stringify(jdash)+","+JSON.stringify(id)+","+(jt.messages.length-1)+")");
 await js("window.openDashboard("+JSON.stringify(jdash)+")");
 await wait("document.querySelectorAll('.dash-widget .jira-issue-card').length===2",'jira widget shows the pinned card at once');
 await shot('jira');
 // A small window on top of the others: the same widgets, drawn by the card renderers; it can only read its dashboard.
 const dashId=await js("document.querySelector('.dash-screen').dataset.id");
 await js("[...document.querySelectorAll('.dash-head-tools .dash-tool')].at(-1).click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent.startsWith('Открыть в отдельном окне'))");
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.startsWith('Открыть в отдельном окне')).click()");
 const {BrowserWindow}=require('electron');let mini;
 for(let i=0;i<100&&!mini;i++){mini=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('dashboard-window.html'));if(!mini)await new Promise(r=>setTimeout(r,60));}
 assert(mini,'the small window opened');assert(mini.isAlwaysOnTop(),'on top by default');
 const mjs=code=>mini.webContents.executeJavaScript(code);
 for(let i=0;i<150;i++){if(await mjs("!!document.querySelector('.dash-widget .chart-card')").catch(()=>false))break;await new Promise(r=>setTimeout(r,60));}
 assert(await mjs("document.querySelector('.dash-window-head h1').textContent==='Релиз'&&!!document.querySelector('.dash-widget .chart-card')"),'the small window draws the widgets');
 assert.equal(await mjs("typeof window.petya"),'undefined','the small window has no access to the rest of Petya');
 await assert.rejects(()=>mjs("window.petyaDashboard.top(false)").then(on=>{if(on!==false)throw Error('still on top');throw Error('ok');}),/ok/);
 if(shots){mini.show();mini.webContents.invalidate();await new Promise(r=>setTimeout(r,700));require('node:fs').writeFileSync(require('node:path').join(shots,'mini.png'),(await mini.webContents.capturePage()).toPNG());}
 // «В Пете» in the small window opens the dashboard in the main window.
 await js("selectDialogueTopic('')");await wait("document.querySelector('.dash-screen').hidden");
 await mjs("window.petyaDashboard.openMain()");await wait("!document.querySelector('.dash-screen').hidden&&document.querySelector('.dash-screen').dataset.id==="+JSON.stringify(dashId),'opened in the main window');
 mini.close();
 console.log('Dashboards UI: chat → dashboard, refresh, sidebar, widget menu, adder, start screen, pin and compose passed');
}};
require('../src/main.cjs');
