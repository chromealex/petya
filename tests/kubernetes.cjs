// «Kubernetes» against a fake kubectl on PATH (no shell, no cluster): the read-only allowlist (exec, delete,
// apply and identity flags refused), errors told apart, parsing of pods (CrashLoopBackOff, OOMKilled, restarts),
// rollout state, events, the pod detail with a grounded explanation, routing with near-misses (Docker, logs,
// monitoring, dialogue lines, «под Windows»), writes only from the card's confirmed call with the exact command and
// a re-checked context, notifications, the log source for «Логи сервера», settings validation and the offer.
const assert=require('node:assert/strict');
const path=require('node:path');
const fake=require('./kubectl-fake.cjs').install();
process.env.PATH=fake.dir+path.delimiter+process.env.PATH;
const K=require('../src/extensions/kubernetes/kubectl.cjs');
const C=require('../src/extensions/kubernetes/cluster.cjs');
const runtime=require('../src/extensions/kubernetes/runtime.cjs');
const app=require('../src/extensions/kubernetes/feature.cjs');
const offer=require('../src/extensions/kubernetes/offer.cjs');
const L=require('../src/features/log-sources.cjs');
const logs=require('../src/extensions/logs/feature.cjs');
const {InputRequired}=require('../src/input-required.cjs');

function services(settings={},{model=null}={}){
 const topic={id:'t',title:'Чат',messages:[]};const sent=[];
 return {settings:{extension_kubernetes:'true',...settings},requestProgress:{report(){}},sent,
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(ch,x)=>sent.push(x)}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  request:model||(async()=>{throw Error('no model');})};
}
const last=()=>fake.calls().at(-1);

