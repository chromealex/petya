// «Объясни график» cards in the real chat, built by the real feature code (evidence readers stubbed in the main
// process): a DAU drop on a «Метрики игры» card explained by dated causes (line, usual level, event mark, numbered
// markers on the date axis, the causes list with dates, kinds, sources and a link), «Нет явной причины» with what was
// checked, the screenshot card offering the model download; safe text from evidence titles. Screenshot.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const until=async(code,ms=8000)=>{for(let i=0;i<ms/40;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,40));}return false;};
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/chart-explain/feature.cjs'),S=require('../src/extensions/chart-explain/series.cjs'),compute=require('../src/extensions/metrics/compute.cjs');
 const NOW=new Date(Date.UTC(2026,10,9,10));app.deps.now=()=>NOW.getTime();
 const w=compute.window(14,NOW),days=compute.range(w.from,w.to),wd=d=>new Date(d+'T00:00:00Z').getUTCDay();
 const dau=d=>d>='2026-11-04'&&d<='2026-11-05'?(d==='2026-11-04'?7400:9800):12000+(wd(d)===0||wd(d)===6?2200:0)+(d.charCodeAt(9)%3)*120;
 const metricsCard={period:{days:14},sources:[compute.block({id:'appmetrica',name:'AppMetrica',app:'Bunker Wars',series:[{metric:'dau',unit:'users',series:days.map(d=>({date:d,value:dau(d)}))}],cohorts:null,unavailable:[]},w)]};
 const chart=S.ADAPTERS.metricsCard(metricsCard),series=S.pick(chart,'dau');
 const s={settings:{},requestProgress:{report(){}}};
 app.deps.readers={
  releases:async()=>({kind:'releases',checked:true,items:[{kind:'release',date:'2026-11-03',title:'Релизная сборка «Release to stores» (main)',detail:'Release 1.4.2',source:'GitHub Actions',url:'https://github.com/studio/bunker-wars/actions/runs/1'}],errors:[]}),
  incidents:async()=>({kind:'incidents',checked:true,items:[{kind:'incident',date:'2026-11-04',until:'2026-11-04T09:40:00Z',title:'Инцидент «api»: <img src=x onerror=alert(1)>',source:'Prometheus'}],errors:[]}),
  crashes:async()=>({kind:'crashes',checked:false,items:[],errors:[]}),
  campaigns:async()=>({kind:'campaigns',checked:true,items:[{kind:'campaign',date:'2026-11-03',title:'Остановлена кампания «BW iOS US» (AppLovin)',detail:'расход 400 $/день → 0 $/день',source:'AppLovin'}],errors:[]}),
  holidays:require('../src/extensions/chart-explain/evidence.cjs').READERS.holidays};
 const why=await app.explain(s,{chart,series,direction:'down',question:'почему упал график',source:'card'});
 app.deps.readers={releases:async()=>({kind:'releases',checked:true,items:[],errors:[]}),incidents:async()=>{throw Error('Prometheus не ответил вовремя.');},holidays:async()=>({kind:'holidays',checked:true,items:[],errors:[]})};
 const quiet=await app.explain(s,{chart:{...chart,title:'Метрики игры'},series:{...series,points:series.points.map(p=>p.date==='2026-11-04'?{...p,value:7400}:p.date==='2026-11-05'?{...p,value:12100}:p)},direction:'down',question:'почему просел DAU',source:'card'});
 app.deps.readers=null;
 const offer={id:'m1',state:'needs-model',source:'screenshot',attachment:'a1',question:'почему упал график',vision:{model:null,name:'gemma3:4b',size:3.3e9},at:NOW.getTime()};
 assert.equal(why.verdict,'causes');assert.equal(quiet.verdict,'none');
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'DAU за 14 дней'},{role:'assistant',text:'Метрики.',by:'Метрики игры',extensionData:{metricsCard}},
  {role:'user',text:'почему упал график'},{role:'assistant',text:app.text(why),by:'Объясни график',extensionData:{chartExplain:why}},
  {role:'user',text:'почему просел DAU'},{role:'assistant',text:app.text(quiet),by:'Объясни график',extensionData:{chartExplain:quiet}},
  {role:'user',text:'почему упал график'},{role:'assistant',text:'Нужна модель.',by:'Объясни график',extensionData:{chartExplain:offer}}])},'Графики')`);
 assert.ok(await until("document.querySelectorAll('.explain-card').length===3"),'three cards');
 const c=i=>"document.querySelectorAll('.explain-card')["+i+"]";
 assert.equal(await js(c(0)+".dataset.verdict"),'causes');
 assert.equal(await js(c(0)+".querySelectorAll('.explain-causes li').length"),why.causes.length);
 assert.equal(await js("[..."+c(0)+".querySelectorAll('.explain-svg .cause-mark')].reduce((n,g)=>n+Number(g.dataset.count),0)"),why.causes.length,'every cause is marked on its day');
 assert.equal(await js(c(0)+".querySelectorAll('.explain-svg .cause-mark').length"),new Set(why.causes.map(x=>x.date)).size,'one marker per day');
 assert.equal(await js(c(0)+".querySelectorAll('.explain-svg circle.event.down').length"),1);
 assert.equal(await js(c(0)+".querySelector('.explain-causes li .explain-date').getAttribute('datetime')"),why.causes[0].date);
 assert.deepEqual(await js("[..."+c(0)+".querySelectorAll('.explain-causes li')].map(li=>li.dataset.kind)"),why.causes.map(x=>x.kind));
 assert.equal(await js(c(0)+".querySelectorAll('img').length"),0,'evidence titles are text');
 assert.equal(await js(c(0)+".querySelector('.explain-causes a').href"),'https://github.com/studio/bunker-wars/actions/runs/1');
 assert.equal(await js(c(0)+".querySelector('.explain-check.none').textContent"),'крэши');
 assert.equal(await js(c(1)+".dataset.verdict"),'none');
 assert.match(await js(c(1)+".querySelector('.explain-none b').textContent"),/Нет явной причины/);
 assert.equal(await js(c(1)+".querySelector('.explain-check.error').textContent"),'инциденты');
 assert.equal(await js(c(2)+".dataset.state"),'needs-model');
 assert.match(await js(c(2)+".querySelector('.kit-actions button.primary').textContent"),/Скачать модель · 3,1 ГБ/);
 const file=await require('./card-shot.cjs')(win,'.explain-card','petya-chart-explain',{width:700});
 console.log('Chart explain cards: line with usual level and event, numbered cause markers, dated causes with sources and link, checked sources, «Нет явной причины» with a failing reader, screenshot model offer, safe text passed · '+file);
}};
require('../src/main.cjs');
