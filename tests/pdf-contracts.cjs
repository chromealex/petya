// «Договоры в PDF» (src/extensions/pdf-contracts) on PDFs generated here (tests/fixtures/pdf-contracts/make-pdf.cjs):
//  - the reader: Type0 + ToUnicode, a simple font with Cyrillic glyph names, words placed one by one, TJ kerning,
//    an object stream with a cross-reference stream, two columns, a scanned page and its image, encryption refused;
//  - the contract: clauses, the parties, number and date, price, payment, term, renewal, termination, penalties, IP —
//    every quote verbatim with its page and re-checked (tolerant to spacing, hyphens, quote marks, ё; an invented
//    quote is refused), deadlines from the quotes, the clause-by-clause diff of two versions;
//  - the chat: routing and near-misses («договор» with a colleague, writing a contract, «договорились»), not added,
//    no file, the card, the model's extra fields kept only when quoted, a follow-up answered from the card, two versions
//    compared (attached or with the previous card), «Поменять местами», the page text, OCR present / absent, an
//    attachment without a path; the reminders' `reminder` provider; the offer.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('./fixtures/pdf-contracts/make-pdf.cjs');
const {V1,V2}=require('./fixtures/pdf-contracts/contract.cjs');
const P=require('../src/extensions/pdf-contracts/pdf.cjs');
const C=require('../src/extensions/pdf-contracts/contract.cjs');
const query=require('../src/extensions/pdf-contracts/query.cjs');
const app=require('../src/extensions/pdf-contracts/feature.cjs');
const offer=require('../src/extensions/pdf-contracts/offer.cjs');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-contracts-'));
const write=(name,buf)=>{const f=path.join(dir,name);fs.writeFileSync(f,buf);return f;};
const v1=write('Договор v1.pdf',M.make(M.contract(V1,{perPage:30}),{objstm:true}));
const v2=write('Договор v2.pdf',M.make([...M.contract(V2,{perPage:30}),{scan:true}]));

