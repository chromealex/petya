// «Геймдизайн-документ», where the project's GDD is and how one section of it is read and replaced:
// - Markdown in the project folder (a file named gdd / game-design / геймдизайн / диздок, or the one the user named);
// - a Confluence page (REST v2 `GET /wiki/api/v2/pages/{id}?body-format=storage`, `PUT /wiki/api/v2/pages/{id}` with
//   the next version number — only the section's part of the storage body is replaced, the rest stays as it was);
// - a Google Doc (Docs API v1 `documents.get`, `documents.batchUpdate` with `writeControl.requiredRevisionId`: the
//   section's text range is deleted and the new text inserted; needs the Docs write scope).
// The binding is remembered per chat project. Writes happen only from the card's IPC after the user pressed the button,
// and each one first checks the GDD is still what the draft was made from (file hash, page version, revision id).
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const diff=require('../doc-diff/diff.cjs');
const find=require('../doc-diff/find.cjs');
const DOCS='https://docs.googleapis.com/v1/documents';
const hash=t=>createHash('sha1').update(String(t)).digest('hex');
const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,'gdd');
function projectId(s){try{const st=s.dialogue.state||{},t=s.dialogue.active();return String(t?.projectId||st.activeProjectId||'general');}catch{return 'general';}}
const bound=s=>(store(s).peek('targets')||{})[projectId(s)]||null;
function bind(s,target){const st=store(s),all={...st.peek('targets')||{}};all[projectId(s)]={...target,at:Date.now()};st.set('targets',all);return all[projectId(s)];}

