// «Локализация»: language codes, placeholder checks, every file format (parse + write to a new file), the
// project scan, per-language report, translation with protected placeholders (model stubbed), saving only on
// the card's button into new files, routing with near-misses, attachments, no-model behaviour and the offer.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const langs=require('../src/extensions/localization/langs.cjs');
const checks=require('../src/extensions/localization/checks.cjs');
const formats=require('../src/extensions/localization/formats.cjs');
const find=require('../src/extensions/localization/find.cjs');
const {translate,protect,restore}=require('../src/extensions/localization/translate.cjs');
const app=require('../src/extensions/localization/feature.cjs');
const offer=require('../src/extensions/localization/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const FIX=path.join(__dirname,'fixtures/localization');
const hash=dir=>{const h=crypto.createHash('sha1');const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(!/\.petya-/.test(e.name)){h.update(p);h.update(fs.readFileSync(p));}}};walk(dir);return h.digest('hex');};

(async()=>{
 // --- Languages ---
 assert.deepEqual([langs.code('pt_BR'),langs.code('pt-rBR'),langs.code('b+es+419'),langs.code('zh-hans'),langs.code('values'),langs.code('key')],['pt-BR','pt-BR','es-419','zh-Hans',null,null]);
 assert.deepEqual([langs.header('German [de]'),langs.header('English(en)'),langs.header('Spanish'),langs.header('Русский'),langs.header('Desc')],['de','en','es','ru',null]);
 assert.deepEqual(app.targets('недостающие ключи на немецкий'),['de']);
 assert.deepEqual(app.targets('переведи с английского на испанский'),['es']);
 assert.deepEqual(app.targets('проверь локализацию для pt-BR'),['pt-BR']);
 assert.deepEqual(langs.requested('на китайский'),['zh']);
 // --- Placeholders (code, not the model) ---
 assert.deepEqual(checks.placeholders('Hi {0}, %d coins, <b>{name}</b> {{n}} %1$s %@ 50% off %(count)s'),['%(count)s','%1$s','%@','%d','</b>','<b>','{0}','{name}','{{n}}']);
 assert.equal(checks.mismatch('Coins: {0}','Münzen: {0}'),null);
 assert.equal(checks.mismatch('{0:N2} gold','{0} Gold'),null,'format specifiers do not matter');
 assert.deepEqual(checks.mismatch('Level {level}!','Level!'),{lost:['{level}'],extra:[]});
 assert.equal(checks.mismatch('Price %d','Preis %i'),null,'%i is %d');
 // --- Formats one by one ---
 const csv=formats.parse('I2Languages.csv',fs.readFileSync(path.join(FIX,'i2/I2Languages.csv'),'utf8'));
 assert.deepEqual(csv.langs,['en','de','es'],'Type/Desc are not languages');assert.equal(csv.values.en.get('Dialog/Welcome'),'Welcome, {0}!\nReady?','quoted multi-line cell');
 assert.equal(formats.yamlScalar(["'Tap anywhere to start.",'','      Swipe to move.\'']),'Tap anywhere to start.\nSwipe to move.');
 assert.equal(formats.yamlScalar(['"Line \\"one\\"\\nLine two"']),'Line "one"\nLine two');
 assert.equal(formats.yamlScalar(["'It''s'"]),"It's");
 assert.deepEqual(formats.stringsPairs('/* c */ "a" = "x \\"y\\"";\n// d\n"b"="";'),[['a','x "y"'],['b','']]);
 assert.equal(formats.androidText('Don\\\'t <b>stop</b> &amp; \\"go\\"'),'Don\'t <b>stop</b> & "go"');
 assert.equal(formats.androidEscape("L'été & <b>x</b> 5 < 6"),"L\\'été &amp; <b>x</b> 5 &lt; 6");
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-loc-'));
 const project=path.join(tmp,'Game');fs.cpSync(FIX,project,{recursive:true});fs.rmSync(path.join(project,'make.py'));
 const before=hash(project);
 const parts=await find.scan([project]);
 const all=formats.sets(parts,{source:'en'});
 const by=f=>all.find(x=>x.format===f);
 assert.deepEqual(all.map(x=>x.format).sort(),['android','csv','json','po','strings','unity','xcstrings']);
 assert.deepEqual(by('unity').langs.sort(),['de','en','es']);assert.equal(by('unity').values.en.get('tutorial.intro'),'Tap anywhere to start.\nSwipe to move your hero.');
 assert.equal(by('unity').values.en.get('shop.offer'),'Buy <b>{0}</b> gems for {1}');
 assert.equal(by('android').source,'en');assert.ok(by('android').skip.has('app_name'));assert.ok(!by('android').langs.includes('night'),'values-night is not a language');
 assert.equal(by('strings').values.de.get('play'),'Spielen','UTF-16 .strings');
 assert.ok(by('xcstrings').skip.has('Tower Rush'));
 assert.equal(by('po').values.de.get('Load game'),'','fuzzy counts as untranslated');assert.ok(by('po').keys.includes('button\u0004Back'));
 // Unity tables without .meta files are joined by collection name.
 const bare=path.join(tmp,'bare');fs.mkdirSync(bare);for(const f of ['UI Shared Data.asset','UI_en.asset','UI_de.asset'])fs.copyFileSync(path.join(FIX,'unity/Assets/Localization',f),path.join(bare,f));
 assert.deepEqual(formats.sets(await find.scan([bare]))[0].langs.sort(),['de','en']);
 // --- Report ---
 const report=checks.check(by('unity'),{ratio:1.4});
 const de=report.rows.find(r=>r.lang==='de'),es=report.rows.find(r=>r.lang==='es');
 assert.deepEqual([de.total,de.translated,de.missing,de.empty,de.placeholders,de.long],[6,4,1,1,1,1]);
 assert.deepEqual([es.missing,es.identical],[3,1]);
 assert.match(report.problems.find(p=>p.kind==='long').detail,/кнопка может не вместить/);
 assert.equal(checks.check(by('unity'),{ratio:4}).rows.find(r=>r.lang==='de').long,0,'ratio is configurable');
 assert.deepEqual(checks.check(by('unity'),{only:['es']}).rows.map(r=>r.lang),['es']);
 // --- Writers: a new file next to the source, readable again, never over an existing file ---
 const exists=p=>fs.existsSync(p);
 const roundtrip=(set,lang,map)=>{const out=formats.write(set,lang,map,exists);assert.ok(!fs.existsSync(out.path),'new file '+out.path);assert.match(path.basename(out.path),new RegExp('\\.petya-'+lang+'(?:-\\d+)?\\.'));fs.writeFileSync(out.path,out.content,{flag:'wx'});return out;};
 let out=roundtrip(by('csv'),'es',new Map([['Menu/Quit','Salir'],['Dialog/Welcome','¡Bienvenido, {0}!\n¿Listo?']]));
 assert.equal(path.basename(out.path),'I2Languages.petya-es.csv');
 const back=formats.parse(out.path,fs.readFileSync(out.path,'utf8'));assert.equal(back.values.es.get('Dialog/Welcome'),'¡Bienvenido, {0}!\n¿Listo?');assert.equal(back.values.de.get('Menu/Play'),'Spielen');
 assert.equal(path.basename(formats.write(by('csv'),'es',new Map([['Menu/Quit','Salir']]),exists).path),'I2Languages.petya-es-2.csv','existing output is never overwritten');
 out=roundtrip(by('json'),'ru',new Map([['errors.network','Нет связи. Попробуйте позже.']]));
 assert.equal(path.basename(out.path),'ru.petya-ru.json');assert.deepEqual(JSON.parse(out.content).errors,{network:'Нет связи. Попробуйте позже.'});assert.equal(JSON.parse(out.content).menu.play,'Играть');
 out=roundtrip(by('android'),'de',new Map([['rate_us','Gefällt dir das Spiel? Bewerte uns!'],['quote',"Gib nicht auf, it's ok"]]));
 assert.equal(path.dirname(out.path),path.join(project,'android/app/src/main'),'Android output stays outside res/');
 assert.match(out.content,/<string name="rate_us">Gefällt dir das Spiel\? Bewerte uns!<\/string>/);assert.match(out.content,/<string name="quote">Gib nicht auf, it\\'s ok<\/string>\n<\/resources>/);
 out=roundtrip(by('strings'),'de',new Map([['lives','Leben: %d'],['quote','Sag „hallo“']]));
 assert.equal(path.basename(out.path),'Localizable.petya-de.strings');assert.match(out.content,/"lives" = "Leben: %d";/);assert.match(out.content,/"quote" = "Sag „hallo“";/);
 out=roundtrip(by('xcstrings'),'de',new Map([['Watch an ad to get %@ gems','Sieh dir Werbung an für %@ Edelsteine']]));
 assert.equal(JSON.parse(out.content).strings['Watch an ad to get %@ gems'].localizations.de.stringUnit.state,'needs_review');
 out=roundtrip(by('po'),'de',new Map([['Load game','Spiel laden'],['button\u0004Back','Zurück'],['You found %(count)s keys','Du hast %(count)s Schlüssel gefunden']]));
 const poBack=formats.parse(out.path.replace(/\.po$/,'.po'),out.content);assert.equal(poBack.map.get('Load game'),'Spiel laden','fuzzy flag removed');assert.equal(poBack.map.get('button\u0004Back'),'Zurück');assert.equal(poBack.map.get('You found %(count)s keys'),'Du hast %(count)s Schlüssel gefunden');
 out=roundtrip(by('unity'),'es',new Map([['hud.level_up','¡Nivel {level} alcanzado!']]));
 assert.equal(path.basename(out.path),'UI.petya-es.csv');assert.match(out.content,/^Key,Id,испанский\(es\)\n/);assert.match(out.content,/hud\.level_up,1004,¡Nivel \{level\} alcanzado!/);
 for(const f of fs.readdirSync(project,{recursive:true}))if(/\.petya-/.test(f))fs.rmSync(path.join(project,f));
 assert.equal(hash(project),before,'source files untouched');
 // --- Translation with protected placeholders ---
 assert.deepEqual(protect('Buy <b>{0}</b> for %d'),{masked:'Buy ⟦1⟧⟦2⟧⟦3⟧ for ⟦4⟧',tokens:['<b>','{0}','</b>','%d']});
 assert.equal(restore('Kaufe ⟦1⟧⟦2⟧⟦3⟧ für ⟦4⟧',['<b>','{0}','</b>','%d']),'Kaufe <b>{0}</b> für %d');
 assert.equal(restore('Kaufe ⟦1⟧ für ⟦4⟧',['<b>','{0}','</b>','%d']),null);
 const calls=[];
 const fakeModel=(rule)=>async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);const {items}=JSON.parse(body.messages[1].content);assert.ok(body.format.properties.items,'JSON schema is sent');
  return {message:{content:JSON.stringify({items:items.map(x=>({id:x.id,text:rule(x.text)}))})}};};
 const s0={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},request:fakeModel(t=>/gems/.test(t)?t.replace(/⟦\d+⟧/g,''):'DE '+t)};
 const tr=await translate(s0,[{key:'a',source:'Coins: {0}'},{key:'b',source:'Buy <b>{0}</b> gems for {1}'}],{from:'en',to:'de'});
 assert.equal(tr.done.get('a'),'DE Coins: {0}');assert.deepEqual(tr.failed.map(f=>[f.key,f.reason]),[['b','модель потеряла или изменила плейсхолдеры']]);
 assert.equal(calls.length,2,'a failed string is retried once');assert.match(calls[0].messages[0].content,/с языка «английский» на язык «немецкий»/);
 // --- Chat ---
 const topic={id:'t',title:'Чат',projectId:'p',messages:[]};
 const pending=new Map();const sent=[];
 const s={settings:{localizationLengthRatio:'1.4',localizationSourceLanguage:'en'},companyId:'c1',requestProgress:{report(){}},projectMemory:{get:()=>null},
  win:{isDestroyed:()=>false,webContents:{send:(ch,item)=>sent.push([ch,item])}},
  dialogue:{state:{projects:[{id:'p',folders:[]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{pending,list:()=>[...pending.values()].map(({id,name})=>({id,name})),take:ids=>ids.map(id=>structuredClone(pending.get(id))),remove(id){pending.delete(id);},info:f=>({id:f.id,name:f.name})},
  async request(){throw Error('the model must not be called');}};
 const ipc=app.setup(s).ipc;
 assert.equal(await app.turn(s,'проверь локализацию'),null,'not added: nothing here');
 s.settings.extension_localization='true';
 for(const miss of ['переведи эту фразу на английский','перевод денег на карту','перевести задачу в другой статус','переведи 100 рублей Пете','как дела?'])assert.equal(await app.turn(s,miss),null,'near-miss: '+miss);
 for(const hit of ['что не переведено','проверь локализацию','недостающие ключи на немецкий','переведи пустые строки на испанский'])assert.ok(app.wanted(s,hit),'phrase: '+hit);
 const ask=await app.turn(s,'проверь локализацию');
 assert.equal(ask.question,true);assert.match(ask.text,/Подключите папку проекта/);
 s.dialogue.state.projects[0].folders=[path.join(project,'unity')];
 const checked=await app.turn(s,'что не переведено?');
 const card=checked.extensionData.localization;
 assert.equal(card.sets[0].name,'UI');assert.deepEqual(card.langs.map(r=>r.lang),['es','de'],'least translated first');
 assert.match(checked.text,/Испанский: переведено 3 из 6 \(нет перевода 3, как в исходнике 1\)\./);
 assert.equal(topic.messages.at(-1).by,'Локализация');
 const onlyDe=await app.turn(s,'недостающие ключи на немецкий');
 assert.deepEqual(onlyDe.extensionData.localization.langs.map(r=>r.lang),['de']);assert.ok(onlyDe.extensionData.localization.problems.every(p=>p.lang==='de'));
 const noLang=await app.turn(s,'недостающие ключи на японский');
 assert.equal(noLang.question,true);assert.match(noLang.text,/нет языка «японский»/);
 assert.equal((await app.turn(s,'покажи проблемы с плейсхолдерами в локализации')).extensionData.localization.filter,'placeholders');
 // Translate: the model translates, nothing is written until «Сохранить переводы».
 s.settings.model='qwen3:8b';s.settings.ollamaUrl='http://127.0.0.1:11434';s.request=fakeModel(t=>/gems/.test(t)?'Kaufe Edelsteine':'ES '+t);
 const fill=await app.turn(s,'переведи пустые строки на испанский');
 const t=fill.extensionData.localization.translation;
 assert.equal(t.count,2);assert.equal(t.failedCount,1);assert.equal(t.failed[0].key,'shop.offer');assert.match(t.failed[0].reason,/плейсхолдер/);
 assert.ok(t.items.every(x=>x.lang==='es'));assert.equal(t.items.find(x=>x.key==='hud.level_up').text,'ES Level {level} reached!');
 assert.match(t.files[0].path,/UI\.petya-es\.csv$/);assert.equal(fs.existsSync(t.files[0].path),false,'nothing written before the button');
 assert.match(fill.text,/Перевёл 2 строки, не удалось 1/);
 assert.ok(sent.some(([ch,item])=>ch==='extension-install-progress'&&item.id==='localization-translate'&&item.busy&&item.percent>=0),'progress in the notification center');
 assert.equal(sent.at(-1)[1].kind,'attention');assert.equal(ipc.progress().id,'localization-translate');
 const saved=ipc.save(t.id);
 assert.deepEqual(saved.files,[t.files[0].path]);assert.match(fs.readFileSync(saved.files[0],'utf8'),/hud\.level_up,1004,ES Level \{level\} reached!/);
 assert.equal(topic.messages.find(m=>m.extensionData?.localization?.translation?.id===t.id).extensionData.localization.translation.saved,true);
 assert.throws(()=>ipc.save(t.id),/устарели или уже сохранены/,'a second click does not write twice');
 assert.equal(hash(project),before,'sources still untouched');
 const again=await app.turn(s,'переведи недостающие строки локализации на испанский');s.companyId='c2';assert.throws(()=>ipc.save(again.extensionData.localization.translation.id),/Компания изменилась/);s.companyId='c1';
 // Without a model: the report works, translation says what is missing.
 s.settings.model='';
 const noModel=await app.turn(s,'переведи недостающие ключи на немецкий');
 assert.match(noModel.text,/выберите локальную модель/);assert.equal(noModel.extensionData.localization.translation,undefined);
 // Attachments: a CSV attached as text (no path) is checked; the attachment moves into the chat.
 s.dialogue.state.projects[0].folders=[];
 pending.set('f1',{id:'f1',name:'I2Languages.csv',text:fs.readFileSync(path.join(FIX,'i2/I2Languages.csv'),'utf8'),owner:'t'});
 const attached=await app.turn(s,'проверь эти строки, что не переведено');
 assert.deepEqual(attached.extensionData.localization.langs.map(r=>r.lang),['es','de']);assert.equal(pending.size,0);
 // The offer.
 const settings={};
 const direct=text=>offers.candidates(text,{offers:[offer],settings}).filter(r=>r.direct).length>0;
 for(const hit of ['что не переведено','проверь локализацию','недостающие ключи на немецкий','переведи пустые строки на испанский'])assert.ok(direct(hit),'offer: '+hit);
 for(const miss of ['переведи эту фразу на английский','перевод денег','перевести задачу в другой статус'])assert.equal(direct(miss),false,'offer near-miss: '+miss);
 assert.throws(()=>app.validate({localizationLengthRatio:'0.5',localizationSourceLanguage:'en'}),/1\.05/);assert.throws(()=>app.validate({localizationLengthRatio:'1.4',localizationSourceLanguage:'xx'}),/код/);
 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Localization: languages, placeholders, 7 formats parsed and written to new files, scan, report, protected translation with retry, save on button only (once, same company), routing and near-misses, attachments, no model, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
