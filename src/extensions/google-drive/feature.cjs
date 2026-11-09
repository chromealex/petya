// «Google Диск»: Google Drive and Docs in the chat. «найди в гугл диске план релиза» searches names and full text
// (files.list with `q`), «последние файлы в гугл диске» lists recent ones, a pasted Docs link (or «прочитай гугл док
// «…»») reads the document with its headings, a question about it («по документу: какие сроки?») is answered only from
// its text with quotes that code checks word for word, a Slides or Drive link shows the file. Spreadsheet links belong
// to «Google Таблицы» (this app returns null for them). «Сохрани это в Google Docs» (and other cards through the
// cross-app kind `document-export`) prepares a new document from Petya's answer; it is created only on the card's
// «Создать документ». Drive documents can be indexed for search by meaning (collection.cjs), off until turned on.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const workspace=require('../../google-workspace.cjs');
const auth=require('./auth.cjs');
const {DriveClient,query}=require('./client.cjs');
const P=require('./passages.cjs');
const md=require('./markdown.cjs');
const drafts=require('./drafts.cjs');
const {randomUUID}=require('node:crypto');
const ID='google-drive',BY='Google Диск',NOTICE='google-drive',COLLECTION='google-drive';
const CACHE_MS=5*60000;

// --- Routing ---------------------------------------------------------------------------------------------------
// Neighbours: «Google Таблицы» (spreadsheets by name or link), «Поиск файлов по смыслу» and «Поиск по всему» (local
// files, everything at once), «Место на диске» (the computer's disk), other Google products.
const DRIVE='(?:гугл|google)[\\s-]*(?:диск\\p{L}*|драйв\\p{L}*|drive)';
const DOCS='(?:гугл|google)[\\s-]*(?:док(?:и|ах|ов|ам|е|у|ом|с)?(?=$|[^\\p{L}])|docs|документ\\p{L}*)';
const NAME=new RegExp(DRIVE+'|'+DOCS,'iu');
const NAMES_G=new RegExp('(?:(?:в|на|из|во)\\s+)?(?:мо(?:ём|ем|й|и|их)\\s+)?(?:'+DRIVE+'|'+DOCS+')','giu');
const OTHER_GOOGLE=/(?:гугл|google)[\s-]*(?:таблиц|sheets?|шит|play|плей|meet|мит|календар|calendar|почт|mail|переводч|translate|карт|maps|аналитик|analytics|cloud|клауд)/iu;
const EXPORT=/(?:сохрани|создай)\p{L}*\s+в\s+(?:гугл|google)[\s-]*документ\p{L}*\s+«[^»]*»[^#]*#([a-f0-9]{8})/iu;
const SAVE=new RegExp('(?:сохрани|запиши|выгрузи|экспортируй|положи|перенеси|скинь|оформи)\\p{L}*\\s+(?:(?:это|этот|эту|ответ|последний|твой|всё|все|текст|план|итоги?|резюме|саммари)\\s+){0,3}(?:в|на|как)\\s+(?:'+DOCS+'|'+DRIVE+')|(?:создай|сделай)\\s+(?:'+DOCS+')\\s+(?:из|с)\\s+(?:этого|этим|ответа|ответом|последнего)','iu');
const FIND=/(?:^|[^\p{L}])(?:найди|поищи|отыщи|ищи|найти|где\s+(?:лежит|лежат|файл|документ|презентаци\p{L}*|таблиц\p{L}*))(?=$|[^\p{L}])/iu;
const RECENT=/(?:последн|недавн|свеж|нов|изменённ|измененн)\p{L}*\s+(?:файл|документ|таблиц|презентац|pdf)\p{L}*|что\s+(?:нового|новенького|менялось|изменилось|недавно\s+менял\p{L}*)|(?:^|\s)(?:открой|покажи)\s+(?:мой\s+)?(?:гугл|google)[\s-]*(?:диск|драйв|drive)\p{L}*\s*[.!?]*$/iu;
// A question about a document: in the same message as its link, or a follow-up about the document open in this chat.
const ABOUT=/^(?:а\s+)?(?:по\s+(?:этому\s+|тому\s+|гугл\s+|google\s+)?документу|в\s+(?:этом\s+|том\s+)?документе|спроси\s+(?:у\s+)?документ\p{L}*|что\s+(?:в\s+(?:этом\s+)?документе\s+)?(?:сказано|написано|говорится)\s+(?:в\s+(?:этом\s+)?документе\s+)?(?:про|о|об|насчёт|насчет))/iu;
const QUESTION=/\?|^(?:что|какие|какой|какая|какое|каков\p{L}*|когда|кто|кому|сколько|где|почему|зачем|как|есть\s+ли|нужно\s+ли|можно\s+ли|будет\s+ли|чем|кого|чего|в\s+чём|в\s+чем)(?=$|[^\p{L}])/iu;
// The words of a request that name no file: verbs, Drive's names, file kinds and fillers.
const KINDS=[['document',/^(?:документ\p{L}*|доки?|доков|доке|docs?|текст\p{L}*)$/iu],['spreadsheet',/^(?:таблиц\p{L}*|sheets?)$/iu],['presentation',/^(?:презентаци\p{L}*|слайд\p{L}*|slides?|през\p{L}*|питч\p{L}*|дек)$/iu],['pdf',/^(?:pdf|пдф\p{L}*)$/iu],['folder',/^(?:папк\p{L}*|папочк\p{L}*)$/iu]];
const FILLER=/^(?:найди|поищи|отыщи|ищи|найти|где|лежит|лежат|покажи|открой|мне|мой|мои|моём|моем|моих|в|во|на|из|по|про|о|об|насчёт|насчет|с|со|и|или|для|под|названием|называется|который|которая|которое|которые|есть|там|все|всё|файл\p{L}*|последн\p{L}*|недавн\p{L}*|свеж\p{L}*|нов\p{L}*|пожалуйста|петя|гугл|google|диск\p{L}*|драйв\p{L}*|drive|какой|какие|какую|тот|та|ту|те|этот|эту|это|где-то)$/iu;
function intent(text){
 const t=String(text||'').trim();if(!t||t.length>4000)return null;
 if(EXPORT.test(t))return 'export';
 const link=workspace.parseLink(t);
 if(link?.kind==='spreadsheet')return null;
 if(SAVE.test(t)&&!OTHER_GOOGLE.test(t.replace(NAMES_G,' ')))return 'save';
 if(link){
  if(link.kind==='document'){const rest=t.replace(link.url,' ').trim();return QUESTION.test(rest.replace(/^(?:а|и|скажи|ответь|подскажи)[,\s]+/iu,''))&&!/^о\s+ч[её]м/iu.test(rest)&&rest.split(/\s+/).length>=2?'ask':'read';}
  return 'file';
 }
 if(ABOUT.test(t))return 'about';
 // Definitions are ordinary talk: «что такое гугл диск».
 if(/^(?:а\s+)?(?:что\s+такое|как\s+работает|зачем\s+нуж\p{L}*|чем\s+отличается)(?=$|[^\p{L}])/iu.test(t))return null;
 if(!NAME.test(t)||OTHER_GOOGLE.test(t.replace(NAMES_G,' ')))return null;
 if(/«[^»]{2,120}»|"[^"]{2,120}"/.test(t)&&new RegExp(DOCS,'iu').test(t)&&!FIND.test(t))return QUESTION.test(t.replace(/^.*?[»"]\s*[:,—-]?\s*/s,''))?'ask-title':'read-title';
 if(FIND.test(t))return 'find';
 if(RECENT.test(t))return 'recent';
 // «гугл диск», «покажи гугл доки про релиз»: words after the name are a search, nothing is the recent list.
 return spoken(t).words.length?'find':'recent';
}
// Spoken query → {words, kind, quoted}: «найди презентацию про Китай в гугл диске» → {words:['Китай'], kind:'presentation'}.
function spoken(text){
 const t=String(text||'').replace(/https?:\/\/\S+/g,' ');
 const quoted=/«([^»]{2,120})»|"([^"]{2,120})"/.exec(t);
 let kind='';const words=[];
 for(const w of (quoted?quoted[1]||quoted[2]:t.replace(NAMES_G,' ')).split(/[^\p{L}\p{N}_.-]+/u).map(x=>x.replace(/^[.-]+|[.-]+$/g,'')).filter(Boolean)){
  const k=KINDS.find(([,re])=>re.test(w));
  if(k&&!quoted){if(!kind)kind=k[0];continue;}
  if(!quoted&&(FILLER.test(w)||w.length<2))continue;
  words.push(w);
 }
 // «гугл доки про онбординг»: Docs by name means documents.
 if(!kind&&new RegExp(DOCS,'iu').test(t))kind='document';
 return {words:words.slice(0,8),kind,quoted:!!quoted};
}
// Name words become prefixes (Drive matches name words by prefix): «Китае» → «Кита».
const prefix=w=>/^[\p{Script=Cyrillic}]+$/u.test(w)?P.stem(w.toLocaleLowerCase('ru')):w;

