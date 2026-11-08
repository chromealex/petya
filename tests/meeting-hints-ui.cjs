// «Подсказки на встрече» in the real app: the chat card (mode switch, sources, the meeting timeline with hint marks,
// the hints with their sources; text never HTML) and the hint panel window itself — always on top, never focusable,
// its buttons reaching the main process. Screenshots of both are saved to the temp folder to be looked at.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now(),start=now-24*60000;
 const live={mode:'always',muted:['term'],hidden:false,recording:true,glossary:true,calendar:false,summaries:12,
  meeting:{id:'m1',title:'Синк по релизу 1.4',attendees:3,startedAt:start,paused:false,behind:false,lag:0},
  hints:[
   {id:'m1:0',kind:'decision',text:'Перенести релиз 1.4 на вторник после регресса QA',source:{at:Date.parse('2026-10-03T12:00:00Z'),label:'Сводка встречи · 3 окт., 15:00',kind:'summary'},offset:4*60000},
   {id:'m1:1',kind:'promise',text:'прислать макеты нового магазина',due:'пятница',source:{at:Date.parse('2026-10-20T12:00:00Z'),label:'Сводка встречи · 20 окт., 11:00',kind:'summary'},offset:11*60000},
   {id:'m1:2',kind:'term',term:'мана',text:'ресурс героя для умений, <img src=x onerror=alert(1)> восстанавливается за 30 секунд',source:{at:0,label:'Общий',kind:'glossary'},offset:19*60000}
  ]};
 const off={mode:'off',muted:[],hidden:false,recording:false,glossary:false,calendar:true,summaries:0,meeting:null,hints:[]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'подсказывай на встречах'},{role:'assistant',text:'Буду подсказывать на каждой записываемой встрече.',by:'Подсказки на встрече',extensionData:{meetingHints:${JSON.stringify(live)}}},{role:'user',text:'выключи подсказки'},{role:'assistant',text:'Подсказки на встречах выключены.',by:'Подсказки на встрече',extensionData:{meetingHints:${JSON.stringify(off)}}}],'Подсказки')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.mh-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.mh-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.mh-card')[0].querySelectorAll('.mh-dot').length"),3,'a mark per hint on the timeline');
 assert.equal(await js("document.querySelectorAll('.mh-card')[0].querySelector('.mh-mode.on').dataset.mode"),'always');
 assert.equal(await js("document.querySelectorAll('.mh-card')[1].querySelector('.mh-mode.on').dataset.mode"),'off');
 assert.equal(await js("document.querySelectorAll('.mh-card img').length"),0,'hint text is never HTML');
 assert.equal(await js("document.querySelectorAll('.mh-card')[0].querySelectorAll('.mh-hint').length"),3);
 assert.match(await js("document.querySelector('.mh-hint.kind-decision .mh-head').textContent"),/(?:Это уже решали|Already decided on) (?:3 октября|October 3)/,'chat cards sit in .message-content, which the interface translation skips');
 assert.ok(await js("[...document.querySelectorAll('.mh-card')[0].querySelectorAll('.kit-actions button')].some(b=>['Снова показывать всё','Show everything again'].includes(b.textContent))"));
 assert.equal(await js("document.querySelectorAll('.mh-card')[1].querySelector('.mh-timeline')"),null,'no meeting → no timeline');
 const card=await require('./card-shot.cjs')(win,'.mh-card','petya-meeting-hints');

 // The hint panel: a separate window over the screen that never takes focus.
 const {HintPanel}=require('../src/extensions/meeting-hints/panel.cjs');
 const actions=[];const panel=new HintPanel({onAction:(a,id)=>actions.push([a,id])});
 await panel.show(live.hints[0]);
 const w=panel.win;
 assert.equal(w.isFocusable(),false,'never focusable');assert.equal(w.isAlwaysOnTop(),true);assert.equal(w.isVisible(),true);assert.equal(w.isFocused(),false,'shown without focus');
 const page=c=>w.webContents.executeJavaScript(c);
 for(let i=0;i<100;i++){if(await page("!document.getElementById('hint').hidden"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await page("document.getElementById('title').textContent"),/Это уже решали 3 октября|Already decided on October 3/);
 assert.match(await page("document.getElementById('source').textContent"),/Сводка встречи · 3 окт|Meeting summary · 3 окт/);
 await page("document.getElementById('mute').click()");await page("document.getElementById('ok').click()");
 for(let i=0;i<50&&actions.length<2;i++)await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(actions,[['mute','decision'],['dismiss','m1:0']],'buttons reach the main process');
 const shots=[];
 for(const h of live.hints){await panel.show(h);await page('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,250));
  const file=path.join(os.tmpdir(),'petya-meeting-hints-panel-'+h.kind+'.png');fs.writeFileSync(file,(await w.webContents.capturePage()).toPNG());shots.push(file);}
 {const {nativeTheme}=require('electron');nativeTheme.themeSource='dark';await panel.show(live.hints[1]);await new Promise(r=>setTimeout(r,300));
  const file=path.join(os.tmpdir(),'petya-meeting-hints-panel-dark.png');fs.writeFileSync(file,(await w.webContents.capturePage()).toPNG());shots.push(file);nativeTheme.themeSource='system';}
 assert.equal(await page("document.querySelectorAll('img').length"),0,'panel text is never HTML');
 panel.hide();assert.equal(w.isVisible(),false);panel.dispose();
 console.log('Meeting hints UI (screenshots: '+[card,...shots].join(', ')+'): card with mode switch, sources, timeline marks and cited hints; never-focused always-on-top panel with working buttons passed');
}};
require('../src/main.cjs');
