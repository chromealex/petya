// Shared Google Workspace connection for Google apps (Sheets, Drive and Docs). It owns both ways in:
// - account: a Google account Petya already has for mail (the shared OAuth Desktop client in the Gmail credential).
//   Each product's scopes are added by incremental consent (`include_granted_scopes`), read first, write only when
//   the app asks for it; granted scopes are stored with the account's tokens and refreshed by the mail client.
// - service: a Google Cloud service-account key (the app keeps it as its own secret); tokens come from the JWT bearer
//   grant in src/google-service-account.cjs and are cached per key and scope.
// An app passes its product (or several: «Google Диск» reads Drive and Docs, ['drive','docs']) and its own settings
// (which path, which account, the key); this module names no app.
// It also knows Google file links and types (parseLink, kindOf, fileUrl) and turns a Docs API document into an
// outline with its text (docText), so every Google app reads links and documents the same way.
const serviceAccount=require('./google-service-account.cjs');

const SCOPES={
 sheets:{read:'https://www.googleapis.com/auth/spreadsheets.readonly',write:'https://www.googleapis.com/auth/spreadsheets'},
 docs:{read:'https://www.googleapis.com/auth/documents.readonly',write:'https://www.googleapis.com/auth/documents'},
 drive:{read:'https://www.googleapis.com/auth/drive.readonly',write:'https://www.googleapis.com/auth/drive.file'}
};
const product=name=>{const p=SCOPES[name];if(!p)throw Error('Неизвестный продукт Google: '+name);return p;};
// One product or a list of them; a list needs every product.
const products=name=>{const list=[].concat(name);if(!list.length)throw Error('Неизвестный продукт Google: '+name);list.forEach(product);return list;};
// A broader scope covers the narrower one: spreadsheets ⊃ spreadsheets.readonly, documents ⊃ documents.readonly.
// Drive: drive.file only reaches files the app created, so it does not mean reading; the full `drive` scope covers both.
const FULL_DRIVE='https://www.googleapis.com/auth/drive';
function covers(scopes,name,write){
 const set=new Set(scopes);
 return products(name).every(n=>{
  const p=product(n);
  if(write)return set.has(p.write)||n==='drive'&&set.has(FULL_DRIVE);
  return set.has(p.read)||n!=='drive'&&set.has(p.write)||n==='drive'&&set.has(FULL_DRIVE);
 });
}
// Google accounts from mail with what each may do in a product (or in all of a list): [{key, id, email, label, read, write}].
function accounts(settings,name){
 products(name);
 let c={};try{c=JSON.parse(settings.gmailCredential||'{}')||{};}catch{c={};}
 return (Array.isArray(c.accounts)?c.accounts:[]).filter(a=>a?.id).map(a=>{
  const scopes=String(a.tokens?.scope||'').split(/\s+/).filter(Boolean);
  const write=covers(scopes,name,true);
  return {key:'google:'+a.id,id:a.id,email:String(a.email||''),label:String(a.label||''),read:covers(scopes,name,false),write};
 });
}
// The account an app uses: its chosen one while it still has read access, otherwise the first one that has.
function chosen(settings,name,key){const ready=accounts(settings,name).filter(a=>a.read);return ready.find(a=>a.key===key)||ready[0]||null;}
function serviceEmail(credential){try{return credential?serviceAccount.parse(credential).client_email:'';}catch{return '';}}
// The scopes asked for a product or a list: read scopes, or the write scopes when `write`.
const scopesOf=(name,write)=>products(name).map(n=>write?product(n).write:product(n).read);

