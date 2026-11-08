// «Поиск файлов по смыслу»: routing (own phrases and near-misses), not added → null, index off → the opt-in card,
// model missing → the download card, results with best piece, highlight and provenance; the folder walk with
// ignore rules; text extraction from PowerPoint (with charts), Word, Excel and PDF; the card actions only for files
// in the indexed folders; and the whole path through the semantic index with fake embeddings — no model, no network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const route=require('../src/extensions/file-search/route.cjs');
const feature=require('../src/extensions/file-search/feature.cjs');
const {walk}=require('../src/extensions/file-search/walk.cjs');
const {extract}=require('../src/extensions/file-search/extract.cjs');
const collection=require('../src/extensions/file-search/collection.cjs');
const folders=require('../src/extensions/file-search/folders.cjs');
const index=require('../src/features/semantic-index.cjs');
const {normalize}=require('../src/semantic-index/store.cjs');

function fakeVector(text,dim=1024){
 const v=new Float32Array(dim);
 for(const w of String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]){let h=2166136261;for(const c of w.slice(0,5))h=Math.imul(h^c.codePointAt(0),16777619)>>>0;v[((h^(h>>>15))>>>0)%512]+=1;}
 return normalize(v);
}
const ollama=({installed=true}={})=>async(url,options={})=>{
 const u=new URL(url);const json=d=>({ok:true,status:200,json:async()=>d});
 if(u.pathname==='/api/tags')return json({models:installed?[{name:'qwen3-embedding:0.6b'}]:[]});
 if(u.pathname==='/api/embed'){const body=JSON.parse(options.body);return json({embeddings:body.input.map(t=>Array.from(fakeVector(t.replace(/^Instruct:[^\n]*\nQuery: /,''))))});}
 throw Error('unexpected '+u.pathname);
};
// A minimal ZIP (stored entries) for Office files.
function zipOf(files){
 const locals=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=Buffer.from(text,'utf8'),n=Buffer.from(name,'utf8'),crc=zlib.crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  locals.push(local,n,data);central.push(c,n);offset+=30+n.length+data.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,end]);
}
const slide=(...lines)=>'<p:sld><p:cSld><p:spTree>'+lines.map(l=>'<a:p><a:r><a:t>'+l+'</a:t></a:r></a:p>').join('')+'</p:spTree></p:cSld></p:sld>';

