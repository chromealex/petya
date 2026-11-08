// «Kubernetes» cards in the real chat, with data produced by the app over the fake kubectl: the namespace overview
// (pods table with CrashLoopBackOff/OOMKilled chips, rollout bars, warning events), a pod in detail with the
// grounded cause, and the restart confirmation showing the exact command — pressing it runs the app's real IPC,
// which calls the fake kubectl; «Отмена» runs nothing. PNGs to look at.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async test=>{for(let i=0;i<150;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+test);};
 await js('window.chatNavigationReady');
 const fake=require('./kubectl-fake.cjs').install();
 process.env.PATH=fake.dir+path.delimiter+process.env.PATH;
 const app=require('../src/extensions/kubernetes/feature.cjs');
 const topic={id:'t',title:'Kubernetes',messages:[]};
 const s={settings:{extension_kubernetes:'true',model:''},requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const overview=await app.turn(s,'что с подами в кубере'),pod=await app.turn(s,'почему падает под payments'),confirm=await app.turn(s,'перезапусти деплоймент worker');
 Object.assign(pod.extensionData.kubernetes,{explainedBy:'model',cause:'Сервис не может подключиться к базе данных',explanation:'Postgres по адресу 10.0.0.12:5432 отказывает в соединении, процесс завершается с кодом 1, и Kubernetes перезапускает его с растущей паузой.',
  evidence:['failed to connect to postgres at 10.0.0.12:5432: connection refused'],steps:['Проверить, что под postgres запущен и сервис указывает на него','Сверить DATABASE_URL в Secret деплоймента']});
 const msg=(r)=>({role:'assistant',text:r.text,by:'Kubernetes',extensionData:r.extensionData});
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'что с подами в кубере'},msg(overview),msg(pod),msg(confirm)])},'Kubernetes')`);
 await wait("document.querySelectorAll('.k8-card').length===3");
 await js("['overview','pod','confirm'].forEach((n,i)=>{document.querySelectorAll('.k8-card')[i].dataset.test=n;})");
 const o='document.querySelector("[data-test=overview]")';
 assert.equal(await js(o+".querySelectorAll('.k8-pod').length"),5);
 assert.deepEqual(await js(`[...${o}.querySelectorAll('.k8-pod .k8-dot')].map(n=>n.className.split(' ')[1])`),['bad','warn','warn','ok','ok'],'problems first');
 assert.equal(await js(o+".querySelector('.k8-pod .k8-reason').textContent"),'CrashLoopBackOff');
 assert.ok(await js(`[...${o}.querySelectorAll('.k8-reason')].some(n=>n.textContent==='OOMKilled')`));
 assert.equal(await js(o+".querySelectorAll('.k8-deploy').length"),4);
 assert.equal(await js(o+".querySelectorAll('.k8-event').length"),3);
 const p='document.querySelector("[data-test=pod]")';
 assert.equal(await js(p+".querySelector('.k8-cause-text').textContent"),'Сервис не может подключиться к базе данных');
 assert.ok(await js(p+".querySelectorAll('.k8-log').length")>=3);
 const c='document.querySelector("[data-test=confirm]")';
 assert.equal(await js(c+".querySelector('.k8-command').textContent"),'kubectl rollout restart deployment/worker --namespace=shop --context=prod-eu');
 fake.reset();
 await require('./card-shot.cjs')(win,'.k8-card[data-test=overview]','petya-kubernetes');
 await js("document.getElementById('card-shot').remove()");
 await require('./card-shot.cjs')(win,'.k8-card[data-test=pod]','petya-kubernetes-pod');
 await js("document.getElementById('card-shot').remove()");
 await require('./card-shot.cjs')(win,'.k8-card[data-test=confirm]','petya-kubernetes-confirm');
 // Cancel runs nothing; the confirming button (of a fresh card) runs the exact command through the app.
 await js(c+".querySelector('.k8-confirm-actions button:not(.primary)').click()");
 assert.equal(await js(c+".querySelector('.k8-confirm').dataset.state"),'cancelled');
 assert.equal(await js(c+".querySelector('.k8-confirm-actions').hidden"),true);
 assert.equal(fake.calls().filter(a=>a[0]==='rollout'&&a[1]==='restart').length,0);
 await js(`(()=>{const host=document.createElement('div');document.body.append(host);window.renderKubernetesCard(host,${JSON.stringify(confirm.extensionData.kubernetes)});host.querySelector('.k8-card').dataset.test='confirm2';host.querySelector('.k8-confirm-actions .primary').click();})()`);
 for(let i=0;i<200&&!fake.calls().some(a=>a[0]==='rollout'&&a[1]==='restart');i++)await new Promise(r=>setTimeout(r,30));
 assert.deepEqual(fake.calls().find(a=>a[0]==='rollout'&&a[1]==='restart'),['rollout','restart','deployment/worker','--namespace=shop','--context=prod-eu','--request-timeout=20s']);
 await wait("document.querySelector('[data-test=confirm2] .k8-confirm').dataset.state==='done'");
 assert.equal(await js("document.querySelector('[data-test=confirm2] .kit-card-head .kit-chip').textContent"),'выполнено');
 console.log('Kubernetes cards: pods with problem chips, rollout bars, events, pod cause and lines, confirmation with exact command (cancel runs nothing, confirm runs it) passed');
}};
require('../src/main.cjs');
