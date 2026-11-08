// «Конкуренты»: routing incl. near-misses (contest, chess opponent, devices), not added, empty list → question,
// adding by exact name / ambiguous name (candidates) / App Store link / Google Play link, daily snapshots and change
// detection on fixed snapshots, highlights that must be verbatim quotes (an invented one is dropped), model-free
// highlights, rating trend, comparison with our App Store app from «Отзывы в сторах», Google Play through the web
// search engine or skipped, removal with restore, App Store errors, and the offer.
// No network: the iTunes API, the web search engine and the local model are stubbed.
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/competitors/feature.cjs');
const query=require('../src/extensions/competitors/query.cjs');
const itunes=require('../src/extensions/competitors/itunes.cjs');
const play=require('../src/extensions/competitors/play.cjs');
const history=require('../src/extensions/competitors/history.cjs');
const offer=require('../src/extensions/competitors/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const cache=require('../src/extension-cache.cjs');

const DAY1=new Date('2026-11-02T09:00:00Z'),DAY2=new Date('2026-11-09T09:00:00Z');
const COC_NOTES_OLD='Bug fixes and performance improvements.';
const COC_NOTES='Winter update!\n- New Hero: Minion Prince joins the Village\n- Clan Capital: new district Skeleton Park\n- Balance changes for Electro Titan';
// The App Store as Apple's lookup answers, per day.
function store(day){
 const second=day>='2026-11-09';
 return {
  '529479190':{trackId:529479190,kind:'software',trackName:'Clash of Clans',artistName:'Supercell',bundleId:'com.supercell.magic',version:second?'16.517':'16.400',releaseNotes:second?COC_NOTES:COC_NOTES_OLD,
   averageUserRating:4.56,userRatingCount:6100000,averageUserRatingForCurrentVersion:4.6,price:0,currency:'USD',formattedPrice:'Free',fileSizeBytes:String(second?2.9e8:2.6e8),
   currentVersionReleaseDate:second?'2026-11-05T08:00:00Z':'2026-09-20T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/clash-of-clans/id529479190?uo=4',primaryGenreName:'Games'},
  '1229016807':{trackId:1229016807,kind:'software',trackName:'Brawl Stars',artistName:'Supercell',version:'59.2',releaseNotes:'Brawl Pass season 33.',averageUserRating:second?4.41:4.30,userRatingCount:second?2100000:1900000,
   price:0,formattedPrice:'Free',fileSizeBytes:'400000000',currentVersionReleaseDate:'2026-10-01T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/brawl-stars/id1229016807'},
  '1234567890':{trackId:1234567890,kind:'software',trackName:'Bunker Wars',artistName:'Our Studio',version:'1.4.2',releaseNotes:'New bunker types.',averageUserRating:4.35,userRatingCount:12000,price:0,formattedPrice:'Free',
   fileSizeBytes:'150000000',currentVersionReleaseDate:'2026-11-02T08:00:00Z',trackViewUrl:'https://apps.apple.com/us/app/bunker-wars/id1234567890'}
 };
}
const SEARCH={
 'clash of clans':['529479190'],
 'clash':['529479190','1229016807'],
 'brawl':['1229016807']
};
function services({settings={},now=DAY1,model=null,web=null,fail=null}={}){
 const topic={id:'t',title:'Чат',projectId:'p1',messages:[]};
 const calls=[];
 const day=()=>s.__now.toISOString().slice(0,10);
 const s={__now:now,dataRoot:services.root,settings:{model:model?'qwen':'','extension_competitors':'true',competitorsCountry:'us',ollamaUrl:'http://127.0.0.1:11434/api/chat',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},state:{activeProjectId:'p1',projects:[{id:'p1',name:'Bunker Wars'},{id:'p2',name:'Tower Rush'}]},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  webSearchEngine:web,
  async request(url,options={}){
   const u=new URL(url);calls.push(u);
   if(fail)throw fail;
   if(u.host==='itunes.apple.com'&&u.pathname==='/lookup'){assert.equal(u.searchParams.get('entity'),'software');const st=store(day());return {resultCount:1,results:u.searchParams.get('id').split(',').map(id=>st[id]).filter(Boolean)};}
   if(u.host==='itunes.apple.com'&&u.pathname==='/search'){const st=store(day());return {results:(SEARCH[u.searchParams.get('term').toLowerCase()]||[]).map(id=>st[id])};}
   if(u.pathname==='/api/chat')return {message:{content:JSON.stringify(model(JSON.parse(options.body)))}};
   throw Object.assign(Error('unexpected '+url),{status:404});
  }};
 return {s,topic,calls};
}
const fresh=()=>{cache.reset();services.root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-competitors-'));};

(async()=>{
 // --- Routing.
 for(const p of ['что нового у конкурентов','добавь в конкуренты Clash of Clans','у кого вырос рейтинг','какие механики добавили в обновлениях','покажи список конкурентов','убери Brawl Stars из конкурентов',
  'сравни нас с конкурентами','следи за https://apps.apple.com/us/app/clash-of-clans/id529479190','что выпустили конкуренты за неделю'])
  assert.ok(query.about(p),'should trigger: '+p);
 for(const p of ['конкурс','объявили конкурс рисунков','конкурент в шахматах','у меня сильный конкурент в шахматном турнире','сравни iPad и iPhone','конкурентные преимущества продукта',
  'конкурентоспособная зарплата','какой рейтинг у нашей игры в App Store','у кого день рождения','что нового в Unity','какие механики в нашей игре','добавь задачу в Jira',''])
  assert.ok(!query.about(p),'should not trigger: '+p);
 assert.equal(query.intent('добавь в конкуренты Clash of Clans'),'add');assert.equal(query.intent('убери Brawl Stars из конкурентов'),'remove');
 assert.equal(query.intent('у кого вырос рейтинг'),'rating');assert.equal(query.intent('какие механики добавили в обновлениях'),'mechanics');assert.equal(query.intent('сравни нас с конкурентами'),'compare');
 assert.equal(query.intent('покажи список конкурентов'),'list');assert.equal(query.intent('что нового у конкурентов'),'news');
 assert.deepEqual(query.target('добавь в конкуренты Clash of Clans'),{name:'Clash of Clans',store:null});
 assert.deepEqual(query.target('Петя, добавь игру «Brawl Stars» в конкуренты'),{name:'Brawl Stars',store:null});
 assert.deepEqual(query.target('следи за https://apps.apple.com/us/app/clash-of-clans/id529479190'),{store:'appstore',id:'529479190',country:'us'});
 assert.deepEqual(query.target('добавь в конкуренты https://play.google.com/store/apps/details?id=com.supercell.hayday&hl=ru'),{store:'play',id:'com.supercell.hayday'});
 assert.deepEqual(query.target('добавь в конкуренты com.supercell.hayday'),{store:'play',id:'com.supercell.hayday'});
 assert.equal(itunes.fromUrl('https://apps.apple.com/app/id1229016807').id,'1229016807');
 // Play facts from a search answer, and dates in several spellings.
 assert.deepEqual(play.facts('Hay Day в Google Play: текущая версия 1.62.142, рейтинг 4,4, обновлено 3 ноября 2026 г. [1]'),{version:'1.62.142',rating:4.4,updated:'2026-11-03T00:00:00.000Z'});
 assert.equal(play.date('Updated on Nov 3, 2026'),'2026-11-03T00:00:00.000Z');
 assert.deepEqual(play.facts('Ничего определённого.'),{version:'',rating:null,updated:null});

 // --- Not added → null; empty list → question how to add.
 fresh();
 {const {s}=services({settings:{extension_competitors:'false'}});assert.equal(await app.turn(s,'что нового у конкурентов'),null);}
 {const {s,calls}=services();const r=await app.turn(s,'что нового у конкурентов');assert.ok(r.question);assert.match(r.text,/Список конкурентов проекта «Bunker Wars» пуст/);assert.equal(calls.length,0);}
 {const {s}=services();assert.equal(await app.turn(s,'конкурент в шахматах'),null);assert.equal(await app.turn(s,'объявили конкурс'),null);}

 // --- Day 1: add by exact name, by link, a Play package; ambiguous name → candidates.
 {const {s,calls}=services();
  let r=await app.competitorsTurn(s,'добавь в конкуренты Clash of Clans',DAY1);
  assert.ok(!r.question,r.text);assert.match(r.text,/^Добавил «Clash of Clans» в конкуренты проекта «Bunker Wars»/);
  assert.equal(calls[0].pathname,'/search');assert.equal(calls[0].searchParams.get('country'),'us');
  const c=r.extensionData.competitors;assert.equal(c.mode,'added');assert.equal(c.rows[0].name,'Clash of Clans');assert.equal(c.rows[0].url,'https://apps.apple.com/us/app/clash-of-clans/id529479190');assert.equal(c.mark,'appstore:529479190');
  r=await app.competitorsTurn(s,'добавь в конкуренты Clash',DAY1);
  assert.ok(r.question);assert.equal(r.extensionData.competitors.mode,'candidates');assert.deepEqual(r.extensionData.competitors.rows.map(x=>[x.name,x.tracked]),[['Clash of Clans',true],['Brawl Stars',false]]);
  r=await app.competitorsTurn(s,'следи за https://apps.apple.com/us/app/brawl-stars/id1229016807 как за конкурентом',DAY1);assert.match(r.text,/Добавил «Brawl Stars»/);
  r=await app.competitorsTurn(s,'добавь в конкуренты Clash of Clans',DAY1);assert.match(r.text,/уже в списке/);
  r=await app.competitorsTurn(s,'добавь в конкуренты Hay Day из Google Play',DAY1);assert.ok(r.question);assert.match(r.text,/Пришлите ссылку на страницу игры/);
  r=await app.competitorsTurn(s,'добавь в конкуренты https://play.google.com/store/apps/details?id=com.supercell.hayday',DAY1);
  assert.match(r.text,/Добавил «com\.supercell\.hayday»/);
  // Without the web module the Play app is skipped with a note, not guessed.
  const hay=r.extensionData.competitors.rows.find(x=>x.store==='play');assert.equal(hay.rating,null);assert.ok(r.extensionData.competitors.notes.some(n=>/Google Play: у магазина нет открытого API/.test(n)));
  assert.deepEqual(history.list(history.store(s),'p1').map(e=>e.key),['appstore:529479190','appstore:1229016807','play:com.supercell.hayday']);
  assert.deepEqual(history.list(history.store(s),'p2'),[],'lists are per project');
 }
 // --- Day 2: new CoC version with notes, Brawl Stars rating up; the model invents one feature, which is dropped.
 {let asked=null;
  const model=body=>{asked=body;return {apps:[{id:'appstore:529479190',highlights:[{quote:'New Hero: Minion Prince joins the Village',kind:'механика'},{quote:'Clan Capital: new district Skeleton Park',kind:'контент'},{quote:'Добавлен режим королевской битвы',kind:'механика'},{quote:'  balance changes for electro titan ',kind:'баланс'}]}]};};
  let searched=0;
  const web={enabled:()=>true,async search(q){searched++;assert.match(q,/com\.supercell\.hayday Google Play/);return {text:'Hay Day: версия 1.62.142, рейтинг 4,4, обновлено 3 ноября 2026 г. [1]',sources:[{title:'Hay Day – Apps on Google Play',url:'https://play.google.com/store/apps/details?id=com.supercell.hayday'}],verified:true};}};
  const {s,topic}=services({now:DAY2,model,web});
  const r=await app.competitorsTurn(s,'что нового у конкурентов',DAY2);
  const c=r.extensionData.competitors;
  assert.equal(c.mode,'news');
  const coc=c.rows.find(x=>x.name==='Clash of Clans'),bs=c.rows.find(x=>x.name==='Brawl Stars'),hd=c.rows.find(x=>x.store==='play');
  assert.equal(c.rows[0],coc,'changed and freshly updated first');
  assert.deepEqual(coc.changes.map(x=>x.kind),['version','size']);assert.deepEqual(coc.changes[0],{kind:'version',from:'16.400',to:'16.517'});
  assert.ok(coc.fresh);assert.equal(coc.since,'2026-11-02');
  assert.deepEqual(coc.highlights.map(x=>x.quote),['New Hero: Minion Prince joins the Village','Clan Capital: new district Skeleton Park','balance changes for electro titan'],'only verbatim quotes survive');
  assert.equal(coc.highlightsBy,'model');
  assert.ok(asked.messages[1].content.includes('Minion Prince'),'the model reads the real notes');
  assert.deepEqual(bs.changes.map(x=>x.kind),['rating','ratings']);assert.equal(bs.ratingDelta,0.11);
  assert.deepEqual(coc.history.map(x=>x.day),['2026-11-02','2026-11-09']);
  assert.equal(hd.rating,4.4);assert.equal(hd.version,'1.62.142');assert.equal(hd.web.sources[0].url,'https://play.google.com/store/apps/details?id=com.supercell.hayday');assert.equal(searched,1);
  assert.match(r.text,/^Обновились за 30 дней: 2 из 3 — Clash of Clans 16\.517 \(5 нояб\.\), com\.supercell\.hayday 1\.62\.142/);
  assert.match(r.text,/С прошлой проверки: Clash of Clans — версия 16\.400 → 16\.517, размер 248 → 277 МБ; Brawl Stars — рейтинг 4,3 → 4,41/);
  assert.deepEqual(topic.messages.at(-1).sources,[{title:'Hay Day – Apps on Google Play',url:'https://play.google.com/store/apps/details?id=com.supercell.hayday'}]);
  // Same day again: the Play page is not searched twice, and the snapshot of the day is replaced, not duplicated.
  await app.competitorsTurn(s,'что нового у конкурентов',DAY2);assert.equal(searched,1);
  assert.deepEqual(history.history(history.store(s),'appstore:529479190').map(x=>x.day),['2026-11-02','2026-11-09']);
  // Mechanics: the quotes of mechanics and content.
  const m=await app.competitorsTurn(s,'какие механики добавили в обновлениях',DAY2);
  assert.match(m.text,/^Что добавили в обновлениях за 30 дней — Clash of Clans: «New Hero: Minion Prince joins the Village», «Clan Capital: new district Skeleton Park»/);
  // Rating trend from the snapshots.
  const rt=await app.competitorsTurn(s,'у кого вырос рейтинг',DAY2);
  assert.equal(rt.extensionData.competitors.rows[0].name,'Brawl Stars');assert.match(rt.text,/^Рейтинг за неделю вырос у Brawl Stars \(4,3 → 4,41\)/);
 }
 // Model-free: highlights are the first bullet lines of the notes, as written.
 {const {s,calls}=services({now:DAY2});const r=await app.competitorsTurn(s,'что нового у конкурентов',DAY2);
  const coc=r.extensionData.competitors.rows.find(x=>x.name==='Clash of Clans');assert.equal(coc.highlightsBy,'text');
  assert.deepEqual(coc.highlights.map(x=>x.quote),['Winter update!','New Hero: Minion Prince joins the Village','Clan Capital: new district Skeleton Park']);
  assert.ok(calls.every(u=>u.host==='itunes.apple.com'));}
 // Compare with our game from «Отзывы в сторах».
 {const {s}=services({now:DAY2,settings:{storeReviewsAscApps:'Bunker Wars = 1234567890'}});
  const r=await app.competitorsTurn(s,'сравни нас с конкурентами',DAY2);const c=r.extensionData.competitors;
  assert.equal(c.ours[0].name,'Bunker Wars');assert.ok(c.ours[0].ours);
  assert.match(r.text,/^Наша «Bunker Wars»: 4,35 ★ \(12 тыс\. оценок\), обновлена 2 нояб\. Рейтинг выше нашего у 3 из 3 конкурентов/);
  const none=await app.competitorsTurn(services({now:DAY2}).s,'сравни нас с конкурентами',DAY2);assert.match(none.text,/Наших игр в «Отзывы в сторах» не нашёл/);}
 // Remove from chat, then restore through the card ipc; history survives.
 {const {s}=services({now:DAY2});const ipc=app.setup(s).ipc;
  const r=await app.competitorsTurn(s,'убери Brawl Stars из конкурентов',DAY2);
  assert.match(r.text,/^Убрал «Brawl Stars» из конкурентов/);assert.equal(r.extensionData.competitors.mode,'removed');
  assert.ok(!history.list(history.store(s),'p1').some(e=>e.key==='appstore:1229016807'));
  await ipc.restore('p1',r.extensionData.competitors.removed);assert.ok(history.list(history.store(s),'p1').some(e=>e.key==='appstore:1229016807'));
  assert.equal(history.history(history.store(s),'appstore:1229016807').length,2);
  const x=ipc.remove('p1','appstore:1229016807');assert.equal(x.entry.name,'Brawl Stars');assert.throws(()=>ipc.remove('p1','appstore:1229016807'),/уже нет/);
  await ipc.restore('p1',x.entry);
  const q=await app.competitorsTurn(s,'убери Angry Birds из конкурентов',DAY2);assert.ok(q.question);assert.match(q.text,/Не нашёл такой игры в списке/);
  // «Следить» on a candidate adds to the given project.
  const added=await ipc.add('p2',{store:'appstore',id:'529479190',name:'Clash of Clans'});assert.match(added.text,/добавлена/);assert.equal(history.list(history.store(s),'p2').length,1);
  await assert.rejects(ipc.add('p2',{store:'appstore',id:'abc'}),/Некорректная игра/);
  assert.deepEqual(ipc.lists().projects.map(p=>[p.name,p.items.length]),[['Bunker Wars',3],['Tower Rush',1]]);}
 // Errors: the App Store unavailable or limiting.
 {const {s}=services({now:DAY2,fail:Object.assign(Error('HTTP 503'),{status:503})});const r=await app.turn(s,'что нового у конкурентов');assert.ok(r.error);assert.match(r.text,/App Store недоступен \(HTTP 503\)/);}
 {const {s}=services({now:DAY2,fail:Object.assign(Error('HTTP 429'),{status:429})});const r=await app.turn(s,'добавь в конкуренты Clash of Clans');assert.ok(r.error);assert.match(r.text,/ограничил число запросов/);}
 // Change detection on fixed snapshots.
 assert.deepEqual(history.changes({version:'1.0',notes:'a',rating:4.5,ratings:1000,size:1e8,price:0},{version:'1.0',notes:'b',rating:4.5,ratings:1010,size:1e8,price:0.99}).map(c=>c.kind),['notes','price']);
 assert.deepEqual(history.changes(null,{version:'1'}),[]);
 assert.equal(app.verified('Hello world update',[{quote:'«world update»',kind:'контент'},{quote:'galaxy',kind:'механика'}]).length,1);
 // Settings.
 {const next={competitorsCountry:' RU '};app.validate(next);assert.equal(next.competitorsCountry,'ru');assert.throws(()=>app.validate({competitorsCountry:'russia'}),/двухбуквенный/);}
 // Offer: subject words offer it, near-misses do not; no connection needed.
 const all=offers.load();
 const pick=text=>{const d=offers.decide(offers.candidates(text,{offers:all,settings:{}}));return d?.one?.offer.id||null;};
 for(const p of ['что нового у конкурентов','добавь в конкуренты Clash of Clans','у кого вырос рейтинг','какие механики добавили в обновлениях'])assert.equal(pick(p),'competitors',p);
 for(const p of ['конкурс','конкурент в шахматах','сравни iPad и iPhone'])assert.notEqual(pick(p),'competitors',p);
 assert.equal(offer.ready({extension_competitors:'true'}),true);
 console.log('Competitors: routing and near-misses, add/remove per project, snapshots and changes, verbatim highlights, rating trend, compare with us, Google Play via search, errors and offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