// --- Helpers ---------------------------------------------------------------------------------------------------
const clientFor=(s,{write=false}={})=>new DriveClient({request:(url,o)=>s.request(url,o),token:()=>auth.token(s,{write})});
const cache=new Map();
async function loadDoc(s,id){
 const hit=cache.get(id);if(hit&&Date.now()-hit.at<CACHE_MS)return hit;
 const client=clientFor(s);
 const [meta,raw]=await Promise.all([client.get(id).catch(e=>{if(e.status===404||e.status===403)throw e;return null;}),client.document(id)]);
 const doc=workspace.docText(raw);
 const value={at:Date.now(),doc,meta:{id,title:doc.title||meta?.name||'Документ',url:meta?.url||workspace.fileUrl('document',id),owner:meta?.owner||'',mine:!!meta?.mine,shared:!!meta?.shared,modified:meta?.modified||'',editor:meta?.editor||''}};
 cache.set(id,value);if(cache.size>30)cache.delete(cache.keys().next().value);
 return value;
}
const words=text=>(String(text).match(/[\p{L}\p{N}]+/gu)||[]).length;
// The outline: headings with how many words each section holds (until the next heading of any level).
function outline(doc){
 const out=[];let current=null,lead=0;
 for(const b of doc.blocks){
  if(b.type==='heading'&&b.level>=1&&b.level<=6||b.tab){current={level:b.tab?1:b.level,text:b.text.slice(0,200),words:0};out.push(current);continue;}
  const n=b.type==='table'?words(b.rows.flat().join(' ')):words(b.text);
  if(current)current.words+=n;else lead+=n;
 }
 return {sections:out.slice(0,80),lead,total:words(doc.text)};
}
function notConnected(s,text){
 if(auth.mode(s.settings)==='service')return kit.reply(s,text,{by:BY,question:true,text:'Google Диск ещё не подключён: загрузите JSON-ключ сервисного аккаунта в «Настройки → Google Диск» и поделитесь с его адресом нужными файлами или папками. Потом повторите запрос.'});
 const accounts=auth.googleAccounts(s.settings);
 return kit.reply(s,text,{by:BY,question:true,text:accounts.length?'Аккаунт '+accounts.map(a=>a.email||a.label).join(', ')+' подключён только для почты. Откройте «Настройки → Google Диск» и нажмите «Разрешить чтение Диска», затем повторите запрос.':'Google Диск работает через аккаунт Google (как почта) или сервисный аккаунт. Подключите один из них в «Настройки → Google Диск», затем повторите запрос.'});
}
const filesWord=n=>n+' '+kit.plural(n,['файл','файла','файлов']);
const KIND_NAMES={document:'документы',spreadsheet:'таблицы',presentation:'презентации',pdf:'PDF',folder:'папки'};
// The last document this chat opened or asked about.
function lastDoc(s){
 const t=s.dialogue.active?.();
 for(const m of [...(t?.messages||[])].reverse()){const c=m.extensionData?.driveCard;if(c?.doc?.id&&workspace.FILE_ID.test(c.doc.id))return c.doc;}
 return null;
}

