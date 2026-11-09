// «Вики из обсуждений», reading an existing wiki page and publishing a draft — only from the card's buttons.
// - Confluence Cloud REST v2: `GET /wiki/api/v2/spaces?keys=…`, `POST /wiki/api/v2/pages` (a new page in the space of
//   the Atlassian connection), `GET /wiki/api/v2/pages/{id}?body-format=storage` and `PUT /wiki/api/v2/pages/{id}` with
//   the next version (an update replaces the page body; refused when the page changed since the draft).
// - Notion API (2025-09-03): `POST /v1/pages` under a parent page the integration can see, `PATCH
//   /v1/blocks/{id}/children` for the rest of the blocks (100 per request) and to append an update to an existing page.
// - Google Docs API v1: an update is appended to the existing document with `documents.batchUpdate` and the revision
//   guard (needs the Docs write scope); a new Google Doc goes through «Google Диск» (`document-export`), not here.
const md=require('../google-drive/markdown.cjs');
const diff=require('../doc-diff/diff.cjs');
const NOTION='https://api.notion.com/v1',DOCS='https://docs.googleapis.com/v1/documents';

const confluenceReady=settings=>require('../doc-diff/find.cjs').confluenceReady(settings);
const notionReady=settings=>settings.module_notion!=='false'&&!!(settings.notionToken||settings.notionCredential);
function googleReady(settings){try{return settings['extension_google-drive']==='true'&&require('../google-drive/auth.cjs').connected(settings);}catch{return false;}}
// Where a new page can go now.
function destinations(settings){
 const out=[];
 if(confluenceReady(settings)&&String(settings.confluenceSpace||'').trim())out.push('confluence');
 if(notionReady(settings))out.push('notion');
 if(googleReady(settings))out.push('google');
 return out;
}
const notionHeaders=s=>({Authorization:'Bearer '+(s.settings.notionCredential?'':String(s.settings.notionToken||'')),'Notion-Version':'2025-09-03','Content-Type':'application/json'});
const NOTION_ID=/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?:[?#]|$)/i;
function notionId(text){const m=NOTION_ID.exec(String(text||'').trim().replace(/\/+$/,''));return m?m[1].replace(/-/g,''):'';}

// --- Reading an existing page (for the diff and the version guard) --------------------------------------------------------
async function read(s,page){
 if(page.service==='confluence'){
  const p=await s.workspace.api('/wiki/api/v2/pages/'+encodeURIComponent(page.id)+'?body-format=storage',{},{...s.settings});
  return {text:diff.storageToMarkdown(p?.body?.storage?.value),version:String(p?.version?.number||''),title:String(p?.title||page.title)};
 }
 if(page.service==='notion'){
  const {Notion}=require('../../notion.cjs');
  const n=s.workspace?.notion||new Notion((u,o)=>s.request(u,o),()=>Promise.resolve());
  const c=await n.content(page.id,s.settings.notionToken,{full:true});
  return {text:c.text,version:'',title:page.title};
 }
 const auth=require('../google-drive/auth.cjs');
 const doc=await s.request(DOCS+'/'+encodeURIComponent(page.id)+'?includeTabsContent=true',{headers:{Authorization:'Bearer '+await auth.token(s)}});
 const t=require('../../google-workspace.cjs').docText(doc);
 return {text:t.text,version:String(doc?.revisionId||''),title:t.title||page.title};
}

// --- Notion blocks ---------------------------------------------------------------------------------------------------------
// Inline Markdown → rich text: plain words, `[text](https://…)` as links; every piece ≤ 2000 characters.
function rich(text){
 const out=[];const src=String(text||'');let at=0;
 const push=(content,link)=>{for(let i=0;i<content.length;i+=2000)out.push({type:'text',text:{content:content.slice(i,i+2000),...link?{link:{url:link}}:{}}});};
 for(const m of src.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)){if(m.index>at)push(md.plain(src.slice(at,m.index)));push(m[1],m[2]);at=m.index+m[0].length;}
 if(at<src.length)push(md.plain(src.slice(at)));
 return out.length?out:[{type:'text',text:{content:''}}];
}
function blocks(markdown,{dropTitle=true}={}){
 const out=[];
 for(const b of md.blocks(markdown)){
  if(b.type==='heading'){if(b.level===1&&dropTitle)continue;const t='heading_'+Math.min(3,Math.max(1,b.level-(dropTitle?1:0)||1));out.push({object:'block',type:t,[t]:{rich_text:rich(b.text)}});}
  else if(b.type==='li'){const t=b.ordered?'numbered_list_item':'bulleted_list_item';out.push({object:'block',type:t,[t]:{rich_text:rich(b.text)}});}
  else if(b.type==='quote')out.push({object:'block',type:'quote',quote:{rich_text:rich(b.text)}});
  else if(b.type==='code')out.push({object:'block',type:'code',code:{language:'plain text',rich_text:rich(b.text)}});
  else if(b.type==='table')for(const r of b.rows)out.push({object:'block',type:'paragraph',paragraph:{rich_text:rich(r.join(' · '))}});
  else out.push({object:'block',type:'paragraph',paragraph:{rich_text:rich(b.text)}});
 }
 return out;
}

