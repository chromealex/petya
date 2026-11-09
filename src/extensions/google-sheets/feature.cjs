// «Google Таблицы»: a spreadsheet in the chat. A pasted link (spreadsheetId + gid) or a spoken name of a known
// spreadsheet or tab («что в таблице баланса», «покажи лист Юниты») opens the tab as a table card; «найди в таблице
// лучника» searches every tab; «добавь строку в таблицу …» prepares a row; other apps' cards hand tables over for
// «Выгрузить в Google Таблицы» (kind `spreadsheet-export`). Reading and searching are code; the model only helps
// to put a free-text row into columns. Every write (append, export, cell updates for «Конфиги и баланс») happens
// only on a card button, after a preview of the exact cells, and re-checks that the cells did not change meanwhile.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const {SheetsClient,parseUrl,sheetUrl,range,quote,cell,ID:SHEET_ID}=require('./client.cjs');
const auth=require('./auth.cjs');
const workspace=require('../../google-workspace.cjs');
const table=require('./table.cjs');
const exportsStore=require('./exports.cjs');
const {randomUUID}=require('node:crypto');
const ID='google-sheets',BY='Google Таблицы',NOTICE='google-sheets';
const MAX_KNOWN=30,FIND_TABS=12,FIND_ROWS=1000,FIND_COLS=40;

