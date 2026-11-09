// «Договоры в PDF»: an attached PDF contract (or a path to one) is read page by page (pdf.cjs: the text layer; scanned
// pages through a local OCR only if one is installed, ocr.cjs), and code finds the parties, number and date, price,
// payment terms, term, auto-renewal, termination, penalties and IP / licensing (contract.cjs). Every field quotes the
// contract verbatim with its page, and `verify` checks each quote against the page text; the local model, when there
// is one, may add fields, but only quotes found in the contract are kept. Deadlines become reminders through the
// cross-app kind `reminder` («Напоминания» puts a «Напомни …» request into the chat, which confirms it as usual).
// «сравни с прошлой версией договора» diffs two PDFs clause by clause. Not legal advice; the card says so once.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const kit=require('../app-kit.cjs');
const P=require('./pdf.cjs');
const C=require('./contract.cjs');
const query=require('./query.cjs');
const store=require('./store.cjs');
const ID='pdf-contracts',BY='Договоры в PDF';
const deps={now:()=>Date.now(),ocr:require('./ocr.cjs')};
const MAX=60<<20;

// --- Sources -----------------------------------------------------------------------------------------------------------
function attached(s){
 let files=[];try{files=s.attachments?.list?.()||[];}catch{files=[];}
 return files.filter(f=>/\.pdf$/i.test(f.name||'')).map(f=>{const item=s.attachments.pending?.get?.(f.id)||{};return {id:f.id,name:f.name,path:item.localSourcePath||'',text:typeof item.text==='string'?item.text:''};});
}
// Attachments used by the answer move from the composer into the chat, like other apps do.
function adopt(s,used){
 if(!used.length)return;
 try{
  const rows=s.attachments.take(used.map(f=>f.id)),topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]),...rows.filter(f=>!topic.attachments?.some(old=>old.id===f.id))];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=rows.map(f=>s.attachments.info(f));
  for(const f of rows)s.attachments.remove(f.id);
  s.dialogue.persist();
 }catch{/* attachments stay in the composer */}
}
const expand=p=>p.startsWith('~')?path.join(os.homedir(),p.slice(1)):p;
const lastCards=s=>{const out=[];for(const m of s.dialogue?.active?.()?.messages||[]){const c=m.extensionData?.contractCard;if(c?.mode==='analyze')out.push(c);}return out;};