function services({installed=true,enabled=false,project}={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{'extension_file-search':installed?'true':'false',fileSearchFolders:'[]',fileSearchProject:'true',semanticIndexCollections:enabled?'{"files":true}':'{}'},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:project?[{id:'p1',name:'Bunker',folders:[project]}]:[]}},
  saveSettings(v){Object.assign(s.settings,v);},attachments:{list:()=>[]}};
 return s;
}

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own=['где презентация про Китай с графиком LTV?','найди скрипт, который сохраняет прогресс','документы про монетизацию','найди файл с настройками баланса','в каком файле считается урон?','поищи заметки про онбординг','где мой pdf про налоги','покажи документы по смыслу про ретеншн','найди презу для инвесторов'];
 for(const p of own)assert(route.wanted(p),'should be a file search: '+p);
 const not=['найди в интернете отзывы о Unity 6','поиск по всему про релиз','найди задачу в Jira про сохранения','найди баг про краш','где встреча с Олегом','найди страницу в Confluence про релиз','что в чате про релиз','найди в слаке файл от Маши','какие файлы занимают больше всего места','найди большие файлы','сожми файл видео','переведи документ в pdf','напиши скрипт сохранения прогресса','создай файл README','что такое файл подкачки','найди коммит про сохранения','найди документацию по Unity API','привет','как дела','найди кафе рядом','найди время для встречи'];
 for(const p of not)assert.equal(route.wanted(p),null,'not a file search: '+p);
 assert.equal(route.query('где презентация про Китай с графиком LTV?'),'презентация про Китай с графиком LTV');
 assert.equal(route.query('Найди, пожалуйста, скрипт, который сохраняет прогресс'),'скрипт, который сохраняет прогресс');
 // Offer: «документы про монетизацию» names documents, so it is a file search before a revenue question.
 {const offers=require('../src/features/extension-offers.cjs'),all=offers.load();const d=offers.decide(offers.candidates('документы про монетизацию',{offers:all,settings:{}}));assert.equal(d?.one?.offer.id,'file-search');}
 assert.deepEqual(route.kinds('где презентация про Китай'),['slides','pdf']);assert.deepEqual(route.kinds('найди скрипт'),['code']);

 // --- Not added → null; added but the index off → the opt-in card -------------------------------------------------------
 assert.equal(await feature.turn(services({installed:false}),'найди скрипт, который сохраняет прогресс'),null);
 assert.equal(await feature.turn(services(),'найди в интернете скрипт'),null);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-files-'));
 {
  const s=services({project:root});
  s.semanticIndex={status:async()=>({model:'qwen3-embedding:0.6b',modelBytes:639000000,modelInstalled:false,ollama:true,phase:'idle'}),enabled:()=>false,collections:()=>[]};
  const r=await feature.turn(s,'где презентация про Китай с графиком LTV?');
  assert.equal(r.question,true);assert.equal(r.extensionData.fileSearch.state,'setup');assert.equal(r.extensionData.fileSearch.folders[0].path,path.resolve(root));
  assert.match(r.text,/Скачать модель и включить/);assert.match(r.text,/639 МБ/);assert.equal(r.extensionData.fileSearch.request,'где презентация про Китай с графиком LTV?');
  // No folders at all: ask to add one.
  const bare=services();bare.settings.fileSearchProject='false';bare.semanticIndex=s.semanticIndex;
  assert.match((await feature.turn(bare,'найди скрипт сохранения прогресса')).text,/добавьте папку/);
 }

 // --- Folder walk and ignore rules -------------------------------------------------------------------------------------
 const w=p=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});return f;};
 fs.writeFileSync(w('Assets/Scripts/SaveSystem.cs'),'using UnityEngine;\n\n/// Сохраняет прогресс игрока в PlayerPrefs и файл.\npublic class SaveSystem : MonoBehaviour {\n  public void SaveProgress(Player p){ File.WriteAllText(path, JsonUtility.ToJson(p)); }\n}\n');
 fs.writeFileSync(w('Assets/Scripts/Enemy.cs'),'public class Enemy { public int damage = 10; void Attack(){ } }\n');
 fs.writeFileSync(w('docs/monetization.md'),'# Монетизация\n\nРеклама rewarded, покупки сундуков и пропуск сезона. Документ про монетизацию игры.\n\n## Цены\nСундук стоит 99 рублей.\n');
 fs.writeFileSync(w('docs/Китай.pptx'),zipOf({'ppt/slides/slide1.xml':slide('Выход на рынок Китая','Партнёры и сроки'),'ppt/slides/slide2.xml':slide('Экономика'),
  'ppt/slides/_rels/slide2.xml.rels':'<Relationships><Relationship Id="rId2" Target="../charts/chart1.xml"/></Relationships>',
  'ppt/charts/chart1.xml':'<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>LTV по когортам</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:lineChart><c:ser><c:tx><c:strRef><c:strCache><c:pt><c:v>LTV Китай</c:v></c:pt></c:strCache></c:strRef></c:tx></c:ser></c:lineChart></c:plotArea></c:chart></c:chartSpace>'}));
 fs.writeFileSync(w('docs/plan.docx'),zipOf({'word/document.xml':'<w:document><w:body><w:p><w:r><w:t>План запуска на Android</w:t></w:r></w:p></w:body></w:document>'}));
 fs.writeFileSync(w('docs/budget.xlsx'),zipOf({'xl/workbook.xml':'<workbook><sheets><sheet name="Бюджет" sheetId="1"/></sheets></workbook>','xl/sharedStrings.xml':'<sst><si><t>Маркетинг</t></si><si><t>Серверы</t></si></sst>'}));
 fs.writeFileSync(w('node_modules/lib/index.js'),'module.exports=1');
 fs.writeFileSync(w('Library/cache.txt'),'кэш');
 fs.writeFileSync(w('build/out.js'),'bundle');
 fs.writeFileSync(w('.env'),'API_KEY=secret');
 fs.writeFileSync(w('logs/debug.log'),'лог');
 fs.writeFileSync(w('.gitignore'),'logs/\n*.bak\n');
 fs.writeFileSync(w('notes.bak'),'старое');
 fs.writeFileSync(w('art/logo.png'),Buffer.from([0x89,0x50,0x4e,0x47,0,0,0]));
 fs.writeFileSync(w('Assets/Level.unity'),'%YAML 1.1');
 fs.writeFileSync(w('.hidden/secret.md'),'скрыто');
 const listed=(await walk([root])).map(e=>path.relative(root,e.id).split(path.sep).join('/')).sort();
 assert.deepEqual(listed,['Assets/Scripts/Enemy.cs','Assets/Scripts/SaveSystem.cs','docs/budget.xlsx','docs/monetization.md','docs/plan.docx','docs/Китай.pptx']);
 const entry=(await walk([root])).find(e=>e.id.endsWith('SaveSystem.cs'));
 assert.equal(entry.meta.type,'code');assert.match(entry.version,/^\d+:\d+$/);

 // --- Extraction -----------------------------------------------------------------------------------------------------
 const deck=await extract(path.join(root,'docs/Китай.pptx'));
 assert.match(deck.text,/\[Слайд 1\]\nВыход на рынок Китая/);assert.match(deck.text,/\[Слайд 2\][\s\S]*График \(line\): LTV по когортам; LTV Китай/);
 assert.equal((await extract(path.join(root,'docs/plan.docx'))).text.trim(),'План запуска на Android');
 assert.match((await extract(path.join(root,'docs/budget.xlsx'))).text,/Листы: Бюджет\nМаркетинг\nСерверы/);
 fs.writeFileSync(w('docs/report.pdf'),'%PDF-1.4 fake');
 assert.deepEqual(await extract(path.join(root,'docs/report.pdf'),{pdf:async()=>({text:'[Страница 1]\nОтчёт'})}),{text:'[Страница 1]\nОтчёт',type:'text'});
 assert.equal(await extract(path.join(root,'art/logo.png')),null,'binary is not text');
 assert.equal((await extract(path.join(root,'docs/monetization.md'))).type,'markdown');
 fs.rmSync(path.join(root,'docs/report.pdf'));

 // --- The whole path: index on, sync the folder, ask --------------------------------------------------------------------------
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'petya-files-data-'));
 const s=services({project:root,enabled:true});Object.assign(s,{companyId:'c',dataRoot:data});s.settings.ollamaUrl='http://127.0.0.1:11434';
 const notices=[];
 const providers=index.load().filter(p=>p.id==='files');
 assert.equal(providers[0].extension,'file-search');assert.equal(providers[0].setting,'extension_file-search');
 s.semanticIndex=index.create(s,{providers,fetcher:ollama(),publish:n=>notices.push(n),throttle:0});
 const result=await s.semanticIndex.sync('files');
 assert.equal(result.indexed,6);assert.equal(result.total,6);
 let r=await feature.turn(s,'где презентация про Китай с графиком LTV?');
 let card=r.extensionData.fileSearch;
 assert.equal(card.state,'results');assert.equal(card.hits[0].name,'Китай.pptx');assert.equal(card.hits[0].kind,'slides');assert.equal(card.hits[0].loc.slide,2,'the slide with the chart');
 assert(card.hits[0].ranges.length>0);const mark=card.hits[0].ranges[0];assert.match(card.hits[0].snippet.slice(mark[0],mark[1]),/LTV|Кита|График/i);
 assert(card.hits[0].score>0&&card.hits[0].score<=1);assert(card.hits[0].mtime>0);assert.equal(card.indexed,6);
 assert.match(r.text,/Китай\.pptx/);
 r=await feature.turn(s,'найди скрипт, который сохраняет прогресс');card=r.extensionData.fileSearch;
 assert.equal(card.hits[0].name,'SaveSystem.cs');assert.equal(card.hits[0].loc.line>=1,true);
 r=await feature.turn(s,'документы про монетизацию');assert.equal(r.extensionData.fileSearch.hits[0].name,'monetization.md');
 // Incremental: an edited file is re-read, a deleted one disappears.
 fs.writeFileSync(path.join(root,'Assets/Scripts/Enemy.cs'),'public class Enemy { /* наносит урон огнём дракона */ }\n');fs.utimesSync(path.join(root,'Assets/Scripts/Enemy.cs'),new Date(),new Date(Date.now()+5000));
 fs.rmSync(path.join(root,'docs/plan.docx'));
 const again=await s.semanticIndex.sync('files');assert.equal(again.indexed,1);assert.equal(again.removed,1);
 r=await feature.turn(s,'в каком файле урон огнём дракона?');assert.equal(r.extensionData.fileSearch.hits[0].name,'Enemy.cs');
 // Card actions: only files of the indexed folders.
 const opened=[];feature.deps.shell=()=>({openPath:async p=>{opened.push(p);return '';},showItemInFolder:p=>opened.push('show:'+p)});
 const attached=[];s.attachments={list:()=>[],add:async(name,bytes)=>{attached.push([name,bytes.length]);return {name};}};
 const {ipc}=feature.setup(s);
 await ipc.open(path.join(root,'docs/monetization.md'));ipc.reveal(path.join(root,'docs/monetization.md'));
 assert.deepEqual(opened,[path.join(root,'docs/monetization.md'),'show:'+path.join(root,'docs/monetization.md')]);
 await assert.rejects(ipc.open('/etc/passwd'),/не из папок поиска/);
 await assert.rejects(ipc.open(path.join(root,'gone.md')),/нет на месте/);
 assert.deepEqual(await ipc.ask(path.join(root,'docs/monetization.md')),{attached:'monetization.md'});assert.equal(attached[0][0],'monetization.md');
 // Settings: folders and the project switch; a removed extra folder is dropped from the list.
 feature.deps.chooseFolder=async()=>data;let st=await ipc.addFolder();assert(st.folders.some(f=>f.path===path.resolve(data)&&f.own));
 st=await ipc.removeFolder(data);assert(!st.folders.some(f=>f.own));
 st=await ipc.setProject(false);assert.equal(st.project,false);assert.equal(folders.roots(s).length,0);
 assert.equal(await collection.read(s,{id:path.join(root,'docs/monetization.md')}),null,'a file outside the current folders is not read');
 await ipc.setProject(true);
 assert.throws(()=>feature.validate({fileSearchFolders:'["relative/path"]'}),/папки/);
 // Model gone → the download card; Ollama down → an error, not a crash.
 const gone=services({project:root,enabled:true});Object.assign(gone,{companyId:'c',dataRoot:data,settings:{...s.settings}});
 gone.semanticIndex=index.create(gone,{providers,fetcher:ollama({installed:false}),throttle:0});
 r=await feature.turn(gone,'где презентация про Китай с графиком LTV?');assert.equal(r.extensionData.fileSearch.state,'model');assert.equal(r.question,true);
 const down=services({project:root,enabled:true});Object.assign(down,{companyId:'c',dataRoot:data,settings:{...s.settings}});
 down.semanticIndex=index.create(down,{providers,fetcher:async()=>{throw Object.assign(Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'});},throttle:0});
 r=await feature.turn(down,'где презентация про Китай с графиком LTV?');assert.equal(r.extensionData.fileSearch.state,'error');assert.equal(r.error,true);
 // Wipe from the app: index gone and switched off.
 await ipc.wipe();assert.equal(s.semanticIndex.enabled('files'),false);assert.equal(fs.existsSync(path.join(data,'semantic-index')),false);
 for(const x of [s,gone,down])await x.semanticIndex.close();
 assert(notices.some(n=>n.id==='semantic-index'));
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});
 // Snippet: the highlight follows the piece.
 const sn=feature.snippet('x '.repeat(200)+'график LTV по Китаю',[[400,406]]);assert(sn.text.startsWith('… '));assert.equal(sn.text.slice(sn.ranges[0][0],sn.ranges[0][1]),'график');
 console.log('File search: routing and near-misses, opt-in card, model and Ollama states, folder walk with ignore rules, PowerPoint/Word/Excel/PDF text, incremental index, results with best piece and highlight, guarded card actions, settings and wipe passed');
})().catch(e=>{console.error(e);process.exit(1);});
