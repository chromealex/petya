// «Вики из обсуждений» cards in the real chat, from real drafts: the thread as a timeline by author, counts and the
// owner, the editable page, where to publish (Notion asks for the parent page), «Опубликовать» sending exactly the
// editor's text through the app's IPC, the `document-export` link for a new Google Doc, and the update card with its
// diff against the existing Confluence page. Message text never becomes HTML.
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/wiki-author/feature.cjs');
const msgs=require('../src/features/messenger-sources.cjs');

const R=k=>k.padEnd(26,'0');
const at=d=>'2026-11-0'+d;
const thread=[[R('r1'),'Олег Смирнов','Матчмейкинг: что делаем с долгим поиском на ночном онлайне?',at(3)+'T09:00:00Z',4],['a1','Мария Ким','Предлагаю расширять окно рейтинга на 50 каждые 10 секунд поиска.',at(3)+'T11:30:00Z'],
 ['a2','Иван Петров','А ботов подмешивать после 40 секунд? <img src=x onerror=alert(1)>',at(4)+'T08:10:00Z'],['a3','Мария Ким','Договорились: окно расширяем до 300 рейтинга, ботов не подмешиваем в ранговых.',at(5)+'T15:00:00Z'],
 ['a4','Олег Смирнов','Ок, матчмейкинг для турниров обсудим отдельно?',at(5)+'T16:20:00Z']].map(([id,author,text,when,replies])=>({id,channel:{id:'C1',name:'game-design'},thread:R('r1'),author:{id:author,name:author},text,at:when,url:'https://chat.studio.example/game/pl/'+id,replies:replies||0}));
