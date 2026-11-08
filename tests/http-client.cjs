// «API-клиент»: parsing of chat requests and curl, masking, environments with secrets, OpenAPI (JSON and YAML),
// the sender against local test servers (redirects, cross-origin header drop, size cap, timeout, gzip, no cookies),
// routing with near-misses, and the safety rules: GET/HEAD to a saved or typed host runs, anything else waits for
// the card's «Отправить», once; Petya's own tokens are never sent; secrets never reach card data or the reply.
const assert=require('node:assert/strict');
const http=require('node:http'),zlib=require('node:zlib'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../src/extensions/http-client/request.cjs');
const E=require('../src/extensions/http-client/environments.cjs');
const O=require('../src/extensions/http-client/openapi.cjs');
const {send}=require('../src/extensions/http-client/send.cjs');
const app=require('../src/extensions/http-client/feature.cjs');
const offer=require('../src/extensions/http-client/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const hits=[];
function server(handler){return new Promise(r=>{const srv=http.createServer(handler);srv.listen(0,'127.0.0.1',()=>r(srv));});}
(async()=>{
 let other;
 const main=await server((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   hits.push({method:req.method,url:req.url,headers:req.headers,body});
   const json=(code,v,h={})=>{res.writeHead(code,{'Content-Type':'application/json',...h});res.end(JSON.stringify(v));};
   const u=req.url;
   if(u==='/v1/users/42')return json(200,{id:42,name:'Ann',roles:['admin','qa'],profile:{city:'Riga',active:true}},{'X-Request-Id':'r-1','Set-Cookie':'sid=1'});
   if(u.startsWith('/echo'))return json(200,{method:req.method,headers:req.headers,body});
   if(u==='/gzip'){res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'});return res.end(zlib.gzipSync(JSON.stringify({zipped:true})));}
   const m=/^\/redirect\/(\d+)$/.exec(u);if(m){res.writeHead(302,{Location:Number(m[1])?'/redirect/'+(m[1]-1):'/echo'});return res.end();}
   if(u==='/cross'){res.writeHead(302,{Location:'http://127.0.0.1:'+other.address().port+'/echo'});return res.end();}
   if(u==='/post307'){res.writeHead(307,{Location:'/echo'});return res.end();}
   if(u==='/big'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('x'.repeat(6*1024*1024));}
   if(u==='/slow')return;// never answers
   if(u==='/image.png'){res.writeHead(200,{'Content-Type':'image/png'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));}
   if(u==='/login'&&req.method==='POST')return json(201,{token:'session-abc'});
   if(u==='/health')return json(200,{status:'ok'});
   json(404,{error:'not found'});
  });
 });
 other=await server((req,res)=>{hits.push({other:true,url:req.url,headers:req.headers});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({other:true,headers:req.headers}));});
 const base='http://127.0.0.1:'+main.address().port;
 const host='127.0.0.1:'+main.address().port;

 // --- Parsing --------------------------------------------------------------------------------------------
 const c=R.parseCurl(`curl -X POST '${base}/login' \\\n  -H 'Content-Type: application/json' -H "Authorization: Bearer tok-123" \\\n  --data-raw '{"email":"a@b.c","pass":"it'\\''s"}' --compressed -o out.json`);
 assert.equal(c.method,'POST');assert.equal(c.url,base+'/login');assert.deepEqual(c.headers.map(h=>h.name),['Content-Type','Authorization']);
 assert.equal(c.body,'{"email":"a@b.c","pass":"it\'s"}');assert.deepEqual(c.ignored,['-o out.json']);
 assert.equal(R.parseCurl('curl -u ann:pw https://x.io/a').headers[0].value,'Basic '+Buffer.from('ann:pw').toString('base64'));
 assert.equal(R.parseCurl('curl -G https://x.io/s -d q=1 -d page=2').url,'https://x.io/s?q=1&page=2');
 assert.equal(R.parseCurl('curl https://x.io -d a=1').method,'POST');assert.equal(R.parseCurl('curl -I https://x.io').method,'HEAD');
 assert.equal(R.parseCurl('curl --json \'{"a":1}\' https://x.io').headers[0].value,'application/json');
 let p=R.parseChat('дерни GET https://api.example.com/v1/users/42');
 assert.deepEqual([p.method,p.url,p.path,p.body],['GET','https://api.example.com/v1/users/42','','']);
 p=R.parseChat('отправь POST на /login с телом {"email":"a@b.c","password":"x"}');
 assert.deepEqual([p.method,p.path,p.body],['POST','/login','{"email":"a@b.c","password":"x"}']);assert.equal(p.headers[0].value,'application/json');
 p=R.parseChat('отправь на /items с телом {"a":{"b":[1,2]}} и заголовком X-Trace: 7');
 assert.equal(p.method,'POST','a body means POST');assert.equal(p.body,'{"a":{"b":[1,2]}}');
 p=R.parseChat('дерни api.example.com/v1/ping');assert.equal(p.url,'https://api.example.com/v1/ping');
 p=R.parseChat('GET https://x.io/a\nAuthorization: Bearer abc\nX-Trace: 1');
 assert.deepEqual(p.headers,[{name:'Authorization',value:'Bearer abc'},{name:'X-Trace',value:'1'}]);
 assert.equal(R.mask('Bearer abc.def'),'Bearer ••••••');assert.equal(R.mask('k-123'),'••••••');
 assert.equal(R.maskUrl('https://u:p@x.io/a?api_key=s3cret&q=1'),'https://x.io/a?api_key=••••••&q=1');
 assert.equal(R.isSecretHeader('X-Api-Key'),true);assert.equal(R.isSecretHeader('X-Trace'),false);
 assert.equal(R.toCurl({method:'POST',url:'https://x.io/a?token=t1&q=1',headers:[{name:'Authorization',value:'Bearer t0k',secret:true},{name:'X-Trace',value:'1'}],body:'{"a":"it\'s"}'}),
  `curl -X POST "https://x.io/a?token=$TOKEN&q=1" -H "Authorization: Bearer $AUTHORIZATION" -H 'X-Trace: 1' --data-raw '{"a":"it'\\''s"}'`);

 // --- Environments ----------------------------------------------------------------------------------------
 const form=E.fromForm([{name:'production',aliases:'prod',baseUrl:base+'/',health:'/health',headers:[{name:'Authorization',value:'Bearer env-secret-1',secret:true},{name:'X-Client',value:'petya'}]},
  {name:'staging',baseUrl:'https://staging.example.com/api',headers:[{name:'X-Api-Key',value:'stage-key'}]}],{});
 const envs=E.load({httpClientEnvironments:form.httpClientEnvironments}),secretMap=JSON.parse(form.httpClientCredential);
 assert.equal(envs[0].baseUrl,base);assert.deepEqual(envs[0].secretHeaders,['Authorization']);assert.deepEqual(envs[1].secretHeaders,['X-Api-Key'],'secret-looking names are secrets');
 assert.ok(!form.httpClientEnvironments.includes('env-secret-1'),'secret values never sit in the plain setting');
 assert.equal(E.named(envs,'какой статус у health-check прода').name,'production');assert.equal(E.named(envs,'отвечает ли стейджинг').name,'staging');assert.equal(E.named(envs,'привет'),null);
 assert.deepEqual(E.headersFor(envs[0],secretMap,base+'/x').map(h=>h.name),['X-Client','Authorization']);
 assert.deepEqual(E.headersFor(envs[0],secretMap,'http://evil.example/x').map(h=>h.name),['X-Client'],'secrets only for the environment origin');
 const kept=E.fromForm(E.publicList(envs,secretMap),secretMap);
 assert.equal(JSON.parse(kept.httpClientCredential)[envs[0].id].Authorization,'Bearer env-secret-1','an empty secret field keeps the stored value');
 assert.equal(E.publicList(envs,secretMap)[0].headers[1].value,'','the form never gets a secret back');
 assert.throws(()=>E.fromForm([{name:'a',baseUrl:'ftp://x'}],{}),/http/);assert.throws(()=>E.fromForm([{name:'a',baseUrl:'https://u:p@x.io'}],{}),/логин/);
 assert.throws(()=>E.fromForm([{name:'a',baseUrl:'https://x.io',headers:[{name:'X',value:'y'.repeat(2100)}]}],{}),/2000/);

 // --- OpenAPI ----------------------------------------------------------------------------------------------
 const proj=fs.mkdtempSync(path.join(os.tmpdir(),'petya-openapi-'));
 fs.mkdirSync(path.join(proj,'docs'));fs.mkdirSync(path.join(proj,'node_modules','x'),{recursive:true});
 fs.writeFileSync(path.join(proj,'node_modules','x','openapi.yaml'),'openapi: 3.0.0\npaths: {}\n');
 fs.writeFileSync(path.join(proj,'docs','openapi.yaml'),`openapi: 3.0.3
info:
  title: Shop API # comment
  version: "1.4"
  description: |
    Long text: with colons
    - not a list
servers:
  - url: ${base}/v1
    description: prod
  - url: https://staging.example.com/v1
paths:
  /users/{id}:
    get:
      summary: Get user
      tags: [users]
      parameters:
        - name: id
          in: path
    delete:
      summary: "Delete user"
      deprecated: true
  /login:
    post:
      operationId: login
      tags:
        - auth
`);
 assert.deepEqual(O.find([proj]),[path.join(proj,'docs','openapi.yaml')],'node_modules is skipped');
 const spec=O.parse(fs.readFileSync(path.join(proj,'docs','openapi.yaml'),'utf8'),'openapi.yaml');
 assert.equal(spec.title,'Shop API');assert.equal(spec.version,'1.4');assert.deepEqual(spec.servers,[base+'/v1','https://staging.example.com/v1']);
 assert.deepEqual(spec.endpoints,[{method:'GET',path:'/users/{id}',summary:'Get user',tag:'users',deprecated:false},{method:'DELETE',path:'/users/{id}',summary:'Delete user',tag:'',deprecated:true},{method:'POST',path:'/login',summary:'login',tag:'auth',deprecated:false}]);
 const swagger=O.parse(JSON.stringify({swagger:'2.0',host:'api.x.io',basePath:'/v2',schemes:['https'],paths:{'/pets':{get:{summary:'List'}}}}));
 assert.deepEqual(swagger.servers,['https://api.x.io/v2']);assert.equal(swagger.endpoints.length,1);
 assert.throws(()=>O.parse('{"a":1}'),/не OpenAPI/);

 // --- Sender -------------------------------------------------------------------------------------------------
 let r=await send({method:'GET',url:base+'/v1/users/42'});
 assert.equal(r.status,200);assert.equal(JSON.parse(r.body).name,'Ann');assert.ok(r.timing.total>=r.timing.ttfb);
 r=await send({method:'GET',url:base+'/gzip'});assert.deepEqual(JSON.parse(r.body),{zipped:true});
 r=await send({method:'GET',url:base+'/redirect/2'});assert.equal(r.status,200);assert.equal(r.redirects.length,3);
 await assert.rejects(send({method:'GET',url:base+'/redirect/9'}),e=>e.kind==='redirects');
 r=await send({method:'GET',url:base+'/cross',headers:[{name:'Authorization',value:'Bearer x'},{name:'X-Trace',value:'1'}]});
 const received=JSON.parse(r.body).headers;
 assert.equal(received.authorization,undefined,'a cross-origin redirect drops Authorization');assert.equal(received['x-trace'],'1');
 r=await send({method:'POST',url:base+'/post307',body:'{}'});assert.equal(r.status,307);assert.equal(r.stoppedRedirect,'/echo','a write is not re-sent by a redirect');
 r=await send({method:'GET',url:base+'/big'});assert.equal(r.truncated,true);assert.equal(r.size,5*1024*1024);
 const t=Date.now();await assert.rejects(send({method:'GET',url:base+'/slow'},{timeoutMs:300}),e=>e.kind==='timeout');assert.ok(Date.now()-t<3000);
 await assert.rejects(send({method:'GET',url:'http://127.0.0.1:1/'}),e=>e.kind==='refused');
 await assert.rejects(send({method:'GET',url:'file:///etc/passwd'}),e=>e.kind==='url');
 r=await send({method:'GET',url:base+'/echo'});
 const h=JSON.parse(r.body).headers;assert.equal(h.cookie,undefined,'no cookies');assert.equal(h['user-agent'],'Petya-API-Client');

 // --- Routing --------------------------------------------------------------------------------------------------
 const routes=[['дерни GET https://api.example.com/v1/users/42','request'],['отправь POST на /login с телом {"a":1}','request'],['проверь, отвечает ли staging','health'],['какой статус у health-check прода','health'],
  ['curl https://api.example.com/v1/ping','request'],['импортируй curl -X POST https://x.io/a -d a=1','request'],['какие эндпоинты в openapi проекта','openapi'],['что отдаёт https://api.example.com/v1/status','request']];
 for(const [q,k] of routes)assert.equal(app.kind(q,envs),k,q);
 for(const q of ['API Jira','как работает REST','запрос в поддержку','отправь запрос в поддержку','что такое GET запрос','отвечает ли Маша','дерни Олега','отправь отчёт','покажи задачи в Jira','отправь сообщение в Slack','проверь почту'])assert.equal(app.kind(q,envs),null,q);
 const any=(list,q)=>list.some(x=>x.test(q));
 for(const q of ['дерни GET https://api.example.com/v1/users/42','какой статус у health-check прода','проверь, отвечает ли staging'])assert.ok(any(offer.topics,q)||any(offer.names,q),q);
 for(const q of ['API Jira','как работает REST','запрос в поддержку'])assert.ok(any(offer.avoid,q)||!(any(offer.topics,q)||any(offer.names,q)),q);

 // --- Chat turns -------------------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{httpClientEnvironments:'[]',httpClientCredential:'',jiraToken:'jira-very-secret-token-42',slackCredential:JSON.stringify({access_token:'xoxb-slack-secret-777'})},requestProgress:{report(){}},
  saveSettings(patch,internal){assert.equal(internal,true,'secrets are saved only as internal settings');Object.assign(s.settings,patch);return s.settings;},
  gitWorkspace:{discover:async()=>({folders:[proj]})},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 assert.equal(await app.turn(s,'дерни GET '+base+'/v1/users/42'),null,'not added: the offer handles it');
 s.settings['extension_http-client']='true';
 assert.equal(await app.turn(s,'API Jira'),null);
 hits.length=0;
 // GET to a host typed in the message runs at once.
 let out=await app.turn(s,'дерни GET '+base+'/v1/users/42');
 const card=out.extensionData.httpRequest;
 assert.equal(hits.length,1);assert.equal(card.mode,'response');assert.equal(card.response.status,200);assert.equal(card.response.view.kind,'json');
 assert.equal(JSON.parse(card.response.view.text).profile.city,'Riga');assert.ok(card.response.headers.some(x=>x.name==='X-Request-Id'));
 assert.match(out.text,new RegExp('^GET '+base.replace(/[.]/g,'\\.')+'/v1/users/42 → 200 OK · \\d+ мс · 85 Б JSON\\.$'));
 assert.equal(topic.messages.at(-1).by,'API-клиент');
 // Image preview and HEAD.
 out=await app.turn(s,'дерни GET '+base+'/image.png');assert.equal(out.extensionData.httpRequest.response.view.kind,'image');assert.match(out.extensionData.httpRequest.response.view.dataUrl,/^data:image\/png;base64,/);
 // A path without environments asks where to send it.
 await assert.rejects(app.turn(s,'отправь POST на /login с телом {"a":1}'),e=>e instanceof InputRequired&&/Куда отправить/.test(e.spec.text));
 // Environments saved: POST to a relative path waits for confirmation and shows the exact request with masked secrets.
 s.settings.httpClientEnvironments=form.httpClientEnvironments;s.settings.httpClientCredential=form.httpClientCredential;
 hits.length=0;
 out=await app.turn(s,'отправь POST на /login в прод с телом {"email":"a@b.c"}');
 const pending=out.extensionData.httpRequest;
 assert.equal(pending.mode,'confirm');assert.equal(hits.length,0,'nothing is sent before «Отправить»');
 assert.equal(pending.request.url,base+'/login');assert.equal(pending.request.body,'{"email":"a@b.c"}');
 assert.deepEqual(pending.request.headers.map(x=>[x.name,x.value]),[['X-Client','petya'],['Authorization','Bearer ••••••'],['Content-Type','application/json']]);
 assert.deepEqual(pending.reasons,['метод POST может изменить данные']);
 assert.match(pending.curl,/-H "Authorization: Bearer \$AUTHORIZATION"/);
 assert.ok(!JSON.stringify(topic.messages).includes('env-secret-1')&&!JSON.stringify(out).includes('env-secret-1'),'the secret is nowhere in the chat or card');
 const ipc=app.setup(s).ipc;
 const sent=await ipc.send(pending.id);
 assert.equal(hits.length,1);assert.equal(hits[0].method,'POST');assert.equal(hits[0].headers.authorization,'Bearer env-secret-1','the secret is sent to its own origin');assert.equal(hits[0].body,'{"email":"a@b.c"}');
 assert.equal(sent.mode,'response');assert.equal(sent.response.status,201);
 await assert.rejects(ipc.send(pending.id),/уже отправлен/,'a second press does not send again');
 assert.equal(hits.length,1);
 // «Повторить»: the POST needs the card's confirmation; the confirmed repeat sends once more.
 assert.equal((await ipc.repeat(sent.id)).confirm,true);assert.equal(hits.length,1);
 await ipc.repeat(sent.id,{confirmed:true});assert.equal(hits.length,2);
 // Relative GET in a saved environment runs at once (saved host).
 out=await app.turn(s,'дерни GET /v1/users/42 на проде');assert.equal(out.extensionData.httpRequest.mode,'response');assert.equal(hits.length,3);
 const repeated=await ipc.repeat(out.extensionData.httpRequest.id);assert.equal(repeated.response.status,200);assert.equal(hits.length,4);
 // Health check of an environment: its health path.
 hits.length=0;
 out=await app.turn(s,'какой статус у health-check прода');
 assert.equal(hits[0].url,'/health');assert.match(out.text,/^production отвечает: 200 OK за \d+ мс\.$/);
 // Unknown environment: asks for its address, saves it and continues with the same request.
 const before=E.load(s.settings).length;
 let question;try{await app.turn(s,'проверь, отвечает ли dev');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.match(question.spec.text,/^Окружения «dev» ещё нет/);
 hits.length=0;
 const resumed=await question.resume(base);
 assert.equal(E.load(s.settings).length,before+1);assert.equal(E.load(s.settings).at(-1).name,'dev');assert.equal(hits[0].url,'/health');assert.match(resumed.text,/^dev отвечает: 200/);
 // A typed curl GET runs; a typed secret header is masked in the card and stays out of the reply.
 hits.length=0;
 // localhost is the same server under a host name that no environment has.
 out=await app.turn(s,`curl -H 'X-Api-Key: typed-key-999' http://localhost:${main.address().port}/echo`);
 assert.equal(hits[0].headers['x-api-key'],'typed-key-999');
 assert.ok(!JSON.stringify(out.extensionData.httpRequest.request).includes('typed-key-999')&&!out.extensionData.httpRequest.curl.includes('typed-key-999')&&!out.text.includes('typed-key-999'),'typed secrets are masked in the card');
 assert.equal(out.extensionData.httpRequest.request.headers[0].value,'••••••');
 // «Сохранить в окружение» keeps the typed secret as a secret of the new environment.
 const savedEnv=await ipc.saveEnvironment(out.extensionData.httpRequest.id,'echo');
 assert.deepEqual([savedEnv.secrets],[1]);
 await assert.rejects(ipc.saveEnvironment(out.extensionData.httpRequest.id,'again'),/уже есть/);
 // Petya's own tokens are never sent, also when typed or nested in a stored credential.
 hits.length=0;
 out=await app.turn(s,'дерни GET '+base+'/echo\nAuthorization: Bearer jira-very-secret-token-42');
 assert.equal(out.error,true);assert.match(out.text,/токен одного из подключений Пети/);
 out=await app.turn(s,'дерни GET '+base+'/echo?t=xoxb-slack-secret-777');assert.equal(out.error,true);
 assert.equal(hits.length,0);
 // Network errors are a card with the request and the reason.
 out=await app.turn(s,'дерни GET http://127.0.0.1:1/x');
 assert.equal(out.error,true);assert.equal(out.extensionData.httpRequest.mode,'error');assert.equal(out.extensionData.httpRequest.error.kind,'refused');
 // Expired requests are told apart.
 assert.equal((await ipc.send('missing')).expired,true);assert.equal((await ipc.repeat('missing')).expired,true);await assert.rejects(ipc.saveEnvironment('missing','x'),/устарел/);
 // OpenAPI from the project folder.
 out=await app.turn(s,'какие эндпоинты в openapi проекта');
 const o=out.extensionData.httpOpenapi;
 assert.equal(o.title,'Shop API');assert.equal(o.endpoints.length,3);assert.equal(o.known[0],'production','a server already saved as an environment is named');
 assert.match(out.text,/^Shop API 1\.4: 3 эндпоинта/);
 // Settings form: secrets are never returned; an empty secret keeps the value.
 const list=ipc.environments();
 assert.ok(!JSON.stringify(list).includes('env-secret-1'));
 await ipc.saveEnvironments(list);
 assert.equal(JSON.parse(s.settings.httpClientCredential)[envs[0].id].Authorization,'Bearer env-secret-1');
 main.close();other.close();
 console.log('API client: curl/chat parsing, masking, environments with origin-bound secrets, OpenAPI JSON/YAML, sender limits (redirects, cross-origin, size, timeout, gzip, no cookies), routing near-misses, confirm-before-write once, Petya tokens refused passed');
})().catch(e=>{console.error(e);process.exit(1);});