// --- Chat turns --------------------------------------------------------------------------------------------------
async function listTurn(s,text,{recent=false}={}){
 const q=spoken(text),client=clientFor(s);
 const searching=!recent&&q.words.length>0;
 s.requestProgress?.report?.(searching?'Ищу в Google Диске':'Смотрю Google Диск');
 const r=await client.list(searching
  ?{q:query({words:q.words.map(prefix),phrase:q.words.join(' '),kind:q.kind}),order:'modifiedTime desc',size:25}
  :{q:query({kind:q.kind,fullText:false}),order:'modifiedTime desc',size:20});
 let files=r.files;
 // Found by meaning in the local index too, when the user turned the Drive collection on.
 let meaning=0;
 if(searching&&(!q.kind||q.kind==='document')&&s.semanticIndex?.enabled?.(COLLECTION)){
  try{
   const hits=(await s.semanticIndex.search(COLLECTION,q.words.join(' '),{k:5}))?.hits||[];
   const extra=hits.filter(h=>workspace.FILE_ID.test(String(h.id))&&!files.some(f=>f.id===h.id)).map(h=>({id:h.id,name:String(h.meta?.title||'Документ').slice(0,300),kind:'document',mime:'application/vnd.google-apps.document',modified:String(h.meta?.modified||''),
    url:workspace.fileUrl('document',h.id),owner:String(h.meta?.owner||''),mine:false,shared:false,editor:'',size:0,meaning:true,piece:String(h.text||'').slice(0,240)}));
   meaning=extra.length;files=[...files,...extra];
  }catch{/* the word search answers alone */}
 }
 const what=q.kind?KIND_NAMES[q.kind]:'файлы';
 const reply=searching
  ?(files.length?'Нашёл в Google Диске по «'+q.words.join(' ')+'»: '+filesWord(files.length)+(meaning?' (из них '+meaning+' по смыслу)':'')+'. '+files.slice(0,3).map(f=>'«'+f.name+'»').join(', ')+(files.length>3?' и другие.':'.'):'В Google Диске ничего не нашёл по «'+q.words.join(' ')+'»'+(q.kind?' среди '+(q.kind==='pdf'?'PDF':KIND_NAMES[q.kind]):'')+'.')
  :(files.length?'Последние '+what+' в Google Диске: '+files.slice(0,3).map(f=>'«'+f.name+'»').join(', ')+(files.length>3?' и ещё '+(files.length-3)+'.':'.'):'В Google Диске нет '+(q.kind?KIND_NAMES[q.kind]:'файлов')+', доступных этому подключению.');
 return kit.reply(s,text,{by:BY,text:reply,data:{driveCard:{mode:'files',recent:!searching,query:searching?q.words.join(' '):'',kind:q.kind,files,more:!!r.next,who:auth.who(s.settings)}}});
}