// --- Where -----------------------------------------------------------------------------------------------------------
const MD=/\.(?:md|markdown)$/i;
function walk(root,{depth=5,max=4000}={}){
 const out=[];const queue=[[root,0]];
 const skip=new Set(['node_modules','.git','Library','Temp','Logs','obj','Build','Builds','build','dist','out','vendor','Packages','PackageCache']);
 while(queue.length&&out.length<max){
  const [dir,level]=queue.shift();let items=[];try{items=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
  for(const i of items){if(i.name.startsWith('.'))continue;const full=path.join(dir,i.name);
   if(i.isDirectory()){if(level<depth&&!skip.has(i.name))queue.push([full,level+1]);}else if(i.isFile()&&MD.test(i.name))out.push(full);}
 }
 return out;
}
function fileCandidates(s){
 const out=[];
 for(const root of find.projectRoots(s).slice(0,4))for(const full of walk(root)){
  const rel=path.relative(root,full).split(path.sep).join('/');
  if(find.GDD_FILE.test(rel))out.push({kind:'file',root,rel,title:rel,label:rel+' · '+path.basename(root)});
 }
 return out;
}
// A path or link the user named → a target, or null.
function parse(s,text){
 const link=find.links(text);
 if(link?.source==='google')return {kind:'google',id:link.id,title:'Google Документ',label:'Google Документ'};
 if(link?.source==='confluence')return {kind:'confluence',id:link.id,title:'Страница Confluence',label:'Страница Confluence'};
 if(link?.source==='git'){
  for(const root of find.projectRoots(s)){const full=path.resolve(root,link.file);if(full.startsWith(path.resolve(root)+path.sep)&&fs.existsSync(full))return {kind:'file',root,rel:path.relative(root,full).split(path.sep).join('/'),title:link.file,label:link.file};}
 }
 return null;
}
// → {one} | {many} | {none}. Remembered binding first, then GDD-named Markdown, then Confluence and Google Docs titles.
async function locate(s){
 const saved=bound(s);
 if(saved&&(saved.kind!=='file'||fs.existsSync(path.join(saved.root,saved.rel))))return {one:saved};
 const files=fileCandidates(s);
 if(files.length===1)return {one:files[0]};
 if(files.length>1)return {many:files.slice(0,8)};
 const more=[];
 const tries=await Promise.allSettled([(async()=>{
  const r=[];
  if(s.workspace?.api&&find.confluenceReady(s.settings)){
   const space=String(s.settings.confluenceSpace||'').trim();
   const cql='type = page AND (title ~ "GDD" OR title ~ "геймдизайн*" OR title ~ "Game Design")'+(space?' AND space = '+JSON.stringify(space):'')+' ORDER BY lastmodified DESC';
   const res=await s.workspace.api('/wiki/rest/api/content/search?'+new URLSearchParams({cql,limit:'5'}),{},{...s.settings});
   for(const p of res?.results||[])if(p?.id&&find.GDD.test(String(p.title||'')))r.push({kind:'confluence',id:String(p.id),title:String(p.title),label:String(p.title)+' · Confluence'});
  }
  return r;
 })(),(async()=>{
  if(s.settings['extension_google-drive']!=='true'||!s.googleDrive?.search)return [];
  const files=await s.googleDrive.search('GDD',{kind:'document',size:5});
  return (files||[]).filter(f=>f.kind==='document'&&find.GDD.test(f.name)).map(f=>({kind:'google',id:f.id,title:f.name,label:f.name+' · Google Документы'}));
 })()]);
 for(const t of tries)if(t.status==='fulfilled')more.push(...t.value);
 if(more.length===1)return {one:more[0]};
 if(more.length>1)return {many:more.slice(0,8)};
 return {none:true};
}

// --- Read -----------------------------------------------------------------------------------------------------------
function googleToken(s,{write=false}={}){
 const auth=require('../google-drive/auth.cjs'),workspace=require('../../google-workspace.cjs');
 if(!write)return auth.token(s);
 const settings=s.settings;
 if(auth.mode(settings)==='service')return workspace.token(s,'docs',{mode:'service',credential:settings.googleDriveCredential,write:true});
 return workspace.token(s,'docs',{mode:'account',account:auth.chosen(settings)?.key||'',write:true});
}
// Google Doc body (first tab) → Markdown with the paragraphs' indexes kept for writing.
function googleBlocks(doc){
 const style={HEADING_1:1,HEADING_2:2,HEADING_3:3,HEADING_4:4,HEADING_5:5,HEADING_6:6};
 const out=[];
 for(const el of doc?.body?.content||[]){
  if(el.paragraph){
   const text=(el.paragraph.elements||[]).map(e=>e.textRun?.content||'').join('').replace(/\n$/,'');
   const level=style[el.paragraph.paragraphStyle?.namedStyleType]||0;
   out.push({level,text,start:el.startIndex,end:el.endIndex,bullet:!!el.paragraph.bullet});
  }else if(el.table)out.push({level:0,text:(el.table.tableRows||[]).map(r=>'| '+(r.tableCells||[]).map(c=>(c.content||[]).map(x=>(x.paragraph?.elements||[]).map(e=>e.textRun?.content||'').join('')).join(' ').replace(/\s+/g,' ').trim()).join(' | ')+' |').join('\n'),start:el.startIndex,end:el.endIndex});
 }
 return out;
}
const blocksText=blocks=>blocks.map(b=>b.level?'#'.repeat(b.level)+' '+b.text:b.bullet?'- '+b.text:b.text).join('\n');
// → {text (Markdown), title, url, version} — `version` is what a write must still find.
async function read(s,t){
 if(t.kind==='file'){
  const full=path.join(t.root,t.rel);const text=fs.readFileSync(full,'utf8');
  return {text,title:t.rel,url:'',version:hash(text),where:path.basename(t.root)+'/'+t.rel};
 }
 if(t.kind==='confluence'){
  const p=await s.workspace.api('/wiki/api/v2/pages/'+encodeURIComponent(t.id)+'?body-format=storage',{},{...s.settings});
  const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
  return {text:diff.storageToMarkdown(p?.body?.storage?.value),title:String(p?.title||t.title),url:site+'/wiki/pages/viewpage.action?pageId='+encodeURIComponent(t.id),version:String(p?.version?.number||''),where:'Confluence'};
 }
 const access=await googleToken(s);
 const doc=await s.request(DOCS+'/'+encodeURIComponent(t.id),{headers:{Authorization:'Bearer '+access}});
 return {text:blocksText(googleBlocks(doc)),title:String(doc?.title||t.title),url:'https://docs.google.com/document/d/'+t.id+'/edit',version:String(doc?.revisionId||''),where:'Google Документы'};
}

// --- Sections -------------------------------------------------------------------------------------------------------
// The section of the GDD a topic means: the heading with the best concept overlap (level 1 headings are the title).
function section(text,topic){
 const all=diff.sections(text).filter(x=>x.level>=1);
 const docTitle=all.length>1&&all[0].level===1&&all.filter(x=>x.level===1).length===1;
 const pool=all.filter(x=>!(docTitle&&x===all[0]));
 let best=null,score=0;
 for(const x of pool){const n=diff.overlap(topic,x.title)*3+(diff.overlap(topic,x.body.slice(0,400))?1:0);if(diff.overlap(topic,x.title)&&n>score){best=x;score=n;}}
 return best;
}
// The whole text of a section (heading line excluded) and its range in lines.
function bodyOf(text,sec){const lines=String(text).replace(/\r\n?/g,'\n').split('\n');return lines.slice(sec.line+1,sec.end).join('\n').trim();}
// The new Markdown of the whole document with the section replaced (or appended at the end).
function replaced(text,title,body,{level=2}={}){
 const src=String(text).replace(/\r\n?/g,'\n');const lines=src.split('\n');
 const sec=diff.sections(src).find(x=>x.level>=1&&diff.key(x)===diff.key({title})||x.level>=1&&diff.norm(x.title)===diff.norm(title));
 const block=['#'.repeat(sec?.level||level)+' '+(sec?.title||title),'',String(body).trim(),''];
 if(sec)return [...lines.slice(0,sec.line),...block,...lines.slice(sec.end)].join('\n').replace(/\n{3,}/g,'\n\n');
 return src.replace(/\s*$/,'\n\n')+block.join('\n');
}

// --- Write (from the card only) ------------------------------------------------------------------------------------------
async function write(s,t,{title,body,version,level=2}){
 if(t.kind==='file'){
  const root=path.resolve(t.root),full=path.resolve(root,t.rel);
  if(!full.startsWith(root+path.sep)||!MD.test(full))throw Error('Некорректный путь GDD.');
  if(fs.lstatSync(full).isSymbolicLink())throw Error('GDD — ссылка, а не файл: не пишу туда.');
  const text=fs.readFileSync(full,'utf8');
  if(hash(text)!==version)throw Error('GDD изменился после черновика — попросите подготовить раздел заново.');
  fs.writeFileSync(full,replaced(text,title,body,{level}));
  return {where:t.rel};
 }
 if(t.kind==='confluence'){
  const settings={...s.settings},api=(r,o={})=>s.workspace.api(r,o,settings);
  const p=await api('/wiki/api/v2/pages/'+encodeURIComponent(t.id)+'?body-format=storage');
  const current=Number(p?.version?.number)||0;
  if(String(current)!==String(version))throw Error('Страница GDD в Confluence изменилась после черновика (версия '+current+') — подготовьте раздел заново.');
  const html=String(p?.body?.storage?.value||'');
  const sec=diff.storageSections(html).find(x=>diff.norm(x.title).replace(/^[\d.\s]+/,'')===diff.norm(title).replace(/^[\d.\s]+/,''));
  const part=diff.markdownToStorage(body);
  const value=sec?html.slice(0,sec.bodyStart)+part+html.slice(sec.end):html+'<h'+level+'>'+require('../google-drive/markdown.cjs').esc(title)+'</h'+level+'>'+part;
  try{await api('/wiki/api/v2/pages/'+encodeURIComponent(t.id),{method:'PUT',body:JSON.stringify({id:String(t.id),status:'current',title:String(p.title),body:{representation:'storage',value},version:{number:current+1,message:'Петя: раздел «'+title+'»'}})});}
  catch(e){if(!e?.status)e.message='Результат неизвестен — откройте страницу в Confluence, прежде чем повторять. '+e.message;throw e;}
  return {where:'Confluence · '+p.title};
 }
 const access=await googleToken(s,{write:true});
 const doc=await s.request(DOCS+'/'+encodeURIComponent(t.id),{headers:{Authorization:'Bearer '+access}});
 if(String(doc?.revisionId||'')!==String(version))throw Error('Google Документ изменился после черновика — подготовьте раздел заново.');
 const blocks=googleBlocks(doc);
 const plain=googleText(body);
 const at=blocks.findIndex(b=>b.level&&diff.norm(b.text).replace(/^[\d.\s]+/,'')===diff.norm(title).replace(/^[\d.\s]+/,''));
 const requests=[];
 if(at>=0){
  const head=blocks[at];let end=blocks.at(-1).end-1;
  for(const b of blocks.slice(at+1))if(b.level&&b.level<=head.level){end=b.start;break;}
  if(end>head.end)requests.push({deleteContentRange:{range:{startIndex:head.end,endIndex:end}}});
  requests.push({insertText:{location:{index:head.end},text:plain+'\n'}});
 }else{
  const index=Math.max(1,blocks.at(-1)?.end-1||1);
  requests.push({insertText:{location:{index},text:'\n'+title+'\n'+plain}});
  requests.push({updateParagraphStyle:{range:{startIndex:index+1,endIndex:index+1+title.length},paragraphStyle:{namedStyleType:'HEADING_'+Math.min(6,Math.max(1,level))},fields:'namedStyleType'}});
 }
 try{await s.request(DOCS+'/'+encodeURIComponent(t.id)+':batchUpdate',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({requests,writeControl:{requiredRevisionId:String(version)}})});}
 catch(e){if(!e?.status)e.message='Результат неизвестен — откройте документ, прежде чем повторять. '+e.message;throw e;}
 return {where:'Google Документы · '+doc.title};
}
// Markdown of a section → plain lines for a Google Doc (headings and table rows as text lines).
function googleText(markdown){
 const md=require('../google-drive/markdown.cjs');
 return md.blocks(markdown).map(b=>b.type==='heading'?md.plain(b.text):b.type==='li'?'• '+md.plain(b.text):b.type==='table'?b.rows.map(r=>r.map(md.plain).join(' · ')).join('\n'):b.type==='code'?b.text:md.plain(b.text)).join('\n');
}

module.exports={locate,parse,bind,bound,read,section,bodyOf,replaced,write,googleBlocks,googleText,fileCandidates,hash,projectId};