(async()=>{
 // The CLI layer: found on PATH, reads only, no shell, scope flags always added.
 assert.equal(K.binary(),path.join(fake.dir,'kubectl'));
 const k=K.create();
 for(const bad of [['exec','api','--','sh'],['delete','pod','x'],['apply','-f','x.yaml'],['get','pods','--as=admin'],['get','pods','--token=abc'],['get','pods','--kubeconfig=/tmp/x'],['logs','x','-it'],['top','namespace'],['rollout','undo','deployment/x'],['config','set-context','x'],['port-forward','x','80'],['get','pods\n--all']])
  await assert.rejects(k.read(bad),e=>e.kind==='refused',bad.join(' '));
 assert.equal(fake.calls().length,0,'refused commands never reach kubectl');
 await k.read(['get','pods; rm -rf /'],{context:'prod-eu',namespace:'shop'}).catch(()=>{});
 assert.deepEqual(last(),['get','pods; rm -rf /','--namespace=shop','--context=prod-eu','--request-timeout=18s'],'one argument, no shell');
 await assert.rejects(k.read(['get','pods'],{namespace:'Bad_NS'}),e=>e.kind==='refused');
 assert.throws(()=>K.writeArgs({verb:'delete',name:'api',namespace:'shop'}),/только перезапускать/);
 assert.throws(()=>K.writeArgs({verb:'scale',name:'api',namespace:'shop',replicas:500}),/от 0 до 100/);
 assert.throws(()=>K.writeArgs({verb:'restart',name:'api; rm',namespace:'shop'}),/Недопустимое/);
 assert.equal(K.command({verb:'restart',name:'api',namespace:'shop',context:'prod-eu'}),'kubectl rollout restart deployment/api --namespace=shop --context=prod-eu');
 assert.equal(K.command({verb:'scale',name:'api',namespace:'shop',context:'arn:aws:eks:eu-west-1:1:cluster/prod',replicas:3}),'kubectl scale deployment/api --replicas=3 --namespace=shop --context=arn:aws:eks:eu-west-1:1:cluster/prod');
 // Failures told apart.
 for(const [mode,kind] of [['unreachable','unreachable'],['forbidden','forbidden']]){process.env.FAKE_KUBECTL_MODE=mode;await assert.rejects(k.json(['get','pods'],{namespace:'shop'}),e=>e.kind===kind,mode);}
 process.env.FAKE_KUBECTL_MODE='slow';
 const started=Date.now();await assert.rejects(k.read(['get','pods'],{timeout:600}),e=>e.kind==='timeout');assert.ok(Date.now()-started<5000);
 delete process.env.FAKE_KUBECTL_MODE;
 await assert.rejects(K.create({find:()=>null}).read(['get','pods']),e=>e.kind==='missing');
 fake.reset();

 // Parsing: pods, rollout states, events, log lines.
 const c=C.create(k);
 const o=await c.overview();
 assert.equal(o.context,'prod-eu');assert.equal(o.namespace,'shop');
 const pay=o.pods.find(p=>p.name.startsWith('payments'));
 assert.equal(pay.reason,'CrashLoopBackOff');assert.equal(pay.problem,'bad');assert.equal(pay.restarts,14);assert.deepEqual(pay.owner,{kind:'Deployment',name:'payments'});
 const worker=o.pods.find(p=>p.name.startsWith('worker'));assert.equal(worker.oomKilled,true);assert.equal(worker.problem,'warn');assert.equal(worker.lastReason,'OOMKilled');
 assert.equal(o.pods.find(p=>p.name.startsWith('web')).problem,'warn');
 assert.deepEqual(o.deployments.map(d=>d.status),['complete','failed','complete','progressing']);
 assert.equal(o.events.length,3,'warnings only');assert.equal(o.normalEvents,1);
 assert.deepEqual(C.logLine('[pod/api-1/api] 2026-11-09T10:00:00.123Z ERROR x'),{pod:'api-1',container:'api',ts:'2026-11-09T10:00:00.123Z',message:'ERROR x'});
 assert.equal(C.logLine('garbage'),null);
 // Settings override the kubeconfig.
 assert.deepEqual(await C.create(k,{settings:()=>({kubernetesContext:'staging',kubernetesNamespace:'shop'})}).target(),{context:'staging',namespace:'shop'});

 // Routing.
 for(const [p,kind] of [['что с подами в кубере','overview'],['какие поды в CrashLoopBackOff','overview'],['почему падает под payments','pod'],['опиши под api-7c9d8-x2k4p в k8s','pod'],['статус выкатки payments','rollout'],['rollout status деплоймента web','rollout'],
  ['перезапусти деплоймент worker','restart'],['рестартани payments в кубере','restart'],['отскейль api до 3 реплик','scale'],['scale deployment api to 5','scale'],['события в кубере','events'],['k8s','overview']])
  assert.equal(app.kind(p),kind,p);
 for(const p of ['логи пода api','логи сервиса payments за час','что с серверами','какие алерты горят','перезапусти контейнер redis','что в докере','реплики персонажа в диалоге','собери под Windows','скейл картинки','что такое kubernetes','выкатка в Google Play','перезапусти компьютер','деплой упал в CI'])
  assert.equal(app.kind(p),null,p);
 assert.equal(app.replicasOf('отскейль api до 3 реплик'),3);assert.equal(app.replicasOf('scale api to 5'),5);assert.equal(app.replicasOf('отскейль api'),null);
 assert.equal(await app.turn({settings:{}},'что с подами в кубере'),null,'not added → null');

 // Chat turns read only.
 fake.reset();
 runtime.reset();runtime.deps.kubectl=K.create();
 const s=services();app.setup(s);
 const r1=await app.turn(s,'что с подами в кубере');
 assert.match(r1.text,/^prod-eu, shop: 3 из 5 подов готовы\. С проблемами: payments-5f6b7-abcde \(CrashLoopBackOff, перезапусков 14\)\./);
 assert.match(r1.text,/Выкатка: payments — не удалась; web — обновлено 1 из 3\./);
 assert.equal(r1.extensionData.kubernetes.mode,'overview');
 const r2=await app.turn(s,'почему падает под payments');
 const pd=r2.extensionData.kubernetes;
 assert.equal(pd.mode,'pod');assert.equal(pd.pod.name,'payments-5f6b7-abcde');assert.equal(pd.previous,true);assert.ok(pd.logs.some(l=>/connection refused/.test(l.text)));assert.equal(pd.events.length,2);
 assert.match(r2.text,/CrashLoopBackOff/);assert.equal(pd.explainedBy,'code');
 assert.ok(fake.calls().some(a=>a[0]==='logs'&&a.includes('--previous')),'the previous container\'s lines');
 // With the model: quotes that are not in the events or lines are dropped.
 const sm=services({model:'m',ollamaUrl:'http://127.0.0.1:1/api/chat'},{model:async()=>({message:{content:JSON.stringify({cause:'Сервис не может подключиться к базе данных',explanation:'Postgres отказывает в соединении.',evidence:['failed to connect to postgres at 10.0.0.12:5432: connection refused','выдумка'],steps:['Проверить postgres']})}})});
 const r3=await app.turn(sm,'почему падает под payments');
 assert.deepEqual(r3.extensionData.kubernetes.evidence,['failed to connect to postgres at 10.0.0.12:5432: connection refused']);assert.equal(r3.extensionData.kubernetes.explainedBy,'model');
 const r4=await app.turn(s,'статус выкатки web');
 assert.match(r4.text,/^web: выкатка идёт — обновлено 1 из 3\. Готово 2 из 3, ревизия 7/);
 // Several pods of one deployment, none worse: ask which.
 await assert.rejects(app.turn(s,'опиши под api'),e=>e instanceof InputRequired&&e.spec.options.length===2);

 // Writes: the chat only prepares; the card's call runs the exact command after re-checking the scope.
 fake.reset();
 const r5=await app.turn(s,'перезапусти деплоймент worker');
 const pending=r5.extensionData.kubernetes.pending;
 assert.equal(pending.command,'kubectl rollout restart deployment/worker --namespace=shop --context=prod-eu');
 assert.ok(r5.text.includes(pending.command)&&/Подтвердите в карточке/.test(r5.text));
 assert.ok(!fake.calls().some(a=>a[0]==='rollout'&&a[1]==='restart'),'nothing runs from the chat');
 const done=await app.apply(s,pending);
 const ran=fake.calls().find(a=>a[0]==='rollout'&&a[1]==='restart');
 assert.deepEqual(ran,['rollout','restart','deployment/worker','--namespace=shop','--context=prod-eu','--request-timeout=20s']);
 assert.match(done.text,/worker: перезапуск начат/);
 assert.deepEqual(s.sent.map(x=>x.kind),['info','success'],'one notification, updated in place');assert.ok(s.sent.every(x=>x.id==='kubernetes-operation'));
 // Scale: the number is asked when missing; a changed context refuses the stale confirmation.
 await assert.rejects(app.turn(s,'отскейль api'),e=>e instanceof InputRequired&&/Сколько реплик/.test(e.spec.text));
 const r6=await app.turn(s,'отскейль api до 3 реплик');
 assert.equal(r6.extensionData.kubernetes.pending.command,'kubectl scale deployment/api --replicas=3 --namespace=shop --context=prod-eu');
 s.settings.kubernetesContext='staging';
 await assert.rejects(app.apply(s,r6.extensionData.kubernetes.pending),/Контекст или пространство имён изменились/);
 delete s.settings.kubernetesContext;
 await assert.rejects(app.apply(s,{...r6.extensionData.kubernetes.pending,name:'ghost'}),/больше нет/);
 await assert.rejects(app.apply(s,{...r6.extensionData.kubernetes.pending,verb:'delete'}),/только перезапускать/);
 const scaled=await app.apply(s,r6.extensionData.kubernetes.pending);
 assert.equal(scaled.deployment.replicas,3);
 assert.ok(!fake.calls().some(a=>['exec','delete','apply','patch','edit'].includes(a[0])));

 // Failures in the chat.
 process.env.FAKE_KUBECTL_MODE='forbidden';
 const r7=await app.turn(s,'что с подами в кубере');assert.ok(r7.error&&/Нет прав: User "dev" cannot list/.test(r7.text),r7.text);
 delete process.env.FAKE_KUBECTL_MODE;
 runtime.reset();runtime.deps.kubectl=K.create({find:()=>null});
 const r8=await app.turn(services(),'что с подами в кубере');assert.ok(r8.question&&/kubectl не найден/.test(r8.text));
 runtime.reset();runtime.deps.kubectl=K.create();

 // The log source: pod logs of a deployment through «Логи сервера».
 fake.reset();
 const sl=services({extension_logs:'true'});
 const reg=L.create(sl);
 assert.ok(reg.list().some(x=>x.id==='kubernetes'));
 const lr=await reg.search('kubernetes',{services:['payments'],levels:['error','fatal'],range:{last:'1h'}});
 assert.deepEqual(lr.entries.map(e=>e.level),['fatal','error']);assert.equal(lr.entries[0].service,'payments');assert.equal(lr.entries[0].labels.pod,'payments-5f6b7-abcde');
 const call=fake.calls().find(a=>a[0]==='logs');
 assert.ok(call.includes('--selector=app=payments')&&call.some(a=>a.startsWith('--since-time='))&&call.includes('--prefix=true')&&call.includes('--namespace=shop'));
 await assert.rejects(reg.search('kubernetes',{range:{last:'1h'}}),e=>e.need==='service');
 assert.deepEqual(await reg.services('kubernetes'),['api','payments','worker','web']);
 // From the chat: «логи пода payments» goes to «Логи сервера» with the Kubernetes source named.
 const lc=await logs.turn(sl,'логи пода payments за последний час');
 assert.equal(lc.extensionData.logs.source.id,'kubernetes');assert.equal(lc.extensionData.logs.entries.length,3);
 assert.match(lc.extensionData.logs.notes.join(' '),/только живые поды/);

 // Settings and the offer.
 assert.throws(()=>app.validate({kubernetesNamespace:'Prod_NS'}),/Пространство имён/);
 assert.throws(()=>app.validate({kubernetesKubectl:'kubectl; rm -rf /'}),/полным/);
 const okNext={kubernetesContext:' prod-eu ',kubernetesNamespace:'shop'};app.validate(okNext);assert.equal(okNext.kubernetesContext,'prod-eu');
 assert.equal(offer.ready({}),false);assert.equal(offer.ready({extension_kubernetes:'true'}),true);assert.equal(offer.connected({}),true);
 console.log('Kubernetes: read-only kubectl without a shell, failures, pods/rollout/events parsing, routing and near-misses, grounded pod explanation, confirmed restart/scale with exact command and re-checked scope, notifications, pod log source passed');
})().catch(e=>{console.error(e);process.exit(1);});
