// «Скриншот → задача» in the real window: the region picker (region.html) answers a drag with the rectangle; the
// card shows the screenshot on a canvas, a frame and a blur drawn with the mouse are saved as PNG with their
// shapes; the drafted bug fields; the tracker button hands the bug to Jira's flow and then offers «Прикрепить
// скриншот к KEY» (upload stubbed); without a vision model the card offers the download.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 const electron=require('electron');
 // 0. Settings (the app added from the catalog): the shortcut field shows the default and records a combination.
 await js("window.extensionHost.open('screenshot-task',{stay:true})");
 await wait("document.querySelector('[data-extension=\"screenshot-task\"] input[name=screenshotTaskShortcut]')?.value==='CommandOrControl+Shift+2'",'settings card');
 assert.equal(await js(`(()=>{const c=document.querySelector('[data-extension="screenshot-task"]');[...c.querySelectorAll('button')].find(b=>b.textContent==='Записать с клавиатуры').click();const i=c.querySelector('input');i.dispatchEvent(new KeyboardEvent('keydown',{key:'7',code:'Digit7',ctrlKey:true,altKey:true,bubbles:true}));return i.value;})()`),'CommandOrControl+Alt+7');
 // 1. The region picker: a real window with region.html; a drag answers with the rectangle.
 const capture=require('../src/extensions/screenshot-task/capture.cjs');
 const display={id:1,bounds:{x:0,y:0,width:800,height:500},scaleFactor:1};
 const picking=capture.pick?capture.pick(electron,display,'data:image/png;base64,'):null;
 if(picking){
  let pickerWin=null;for(let i=0;i<100&&!pickerWin;i++){pickerWin=electron.BrowserWindow.getAllWindows().find(w=>w!==win&&/region\.html/.test(w.webContents.getURL())&&w.isVisible());await new Promise(r=>setTimeout(r,50));}
  assert.ok(pickerWin,'the picker window opened');
  for(const [type,x,y] of [['mouseDown',100,80],['mouseMove',200,140],['mouseMove',340,230],['mouseUp',340,230]])pickerWin.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});
  const answer=await picking;
  assert.deepEqual(answer,{kind:'rect',rect:{x:100,y:80,w:240,h:150}});
 }
 // 2. A stored shot: a drawn checkout screen with a card number to hide.
 const shotUrl=await js(`(()=>{const c=document.createElement('canvas');c.width=1280;c.height=760;const g=c.getContext('2d');
  g.fillStyle='#f4f5f7';g.fillRect(0,0,1280,760);g.fillStyle='#1d2433';g.fillRect(0,0,1280,64);g.fillStyle='#fff';g.font='600 24px sans-serif';g.fillText('Shop · Оформление заказа',32,42);
  g.fillStyle='#fff';g.fillRect(32,96,760,520);g.strokeStyle='#dde1e7';g.strokeRect(32,96,760,520);
  g.fillStyle='#222';g.font='20px sans-serif';[['Наушники Pro','12 990 ₽'],['Чехол','990 ₽'],['Доставка','0 ₽']].forEach(([a,b],i)=>{g.fillText(a,64,150+i*56);g.fillText(b,640,150+i*56);g.fillStyle='#eef0f3';g.fillRect(64,166+i*56,700,1);g.fillStyle='#222';});
  g.font='16px sans-serif';g.fillStyle='#667';g.fillText('Номер карты',64,350);g.strokeStyle='#c4c9d2';g.strokeRect(64,362,420,48);g.fillStyle='#222';g.font='22px monospace';g.fillText('4276 1234 5678 9012',80,394);
  g.fillStyle='#9aa3b2';g.fillRect(64,470,240,56);g.fillStyle='#fff';g.font='600 22px sans-serif';g.fillText('Купить',140,506);
  g.fillStyle='#c0392b';g.font='15px sans-serif';g.fillText('Ошибка: не удалось связаться с сервером оплаты (502)',64,560);
  g.fillStyle='#fff';g.fillRect(824,96,424,280);g.strokeStyle='#dde1e7';g.strokeRect(824,96,424,280);g.fillStyle='#222';g.font='600 22px sans-serif';g.fillText('Итого: 13 980 ₽',856,150);
  return c.toDataURL('image/png');})()`);
 const app=require('../src/extensions/screenshot-task/feature.cjs');
 const dir=path.join(electron.app.getPath('userData'),'screenshot-task');fs.mkdirSync(dir,{recursive:true});
 const ids=['8d1f2a40-1111-4c3b-9a55-0c2d3e4f5a61','8d1f2a40-2222-4c3b-9a55-0c2d3e4f5a62'];
 for(const id of ids){fs.writeFileSync(path.join(dir,id+'.png'),Buffer.from(shotUrl.split(',')[1],'base64'));const meta={id,width:1280,height:760,window:{app:'Safari',title:'Shop · Оформление заказа'},at:Date.now()};fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({...meta,shapes:[]}));app.state.shots.set(id,meta);}
 const attach=require('../src/extensions/screenshot-task/attach.cjs');const uploads=[];
 attach.recent=()=>[{provider:'jira',key:'MOB-321',url:'https://acme.atlassian.net/browse/MOB-321'}];
 attach.upload=async(s,args)=>{uploads.push({...args,bytes:fs.statSync(args.file).size});return {provider:'jira',key:args.key,name:args.name,url:'https://acme.atlassian.net/browse/'+args.key};};
 // Jira connected (from the page, like app-links-ui), the chat hand-off captured instead of sent.
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token'})");
 await js("view('home');window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};window.resultKit.availableLinks.clear()");
 const drafted={id:ids[0],width:1280,height:760,window:'Safari — Shop · Оформление заказа',note:'кнопка Купить серая',at:Date.now(),vision:{model:'gemma3:4b',name:'gemma3:4b',size:3.3e9},
  draft:{title:'Кнопка «Купить» неактивна после ошибки оплаты 502',steps:['Добавить товары в корзину','Открыть оформление заказа','Ввести номер карты'],expected:'Кнопка «Купить» активна, оплата проходит',actual:'Показана ошибка 502, кнопка серая и не нажимается'}};
 const bare={id:ids[1],width:1280,height:760,window:'',note:'',at:Date.now(),vision:{model:null,name:'gemma3:4b',size:3.3e9},draft:null};
 const msg=(text,d)=>({role:'assistant',text,by:'Скриншот → задача',extensionData:{screenshotTask:d}});
 await js(`showDialogueMessages([{role:'user',text:'сделай баг из скриншота: кнопка Купить серая'},${JSON.stringify(msg('Набросал баг по скриншоту.',drafted))},{role:'user',text:'скрин в задачу'},${JSON.stringify(msg('Скриншот готов.',bare))}],'Баг')`);
 await wait("document.querySelectorAll('.shot-card').length===2&&[...document.querySelectorAll('.shot-card canvas')].every(c=>c.width===1280)",'cards with pictures');
 const card=id=>`document.querySelector('.shot-card[data-shot-id="${id}"]')`;
 assert.equal(await js(`${card(ids[0])}.querySelector('input[name=title]').value`),drafted.draft.title);
 assert.equal(await js(`${card(ids[0])}.querySelector('textarea[name=steps]').value`),drafted.draft.steps.join('\n'));
 assert.deepEqual(await js(`[...${card(ids[0])}.querySelectorAll('.shot-tool span')].map(s=>s.textContent)`),['Рамка','Стрелка','Текст','Размыть','Отменить']);
 assert.match(await js(`${card(ids[1])}.querySelector('.shot-model button').textContent`),/^Скачать модель для скриншотов · 3,3 ГБ$/);
 if(!win.isVisible())win.showInactive();
 // The first-run introduction covers the chat in a fresh profile: it is not part of this card.
 await js("document.querySelectorAll('.onb').forEach(n=>n.style.display='none')");
 // Draw a frame around the button and blur the card number with the mouse (CSS → image pixels).
 const drag=async(sel,tool,[x1,y1],[x2,y2])=>{
  await js(`${sel}.querySelector('.shot-tool[data-tool=${tool}]').click()`);
  await js(`${sel}.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'})`);await new Promise(r=>setTimeout(r,400));
  const box=await js(`(()=>{const c=${sel}.querySelector('canvas');const r=c.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===c,top:(()=>{const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e?e.tagName+'.'+e.className+' < '+(e.parentElement?.className||'')+' < '+(e.parentElement?.parentElement?.className||''):'none';})()};})()`);
  assert.ok(box.hit,'the canvas is under the pointer: '+JSON.stringify(box));
  const at=(x,y)=>({x:Math.round(box.x+x*box.w/1280),y:Math.round(box.y+y*box.h/760)});
  const a=at(x1,y1),b=at(x2,y2);
  win.webContents.sendInputEvent({type:'mouseDown',...a,button:'left',clickCount:1});
  for(let i=1;i<=4;i++)win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(a.x+(b.x-a.x)*i/4),y:Math.round(a.y+(b.y-a.y)*i/4),button:'left'});
  win.webContents.sendInputEvent({type:'mouseUp',...b,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,80));
 };
 await drag(card(ids[0]),'blur',[70,368],[480,406]);
 await drag(card(ids[0]),'rect',[50,455],[320,540]);
 await drag(card(ids[0]),'arrow',[560,470],[330,500]);
 const annotated=path.join(dir,ids[0]+'-annotated.png');
 for(let i=0;i<100&&!(fs.existsSync(annotated)&&JSON.parse(fs.readFileSync(path.join(dir,ids[0]+'.json'),'utf8')).shapes.length===3);i++)await new Promise(r=>setTimeout(r,50));
 const saved=JSON.parse(fs.readFileSync(path.join(dir,ids[0]+'.json'),'utf8')).shapes;
 assert.deepEqual(saved.map(s=>s.type),['blur','rect','arrow'],'shapes saved with the PNG');
 assert.ok(saved[0].w>300&&saved[0].x>60&&saved[0].x<90,'shape in image pixels: '+JSON.stringify(saved[0]));
 // The blurred number is unreadable: the pixels there now repeat in blocks.
 const blocky=await js(`(()=>{const c=${card(ids[0])}.querySelector('canvas'),g=c.getContext('2d');const d=g.getImageData(${Math.round(saved[0].x)},${Math.round(saved[0].y)},40,1).data;let same=0;for(let i=4;i<d.length;i+=4)if(d[i]===d[i-4])same++;return same;})()`);
 assert.ok(blocky>=30,'pixelated area: '+blocky);
 // Hand-off to Jira's own flow, then «Прикрепить скриншот к MOB-321».
 await wait(`!!${card(ids[0])}.querySelector('.kit-link[data-provider=jira]')`,'Jira button');
 assert.equal(await js(`${card(ids[0])}.querySelector('.kit-link').textContent`),'В задачу Jira');
 await js(`${card(ids[0])}.querySelector('.kit-link').click()`);
 await wait('window.__asked.length===1','hand-off');
 const [asked,send]=(await js('window.__asked'))[0];
 assert.match(asked,/^Создай задачу в Jira: Баг\. Кнопка «Купить» неактивна после ошибки оплаты 502\. Шаги: 1\) Добавить товары в корзину 2\) Открыть оформление заказа 3\) Ввести номер карты\. Ожидалось: .*Фактически: .*Окно: Safari — Shop · Оформление заказа$/);assert.equal(send,true);
 await wait(`!${card(ids[0])}.querySelector('.shot-attach').hidden&&${card(ids[0])}.querySelector('.shot-attach input').value==='MOB-321'`,'attach offered for the created task');
 assert.equal(await js(`${card(ids[0])}.querySelector('.shot-attach button').textContent`),'Прикрепить скриншот к MOB-321');
 assert.equal(uploads.length,0,'nothing uploaded before the press');
 const shot=require('./card-shot.cjs');
 const first=await shot(win,`.shot-card[data-shot-id="${ids[0]}"]`,'petya-screenshot-task');
 // The lower half of the card (model row, tracker, attach) in a second picture.
 const bottom=async name=>{await js("document.getElementById('card-shot').scrollTop=1e6");await new Promise(r=>setTimeout(r,200));const f=path.join(require('node:os').tmpdir(),name+'.png');fs.writeFileSync(f,(await win.webContents.capturePage()).toPNG());return f;};
 const firstBottom=await bottom('petya-screenshot-task-bottom');
 await js(`document.querySelector('#card-shot .shot-attach button').click()`);
 await wait(`!!document.querySelector('#card-shot .shot-attached')`,'attached');
 assert.equal(uploads.length,1);assert.equal(uploads[0].key,'MOB-321');assert.equal(uploads[0].file,annotated,'the annotated picture is uploaded');
 assert.match(await js("document.querySelector('#card-shot .shot-card .kit-card-head').textContent"),/прикреплено к MOB-321/);
 await js("document.getElementById('card-shot').remove()");
 const second=await shot(win,`.shot-card[data-shot-id="${ids[1]}"]`,'petya-screenshot-task-bare');
 const secondBottom=await bottom('petya-screenshot-task-bare-bottom');
 await js("document.getElementById('card-shot').remove()");
 await js("(()=>{const c=document.querySelector('[data-extension=\"screenshot-task\"]');c.hidden=false;c.querySelector('details')?.setAttribute('open','');})()");
 const settingsShot=await shot(win,'[data-extension="screenshot-task"]','petya-screenshot-task-settings');
 for(const id of ids)for(const f of [id+'.png',id+'-annotated.png',id+'.json'])fs.rmSync(path.join(dir,f),{force:true});
 console.log('Screenshot → task UI: region picker drag, canvas frame/arrow/blur saved as PNG with shapes, draft fields, Jira hand-off and attach to the created task, model download offer passed · '+[first,firstBottom,second,secondBottom,settingsShot].join(' '));
}};
require('../src/main.cjs');
