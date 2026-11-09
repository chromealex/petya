// «Grafana» in the real window against a local fake Grafana (tests/grafana-fake.cjs): the chat request end to end
// («что на дашборде лиг» → the dashboard card: stat tiles with threshold colors, a gauge, multi-series SVG lines with
// legend and hover, bar gauge bars, a table with column units, an unsupported panel with «Открыть в Grafana»,
// range chips asking the chat, variables, the Slack link), a pasted panel link (one panel), the dashboard list card,
// safe text, then Settings → «Grafana»: the connection check and «Сопоставить панели с метриками» proposing panels
// that the user saves. Screenshots: petya-grafana.png, petya-grafana-list.png, petya-grafana-settings.png.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const wait=async(code,n=300,ms=50)=>{for(let i=0;i<n;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,ms));}return false;};
 await js('window.chatNavigationReady');
 const fake=require('./grafana-fake.cjs');
 const server=await fake.start();
 try{
  await js(`window.petya.saveSettings({extension_grafana:'true',grafanaUrl:${JSON.stringify(server.url)},grafanaToken:${JSON.stringify(fake.TOKEN)},module_slack:'true',slackToken:'xoxp-ui'})`);
  await js("window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};true");
  // End to end: the chat request reaches the Grafana app and the card is drawn from the fake Grafana's frames.
  await js("view('home');submitChatCommand('что на дашборде лиг')");
  assert.equal(await wait("document.querySelectorAll('.grafana-card .gf-panel').length===8"),true,'the dashboard card is drawn');
  const card="document.querySelector('.grafana-card')";
  assert.match(await js(card+".querySelector('.kit-key').textContent"),/^Leagues · Game$/);
  assert.match(await js("document.querySelector('.grafana-card').closest('[data-extension-presentation]')?.textContent||[...document.querySelectorAll('.message-content')].map(n=>n.textContent).join(' ')"),/Дашборд «Leagues» \(папка Game\), за сутки/);
  const P=id=>card+".querySelector('.gf-panel[data-panel=\""+id+"\"]')";
  assert.equal(await js(P(1)+".querySelector('.gf-stat-value').textContent"),'128');
  assert.equal(await js(P(1)+".querySelector('.gf-stat').dataset.color"),'#ff9830','threshold color');
  assert.equal(await js("!!"+P(2)+".querySelector('.gf-spark')"),true);
  assert.match(await js(P(3)+".querySelector('.gf-stat-value').textContent"),/^\d{2},\d%$/);
  assert.equal(await js(P(3)+".querySelectorAll('.gf-gauge[role=meter] b').length"),2,'threshold marks on the gauge');
  assert.equal(await js(P(4)+".querySelectorAll('path.line').length"),3);
  assert.deepEqual(await js("[..."+P(4)+".querySelectorAll('.gf-series')].map(b=>b.dataset.series)"),['gold','silver','bronze']);
  await js("(()=>{const r="+P(4)+".querySelector('rect.hit'),b=r.getBoundingClientRect();r.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*0.6,clientY:b.top+10,bubbles:true}));})()");
  assert.match(await js(P(4)+".querySelector('.gf-tip').textContent"),/gold [\d\s,.]+ · silver [\d\s,.]+ · bronze /);
  await js(P(4)+".querySelector('.gf-series[data-series=silver]').click()");
  assert.equal(await js(P(4)+".querySelectorAll('path.line').length"),2,'legend toggles a series');
  await js(P(4)+".querySelector('.gf-series[data-series=silver]').click()");
  assert.equal(await js(P(5)+".querySelectorAll('.gf-bar').length"),4);
  assert.deepEqual(await js("[..."+P(6)+".querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent))"),[['bronze','3 400','2 900 $','47,0%'],['silver','2 100','8 800 $','50,0%'],['gold','900','15 400 $','54,0%']].map(r=>r.map(x=>x.replace(/(\d) (\d)/g,'$1\u00a0$2'))));
  assert.equal(await js(P(7)+".querySelectorAll('path.line').length"),1,'library panel');
  assert.match(await js(P(8)+".querySelector('.gf-unsupported').textContent"),/«text»/);
  assert.match(await js(P(8)+".querySelector('a.gf-open-text').href"),/viewPanel=8$/);
  assert.equal(await js(card+".querySelectorAll('b,img,script').length===0||!"+card+".querySelector('img')"),true,'no Grafana HTML');
  assert.equal(await js(card+".querySelector('.gf-ranges [aria-pressed=true]').dataset.range"),'now-24h');
  assert.match(await js(card+".querySelector('.gf-more-panels').textContent"),/Ещё панелей в Grafana: 1/);
  assert.equal(await js(card+".querySelectorAll('.gf-var').length"),2,'server and league, the hidden ones not shown');
  await js(card+".querySelector('.gf-ranges [data-range=\"now-7d\"]').click()");
  assert.equal(await wait("window.__asked.length===1",50,20),true);
  assert.deepEqual(await js('window.__asked[0]'),['Покажи дашборд «Leagues» за неделю',true]);
  assert.equal(await wait(card+".querySelector('.kit-actions .kit-link[data-provider=slack]')!==null",150,30),true);
  assert.equal(await js(card+".querySelector('.kit-actions .kit-link[data-provider=slack]').textContent"),'Отправить в Slack');
  assert.match(await js(card+".querySelector('.gf-open-dashboard').href"),/\/grafana\/d\/c9e4b7f6-9caf-428d-a93f-578ec4be556f\/leagues\?from=now-24h&to=now$/);
  await js("(()=>{const r="+P(4)+".querySelector('rect.hit'),b=r.getBoundingClientRect();r.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*0.6,clientY:b.top+10,bubbles:true}));})()");
  const file=await require('./card-shot.cjs')(win,'.grafana-card','petya-grafana',{width:700});
  await js("(()=>{const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight;})()");
  await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.getElementById('card-shot').remove()");
  // A pasted panel link: that panel only, the link's variable; and the dashboard list.
  await js(`submitChatCommand(${JSON.stringify(server.url+'/d/'+fake.UID+'/leagues?orgId=1&from=now-7d&to=now&var-league=gold&viewPanel=panel-4')})`);
  assert.equal(await wait("[...document.querySelectorAll('.grafana-card')].some(c=>c.querySelectorAll('.gf-panel').length===1)"),true);
  const one="[...document.querySelectorAll('.grafana-card')].find(c=>c.querySelectorAll('.gf-panel').length===1)";
  assert.deepEqual(await js("[..."+one+".querySelectorAll('path.line')].map(b=>b.dataset.series)"),['gold']);
  assert.equal(await js(one+".querySelectorAll('.gf-legend').length"),0,'one series, no legend');
  assert.equal(await js(one+".querySelector('.gf-ranges [aria-pressed=true]').dataset.range"),'now-7d');
  assert.equal(await js(one+".querySelector('.gf-var.set').dataset.var"),'league');
  await js(one+".querySelector('.gf-ranges [data-range=\"now-30d\"]').click()");
  assert.equal(await wait("window.__asked.length===2",50,20),true);
  assert.match((await js('window.__asked[1]'))[0],/^Покажи http:\/\/127\.0\.0\.1:\d+\/grafana\/d\/c9e4b7f6-9caf-428d-a93f-578ec4be556f\/leagues\?.*from=now-30d&to=now.*viewPanel=4/,'keeps panel and variable');
  await js("submitChatCommand('какие дашборды есть')");
  assert.equal(await wait("!!document.querySelector('.grafana-list')"),true);
  assert.equal(await js("document.querySelectorAll('.grafana-list .gf-item').length"),4);
  assert.deepEqual(await js("[...document.querySelectorAll('.grafana-list .gf-folder')].map(n=>n.textContent)"),['Game','Infra']);
  await js("document.querySelector('.grafana-list .gf-item-name').click()");
  assert.equal(await wait("window.__asked.length===3",50,20),true);
  assert.match((await js('window.__asked[2]'))[0],/^Покажи дашборд «.+»$/);
  await require('./card-shot.cjs')(win,'.grafana-list','petya-grafana-list',{width:700});
  await js("document.getElementById('card-shot').remove()");
  // Settings: the connection check, then the mapping proposal confirmed by the user.
  await js("window.extensionHost?.open?.('grafana')");
  await js("view('settings')");
  assert.equal(await wait("!!document.querySelector('[data-extension=grafana]')",100),true,'Grafana settings card is in the form');
  await js("(()=>{const c=document.querySelector('[data-extension=grafana]');c.hidden=false;const d=c.querySelector('details');if(d)d.open=true;document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'grafana'}));})()");
  assert.equal(await wait("/Grafana подключена \\(версия 11\\.3\\.0\\)\\. Дашбордов: 4\\./.test(document.querySelector('[data-extension=grafana] [role=status]')?.textContent||'')",200),true,'connection check');
  assert.equal(await js("document.querySelector('[data-extension=grafana] [name=grafanaToken]').type"),'password');
  assert.equal(await js("document.querySelector('[data-extension=grafana] [name=grafanaUrl]').value"),server.url);
  await js("[...document.querySelectorAll('[data-extension=grafana] button')].find(b=>b.textContent==='Сопоставить панели с метриками').click()");
  assert.equal(await wait("document.querySelectorAll('[data-extension=grafana] select[data-metric]').length===7",200),true,'a row per metric');
  const pick=m=>"(()=>{const s=document.querySelector('[data-extension=grafana] select[data-metric="+m+"]');return s.options[s.selectedIndex].textContent;})()";
  assert.equal(await js(pick('dau')),'Retention & Revenue › Daily active users');
  assert.equal(await js(pick('d7')),'Retention & Revenue › Retention · D7');
  assert.equal(await js(pick('revenue')),'Retention & Revenue › Gross revenue');
  // The user changes nothing for ARPDAU but drops D30, then saves.
  await js("(()=>{const s=document.querySelector('[data-extension=grafana] select[data-metric=d30]');s.value='';s.dispatchEvent(new Event('change'));})()");
  const shot=await require('./card-shot.cjs')(win,'[data-extension=grafana]','petya-grafana-settings',{width:700});
  await js("(()=>{const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight;})()");
  await new Promise(r=>setTimeout(r,300));
  require('node:fs').writeFileSync(shot.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
  // card-shot moved the settings card into its overlay: put it back into the form before using it again.
  await js("(()=>{const f=document.getElementById('settings-form');f.insertBefore(document.querySelector('#card-shot [data-extension=grafana]'),f.querySelector(':scope > button'));document.getElementById('card-shot').remove();})()");
  await js("[...document.querySelectorAll('[data-extension=grafana] button')].find(b=>b.textContent==='Сохранить сопоставление').click()");
  assert.equal(await wait("/Сопоставление сохранено: 6\\./.test([...document.querySelectorAll('[data-extension=grafana] [role=status]')].map(n=>n.textContent).join(' '))",100),true);
  const map=await js("window.petya.feature('grafana','status').then(s=>s.map)");
  assert.deepEqual(Object.keys(map).sort(),['arpdau','d1','d7','dau','new','revenue']);
  assert.deepEqual([map.dau.d,map.dau.p,map.d1.f],['ret-main',11,'D1']);
  assert.ok(server.calls.every(c=>c.method==='GET'||c.path.endsWith('/api/ds/query')),'read-only');
  console.log('Grafana card: chat request end to end, stats with thresholds, gauge, multi-series lines with legend and hover, bars, table units, unsupported panel link, range chips, Slack link, pasted panel link, dashboard list, settings check and metric mapping passed · '+file);
 }finally{await server.close();}
}};
require('../src/main.cjs');
