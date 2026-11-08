// «Docker» cards in the real chat, with data produced by the app itself against the fake docker binary: the container
// table (dots, CPU/memory bars, port chips, per-row confirmation that calls the app only after the press), compose
// rows, the logs card (levels, search, level filter, timeline), «почему падает» and the disk card with dangling images.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async test=>{for(let i=0;i<150;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+test);};
 await js('window.chatNavigationReady');
 // Card data from the app's own turns over the fake docker.
 const fake=require('./docker-fake.cjs').install();
 const app=require('../src/extensions/docker/feature.cjs'),CLI=require('../src/extensions/docker/cli.cjs');
 app.deps.cli=CLI.create({find:()=>path.join(fake.dir,'docker')});app.deps.engine=null;
 process.env.FAKE_DOCKER_LOG=fake.log;
 const topic={id:'t',title:'Docker',messages:[]};
 const s={settings:{extension_docker:'true',model:''},requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const list=await app.turn(s,'что запущено в докере'),logs=await app.turn(s,'логи контейнера api'),crash=await app.turn(s,'почему падает контейнер postgres'),
  disk=await app.turn(s,'удали висячие образы докера'),confirm=await app.turn(s,'перезапусти redis');
 // The model's explanation as it would arrive (the unit test checks how it is produced and filtered).
 Object.assign(crash.extensionData.dockerCrash,{explainedBy:'model',cause:'Postgres не помещается в лимит памяти 256 МБ',explanation:'Ядро убивает процесс сигналом 9 (OOMKilled), а политика always сразу запускает его снова — отсюда 7 перезапусков.',
  evidence:['server process (PID 87) was terminated by signal 9: Killed'],steps:['Поднимите лимит памяти контейнера до 1 ГБ (mem_limit в compose)','Уменьшите shared_buffers и work_mem']});
 const msg=(text,data)=>({role:'assistant',text,by:'Docker',extensionData:data});
 const messages=[{role:'user',text:'что запущено в докере'},msg(list.text,list.extensionData),msg(logs.text,logs.extensionData),msg(crash.text,crash.extensionData),msg(disk.text,disk.extensionData),msg(confirm.text,confirm.extensionData)];
 await js(`view('home');showDialogueMessages(${JSON.stringify(messages)},'Docker')`);
 await wait("document.querySelectorAll('.dk-card').length===5");
 // Screenshots move cards into an overlay: name them first.
 await js("['list','logs','crash','disk','confirm'].forEach((n,i)=>{document.querySelectorAll('.dk-card')[i].dataset.test=n;})");
 // The cards call the app's real IPC, which runs the fake docker (same module as in main): writes are read from its log.
 fake.reset();
 const writes=()=>fake.calls().filter(c=>['start','stop','restart'].includes(c[0])||c[0]==='image'&&c[1]==='rm'||c[0]==='compose'&&(c.includes('up')||c.includes('down')));
 const waitNode=async test=>{for(let i=0;i<150;i++){if(test())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out waiting for docker');};
 // Container table.
 const card='document.querySelector("[data-test=list]")';
 assert.equal(await js(card+".querySelectorAll('.dk-table:not(.dk-projects)>.dk-row:not(.dk-head)').length"),5);
 assert.deepEqual(await js(`[...${card}.querySelectorAll('.dk-table:not(.dk-projects)>.dk-row:not(.dk-head) .dk-dot')].map(n=>n.className.split(' ')[1])`),['run','run','warn','stop','stop']);
 assert.equal(await js(card+".querySelector('.dk-port').textContent"),'8080→8080');
 assert.equal(await js(card+".querySelector('.dk-meter-label').textContent"),'12,4%');
 assert.match(await js(card+".querySelectorAll('.dk-meter')[1].getAttribute('aria-label')"),/^Память: 322 МБ из 7,7 ГБ$/);
 assert.equal(await js(card+".querySelectorAll('.dk-row.bad').length"),2,'restarting postgres and worker exit 1 stand out');
 assert.equal(await js(card+".querySelector('.dk-row.bad .dk-code.alert').textContent"),'exit 137');
 assert.equal(await js(card+".querySelectorAll('.dk-project-row').length"),1);
 assert.equal(await js(card+".querySelector('.kit-chip').textContent"),'проблем: 2');
 assert.match(await js(card+".querySelector('.dk-state').textContent"),/^работает 2 часа$/);
 await require('./card-shot.cjs')(win,'[data-test=list],[data-test=confirm]','petya-docker-containers');
 // The chat request «перезапусти redis» arrives with its confirmation open; nothing is called before the press.
 const conf='document.querySelector("[data-test=confirm]")';
 assert.equal(await js(conf+".querySelectorAll('.dk-confirm').length"),1);
 assert.equal(await js(conf+".querySelector('.dk-confirm-title').textContent"),'Перезапустить контейнер redis?');
 assert.equal(writes().length,0);
 // A row action opens the confirmation; Отмена closes it without a call.
 await js(card+".querySelector('.dk-row[data-id=\"c3d4e5f6a1b2\"] .dk-menu').click()");
 await wait("document.querySelectorAll('.kit-menu-item').length===3");
 assert.deepEqual(await js("[...document.querySelectorAll('.kit-menu-item')].map(n=>n.textContent)"),['Логи','Перезапустить…','Остановить…']);
 await js("[...document.querySelectorAll('.kit-menu-item')][2].click()");
 await wait(card+".querySelectorAll('.dk-confirm').length===1");
 assert.equal(await js(card+".querySelector('.dk-confirm .primary').textContent"),'Остановить');
 await js(card+".querySelector('.dk-confirm button:not(.primary)').click()");
 assert.equal(await js(card+".querySelectorAll('.dk-confirm').length"),0);
 assert.equal(writes().length,0);
 await js(conf+".querySelector('.dk-confirm .primary').click()");
 await waitNode(()=>writes().length===1);
 assert.deepEqual(writes()[0],['restart','c3d4e5f6a1b2']);
 await wait(conf+".querySelectorAll('.dk-confirm').length===0");
 // Logs: levels, search, filter.
 const lg='document.querySelector(".dk-logs-card")';
 assert.equal(await js(lg+".querySelectorAll('.dk-log-line').length"),7);
 assert.equal(await js(lg+".querySelectorAll('.dk-log-line.lv-error').length"),1);
 assert.equal(await js(lg+".querySelectorAll('.dk-log-line.lv-warn').length"),1);
 assert.equal(await js(lg+".querySelectorAll('.dk-tick').length"),48);
 await js(`{const i=${lg}.querySelector('.dk-search');i.value='health';i.dispatchEvent(new Event('input'));}`);
 assert.equal(await js(lg+".querySelectorAll('.dk-log-line').length"),2);
 assert.equal(await js(lg+".querySelectorAll('.dk-log mark').length"),2);
 assert.equal(await js(lg+".querySelector('.dk-counter').textContent"),'2 из 7');
 await js(`{const i=${lg}.querySelector('.dk-search');i.value='';i.dispatchEvent(new Event('input'));${lg}.querySelector('[data-level=error]').click();}`);
 assert.equal(await js(lg+".querySelectorAll('.dk-log-line').length"),1);
 await js(lg+".querySelector('[data-level=all]').click()");
 await require('./card-shot.cjs')(win,'.dk-logs-card','petya-docker-logs');
 // Why it stops.
 const cr='document.querySelector(".dk-crash-card")';
 assert.deepEqual(await js(`[...${cr}.querySelectorAll('.dk-tile strong')].map(n=>n.textContent)`),['137','да','7','нет']);
 assert.equal(await js(cr+".querySelectorAll('.dk-tile.alert').length"),3);
 assert.equal(await js(cr+".querySelectorAll('.dk-log-line.evidence').length"),1,'the quoted line is marked');
 assert.equal(await js(cr+".querySelector('.kit-chip').textContent"),'OOMKilled');
 await require('./card-shot.cjs')(win,'.dk-crash-card','petya-docker-crash');
 // Disk: stacked bar, biggest images, dangling images with the confirmation open (asked from the chat).
 const dk='document.querySelector(".dk-disk-card")';
 assert.equal(await js(dk+".querySelectorAll('.dk-seg').length"),4);
 assert.equal(await js(dk+".querySelectorAll('.dk-bar-row').length"),3);
 assert.equal(await js(dk+".querySelectorAll('.dk-confirm-list li').length"),2);
 assert.equal(await js(dk+".querySelector('.dk-confirm-total').textContent"),'Итого: 1,3 ГБ · выбрано 2');
 await require('./card-shot.cjs')(win,'.dk-disk-card','petya-docker-disk');
 await js(dk+".querySelector('.dk-confirm .primary').click()");
 await waitNode(()=>writes().length===3);
 assert.deepEqual(writes().slice(1),[['image','rm','4444dddd5555'],['image','rm','5555eeee6666']]);
 await wait("/: 1 ·/.test(document.querySelector('.dk-disk-card .dk-dangling .dk-section').textContent)");
 await wait("[...document.querySelectorAll('.kit-toast')].some(n=>/используется контейнером/.test(n.textContent))");
 assert.equal(await js("document.querySelectorAll('.dk-card img').length"),0);
 console.log('Docker cards: container table with dots/bars/ports, confirmation before any call, logs search and level filter, crash facts with evidence, disk bars and dangling confirmation passed');
}};
require('../src/main.cjs');
