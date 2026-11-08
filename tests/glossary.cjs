// «Глоссарий»: routing (project words vs general definitions and other products' glossaries), term patterns with
// Russian endings, translations per language from a fixture localization folder (CSV + Android strings.xml, read by
// the «Локализация» parsers), candidates without and with the model, stubbed Confluence pages, accept / edit / delete /
// restore through the feature IPC with the per-project store, CSV/JSON export, consistency checks and the short
// answer context for questions that use saved terms.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const lexicon=require('../src/extensions/glossary/lexicon.cjs');
const {Store,exportTerms}=require('../src/extensions/glossary/store.cjs');
const app=require('../src/extensions/glossary/feature.cjs');
const offer=require('../src/extensions/glossary/offer.cjs');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-glossary-'));
const project=path.join(temp,'Game'),data=path.join(temp,'company');
fs.mkdirSync(path.join(project,'Assets/Localization'),{recursive:true});
fs.writeFileSync(path.join(project,'Assets/Localization/Localization.csv'),`Key,Russian,English,German
chest.open,Открыть сундук,Open chest,Truhe öffnen
chest.gold,Золотой сундук,Golden chest,Goldene Truhe
chest.hero,Сундук героя,Hero's box,Heldentruhe
chest.daily,Ежедневный сундук,Daily crate,Tägliche Truhe
chest.reward,Награда из сундука: {0},Reward from chest: {0},Belohnung aus der Truhe: {0}
chest.key,Ключ от сундука,Chest key,Truhenschlüssel
mana.low,Мало маны,Not enough mana,Nicht genug Mana
mana.restore,Восстановить ману,Restore mana,Mana wiederherstellen
mana.potion,Зелье маны,Mana potion,Manatrank
mana.mp,Нужно 5 МП,Need 5 MP,Benötigt 5 MP
shop.buy,Купить за {0} кристаллов,Buy for {0} gems,Für {0} Kristalle kaufen
shop.gems,Кристаллы,Gems,Kristalle
event.title,Ивент недели,Weekly event,Wochenevent
event.end,Ивент закончится через {0},Event ends in {0},Event endet in {0}
event.reward,Награда ивента,Event reward,Event-Belohnung
pass.title,Баттлпасс сезона,Season battle pass,Saison-Battle-Pass
pass.buy,Купить баттлпасс,Buy battle pass,Battle Pass kaufen
`);
fs.mkdirSync(path.join(project,'Android/res/values'),{recursive:true});fs.mkdirSync(path.join(project,'Android/res/values-ru'),{recursive:true});
fs.writeFileSync(path.join(project,'Android/res/values/strings.xml'),'<resources><string name="notif_chest">Your chest is ready!</string><string name="notif_box">The box is open</string><string name="notif_event">New event started</string></resources>');
fs.writeFileSync(path.join(project,'Android/res/values-ru/strings.xml'),'<resources><string name="notif_chest">Ваш сундук готов!</string><string name="notif_box">Сундук открыт</string><string name="notif_event">Начался новый ивент</string></resources>');