const notices=new Map();
function publish(s,id,item){
 const notice={id:'pdf-contracts:'+id,title:BY,...item};notices.set(notice.id,notice);while(notices.size>10)notices.delete(notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
// One PDF → a document {id, name, pages:[{n, lines, ocr?, scanned?, unread?}], ocr:{…}} kept in the company folder.
async function load(s,src){
 if(src.path){
  const file=expand(src.path);
  let st;try{st=fs.statSync(file);}catch{throw Object.assign(Error('Не нашёл файл «'+path.basename(file)+'».'),{status:404});}
  if(!st.isFile()||st.size>MAX)throw Error('«'+path.basename(file)+'» — не файл или больше 60 МБ.');
  const bytes=fs.readFileSync(file);
  const id=crypto.createHash('sha1').update(bytes).digest('hex').slice(0,16);
  const cached=store.load(s,id);if(cached)return {...cached,name:src.name||path.basename(file)};
  s.requestProgress?.report?.('Читаю «'+path.basename(file)+'»');
  const r=P.read(bytes);
  const doc={id,name:src.name||path.basename(file),numPages:r.numPages,truncated:r.truncated,pages:r.pages.map(p=>({n:p.n,lines:p.lines,scanned:p.scanned})),ocr:{tool:null,pages:[],unread:[],unsupported:[]}};
  const scans=r.pages.filter(p=>p.scanned);
  if(scans.length){
   const bin=deps.ocr.find();doc.ocr.tool=bin?path.basename(bin).replace(/\.exe$/i,''):null;
   for(const [k,p] of scans.entries()){
    const page=doc.pages.find(x=>x.n===p.n);
    if(!bin){page.unread=true;doc.ocr.unread.push(p.n);continue;}
    const img=P.imageFile(r.pdf,p.image);
    if(!img||img.unsupported){page.unread=true;doc.ocr.unread.push(p.n);doc.ocr.unsupported.push({page:p.n,format:img?.unsupported||'image'});continue;}
    publish(s,id,{text:'Распознаю скан: страница '+p.n+' ('+(k+1)+' из '+scans.length+')',busy:true,kind:'info',percent:Math.round(k/scans.length*100)});
    try{page.lines=await deps.ocr.recognize(img,{bin});page.ocr=true;doc.ocr.pages.push(p.n);}
    catch{page.unread=true;doc.ocr.unread.push(p.n);}
   }
   if(bin)publish(s,id,{text:'Сканы распознаны: '+doc.ocr.pages.length+' из '+scans.length,busy:false,kind:doc.ocr.unread.length?'attention':'success'});
  }
  store.save(s,doc);
  return doc;
 }
 // An attachment without a path: the text Petya read when it was attached ([Страница N] markers).
 const pages=[];let cur=null;
 for(const line of String(src.text||'').split('\n')){const m=/^\[Страница (\d+)\]$/.exec(line.trim());if(m){cur={n:Number(m[1]),lines:[]};pages.push(cur);continue;}if(!cur){cur={n:1,lines:[]};pages.push(cur);}
  // The attachment reader joins a page into one line; sentences and numbered clauses are split again.
  for(const part of line.split(/\s+(?=\d{1,2}(?:\.\d{1,3})+\.?\s+\p{Lu})|(?<=[.;:])\s+(?=\d{1,2}\.\s+\p{Lu}{3,})/u))if(part.trim())cur.lines.push(part.trim());}
 if(!pages.some(p=>p.lines.length))throw Error('В «'+src.name+'» нет текста.');
 const id=crypto.createHash('sha1').update(String(src.text)).digest('hex').slice(0,16);
 const doc={id,name:src.name,numPages:pages.length,pages,ocr:{tool:null,pages:[],unread:[],unsupported:[]},fromText:true};
 store.save(s,doc);
 return doc;
}

// --- Analysis ----------------------------------------------------------------------------------------------------------
const MODEL_KINDS=['parties','price','payment','term','renewal','termination','penalty','ip'];
async function modelFields(s,doc,list){
 if(!s.settings.model)return {fields:[],rejected:0};
 const items=list.filter(c=>!c.heading&&c.text).map(c=>({n:c.num,page:c.page,text:c.text.slice(0,700)}));
 let budget=14000;const shown=items.filter(x=>(budget-=x.text.length+20)>0);
 const r=await kit.modelJSON(s,{system:'Ниже пункты договора с номерами страниц. Найди условия: стороны, стоимость, порядок оплаты, срок действия, автопродление, расторжение, неустойки и штрафы, права и лицензии. Для каждого условия дай дословную цитату из текста (одно предложение, без пересказа) и номер страницы. Если условия нет — не выдумывай.',
  user:{clauses:shown},schema:{type:'object',properties:{fields:{type:'array',maxItems:24,items:{type:'object',properties:{kind:{type:'string',enum:MODEL_KINDS},quote:{type:'string'},page:{type:'integer'}},required:['kind','quote','page']}}},required:['fields']},predict:1500,temperature:0.1}).catch(()=>null);
 const out=[];let rejected=0;
 for(const f of r?.fields||[]){
  const quote=String(f.quote||'').trim().slice(0,600);
  const v=C.verify(doc,quote,Number(f.page)||null);
  if(!v.ok){rejected++;continue;}
  out.push({kind:f.kind,label:C.LABEL[f.kind],value:C.valueOf(f.kind,quote),quote,page:v.page,clause:'',by:'model',verified:true});
 }
 return {fields:out,rejected};
}
function merge(code,model){
 const out=code.slice();
 for(const f of model){
  if(out.some(x=>x.kind===f.kind&&(C.norm(x.quote).includes(C.norm(f.quote))||C.norm(f.quote).includes(C.norm(x.quote)))))continue;
  if(out.filter(x=>x.kind===f.kind).length>=4)continue;
  out.push(f);
 }
 return out.sort((a,b)=>C.ORDER.indexOf(a.kind)-C.ORDER.indexOf(b.kind));
}
const ru=d=>{const [y,m,dd]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,dd)).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});};
const today=()=>new Date(deps.now()).toISOString().slice(0,10);
function summary(card){
 const f=k=>card.fields.filter(x=>x.kind===k);
 const parts=[];
 const num=f('number')[0];parts.push('Договор'+(num?.value?' '+num.value:'')+(card.doc.name?' («'+card.doc.name+'»)':'')+'.');
 if(f('parties').length)parts.push(f('parties').map(x=>x.value).join(', ')+'.');
 for(const k of ['price','payment','term','renewal','termination','penalty','ip'])if(f(k).length)parts.push(C.LABEL[k]+': '+f(k).map(x=>x.value||'см. цитату').join('; ')+'.');
 const next=card.deadlines.find(d=>d.date>=today());
 if(next)parts.push('Ближайший срок — '+ru(next.date)+': '+next.label.toLowerCase()+'.');
 if(card.doc.ocr.unread.length)parts.push('Страницы '+card.doc.ocr.unread.join(', ')+' — сканы без текста'+(card.doc.ocr.tool?', распознать не удалось':', а локального OCR нет')+': их условия не разобраны.');
 else if(card.doc.ocr.pages.length)parts.push('Страницы '+card.doc.ocr.pages.join(', ')+' распознаны OCR — сверяйте цитаты со сканом.');
 if(!card.fields.some(x=>x.kind!=='number'))parts.push('Условий, которые я ищу, в тексте не нашёл.');
 return parts.join(' ');
}
function focused(card,kinds){
 const lines=[];
 for(const k of kinds){
  if(k==='deadlines'){for(const d of card.deadlines)lines.push(ru(d.date)+' — '+d.label.toLowerCase()+(d.approx?' (примерно)':'')+' (стр. '+d.page+')');continue;}
  for(const x of card.fields.filter(f=>f.kind===k||k==='term'&&f.kind==='renewal'))lines.push(x.label+(x.value?' — '+x.value:'')+': «'+x.quote+'» (стр. '+x.page+')');
 }
 return lines.length?lines.join('\n'):'В договоре «'+card.doc.name+'» об этом ничего не нашёл.';
}
async function analyze(s,text,doc){
 const list=C.clauses(doc);
 const code=C.extract(doc,list);
 const checked=C.checkAll(doc,code);
 const model=await modelFields(s,doc,list);
 const fields=merge(checked.fields,model.fields);
 const card={id:crypto.randomUUID(),mode:'analyze',at:deps.now(),
  doc:{id:doc.id,name:doc.name,numPages:doc.numPages,truncated:!!doc.truncated,fromText:!!doc.fromText,scanned:doc.pages.filter(p=>p.scanned).map(p=>p.n),ocr:doc.ocr},
  fields:fields.map(({quotes,...f})=>({...f,quote:quotes?quotes.join(' … '):f.quote})),deadlines:C.deadlines(fields),rejected:model.rejected+checked.dropped.length,
  clauses:list.filter(c=>!c.heading).length,today:today()};
 return card;
}