// --- Routing ---------------------------------------------------------------------------------------------------
// Neighbours: «Конфиги и баланс» (reconciling a sheet with game configs), localization tables, Excel/CSV files,
// tables the model draws in its answer, leaderboards and the multiplication table.
const TABLE='(?:(?:гугл|google)[\\s-]*)?таблиц\\p{L}*';
const GOOGLE=/(?:гугл|google)[\s-]*(?:таблиц\p{L}*|sheets?|шит\p{L}*)|(?:^|[^\p{L}])spreadsheets?(?=$|[^\p{L}])/iu;
const OPEN=new RegExp('(?:что|покажи|открой|выведи|какие\\s+данные)\\s+(?:у\\s+нас\\s+)?(?:в|из)\\s+'+TABLE+'|(?:покажи|открой)\\s+'+TABLE,'iu');
// «покажи лист Юниты»: a tab is named with a capital letter or in quotes («лист ожидания» is not a tab).
const TAB=/(?:^|\s)[Пп]окажи\s+(?:[Лл]ист|[Вв]кладк\p{L}*)\s+(?:[«"']|\p{Lu})|(?:^|\s)[Оо]ткрой\s+(?:[Лл]ист|[Вв]кладк\p{L}*)\s+(?:[«"']|\p{Lu})/u;
const FIND=new RegExp('(?:найди|поищи|отыщи)\\s+(?:в\\s+'+TABLE+'|[^.?!]{1,60}?\\s+в\\s+'+TABLE+')|где\\s+в\\s+'+TABLE,'iu');
const APPEND=new RegExp('(?:добавь|допиши|внеси|запиши)\\s+(?:нов\\p{L}*\\s+)?(?:строк\\p{L}*|запис\\p{L}*|ряд)\\s+(?:в\\s+'+TABLE+'|в\\s+лист)','iu');
const EXPORT=/(?:выгрузи|экспортируй)\p{L}*\s+в\s+(?:гугл|google)[\s-]*таблиц\p{L}*[^#]*#([a-f0-9]{8})/iu;
const AVOID=/конфиг|свер(?:ь|ить|ка)|расхожд|в\s+игре\s+не\s+как|(?:поменял|изменил)\p{L}*\s+в\s+баланс|локализ|перевод|таблиц\p{L}*\s+(?:умножени|лидер|рекорд)|сравнительн\p{L}*\s+таблиц|(?:составь|сделай|нарисуй|построй|оформи)\s+(?:мне\s+)?(?:в\s+виде\s+)?таблиц|в\s+виде\s+таблиц|(?:^|[^\p{L}])(?:excel|xlsx|csv)(?=$|[^\p{L}])|эксел/iu;
function intent(text){
 const t=String(text||'').trim();if(!t||t.length>2000)return null;
 if(EXPORT.test(t))return 'export';
 const url=parseUrl(t);
 if(AVOID.test(t)&&!url)return null;
 if(APPEND.test(t))return 'append';
 if(FIND.test(t))return 'find';
 if(url||OPEN.test(t)||TAB.test(t)||GOOGLE.test(t))return 'open';
 return null;
}

// --- Known spreadsheets (remembered when opened; listed in settings) -----------------------------------------------
function known(settings){
 let list=[];try{list=JSON.parse(settings.googleSheetsKnown||'[]');}catch{list=[];}
 return (Array.isArray(list)?list:[]).filter(x=>SHEET_ID.test(String(x?.id||''))).map(x=>({id:x.id,title:String(x.title||'').slice(0,200),sheets:(Array.isArray(x.sheets)?x.sheets:[]).slice(0,60).map(t=>({id:Number(t?.id)||0,title:String(t?.title||'').slice(0,100)})),at:Number(x.at)||0}));
}
function remember(s,meta){
 const list=known(s.settings).filter(x=>x.id!==meta.id);
 list.unshift({id:meta.id,title:meta.title,sheets:meta.sheets.map(t=>({id:t.id,title:t.title})),at:Date.now()});
 try{s.saveSettings?.({googleSheetsKnown:JSON.stringify(list.slice(0,MAX_KNOWN))});}catch{/* remembering is a convenience */}
}
// Spoken words → a known spreadsheet and tab. Words used for the name are reported so the rest is the query.
const FILLER=/^(?:что|покажи|открой|выведи|найди|поищи|отыщи|где|добавь|допиши|внеси|запиши|в|во|из|на|у|нас|мне|по|про|и|с|лист\p{L}*|вкладк\p{L}*|таблиц\p{L}*|гугл|google|sheets?|шит\p{L}*|строк\p{L}*|запис\p{L}*|ряд|нов\p{L}*|какие|данные|есть|там|это|эту|этот|пожалуйста|петя)$/iu;
function spokenWords(text){return table.words(String(text).replace(/https?:\/\/\S+/g,' ').replace(/:.*$/s,' ')).filter(w=>!FILLER.test(w));}
function lookup(list,spoken){
 let best=null;
 for(const x of list){
  const title=table.nameScore(spoken.join(' '),x.title);
  let tab=null,tabScore=0;for(const t of x.sheets){const sc=table.nameScore(spoken.join(' '),t.title);if(sc>tabScore){tabScore=sc;tab=t;}}
  const score=Math.max(title,tabScore);
  if(score>=0.5&&(!best||score>best.score||score===best.score&&x.at>best.item.at))best={item:x,score,tab:tabScore>=0.5?tab:null,used:[x.title,tabScore>=0.5?tab.title:''].join(' ')};
 }
 return best;
}
// Which spreadsheet and tab a request means: a link, a known name, the only known one, or a question.
function target(s,text,{allowRecent=false}={}){
 const url=parseUrl(text);
 if(url)return {id:url.id,gid:url.gid,spoken:spokenWords(text)};
 const list=known(s.settings).sort((a,b)=>b.at-a.at),spoken=spokenWords(text);
 if(!list.length)return {missing:true};
 const hit=lookup(list,spoken);
 if(hit){const used=table.words(hit.used).map(table.stem);return {id:hit.item.id,sheetTitle:hit.tab?.title||'',spoken:spoken.filter(w=>!used.some(u=>u.length>=3&&table.stem(w).startsWith(u.slice(0,Math.max(3,u.length-1)))))};}
 if(list.length===1||allowRecent||!spoken.length)return {id:list[0].id,spoken};
 return {choose:list};
}

// --- Chat turns --------------------------------------------------------------------------------------------------
const rowsWord=n=>n+' '+kit.plural(n,['строка','строки','строк']);
const clientFor=(s,{write=false}={})=>new SheetsClient({request:(url,o)=>s.request(url,o),token:()=>auth.token(s,{write})});
function pickSheet(meta,{gid,sheetTitle,spoken=[]}){
 const visible=meta.sheets.filter(t=>!t.hidden);
 if(Number.isInteger(gid)){const t=meta.sheets.find(x=>x.id===gid);if(t)return t;}
 if(sheetTitle){const t=meta.sheets.find(x=>x.title===sheetTitle);if(t)return t;}
 let best=null,score=0;for(const t of meta.sheets){const sc=table.nameScore(spoken.join(' '),t.title);if(sc>score){score=sc;best=t;}}
 if(best&&score>=0.5)return best;
 return visible[0]||meta.sheets[0]||null;
}
async function loadSheet(client,meta,sheet){
 const rows=Math.max(1,Math.min(sheet.rows||table.MAX_ROWS,table.MAX_ROWS)),cols=Math.max(1,Math.min(sheet.cols||table.MAX_COLS,table.MAX_COLS));
 const a1=range(sheet.title,0,0,rows-1,cols-1);
 const [formatted,raw]=await Promise.all([client.values(meta.id,a1,'FORMATTED_VALUE'),client.values(meta.id,a1,'UNFORMATTED_VALUE')]);
 const g=table.grid(formatted,raw);
 const head=table.header(g.text,g.numbers,{frozen:sheet.frozenRows});
 return {sheet:{id:sheet.id,title:sheet.title,rows:sheet.rows,cols:sheet.cols},header:head,text:g.text,numbers:g.numbers,numeric:table.numericColumns(g.text,g.numbers,head),
  frozenCols:sheet.frozenCols||0,truncated:(sheet.rows||0)>table.MAX_ROWS||(sheet.cols||0)>table.MAX_COLS,url:sheetUrl(meta.id,sheet.id)};
}
const tabs=meta=>meta.sheets.filter(t=>!t.hidden).map(t=>({id:t.id,title:t.title,rows:t.rows}));
function notConnected(s,text){
 if(auth.mode(s.settings)==='service')return kit.reply(s,text,{by:BY,question:true,text:'Google Таблицы ещё не подключены: загрузите JSON-ключ сервисного аккаунта в «Настройки → Google Таблицы» и поделитесь таблицей с его адресом. Потом повторите запрос.'});
 const accounts=auth.googleAccounts(s.settings);
 return kit.reply(s,text,{by:BY,question:true,text:accounts.length?'Аккаунт '+accounts.map(a=>a.email||a.label).join(', ')+' подключён только для почты. Откройте «Настройки → Google Таблицы» и нажмите «Разрешить чтение таблиц», затем повторите запрос.':'Google Таблицы работают через аккаунт Google (как почта) или сервисный аккаунт. Подключите один из них в «Настройки → Google Таблицы», затем повторите запрос.'});
}
function chooseSpreadsheet(s,text,list,resume){
 return ask({text:'Какую таблицу открыть? Можно и прислать ссылку на другую.',label:'Таблица',options:list.slice(0,8).map(x=>x.title),strictChoices:false},answer=>{
  const url=parseUrl(answer);if(url)return resume({id:url.id,gid:url.gid,spoken:[]});
  const x=list.find(i=>i.title.toLocaleLowerCase()===String(answer).trim().toLocaleLowerCase())||lookup(list,table.words(answer))?.item;
  if(!x)return {handled:true,text:'Такой таблицы нет среди известных. Пришлите ссылку на неё.',question:true};
  return resume({id:x.id,spoken:[]});
 });
}
const askLink=(s,text)=>kit.reply(s,text,{by:BY,question:true,text:'Пришлите ссылку на таблицу Google (docs.google.com/spreadsheets/…). Петя запомнит её, и потом её можно будет звать по названию.'});

async function openTurn(s,text,where){
 const client=clientFor(s);
 s.requestProgress?.report?.('Читаю Google Таблицу');
 const meta=await client.meta(where.id);remember(s,meta);
 const sheet=pickSheet(meta,where);if(!sheet)return kit.reply(s,text,{by:BY,error:true,text:'В таблице «'+meta.title+'» нет листов с ячейками.'});
 const data=await loadSheet(client,meta,sheet);
 const body=data.text.length-(data.header+1);
 const heads=data.header>=0?data.text[data.header].filter(Boolean):[];
 const reply='Таблица «'+meta.title+'», лист «'+sheet.title+'»: '+(body>0?rowsWord(body):'пусто')+(heads.length?', столбцы: '+heads.slice(0,8).join(', ')+(heads.length>8?' и ещё '+(heads.length-8):''):'')+'.'+(data.truncated?' В карточке первые '+table.MAX_ROWS+' строк и '+table.MAX_COLS+' столбцов.':'');
 return kit.reply(s,text,{by:BY,text:reply,data:{sheetsCard:{mode:'sheet',spreadsheetId:meta.id,title:meta.title,url:data.url,tabs:tabs(meta),writable:auth.writable(s.settings),...data}}});
}

// Query words of «найди в таблице баланса лучника»: what is left after the spreadsheet's name and the filler.
async function findTurn(s,text,where){
 const query=where.spoken.join(' ').trim();
 if(!query)return kit.reply(s,text,{by:BY,question:true,text:'Что найти в таблице? Скажите слово или значение, например «найди в таблице лучника».'});
 const client=clientFor(s);
 s.requestProgress?.report?.('Ищу в Google Таблице');
 const meta=await client.meta(where.id);remember(s,meta);
 const list=meta.sheets.filter(t=>!t.hidden).slice(0,FIND_TABS);
 const values=await client.batchGet(meta.id,list.map(t=>range(t.title,0,0,Math.max(1,Math.min(t.rows||FIND_ROWS,FIND_ROWS))-1,Math.max(1,Math.min(t.cols||FIND_COLS,FIND_COLS))-1)),'FORMATTED_VALUE');
 const found=[];
 list.forEach((t,i)=>{
  const g=table.grid(values[i]||[],[],{rows:FIND_ROWS,cols:FIND_COLS});const head=table.header(g.text,g.numbers,{frozen:t.frozenRows});
  for(const m of table.search(g.text,query,{head,limit:50-found.length})){
   const labels=head>=0?g.text[head]:[];
   found.push({sheet:t.title,gid:t.id,cell:cell(m.row,m.col),row:m.row+1,col:m.col,value:m.value,
    fields:g.text[m.row].map((v,c)=>({label:labels[c]||'',value:v})).filter(f=>f.value!=='').slice(0,12)});
  }
 });
 const sheets=[...new Set(found.map(f=>f.sheet))];
 const reply=found.length?'«'+query+'» в таблице «'+meta.title+'»: '+found.length+' '+kit.plural(found.length,['совпадение','совпадения','совпадений'])+' на '+(sheets.length===1?'листе «'+sheets[0]+'»':sheets.length+' '+kit.plural(sheets.length,['листе','листах','листах']))+'.':'В таблице «'+meta.title+'» ничего не нашёл по «'+query+'»'+(meta.sheets.length>FIND_TABS?' (смотрел первые '+FIND_TABS+' листов)':'')+'.';
 return kit.reply(s,text,{by:BY,text:reply,data:{sheetsCard:{mode:'find',spreadsheetId:meta.id,title:meta.title,url:sheetUrl(meta.id),query,matches:found,searched:list.length}}});
}

// The row's values: «: Маг; 15; 80», «: Маг, 15, 80» or «Урон=15, Имя=Маг»; free text goes through the model.
function parseValues(text,labels){
 const after=/:\s*(.+)$/s.exec(String(text).replace(/https?:\/\/\S+/g,''))?.[1]?.trim();if(!after)return null;
 const parts=(after.includes(';')?after.split(';'):after.split(',')).map(x=>x.trim());
 const pairs=parts.map(p=>/^([^=]{1,60})=\s*(.*)$/.exec(p));
 if(pairs.every(Boolean)&&labels.length){
  const out=Array(labels.length).fill('');let used=0;
  for(const [,name,value] of pairs){const i=labels.findIndex(l=>l&&table.nameScore(name,l)>=0.5);if(i>=0){out[i]=value.trim();used++;}}
  return used?out:null;
 }
 return parts;
}
const NUM=/^-?\d+(?:[.,]\d+)?$/;
const typed=(v,numeric)=>numeric&&NUM.test(String(v).trim())?Number(String(v).trim().replace(',','.')):String(v??'');
async function appendTurn(s,text,where){
 if(!auth.writable(s.settings))return kit.reply(s,text,{by:BY,question:true,text:'Запись в Google Таблицы выключена. Включите «Разрешить запись» в «Настройки → Google Таблицы» (Петя попросит у Google разрешение на запись), затем повторите запрос.'});
 const client=clientFor(s);
 s.requestProgress?.report?.('Читаю столбцы таблицы');
 const meta=await client.meta(where.id);remember(s,meta);
 const sheet=pickSheet(meta,where);if(!sheet)return kit.reply(s,text,{by:BY,error:true,text:'В таблице «'+meta.title+'» нет листов с ячейками.'});
 const data=await loadSheet(client,meta,sheet);
 const labels=data.header>=0?data.text[data.header]:[];
 let values=parseValues(text,labels);
 if(!values&&s.settings.model&&labels.length){
  const after=String(text).replace(/https?:\/\/\S+/g,'').trim();
  const r=await kit.modelJSON(s,{system:'Разложи данные новой строки таблицы по столбцам. Только значения из запроса, без выдумок; пустая строка, если значения нет.',user:{columns:labels,request:after},
   schema:{type:'object',properties:{values:{type:'array',items:{type:'string'},maxItems:labels.length}},required:['values']}}).catch(()=>null);
  // A value the request does not contain is dropped rather than written.
  if(r?.values?.length)values=r.values.map(v=>String(v||'').trim()).map(v=>v&&after.toLocaleLowerCase().includes(v.toLocaleLowerCase())?v:'');
  if(values&&!values.some(Boolean))values=null;
 }
 if(!values)return kit.reply(s,text,{by:BY,question:true,text:'Какие значения добавить? Напишите после двоеточия через «;» в порядке столбцов'+(labels.filter(Boolean).length?' ('+labels.filter(Boolean).join('; ')+')':'')+' или парами «Столбец=значение».'});
 const width=Math.max(labels.length,values.length);
 const row=Array.from({length:width},(_,i)=>typed(values[i]??'',data.numeric[i]));
 const draftId=randomUUID();
 const reply='Добавлю в «'+meta.title+'», лист «'+sheet.title+'», строку: '+row.map((v,i)=>(labels[i]?labels[i]+' — ':'')+(v===''?'пусто':v)).join(', ')+'. Проверьте и нажмите «Добавить строку».';
 return kit.reply(s,text,{by:BY,text:reply,data:{sheetsCard:{mode:'append',draftId,spreadsheetId:meta.id,title:meta.title,url:data.url,sheet:{id:sheet.id,title:sheet.title},labels,row,numeric:data.numeric,
  last:data.text.slice(Math.max(data.header+1,data.text.length-3))}}});
}

async function exportTurn(s,text){
 const id=EXPORT.exec(text)?.[1];
 const draft=exportsStore.take(id);
 if(!draft)return kit.reply(s,text,{by:BY,error:true,text:'Данные для этой выгрузки устарели. Нажмите «Выгрузить в Google Таблицы» в карточке ещё раз.'});
 if(!auth.writable(s.settings))return kit.reply(s,text,{by:BY,question:true,text:'Чтобы выгружать, включите «Разрешить запись» в «Настройки → Google Таблицы», затем нажмите «Выгрузить» в карточке ещё раз.'});
 const reply='Готово к выгрузке: «'+draft.title+'», '+rowsWord(draft.total)+(draft.truncated?' (выгружу первые '+exportsStore.MAX_ROWS+')':'')+'. Выберите, куда, и нажмите «Выгрузить».';
 return kit.reply(s,text,{by:BY,text:reply,data:{sheetsCard:{mode:'export',draftId:randomUUID(),title:draft.title,sheetName:draft.sheet,app:draft.app,header:draft.header,rows:draft.rows,total:draft.total,truncated:draft.truncated,
  canCreate:auth.mode(s.settings)==='account',known:known(s.settings).slice(0,12).map(x=>({id:x.id,title:x.title,sheets:x.sheets.map(t=>t.title)}))}}});
}

async function run(s,text,kind){
 if(kind==='export')return exportTurn(s,text);
 const where=target(s,text,{allowRecent:kind==='find'});
 if(where.missing)return askLink(s,text);
 const go=w=>kind==='find'?findTurn(s,text,w):kind==='append'?appendTurn(s,text,w):openTurn(s,text,w);
 if(where.choose)return chooseSpreadsheet(s,text,where.choose,w=>go({...w,spoken:where.spoken||[]}));
 return go(where);
}
async function turn(s,command){
 const text=String(command||'');
 const kind=intent(text);
 if(!kind||!kit.installed(s,ID))return null;
 if(!auth.connected(s.settings))return notConnected(s,text);
 try{return await run(s,text,kind);}
 // Sheets errors are already told in the user's words (client.explain); other failures go through the shared classifier.
 catch(e){if(e?.name==='InputRequired')throw e;return e.status?kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,text,BY,e);}
}

// --- Setup: card actions, consent, settings, the service other apps use ---------------------------------------------
function setup(s,{now=()=>Date.now(),poll=1000}={}){
 let operation=null,watching=null;
 const busy=new Set();
 function publish(text,{busy:working=false,kind='info',id=NOTICE,title='Google Таблицы'}={}){operation={id,title,text,busy:working,kind};try{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',operation);}catch{/* window closed */}}
 // Card data lives in the chat message: writes use what Petya stored there, not what the page sends.
 function locate(draftId){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.sheetsCard;if(card?.draftId&&card.draftId===draftId)return card;}
  return null;
 }
 const ready=()=>kit.installed(s,ID)&&auth.connected(s.settings);
 async function guarded(draftId,fn){
  if(typeof draftId!=='string'||!draftId)throw Error('Нет данных карточки.');
  const card=locate(draftId);if(!card)throw Error('Карточка устарела или удалена. Повторите запрос в чате.');
  if(card.done)return {done:card.done,already:true};
  if(card.unknown)throw Error('Не знаю, записалось ли в прошлый раз (Google не ответил). Откройте таблицу и проверьте, прежде чем повторять.');
  if(busy.has(draftId))throw Error('Уже записываю.');
  if(!ready())throw Error('Google Таблицы не подключены.');
  if(!auth.writable(s.settings))throw Error('Запись в Google Таблицы выключена в настройках.');
  busy.add(draftId);
  try{const done=await fn(card);card.done={...done,at:new Date(now()).toISOString()};s.dialogue.persist?.();return {done:card.done};}
  catch(e){if(e.unknown){card.unknown=true;s.dialogue.persist?.();}throw e;}
  finally{busy.delete(draftId);}
 }
 // Cells as they are now: a write goes ahead only if every cell still holds what the preview showed.
 const same=(a,b)=>{const x=a===undefined||a===null?'':a,y=b===undefined||b===null?'':b;if(typeof x==='number'||typeof y==='number'){const p=Number(x),q=Number(y);if(String(x).trim()!==''&&String(y).trim()!==''&&Number.isFinite(p)&&Number.isFinite(q))return Math.abs(p-q)<=1e-9*Math.max(1,Math.abs(p));}return String(x).trim()===String(y).trim();};
 async function applyUpdate({spreadsheetId,changes}){
  if(!SHEET_ID.test(String(spreadsheetId||'')))throw Error('Неверный ID таблицы.');
  const list=(Array.isArray(changes)?changes:[]).slice(0,500).filter(c=>typeof c?.sheet==='string'&&Number.isInteger(c.row)&&Number.isInteger(c.col)&&c.row>=0&&c.col>=0);
  if(!list.length)throw Error('Нечего записывать.');
  if(!ready()||!auth.writable(s.settings))throw Error('Запись в Google Таблицы выключена в настройках.');
  const client=clientFor(s,{write:true});
  const current=await client.batchGet(spreadsheetId,list.map(c=>range(c.sheet,c.row,c.col)),'UNFORMATTED_VALUE');
  const moved=list.filter((c,i)=>!same(current[i]?.[0]?.[0],c.old));
  if(moved.length)throw Object.assign(Error('Ячейки изменились после проверки: '+moved.slice(0,5).map(c=>c.sheet+'!'+cell(c.row,c.col)).join(', ')+'. Сверьте заново.'),{stale:true});
  const r=await client.update(spreadsheetId,list.map(c=>({range:range(c.sheet,c.row,c.col),values:[[c.new]]})));
  return {cells:r.cells||list.length,url:sheetUrl(spreadsheetId)};
 }
 async function sheet(spreadsheetId,title){
  if(!ready())throw Error('Google Таблицы не подключены.');
  const client=clientFor(s);const meta=await client.meta(String(spreadsheetId||''));
  const t=meta.sheets.find(x=>x.title===title);if(!t)throw Error('Такого листа больше нет.');
  return {spreadsheetId:meta.id,title:meta.title,tabs:tabs(meta),writable:auth.writable(s.settings),...await loadSheet(client,meta,t)};
 }
 async function append(draftId){
  return guarded(draftId,async card=>{
   const r=await clientFor(s,{write:true}).append(card.spreadsheetId,quote(card.sheet.title)+'!A1',[card.row]);
   return {range:r.range,url:card.url};
  });
 }
 // Where an export can go: a new spreadsheet (own account only — a service account's files are invisible to the
 // user) or a tab of a known spreadsheet (new or existing).
 function exportTargets(){return {canCreate:auth.mode(s.settings)==='account',known:known(s.settings).slice(0,12).map(x=>({id:x.id,title:x.title,sheets:x.sheets.map(t=>t.title)}))};}
 const block=card=>[...card.header?.some(Boolean)?[card.header]:[],...card.rows];
 function checkTarget(t){
  if(t?.kind==='new')return {kind:'new'};
  const url=parseUrl(t?.link||'');const id=url?.id||String(t?.spreadsheetId||'');
  if(!SHEET_ID.test(id))throw Error('Выберите таблицу или вставьте ссылку на неё.');
  const sheetName=String(t?.sheet||'').trim().slice(0,100);
  return {kind:t?.kind==='existing'?'existing':'tab',spreadsheetId:id,sheet:sheetName};
 }
 // Preview of an export into an existing tab: which cells change (old → new); a new tab or spreadsheet changes nothing.
 async function exportPreview(draftId,t){
  const card=locate(String(draftId||''));if(!card)throw Error('Карточка устарела или удалена. Повторите запрос в чате.');
  const where=checkTarget(t),values=block(card);
  const total=values.reduce((n,r)=>n+r.length,0);
  if(where.kind!=='existing')return {kind:where.kind,cells:total,changes:[],changed:0};
  if(!where.sheet)throw Error('Выберите лист.');
  const width=Math.max(...values.map(r=>r.length));
  const old=await clientFor(s).values(where.spreadsheetId,range(where.sheet,0,0,values.length-1,width-1),'UNFORMATTED_VALUE');
  const changes=[];
  values.forEach((row,r)=>row.forEach((v,c)=>{const was=old[r]?.[c];if(!same(was,v))changes.push({cell:cell(r,c),old:was??'',new:v});}));
  return {kind:'existing',cells:total,changed:changes.length,changes:changes.slice(0,40)};
 }
 async function exportRun(draftId,t){
  const where=checkTarget(t);
  return guarded(String(draftId||''),async card=>{
   const values=block(card);
   publish('Выгружаю «'+card.title+'» в Google Таблицы…',{busy:true,id:NOTICE+'-export'});
   try{
    const client=clientFor(s,{write:true});
    let id=where.spreadsheetId,tab=where.sheet,url;
    if(where.kind==='new'){
     if(auth.mode(s.settings)!=='account')throw Error('Сервисный аккаунт создаёт таблицы в своём Диске, вы их не увидите. Выберите таблицу, которой вы с ним поделились.');
     const made=await client.create(card.title,card.sheetName||card.title);id=made.id;tab=made.sheet.title;url=sheetUrl(id,made.sheet.id);
    }else if(where.kind==='tab'){
     const added=await client.addSheet(id,tab||card.sheetName||card.title);tab=added.title;url=sheetUrl(id,added.id);
    }else{
     if(!tab)throw Error('Выберите лист.');
     // The cells must still be what the preview showed.
     const width=Math.max(...values.map(r=>r.length));
     const before=await client.values(id,range(tab,0,0,values.length-1,width-1),'UNFORMATTED_VALUE');
     const expect=card.preview?.[id+'\n'+tab];
     if(expect!==undefined&&JSON.stringify(before)!==expect)throw Object.assign(Error('Лист изменился после предпросмотра. Посмотрите изменения ещё раз.'),{stale:true});
     url=sheetUrl(id);
    }
    const r=await client.update(id,[{range:range(tab,0,0),values}]);
    try{remember(s,await client.meta(id));}catch{/* the export is done */}
    publish('«'+card.title+'» выгружено в Google Таблицы.',{kind:'success',id:NOTICE+'-export'});
    return {spreadsheetId:id,sheet:tab,url,cells:r.cells};
   }catch(e){publish(e.message,{kind:'error',id:NOTICE+'-export'});throw e;}
  });
 }
 // Incremental consent through the shared Google connection: read first, write only after writing is enabled.
 async function connect(key,write=false){
  watching?.stop();
  const account=key?auth.googleAccounts(s.settings).find(a=>a.key===key):null;
  watching=await workspace.consent(s,auth.PRODUCT,{account:key||'',write:!!write,poll,now,onDone:r=>{
   watching=null;
   if(!r.ok)publish(r.error,{kind:'error'});
   else{publish('Google Таблицы: доступ '+(write?'на чтение и запись':'на чтение')+' для '+(r.account.email||'аккаунта')+' выдан.',{kind:'success'});if(!s.settings.googleSheetsAccount)s.saveSettings?.({googleSheetsAccount:r.account.key});}
  }});
  publish('Подтвердите доступ к Google Таблицам в браузере'+(account?.email?' для '+account.email:'')+'.',{busy:true});
  return status();
 }
 function status(){
  const configured=workspace.configured(s);
  return {added:kit.installed(s,ID),mode:auth.mode(s.settings),write:auth.wantsWrite(s.settings),writable:auth.writable(s.settings),connected:auth.connected(s.settings),
   accounts:auth.googleAccounts(s.settings).map(({key,email,label,read,write})=>({key,email,label,read,write})),chosen:auth.chosen(s.settings)?.key||'',configured,
   hasKey:!!s.settings.googleSheetsCredential,serviceEmail:auth.serviceEmail(s.settings),known:known(s.settings).map(({id,title,sheets})=>({id,title,tabs:sheets.length,url:sheetUrl(id)})),operation};
 }
 const ipc={
  status,connect,
  cancel(){watching?.stop();watching=null;s.mailAccounts?.google?.login?.stop?.();publish('Подключение отменено.');return status();},
  saveKey(text){if(typeof text!=='string'||text.length>20000)throw Error('Выберите JSON ключ сервисного аккаунта Google.');const key=workspace.parseKey(text);s.saveSettings({googleSheetsCredential:JSON.stringify(key)},true);return status();},
  clearKey(){s.saveSettings({clear_googleSheetsCredential:true},true);return status();},
  async remember(link){const url=parseUrl(link);if(!url)throw Error('Нужна ссылка на таблицу Google (docs.google.com/spreadsheets/…).');if(!ready())throw Error('Сначала подключите доступ к таблицам.');remember(s,await clientFor(s).meta(url.id));return status();},
  forget(id){s.saveSettings({googleSheetsKnown:JSON.stringify(known(s.settings).filter(x=>x.id!==id))});return status();},
  sheet,append,exportTargets,
  async exportPreview(draftId,t){const r=await exportPreview(draftId,t);const card=locate(String(draftId||''));
   // The previewed cells are kept so the write can refuse a sheet that changed after the preview.
   if(card&&r.kind==='existing'){const where=checkTarget(t),values=block(card),width=Math.max(...values.map(x=>x.length));
    const old=await clientFor(s).values(where.spreadsheetId,range(where.sheet,0,0,values.length-1,width-1),'UNFORMATTED_VALUE');card.preview={...card.preview,[where.spreadsheetId+'\n'+where.sheet]:JSON.stringify(old)};}
   return r;},
  exportRun
 };
 const service={ready,writable:()=>ready()&&auth.writable(s.settings),who:()=>auth.who(s.settings),known:()=>known(s.settings),parseUrl,sheetUrl,
  async meta(id){const meta=await clientFor(s).meta(id);remember(s,meta);return meta;},
  // A tab's values for another app: formatted text, raw numbers and the header row.
  async read(id,title,{rows=1000,cols=60}={}){
   const client=clientFor(s);const meta=await client.meta(id);const t=meta.sheets.find(x=>x.title===title)||(title?null:meta.sheets[0]);
   if(!t)throw Error('В таблице «'+meta.title+'» нет листа «'+title+'».');
   const a1=range(t.title,0,0,Math.max(1,Math.min(t.rows||rows,rows))-1,Math.max(1,Math.min(t.cols||cols,cols))-1);
   const [formatted,raw]=await Promise.all([client.values(id,a1,'FORMATTED_VALUE'),client.values(id,a1,'UNFORMATTED_VALUE')]);
   const g=table.grid(formatted,raw,{rows,cols});
   return {spreadsheetId:meta.id,title:meta.title,sheet:{id:t.id,title:t.title},url:sheetUrl(meta.id,t.id),header:table.header(g.text,g.numbers,{frozen:t.frozenRows}),text:g.text,numbers:g.numbers,tabs:tabs(meta)};
  },
  applyUpdate};
 return {googleSheets:service,ipc};
}

function validate(next){
 if(next.googleSheetsAuth!==undefined&&!['account','service'].includes(next.googleSheetsAuth))throw Error('Способ входа Google Таблиц: аккаунт Google или сервисный аккаунт.');
 if(next.googleSheetsWrite!==undefined&&!['true','false'].includes(String(next.googleSheetsWrite)))throw Error('Запись в Google Таблицы: да или нет.');
 if(next.googleSheetsAccount!==undefined&&next.googleSheetsAccount!==''&&!/^google:[\w-]{1,80}$/.test(next.googleSheetsAccount))throw Error('Некорректный аккаунт Google.');
 if(next.googleSheetsKnown!==undefined&&next.googleSheetsKnown!==''){let list;try{list=JSON.parse(next.googleSheetsKnown);}catch{throw Error('Список таблиц повреждён.');}if(!Array.isArray(list)||list.length>MAX_KNOWN||next.googleSheetsKnown.length>200000)throw Error('Список таблиц повреждён.');}
}
module.exports={name:'googleSheets',defaults:{['extension_'+ID]:'false',googleSheetsAuth:'account',googleSheetsWrite:'false',googleSheetsAccount:'',googleSheetsCredential:'',googleSheetsKnown:'[]'},
 secrets:['googleSheetsCredential'],validate,setup,turn,intent,known,target,parseValues,connected:auth.connected};
