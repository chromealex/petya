// Semantic index foundation (src/semantic-index, src/features/semantic-index.cjs): the vector store on disk, the
// chunkers, ignore rules, the index contract (add / update / remove / search, opt-in, incremental sync, pause, wipe),
// corruption recovery and the Ollama embedder — with fake embeddings, no model and no network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Collection,normalize}=require('../src/semantic-index/store.cjs');
const chunker=require('../src/semantic-index/chunk.cjs');
const ignore=require('../src/semantic-index/ignore.cjs');
const {SemanticIndex,terms,ranges}=require('../src/semantic-index/index.cjs');
const embedding=require('../src/semantic-index/embedder.cjs');
const feature=require('../src/features/semantic-index.cjs');

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'petya-index-'));
// Fake embeddings: words hashed into `dim` buckets (stems of 5 letters), so texts sharing words are close.
function fakeVector(text,dim=64){
 const v=new Float32Array(dim);
 for(const w of String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]){let h=2166136261;for(const c of w.slice(0,5))h=Math.imul(h^c.codePointAt(0),16777619)>>>0;v[h%dim]+=1;v[(h>>>8)%dim]+=0.5;}
 return normalize(v);
}
function fakeEmbedder({dim=64,installed=true,calls=[]}={}){
 return {model:'fake:1',dim,batch:4,calls,async status(){return {reachable:true,installed};},async embed(texts,{query}={}){calls.push({n:texts.length,query:!!query});return texts.map(t=>fakeVector(t,dim));}};
}