// --- Turns -------------------------------------------------------------------------------------------------------------
async function contractTurn(s,text,kind){
 const files=attached(s);
 const written=query.paths(text).map(p=>({name:path.basename(p),path:p}));
 const sources=[...files,...written];
 const previous=lastCards(s);
 if(kind==='need-file'||kind==='analyze'&&!sources.length&&!previous.length)
  return kit.reply(s,text,{by:BY,question:true,text:'Прикрепите PDF договора кнопкой «Прикрепить» (или напишите путь к файлу) и повторите вопрос.'});
 if(kind==='analyze'&&!sources.length){
  // A follow-up about the contract already read in this chat: answered from its card.
  const card=previous[previous.length-1];const kinds=query.focus(text);
  const answer=kinds.length?focused(card,kinds):summary(card);
  return kit.reply(s,text,{by:BY,text:answer,data:{contractCard:{...card,id:crypto.randomUUID(),focus:kinds}}});
 }
 if(kind==='compare'){
  let pair=null;
  if(sources.length>=2)pair=[await load(s,sources[0]),await load(s,sources[1])];
  else if(sources.length===1&&previous.length){const old=store.load(s,previous[previous.length-1].doc.id);if(old)pair=[old,await load(s,sources[0])];}
  else if(!sources.length&&previous.length>=2){const a=store.load(s,previous[previous.length-2].doc.id),b=store.load(s,previous[previous.length-1].doc.id);if(a&&b)pair=[a,b];}
  if(!pair)return kit.reply(s,text,{by:BY,question:true,text:'Для сравнения нужны две версии договора: прикрепите обе PDF — или новую, если старая уже разобрана в этом чате.'});
  adopt(s,files);
  // The older version first: by a version number or a date in the file names, else in the order given.
  const order=versionOrder(pair[0].name,pair[1].name);if(order>0)pair.reverse();
  return kit.reply(s,text,compareReply(pair[0],pair[1]));
 }
 const doc=await load(s,sources[0]);
 adopt(s,files);
 const card=await analyze(s,text,doc);
 const kinds=query.focus(text);
 if(kinds.length)card.focus=kinds;
 const answer=kinds.length?focused(card,kinds):summary(card);
 return kit.reply(s,text,{by:BY,text:answer,data:{contractCard:card}});
}
function versionOrder(a,b){
 const v=n=>{const m=/(?:v|вер\p{L}*|ред\p{L}*|rev)[\s._-]*(\d+)/iu.exec(n)||/[\s._-](\d)(?:\.pdf)$/i.exec(n);return m?Number(m[1]):null;};
 const d=n=>{const m=/(\d{4})[-._](\d{2})[-._](\d{2})|(\d{2})[-._](\d{2})[-._](\d{4})/.exec(n);return m?(m[1]?m[1]+m[2]+m[3]:m[6]+m[5]+m[4]):null;};
 const va=v(a),vb=v(b);if(va!==null&&vb!==null&&va!==vb)return va>vb?1:-1;
 const da=d(a),db=d(b);if(da&&db&&da!==db)return da>db?1:-1;
 if(/(?:нов|new|final|итог)/iu.test(a)&&!/(?:нов|new|final|итог)/iu.test(b))return 1;
 return 0;
}
function compareReply(a,b){
 const r=C.compare(a,b);
 const card={id:crypto.randomUUID(),mode:'compare',at:deps.now(),old:{id:a.id,name:a.name,numPages:a.numPages},new:{id:b.id,name:b.name,numPages:b.numPages},
  rows:r.rows.slice(0,300),counts:r.counts,fieldChanges:r.fieldChanges,unread:{old:a.ocr?.unread||[],new:b.ocr?.unread||[]}};
 const c=r.counts,changed=c.changed+c.added+c.removed;
 const text=!changed&&!c.moved?'Версии «'+a.name+'» и «'+b.name+'» совпадают по тексту пунктов.':
  'Сравнил «'+a.name+'» (старая) и «'+b.name+'» (новая): '+[c.changed?'изменено пунктов: '+c.changed:'',c.added?'добавлено: '+c.added:'',c.removed?'удалено: '+c.removed:'',c.moved?'перенумеровано: '+c.moved:''].filter(Boolean).join(', ')+'.'+
  (r.fieldChanges.length?' Условия: '+r.fieldChanges.map(x=>x.label.toLowerCase()+' — '+(x.old||'нет')+' → '+(x.new||'нет')).join('; ')+'.':'');
 return {by:BY,text,data:{contractCard:card}};
}
async function turn(s,command){
 const text=String(command||'');
 const kind=query.about(text,{pdfs:attached(s).length,hasCard:lastCards(s).length>0});
 if(!kind||!kit.installed(s,ID))return null;
 try{return await contractTurn(s,text,kind);}
 catch(e){if(e?.name==='InputRequired')throw e;return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message});}
}