async function readTurn(s,text,id){
 s.requestProgress?.report?.('Читаю Google Документ');
 const {doc,meta}=await loadDoc(s,id);
 const o=outline(doc);
 const list=P.passages(doc);
 const intro=list.slice(0,3).map(p=>p.text).join('\n\n').slice(0,700);
 const top=o.sections.filter(x=>x.level<=2).slice(0,6).map(x=>x.text);
 const reply='Документ «'+meta.title+'»: '+(o.sections.length?o.sections.length+' '+kit.plural(o.sections.length,['раздел','раздела','разделов'])+', ':'')+'около '+o.total+' '+kit.plural(o.total,['слова','слов','слов'])+'.'+(top.length?' Разделы: '+top.join(', ')+(o.sections.length>top.length?' и другие.':'.'):'')+' Спрашивайте: «по документу: …».';
 return kit.reply(s,text,{by:BY,text:reply,data:{driveCard:{mode:'doc',doc:meta,outline:o.sections,lead:o.lead,total:o.total,intro,truncated:doc.truncated,empty:!doc.text.trim()}}});
}

// A question about a document: retrieval in code, an answer from the model with word-for-word quotes, every quote
// checked against the text. Without a model (or without checked quotes) the card shows the matching places.
async function askTurn(s,text,id,question){
 s.requestProgress?.report?.('Читаю документ и ищу ответ');
 const {doc,meta}=await loadDoc(s,id);
 const list=P.passages(doc);
 const q=String(question||'').trim();
 if(!q)return kit.reply(s,text,{by:BY,question:true,text:'Что спросить у документа «'+meta.title+'»? Например: «по документу: какие сроки?».'});
 if(!list.length)return kit.reply(s,text,{by:BY,text:'В документе «'+meta.title+'» нет текста.',data:{driveCard:{mode:'answer',doc:meta,question:q,answer:'',quotes:[],state:'empty'}}});
 const {picked,score}=P.relevant(list,q);
 const best=[...score.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3).map(([n])=>list[n-1]).map(p=>({n:p.n,text:p.text.length>420?p.text.slice(0,419)+'…':p.text,path:p.path}));
 let answer='',quotes=[],state='places',found=null;
 const context=list.reduce((n,p)=>n+p.text.length,0)<14000?list:picked;
 if(s.settings.model&&context.length){
  const r=await kit.modelJSON(s,{system:'Ответь на вопрос только по фрагментам документа. Коротко, по-русски. Для каждого утверждения приведи дословную цитату из фрагмента (поле text — точный отрывок, без пересказа) и его номер n. Если во фрагментах ответа нет, found=false и пустой список цитат.',
   user:{document:meta.title,question:q,fragments:context.map(p=>({n:p.n,section:p.path,text:p.text}))},predict:700,temperature:0.1,
   schema:{type:'object',properties:{found:{type:'boolean'},answer:{type:'string'},quotes:{type:'array',maxItems:4,items:{type:'object',properties:{n:{type:'integer'},text:{type:'string'}},required:['n','text']}}},required:['found','answer','quotes']}}).catch(e=>{if(e?.name==='InputRequired')throw e;return null;});
  if(r){
   found=!!r.found;
   quotes=P.verify(list,r.quotes);
   if(found&&quotes.length){answer=String(r.answer||'').trim().slice(0,1500);state='answer';}
   else if(!found)state=score.size?'places':'none';
  }
 }
 if(state!=='answer'){quotes=best;if(!quotes.length)state='none';}
 const lead='«'+meta.title+'»';
 const reply=state==='answer'?answer+'\n\n'+quotes.slice(0,2).map(x=>'> '+x.text.replace(/\n+/g,' ')).join('\n')
  :state==='none'?'В документе '+lead+' не нашёл ничего про это.'
  :(found===false?'Прямого ответа в документе '+lead+' нет. Ближе всего:':found===true?'Ответ не подтвердился цитатой из документа '+lead+'. Вот места, где об этом говорится:':'Вот что в документе '+lead+' об этом:')+'\n\n'+quotes.slice(0,2).map(x=>'> '+x.text.replace(/\n+/g,' ')).join('\n');
 return kit.reply(s,text,{by:BY,text:reply,data:{driveCard:{mode:'answer',doc:meta,question:q,answer,quotes,state,model:!!s.settings.model}}});
}

