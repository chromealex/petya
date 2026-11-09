// «A/B-тесты» cards in the real chat: variants with intervals on a common axis, lift around zero, SRM, power line,
// warnings, plan and SRM-only cards, safe text, «Скопировать отчёт» and «Сколько ещё ждать?» asking the chat.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 await js('window.chatNavigationReady');
 const {analyze,plan}=require('../src/extensions/ab-test/analyze.cjs');
 const early=analyze({metric:'conversion',variants:[{name:'A',users:1000,conversions:120},{name:'B',users:980,conversions:141}],dailyTraffic:400});
 const three=analyze({metric:'conversion',variants:[{name:'A',users:10000,conversions:1000},{name:'B',users:10000,conversions:1080},{name:'<img src=x onerror=alert(1)>',users:10000,conversions:1150}]});
 const srm=analyze({metric:'assignment',variants:[{name:'A',users:50000},{name:'B',users:48000}]});
 const planned=plan({baseline:0.04,mde:0.1,dailyTraffic:3000});
 const msg=(user,card)=>[{role:'user',text:user},{role:'assistant',text:card.summary,by:'A/B-тесты',extensionData:{abTestCard:card}}];
 await js(`window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};window.__copied='';navigator.clipboard.writeText=async t=>{window.__copied=t;};
  view('home');showDialogueMessages(${JSON.stringify([...msg('значим ли тест? A: 1000 игроков 120 конверсий, B: 980 и 141',early),...msg('посчитай A/B для трёх вариантов',three),...msg('есть ли SRM: A 50000, B 48000',srm),...msg('сколько нужно игроков для теста при конверсии 4%',planned)])},'A/B')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.ab-card').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.ab-card').length"),4);
 const card=i=>"document.querySelectorAll('.ab-card')["+i+"]";
 // Early verdict, two rows with intervals, one lift, SRM ok, power line with days.
 assert.equal(await js(card(0)+".dataset.verdict"),'early');
 assert.equal(await js(card(0)+".querySelector('.kit-chip').textContent"),'рано');
 assert.equal(await js(card(0)+".querySelectorAll('.ab-variants .ab-row').length"),2);
 assert.equal(await js(card(0)+".querySelectorAll('.ab-row .ab-range').length"),2);
 assert.equal(await js(card(0)+".querySelector('.ab-row.control small').textContent"),'контроль');
 assert.equal(await js(card(0)+".querySelectorAll('.ab-lift').length"),1);
 assert.match(await js(card(0)+".querySelector('.ab-lift-value').textContent"),/^\+19,9%\[−4,4%; \+50,4%\]$/);
 assert.match(await js(card(0)+".querySelector('.ab-srm').textContent"),/разбиение ок/);
 assert.match(await js(card(0)+".querySelector('.ab-power').textContent"),/нужно 12\s004 на группу, сейчас 980.*ещё ~56 дней при 400 в день/);
 // Range left edges stay inside the track.
 assert.equal(await js(card(0)+".querySelectorAll('.ab-range').length"),3);
 // Three variants: Holm, the winner row, the variant name is text.
 assert.equal(await js(card(1)+".querySelectorAll('.ab-lift').length"),2);
 assert.equal(await js(card(1)+".querySelectorAll('img').length"),0,'names are never HTML');
 assert.equal(await js(card(1)+".querySelectorAll('.ab-row.winner').length"),1);
 assert.match(await js(card(1)+".querySelector('.ab-warnings').textContent"),/Холма/);
 // SRM-only: alert chip, expected markers.
 assert.equal(await js(card(2)+".dataset.verdict"),'srm');
 assert.equal(await js(card(2)+".querySelectorAll('.ab-expected').length"),2);
 // Plan: bars per MDE with the asked one highlighted.
 assert.ok(await js(card(3)+".querySelectorAll('.ab-plan-row').length")>=5);
 assert.equal(await js(card(3)+".querySelectorAll('.ab-plan-row.current').length"),1);
 // Actions.
 await js("[..."+card(0)+".querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Скопировать отчёт').click()");
 for(let i=0;i<50;i++){if(await js('window.__copied'))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js('window.__copied'),/^A\/B-тест: конверсия/);
 await js("[..."+card(0)+".querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Сколько ещё ждать?').click()");
 for(let i=0;i<50;i++){if((await js('window.__asked.length'))===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(await js('window.__asked'),[['Сколько ещё ждать A/B-тест?',true]]);
 assert.equal(await js(card(2)+".querySelectorAll('.kit-actions button').length"),1,'no wait button for an SRM-only check');
 const file=await require('./card-shot.cjs')(win,'.ab-card','petya-ab-test',{width:700});
 await js("const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight");
 await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot').remove()");
 // End to end: the real main process answers a chat request with the card.
 await js("window.petya.saveSettings({'extension_ab-test':'true'})");
 await js("submitChatCommand('значим ли тест? A: 20000 игроков 2000 конверсий, B: 20000 и 2300')");
 for(let i=0;i<300;i++){if(await js("[...document.querySelectorAll('.ab-card')].some(c=>c.dataset.verdict==='better')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await js("[...document.querySelectorAll('.ab-card')].find(c=>c.dataset.verdict==='better').querySelector('.kit-chip').textContent"),'B лучше');
 console.log('A/B card: intervals on a common axis, lift, SRM, power, warnings, plan, safe text, copy and wait, chat request end to end passed · '+file);
}};
require('../src/main.cjs');
