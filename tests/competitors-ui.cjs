// «Конкуренты» cards in the real chat: rows with icon placeholders (no images), rating sparkline from snapshots, last
// update chip, change badges, quoted highlights and collapsible notes, Google Play facts marked as found by search,
// the red trash «Убрать» with undo, «Следить» on search candidates, and the rating comparison with our game.
// The card data is produced by the extension from stubbed App Store answers over two days (no network).
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const DAY1=new Date('2026-10-26T09:00:00Z'),DAY2=new Date('2026-11-02T09:00:00Z'),DAY3=new Date('2026-11-09T09:00:00Z');
const NOTES='Winter update!\n- New Hero: Minion Prince joins the Village\n- Clan Capital: new district Skeleton Park\n- Balance changes for Electro Titan\n- Bug fixes';
function apps(day){
 const n=day>='2026-11-09'?2:day>='2026-11-02'?1:0;
 return {
  '529479190':{trackId:529479190,kind:'software',trackName:'Clash of Clans',artistName:'Supercell',version:['16.300','16.400','16.517'][n],releaseNotes:n===2?NOTES:'Bug fixes and performance improvements.',averageUserRating:[4.52,4.54,4.56][n],userRatingCount:6100000,price:0,formattedPrice:'Free',
   fileSizeBytes:String([2.5e8,2.6e8,2.9e8][n]),currentVersionReleaseDate:['2026-09-01T08:00:00Z','2026-10-30T08:00:00Z','2026-11-07T08:00:00Z'][n],trackViewUrl:'https://apps.apple.com/us/app/clash-of-clans/id529479190',primaryGenreName:'Strategy'},
  '1229016807':{trackId:1229016807,kind:'software',trackName:'Brawl Stars',artistName:'Supercell',version:'59.2',releaseNotes:'Brawl Pass season 33: new brawler Ollie and the Hypercharge for Mico.',averageUserRating:[4.28,4.3,4.41][n],userRatingCount:[1800000,1900000,2100000][n],
   price:0,formattedPrice:'Free',fileSizeBytes:'400000000',currentVersionReleaseDate:'2026-10-20T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/brawl-stars/id1229016807',primaryGenreName:'Action'},
  '1500000001':{trackId:1500000001,kind:'software',trackName:'<img src=x onerror=alert(1)> Kingdom Siege: Tower Defense Legends of the Very Long Title',artistName:'Indie <b>Games</b> Studio',version:'2.0.1',releaseNotes:'Minor fixes.',averageUserRating:[4.1,4.0,3.82][n],userRatingCount:45000,
   price:2.99,formattedPrice:'$2.99',fileSizeBytes:'180000000',currentVersionReleaseDate:'2026-08-15T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/kingdom/id1500000001',primaryGenreName:'Strategy'},
  '1234567890':{trackId:1234567890,kind:'software',trackName:'Bunker Wars',artistName:'Our Studio',version:'1.4.2',releaseNotes:'New bunker types.',averageUserRating:4.35,userRatingCount:12000,price:0,formattedPrice:'Free',
   fileSizeBytes:'150000000',currentVersionReleaseDate:'2026-11-02T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/bunker-wars/id1234567890'}
 };
}
async function cards(){
 const app=require('../src/extensions/competitors/feature.cjs');
 const h=require('../src/extensions/competitors/history.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-competitors-ui-'));
 const topic={id:'t',title:'Чат',projectId:'p1',messages:[]};
 let now=DAY1;
 const s={dataRoot:root,settings:{model:'qwen',extension_competitors:'true',competitorsCountry:'us',ollamaUrl:'http://127.0.0.1:11434/api/chat',storeReviewsAscApps:'Bunker Wars = 1234567890'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},state:{activeProjectId:'p1',projects:[{id:'p1',name:'Bunker Wars'}]},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  webSearchEngine:{enabled:()=>true,async search(){return {text:'Hay Day в Google Play: версия 1.62.142, рейтинг 4,4, обновлено 3 ноября 2026 г. [1]',sources:[{title:'Hay Day – Apps on Google Play',url:'https://play.google.com/store/apps/details?id=com.supercell.hayday'}],verified:true};}},
  async request(url,options){
   const u=new URL(url);const st=apps(now.toISOString().slice(0,10));
   if(u.pathname==='/lookup')return {results:u.searchParams.get('id').split(',').map(id=>st[id]).filter(Boolean)};
   if(u.pathname==='/search')return {results:[st['529479190'],{trackId:1600000002,kind:'software',trackName:'Clash Mini',artistName:'Supercell',version:'1.2',averageUserRating:4.2,userRatingCount:91000,price:0,currentVersionReleaseDate:'2026-06-01T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/clash-mini/id1600000002',primaryGenreName:'Strategy'},st['1229016807']]};
   if(u.pathname==='/api/chat')return {message:{content:JSON.stringify({apps:[{id:'appstore:529479190',highlights:[{quote:'New Hero: Minion Prince joins the Village',kind:'механика'},{quote:'Clan Capital: new district Skeleton Park',kind:'контент'},{quote:'Balance changes for Electro Titan',kind:'баланс'}]},{id:'play:com.supercell.hayday',highlights:[]}]})}};
   throw Error('unexpected '+url);
  }};
 const st=h.store(s);
 h.setList(st,'p1',[{key:'appstore:529479190',store:'appstore',id:'529479190',name:'Clash of Clans'},{key:'appstore:1229016807',store:'appstore',id:'1229016807',name:'Brawl Stars'},
  {key:'appstore:1500000001',store:'appstore',id:'1500000001',name:'Kingdom Siege'},{key:'play:com.supercell.hayday',store:'play',id:'com.supercell.hayday',name:'Hay Day'}]);
 for(const d of [DAY1,DAY2]){now=d;await app.competitorsTurn(s,'что нового у конкурентов',d);}
 now=DAY3;
 const news=await app.competitorsTurn(s,'что нового у конкурентов',DAY3);
 const compare=await app.competitorsTurn(s,'сравни нас с конкурентами',DAY3);
 const pick=await app.competitorsTurn(s,'добавь в конкуренты Clash',DAY3);
 return [news,compare,pick].map(r=>({text:r.text,data:r.extensionData.competitors}));
}
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' '+e.message);});
 await js('window.chatNavigationReady');
 const [news,compare,pick]=await cards();
 // The card's buttons reach the real main process: the app is added and the project list is seeded through the
 // same ipc «Отменить» uses (no network needed).
 await js("window.petya.saveSettings({extension_competitors:'true'})");
 await js("window.petya.feature('competitors','restore','p1',{key:'appstore:1229016807',store:'appstore',id:'1229016807',name:'Brawl Stars'})");
 const listed=()=>js("window.petya.feature('competitors','items','p1').then(r=>r.map(i=>i.key))");
 assert.ok((await listed()).includes('appstore:1229016807'));
 await js(`window.__asked=[];
  window.resultKit&&(window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);});
  view('home');showDialogueMessages([{role:'user',text:'что нового у конкурентов'},{role:'assistant',text:${JSON.stringify(news.text)},by:'Конкуренты',extensionData:{competitors:${JSON.stringify(news.data)}}},
   {role:'user',text:'сравни нас с конкурентами'},{role:'assistant',text:${JSON.stringify(compare.text)},by:'Конкуренты',extensionData:{competitors:${JSON.stringify(compare.data)}}},
   {role:'user',text:'добавь в конкуренты Clash'},{role:'assistant',text:${JSON.stringify(pick.text)},by:'Конкуренты',extensionData:{competitors:${JSON.stringify(pick.data)}}}],'Конкуренты')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.cmp-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.cmp-card').length"),3);
 const first="document.querySelectorAll('.cmp-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.cmp-row').length"),4);
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'no store images, names are text');
 assert.equal(await js(first+".querySelectorAll('.cmp-icon').length"),4);
 assert.equal(await js(first+".querySelector('.cmp-row .cmp-name').textContent"),'Clash of Clans');
 assert.equal(await js(first+".querySelectorAll('.cmp-row')[0].querySelectorAll('.cmp-highlights q').length"),3);
 assert.equal(await js(first+".querySelectorAll('.cmp-row')[0].querySelector('.cmp-notes summary').textContent"),'Что нового в 16.517');
 assert.ok(await js(first+".querySelectorAll('.cmp-spark polyline').length")>=3,'rating sparklines from three snapshots');
 assert.match(await js(first+".querySelectorAll('.cmp-row')[0].querySelector('.cmp-meta').textContent"),/обновлено 7 нояб\..*новая версия 16\.517.*размер \+/);
 assert.equal(await js(first+".querySelectorAll('.delete-button').length"),4,'«Убрать» is the red trash');
 assert.equal(await js(first+".querySelectorAll('[data-no-i18n].cmp-name').length"),4);
 const play=first+".querySelector('.cmp-row[data-key=\"play:com.supercell.hayday\"]')";
 assert.match(await js(play+".textContent"),/Google Play · поиск.*Источник: Hay Day – Apps on Google Play/);
 // Trash: removed through the ipc, undo restores.
 await js("document.querySelectorAll('.cmp-card')[0].querySelector('.cmp-row[data-key=\"appstore:1229016807\"] .delete-button').click()");
 for(let i=0;i<100;i++){if(await js("document.querySelector('.cmp-row[data-key=\"appstore:1229016807\"]').dataset.state==='removed'"))break;await new Promise(r=>setTimeout(r,30));}
 assert.ok(!(await listed()).includes('appstore:1229016807'),'removed from the project list');
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<100;i++){if(await js("document.querySelector('.cmp-row[data-key=\"appstore:1229016807\"]').dataset.state===''"))break;await new Promise(r=>setTimeout(r,30));}
 assert.ok((await listed()).includes('appstore:1229016807'),'«Отменить» restores it');
 // Compare: our game first, one rating scale.
 const second="document.querySelectorAll('.cmp-card')[1]";
 assert.equal(await js(second+".querySelectorAll('.cmp-bar').length"),5);
 assert.equal(await js(second+".querySelector('.cmp-bar.ours .cmp-bar-name').textContent"),'Bunker Wars');
 assert.equal(await js(second+".querySelectorAll('.cmp-row.ours .delete-button').length"),0,'our game cannot be removed');
 // Candidates: «Следить».
 const third="document.querySelectorAll('.cmp-card')[2]";
 assert.equal(await js(third+".querySelectorAll('.cmp-actions button.primary').length"),3);
 assert.equal(await js(third+".querySelector('.cmp-actions button.primary').disabled"),true,'already tracked');
 assert.equal(await js(third+".querySelectorAll('.cmp-actions button.primary')[1].disabled"),false);
 // Follow-up.
 await js(first+".querySelector(':scope>.kit-actions button').click()");
 for(let i=0;i<100;i++){if((await js('window.__asked.length'))===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual((await js('window.__asked'))[0],['Сравни наши игры с конкурентами',true]);
 await js("document.querySelectorAll('.cmp-card')[0].querySelectorAll('.cmp-notes')[0].open=true");
 const file=await require('./card-shot.cjs')(win,'.cmp-card','petya-competitors',{width:700});
 // Three pictures: the top, the middle (Google Play row, the comparison) and the bottom of the overlay.
 await js("{const b=document.getElementById('card-shot');b.scrollTop=document.querySelectorAll('.cmp-card')[1].offsetTop-260}");
 await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(file.replace(/\.png$/,'-3.png'),(await win.webContents.capturePage()).toPNG());
 await js("{const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight}");
 await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot').remove()");
 console.log('Competitors cards: rows with placeholders, sparklines, badges, quoted highlights, Play via search, trash with undo, compare, candidates passed');
}};
require('../src/main.cjs');