async function fileTurn(s,text,link){
 s.requestProgress?.report?.('Открываю файл Google Диска');
 const f=await clientFor(s).get(link.id);
 if(f.kind==='document')return readTurn(s,text,f.id);
 const reply='«'+f.name+'»'+(f.owner||f.mine?', владелец — '+(f.mine?'вы':f.owner):'')+'.';
 return kit.reply(s,text,{by:BY,text:reply,data:{driveCard:{mode:'files',single:true,files:[f],query:'',kind:f.kind,recent:false,more:false,who:auth.who(s.settings)}}});
}

// A document by its title: «прочитай гугл док «План релиза»».
async function byTitle(s,text,resume){
 const name=/«([^»]{2,120})»|"([^"]{2,120})"/.exec(text);const title=(name?.[1]||name?.[2]||'').trim();
 const r=await clientFor(s).list({q:query({words:P.words(title).map(prefix).slice(0,8),kind:'document',fullText:false}),order:'modifiedTime desc',size:8});
 const exact=r.files.filter(f=>P.norm(f.name)===P.norm(title));
 const list=exact.length?exact:r.files;
 if(!list.length)return kit.reply(s,text,{by:BY,question:true,text:'В Google Диске нет документа «'+title+'». Пришлите ссылку на него или скажите название точнее.'});
 if(list.length===1)return resume(list[0]);
 return ask({text:'Какой документ открыть?',label:'Документ',options:list.slice(0,6).map(f=>f.name),strictChoices:false},answer=>{
  const link=workspace.parseLink(answer);if(link?.kind==='document')return resume({id:link.id});
  const f=list.find(x=>x.name.toLocaleLowerCase()===String(answer).trim().toLocaleLowerCase());
  if(!f)return {handled:true,question:true,text:'Такого документа нет среди найденных. Пришлите ссылку на него.'};
  return resume(f);
 });
}

