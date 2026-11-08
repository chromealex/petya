// «Глоссарий»: the project's own words («мана», «сундук», «ивент», «баттлпасс») with definitions, translations per
// language, synonyms and forbidden variants. Candidates come from localization strings (the «Локализация» parsers),
// Confluence/Notion pages Petya can read and the team's Slack and meetings; the local model proposes which words are
// terms and drafts definitions from that evidence only. Nothing is stored until the user presses «Принять».
// Consistency of the localization against saved terms is checked by code (src/extensions/glossary/lexicon.cjs).
// `glossaryContext(command, projectId)` gives the answer pipeline the few saved terms a question uses.
const kit=require('../app-kit.cjs');
const lexicon=require('./lexicon.cjs');
const {Store,clean,exportTerms,key}=require('./store.cjs');
const ID='glossary',BY='Глоссарий',NOTICE='glossary-build';
const MAX_CANDIDATES=20;
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const cleanText=s=>one(s).replace(/^петя[\s,:.!?—-]*/iu,'').replace(/[\s?!.…]+$/u,'').trim();
const MARKER=/\s+(?:у нас|в (?:нашем )?проекте|в (?:нашей )?игре|по-нашему|в глоссарии|в нашем глоссарии)$/iu;
const unquote=s=>one(s).replace(/^[«"“'`]+|[»"”'`]+$/gu,'').trim();

// {kind:'define'|'add'|'build'|'check'|'list', term?, definition?, marked?} or null.
function parse(text){
 const t=cleanText(text);if(!t)return null;
 const g=/глоссари\p{L}*/iu.test(t);
 if(g){
  // «глоссарий Unity», «покажи глоссарий Kubernetes»: somebody else's documentation.
  if(/[Гг]лоссари\p{L}*\s+(?!проекта|игры|нашего|наш|по\s)[A-Z][\w.+#-]*/u.test(t))return null;
  let m=/^(?:добавь|внеси|запиши|занеси|сохрани|положи)\s+(?:в\s+(?:наш\s+)?глоссари\p{L}*\s*[:—-]?\s*(.+)|(?:термин|слово)\s+(.+?)\s+в\s+глоссари\p{L}*(?:\s*[:—-]\s*(.+))?)$/iu.exec(t);
  if(m){const body=m[1]?split(m[1]):{term:unquote(m[2]),definition:one(m[3]||'')};return body.term?{kind:'add',...body}:null;}
  if(/(?:^|\s)(?:собери|составь|построй|создай|сделай|обнови|пополни|наполни|заполни)\s+(?:\p{L}+\s+)?глоссари/iu.test(t))return {kind:'build'};
  if(/(?:провер\p{L}*|сверь|сверить)\s+.*(?:локализац|перевод|строк)/iu.test(t)||/(?:локализац|перевод)\p{L}*\s+.*по\s+глоссари/iu.test(t))return {kind:'check'};
  if(/(?:экспорт\p{L}*|выгрузи|скачай|сохрани\s+в\s+(?:csv|json))/iu.test(t))return {kind:'list',export:true};
  if(/^(?:(?:покажи|открой|выведи|какой|что в|какие термины в)\s+)?(?:наш\s+|мой\s+)?глоссари\p{L}*(?:\s+(?:проекта|игры))?$/iu.test(t)||/(?:покажи|открой|выведи)\s+(?:\p{L}+\s+)?глоссари/iu.test(t))return {kind:'list'};
  return null;
 }
 if(/(?:провер\p{L}*|сверь|сверить)\s+(?:\p{L}+\s+)?термин\p{L}*\s+(?:в\s+|по\s+)?(?:локализац|перевод|строк)\p{L}*/iu.test(t))return {kind:'check'};
 let m=/^(?:а\s+)?что\s+(?:у нас\s+)?(?:такое|значит|означает|называется|имеется в виду под)\s+(.+)$/iu.exec(t);
 if(m){
  let rest=m[1],marked=/^(?:а\s+)?что\s+у нас/iu.test(t);
  if(MARKER.test(rest)){marked=true;rest=rest.replace(MARKER,'');}
  const term=unquote(rest);
  if(!term||term.split(/\s+/).length>4||term.length>60)return null;
  return {kind:'define',term,marked};
 }
 return null;
}
// «сундук — награда за уровень», «сундук: …», «сундук это …».
function split(body){
 const m=/^(.+?)\s*(?:—|–|-|:|=|\s это\s)\s*(.+)$/u.exec(one(body));
 return m?{term:unquote(m[1]),definition:one(m[2]).slice(0,600)}:{term:unquote(body),definition:''};
}

function where(s){
 const state=s.dialogue.state||{},topic=s.dialogue.active();
 const id=topic?.projectId||state.activeProjectId||'general';
 const project=(state.projects||[]).find(p=>p.id===id);
 return {projectId:id,project:project?.name||(id==='general'?'Общий':'Проект')};
}
const store=s=>new Store(s.dataRoot);

// Localization rows of the current project (the «Локализация» file search and parsers).
async function strings(s){
 const find=require('../localization/find.cjs'),formats=require('../localization/formats.cjs');
 const roots=find.projectRoots(s);
 if(!roots.length)return {roots,sets:[],rows:[]};
 s.requestProgress?.report('Читаю строки локализации проекта');
 const sets=formats.sets(await find.scan(roots),{source:s.settings.localizationSourceLanguage||'en'});
 return {roots,sets,rows:lexicon.entries(sets)};
}
// Confluence / Notion pages through the shared docs search; nothing when docs are not connected.
async function docs(s,query){
 if(!s.workspace?.searchDocs)return [];
 try{const r=await s.workspace.searchDocs({title:'',text:''},query);return (r.docs||[]).slice(0,6).map(d=>({title:one(d.title).slice(0,200),text:String(d.text||'').slice(0,6000),url:/^https:\/\//.test(d.url||'')?d.url:'',source:d.source||''}));}
 catch{return [];}
}
// The team's words: Slack messages and meeting speech Petya keeps (read-only).
function mentions(s,term,{synonyms=[]}={}){
 let items=[];try{items=s.memory?.prune?.()||[];}catch{items=[];}
 const res=[term,...synonyms].map(t=>lexicon.pattern(t)).filter(Boolean);
 const out=[];
 for(const i of items){
  const parts=i.source==='Slack'?(i.messages||[]).map(m=>({text:m.text,at:m.at})):(i.source==='Встреча'||i.source==='Микрофон')&&!i.kind?[{text:i.text,at:i.at}]:[];
  for(const p of parts){const re=res.find(r=>r.test(p.text||''));if(!re)continue;const t=one(p.text),at=t.search(re);out.push({source:i.source==='Slack'?'Slack':'Встреча',title:one(i.title).slice(0,80),text:(at>60?'…':'')+t.slice(Math.max(0,at-60),Math.max(0,at-60)+160),url:/^https:\/\//.test(i.url||'')?i.url:'',at:p.at||i.at||0});}
 }
 return out.sort((a,b)=>b.at-a.at);
}
// Lines of a page that define a word with a dash: «Мана — ресурс для умений» (a colon is too common in pages).
function definitions(docList){
 const out=[];
 for(const d of docList)for(const line of String(d.text).split(/\n+/)){
  const m=/^\s*(?:[-*•]\s*)?([\p{Lu}][\p{L}-]{2,30}(?:\s[\p{L}-]{2,20}){0,2})\s+(?:—|–)\s+(.{8,240})$/u.exec(line.trim());
  // «Мана» at the start of a line is «мана»; «XP», «UI» stay as written.
  if(m&&!/[.?!]$/.test(m[1]))out.push({term:/^\p{Lu}\p{Ll}/u.test(m[1])?m[1].trim().replace(/^\p{Lu}/u,c=>c.toLocaleLowerCase()):m[1].trim(),definition:m[2].trim().replace(/\s+/g,' '),doc:d});
 }
 return out;
}

// One term for the card: translations per language from the strings, usage, examples and where it came from.
function describe(input,{rows=[],chat=[],docHits=[],saved=false}={}){
 const tr=lexicon.translations(input.term,rows,{synonyms:input.synonyms||[]});
 const translations={...(input.translations||{})};
 const variants={};
 for(const [lang,info] of Object.entries(tr.langs)){if(info.primary&&!translations[lang])translations[lang]=info.primary;variants[lang]=info.variants.slice(0,4);}
 const sources=[...(input.sources||[])];
 if(tr.count&&!sources.some(x=>x.kind==='loc'))sources.push({kind:'loc',label:'Локализация: '+tr.count+' '+kit.plural(tr.count,['строка','строки','строк'])});
 for(const d of docHits.slice(0,2))if(!sources.some(x=>x.url===d.url))sources.push({kind:'doc',label:(d.source?d.source+' · ':'')+d.title,...d.url?{url:d.url}:{}});
 if(chat.length&&!sources.some(x=>x.kind==='chat'))sources.push({kind:'chat',label:'Переписка и встречи: '+chat.length});
 return {...(input.id?{id:input.id}:{}),term:input.term,definition:input.definition||'',translations,synonyms:input.synonyms||[],forbidden:input.forbidden||[],
  sources:sources.slice(0,6),saved,variants,usage:{strings:tr.count,chat:chat.length,docs:docHits.length},examples:(tr.examples||[]).slice(0,4),chat:chat.slice(0,3)};
}

async function draftDefinition(s,term,{examples,chat,docHits}){
 if(!s.settings.model||!(examples.length||chat.length||docHits.length))return {definition:'',synonyms:[]};
 try{
  const r=await kit.modelJSON(s,{system:'Определи игровой термин проекта только по фрагментам ниже: что это в этой игре, одним-двумя предложениями по-русски. Если из фрагментов непонятно — верни пустое определение. synonyms — другие написания этого же термина, которые есть во фрагментах.',
   user:{term,strings:examples.map(e=>e.text),chat:chat.slice(0,4).map(c=>c.text),docs:docHits.slice(0,3).map(d=>({title:d.title,text:d.text.slice(0,1500)}))},
   schema:{type:'object',properties:{definition:{type:'string'},synonyms:{type:'array',items:{type:'string'},maxItems:5}},required:['definition','synonyms']},predict:300,temperature:0.1});
  const corpus=[...examples.map(e=>e.text),...chat.map(c=>c.text),...docHits.map(d=>d.text)].join('\n').toLocaleLowerCase();
  // A synonym the evidence does not contain is the model's invention and is dropped.
  return {definition:one(r?.definition).slice(0,600),synonyms:(r?.synonyms||[]).map(one).filter(x=>x&&x.length<=60&&key(x)!==key(term)&&corpus.includes(x.toLocaleLowerCase())).slice(0,5)};
 }catch{return {definition:'',synonyms:[]};}
}

function card(s,mode,extra){const w=where(s);return {cardId:require('node:crypto').randomUUID(),projectId:w.projectId,project:w.project,mode,terms:[],candidates:[],...extra};}

async function defineTurn(s,command,ask){
 const w=where(s),saved=store(s).find(w.projectId,ask.term);
 const loc=await strings(s);
 if(saved){
  const t=describe(saved,{rows:loc.rows,chat:mentions(s,saved.term,saved),saved:true});
  const tr=Object.entries(t.translations).slice(0,3).map(([l,v])=>l+': '+v).join(', ');
  return kit.reply(s,command,{by:BY,text:'«'+saved.term+'»'+(saved.definition?' — '+saved.definition:' есть в глоссарии без определения.')+(tr?' ('+tr+')':''),data:{glossary:card(s,'term',{terms:[t],query:ask.term})}});
 }
 if(!ask.marked)return null;
 s.requestProgress?.report('Ищу «'+ask.term+'» в локализации, документах и переписке');
 const chat=mentions(s,ask.term),docHits=(await docs(s,ask.term)).filter(d=>lexicon.pattern(ask.term).test(d.title+'\n'+d.text));
 const draft=describe({term:ask.term},{rows:loc.rows,chat,docHits});
 if(!draft.usage.strings&&!chat.length&&!docHits.length)return kit.reply(s,command,{by:BY,question:true,text:'В глоссарии проекта «'+w.project+'» нет «'+ask.term+'», и в локализации, документах и переписке я его не нашёл. Чтобы добавить, скажите: «добавь в глоссарий '+ask.term+' — что это значит».'});
 const fromDoc=definitions(docHits).find(d=>key(d.term)===key(ask.term));
 const model=fromDoc?{definition:fromDoc.definition,synonyms:[]}:await draftDefinition(s,ask.term,{examples:draft.examples,chat,docHits});
 const t=describe({term:ask.term,definition:model.definition,synonyms:model.synonyms,sources:fromDoc?[{kind:'doc',label:fromDoc.doc.title,...fromDoc.doc.url?{url:fromDoc.doc.url}:{}}]:model.definition?[{kind:'model',label:'Определение предложено по найденным фрагментам'}]:[]},{rows:loc.rows,chat,docHits});
 const found=[t.usage.strings?t.usage.strings+' '+kit.plural(t.usage.strings,['строке','строках','строках'])+' локализации':'',docHits.length?docHits.length+' '+kit.plural(docHits.length,['документе','документах','документах']):'',chat.length?chat.length+' '+kit.plural(chat.length,['сообщении','сообщениях','сообщениях'])+' команды':''].filter(Boolean).join(', ');
 const text='В глоссарии проекта «'+ask.term+'» пока нет. Нашёл в '+found+'. '+(t.definition?'Предлагаю определение: «'+t.definition+'» — проверьте и нажмите «Принять».':'Определение по найденному не получается — допишите его в «Изменить» и примите.');
 return kit.reply(s,command,{by:BY,text,data:{glossary:card(s,'term',{candidates:[t],query:ask.term})}});
}

async function addTurn(s,command,ask){
 const w=where(s),old=store(s).find(w.projectId,ask.term);
 const loc=await strings(s);
 if(old)return kit.reply(s,command,{by:BY,text:'«'+old.term+'» уже есть в глоссарии проекта «'+w.project+'». Изменить его можно в карточке.',data:{glossary:card(s,'term',{terms:[describe(old,{rows:loc.rows,saved:true})]})}});
 const t=describe({term:ask.term,definition:ask.definition,sources:[{kind:'user',label:'Добавлено вами'}]},{rows:loc.rows,chat:mentions(s,ask.term)});
 const tr=Object.entries(t.translations).map(([l,v])=>l+': '+v).join(', ');
 return kit.reply(s,command,{by:BY,text:'Подготовил «'+t.term+'»'+(tr?' с переводами из локализации ('+tr+')':'')+'. Проверьте и нажмите «Принять» — сохраню в глоссарий проекта «'+w.project+'».',data:{glossary:card(s,'candidates',{candidates:[t]})}});
}

let operation=null;
function publish(s,text,{busy=false,kind='info'}={}){
 operation={id:NOTICE,title:'Глоссарий',text,busy,kind};
 try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',operation);}catch{/* window closed */}
}

async function buildTurn(s,command){
 const w=where(s),saved=store(s).terms(w.projectId);
 publish(s,'Собираю глоссарий проекта «'+w.project+'»…',{busy:true});
 try{
  const loc=await strings(s);
  s.requestProgress?.report('Ищу глоссарий и термины в документации');
  const docList=await docs(s,'глоссарий термины');
  if(!loc.rows.length&&!docList.length){publish(s,'Глоссарий: нет локализации и документов проекта.',{kind:'attention'});
   return kit.reply(s,command,{by:BY,question:true,text:loc.roots.length?'В папке проекта нет файлов локализации, а в Confluence/Notion — страниц с терминами. Прикрепите файл локализации или подключите документацию — и повторите.':'Из чего собирать? Подключите папку проекта в контексте чата (там ищу файлы локализации) или Confluence/Notion в «Подключениях».'});}
  const freq=lexicon.frequent(loc.rows);
  const fromDocs=definitions(docList);
  const have=new Set(saved.flatMap(t=>[t.term,...(t.synonyms||[])]).map(key));
  let picked=[];
  if(s.settings.model&&(freq.words.length||fromDocs.length)){
   s.requestProgress?.report('Выбираю термины среди частых слов');
   const r=await kit.modelJSON(s,{system:'Ниже частые слова из строк локализации игры (с примерами) и определения из документов проекта. Выбери до 15 игровых терминов этого проекта: ресурсы, валюты, предметы, механики, режимы, события. Обычные слова интерфейса не бери. term — в начальной форме, как в списке. definition — одно предложение по-русски только по примерам и документам; если непонятно — пустая строка.',
    user:{words:freq.words.slice(0,50).map(x=>({word:x.word,count:x.count,examples:x.examples})),docs:fromDocs.slice(0,30).map(d=>({term:d.term,definition:d.definition}))},
    schema:{type:'object',properties:{terms:{type:'array',maxItems:MAX_CANDIDATES,items:{type:'object',properties:{term:{type:'string'},definition:{type:'string'}},required:['term','definition']}}},required:['terms']},predict:1500,temperature:0.1}).catch(()=>null);
   // Only words that are really in the strings or the pages: the model chooses, it does not invent.
   const known=new Set([...freq.words.map(x=>lexicon.base(x.word)),...fromDocs.map(d=>key(d.term))]);
   picked=(r?.terms||[]).map(x=>({term:one(x.term).slice(0,60),definition:one(x.definition).slice(0,600)})).filter(x=>x.term&&(known.has(lexicon.base(x.term))||known.has(key(x.term))));
  }
  for(const d of fromDocs)if(!picked.some(p=>key(p.term)===key(d.term)))picked.push({term:d.term,definition:d.definition,doc:d.doc});
  if(!s.settings.model)for(const x of freq.words.filter(x=>x.count>=3).slice(0,12))if(!picked.some(p=>lexicon.base(p.term)===lexicon.base(x.word)))picked.push({term:x.word,definition:''});
  picked=picked.filter(p=>!have.has(key(p.term))).slice(0,MAX_CANDIDATES);
  const candidates=picked.map(p=>{
   const fromDoc=p.doc||fromDocs.find(d=>key(d.term)===key(p.term))?.doc;
   const sources=fromDoc?[{kind:'doc',label:fromDoc.title,...fromDoc.url?{url:fromDoc.url}:{}}]:p.definition?[{kind:'model',label:'Определение предложено по строкам локализации'}]:[];
   return describe({term:p.term,definition:p.definition,sources},{rows:loc.rows,chat:mentions(s,p.term),docHits:fromDoc?[fromDoc]:[]});
  }).sort((a,b)=>(b.usage.strings+b.usage.chat+b.usage.docs)-(a.usage.strings+a.usage.chat+a.usage.docs));
  const text=candidates.length?'Нашёл '+candidates.length+' '+kit.plural(candidates.length,['кандидат','кандидата','кандидатов'])+' в глоссарий проекта «'+w.project+'»'+(loc.rows.length?' по '+loc.rows.length+' '+kit.plural(loc.rows.length,['строке','строкам','строкам'])+' локализации':'')+(docList.length?' и '+docList.length+' '+kit.plural(docList.length,['странице','страницам','страницам'])+' документации':'')+'. Ничего не сохранено: примите нужные.'+(s.settings.model?'':' Без локальной модели предлагаю просто частые слова, без определений.')
   :'Новых терминов не нашёл'+(saved.length?' — в глоссарии уже '+saved.length+' '+kit.plural(saved.length,['термин','термина','терминов']):'')+'.';
  publish(s,candidates.length?'Глоссарий: '+candidates.length+' '+kit.plural(candidates.length,['кандидат','кандидата','кандидатов'])+' ждут проверки в чате.':'Глоссарий: новых терминов нет.',{kind:'success'});
  return kit.reply(s,command,{by:BY,text,data:{glossary:card(s,'candidates',{candidates,scanned:{sets:loc.sets.map(x=>x.name).slice(0,10),strings:loc.rows.length,docs:docList.length}})},
   sources:docList.filter(d=>d.url).slice(0,4).map(d=>({title:(d.source||'Документ')+' · '+d.title,url:d.url}))});
 }catch(e){publish(s,'Глоссарий не собран: '+e.message,{kind:'error'});throw e;}
}

async function checkTurn(s,command){
 const w=where(s),saved=store(s).terms(w.projectId);
 if(!saved.length)return kit.reply(s,command,{by:BY,question:true,text:'В глоссарии проекта «'+w.project+'» ещё нет терминов — проверять не по чему. Скажите «собери глоссарий проекта» или «добавь в глоссарий …».'});
 const loc=await strings(s);
 if(!loc.rows.length)return kit.reply(s,command,{by:BY,question:true,text:loc.roots.length?'В папке проекта не нашёл файлов локализации. Где они? Прикрепите файл или подключите папку с ними.':'Где файлы локализации? Подключите папку проекта в контексте чата.'});
 s.requestProgress?.report('Сверяю строки с глоссарием');
 const r=lexicon.check(saved,loc.rows);
 const by=k=>r.issues.filter(i=>i.kind===k).length;
 const text=r.total?'Проверил '+loc.rows.length+' '+kit.plural(loc.rows.length,['строку','строки','строк'])+' по '+saved.length+' '+kit.plural(saved.length,['термину','терминам','терминам'])+': '+r.total+' '+kit.plural(r.total,['расхождение','расхождения','расхождений'])+' ('+
  [by('forbidden')?'запрещённый вариант: '+by('forbidden'):'',by('translation')?'не тот перевод: '+by('translation'):'',by('inconsistent')?'разнобой в переводе: '+by('inconsistent'):''].filter(Boolean).join(', ')+'). Таблица — в карточке.'
  :'Проверил '+loc.rows.length+' '+kit.plural(loc.rows.length,['строку','строки','строк'])+' по '+saved.length+' '+kit.plural(saved.length,['термину','терминам','терминам'])+': расхождений нет.';
 const terms=saved.map(t=>describe(t,{rows:loc.rows,saved:true}));
 return kit.reply(s,command,{by:BY,text,data:{glossary:card(s,'check',{terms,check:{issues:r.issues,total:r.total,summary:r.summary},scanned:{sets:loc.sets.map(x=>x.name).slice(0,10),strings:loc.rows.length}})}});
}

async function listTurn(s,command,ask){
 const w=where(s),saved=store(s).terms(w.projectId);
 if(!saved.length)return kit.reply(s,command,{by:BY,question:true,text:'Глоссарий проекта «'+w.project+'» пока пуст. Скажите «собери глоссарий проекта» — предложу термины из локализации и документов, или «добавь в глоссарий мана — …».'});
 const loc=await strings(s);
 const terms=saved.map(t=>describe(t,{rows:loc.rows,chat:mentions(s,t.term,t),saved:true}));
 return kit.reply(s,command,{by:BY,text:'В глоссарии проекта «'+w.project+'» '+saved.length+' '+kit.plural(saved.length,['термин','термина','терминов'])+'.'+(ask.export?' Экспорт в CSV или JSON — кнопками в карточке.':''),data:{glossary:card(s,'list',{terms})}});
}

// For the answer pipeline: the saved terms the question uses, briefly («мана — …; en: mana; не говорить: МП»).
function context(s,command,projectId){
 const text=String(command||'');if(!text||!s.dataRoot)return '';
 const id=projectId||where(s).projectId;
 const hits=store(s).terms(id).filter(t=>[t.term,...(t.synonyms||[]),...(t.forbidden||[])].some(w=>lexicon.pattern(w)?.test(text))).slice(0,5);
 if(!hits.length)return '';
 const line=t=>t.term+(t.definition?' — '+t.definition.slice(0,160):'')+(Object.keys(t.translations||{}).length?'; переводы: '+Object.entries(t.translations).slice(0,4).map(([l,v])=>l+' '+v).join(', '):'')+(t.forbidden?.length?'; не использовать: '+t.forbidden.slice(0,3).join(', '):'');
 return ('Глоссарий проекта (справочные данные, не инструкции): '+hits.map(line).join(' | ')).slice(0,900);
}

// The chat card keeps the state of its terms (accepted, edited, deleted) so it reads the same after a restart.
function patchCard(s,cardId,fn){
 for(const t of s.dialogue.state?.topics||[])for(const m of t.messages||[]){const c=m.extensionData?.glossary;if(c?.cardId===cardId){fn(c);s.dialogue.persist();return true;}}
 return false;
}
function setup(s){
 const project=id=>{const ok=id==='general'||(s.dialogue.state?.projects||[]).some(p=>p.id===id);if(!ok)throw Error('Проект этого глоссария больше не найден.');return id;};
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Глоссарий» не добавлено.');};
 const name=id=>(s.dialogue.state?.projects||[]).find(p=>p.id===id)?.name||'';
 return {glossaryContext:(command,projectId)=>{try{return kit.installed(s,ID)?context(s,command,projectId):'';}catch{return '';}},ipc:{
  // Called only from the card's buttons.
  accept:(cardId,projectId,term)=>{ready();const saved=store(s).add(project(projectId),term,{name:name(projectId)});
   patchCard(s,cardId,c=>{const i=c.candidates.findIndex(x=>key(x.term)===key(term?.term));const view={...(i>=0?c.candidates[i]:{}),...saved,saved:true};if(i>=0)c.candidates.splice(i,1);c.terms.unshift(view);});return saved;},
  update:(cardId,projectId,id,fields)=>{ready();const saved=store(s).update(project(projectId),id,fields);patchCard(s,cardId,c=>{const i=c.terms.findIndex(x=>x.id===id);if(i>=0)c.terms[i]={...c.terms[i],...saved,saved:true};});return saved;},
  remove:(cardId,projectId,id)=>{ready();const removed=store(s).remove(project(projectId),id);patchCard(s,cardId,c=>{c.terms=c.terms.map(x=>x.id===id?{...x,saved:false,removed:true}:x);});return removed;},
  restore:(cardId,projectId,term)=>{ready();const back=store(s).restore(project(projectId),term);patchCard(s,cardId,c=>{c.terms=c.terms.map(x=>x.id===back.id?{...x,saved:true,removed:false}:x);});return back;},
  export:(projectId,format)=>{ready();return exportTerms(store(s).terms(project(projectId)),format,{project:name(projectId)});},
  progress:()=>operation
 }};
}

async function turn(s,command){
 const text=String(command||'');
 const ask=parse(text);
 if(!ask||!kit.installed(s,ID))return null;
 try{
  if(ask.kind==='define')return await defineTurn(s,text,ask);
  if(ask.kind==='add')return await addTurn(s,text,ask);
  if(ask.kind==='build')return await buildTurn(s,text);
  if(ask.kind==='check')return await checkTurn(s,text);
  return await listTurn(s,text,ask);
 }catch(e){return kit.failure(s,text,BY,e);}
}
module.exports={name:'glossary',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,parse,context,describe,definitions,clean};
