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
 // --- Full view in the side panel ------------------------------------------------------------------
 const kit=()=>window.resultKit;
 function textView(text,kind){
  const box=el('div','file-full'),tools=el('div','file-full-tools'),find=el('input');find.type='search';find.placeholder='Найти в файле';find.setAttribute('aria-label',find.placeholder);
  const count=el('span','file-full-count'),wrap=el('button',null,'Перенос строк');wrap.type='button';wrap.setAttribute('aria-pressed','false');
  const copy=el('button',null,'Копировать');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='Скопировано';setTimeout(()=>copy.textContent='Копировать',1500);}catch{}};
  const lines=text.split(/\r?\n/),shown=lines.slice(0,20000);
  const code=el('div','file-code'+(kind==='code'?' mono':''));
  const paint=q=>{code.replaceChildren();let hits=0;const needle=q.toLocaleLowerCase();
   shown.forEach((line,i)=>{const row=el('div','file-line');row.append(el('span','file-ln',i+1));const t=el('span','file-lt');
    if(needle&&line.toLocaleLowerCase().includes(needle)){let at=0,low=line.toLocaleLowerCase(),pos;while((pos=low.indexOf(needle,at))>=0){t.append(document.createTextNode(line.slice(at,pos)),el('mark',null,line.slice(pos,pos+needle.length)));hits++;at=pos+needle.length;}t.append(document.createTextNode(line.slice(at)));}
    else t.textContent=line||' ';row.append(t);code.append(row);});
   count.textContent=needle?'Совпадений: '+hits:lines.length.toLocaleString('ru-RU')+' строк'+(lines.length>shown.length?' · показаны первые 20 000':'');
   code.querySelector('mark')?.scrollIntoView({block:'center'});};
  let timer;find.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>paint(find.value.trim()),150);};
  find.onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const marks=[...code.querySelectorAll('mark')];if(!marks.length)return;const i=(marks.findIndex(m=>m.classList.contains('current'))+1)%marks.length;marks.forEach(m=>m.classList.remove('current'));marks[i].classList.add('current');marks[i].scrollIntoView({block:'center'});};
  wrap.onclick=()=>{const on=wrap.getAttribute('aria-pressed')!=='true';wrap.setAttribute('aria-pressed',String(on));code.classList.toggle('wrap',on);};
  tools.append(find,count,wrap,copy);box.append(tools,code);paint('');return box;
 }
 function tableView(text){
  const sep=text.split('\n',1)[0].includes('\t')?'\t':text.split('\n',1)[0].includes(';')&&!text.split('\n',1)[0].includes(',')?';':',';
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')q=false;else cur+=c;}else if(c==='"')q=true;else if(c===sep){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const rows=text.split(/\r?\n/).filter(Boolean).map(parse),head=rows[0]||[],data=rows.slice(1,5001);
  const box=el('div','file-full'),info=el('div','file-full-tools');info.append(el('span','file-full-count',(rows.length-1).toLocaleString('ru-RU')+' строк · '+head.length+' столбцов'+(rows.length-1>5000?' · показаны первые 5 000':'')+' · нажмите на заголовок, чтобы отсортировать'));
  const wrapT=el('div','file-full-table'),t=el('table');const thead=el('thead'),tr=el('tr');const tbody=el('tbody');let order={col:-1,dir:1};
  const num=v=>{const n=Number(String(v).replace(/\s/g,'').replace(',','.').replace(/%$/,''));return Number.isFinite(n)&&String(v).trim()!==''?n:null;};
  const fill=()=>{tbody.replaceChildren();const sorted=order.col<0?data:[...data].sort((a,b)=>{const x=a[order.col]??'',y=b[order.col]??'',nx=num(x),ny=num(y);return order.dir*(nx!==null&&ny!==null?nx-ny:String(x).localeCompare(String(y),'ru'));});
   for(const r of sorted){const row=el('tr');head.forEach((_,i)=>row.append(el('td',num(r[i])!==null?'num':'',r[i]??'')));tbody.append(row);}};
  head.forEach((h,i)=>{const th=el('th');const b=el('button',null,h||('Столбец '+(i+1)));b.type='button';b.onclick=()=>{order=order.col===i?{col:i,dir:-order.dir}:{col:i,dir:1};for(const x of thead.querySelectorAll('th'))x.removeAttribute('aria-sort');th.setAttribute('aria-sort',order.dir>0?'ascending':'descending');fill();};th.append(b);tr.append(th);});
  thead.append(tr);t.append(thead,tbody);wrapT.append(t);fill();box.append(info,wrapT);return box;
 }
 function imageView(data){
  const box=el('div','file-full file-full-image'),img=el('img');img.src='data:image/png;base64,'+data.image;img.alt=data.name||'';
  const zoom=el('button',null,'100%');zoom.type='button';zoom.title='Реальный размер / по ширине панели';zoom.onclick=()=>{const on=box.classList.toggle('actual');zoom.textContent=on?'По ширине':'100%';};
  img.onload=()=>{info.textContent=img.naturalWidth+' × '+img.naturalHeight+' px';};const info=el('span','file-full-count');
  const tools=el('div','file-full-tools');tools.append(info,zoom);const frame=el('div','file-image-frame');frame.append(img);box.append(tools,frame);return box;
 }
 let selected=null;
 async function show(file,node){
  const k=kit();if(!k?.panel){window.openChatAttachment?.(file,topicId());return;}
  const id='file:'+file.id,topic=topicId();
  if(k.panelOpen(id)){k.closePanel();return;}
  selected?.classList.remove('selected');selected=node;node.classList.add('selected');
  const ask={label:'Спросить',title:'Спросить Петю об этом файле',run:()=>k.ask('По файлу «'+(file.name||'')+'»: ')};
  const p=k.panel({id,title:file.name||'Файл',subtitle:file.note||'',actions:[ask]});
  let data;
  try{data=await window.petya.chatAttachmentPreview(topic,file.id);}
  catch(e){if(file.thumbnail)data={name:file.name,image:file.thumbnail,note:'Сохранённое превью изображения.'};else{p?.set(el('p','file-note',e.message));return;}}
  // Images saved only as a thumbnail still open, as the reduced copy.
  if(!data.image&&!data.text&&typeof file.thumbnail==='string')data={...data,image:file.thumbnail,note:data.note||'Сохранена уменьшенная копия изображения.'};
  const kind=kindOf(file);let view;
  if(data.modelFormat&&window.chatModelFrame)view=window.chatModelFrame(data);
  else if(data.image&&/^[A-Za-z0-9+/=]+$/.test(data.image))view=imageView(data);
  else if(data.text&&kind==='table')view=tableView(data.text);
  else if(data.text)view=textView(data.text,kind);
  else view=el('p','file-note',data.note||'Для этого файла нет сохранённого содержимого.');
  p?.set(view);
 }
 document.addEventListener('petya-panel',e=>{if(!e.detail.open&&selected&&e.detail.id?.startsWith('file:')){selected.classList.remove('selected');selected=null;}});

 const visible=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visible.unobserve(e.target);e.target.load?.();}},{rootMargin:'200px'});

 function card(file){
  const kind=kindOf(file),node=el('div','file-preview kind-'+kind);node.title=file.note||file.name||'';
  const open=()=>show(file,node);
  node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label','Показать '+(file.name||'файл')+' справа');
  node.onclick=e=>{if(e.target.closest('.file-actions'))return;open();};node.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===node){e.preventDefault();open();}};
  if(kind==='image'&&typeof file.thumbnail==='string'&&/^[A-Za-z0-9+/=]+$/.test(file.thumbnail)&&file.thumbnail.length<2*1024*1024){
   const b=el('button','file-thumb');b.type='button';b.setAttribute('aria-label','Открыть '+(file.name||'изображение'));const img=el('img');img.src='data:image/png;base64,'+file.thumbnail;img.alt='';img.loading='lazy';b.append(img);b.onclick=e=>{e.stopPropagation();open();};node.append(b);
  }
  const head=el('div','file-head');const icon=el('span','file-badge',badge[kind]);icon.setAttribute('aria-hidden','true');
  const name=el('button','file-name',file.name||'Файл');name.type='button';name.title='Показать справа';name.onclick=e=>{e.stopPropagation();open();};
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
