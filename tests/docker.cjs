// «Docker»: the CLI layer against a fake docker binary on PATH (no shell, timeouts, engine down/missing/denied),
// parsing of ps/stats/compose/images/df/logs, chat routing with near-misses, read-only chat turns with card data,
// the grounded crash explanation, and writes that run only through the card's confirmed calls with re-checked targets.
const assert=require('node:assert/strict');
const path=require('node:path');
const fake=require('./docker-fake.cjs').install();
process.env.PATH=fake.dir+path.delimiter+process.env.PATH;
process.env.FAKE_DOCKER_LOG=fake.log;
const CLI=require('../src/extensions/docker/cli.cjs');
const Engine=require('../src/extensions/docker/engine.cjs');
const app=require('../src/extensions/docker/feature.cjs');
const offer=require('../src/extensions/docker/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

(async()=>{
 // Parsing helpers.
 assert.equal(CLI.bytes('1.21GB'),1.21e9);assert.equal(CLI.bytes('321.5MiB'),Math.round(321.5*1024**2));assert.equal(CLI.bytes('12.5kB'),12500);assert.equal(CLI.bytes('0B'),0);assert.equal(CLI.bytes('N/A'),0);
 assert.deepEqual(Engine.ports('0.0.0.0:8080->8080/tcp, :::8080->8080/tcp, 6379/tcp'),[{host:'8080',container:'8080/tcp',bind:'0.0.0.0'},{container:'6379/tcp'}],'IPv4/IPv6 duplicates are merged');
 assert.deepEqual(Engine.memory('9.4MiB / 7.66GiB'),{used:Math.round(9.4*1024**2),limit:Math.round(7.66*1024**3)});
 assert.equal(Engine.label('a=1,com.docker.compose.project=shop,b=2','com.docker.compose.project'),'shop');
 const merged=Engine.mergeLogs('2026-11-09T10:00:02Z b\n2026-11-09T10:00:00Z a\n','2026-11-09T10:00:01Z ERROR c\n');
 assert.deepEqual(merged.map(l=>l.text),['a','ERROR c','b'],'stdout and stderr are merged by time');
 assert.equal(merged[1].level,'error');assert.equal(Engine.level('WARN slow','out'),'warn');assert.equal(Engine.level('FATAL: x','err'),'fatal');assert.equal(Engine.level('plain','err'),'err');
 assert.match(Engine.exitMeaning(137,false),/SIGKILL/);assert.match(Engine.exitMeaning(137,true),/OOMKilled/);assert.match(Engine.exitMeaning(127),/не найдена/);

 // The binary is found on PATH and called without a shell.
 assert.equal(CLI.binary(),path.join(fake.dir,'docker'));
 assert.equal(CLI.binary({env:{PATH:'/nonexistent'},platform:'win32',exists:()=>false}),null);
 const cli=CLI.create();
 assert.equal((await cli.json(['ps','--all','--format','json'])).length,5);
 await assert.rejects(cli.run(['ps; rm -rf /']),e=>e.kind==='failed','a whole string is one argument: no shell');
 await assert.rejects(cli.run([1]),/Invalid docker arguments/);
 assert.deepEqual(fake.calls().at(-1),['ps; rm -rf /']);

 // Failures are told apart.
 process.env.FAKE_DOCKER_MODE='stopped';
 await assert.rejects(cli.run(['ps']),e=>e.kind==='stopped'&&/не запущен/.test(e.message));
 process.env.FAKE_DOCKER_MODE='denied';
 await assert.rejects(cli.run(['ps']),e=>e.kind==='denied');
 process.env.FAKE_DOCKER_MODE='slow';
 const quick=CLI.create({runner:(f,a,o)=>CLI.exec(f,a,{...o,timeout:400})});
 const started=Date.now();
 await assert.rejects(quick.run(['ps','--all','--format','json']),e=>e.kind==='timeout');
 assert.ok(Date.now()-started<5000,'the timeout stops a hanging docker');
 delete process.env.FAKE_DOCKER_MODE;
 await assert.rejects(CLI.create({find:()=>null}).run(['ps']),e=>e.kind==='missing');
 await assert.rejects(CLI.create({find:()=>path.join(fake.dir,'nope')}).run(['ps']),e=>e.kind==='missing','ENOENT means not installed');

 // Routing: own phrases, near-misses, «что такое».
 for(const [p,k] of [['что запущено в докере','overview'],['логи контейнера api','logs'],['почему падает контейнер postgres','crash'],['перезапусти redis','action'],['сколько места занимает докер','disk'],
  ['какие контейнеры запущены','overview'],['останови контейнер worker','action'],['подними compose shop','compose'],['compose down shop','compose'],['удали висячие образы докера','disk'],['покажи логи redis за последний час','logs'],['docker ps','overview']])
  assert.equal(app.kind(p),k,p);
 for(const p of ['docker-образ для Python','место на диске','контейнер в Unity UI','что такое докер','напиши Dockerfile для node','как установить docker','перезапусти компьютер','почему падает приложение','контейнер для мусора','логи сборки в CI','сколько места на диске'])
  assert.equal(app.kind(p),null,p);
 assert.deepEqual(app.wantedNames('логи контейнера api за 10 минут'),['api']);
 assert.deepEqual(app.wantedNames('почему падает постгрес'),['postgres']);
 assert.deepEqual(app.logOptions('логи api последние 50 строк за 2 часа со словом «timeout»'),{tail:50,since:'2h',grep:'timeout',errors:false});
 assert.deepEqual(app.logOptions('только ошибки в логах api за сутки'),{tail:200,since:'24h',grep:'',errors:true});

 // Offer: names and topics; neighbours are avoided.
 const any=(list,t)=>list.some(r=>r.test(t));
 for(const p of ['что запущено в докере','логи контейнера api','перезапусти redis'])assert.ok(any(offer.names,p)||any(offer.topics,p),p);
 for(const p of ['docker-образ для Python','контейнер в Unity UI'])assert.ok(any(offer.avoid,p),p);
 assert.equal(offer.ready({extension_docker:'true'}),true);

 // Chat turns. Not added → nothing here.
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];const progress=[],published=[];
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report:t=>progress.push(t)},
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(ch,item)=>published.push({ch,...item})}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages.at(-1).content.slice(0,200));return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}};
 app.deps.cli=CLI.create();app.deps.engine=null;
 assert.equal(await app.turn(s,'что запущено в докере'),null,'not added: the offer handles it');
 s.settings.extension_docker='true';
 assert.equal(await app.turn(s,'docker-образ для Python'),null);

 fake.reset();
 const list=await app.turn(s,'что запущено в докере');
 const o=list.extensionData.dockerContainers;
 assert.equal(o.mode,'list');assert.equal(o.containers.length,5);
 assert.deepEqual(o.containers.map(c=>c.name),['shop-api-1','redis','shop-postgres-1','old-nginx','worker'],'running first (compose projects first), then restarting, then stopped');
 const api=o.containers[0];
 assert.equal(api.cpu,12.4);assert.equal(api.memUsed,Math.round(321.5*1024**2));assert.equal(api.project,'shop');assert.equal(api.service,'api');assert.deepEqual(api.ports,[{host:'8080',container:'8080/tcp',bind:'0.0.0.0'}]);
 assert.equal(o.containers[1].health,'healthy');assert.equal(o.containers[2].exitCode,137);assert.equal(o.containers[4].exitCode,1);
 assert.equal(o.compose[0].name,'shop');assert.equal(o.compose[0].running,1);assert.equal(o.compose[0].total,2);
 assert.equal(o.images.filter(i=>i.dangling).length,2);assert.equal(o.volumes.length,2);
 assert.match(list.text,/^Запущено 2 из 5 контейнеров\. Compose: shop \(1 запущено\)\. С проблемами: shop-postgres-1 \(перезапускается\), worker \(код 1\)\. Висячих образов: 2/);
 assert.equal(topic.messages.at(-1).by,'Docker');
 assert.ok(!fake.calls().some(c=>['start','stop','restart','rm','exec','run','prune'].includes(c[0])||c.includes('up')),'a chat turn only reads');

 // Logs: «api» is the compose service of shop-api-1; both streams; grep and the error filter run in code.
 const logs=await app.turn(s,'логи контейнера api');
 const L=logs.extensionData.dockerLogs;
 assert.equal(L.container.name,'shop-api-1');assert.equal(L.lines.length,7);assert.equal(L.lines.find(l=>/ERROR/.test(l.text)).level,'error');
 assert.match(logs.text,/^Логи shop-api-1: 7 строк, ошибок: 1\./);
 assert.deepEqual(fake.calls().at(-1),['logs','--timestamps','--tail','200','a1b2c3d4e5f6']);
 const grep=await app.turn(s,'логи контейнера api со словом «health» за 30 минут');
 assert.equal(grep.extensionData.dockerLogs.lines.length,2);assert.deepEqual(fake.calls().at(-1),['logs','--timestamps','--tail','2000','--since','30m','a1b2c3d4e5f6'],'grep is never passed to docker');
 const errorsOnly=await app.turn(s,'только ошибки в логах контейнера api');
 assert.deepEqual(errorsOnly.extensionData.dockerLogs.lines.map(l=>l.level),['error']);
 // An ambiguous name asks which container (shared question panel), keeping the request.
 await assert.rejects(app.turn(s,'логи контейнера shop'),e=>e instanceof InputRequired&&e.spec.options.includes('shop-api-1')&&e.spec.options.includes('shop-postgres-1'));
 await assert.rejects(app.turn(s,'логи контейнера mysql'),e=>e instanceof InputRequired&&/не нашёл/.test(e.spec.text));

 // «Почему падает»: facts from inspect + logs; without a model the exit code explains it.
 const crash=await app.turn(s,'почему падает контейнер postgres');
 const F=crash.extensionData.dockerCrash;
 assert.equal(F.name,'shop-postgres-1');assert.equal(F.oomKilled,true);assert.equal(F.exitCode,137);assert.equal(F.restartCount,7);assert.equal(F.restartPolicy,'always');assert.equal(F.explainedBy,'code');
 assert.match(crash.text,/^shop-postgres-1: процесс убит из-за нехватки памяти \(OOMKilled\)\. Факты: Сейчас перезапускается; OOMKilled: да \(лимит памяти 256 МБ\); перезапусков: 7 \(политика always\)\./);
 // With a model: the explanation rests on the facts; quotes not in the logs are dropped.
 s.settings.model='qwen3:4b';
 model=[body=>{const facts=JSON.parse(body.messages.at(-1).content);assert.equal(facts.oomKilled,true);assert.equal(facts.restartCount,7);assert.ok(facts.lastLogLines.some(l=>/signal 9/.test(l)));
  return {cause:'Postgres не помещается в лимит памяти 256 МБ',explanation:'Ядро убивает процесс сигналом 9, Docker перезапускает его по политике always.',evidence:['server process (PID 87) was terminated by signal 9: Killed','out of memory: invented line'],steps:['Поднимите лимит памяти до 1 ГБ','Уменьшите shared_buffers']};}];
 const explained=(await app.turn(s,'почему падает контейнер postgres')).extensionData.dockerCrash;
 assert.equal(explained.explainedBy,'model');assert.deepEqual(explained.evidence,['server process (PID 87) was terminated by signal 9: Killed'],'invented evidence is dropped');
 assert.equal(explained.steps.length,2);
 s.settings.model='';

 // «Перезапусти redis»: a card with the confirmation open; nothing runs from the chat.
 fake.reset();
 const ask=await app.turn(s,'перезапусти redis');
 const P=ask.extensionData.dockerContainers;
 assert.equal(P.mode,'confirm');assert.deepEqual(P.pending,{type:'container',verb:'restart',target:'c3d4e5f6a1b2',name:'redis'});
 assert.match(ask.text,/^Перезапустить контейнер redis\? Подтвердите в карточке/);
 assert.ok(!fake.calls().some(c=>c[0]==='restart'),'no restart without the card button');
 const stop=await app.turn(s,'останови контейнер worker');
 assert.equal(stop.extensionData.dockerContainers.pending.verb,'stop');assert.match(stop.text,/Он уже остановлен/);
 const up=await app.turn(s,'подними compose shop');
 assert.deepEqual(up.extensionData.dockerContainers.pending,{type:'compose',verb:'up',target:'shop',name:'shop'});
 assert.equal(up.extensionData.dockerContainers.containers.length,2);

 // Disk usage and dangling images.
 const disk=await app.turn(s,'сколько места занимает докер');
 const D=disk.extensionData.dockerDisk;
 assert.equal(D.total,2.02e9+12.5e6+812e6+640e6);assert.equal(D.dangling.length,2);assert.equal(D.images[0].repository,'postgres');assert.equal(D.confirmPrune,false);
 assert.match(disk.text,/^Docker занимает 3,5 ГБ: образы 2 ГБ, контейнеры 12,5 МБ, тома 812 МБ, кэш сборки 640 МБ\. Можно освободить около 1,9 ГБ\. Висячих образов: 2 \(1,3 ГБ\)/);
 assert.equal((await app.turn(s,'удали висячие образы докера')).extensionData.dockerDisk.confirmPrune,true,'the confirmation opens, nothing is removed');
 assert.ok(!fake.calls().some(c=>c[0]==='image'&&c[1]==='rm'));

 // The card's confirmed calls: targets are re-checked, arguments are never options.
 const ipc=app.setup(s).ipc;
 fake.reset();published.length=0;
 const restarted=await ipc.container('restart','c3d4e5f6a1b2');
 assert.equal(restarted.container.name,'redis');assert.deepEqual(fake.calls().find(c=>c[0]==='restart'),['restart','c3d4e5f6a1b2']);
 assert.deepEqual(published.map(p=>[p.ch,p.id,p.busy,p.kind]),[['extension-install-progress','docker-operation',true,'info'],['extension-install-progress','docker-operation',false,'success']],'progress goes to the notification center');
 await assert.rejects(ipc.container('restart','--rm'),/Некорректное имя/);
 await assert.rejects(ipc.container('restart','ffffffffffff'),/больше не найден/);
 await assert.rejects(ipc.container('exec','redis'),/Неизвестное действие/);
 assert.equal(published.at(-1).kind,'error');
 fake.reset();
 await ipc.compose('up','shop');
 assert.deepEqual(fake.calls().find(c=>c[0]==='compose'&&c.includes('up')),['compose','--project-name','shop','--file',fake.composeFile,'up','--detach']);
 await ipc.compose('down','shop');
 assert.deepEqual(fake.calls().find(c=>c[0]==='compose'&&c.includes('down')),['compose','--project-name','shop','--file',fake.composeFile,'down']);
 await assert.rejects(ipc.compose('up','other'),/не найден/);await assert.rejects(ipc.compose('up','../x'),/Некорректное/);
 fake.reset();
 const removed=await ipc.removeDangling(['4444dddd5555','5555eeee6666','1111aaaa2222']);
 assert.deepEqual(removed.removed,['4444dddd5555']);assert.equal(removed.freed,1.21e9);
 assert.deepEqual(removed.failed.map(f=>[f.id,f.error]),[['5555eeee6666','используется контейнером'],['1111aaaa2222','уже не висячий или удалён']],'a tagged image is never removed');
 assert.ok(!fake.calls().some(c=>c.includes('prune')||c.includes('-f')||c.includes('--force')));
 await assert.rejects(ipc.removeDangling(['-a']),/Некорректный/);await assert.rejects(ipc.removeDangling([]),/Ничего не выбрано/);
 const more=await ipc.logs('a1b2c3d4e5f6',{tail:600});assert.equal(more.tail,600);assert.equal(more.lines.length,7);
 await assert.rejects(ipc.logs('a1b2c3d4e5f6',{tail:10,since:'1d; rm'}),/период/);
 // Duplicate start while an operation runs is refused.
 app.state.busy='Перезапускаю';await assert.rejects(ipc.container('restart','c3d4e5f6a1b2'),/уже выполняет/);app.state.busy=null;
 const status=await ipc.status();assert.equal(status.running,true);assert.equal(status.server,'29.9.2');assert.equal(status.context,'desktop-linux');

 // Engine down: a question that resumes the same request once Docker runs.
 process.env.FAKE_DOCKER_MODE='stopped';
 let question=null;
 try{await app.turn(s,'что запущено в докере');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.match(question.spec.text,/^Docker не запущен/);assert.deepEqual(question.spec.options,['Проверить снова']);
 assert.equal((await ipc.status()).running,false);
 delete process.env.FAKE_DOCKER_MODE;
 const resumed=await question.resume('Проверить снова');
 assert.equal(resumed.extensionData.dockerContainers.containers.length,5,'resumes the original request');
 // Denied and not installed are explained, not asked.
 process.env.FAKE_DOCKER_MODE='denied';
 const denied=await app.turn(s,'что запущено в докере');assert.equal(denied.error,true);assert.match(denied.text,/группу docker/);
 delete process.env.FAKE_DOCKER_MODE;
 app.deps.cli=CLI.create({find:()=>null});app.deps.engine=null;
 const missing=await app.turn(s,'что запущено в докере');
 assert.match(missing.text,/^Docker не найден на этом компьютере\. Для приложения «Docker» нужен Docker Desktop/);assert.equal(missing.extensionData.dockerContainers.mode,'missing');
 assert.equal((await ipc.status()).installed,false);
 console.log('Docker: fake docker on PATH without a shell, timeout/stopped/denied/missing, parsing, routing with near-misses, read-only turns, grounded crash facts, confirmed writes with re-checked targets passed');
})().catch(e=>{console.error(e);process.exit(1);});