// An access token. `via`: {mode:'account'|'service', account?: key, credential?: JSON}. `name` may be a list.
async function token(s,name,{mode='account',account:key='',credential='',write=false}={}){
 const scope=scopesOf(name,write).join(' ');
 if(mode==='service'){if(!credential)throw Error('Загрузите JSON-ключ сервисного аккаунта Google.');return serviceAccount.token(credential,scope,s.request);}
 const a=chosen(s.settings,name,key);
 if(!a)throw Error('Разрешите доступ Google для аккаунта в настройках приложения.');
 if(write&&!a.write)throw Error('Нужно разрешение Google на запись. Разрешите его в настройках приложения.');
 const manager=s.mailAccounts?.google;if(!manager)throw Error('Аккаунты Google ещё загружаются. Повторите через минуту.');
 return manager.client(a.id).access();
}
// Incremental consent for a product's scope (or every scope of a list) through the mail sign-in. `watch` reports the
// outcome once the browser step ends: onDone({ok, account, error}). Returns the pending login.
async function consent(s,name,{account:key='',write=false,poll=1000,now=()=>Date.now(),onDone=()=>{}}={}){
 const scopes=scopesOf(name,write),manager=s.mailAccounts?.google;if(!manager)throw Error('Аккаунты Google ещё загружаются.');
 const target=key?accounts(s.settings,name).find(a=>a.key===key):null;
 const has=a=>write?a.write:a.read;
 const before=new Set(accounts(s.settings,name).filter(has).map(a=>a.key));
 await manager.start({scopes,email:target?.email||''});
 const started=now();
 const timer=setInterval(()=>{
  const login=manager.login;if(login?.pending&&now()-started<310000)return;
  clearInterval(timer);
  const after=accounts(s.settings,name).filter(has);
  const fresh=after.find(a=>!before.has(a.key))||after.find(a=>a.key===key);
  onDone(login?.lastError?{ok:false,error:login.lastError}:fresh?{ok:true,account:fresh}:{ok:false,error:'Доступ не выдан. Отметьте разрешение Google на странице входа и повторите.'});
 },poll);
 timer.unref?.();
 return {stop(){clearInterval(timer);manager.login?.stop?.();}};
}
const configured=s=>{try{return !!s.mailAccounts?.google?.status().configured;}catch{return false;}};