const source={id:'chat',extension:'chat',setting:null,name:'Чат студии',source:{name:'Чат студии',ready:()=>true,channels:async()=>[],messages:async()=>({messages:[]}),thread:async()=>({messages:thread}),search:async()=>({messages:thread})}};
const TEAM=[{key:'masha',name:'Мария Ким'}];

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js("window.resultKit.availableLinks=async kind=>kind==='document-export'?[{id:'google-drive',name:'Google Диск',label:'Сохранить в Google Документы'}]:[];0");
 const topic={id:'t1',title:'Чат',messages:[]};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-wiki-ui-'));
 const s={settings:{'extension_wiki-author':'true',model:'',module_notion:'true',notionToken:'notion-test',module_confluence:'true',jiraUrl:'https://studio.atlassian.net',jiraEmail:'lead@studio.example',jiraToken:'jira-test',confluenceSpace:'GAME'},
  dataRoot:root,requestProgress:{report(){}},people:{find:t=>{const m=TEAM.find(p=>String(t).includes(p.name));return m?{member:m}:null;}},
  workspace:{searchDocs:async()=>({docs:[],warnings:[]}),api:async route=>{if(/pages\/555/.test(route))return {id:'555',title:'Матчмейкинг',version:{number:4},body:{storage:{value:'<h1>Матчмейкинг</h1><h2>Итоги</h2><p>Окно рейтинга — 200, ботов подмешиваем после 30 секунд.</p>'}}};throw Error('unexpected');}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}}};
 s.messengerSources=msgs.create(s,{sources:[source],now:()=>Date.parse('2026-11-09T10:00:00Z')});
 const card=(await app.turn(s,'оформи в вики итоги треда про матчмейкинг')).extensionData.wikiCard;
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name!=='wikiAuthor')return null;
  calls.push([method,...args]);
  if(method==='state')return {state:'draft',url:''};
  if(method==='publish')return {ok:true,url:'https://www.notion.so/Matchmaking-1f2e3d4c5b6a47898abcdef012345678',text:'Страница «Матчмейкинг» создана в Notion'};
  return null;
 });
 const show=async(c,user)=>{
  await js(`view('home');showDialogueMessages([{role:'user',text:${JSON.stringify(user)}},{role:'assistant',text:'Готово.',by:'Вики из обсуждений',extensionData:{wikiCard:${JSON.stringify(c)}}}],'Вики')`);
  for(let i=0;i<150;i++){if(await js("!!document.querySelector('.wiki-card')"))break;await new Promise(r=>setTimeout(r,30));}
 };
 await show(card,'оформи в вики итоги треда про матчмейкинг');
 assert.equal(await js("document.querySelectorAll('.wiki-dot').length"),5);
 assert.equal(await js("document.querySelector('.wiki-text').value"),card.text);
 assert.equal(await js("document.querySelectorAll('.wiki-card img').length"),0,'message text is never HTML');
 assert.match(await js("document.querySelector('.wiki-chips').textContent"),/ответственный: Мария Ким/);
 assert.deepEqual(await js("[...document.querySelectorAll('.wiki-dest-btn')].map(b=>b.textContent+':'+b.getAttribute('aria-pressed'))"),['Confluence:true','Notion:false']);
 assert.equal(await js("document.querySelector('.wiki-parent').hidden"),true);
 await js("[...document.querySelectorAll('.wiki-dest-btn')][1].click()");
 assert.equal(await js("document.querySelector('.wiki-parent').hidden"),false,'Notion asks for the parent page');
 await js("(()=>{const i=document.querySelector('.wiki-parent');i.value='https://www.notion.so/studio/Wiki-0a1b2c3d4e5f60718293a4b5c6d7e8f9';})()");
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.wiki-card .kit-link').length>0"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.wiki-card .kit-link').textContent"),'Сохранить в Google Документы');
 const shot=await require('./card-shot.cjs')(win,'.wiki-card','petya-wiki-author');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(path.join(os.tmpdir(),'petya-wiki-author-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot')?.remove()");
 // Publish: exactly the editor's text, to the chosen place.
 await show(card,'оформи в вики итоги треда про матчмейкинг');
 await js("(()=>{const a=document.querySelector('.wiki-text');a.value=a.value.replace('# Матчмейкинг','# Матчмейкинг ночью');[...document.querySelectorAll('.wiki-dest-btn')][1].click();document.querySelector('.wiki-parent').value='https://www.notion.so/studio/Wiki-0a1b2c3d4e5f60718293a4b5c6d7e8f9';document.querySelector('.wiki-card .kit-actions button.primary').click();})()");
 for(let i=0;i<100;i++){if(calls.some(c=>c[0]==='publish'))break;await new Promise(r=>setTimeout(r,30));}
 const p=calls.find(c=>c[0]==='publish');
 assert.equal(p[1],card.draftId);assert.equal(p[2],'notion');assert.match(p[3],/^# Матчмейкинг ночью/);assert.equal(p[4].parent,'https://www.notion.so/studio/Wiki-0a1b2c3d4e5f60718293a4b5c6d7e8f9');
 for(let i=0;i<50;i++){if(await js("document.querySelector('.wiki-text').readOnly"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("[...document.querySelectorAll('.wiki-card .kit-actions button')].some(b=>!b.hidden&&/Открыть страницу/.test(b.textContent))"),true);
 // --- The update of an existing page: its diff -------------------------------------------------------------------------
 s.workspace.searchDocs=async()=>({docs:[{id:'confluence:555',source:'Confluence',title:'Матчмейкинг',text:'',url:'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=555',updated:''}],warnings:[]});
 let q;try{await app.turn(s,'оформи в вики итоги треда про матчмейкинг');}catch(e){q=e;}
 const upd=(await q.resume('Обновить «Матчмейкинг» (Confluence)')).extensionData.wikiCard;
 await show(upd,'оформи в вики итоги треда про матчмейкинг');
 assert.ok(await js("document.querySelectorAll('.wiki-diff del').length")>0);
 assert.equal(await js("document.querySelectorAll('.wiki-dest-btn').length"),0,'an update goes to the page itself');
 assert.equal(await js("document.querySelector('.wiki-card .kit-actions button.primary').textContent"),'Обновить страницу');
 const upShot=await require('./card-shot.cjs')(win,'.wiki-card','petya-wiki-author-update');
 console.log('Wiki author cards ('+shot+', '+upShot+'): timeline by author, owner, destinations with the Notion parent, exact publish through IPC, Google Docs link, update diff passed');
}};
require('../src/main.cjs');