// The text after «по документу:», «в документе …», or the question beside the link.
function questionOf(text,link){
 let t=String(text).replace(link?.url||/^$/,' ').replace(/https?:\/\/\S+/g,' ').replace(/\s+/g,' ').trim();
 t=t.replace(/^(?:а\s+)?(?:по\s+(?:этому\s+|тому\s+|гугл\s+|google\s+)?документу|спроси\s+(?:у\s+)?документ\p{L}*)\s*[:,—-]?\s*/iu,'').replace(/^в\s+(?:этом\s+|том\s+)?документе\s*[:,—-]?\s*/iu,'');
 t=t.replace(/^.*?(?:гугл|google)[\s-]*(?:док\p{L}*|docs)\s*«[^»]*»\s*[:,—-]?\s*/iu,'');
 return t.replace(/^(?:а|и|скажи|ответь|подскажи)[,\s]+/iu,'').trim();
}

async function saveTurn(s,text,{draft}={}){
 let source=draft;
 if(!source){
  const t=s.dialogue.active?.();
  const last=[...(t?.messages||[])].reverse().find(m=>m.role==='assistant'&&String(m.text||'').trim()&&!m.error&&!m.extensionData?.driveCard);
  if(!last)return kit.reply(s,text,{by:BY,question:true,text:'Нечего сохранять: в этом чате ещё нет ответа Пети. Спросите о чём-нибудь, затем скажите «сохрани это в Google Docs».'});
  const body=String(last.text).trim();
  source={title:'',text:body.slice(0,drafts.MAX_TEXT),truncated:body.length>drafts.MAX_TEXT,app:last.by&&last.by!==BY?String(last.by).slice(0,60):''};
 }
 const blocks=md.blocks(source.text);
 const title=(source.title||md.title(source.text)).slice(0,200);
 const canCreate=auth.mode(s.settings)==='account';
 const writable=auth.writable(s.settings);
 const reply='Документ «'+title+'» готов к созданию: '+source.text.length+' '+kit.plural(source.text.length,['символ','символа','символов'])+'. '+(canCreate?writable?'Проверьте название и нажмите «Создать документ».':'Сначала включите «Разрешить создавать документы» в «Настройки → Google Диск», затем нажмите «Создать документ».':'Сервисный аккаунт не может создать документ в вашем Диске — подключите аккаунт Google в настройках «Google Диск».');
 return kit.reply(s,text,{by:BY,text:reply,data:{driveCard:{mode:'save',draftId:randomUUID(),title,text:source.text,truncated:!!source.truncated,app:source.app||'',preview:blocks.slice(0,60),
  sections:blocks.filter(b=>b.type==='heading').length,canCreate,writable,who:auth.who(s.settings)}}});
}

async function run(s,text,kind){
 if(kind==='export'){
  const draft=drafts.take(EXPORT.exec(text)?.[1]);
  if(!draft)return kit.reply(s,text,{by:BY,error:true,text:'Текст для этого документа устарел. Нажмите «Сохранить в Google Документы» в карточке ещё раз.'});
  return saveTurn(s,text,{draft});
 }
 if(kind==='save')return saveTurn(s,text);
 if(kind==='recent')return listTurn(s,text,{recent:true});
 if(kind==='find')return listTurn(s,text);
 const link=workspace.parseLink(text);
 if(kind==='read')return readTurn(s,text,link.id);
 if(kind==='ask')return askTurn(s,text,link.id,questionOf(text,link));
 if(kind==='file')return fileTurn(s,text,link);
 if(kind==='read-title')return byTitle(s,text,f=>readTurn(s,text,f.id));
 if(kind==='ask-title')return byTitle(s,text,f=>askTurn(s,text,f.id,questionOf(text)));
 if(kind==='about'){const doc=lastDoc(s);return askTurn(s,text,doc.id,questionOf(text));}
 return null;
}
async function turn(s,command){
 const text=String(command||'');
 let kind=intent(text);
 // A follow-up about a document only while this chat has one open.
 if(kind==='about'&&!lastDoc(s))kind=null;
 if(!kind||!kit.installed(s,ID))return null;
 if(!auth.connected(s.settings))return notConnected(s,text);
 try{return await run(s,text,kind);}
 // Drive errors are already told in the user's words (client.explain); other failures go through the shared classifier.
 catch(e){if(e?.name==='InputRequired')throw e;return e.status?kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,text,BY,e);}
}

