const fs=require('node:fs'),path=require('node:path'),load=require('node:module').createRequire(path.resolve(__dirname,'../package.json'));
process.env.PETYA_SMOKE_TEST='1';
const {Dialogue}=load('./src/dialogue.cjs'),original=Dialogue.prototype.active;let dialogue;
Dialogue.prototype.active=function(...args){dialogue=this;return original.apply(this,args);};
const {ReportShare}=load('./src/extensions/slack/report-share.cjs'),openShare=ReportShare.prototype.open;let pages=0,posts=0;
ReportShare.prototype.open=function(...args){this.enabled=()=>true;this.settings=()=>({slackToken:'fixture',jiraUrl:'https://fixture.atlassian.net'});this.request=async url=>{
 if(url.endsWith('/auth.test'))return {ok:true,team_id:'T1',team:'Fixture'};
 if(url.includes('conversations.list')){pages++;return {ok:true,channels:pages>3?[{id:'C1',name:'exact-channel'}]:[],response_metadata:{next_cursor:'p'+pages}};}
 if(url.includes('conversations.info'))return {ok:true,channel:{id:'C1',name:'exact-channel'}};
 posts++;throw Error('Unexpected send');
};return openShare.apply(this,args);};
const key=load.resolve('./tests/smoke.cjs');
require.cache[key]={id:key,filename:key,loaded:true,exports:async win=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'petya-ui-change-'))),file=path.join(dir,'notes.txt');fs.writeFileSync(file,'План проекта\n1. Старая строка\n2. Старая строка');
 const js=s=>win.webContents.executeJavaScript(s),sleep=n=>new Promise(r=>setTimeout(r,n));
 const wait=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await sleep(100);}throw Error('Timeout '+s+' '+await js("document.querySelector('.change-error')?.textContent"));};
 try{
  await js('window.chatNavigationReady');
  const t={id:'change-test',title:'Правка материала',kind:'chat',projectId:'general',at:Date.now(),messages:[{role:'user',text:'Обновим план',at:Date.now(),attachments:[{id:'file-test',name:'notes.txt',type:'text',text:'План проекта\n1. Старая строка\n2. Старая строка',localSourcePath:file}]}]};
  dialogue.state.topics.push(t);dialogue.state.activeId=t.id;dialogue.persist();
  win.setContentSize(1190,820);win.show();await js("(async()=>{await selectDialogueTopic('change-test');view('home');})()");
  await wait("[...document.querySelectorAll('.chat-result-card button')].some(b=>b.textContent==='Изменить')");
  await js("$('command').value='Замени в файле «Старая» на «Новая»';window.sendChatNow();true");
  await wait("!!document.querySelector('.chat-change-card') && !window.chatJobBusy(topicSelect.value)");
  await js("$('command').value='Нет, поменяй только второй пункт';window.sendChatNow();true");
  await wait("document.querySelectorAll('.chat-change-card').length===2 && !window.chatJobBusy(topicSelect.value)");
  if(await js("[...document.querySelectorAll('.chat-change-card')].at(-1).querySelectorAll('.change-diff').length")!==1)throw Error('Correction diff mismatch');
  await js("const recap=document.querySelector('.chat-return-summary');recap.hidden=false;recap.querySelector('span').textContent='Последняя тема — «какая версия проекта сейчас».'");
  for(const width of [1190,700]){win.setContentSize(width,820);await sleep(200);const box=await js("(()=>{const n=document.querySelector('.chat-return-summary'),r=n.getBoundingClientRect(),b=n.querySelector('button').getBoundingClientRect();return {height:r.height,width:r.width,left:r.left,right:r.right,closeLeft:b.left,position:getComputedStyle(n).position,viewport:innerWidth}})()");if(box.height>100||box.position==='fixed'||box.left<0||box.right>box.viewport||box.closeLeft<box.left+box.width/2)throw Error('Bad recap layout '+JSON.stringify(box));}
  win.setContentSize(1190,820);
  if(fs.readFileSync(file,'utf8').includes('Новая'))throw Error('Premature write');
  await sleep(500);fs.writeFileSync(path.join(require('node:os').tmpdir(),'petya-change-preview.png'),(await win.webContents.capturePage()).toPNG());
  await js("[...document.querySelectorAll('.chat-change-card button')].find(b=>b.textContent==='Применить').click()");
  await wait("[...document.querySelectorAll('.chat-change-card button')].some(b=>b.textContent==='Предпросмотр отката')");
  if(!fs.readFileSync(file,'utf8').includes('Новая'))throw Error('Missing write');
  await js("[...document.querySelectorAll('.chat-change-card button')].find(b=>b.textContent==='Предпросмотр отката').click()");
  await wait("[...document.querySelectorAll('.chat-change-card button')].some(b=>b.textContent==='Применить')");
  await js("[...document.querySelectorAll('.chat-change-card button')].find(b=>b.textContent==='Применить').click()");
  await wait("[...document.querySelectorAll('.chat-change-card')].some(c=>c.textContent.includes('Изменение отменено.'))");
  if(!fs.readFileSync(file,'utf8').includes('Старая'))throw Error('Undo failed');
  t.workReport={id:'report-fixture',project:'TEST',site:'https://fixture.atlassian.net',at:Date.now(),text:'Текст отчёта',sources:[]};dialogue.persist();
  await js("window.offerReportShare('report-fixture',dialogueChoices);[...dialogueChoices.querySelectorAll('button')].find(b=>b.textContent==='Подготовить сообщение команде').click()");
  await wait("!document.querySelector('#report-share-form').hidden && document.querySelector('#report-share-channel-hint').textContent.includes('часть')");
  await js("$('report-share-text').value='Моя правка отчёта';$('report-share-filter').value='#exact-channel';$('report-share-filter').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));");
  await wait("document.querySelector('#report-share-channel').value==='C1' && !document.querySelector('#report-share-send').disabled");
  if(await js("$('report-share-text').value")!=='Моя правка отчёта'||posts!==0)throw Error('Lookup lost text or sent a message');
  await sleep(350);fs.writeFileSync(path.join(require('node:os').tmpdir(),'petya-report-lookup.png'),(await win.webContents.capturePage()).toPNG());
  console.log('Live UI natural language, recap sizes, correction: edit, preview without write, apply, receipt, undo confirmation, undo passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}};load('./src/main.cjs');
