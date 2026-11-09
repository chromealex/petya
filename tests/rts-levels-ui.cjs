// «Генератор уровней» cards in the real chat, from data the real rtsmcp produced (tests/fixtures/rts-levels-cards.json:
// a 2-on-2 map with a river, an edit and a bot balance check; a symmetric 4-player map with more resources): the map on
// a canvas with starts and mines, players and path lengths, validation problems, balance bars, the actions; the
// projects list; the engine card with its download. Player names and problems stay text.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fixture=require('./fixtures/rts-levels-cards.json');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const river={...fixture.river,id:'draft-river',editor:true};
 const rot={...fixture.rot4,id:'draft-rot',editor:false,roster:fixture.rot4.roster.map((p,i)=>i===2?{...p,name:'<img src=x onerror=alert(1)>'}:p),issues:[{text:'goldmine: стоит на непроходимой клетке',error:true,count:2},{text:'tree и goldmine перекрываются',error:false,count:6}],errors:2};
 const saved={...fixture.rot4,id:'draft-saved',saved:{file:'maps/gen_classic_4p_s7.json',at:new Date().toISOString()},file:'maps/gen_classic_4p_s7.json',balance:{runs:4,players:[{n:1,name:'Blue',wins:2,winRate:0.5},{n:2,name:'Red',wins:1,winRate:0.25},{n:3,name:'Зелёные',wins:1,winRate:0.25},{n:4,name:'Жёлтые',wins:0,winRate:0}],seconds:{avg:431,min:388,median:425,max:497},timeouts:0,draws:0,games:[]}};
 const projects={type:'projects',folder:'/Users/me/RTSProjects/Iron Front',petyaProject:'Bunker Wars',templates:[{id:'skirmish',name:'Iron and Gold'},{id:'empty',name:'Пустой'}],projects:[
  {dir:'/Users/me/RTSProjects/Iron Front',name:'Iron Front',source:'chosen',current:true,maps:3},
  {dir:'/Users/me/RTSProjects/Frost Crown',name:'Frost Crown',source:'recent',current:false,maps:1},
  {dir:'/Users/me/Work/lane-test',name:'lane-test',source:'petya',current:false,maps:5}]};
 const eng={type:'engine',command:'сгенерируй карту 2 на 2 с рекой посередине',platform:'darwin',unsupported:'',size:43055202,version:'0.2.0',commit:'77126fa9',busy:false};
 const intel={...eng,unsupported:'Готовая сборка движка есть только для Mac на Apple Silicon (arm64), для Mac на Intel её нет. Укажите в настройках папку движка, собранного на этом компьютере.',size:null};
 const msg=(text,data)=>({role:'assistant',text,by:'Генератор уровней',extensionData:{rtsLevels:data}});
 await js(`view('home');showDialogueMessages([{role:'user',text:'сгенерируй карту 2 на 2 с рекой посередине'},${JSON.stringify(msg('Черновик.',river))},${JSON.stringify(msg('Черновик.',rot))},${JSON.stringify(msg('Сохранено.',saved))},{role:'user',text:'покажи мои RTS-проекты'},${JSON.stringify(msg('RTS-проекты: 3.',projects))},${JSON.stringify(msg('Нужен движок.',eng))},${JSON.stringify(msg('Нет сборки.',intel))}],'Карты')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.rtsl-card').length===6"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.rtsl-card').length"),6);
 const card=id=>`document.querySelector('.rtsl-card[data-draft-id="${id}"]')`;
 // The picture: a canvas sized to the map, starts and mines drawn on it.
 const size=await js(`(()=>{const c=${card('draft-river')}.querySelector('canvas');return [c.width,c.height,c.getBoundingClientRect().width];})()`);
 assert.ok(size[0]>=300&&size[1]>=300&&size[2]>=300,'a readable map picture: '+size);
 const pixels=await js(`(()=>{const c=${card('draft-river')}.querySelector('canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;const seen=new Set();for(let i=0;i<d.length;i+=4*97)seen.add(d[i]+','+d[i+1]+','+d[i+2]);return seen.size;})()`);
 assert.ok(pixels>5,'terrain colours, not a blank canvas');
 assert.equal(await js(`${card('draft-river')}.querySelectorAll('.rtsl-roster li').length`),4);
 assert.equal(await js(`${card('draft-river')}.querySelectorAll('.rtsl-team').length`),4,'teams shown for 2 on 2');
 assert.equal(await js("document.querySelectorAll('.rtsl-card img').length"),0,'player names are never HTML');
 assert.ok(await js(`[...${card('draft-rot')}.querySelectorAll('.rtsl-name')].some(n=>n.textContent==='<img src=x onerror=alert(1)>')`));
 assert.equal(await js(`${card('draft-river')}.querySelectorAll('.rtsl-paths li').length`),6,'path length per pair of starts');
 assert.equal(await js(`${card('draft-river')}.querySelectorAll('.rtsl-wins li').length`),0,'no bars when no match had a winner');assert.equal(await js(`${card('draft-saved')}.querySelectorAll('.rtsl-wins li').length`),4,'win rate per start');
 assert.match(await js(`${card('draft-river')}.querySelector('.rtsl-balance').textContent`),/без победителя/);
 assert.deepEqual(await js(`[...${card('draft-river')}.querySelectorAll('.kit-actions > button:not(.delete-button)')].map(b=>b.textContent)`),['Ещё вариант','Сохранить в проект','Проверить баланс ещё раз','Открыть в редакторе','Отменить правку']);
 assert.equal(await js(`${card('draft-river')}.querySelectorAll('.kit-actions .delete-button').length`),1,'delete is the red trash button');
 assert.match(await js(`${card('draft-river')}.querySelector('.kit-card-head').textContent`),/черновик/);
 // Problems found by the engine, errors first; no editor → no button.
 assert.deepEqual(await js(`[...${card('draft-rot')}.querySelectorAll('.rtsl-issues li')].map(li=>li.className)`),['error','warning']);
 assert.match(await js(`${card('draft-rot')}.querySelector('.kit-card-head').textContent`),/есть ошибки/);
 assert.equal(await js(`[...${card('draft-rot')}.querySelectorAll('.kit-actions button')].some(b=>b.textContent==='Открыть в редакторе')`),false);
 assert.match(await js(`${card('draft-saved')}.querySelector('.kit-card-head').textContent`),/сохранено/);
 assert.match(await js(`${card('draft-saved')}.querySelector('.rtsl-balance').textContent`),/примерно равны|заметно сильнее/);
 // Projects and the engine.
 assert.equal(await js("document.querySelectorAll('.rtsl-projects li').length"),3);
 assert.equal(await js("document.querySelectorAll('.rtsl-projects li.current').length"),1);
 assert.match(await js("document.querySelector('.rtsl-engine-card .kit-actions button.primary').textContent"),/Скачать движок · 43 МБ/);
 assert.equal(await js("document.querySelectorAll('.rtsl-engine-card')[1].querySelectorAll('button.primary').length"),0,'no download on an Intel Mac');
 const shot=require('./card-shot.cjs');
 const first=await shot(win,'.rtsl-card[data-draft-id="draft-river"]','petya-rts-levels');
 await js("document.getElementById('card-shot').remove()");
 const second=await shot(win,'.rtsl-card[data-draft-id="draft-rot"],.rtsl-card[data-draft-id="draft-saved"]','petya-rts-levels-issues');
 await js("document.getElementById('card-shot').remove()");
 const third=await shot(win,'.rtsl-projects-card,.rtsl-engine-card','petya-rts-levels-projects');
 console.log('RTS levels cards ('+first+', '+second+', '+third+'): map canvas with starts and mines, teams, paths, balance, problems, actions, projects, engine download passed');
}};
require('../src/main.cjs');
