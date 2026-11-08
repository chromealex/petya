// «API-клиент» cards in the real chat, with data produced by the app against a local test server: the JSON response
// (status chip, timing bar, headers, tree, search, text view), an image preview, the confirmation that sends only on
// «Отправить» (through the real IPC, once), a network error, the OpenAPI list, and the settings form where a secret
// header is stored but never shown back.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async test=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+test);};
 await js('window.chatNavigationReady');
 const hits=[];
 const srv=await new Promise(r=>{const s=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{hits.push({method:req.method,url:req.url,headers:req.headers,body});
  if(req.url==='/v1/users/42'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','X-Request-Id':'5f1c-8a2e','Cache-Control':'no-store'});return res.end(JSON.stringify({id:42,name:'Анна Смирнова',email:'anna@example.com',active:true,balance:1520.5,manager:null,roles:['admin','qa'],profile:{city:'Riga',timezone:'Europe/Riga',teams:[{id:7,name:'Mobile'},{id:9,name:'Backend <script>alert(1)</script>'}]}}));}
  if(req.url==='/logo.png'){res.writeHead(200,{'Content-Type':'image/png'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVR42mNkYPhfz0AEYBxVSF+FjAwM/xkYGP4zMjIyMjKADGBkZGRgYGBgYGRk+M/IyMjIwMDwn4EBAFdGCfE5O8Y5AAAAAElFTkSuQmCC','base64'));}
  if(req.url==='/login'){res.writeHead(201,{'Content-Type':'application/json'});return res.end(JSON.stringify({token:'session-abc',expiresIn:3600}));}
  res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"not found"}');});});s.listen(0,'127.0.0.1',()=>r(s));});
 const base='http://127.0.0.1:'+srv.address().port;
 const proj=fs.mkdtempSync(path.join(os.tmpdir(),'petya-openapi-ui-'));
 fs.writeFileSync(path.join(proj,'openapi.json'),JSON.stringify({openapi:'3.0.3',info:{title:'Shop API',version:'1.4'},servers:[{url:base+'/v1'},{url:'https://staging.example.com/v1'}],paths:{
  '/users':{get:{summary:'Список пользователей',tags:['users']},post:{summary:'Создать пользователя',tags:['users']}},'/users/{id}':{get:{summary:'Пользователь по id',tags:['users']},patch:{summary:'Изменить',tags:['users']},delete:{summary:'Удалить',tags:['users'],deprecated:true}},
  '/login':{post:{summary:'Вход',tags:['auth']}},'/orders':{get:{summary:'Заказы',tags:['orders']}},'/health':{get:{summary:'Health-check',tags:['service']}}}}));
 // Card data from the app's own turns.
 const app=require('../src/extensions/http-client/feature.cjs'),E=require('../src/extensions/http-client/environments.cjs');
 const form=E.fromForm([{name:'production',baseUrl:base,health:'/health',headers:[{name:'Authorization',value:'Bearer ui-secret-777',secret:true},{name:'X-Client',value:'petya'}]}],{});
 const topic={id:'t',title:'API',messages:[]};
 const s={settings:{'extension_http-client':'true',httpClientEnvironments:form.httpClientEnvironments,httpClientCredential:form.httpClientCredential},requestProgress:{report(){}},saveSettings(){},gitWorkspace:{discover:async()=>({folders:[proj]})},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const json=await app.turn(s,'дерни GET '+base+'/v1/users/42'),image=await app.turn(s,'дерни GET '+base+'/logo.png'),
  confirm=await app.turn(s,'отправь POST на /login в прод с телом {"email":"anna@example.com","password":"x"}'),failed=await app.turn(s,'дерни GET http://127.0.0.1:1/v1/ping'),
  openapi=await app.turn(s,'какие эндпоинты в openapi проекта');
 assert.equal(hits.filter(h=>h.url==='/login').length,0);
 const msg=r=>({role:'assistant',text:r.text,by:'API-клиент',extensionData:r.extensionData});
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'дерни'},msg(json),msg(image),msg(confirm),msg(failed),msg(openapi)])},'API')`);
 await wait("document.querySelectorAll('.hc-card').length===5");
 await js("['json','image','confirm','error','openapi'].forEach((n,i)=>{document.querySelectorAll('.hc-card')[i].dataset.test=n;})");
 const J='document.querySelector("[data-test=json]")';
 assert.equal(await js(J+".querySelector('.kit-chip').textContent.split(' · ')[0]"),'200 OK');
 assert.ok(await js(J+".querySelector('.kit-chip').classList.contains('tone-done')"));
 assert.equal(await js(J+".querySelector('.hc-key .hc-method').textContent"),'GET');
 assert.equal(await js(J+".querySelectorAll('.hc-seg').length"),2);
 assert.match(await js(J+".querySelector('.hc-resp-headers summary').textContent"),/^Заголовки ответа · \d+$/);
 assert.ok(await js(J+".querySelectorAll('.hc-json-area .hc-k').length")>=10,'the JSON tree is open two levels deep');
 assert.equal(await js(J+".querySelectorAll('.hc-card script, .hc-card img:not([src^=\"data:image\"])').length"),0,'response content is never HTML');
 // Search lists matching paths.
 await js(`{const i=${J}.querySelector('.hc-search');i.value='riga';i.dispatchEvent(new Event('input'));}`);
 assert.deepEqual(await js(`[...${J}.querySelectorAll('.hc-found-row')].map(r=>r.textContent)`),['profile.city = "Riga"','profile.timezone = "Europe/Riga"']);
 await js(`{const i=${J}.querySelector('.hc-search');i.value='<script>';i.dispatchEvent(new Event('input'));}`);
 assert.equal(await js(J+".querySelector('.hc-found-row').textContent"),'profile.teams[1].name = "Backend <script>alert(1)</script>"','HTML in JSON stays text');
 assert.equal(await js(J+".querySelectorAll('script').length"),0);
 await js(`{const i=${J}.querySelector('.hc-search');i.value='';i.dispatchEvent(new Event('input'));}`);
 // The request part: secrets masked.
 await js(J+".querySelector('.hc-request').open=true");
 await require('./card-shot.cjs')(win,'[data-test=json]','petya-http-client-response');
 // Image preview.
 assert.match(await js("document.querySelector('[data-test=image] .hc-image img').src"),/^data:image\/png;base64,/);
 await require('./card-shot.cjs')(win,'[data-test=image],[data-test=error]','petya-http-client-image-error');
 // Confirmation: masked secret, reasons, then «Отправить» sends once through the real IPC.
 const C='document.querySelector("[data-test=confirm]")';
 assert.deepEqual(await js(`[...${C}.querySelectorAll('.hc-header')].map(r=>r.querySelector('.hc-hname').textContent+': '+r.querySelector('.hc-hvalue').textContent)`),['X-Client: petya','Authorization: Bearer ••••••','Content-Type: application/json']);
 assert.equal(await js(C+".textContent.includes('ui-secret-777')"),false);
 assert.equal(await js(C+".querySelector('.hc-reasons li').textContent"),'метод POST может изменить данные');
 assert.equal(await js(C+".querySelector('.kit-chip').textContent"),'ждёт подтверждения');
 await require('./card-shot.cjs')(win,'[data-test=confirm]','petya-http-client-confirm');
 await js(C+".querySelector('.hc-confirm .primary').click()");
 await wait("!!document.querySelector('[data-test=confirm]')===false");
 await wait("[...document.querySelectorAll('.hc-card .kit-chip')].some(n=>n.textContent.startsWith('201'))");
 const logins=hits.filter(h=>h.url==='/login');
 assert.equal(logins.length,1);assert.equal(logins[0].headers.authorization,'Bearer ui-secret-777');assert.equal(logins[0].headers.cookie,undefined);
 // Error card.
 assert.equal(await js("document.querySelector('[data-test=error] .kit-chip').textContent"),'нет ответа');
 assert.match(await js("document.querySelector('[data-test=error] .hc-error').textContent"),/Соединение отклонено/);
 // OpenAPI: method mix, servers, search, a row goes into the composer (not sent).
 const O='document.querySelector("[data-test=openapi]")';
 assert.equal(await js(O+".querySelectorAll('.hc-endpoint').length"),8);
 assert.equal(await js(O+".querySelectorAll('.hc-mix-seg').length"),4);
 assert.equal(await js(O+".querySelectorAll('.hc-endpoint.deprecated').length"),1);
 await require('./card-shot.cjs')(win,'[data-test=openapi]','petya-http-client-openapi');
 await js(`{const i=${O}.querySelector('.hc-search');i.value='login';i.dispatchEvent(new Event('input'));}`);
 assert.equal(await js(O+".querySelectorAll('.hc-endpoint').length"),1);
 await js(O+".querySelector('.hc-endpoint').click()");
 assert.equal(await js("document.getElementById('command').value"),'дерни POST '+base+'/v1/login');
 await js("document.getElementById('command').value=''");
 // Settings: an environment with a secret header; the secret is stored and never shown back.
 await js("window.extensionHost.open('http-client')");
 await wait("!!document.querySelector('[data-extension=\"http-client\"]:not([hidden])')");
 const S='document.querySelector(\'[data-extension="http-client"]\')';
 await js(S+".querySelector('details')?.setAttribute('open','')");
 await js(S+".querySelector('.hc-add').click()");
 await js(`{const b=${S}.querySelector('.hc-env-box');b.querySelector('.e-name').value='staging';b.querySelector('.e-base').value='https://staging.example.com/api/';b.querySelector('.e-health').value='/health';
  b.querySelector('.e-headers').parentNode.querySelector('button.quiet').click();b.querySelector('.e-headers').parentNode.querySelector('button.quiet').click();
  const rows=b.querySelectorAll('.hc-header-row');rows[0].querySelector('.h-name').value='Authorization';rows[0].querySelector('.h-value').value='Bearer settings-secret-1';rows[0].querySelector('.h-secret').checked=true;
  rows[1].querySelector('.h-name').value='X-Env';rows[1].querySelector('.h-value').value='stage';}`);
 await js(S+".querySelector('.hc-save-envs').click()");
 await wait(S+".querySelector('[role=status]').textContent==='Сохранено.'");
 assert.equal(await js(S+".querySelector('.e-base').value"),'https://staging.example.com/api');
 assert.equal(await js(S+".querySelector('.h-value[type=password]').value"),'','the secret is not shown back');
 assert.equal(await js(S+".querySelector('.h-value[type=password]').placeholder"),'сохранён — оставьте пустым');
 assert.equal(await js(S+".textContent.includes('settings-secret-1')"),false);
 assert.equal(JSON.stringify(await js('window.petya.settings()')).includes('settings-secret-1'),false,'public settings never carry the secret');
 await require('./card-shot.cjs')(win,'[data-extension="http-client"]','petya-http-client-settings');
 srv.close();
 console.log('API client cards: JSON tree and search, timing bar, masked request, image preview, confirm sends once via IPC, error card, OpenAPI list into the composer, secret settings not echoed passed');
}};
require('../src/main.cjs');