// --- Publishing (card buttons only) --------------------------------------------------------------------------------------------
const unknown=(e,where)=>{if(!e?.status)e.message='Результат неизвестен — проверьте '+where+', прежде чем повторять. '+e.message;return e;};
async function confluence(s,{title,text,page,version}){
 const settings={...s.settings},api=(r,o={})=>s.workspace.api(r,o,settings);
 const value=diff.markdownToStorage(text,{dropTitle:true});
 const site=String(settings.jiraUrl||'').replace(/\/+$/,'');
 const url=webui=>String(webui||'').startsWith('/')?site+'/wiki'+webui:'';
 if(page){
  const p=await api('/wiki/api/v2/pages/'+encodeURIComponent(page.id)+'?body-format=storage');
  const current=Number(p?.version?.number)||0;
  if(version&&String(current)!==String(version))throw Error('Страница «'+p.title+'» изменилась после черновика (версия '+current+'). Подготовьте черновик заново.');
  try{const r=await api('/wiki/api/v2/pages/'+encodeURIComponent(page.id),{method:'PUT',body:JSON.stringify({id:String(page.id),status:'current',title:String(p.title),body:{representation:'storage',value},version:{number:current+1,message:'Петя: итоги обсуждения'}})});
   return {url:url(r?._links?.webui)||site+'/wiki/pages/viewpage.action?pageId='+encodeURIComponent(page.id),text:'Страница «'+p.title+'» обновлена в Confluence'};}
  catch(e){throw unknown(e,'страницу в Confluence');}
 }
 const key=String(settings.confluenceSpace||'').trim();
 if(!key)throw Error('Выберите пространство Confluence в подключении Atlassian.');
 const spaces=await api('/wiki/api/v2/spaces?'+new URLSearchParams({keys:key,limit:'1'}));
 const space=(spaces?.results||[])[0];if(!space?.id)throw Error('Пространство Confluence «'+key+'» не найдено.');
 try{const r=await api('/wiki/api/v2/pages',{method:'POST',body:JSON.stringify({spaceId:String(space.id),status:'current',title:String(title).slice(0,250),body:{representation:'storage',value}})});
  return {url:url(r?._links?.webui),text:'Страница «'+title+'» создана в Confluence'};}
 catch(e){throw unknown(e,'пространство «'+key+'» в Confluence');}
}
async function notion(s,{title,text,page,parent,now=new Date()}){
 const headers=notionHeaders(s),call=(route,method,body)=>s.request(NOTION+route,{method,headers,body:JSON.stringify(body)});
 const list=blocks(text);
 const append=async(id,items)=>{for(let i=0;i<items.length;i+=100)await call('/blocks/'+id+'/children','PATCH',{children:items.slice(i,i+100)});};
 if(page){
  const stamp=now.toISOString().slice(0,10);
  try{await append(page.id,[{object:'block',type:'heading_2',heading_2:{rich_text:rich('Обновление от '+stamp)}},...list]);}catch(e){throw unknown(e,'страницу в Notion');}
  return {url:'https://www.notion.so/'+String(page.id).replace(/-/g,''),text:'В страницу «'+page.title+'» добавлено обновление'};
 }
 const id=notionId(parent);
 if(!id)throw Error('Вставьте ссылку на родительскую страницу Notion, открытую для интеграции Пети.');
 let created;
 try{created=await call('/pages','POST',{parent:{page_id:id},properties:{title:{title:rich(title)}},children:list.slice(0,100)});await append(created.id,list.slice(100));}
 catch(e){throw unknown(e,'Notion');}
 return {url:/^https:\/\/(?:www\.)?notion\.so\//.test(String(created?.url||''))?created.url:'https://www.notion.so/'+String(created?.id||'').replace(/-/g,''),text:'Страница «'+title+'» создана в Notion'};
}
async function google(s,{text,page,version,now=new Date()}){
 const auth=require('../google-drive/auth.cjs'),workspace=require('../../google-workspace.cjs');
 const settings=s.settings;
 const access=auth.mode(settings)==='service'?await workspace.token(s,'docs',{mode:'service',credential:settings.googleDriveCredential,write:true}):await workspace.token(s,'docs',{mode:'account',account:auth.chosen(settings)?.key||'',write:true});
 const doc=await s.request(DOCS+'/'+encodeURIComponent(page.id),{headers:{Authorization:'Bearer '+access}});
 if(version&&String(doc?.revisionId||'')!==String(version))throw Error('Документ «'+doc.title+'» изменился после черновика. Подготовьте черновик заново.');
 const end=Math.max(1,(doc?.body?.content||[]).at(-1)?.endIndex-1||1);
 const heading='Обновление от '+now.toISOString().slice(0,10);
 const body=require('../gdd/target.cjs').googleText(text.replace(/^#\s+.*\n+/,''));
 const requests=[{insertText:{location:{index:end},text:'\n'+heading+'\n'+body}},{updateParagraphStyle:{range:{startIndex:end+1,endIndex:end+1+heading.length},paragraphStyle:{namedStyleType:'HEADING_2'},fields:'namedStyleType'}}];
 try{await s.request(DOCS+'/'+encodeURIComponent(page.id)+':batchUpdate',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({requests,writeControl:{requiredRevisionId:String(doc.revisionId)}})});}
 catch(e){throw unknown(e,'документ');}
 return {url:'https://docs.google.com/document/d/'+page.id+'/edit',text:'В документ «'+doc.title+'» добавлено обновление'};
}

module.exports={destinations,confluenceReady,notionReady,googleReady,read,blocks,rich,notionId,confluence,notion,google};