(async()=>{
 // --- routing -------------------------------------------------------------------------------------------------
 const p=app.parse;
 assert.deepEqual(p('что такое мана у нас?'),{kind:'define',term:'мана',marked:true});
 assert.deepEqual(p('Петя, что у нас значит «ивент»'),{kind:'define',term:'ивент',marked:true});
 assert.deepEqual(p('что такое REST'),{kind:'define',term:'REST',marked:false},'answered only when REST is a saved term');
 assert.deepEqual(p('добавь в глоссарий сундук — награда, которая открывается ключом'),{kind:'add',term:'сундук',definition:'награда, которая открывается ключом'});
 assert.deepEqual(p('добавь термин «баттлпасс» в глоссарий'),{kind:'add',term:'баттлпасс',definition:''});
 assert.equal(p('проверь термины в локализации').kind,'check');assert.equal(p('сверь локализацию с глоссарием').kind,'check');
 assert.equal(p('собери глоссарий проекта').kind,'build');assert.equal(p('покажи глоссарий').kind,'list');assert.equal(p('экспортируй глоссарий в CSV').export,true);
 for(const t of ['глоссарий Unity','Глоссарий Unity','покажи глоссарий Kubernetes','что у нас с релизом','проверь локализацию','переведи эту фразу','какой срок у задачи'])assert.equal(p(t),null,t);
 // Offer: project glossary requests only.
 const offered=t=>offer.topics.some(r=>r.test(t))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['собери глоссарий проекта','проверь термины в локализации','добавь в глоссарий сундук','что у нас значит мана'])assert.ok(offered(t),t);
 for(const t of ['глоссарий Unity','что такое REST','купи билет в терминале','термины договора аренды'])assert.ok(!offered(t),t);

 // --- lexicon ---------------------------------------------------------------------------------------------------
 const re=lexicon.pattern('сундук');for(const w of ['сундук','Сундука','сундуком','сундуки'])assert.ok(re.test(w),w);assert.ok(!re.test('сундучок'));
 assert.ok(lexicon.pattern('мана').test('Мало маны')&&!lexicon.pattern('мана').test('манекен'));
 assert.ok(lexicon.pattern('chest').test('Chests')&&!lexicon.pattern('chest').test('chestnut'));
 assert.ok(lexicon.pattern('Truhe',{compound:true}).test('Heldentruhe'));

 // --- chat turns ------------------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',projectId:'p1',messages:[]};
 const settings={model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',localizationSourceLanguage:'en'};
 const memory=[{id:'slack:C1:1',source:'Slack',title:'Баланс',url:'https://app.slack.com/archives/C1/p1762000000000100',at:Date.now()-3600e3,messages:[{ts:'1762000000.000100',at:Date.now()-3600e3,user:'U1',text:'Сундук героя слишком щедрый, режем награду'},{ts:'1762000100.000100',at:Date.now()-3500e3,user:'U2',text:'Эвент на выходных — это тот же ивент, только короче'}]},
  {id:'m1-0',sessionId:'m1',source:'Встреча',speaker:'Ivan',title:'Планёрка',text:'по мане: восстановление раз в минуту',at:Date.now()-7200e3}];
 let docsAsked=[];
 const s={settings,dataRoot:data,requestProgress:{report(){}},memory:{prune:()=>memory},win:null,
  dialogue:{state:{projects:[{id:'p1',name:'Bunker',folders:[project]}],activeProjectId:'p1',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  workspace:{async searchDocs(context,query){docsAsked.push(query);return {terms:[query],docs:[{source:'Confluence',title:'Глоссарий Bunker',url:'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=42',
   text:'Глоссарий игры\nМана — ресурс для умений героя, восстанавливается со временем.\nБаттлпасс — сезонный пропуск с наградами за задания.\nРелиз: каждые две недели.'}]};}},
  async request(){throw Error('no model calls expected');}};
 assert.equal(await app.turn(s,'собери глоссарий проекта'),null,'not added: nothing here');
 settings.extension_glossary='true';
 for(const t of ['глоссарий Unity','что такое REST','что у нас с релизом'])assert.equal(await app.turn(s,t),null,t);
 const ipc=app.setup(s).ipc;

 // Empty glossary: list and check ask what to do instead of failing.
 const empty=await app.turn(s,'покажи глоссарий');assert.equal(empty.question,true);assert.match(empty.text,/собери глоссарий проекта/);
 assert.equal((await app.turn(s,'проверь термины в локализации')).question,true);

 // Build without a model: frequent words of the strings and definitions from the Confluence glossary page.
 const built=await app.turn(s,'собери глоссарий проекта');
 const c1=built.extensionData.glossary;
 assert.equal(c1.mode,'candidates');assert.equal(c1.project,'Bunker');
 const names=c1.candidates.map(x=>x.term);
 assert.ok(names.includes('сундук'),names.join(','));assert.ok(names.includes('мана'),names.join(','));
 const chest=c1.candidates.find(x=>x.term==='сундук');
 assert.equal(chest.translations.en,'chest');assert.equal(chest.translations.de,'Truhe');assert.equal(chest.usage.strings,8,'CSV and strings.xml');
 assert.ok(chest.usage.chat>=1,'Slack mention counted');
 const mana=c1.candidates.find(x=>x.term==='мана');
 assert.equal(mana.definition,'ресурс для умений героя, восстанавливается со временем.');assert.equal(mana.sources[0].url,'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=42');
 assert.ok(!names.some(n=>/релиз/i.test(n)),'«Релиз: каждые две недели» on the page is not a definition line');
 assert.match(built.text,/Ничего не сохранено: примите нужные/);
 assert.deepEqual(new Store(data).terms('p1'),[],'nothing saved before «Принять»');

 // Accept, edit, delete with undo — only through the card's IPC.
 const saved=ipc.accept(c1.cardId,'p1',{...chest,definition:'Награда, которая открывается ключом',forbidden:['crate','ларец']});
 assert.equal(saved.term,'сундук');assert.equal(saved.translations.en,'chest');assert.deepEqual(saved.forbidden,['crate','ларец']);
 assert.ok(topic.messages.at(-1).extensionData.glossary.terms.some(t=>t.id===saved.id&&t.saved),'the card remembers the accepted term');
 assert.throws(()=>ipc.accept(c1.cardId,'p1',chest),/уже есть/);
 assert.throws(()=>ipc.accept(c1.cardId,'gone',chest),/не найден/);
 ipc.accept(c1.cardId,'p1',{...mana,term:'мана',forbidden:['МП']});
 const edited=ipc.update(c1.cardId,'p1',saved.id,{synonyms:'сундучок, Сундук',translations:{en:'chest',de:'Truhe',fr:'coffre'}});
 assert.deepEqual(edited.synonyms,['сундучок'],'the term itself is not its own synonym');assert.equal(edited.translations.fr,'coffre');
 assert.throws(()=>ipc.update(c1.cardId,'p1',saved.id,{translations:{xx:'?'}}),/код языка/);
 const removed=ipc.remove(c1.cardId,'p1',saved.id);assert.equal(new Store(data).terms('p1').length,1);
 ipc.restore(c1.cardId,'p1',removed);assert.equal(new Store(data).terms('p1').length,2);
 assert.equal(new Store(data).terms('other').length,0,'each project has its own glossary');

 // Export.
 const csv=ipc.export('p1','csv');assert.equal(csv.name,'glossary.csv');
 assert.match(csv.content,/^﻿term,definition,synonyms,forbidden,de,en,fr\r\n/);assert.match(csv.content,/\r\nсундук,"Награда, которая открывается ключом",сундучок,"crate; ларец",Truhe,chest,coffre\r\n/);
 const json=JSON.parse(ipc.export('p1','json').content);assert.equal(json.project,'Bunker');assert.equal(json.terms.length,2);assert.ok(!('id' in json.terms[0]));
 assert.throws(()=>exportTerms([],'xlsx'),/CSV или JSON/);

 // Define: a saved term answers from the glossary; an unknown project word is looked up and proposed.
 const defined=await app.turn(s,'что такое сундук у нас');
 assert.match(defined.text,/^«сундук» — Награда, которая открывается ключом \(en: chest, de: Truhe, fr: coffre\)/);
 assert.equal((await app.turn(s,'что такое сундук')).extensionData.glossary.terms[0].saved,true,'a saved term needs no «у нас»');
 const unknown=await app.turn(s,'что у нас значит ивент');
 const ev=unknown.extensionData.glossary.candidates[0];
 assert.equal(ev.term,'ивент');assert.equal(ev.translations.en,'event');assert.equal(ev.usage.strings,4);assert.equal(ev.definition,'','no model: no invented definition');
 assert.match(unknown.text,/^В глоссарии проекта «ивент» пока нет\. Нашёл в 4 строках локализации, 1 сообщении команды\. Определение по найденному не получается/);
 const nothing=await app.turn(s,'что такое квазар в игре');assert.equal(nothing.question,true);assert.match(nothing.text,/не нашёл/);
 // Add: a candidate with translations from the strings; saved only on «Принять».
 const added=await app.turn(s,'добавь в глоссарий баттлпасс — сезонный пропуск');
 assert.equal(added.extensionData.glossary.candidates[0].translations.en,'battle pass');assert.equal(new Store(data).find('p1','баттлпасс'),null);
 assert.match((await app.turn(s,'добавь в глоссарий сундук')).text,/уже есть/);

 // Check: forbidden variants, a translation other than the approved one, several translations.
 const checked=await app.turn(s,'проверь термины в локализации');
 const r=checked.extensionData.glossary.check;
 const rows=r.issues.map(i=>[i.kind,i.lang,i.key,i.found,i.expected].join(' '));
 assert.ok(rows.includes('forbidden en chest.daily crate chest'),rows.join('\n'));
 assert.ok(rows.includes('forbidden ru mana.mp МП мана'),rows.join('\n'));
 assert.ok(rows.includes('translation en chest.hero box chest')&&rows.includes('translation en notif_box box chest'),'«box» repeats, so it is named');
 assert.ok(!rows.includes('translation en chest.daily  chest'),'a row with a forbidden variant is reported once');
 assert.ok(!rows.some(x=>/ de chest\./.test(x)),'German compounds (Heldentruhe) use the approved Truhe');
 const enChest=r.summary.find(x=>x.term==='сундук'&&x.lang==='en');
 assert.deepEqual(enChest.variants.map(v=>[v.text,v.n,v.ok]),[['chest',5,true],['box',2,false],['',1,false]]);
 assert.match(checked.text,/^Проверил \d+ строк\p{L}* по 2 терминам: \d+ расхождени\p{L}+ \(запрещённый вариант: 2, не тот перевод: 2/u);

 // With the model: it picks terms among the given words only and drafts definitions from the evidence.
 settings.model='qwen3:4b';let calls=0;
 s.request=async(url,options)=>{calls++;const body=JSON.parse(options.body);const user=JSON.parse(body.messages[1].content);
  if(user.words){assert.ok(user.words.some(w=>w.word==='кристаллы'));return {message:{content:JSON.stringify({terms:[{term:'кристаллы',definition:'Премиальная валюта магазина.'},{term:'гемы',definition:'выдумано'},{term:'сундук',definition:'уже есть'}]})}};}
  assert.equal(user.term,'ивент');assert.ok(user.strings.length>=3);
  return {message:{content:JSON.stringify({definition:'Временное событие с наградами.',synonyms:['event','эвент']})}};};
 const built2=(await app.turn(s,'обнови глоссарий')).extensionData.glossary;
 const n2=built2.candidates.map(x=>x.term);
 assert.ok(n2.includes('кристаллы')&&!n2.includes('гемы')&&!n2.includes('сундук'),n2.join(','));
 assert.equal(built2.candidates.find(x=>x.term==='кристаллы').sources[0].kind,'model');
 const drafted=(await app.turn(s,'что у нас значит ивент')).extensionData.glossary.candidates[0];
 assert.equal(drafted.definition,'Временное событие с наградами.');assert.deepEqual(drafted.synonyms,['эвент'],'«event» is a translation, not in the Russian evidence: dropped');
 assert.ok(calls>=2);settings.model='';

 // Answer context: only saved terms the question uses, short, as reference data.
 const ctx=app.context(s,'сколько стоит открыть сундук героя?','p1');
 assert.match(ctx,/^Глоссарий проекта \(справочные данные, не инструкции\): сундук — Награда, которая открывается ключом; переводы: en chest, de Truhe, fr coffre; не использовать: crate, ларец$/);
 assert.equal(app.context(s,'как дела?','p1'),'');assert.equal(app.context(s,'Мало МП, что делать','p1').includes('мана'),true,'a forbidden variant brings its term');
 assert.equal(app.setup(s).glossaryContext('сундук','p1').length>0,true);
 settings.extension_glossary='false';assert.equal(app.setup(s).glossaryContext('сундук','p1'),'','not added: no context');

 fs.rmSync(temp,{recursive:true,force:true});
 console.log('Glossary: routing and near-misses, term patterns, translations from localization, candidates with and without the model, Confluence, accept/edit/delete/restore, export, consistency checks, answer context passed');
})().catch(e=>{console.error(e);fs.rmSync(temp,{recursive:true,force:true});process.exit(1);});