(async()=>{
 // --- Store -----------------------------------------------------------------------------------------------------
 {
  const dir=tmp(),c=new Collection(path.join(dir,'files'),{model:'fake:1',dim:64});
  const put=(id,texts,meta={})=>c.put(id,{version:'v1',hash:id,meta,pieces:texts.map(t=>({text:t,loc:{line:1}})),vectors:texts.map(t=>fakeVector(t))});
  put('a',['презентация про Китай график LTV','выручка по странам']);
  put('b',['скрипт сохраняет прогресс игрока в файл','загрузка уровня']);
  put('c',['монетизация реклама rewarded']);
  let hits=c.search(fakeVector('сохраняет прогресс'),{k:3});
  assert.equal(hits[0].id,'b');assert.equal(hits[0].chunk,0);assert.equal(hits[0].text,'скрипт сохраняет прогресс игрока в файл');assert.deepEqual(hits[0].loc,{line:1});
  assert(hits[0].score>hits[1].score);
  assert.equal(new Set(hits.map(h=>h.id)).size,hits.length,'best chunk per item');
  // Replace, touch, remove, prefilter.
  put('b',['конфиг сборки android']);
  assert.notEqual(c.search(fakeVector('сохраняет прогресс'),{k:1})[0]?.id==='b'&&c.search(fakeVector('сохраняет прогресс'),{k:1})[0].text.includes('прогресс'),true,'old pieces are gone');
  assert.equal(c.touch('a','v2'),true);assert.equal(c.get('a').version,'v2');
  assert.equal(c.search(fakeVector('Китай LTV'),{k:3,allow:item=>item.id!=='a'}).some(h=>h.id==='a'),false,'metadata prefilter');
  assert.equal(c.remove('c'),true);assert.equal(c.remove('c'),false);
  // Reopen: the log replays to the same state.
  const again=new Collection(path.join(dir,'files'),{model:'fake:1',dim:64});
  assert.deepEqual(again.ids().sort(),['a','b']);assert.equal(again.get('a').version,'v2');assert.equal(again.recovered,'');
  assert.equal(again.search(fakeVector('Китай LTV'),{k:1})[0].id,'a');
  // Sketch prefilter on a larger collection (exact rescoring off): the right item is still found.
  const big=new Collection(path.join(dir,'big'),{model:'fake:1',dim:64,exact:0,minCandidates:20,oversample:2});
  for(let i=0;i<300;i++)big.put('n'+i,{pieces:[{text:'заметка номер '+i+' про погоду '+(i%7)}],vectors:[fakeVector('заметка номер '+i+' про погоду '+(i%7))]});
  big.put('target',{pieces:[{text:'единорог радуга LTV'}],vectors:[fakeVector('единорог радуга LTV')]});
  assert.equal(big.search(fakeVector('единорог радуга'),{k:1})[0].id,'target');
  // Compaction after many replacements keeps live data and drops the old generation.
  for(let r=0;r<5;r++)for(let i=0;i<300;i++){const t='версия '+r+' заметки q'+String(i).padStart(3,'0');big.put('n'+i,{pieces:[{text:t}],vectors:[fakeVector(t)]});}
  assert(big.gen>1,'compacted into a new generation');assert(big.dead<big.rows*0.3+1000);
  assert.deepEqual(fs.readdirSync(path.join(dir,'big')).filter(n=>/\.\d+\./.test(n)&&!n.includes('.'+big.gen+'.')),[],'old generation files deleted');
  assert.equal(big.search(fakeVector('заметки q017'),{k:1})[0].id,'n17');
  const reopened=new Collection(path.join(dir,'big'),{model:'fake:1',dim:64,exact:0,minCandidates:20});
  assert.equal(reopened.size,301);assert.equal(reopened.search(fakeVector('единорог радуга'),{k:1})[0].id,'target');
  fs.rmSync(dir,{recursive:true,force:true});
 }
 // --- Corruption recovery ---------------------------------------------------------------------------------------
 {
  const dir=tmp(),at=path.join(dir,'c'),W={x:'альфа',y:'бета'};
  const make=()=>{const c=new Collection(at,{model:'fake:1',dim:64});for(const id of ['x','y'])c.put(id,{pieces:[{text:'текст '+W[id]}],vectors:[fakeVector('текст '+W[id])]});return c;};
  let c=make();const names=c.names;
  // Torn last log line and a partial vector row: both cut off, the good items stay.
  fs.appendFileSync(path.join(at,names.log),'{"t":"item","id":"z","sta');
  fs.appendFileSync(path.join(at,names.vectors),Buffer.alloc(10));
  c=new Collection(at,{model:'fake:1',dim:64});
  assert.deepEqual(c.ids().sort(),['x','y']);assert.match(c.recovered,/vectors|log/);
  assert.equal(c.search(fakeVector('текст бета'),{k:1})[0].id,'y');
  c.put('w',{pieces:[{text:'новый вектор омега'}],vectors:[fakeVector('новый вектор омега')]});
  assert.equal(new Collection(at,{model:'fake:1',dim:64}).search(fakeVector('новый вектор омега'),{k:1})[0].id,'w','appends stay aligned after recovery');
  // A record pointing past the data is dropped; a missing sketch is rebuilt from the vectors.
  c=new Collection(at,{model:'fake:1',dim:64});
  fs.appendFileSync(path.join(at,c.names.log),JSON.stringify({t:'item',id:'ghost',version:'',hash:'',meta:{},start:999,count:1,chunks:[{o:0,l:1}]})+'\n');
  fs.writeFileSync(path.join(at,c.names.sketch),'');
  c=new Collection(at,{model:'fake:1',dim:64});
  assert.equal(c.get('ghost'),null);assert.equal(c.size,3);assert.equal(c.search(fakeVector('текст альфа'),{k:1})[0].id,'x');
  // Unreadable meta → the collection starts empty; another model → empty too (vectors are not comparable).
  fs.writeFileSync(path.join(at,'meta.json'),'{not json');
  c=new Collection(at,{model:'fake:1',dim:64});assert.equal(c.size,0);assert.equal(c.recovered,'corrupt');
  make();c=new Collection(at,{model:'other:1',dim:64});assert.equal(c.size,0);assert.equal(c.recovered,'model');
  fs.rmSync(dir,{recursive:true,force:true});
 }
 // --- Chunkers --------------------------------------------------------------------------------------------------
 {
  const js=['// Save system','const fs=require("fs");','',...Array.from({length:40},(_,i)=>'// filler '+i),'/** Saves player progress to disk. */','function saveProgress(player){','  fs.writeFileSync("save.json",JSON.stringify(player));','}','','class Loader {','  load(){ return 1; }','}',
   ...Array.from({length:60},(_,i)=>'function helper'+i+'(){ return '+i+'; }')].join('\n');
  const parts=chunker.chunk({type:'code',text:js});
  const save=parts.find(p=>p.text.includes('function saveProgress'));
  assert(save,'function kept whole');assert(save.text.includes('Saves player progress'),'leading doc comment stays with the function');
  assert(parts.every(p=>p.text.length<=chunker.MAX));assert(parts.every(p=>Number.isInteger(p.loc.line)&&p.loc.line>=1));
  assert.equal(js.split('\n')[save.loc.line-1].trim().length>0,true);
  const py='import os\n\ndef save_progress(data):\n    open("s","w").write(data)\n\nclass Game:\n    def run(self):\n        pass\n';
  assert(chunker.code(py).length>=1);
  const md='# Монетизация\nвступление\n## Реклама\n'+'Rewarded видео. '.repeat(20)+'\n## Покупки\nСундуки и пропуск.\n```\n# не заголовок\n```\n# Китай\n'+'LTV по Китаю растёт. '.repeat(150);
  const sections=chunker.chunk({type:'markdown',text:md});
  assert(sections.some(p=>p.loc.heading==='Монетизация › Реклама'));
  assert(!sections.some(p=>p.loc.heading?.includes('не заголовок')),'code fences are not headings');
  assert(sections.filter(p=>p.loc.heading==='Китай').length>1,'a long section is split');
  const chat=chunker.chunk({type:'chat',messages:Array.from({length:14},(_,i)=>({who:i%2?'Петя':'Вы',text:'сообщение '+i,at:i}))});
  assert.equal(chat[0].loc.from,0);assert.equal(chat[0].loc.to,5);assert.equal(chat[1].loc.from,4,'windows overlap by two');
  assert(chat[0].text.startsWith('Вы: сообщение 0'));
  const pdf=chunker.chunk({type:'text',text:'[Страница 1]\nВведение\n\n[Страница 2]\nГрафик LTV по Китаю\n'});
  assert.deepEqual(pdf.map(p=>p.loc),[{page:1},{page:2}]);
  const slides=chunker.chunk({type:'text',text:'[Слайд 3]\nРынок Китая'});assert.deepEqual(slides[0].loc,{slide:3});
  assert.equal(chunker.typeOf('a/Save.cs'),'code');assert.equal(chunker.typeOf('README.md'),'markdown');assert.equal(chunker.typeOf('deck.pptx'),'text');
  assert.equal(chunker.chunk({chunks:['готовый кусок',{text:'ещё',loc:{page:2}}]}).length,2);
 }
 // --- Ignore rules ----------------------------------------------------------------------------------------------
 {
  const root=tmp();
  fs.mkdirSync(path.join(root,'src/gen'),{recursive:true});fs.mkdirSync(path.join(root,'docs'),{recursive:true});
  fs.writeFileSync(path.join(root,'.gitignore'),'*.log\n/out-*/\ngenerated/\n!keep.log\n# comment\n');
  fs.writeFileSync(path.join(root,'src/.gitignore'),'gen/\n*.tmp\n');
  const ig=new ignore.Ignorer(root);
  const yes=(p,d=false)=>assert.equal(ig.ignored(path.join(root,p),d),true,p+' should be ignored');
  const no=(p,d=false)=>assert.equal(ig.ignored(path.join(root,p),d),false,p+' should be kept');
  yes('node_modules',true);yes('a/node_modules/x/index.js');yes('Library',true);yes('Unity/Library/x.asset');yes('build/app.js');yes('.git/config');yes('obj/Debug/x.cs');
  yes('debug.log');yes('src/deep/trace.log');no('keep.log');yes('out-1/x.txt');yes('out-1',true);no('src/out-1.txt');
  yes('src/gen',true);yes('src/gen/file.cs');no('gen/file.cs');yes('src/a.tmp');no('a.tmp');yes('lib/generated/x.js');
  yes('.env');yes('config/.env.production');no('.env.example');yes('keys/server.pem');yes('id_rsa');yes('android/app/google-services.json');yes('release.keystore');yes('gcp-service-account.json');yes('secrets.yaml');
  no('src/Save.cs');no('docs/Китай.md');no('build.gradle');no('docs',true);
  const r=ignore.redact('token = '+'q'.repeat(30)+'\nключ AKIA'+'B'.repeat(16)+'\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\nобычный текст');
  assert.equal(r.redacted,3);assert(!r.text.includes('q'.repeat(30)));assert(!r.text.includes('AKIA'));assert(!r.text.includes('abc'));assert(r.text.includes('обычный текст'));
  assert.equal(ignore.isBinary(Buffer.from([1,2,0,3])),true);assert.equal(ignore.isBinary(Buffer.from('текст')),false);
  fs.rmSync(root,{recursive:true,force:true});
 }
 // --- Index contract ----------------------------------------------------------------------------------------------
 {
  const root=tmp();
  const optIn=new Set(['notes','docs']);const published=[];
  let docs=[{id:'d1',version:'1',meta:{title:'Китай',path:'/p/china.md'},text:'# Китай\nПрезентация про рынок Китая с графиком LTV'},{id:'d2',version:'1',meta:{title:'Сохранения',path:'/p/Save.cs'},text:'class Save { void SaveProgress(){} } // сохраняет прогресс игрока'}];
  const reads=[];
  const providers=[
   {id:'notes',name:'Заметки',collects:'заметки'},
   {id:'docs',name:'Документы',collects:'файлы',type:'markdown',list:async()=>docs.map(({text,...e})=>e),read:async(s,e)=>{reads.push(e.id);const d=docs.find(x=>x.id===e.id);return d?{text:d.text,type:d.id==='d2'?'code':'markdown'}:null;}},
   {id:'chats',name:'Чаты',collects:'чаты'}];
  const calls=[];
  const index=new SemanticIndex({root,embedder:()=>fakeEmbedder({calls}),providers:()=>providers,enabled:id=>optIn.has(id),setEnabled:(id,on)=>on?optIn.add(id):optIn.delete(id),publish:n=>published.push(n),throttle:0});
  // add / search with provenance
  await index.add('notes',[{id:'n1',text:'Документы про монетизацию: реклама и покупки',meta:{title:'Монетизация'}},{id:'n2',text:'Список покупок в магазин: молоко, хлеб',meta:{title:'Покупки'}}]);
  let r=await index.search('notes','монетизация реклама',{k:2});
  assert.equal(r.ready,true);assert.equal(r.hits[0].id,'n1');assert.equal(r.hits[0].collection,'notes');assert.equal(r.hits[0].meta.title,'Монетизация');
  assert(r.hits[0].score>=r.hits[0].cosine,'lexical bonus never lowers the score');assert(r.hits[0].ranges.length>0,'query words highlighted');
  assert(calls.some(c=>c.query),'the query is embedded as a query');
  // update with the same text: no re-embedding; changed text: re-embedded
  const before=calls.length;
  await index.add('notes',[{id:'n1',version:'2',text:'Документы про монетизацию: реклама и покупки',meta:{title:'Монетизация'}}]);
  assert.equal(calls.length,before,'unchanged content is not embedded again');
  await index.add('notes',[{id:'n1',version:'3',text:'Отчёт о погоде на неделю',meta:{title:'Погода'}}]);
  r=await index.search('notes','погода на неделю',{k:1});assert.equal(r.hits[0].id,'n1');assert.equal(r.hits[0].meta.title,'Погода');
  // remove
  await index.remove('notes',['n2']);r=await index.search('notes','молоко хлеб',{k:5});assert.equal(r.hits.some(h=>h.id==='n2'),false);
  // opt-in: a collection that is off is neither filled nor searched
  await assert.rejects(index.add('chats',[{id:'c1',text:'привет'}]),/выключена/);
  assert.equal(fs.existsSync(path.join(root,'chats')),false,'nothing written for a collection that is off');
  // incremental sync with list/read
  let res=await index.sync('docs');assert.equal(res.indexed,2);assert.deepEqual(reads.sort(),['d1','d2']);
  reads.length=0;res=await index.sync('docs');assert.equal(res.indexed,0);assert.deepEqual(reads,[],'same versions are not read again');
  docs[1]={...docs[1],version:'2'};reads.length=0;res=await index.sync('docs');assert.deepEqual(reads,['d2']);assert.equal(res.unchanged,1,'new mtime, same content');
  docs=[docs[0]];res=await index.sync('docs');assert.equal(res.removed,1);
  r=await index.search('*','график LTV Китай',{k:5});
  assert.deepEqual(r.collections.sort(),['docs','notes']);assert.equal(r.hits[0].id,'d1');assert.equal(r.hits[0].collection,'docs');assert.deepEqual(r.off,['chats']);
  r=await index.search('*','график LTV',{k:5,filter:{pathPrefix:'/elsewhere'}});assert.equal(r.hits.length,0,'path filter');
  r=await index.search(['docs'],'график LTV',{k:5,filter:(meta,id)=>id==='d1'});assert.equal(r.hits[0].id,'d1');
  // pause holds the queue, resume continues
  index.pause();let done=false;const job=index.add('notes',[{id:'n3',text:'пауза и продолжение'}]).then(()=>done=true);
  await new Promise(r=>setTimeout(r,700));assert.equal(done,false,'paused');
  index.resume();await job;assert.equal(done,true);
  // background tick syncs each enabled automatic collection once
  index.lastSync.clear();reads.length=0;index.tick();await index.running;assert.equal(index.lastSync.has('docs'),true);
  // wipe: data gone, collections switched off
  await index.wipe();
  assert.equal(fs.existsSync(root),false);assert.equal(optIn.size,0);
  r=await index.search('*','что угодно');assert.deepEqual(r.hits,[]);
  assert(published.some(n=>n.id==='semantic-index'&&/стёрт/.test(n.text)));
  // A missing model: search answers «not ready», jobs fail with a clear reason.
  optIn.add('notes');
  const noModel=new SemanticIndex({root,embedder:()=>fakeEmbedder({installed:false}),providers:()=>providers,enabled:id=>optIn.has(id),throttle:0});
  await assert.rejects(noModel.add('notes',[{id:'x',text:'текст'}]),/Нужна модель/);
  // Limits: a collection never grows past its chunk budget.
  const tight=new SemanticIndex({root,embedder:()=>fakeEmbedder(),providers:()=>providers,enabled:id=>optIn.has(id),throttle:0,limits:{chunks:2}});
  await assert.rejects(tight.add('notes',[{id:'big',chunks:['раз','два','три']}]),/предела/);
  await tight.close();await noModel.close();await index.close();
  fs.rmSync(root,{recursive:true,force:true});
  assert.deepEqual(terms('Где презентация про Китай с графиком LTV?'),['презен','кита','график','ltv']);
  assert.deepEqual(ranges('График LTV по Китаю',terms('китай график')),[[0,6],[14,19]]);
 }
 // --- Embedder over the Ollama API and the model download ------------------------------------------------------------
 {
  const requests=[];let installed=false;
  const fetcher=async(url,options={})=>{
   const u=new URL(url);requests.push(u.pathname);
   const json=data=>({ok:true,status:200,json:async()=>data});
   if(u.pathname==='/api/tags')return json({models:installed?[{name:'qwen3-embedding:0.6b'}]:[]});
   if(u.pathname==='/api/embed'){const body=JSON.parse(options.body);assert.equal(body.model,'qwen3-embedding:0.6b');assert.equal(body.truncate,true);assert(body.options.num_thread>=1);
    return json({embeddings:body.input.map(t=>Array.from(fakeVector(t,1024)))});}
   if(u.pathname==='/api/pull'){const lines=[{status:'pulling manifest'},{status:'downloading',completed:300,total:600},{status:'downloading',completed:600,total:600},{status:'success'}].map(x=>JSON.stringify(x)+'\n');installed=true;
    return {ok:true,status:200,body:(async function*(){for(const l of lines)yield Buffer.from(l);})()};}
   throw Error('unexpected '+u.pathname);
  };
  const e=new embedding.Embedder({base:()=>new URL('http://127.0.0.1:11434'),fetcher});
  assert.equal(e.dim,512,'Matryoshka cut to 512 dimensions');
  const [q]=await e.embed(['где сохранения'],{query:true});
  assert.equal(q.length,512);assert(Math.abs(q.reduce((a,v)=>a+v*v,0)-1)<1e-4,'unit length after the cut');
  assert.deepEqual(await e.status(),{reachable:true,installed:false});
  const stages=[];
  const r=await embedding.prepare({base:()=>new URL('http://127.0.0.1:11434'),fetcher,checkDisk:async()=>({enough:true}),update:(phase,message,extra)=>stages.push([phase,extra?.received])});
  assert.deepEqual(r,{model:'qwen3-embedding:0.6b',dim:512});
  assert.deepEqual(stages.map(s=>s[0]).filter((s,i,a)=>a.indexOf(s)===i),['starting','checking','pulling','warming']);
  assert(stages.some(s=>s[0]==='pulling'&&s[1]===300),'pull progress is reported');
  // Ollama not running and no installer: a clear error, nothing pulled.
  await assert.rejects(embedding.prepare({base:()=>new URL('http://127.0.0.1:11434'),fetcher:async()=>{throw Error('ECONNREFUSED');},checkDisk:async()=>{}}),/Ollama не запущен/);
  assert.throws(()=>new embedding.Embedder({model:'llama3:8b'}),/не подходит/);
 }
 // --- Feature: declared collections and the per-company service ------------------------------------------------------
 {
  const all=feature.load();
  assert(all.some(p=>p.id==='chats'&&p.builtin)&&all.some(p=>p.id==='meetings'&&p.builtin),'Petya\'s chats and meetings are collections');
  assert.throws(()=>feature.check({id:'x',name:'X'},'x'),/Invalid index collection/,'collects (what is read) is required');
  assert.throws(()=>feature.check({id:'x',name:'X',collects:'y',list:async()=>[]},'x'),/Invalid/,'list without read');
  assert.throws(()=>feature.validate({semanticIndexCollections:'{"chats":"yes"}'}),/коллекций/);
  feature.validate({semanticIndexCollections:'{"chats":true}',semanticIndexModel:'bge-m3:567m',semanticIndexPaused:'false'});
  const root=tmp(),saved=[];
  const topics=[{id:'t1',title:'Релиз',projectId:'p',messages:[{role:'user',text:'когда выходит релиз в Китае?',at:1},{role:'assistant',text:'Релиз в Китае 12 декабря',at:2}]},{id:'t2',title:'Пусто',messages:[]}];
  const s={settings:{semanticIndexCollections:'{}',semanticIndexModel:'qwen3-embedding:0.6b',ollamaUrl:'http://127.0.0.1:11434'},companyId:'c',dataRoot:root,
   saveSettings(v){Object.assign(s.settings,v);saved.push(v);},dialogue:{state:{topics}},memory:{items:[
    {sessionId:'m1',source:'Встреча',speaker:'Олег',text:'обсудили монетизацию и рекламу',at:5,title:'Синк · 1'},{sessionId:'m1',source:'Встреча',kind:'summary',text:'сводка',at:6}]}};
  const fetcher=async(url,options={})=>{const u=new URL(url);const json=d=>({ok:true,status:200,json:async()=>d});
   if(u.pathname==='/api/tags')return json({models:[{name:'qwen3-embedding:0.6b'}]});
   if(u.pathname==='/api/embed'){const body=JSON.parse(options.body);return json({embeddings:body.input.map(t=>Array.from(fakeVector(t,1024)))});}
   throw Error('unexpected');};
  const notices=[];
  const api=feature.create(s,{providers:all.filter(p=>p.builtin),fetcher,publish:n=>notices.push(n),throttle:0});
  assert.equal(api.collections().every(c=>!c.enabled),true,'everything is off by default');
  await api.enable('chats');await api.index.running;await api.sync('chats');
  assert.deepEqual(JSON.parse(s.settings.semanticIndexCollections),{chats:true});
  let r=await api.search('*','релиз в Китае');
  assert.equal(r.hits[0].collection,'chats');assert.equal(r.hits[0].id,'t1');assert.equal(r.hits[0].meta.title,'Релиз');assert.equal(r.hits[0].loc.from,0);
  assert.equal(r.hits.some(h=>h.collection==='meetings'),false,'meetings stay off');
  await api.enable('meetings');await api.sync('meetings');
  r=await api.search('meetings','монетизация реклама');assert.equal(r.hits[0].id,'m1');assert.match(r.hits[0].text,/Олег: обсудили/);assert(!r.hits[0].text.includes('сводка'),'summaries are not transcripts');
  const st=await api.status();assert.equal(st.modelInstalled,true);assert.equal(st.modelBytes,639000000);
  api.pause();assert.equal(s.settings.semanticIndexPaused,'true');api.resume();
  await api.wipe('chats');assert.deepEqual(JSON.parse(s.settings.semanticIndexCollections),{meetings:true});
  assert.equal(fs.existsSync(path.join(root,'semantic-index','chats')),false);assert.equal(fs.existsSync(path.join(root,'semantic-index','meetings')),true);
  await api.close();
  fs.rmSync(root,{recursive:true,force:true});
 }
 console.log('Semantic index: store add/update/remove/search with sketch prefilter and compaction, corruption recovery, chunkers, ignore rules and redaction, opt-in, incremental sync, pause, wipe, limits, Ollama embedder and model download passed');
})().catch(e=>{console.error(e);process.exit(1);});