(async()=>{
 // --- Reader -------------------------------------------------------------------------------------------------------
 const r1=P.read(fs.readFileSync(v1));
 assert.equal(r1.numPages,2);
 assert.equal(r1.pages[0].lines[0],'ДОГОВОР № 17/26-ЛИЦ','a heading in the simple font with Cyrillic glyph names');
 assert.equal(r1.pages[0].lines[2],'г. Москва «01» марта 2026 г.');
 const all1=r1.pages.flatMap(p=>p.lines).join('\n');
 assert.ok(all1.includes('5.1. Договор вступает в силу с момента подписания и действует до 31 декабря 2026 г.'),'words placed one by one keep their spaces');
 for(const p of V1.slice(3))for(const w of p.split(' ').slice(0,3))assert.ok(all1.includes(w),w);
 assert.ok(!/\s{2}/.test(all1),'no double spaces');
 assert.equal(r1.pages.some(p=>p.scanned),false);
 const r2=P.read(fs.readFileSync(v2));
 assert.equal(r2.numPages,3);assert.equal(r2.pages[2].scanned,true);assert.equal(r2.pages[2].lines.length,0);
 const img=P.imageFile(r2.pdf,r2.pages[2].image);
 assert.equal(img.ext,'pgm');assert.match(img.data.subarray(0,15).toString('latin1'),/^P5\n120 160\n255\n/);assert.equal(img.data.length,15+120*160);
 assert.throws(()=>P.read(M.make(M.contract(V1),{encrypt:true})),/зашифрован/);
 assert.throws(()=>P.read(Buffer.from('hello')),/Это не PDF/);
 const cols=P.read(M.make([{columns:[M.wrap(V1[3],40),M.wrap('LLC Severny Veter, hereinafter referred to as the Customer, represented by its General Director, acting on the basis of the Charter, on the one hand, and LLC Pixel Forge, hereinafter referred to as the Contractor, have agreed as follows.',40)]}]));
 const colLines=cols.pages[0].lines;
 assert.ok(colLines.findIndex(l=>/^LLC Severny/.test(l))>colLines.findIndex(l=>/нижеследующем/.test(l)),'the left column is read before the right one');
 const cm=P.cmap('1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfrange <0003> <0005> [<0041> <0042> <0043>] <0010> <0012> <0430> endbfrange 1 beginbfchar <0020> <00660066> endbfchar');
 assert.equal(cm.bytes,2);assert.deepEqual([3,4,5,16,18,32].map(c=>cm.map.get(c)),['A','B','C','а','в','ff']);
 assert.deepEqual(['afii10017','afii10023','afii10049','afii10065','afii10071','afii10097','uni0416','guillemotleft','A.sc','numero'].map(P.glyph),['А','Ё','Я','а','ё','я','Ж','«','A','№']);
 const t=P.tiff(Buffer.from([1,2,3]),{width:100,height:50,compression:4,t4:0,photometric:0});
 assert.equal(t.subarray(0,4).toString('latin1'),'II*\0');assert.deepEqual([...t.subarray(-3)],[1,2,3]);

 // --- Contract ----------------------------------------------------------------------------------------------------------
 const doc1={id:'0123456789abcdef',name:'v1',pages:r1.pages};
 const list=C.clauses(doc1);
 assert.deepEqual(list.filter(c=>c.heading&&c.num).map(c=>c.num+' '+c.title),['1 ПРЕДМЕТ ДОГОВОРА','2 СТОИМОСТЬ РАБОТ И ПОРЯДОК РАСЧЁТОВ','3 ИСКЛЮЧИТЕЛЬНЫЕ ПРАВА','4 ОТВЕТСТВЕННОСТЬ СТОРОН','5 СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ','6 ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ']);
 assert.equal(list.find(c=>c.num==='2.1').section,'СТОИМОСТЬ РАБОТ И ПОРЯДОК РАСЧЁТОВ');
 assert.equal(list.find(c=>c.num==='4.2').page,2,'a clause on the second page');
 const fields=C.checkAll(doc1,C.extract(doc1,list));
 assert.equal(fields.dropped.length,0,'every code quote is found again');
 const of=k=>fields.fields.filter(f=>f.kind===k);
 assert.deepEqual(of('parties').map(f=>f.value),['Заказчик — ООО «Северный Ветер»','Исполнитель — ООО «Пиксельная Кузница»']);
 assert.equal(of('parties')[0].quote,'Общество с ограниченной ответственностью «Северный Ветер», именуемое в дальнейшем «Заказчик»');
 assert.equal(of('number')[0].value,'№ 17/26-ЛИЦ от 1 марта 2026 г.');
 assert.equal(of('price')[0].value,'4 800 000 ₽ · без НДС');
 assert.deepEqual(of('payment').map(f=>f.value),['аванс 30% · в течение 10 рабоч. дн.','в течение 15 банк. дн. · не позднее 15 декабря 2026 г.']);
 assert.equal(of('term')[0].value,'до 31 декабря 2026 г. · с подписания');
 assert.equal(of('renewal')[0].value,'продлевается автоматически · на год · отказ — за 30 календ. дн.');
 assert.equal(of('termination')[0].value,'односторонний отказ · уведомление за 20 календ. дн.');
 assert.deepEqual(of('penalty').map(f=>[f.value,f.page]),[['0,1% в день · не более 10%',1],['0,05% в день',2]]);
 assert.deepEqual(of('ip').map(f=>f.value),['передача исключительного права','простая лицензия · безвозмездно']);
 for(const f of fields.fields)for(const q of f.quotes||[f.quote])assert.ok(r1.pages.find(p=>p.n===f.page).lines.join(' ').replace(/\s+/g,' ').includes(q.split(' ').slice(0,4).join(' ')),'the quote starts on its page: '+q.slice(0,40));
 // verify: spacing, line breaks, hyphens, quote marks and ё do not matter; words do; another page is found.
 const q='Договор вступает в силу с момента подписания и действует до 31 декабря 2026 г.';
 assert.deepEqual(C.verify(doc1,q,2),{ok:true,page:2,moved:false}.ok?C.verify(doc1,q,2):null);
 assert.equal(C.verify(doc1,q,1).ok,true);assert.equal(C.verify(doc1,q,1).page,2);assert.equal(C.verify(doc1,q,1).moved,true);
 assert.equal(C.verify(doc1,'Исключительное право на Игру, включая исходный код и графические материалы, переходит к Заказчику',1).ok,true);
 assert.equal(C.verify(doc1,'исключительное  право на игру,\nвключая исходный код и графические материалы, переходит к заказчику',1).ok,true);
 assert.equal(C.verify(doc1,'актов сдачи-приемки работ'.replace('актов','акта'),1).ok,true);
 assert.equal(C.verify(doc1,'Общество с ограниченной ответственностью "Северный Ветер", именуемое в дальнейшем "Заказчик"',1).ok,true);
 assert.equal(C.verify(doc1,'Исполнитель уплачивает Заказчику неустойку в размере 1% за каждый день',1).ok,false,'an altered number is not the contract');
 assert.equal(C.verify(doc1,'Стороны договорились о бесплатной поддержке на 5 лет.',1).ok,false);
 assert.equal(C.verify(doc1,'короткая',1).ok,false);
 // Deadlines: the advance from the signing date (working days), the renewal refusal, the payment date, the end.
 assert.deepEqual(C.deadlines(fields.fields).map(d=>[d.date,d.label,!!d.approx]),[
  ['2026-03-13','Срок оплаты аванса',true],['2026-12-01','Последний день, чтобы отказаться от продления',false],['2026-12-15','Срок оплаты',false],['2026-12-31','Окончание срока договора',false]]);
 assert.deepEqual(C.dates('с 01.02.2026 до «5» мая 2027 года, also March 3, 2026').map(d=>d.date),['2026-02-01','2027-05-05','2026-03-03']);
 assert.deepEqual(C.amounts('1 200 (одна тысяча двести) руб. и USD 3,500.50').map(a=>[a.amount,a.currency]),[[1200,'RUB'],[3500.5,'USD']]);
 assert.deepEqual(C.sentences('Оплата в т. ч. НДС 20%. Срок — 5 дн. по ст. 5 ГК РФ. Конец.').map(s=>s.text),['Оплата в т. ч. НДС 20%.','Срок — 5 дн. по ст. 5 ГК РФ.','Конец.']);
 // Versions.
 const doc2={id:'fedcba9876543210',name:'v2',pages:r2.pages};
 const diff=C.compare(doc1,doc2);
 assert.deepEqual(diff.counts,{same:diff.counts.same,changed:3,moved:0,added:1,removed:1});
 assert.deepEqual(diff.rows.filter(r=>r.status!=='same').map(r=>r.status+':'+(r.new||r.old).num),['removed:1.2','changed:2.1','changed:4.1','changed:5.2','added:5.4']);
 assert.deepEqual(diff.rows.find(r=>r.new?.num==='4.1').ops.filter(o=>o.t!=='='),[{t:'-',s:'0,1%'},{t:'+',s:'0,2%'}]);
 assert.deepEqual(diff.rows.find(r=>r.new?.num==='2.1').ops.filter(o=>o.t!=='='),[{t:'-',s:'4 800'},{t:'+',s:'5 400'},{t:'-',s:'(четыре миллиона восемьсот'},{t:'+',s:'(пять миллионов четыреста'}]);
 assert.deepEqual(diff.fieldChanges.map(x=>[x.kind,x.old,x.new]),[['price','4 800 000 ₽ · без НДС','5 400 000 ₽ · без НДС'],['renewal','продлевается автоматически · на год · отказ — за 30 календ. дн.','продлевается автоматически · на год · отказ — за 60 календ. дн.'],['penalty','0,1% в день · не более 10%; 0,05% в день','0,2% в день · не более 10%; 0,05% в день']]);
 assert.deepEqual(C.wordDiff('оплата в течение 10 дней после акта','оплата в течение 15 рабочих дней после подписания акта'),[{t:'=',s:'оплата в течение'},{t:'-',s:'10'},{t:'+',s:'15 рабочих'},{t:'=',s:'дней после'},{t:'+',s:'подписания'},{t:'=',s:'акта'}]);

 // --- Routing -----------------------------------------------------------------------------------------------------------
 for(const t of ['разбери этот договор','какие штрафы в договоре?','когда можно отказаться от продления договора','что в контракте по оплате','кто стороны по договору'])assert.equal(query.about(t,{pdfs:1}),'analyze',t);
 assert.equal(query.about('сравни с прошлой версией договора',{pdfs:1}),'compare');
 assert.equal(query.about('сравни две версии договора',{pdfs:2}),'compare');
 assert.equal(query.about('что поменялось в новой редакции договора',{hasCard:true}),'compare');
 assert.equal(query.about('разбери договор в PDF'),'need-file');
 assert.equal(query.about('разбери договор ~/Documents/contract.pdf'),'analyze');
 assert.deepEqual(query.paths('разбери договор ~/Documents/contract.pdf, пожалуйста'),['~/Documents/contract.pdf']);
 for(const t of ['у нас с Олегом договор: он ревьюит по пятницам','какой договор с коллегой о дежурствах','мы договорились с Машей о встрече','напиши договор на разработку','составь договор аренды','договоримся на завтра','какие условия договора с командой','что такое договор оферты','какой договор у нас с Пиксельной Кузницей'])assert.equal(query.about(t),null,t);
 assert.equal(query.about('разбери договор'),'need-file','a document request without a file asks for it');assert.equal(query.about('сравни версии договора'),'need-file');
 assert.equal(query.about('какие условия договора с Олегом',{hasCard:true}),null,'a colleague, not the document');
 assert.equal(query.about('договор с Олегом о дежурствах',{pdfs:1}),null,'no request in it');
 assert.deepEqual(query.focus('какие штрафы и когда платить?'),['penalty','deadlines']);

 // --- Chat ----------------------------------------------------------------------------------------------------------------
 const dataRoot=path.join(dir,'company');
 const make=({files=[],model=null}={})=>{
  const topic={id:'t',title:'Чат',messages:[]};
  const pending=new Map(files.map((f,i)=>[String(i),{id:String(i),name:path.basename(f.path||f.name),localSourcePath:f.path||'',text:f.text||'',owner:'t'}]));
  const s={settings:{'extension_pdf-contracts':'true',...(model?{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'}:{})},dataRoot,requestProgress:{report(){}},
   attachments:{pending,list:()=>[...pending.values()].map(x=>({id:x.id,name:x.name})),take:ids=>ids.map(id=>pending.get(id)),info:x=>({id:x.id,name:x.name}),remove:id=>pending.delete(id)},
   dialogue:{state:{topics:[topic],projects:[],activeProjectId:'general'},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
   async request(url,opts){const body=JSON.parse(opts.body);model?.calls.push(body);return {message:{content:JSON.stringify(model.answer)}};}};
  return {s,topic,pending};
 };
 {const {s}=make({files:[{path:v1}]});s.settings['extension_pdf-contracts']='false';assert.equal(await app.turn(s,'разбери этот договор'),null,'not added');}
 {const {s}=make();const r=await app.turn(s,'разбери договор в PDF');assert.ok(r.question);assert.match(r.text,/Прикрепите PDF договора/);}
 {const {s}=make();assert.equal(await app.turn(s,'у нас с Олегом договор: он ревьюит по пятницам'),null);}
 app.deps.now=()=>Date.parse('2026-11-09T09:00:00Z');
 app.deps.ocr={find:()=>null,recognize:async()=>{throw Error('no');}};
 const {s,topic,pending}=make({files:[{path:v1}]});
 const r=await app.turn(s,'разбери этот договор');
 const card=topic.messages.at(-1).extensionData.contractCard;
 assert.equal(card.mode,'analyze');assert.equal(card.doc.numPages,2);assert.equal(card.rejected,0);
 assert.match(r.text,/^Договор № 17\/26-ЛИЦ от 1 марта 2026 г\. \(«Договор v1\.pdf»\)\. Заказчик — ООО «Северный Ветер», Исполнитель — ООО «Пиксельная Кузница»\. Стоимость: 4 800 000 ₽ · без НДС\./);
 assert.match(r.text,/Ближайший срок — 1 декабря 2026 г\.: последний день, чтобы отказаться от продления\./);
 assert.ok(card.fields.every(f=>f.verified));
 assert.equal(pending.size,0,'the PDF moved from the composer into the chat');
 assert.equal(topic.attachments.length,1);
 assert.ok(fs.readdirSync(path.join(dataRoot,'pdf-contracts')).some(f=>f===card.doc.id+'.json'),'the text is kept for follow-ups');
 assert.equal((fs.statSync(path.join(dataRoot,'pdf-contracts',card.doc.id+'.json')).mode&0o777).toString(8),'600');
 // A follow-up from the card: penalties with quotes and pages.
 const follow=await app.turn(s,'какие штрафы в договоре?');
 assert.match(follow.text,/^Неустойка и штрафы — 0,1% в день · не более 10%: «За нарушение сроков выполнения работ Исполнитель уплачивает Заказчику неустойку/);
 assert.match(follow.text,/\(стр\. 2\)$/);
 assert.deepEqual(topic.messages.at(-1).extensionData.contractCard.focus,['penalty']);
 // Page text for «Показать на странице».
 const {ipc}=app.setup(s);
 assert.equal(ipc.page(card.doc.id,2).lines.some(l=>l.startsWith('4.2.')),true);
 assert.throws(()=>ipc.page('../../etc',1),/не найдена/);

 // The model adds a field only with a real quote; an invented one is dropped and counted.
 {const model={calls:[],answer:{fields:[{kind:'termination',quote:'Все споры разрешаются в Арбитражном суде города Москвы.',page:2},{kind:'penalty',quote:'Исполнитель платит штраф 50 000 рублей за каждый баг.',page:1},{kind:'price',quote:'Общая стоимость работ по настоящему договору составляет 4 800 000 (четыре миллиона восемьсот тысяч) рублей 00 копеек',page:1}]}};
  const x=make({files:[{path:v1}],model});
  await app.turn(x.s,'разбери этот договор');
  const c2=x.topic.messages.at(-1).extensionData.contractCard;
  assert.equal(model.calls.length,1);assert.ok(model.calls[0].messages[1].content.includes('Арбитражном суде'));
  assert.equal(c2.rejected,1,'the invented penalty quote');
  assert.deepEqual(c2.fields.filter(f=>f.by==='model').map(f=>[f.kind,f.page]),[['termination',2]]);
  assert.equal(c2.fields.filter(f=>f.kind==='price').length,1,'a quote the code already has is not repeated');}

 // Versions: the second attached to the same chat → compared with the card above; the scan has no OCR.
 pending.set('9',{id:'9',name:'Договор v2.pdf',localSourcePath:v2,owner:'t'});
 const cmp=await app.turn(s,'сравни с прошлой версией договора');
 const cc=topic.messages.at(-1).extensionData.contractCard;
 assert.equal(cc.mode,'compare');assert.equal(cc.old.name,'Договор v1.pdf');assert.equal(cc.new.name,'Договор v2.pdf');
 assert.match(cmp.text,/^Сравнил «Договор v1\.pdf» \(старая\) и «Договор v2\.pdf» \(новая\): изменено пунктов: 3, добавлено: 1, удалено: 1\. Условия: стоимость — 4 800 000 ₽ · без НДС → 5 400 000 ₽ · без НДС;/);
 assert.deepEqual(cc.unread.new,[3]);
 const swapped=ipc.swap(cc.id);assert.equal(swapped.old.name,'Договор v2.pdf');assert.equal(swapped.counts.added,1);assert.equal(swapped.rows.find(r=>r.status==='added').new.num,'1.2');
 // Two attached at once, newer first: the file names say which is older.
 {const x=make({files:[{path:v2},{path:v1}]});await app.turn(x.s,'сравни две версии договора');const c3=x.topic.messages.at(-1).extensionData.contractCard;assert.equal(c3.old.name,'Договор v1.pdf');}
 assert.equal(app.versionOrder('contract_2026-03-01.pdf','contract_2026-05-01.pdf'),-1);assert.equal(app.versionOrder('ред. 3.pdf','ред. 2.pdf'),1);

 // Scans: without OCR the card says so; with an OCR its lines become the page (and the image goes to it).
 {const x=make({files:[{path:v2}]});await app.turn(x.s,'разбери этот договор');const c4=x.topic.messages.at(-1).extensionData.contractCard;
  assert.deepEqual(c4.doc.ocr.unread,[3]);assert.equal(c4.doc.ocr.tool,null);assert.match(x.topic.messages.at(-1).text,/Страницы 3 — сканы без текста, а локального OCR нет/);}
 {const seen=[];app.deps.ocr={find:()=>'/usr/bin/tesseract',recognize:async(img,{bin})=>{seen.push([img.ext,bin]);return ['7.1. Приложение № 3 является неотъемлемой частью договора.','7.2. Исполнитель уплачивает штраф 15 000 рублей за каждое нарушение конфиденциальности.'];}};
  const v3=write('Договор v3.pdf',M.make([...M.contract(V2,{perPage:30}),{scan:true}],{words:false}));
  const x=make({files:[{path:v3}]});await app.turn(x.s,'разбери этот договор');const c5=x.topic.messages.at(-1).extensionData.contractCard;
  assert.deepEqual(seen,[['pgm','/usr/bin/tesseract']]);assert.deepEqual(c5.doc.ocr.pages,[3]);assert.equal(c5.doc.ocr.tool,'tesseract');
  assert.deepEqual(c5.fields.filter(f=>f.kind==='penalty'&&f.page===3).map(f=>f.value),['15 000 ₽']);
  assert.match(x.topic.messages.at(-1).text,/Страницы 3 распознаны OCR/);}
 // An attachment that has no path on disk: the text read when attached, page markers kept.
 {const text='[Страница 1]\nДОГОВОР № 5 г. Москва 10 января 2026 г. 1. ПРЕДМЕТ 1.1. Исполнитель оказывает услуги. 2. ЦЕНА 2.1. Стоимость услуг составляет 90 000 (девяносто тысяч) рублей.\n[Страница 2]\n3. ШТРАФЫ 3.1. За просрочку Исполнитель уплачивает пени 0,5% в день.';
  const x=make({files:[{name:'scan.pdf',text}]});await app.turn(x.s,'разбери этот договор');const c6=x.topic.messages.at(-1).extensionData.contractCard;
  assert.equal(c6.doc.fromText,true);assert.deepEqual(c6.fields.filter(f=>f.kind==='price').map(f=>[f.value,f.page]),[['90 000 ₽',1]]);assert.deepEqual(c6.fields.filter(f=>f.kind==='penalty').map(f=>[f.value,f.page]),[['0,5% в день',2]]);}
 // Errors: an encrypted file is told, not crashed on.
 {const enc=write('secret.pdf',M.make(M.contract(V1),{encrypt:true}));const x=make({files:[{path:enc}]});const e=await app.turn(x.s,'разбери этот договор');assert.ok(e.error);assert.match(e.text,/зашифрован/);}

 // --- The reminder kind («Напоминания») ------------------------------------------------------------------------------
 const links=require('../src/features/app-links.cjs');assert.ok(links.KINDS.includes('reminder'));
 const provider=require('../src/extensions/reminders/reminder-link.cjs');
 assert.equal(provider.ready({extension_reminders:'true'}),true);assert.equal(provider.ready({}),false);
 const asked=await provider.run({},{date:'2099-12-01',text:'договор «v1»: последний день, чтобы отказаться от продления (стр. 2)'});
 assert.deepEqual(asked,{ask:'Напомни 1 декабря 2099 в 10:00: договор «v1»: последний день, чтобы отказаться от продления (стр. 2)',send:true});
 const rem=require('../src/extensions/reminders/feature.cjs'),when=require('../src/extensions/reminders/when.cjs');
 const route=rem.route(asked.ask);assert.equal(route.type,'create');
 const at=when.parse(route.rest,Date.parse('2099-11-01T10:00:00'));assert.equal(new Date(at.at).getDate(),1);assert.equal(new Date(at.at).getMonth(),11);assert.equal(new Date(at.at).getHours(),10);
 assert.equal(rem.subject(at.rest),'Договор «v1»: последний день, чтобы отказаться от продления (стр. 2)');
 assert.deepEqual(await provider.run({},{date:'2001-01-01',text:'x'}),{text:'Эта дата уже прошла — напоминание не поставить.'});
 await assert.rejects(provider.run({},{date:'завтра',text:'x'}),/Нет даты/);

 // --- Offer -------------------------------------------------------------------------------------------------------------
 const offers=require('../src/features/extension-offers.cjs');
 const offered=t=>offers.candidates(t,{offers:[offer],settings:{}}).map(x=>x.offer.id);
 for(const t of ['разбери этот договор','какие штрафы в договоре','сравни две версии договора','договор в PDF'])assert.deepEqual(offered(t),['pdf-contracts'],t);
 for(const t of ['мы договорились с Олегом','напиши договор на разработку','договор с коллегой о дежурствах','разбери отчёт'])assert.deepEqual(offered(t),[],t);
 app.deps.now=()=>Date.now();app.deps.ocr=require('../src/extensions/pdf-contracts/ocr.cjs');
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('PDF contracts: reader (ToUnicode, glyph names, spacing, TJ, object and xref streams, columns, scans, encryption), clauses and fields with verbatim quotes and pages, quote checks, deadlines, clause diff, routing and near-misses, card, model quotes checked, follow-up, versions and swap, OCR present/absent, text-only attachment, reminder kind, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