// --- Card calls ----------------------------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.contractCard?.id===id)return {topic,message:m,card:m.extensionData.contractCard};
 return null;
}
// «Поменять местами»: the comparison the other way round (when the file names did not say which is newer).
function swap(s,id){
 const hit=findCard(s,String(id||''));if(!hit||hit.card.mode!=='compare')throw Error('Карточка сравнения не найдена.');
 const a=store.load(s,hit.card.new.id),b=store.load(s,hit.card.old.id);if(!a||!b)throw Error('Тексты версий не сохранились. Прикрепите PDF заново.');
 const r=compareReply(a,b);
 hit.message.extensionData={...hit.message.extensionData,contractCard:{...r.data.contractCard,id:hit.card.id}};hit.message.text=r.text;s.dialogue.persist?.();
 return hit.message.extensionData.contractCard;
}
// The page text for «Показать на странице» (a quote shown in its context).
function page(s,docId,n){const doc=store.load(s,String(docId||''));const p=doc?.pages.find(x=>x.n===Number(n));if(!p)throw Error('Страница не найдена.');return {n:p.n,lines:p.lines,ocr:!!p.ocr,name:doc.name};}
function setup(s){return {ipc:{swap:id=>swap(s,id),page:(docId,n)=>page(s,docId,n),progress:()=>[...notices.values()]}};}
module.exports={name:'pdfContracts',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,load,analyze,summary,versionOrder,deps,teardown(){notices.clear();}};