// --- Google files: links and types ------------------------------------------------------------------------------------
// Drive MIME types → a short kind every Google app uses (cards pick a generic icon by kind, never a brand logo).
const MIME={
 'application/vnd.google-apps.document':'document','application/vnd.google-apps.spreadsheet':'spreadsheet',
 'application/vnd.google-apps.presentation':'presentation','application/vnd.google-apps.folder':'folder',
 'application/vnd.google-apps.form':'form','application/vnd.google-apps.drawing':'drawing','application/vnd.google-apps.shortcut':'shortcut',
 'application/pdf':'pdf'
};
function kindOf(mime){
 const m=String(mime||'');
 if(MIME[m])return MIME[m];
 if(/^image\//.test(m))return 'image';if(/^video\//.test(m))return 'video';if(/^audio\//.test(m))return 'audio';
 if(/wordprocessingml|msword|opendocument\.text|rtf/.test(m))return 'document';
 if(/spreadsheetml|ms-excel|opendocument\.spreadsheet|text\/csv/.test(m))return 'spreadsheet';
 if(/presentationml|ms-powerpoint|opendocument\.presentation/.test(m))return 'presentation';
 if(/zip|x-7z|x-rar|x-tar|gzip/.test(m))return 'archive';
 if(/^text\//.test(m))return 'text';
 return 'file';
}
// The MIME type to ask Drive for a kind (search filters): only Google-native kinds and PDFs.
const MIME_OF={document:'application/vnd.google-apps.document',spreadsheet:'application/vnd.google-apps.spreadsheet',presentation:'application/vnd.google-apps.presentation',folder:'application/vnd.google-apps.folder',pdf:'application/pdf'};
const FILE_ID=/^[A-Za-z0-9_-]{10,200}$/;
// A Google file link in text → {kind, id, url}: Docs / Sheets / Slides / Forms editors, a Drive file, folder or open?id=.
function parseLink(text){
 const t=String(text||'');
 let m=/https:\/\/docs\.google\.com\/(document|spreadsheets|presentation|forms|drawings)\/(?:u\/\d+\/)?d\/(?:e\/)?([A-Za-z0-9_-]{10,200})[^\s<>"«»]*/u.exec(t);
 if(m)return {kind:{document:'document',spreadsheets:'spreadsheet',presentation:'presentation',forms:'form',drawings:'drawing'}[m[1]],id:m[2],url:m[0]};
 m=/https:\/\/drive\.google\.com\/(?:u\/\d+\/)?(?:file\/d\/([A-Za-z0-9_-]{10,200})|drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})|(?:open|uc)\?(?:[^\s#]*&)?id=([A-Za-z0-9_-]{10,200}))[^\s<>"«»]*/u.exec(t);
 if(m)return {kind:m[2]?'folder':'file',id:m[1]||m[2]||m[3],url:m[0]};
 return null;
}
// The link that opens a file of a kind in its Google editor (or in Drive).
function fileUrl(kind,id){
 if(!FILE_ID.test(String(id||'')))return '';
 const editors={document:'document',spreadsheet:'spreadsheets',presentation:'presentation',form:'forms',drawing:'drawings'};
 if(editors[kind])return 'https://docs.google.com/'+editors[kind]+'/d/'+id+'/edit';
 if(kind==='folder')return 'https://drive.google.com/drive/folders/'+id;
 return 'https://drive.google.com/file/d/'+id+'/view';
}

// --- Google Docs: a documents.get answer → outline and text -------------------------------------------------------------
// Blocks in reading order: {type:'heading', level 1–6 (TITLE 0, SUBTITLE 7), text, path} | {type:'p'|'li', text, path,
// level?} | {type:'table', rows:[[cell text]]}; `path` is the heading trail «A › B». Tabs (includeTabsContent) are read
// in order, each as a top-level heading when there are several. Text is capped at `max` characters.
function docText(doc,{max=400000}={}){
 const blocks=[];let size=0,cut=false;const trail=[];
 const style={TITLE:0,SUBTITLE:7,HEADING_1:1,HEADING_2:2,HEADING_3:3,HEADING_4:4,HEADING_5:5,HEADING_6:6};
 const runs=p=>(p?.elements||[]).map(e=>e.textRun?.content||(e.person?.personProperties?.name)||(e.richLink?.richLinkProperties?.title)||'').join('').replace(/[\u000b\r]/g,'\n').replace(/\n+$/,'').replace(/[ \t]+/g,' ').trim();
 const path=()=>trail.filter(Boolean).join(' › ');
 const push=b=>{if(cut)return;size+=(b.text||'').length+(b.rows?b.rows.flat().join(' ').length:0);if(size>max){cut=true;return;}blocks.push(b);};
 function walk(content,depth=0){
  for(const el of content||[]){
   if(cut)return;
   if(el.paragraph){
    const text=runs(el.paragraph);if(!text)continue;
    const named=el.paragraph.paragraphStyle?.namedStyleType;
    const level=style[named];
    if(level!==undefined&&level>=1&&level<=6&&depth===0){trail.length=level-1;trail[level-1]=text;push({type:'heading',level,text,path:path()});}
    else if(level===0||level===7)push({type:'heading',level,text,path:path()});
    else if(el.paragraph.bullet)push({type:'li',text,level:Number(el.paragraph.bullet.nestingLevel)||0,path:path()});
    else push({type:'p',text,path:path()});
   }else if(el.table&&depth<3){
    const rows=(el.table.tableRows||[]).slice(0,200).map(r=>(r.tableCells||[]).slice(0,20).map(c=>{const inner=[];for(const x of c.content||[])if(x.paragraph)inner.push(runs(x.paragraph));return inner.filter(Boolean).join(' ');}));
    if(rows.some(r=>r.some(Boolean)))push({type:'table',rows,path:path()});
   }else if(el.tableOfContents){/* the outline is built from the headings themselves */}
  }
 }
 const tabs=[];const flat=list=>{for(const t of list||[]){tabs.push(t);flat(t.childTabs);}};flat(doc?.tabs);
 if(tabs.length){
  for(const t of tabs){
   if(tabs.length>1){trail.length=0;push({type:'heading',level:0,text:String(t.tabProperties?.title||'Вкладка'),path:'',tab:true});}
   walk(t.documentTab?.body?.content);
  }
 }else walk(doc?.body?.content);
 const text=blocks.map(b=>b.type==='table'?b.rows.map(r=>r.join(' | ')).join('\n'):b.type==='heading'&&b.level>=1&&b.level<=6?'#'.repeat(b.level)+' '+b.text:b.type==='li'?'  '.repeat(b.level||0)+'- '+b.text:b.text).join('\n\n');
 return {title:String(doc?.title||''),id:String(doc?.documentId||''),revision:String(doc?.revisionId||''),blocks,text,truncated:cut};
}

module.exports={SCOPES,accounts,chosen,serviceEmail,token,consent,configured,parseKey:serviceAccount.parse,
 kindOf,MIME,MIME_OF,FILE_ID,parseLink,fileUrl,docText};
