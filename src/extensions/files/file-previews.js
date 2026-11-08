// Files plugin, renderer: previews for files attached to a message — image thumbnails, the first lines of
// text and code, a small table for CSV/TSV, a page for PDF/DOCX text, and 3D/video badges. Text is loaded
// lazily (only when the card scrolls into view) from the chat's saved copy of the file.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('file-previews.css',document.currentScript.src).href;document.head.append(style);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
 const ext=name=>(String(name||'').match(/\.([a-z0-9]{1,8})$/i)?.[1]||'').toLowerCase();
 const kinds={
  table:['csv','tsv'],code:['js','cjs','mjs','ts','tsx','jsx','py','cs','java','kt','swift','go','rs','rb','php','c','h','cpp','hpp','m','sh','ps1','sql','lua','gd','shader','hlsl','glsl','yml','yaml','toml','ini','xml','html','css','json'],
  text:['txt','md','log','rtf','srt','vtt'],doc:['pdf','docx','doc','odt','pptx','xlsx','xls','pages','key','numbers'],
  model:['fbx','obj','gltf','glb','blend','stl','usdz'],audio:['mp3','wav','m4a','ogg','flac','aac'],video:['mp4','mov','webm','mkv','avi']
 };
 const kindOf=file=>{if(file.modelFormat)return 'model';if(file.thumbnail||file.image)return 'image';if(file.video)return 'video';const e=ext(file.name);for(const [k,list] of Object.entries(kinds))if(list.includes(e))return k;return 'text';};
 const badge={table:'CSV',code:'</>',text:'TXT',doc:'DOC',model:'3D',audio:'♪',video:'▶',image:'IMG'};
 const topicId=()=>typeof topicSelect!=='undefined'?topicSelect.value:'';

 function table(text){
  const sep=text.split('\n',1)[0].includes('\t')?'\t':text.split('\n',1)[0].includes(';')&&!text.split('\n',1)[0].includes(',')?';':',';
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')q=false;else cur+=c;}else if(c==='"')q=true;else if(c===sep){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const lines=text.split(/\r?\n/).filter(Boolean),rows=lines.slice(0,6).map(parse),cols=Math.min(6,Math.max(...rows.map(r=>r.length)));
  const t=el('table','file-table');rows.forEach((r,i)=>{const tr=el('tr');for(let c=0;c<cols;c++)tr.append(el(i?'td':'th',null,(r[c]||'').slice(0,40)));t.append(tr);});
  const box=el('div','file-table-wrap');box.append(t);if(lines.length>6)box.append(el('div','file-more',(lines.length-1).toLocaleString('ru-RU')+' строк'));return box;
 }
 function lines(text,kind){
  const all=text.split(/\r?\n/),shown=all.slice(0,kind==='code'?8:6).map(l=>l.slice(0,160)).join('\n');
  const pre=el('pre','file-lines'+(kind==='code'?' code':''),shown);
  const box=el('div');box.append(pre);if(all.length>8)box.append(el('div','file-more',all.length.toLocaleString('ru-RU')+' строк'));return box;
 }
 async function fill(body,file,kind){
  try{
   const data=await window.petya.chatAttachmentPreview(topicId(),file.id);
   const text=String(data?.text||'');
   if(!text.trim()){body.replaceChildren(el('div','file-note',data?.note||file.note||'Превью недоступно'));return;}
   body.replaceChildren(kind==='table'?table(text):lines(text,kind));
  }catch(e){body.replaceChildren(el('div','file-note',file.note||e.message));}
 }
 const visible=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visible.unobserve(e.target);e.target.load?.();}},{rootMargin:'200px'});

 function card(file){
  const kind=kindOf(file),node=el('div','file-preview kind-'+kind);node.title=file.note||file.name||'';
  const open=()=>window.openChatAttachment?.(file,topicId());
  if(kind==='image'&&typeof file.thumbnail==='string'&&/^[A-Za-z0-9+/=]+$/.test(file.thumbnail)&&file.thumbnail.length<2*1024*1024){
   const b=el('button','file-thumb');b.type='button';b.setAttribute('aria-label','Открыть '+(file.name||'изображение'));const img=el('img');img.src='data:image/png;base64,'+file.thumbnail;img.alt='';img.loading='lazy';b.append(img);b.onclick=open;node.append(b);
  }
  const head=el('div','file-head');const icon=el('span','file-badge',badge[kind]);icon.setAttribute('aria-hidden','true');
  const name=el('button','file-name',file.name||'Файл');name.type='button';name.title='Открыть';name.onclick=open;
  head.append(icon,name);
  const actions=el('div','file-actions');
  const ask=el('button',null,'Спросить');ask.type='button';ask.title='Спросить Петю об этом файле';ask.onclick=()=>{const c=document.getElementById('command');if(!c)return;c.value='По файлу «'+(file.name||'')+'»: ';c.focus();};
  actions.append(ask);head.append(actions);node.append(head);
  if(['table','code','text','doc'].includes(kind)){const body=el('div','file-body');body.append(el('div','file-note','…'));body.load=()=>fill(body,file,kind);node.append(body);visible.observe(body);}
  else if(kind==='model')node.append(el('div','file-note','3D-модель · откройте, чтобы покрутить'));
  else if(kind==='video'||kind==='audio')node.append(el('div','file-note',file.note||(kind==='video'?'Видео':'Аудио')));
  return node;
 }

 window.renderFilePreviews=(parent,files)=>{
  if(!Array.isArray(files)||!files.length||parent.querySelector(':scope>.file-previews'))return;
  parent.querySelector(':scope>.message-attachments')?.remove();
  const box=el('div','file-previews');files.slice(0,8).forEach(f=>box.append(card(f)));
  if(files.length>8)box.append(el('div','file-more','Ещё файлов: '+(files.length-8)));
  parent.append(box);
 };
})();