// --- Setup: card actions, consent, settings, index switch --------------------------------------------------------------
const logins=new Set();
function setup(s,{now=()=>Date.now(),poll=1000}={}){
 let operation=null,watching=null;
 const busy=new Set();
 function publish(text,{busy:working=false,kind='info',id=NOTICE,title='Google Диск'}={}){operation={id,title,text,busy:working,kind};try{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',operation);}catch{/* window closed */}}
 // Card data lives in the chat message: the write uses the text Petya stored there, not what the page sends.
 function locate(draftId){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.driveCard;if(card?.draftId&&card.draftId===draftId)return card;}
  return null;
 }
 const ready=()=>kit.installed(s,ID)&&auth.connected(s.settings);
 // «Создать документ»: once per card; a write whose outcome is unknown is never repeated blindly.
 async function save(draftId,title){
  if(typeof draftId!=='string'||!draftId)throw Error('Нет данных карточки.');
  const card=locate(draftId);if(!card||card.mode!=='save')throw Error('Карточка устарела или удалена. Повторите запрос в чате.');
  if(card.done)return {done:card.done,already:true};
  if(card.unknown)throw Error('Не знаю, создался ли документ в прошлый раз (Google не ответил). Проверьте Google Диск, прежде чем повторять.');
  if(busy.has(draftId))throw Error('Уже создаю документ.');
  if(!ready())throw Error('Google Диск не подключён.');
  if(auth.mode(s.settings)!=='account')throw Error('Сервисный аккаунт создаёт документы в своём Диске, вы их не увидите. Подключите аккаунт Google в настройках «Google Диск».');
  if(!auth.writable(s.settings))return {settings:'google-drive',text:'Включите «Разрешить создавать документы» в настройках «Google Диск» и нажмите «Создать документ» ещё раз.'};
  const name=String(title??'').replace(/\s+/g,' ').trim().slice(0,200)||card.title;
  busy.add(draftId);
  publish('Создаю документ «'+name+'» в Google Диске…',{busy:true,id:NOTICE+'-save'});
  try{
   const made=await clientFor(s,{write:true}).createDoc(name,md.html(name,md.blocks(card.text)));
   card.done={...made,at:new Date(now()).toISOString()};card.title=name;s.dialogue.persist?.();
   publish('Документ «'+made.title+'» создан в Google Диске.',{kind:'success',id:NOTICE+'-save'});
   return {done:card.done};
  }catch(e){
   if(e.unknown){card.unknown=true;s.dialogue.persist?.();}
   publish(e.message,{kind:'error',id:NOTICE+'-save'});throw e;
  }finally{busy.delete(draftId);}
 }
 // Incremental consent through the shared Google connection: reading (Drive and Docs) first; drive.file only after
 // «Разрешить создавать документы» is on.
 async function connect(key,write=false){
  watching?.stop();logins.delete(watching);
  const account=key?auth.googleAccounts(s.settings).find(a=>a.key===key):null;
  watching=await workspace.consent(s,write?auth.WRITE:auth.READ,{account:key||'',write:!!write,poll,now,onDone:r=>{
   logins.delete(watching);watching=null;
   if(!r.ok)publish(r.error,{kind:'error'});
   else{publish('Google Диск: '+(write?'создание документов':'чтение Диска и Документов')+' для '+(r.account.email||'аккаунта')+' разрешено.',{kind:'success'});if(!s.settings.googleDriveAccount)s.saveSettings?.({googleDriveAccount:r.account.key});}
  }});
  logins.add(watching);
  publish('Подтвердите доступ к Google Диску в браузере'+(account?.email?' для '+account.email:'')+'.',{busy:true});
  return status();
 }
 function indexState(){
  const ix=s.semanticIndex;if(!ix)return {available:false,enabled:false,items:0};
  let row=null;try{row=(ix.collections?.()||[]).find(c=>c.id===COLLECTION)||null;}catch{row=null;}
  return {available:true,enabled:!!ix.enabled?.(COLLECTION),items:Number(row?.items)||0,error:String(row?.error||''),collects:require('./collection.cjs').collects};
 }
 function status(){
  return {added:kit.installed(s,ID),mode:auth.mode(s.settings),write:auth.wantsWrite(s.settings),writable:auth.writable(s.settings),connected:auth.connected(s.settings),
   accounts:auth.googleAccounts(s.settings).map(({key,email,label,read,write})=>({key,email,label,read,write})),chosen:auth.chosen(s.settings)?.key||'',configured:workspace.configured(s),
   hasKey:!!s.settings.googleDriveCredential,serviceEmail:auth.serviceEmail(s.settings),index:indexState(),operation};
 }
 const ipc={
  status,connect,save,
  cancel(){watching?.stop();watching=null;s.mailAccounts?.google?.login?.stop?.();publish('Подключение отменено.');return status();},
  saveKey(text){if(typeof text!=='string'||text.length>20000)throw Error('Выберите JSON ключ сервисного аккаунта Google.');const key=workspace.parseKey(text);s.saveSettings({googleDriveCredential:JSON.stringify(key)},true);return status();},
  clearKey(){s.saveSettings({clear_googleDriveCredential:true},true);return status();},
  // The user's opt-in for search by meaning over Drive documents (off by default).
  async setIndex(on){
   if(!s.semanticIndex)throw Error('Поиск по смыслу недоступен в этой версии Пети.');
   if(on&&!ready())throw Error('Сначала подключите Google Диск.');
   await s.semanticIndex.enable(COLLECTION,on===true);
   return status();
  },
  // Deletes this collection's vectors and texts (the documents themselves stay) and switches it off.
  async wipeIndex(){if(!s.semanticIndex)throw Error('Поиск по смыслу недоступен в этой версии Пети.');await s.semanticIndex.wipe(COLLECTION);return status();}
 };
 const service={ready,who:()=>auth.who(s.settings),parseLink:workspace.parseLink,
  // Files for another app: name and full-text search, newest first when only a kind is asked.
  async search(text,{kind='',size=10}={}){const w=P.words(text).slice(0,8);return (await clientFor(s).list({q:query({words:w.map(prefix),phrase:w.join(' '),kind}),order:'modifiedTime desc',size})).files;},
  async document(id){const {doc,meta}=await loadDoc(s,String(id||''));return {...meta,blocks:doc.blocks,text:doc.text,truncated:doc.truncated};}};
 return {googleDrive:service,ipc};
}

function validate(next){
 if(next.googleDriveAuth!==undefined&&!['account','service'].includes(next.googleDriveAuth))throw Error('Способ входа Google Диска: аккаунт Google или сервисный аккаунт.');
 if(next.googleDriveWrite!==undefined&&!['true','false'].includes(String(next.googleDriveWrite)))throw Error('Создание документов в Google Диске: да или нет.');
 if(next.googleDriveAccount!==undefined&&next.googleDriveAccount!==''&&!/^google:[\w-]{1,80}$/.test(next.googleDriveAccount))throw Error('Некорректный аккаунт Google.');
}
// Dashboards repeat read-only requests only: recent files and searches.
const dashboard={accepts:command=>['recent','find'].includes(intent(command)),size:'m',widgets:[{title:'Недавние файлы Google Диска',command:'последние файлы в гугл диске'}]};
module.exports={name:'googleDrive',defaults:{['extension_'+ID]:'false',googleDriveAuth:'account',googleDriveWrite:'false',googleDriveAccount:'',googleDriveCredential:''},
 secrets:['googleDriveCredential'],validate,setup,turn,intent,spoken,questionOf,outline,dashboard,connected:auth.connected,teardown(){cache.clear();for(const w of logins)w.stop();logins.clear();}};
