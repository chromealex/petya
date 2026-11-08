// «Размер билда», renderer: total with delta, a stacked bar by category (before/after for two builds),
// a legend with sizes and deltas, the top grown (or largest) files with bars, warnings, and all files on demand.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('build-cards.css',document.currentScript.src).href;document.head.append(style);
 const MB=1048576;
 const loc=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>{const a=Math.abs(n);return a>=MB*1000?(n/MB/1024).toLocaleString(loc(),{maximumFractionDigits:2})+' ГБ':a>=MB?(n/MB).toLocaleString(loc(),{maximumFractionDigits:1})+' МБ':a>=1024?Math.round(n/1024).toLocaleString(loc())+' КБ':n+' Б';};
 const signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));
 const pct=(d,base)=>base?(d>0?'+':d<0?'−':'')+Math.abs(Math.round(d/base*1000)/10).toLocaleString(loc())+'%':'';
 const COLORS={dex:'#8fb7e8',binary:'#8fb7e8',frameworks:'#b59ce0',unity:'#e5ce8c',addressables:'#e9a970',streaming:'#cfa95a',assets:'#c9ed9d',resources:'#9fd3c7',debug:'#f0b4a8',other:'#7d848c'};
 const NATIVE=['#4fb286','#3d9a8c','#6cc4a4','#2f7f74','#86d6b8'];
 const color=(key,natives)=>key.startsWith('native:')?NATIVE[Math.max(0,natives.indexOf(key))%NATIVE.length]:COLORS[key]||'#7d848c';
 const noI18n=n=>{n.setAttribute('data-no-i18n','');return n;};
 const ident=b=>b.name+(b.version?' · '+b.version+(b.build?' ('+b.build+')':''):'');

 function stacked(k,categories,pick,scale,natives,caption){
  const row=k.el('div','bsize-row');row.append(k.el('span','bsize-row-label',caption));
  const bar=k.el('div','bsize-bar');bar.setAttribute('role','img');
  const total=categories.reduce((n,c)=>n+pick(c),0);
  bar.setAttribute('aria-label',caption+': '+categories.filter(c=>pick(c)>0).map(c=>c.label+' '+fmt(pick(c))).join(', '));
  const fill=k.el('div','bsize-fill');fill.style.width=(scale?100*total/scale:0)+'%';
  for(const c of categories){const v=pick(c);if(v<=0)continue;const seg=k.el('span','bsize-seg');seg.style.flexGrow=String(v);seg.style.background=color(c.key,natives);seg.title=c.label+' — '+fmt(v)+' ('+Math.round(100*v/(total||1))+'%)';fill.append(seg);}
  bar.append(fill);row.append(bar,k.el('span','bsize-row-total',fmt(total)));return row;
 }
 function legend(k,c,natives,diff){
  const total=c.categories.reduce((n,x)=>n+x.compressed,0)||1;
  const box=k.el('div','bsize-legend');
  for(const x of [...c.categories].sort((p,q)=>q.compressed-p.compressed)){
   if(!x.compressed&&!x.before?.compressed)continue;
   const row=k.el('div','bsize-legend-row');const sw=k.el('span','bsize-swatch');sw.style.background=color(x.key,natives);
   row.append(sw,k.el('span','bsize-legend-label',x.label),k.el('span','bsize-num',fmt(x.compressed)));
   if(diff){const d=x.compressed-x.before.compressed;row.append(k.el('span','bsize-num bsize-delta'+(d>0?' up':d<0?' down':''),d?signed(d):'—'));}
   else row.append(k.el('span','bsize-num muted',Math.round(100*x.compressed/total)+'%'));
   row.title=['Файлов: '+x.count,'Распаковано: '+fmt(x.size),diff?'Было распаковано: '+fmt(x.before.size):''].filter(Boolean).join(' · ');
   box.append(row);
  }
  return box;
 }
 function barCell(k,value,max,tone){const box=k.el('span','bsize-cell-bar');const fill=k.el('span',tone);fill.style.width=Math.max(2,100*value/(max||1))+'%';box.append(fill);return box;}
 // Long archive paths keep the top folder and the file name: «assets/…/atlas.bundle»; the full path is the tooltip.
 const short=p=>{if(p.length<=32)return p;const parts=p.split('/'),file=parts.at(-1);if(file.length>28)return '…'+p.slice(-29);const dir=parts.length>1?parts[0]+'/…/':'';return (dir+file).length<=32?dir+file:'…/'+file;};
 const pathCell=(k,p)=>{const n=k.el('span','bsize-path',short(p));n.title=p;n.setAttribute('data-no-i18n','');return n;};
 function grownTable(k,rows){
  const max=Math.max(...rows.map(r=>r.delta),1);
  return k.table([
   {label:'Файл',value:r=>pathCell(k,r.path)},
   {label:'Было → стало',value:r=>{const n=k.el('span','bsize-num');n.append(r.status==='new'?k.el('span','muted','Новый файл'):fmt(r.before),' → '+fmt(r.after));return n;}},
   {label:'Δ',value:r=>k.el('span','bsize-num bsize-delta up',signed(r.delta))},
   {label:'',value:r=>barCell(k,r.delta,max,'up')}],rows);
 }
 function largestTable(k,rows){
  const max=Math.max(...rows.map(r=>r.compressed),1);
  return k.table([
   {label:'Файл',value:r=>pathCell(k,r.path)},
   {label:'В архиве',value:r=>k.el('span','bsize-num',fmt(r.compressed))},
   {label:'Распаковано',value:r=>{const n=k.el('span','bsize-num muted',fmt(r.size));if(r.stored)n.title='Хранится без сжатия';return n;}},
   {label:'',value:r=>barCell(k,r.compressed,max,'')}],rows);
 }
 function allFiles(k,c,diff){
  const box=k.el('div','bsize-all');box.hidden=true;
  const rows=c.files.map(f=>k.el('div','bsize-file'));
  c.files.forEach((f,i)=>{const size=k.el('span','bsize-num'+(diff?' bsize-delta'+(f.delta>0?' up':' down'):''),diff?signed(f.delta):fmt(f.compressed));if(diff&&f.status!=='changed')size.title=f.status==='new'?'Новый файл':'Файл удалён';rows[i].append(pathCell(k,f.path),size,k.el('span','bsize-num muted',diff?fmt(f.before)+' → '+fmt(f.after):fmt(f.size)));});
  box.append(k.el('small','kit-meta',diff?'Изменившиеся файлы по размеру изменения. Размеры — в архиве.':'Файлы по размеру в архиве. Справа — распакованный размер.'));
  if(c.fileCount>c.files.length)box.append(k.el('small','kit-meta','Показано файлов: '+c.files.length+' из '+c.fileCount));
  box.append(k.collapse(rows,40,'Показать ещё'));
  return box;
 }

 window.renderBuildSize=(parent,c)=>{
  const k=window.resultKit;if(!k||!c?.builds?.length||parent.querySelector('.bsize-card'))return;
  const diff=c.mode==='diff'&&c.builds.length===2,[a,b]=diff?c.builds:[null,c.builds[0]];
  const natives=c.categories.map(x=>x.key).filter(x=>x.startsWith('native:'));
  const body=k.el('div','bsize-body');
  // Total and delta.
  const head=k.el('div','bsize-total');
  head.append(k.el('span','bsize-big',fmt(b.bytes)));
  if(diff){const d=b.bytes-a.bytes;head.append(k.el('span','bsize-delta-big'+(d>0?' up':d<0?' down':''),signed(d)+' · '+pct(d,a.bytes)));}
  head.append(k.el('span','bsize-sub','Распаковано: '+fmt(b.size)+(diff?' ('+signed(b.size-a.size)+')':'')),k.el('span','bsize-sub','Файлов: '+b.files.toLocaleString(loc())));
  body.append(head);
  if(diff){const who=k.el('p','bsize-who');who.append(k.el('span','muted','Старый билд: '),noI18n(k.el('b',null,ident(a))),k.el('br'),k.el('span','muted','Новый билд: '),noI18n(k.el('b',null,ident(b))),k.el('span','muted',' · '+c.basis));body.append(who);}
  // Stacked bars on one scale.
  const bars=k.el('div','bsize-bars');
  if(diff){const scale=Math.max(a.compressed,b.compressed);bars.append(stacked(k,c.categories,x=>x.before.compressed,scale,natives,'Было'),stacked(k,c.categories,x=>x.compressed,scale,natives,'Стало'));}
  else bars.append(stacked(k,c.categories,x=>x.compressed,b.compressed,natives,'В архиве'));
  body.append(bars,legend(k,c,natives,diff));
  if(c.modules?.length>1){const mods=k.el('div','bsize-modules');mods.append(k.el('small','kit-meta','Модули AAB'));for(const m of c.modules){const chip=noI18n(k.chip({label:m.name+' · '+fmt(m.compressed)+(diff&&m.compressed!==m.before.compressed?' ('+signed(m.compressed-m.before.compressed)+')':'')}));mods.append(chip);}body.append(mods);}
  // Files.
  if(diff){
   if(c.grown.length){body.append(k.el('h5','bsize-h','Что выросло больше всего'),grownTable(k,c.grown));}
   else body.append(k.el('p','bsize-who','Ни один файл не вырос.'));
   if(c.added||c.removed)body.append(k.el('small','kit-meta',['Новых файлов: '+c.added,'Удалённых файлов: '+c.removed].join(' · ')));
  }else if(c.largest?.length)body.append(k.el('h5','bsize-h','Крупнейшие файлы'),largestTable(k,c.largest));
  // Warnings.
  if(c.warnings?.length){const ul=k.el('ul','bsize-warnings');for(const w of c.warnings){const li=k.el('li',w.level);li.append(k.el('span','bsize-mark',w.level==='warn'?'!':'i'),k.el('span',null,w.text));ul.append(li);}body.append(ul);}
  if(c.note)body.append(k.el('p','bsize-note',c.note));
  const all=allFiles(k,c,diff);body.append(all);
  const grew=diff?b.bytes-a.bytes:0;
  const status=diff?{label:grew>0?'Вырос: '+signed(grew):grew<0?'Уменьшился: '+signed(grew):'Без изменений',tone:grew>a.bytes*0.01?'alert':grew>0?'progress':'done'}:
   {label:c.warnings?.some(w=>w.level==='warn')?'Есть замечания':'Без замечаний',tone:c.warnings?.some(w=>w.level==='warn')?'progress':'done'};
  const actions=[
   {label:'Показать все файлы',run:btn=>{all.hidden=!all.hidden;btn.dataset.open=String(!all.hidden);btn.textContent=all.hidden?'Показать все файлы':'Скрыть файлы';}},
   {label:'Что сжать?',primary:true,run:()=>k.ask('Что сжать в этом билде?',{send:true})}];
  if(window.petya?.feature)actions.push({label:diff?'Другие билды…':'Сравнить с другим…',title:'Выбрать APK, AAB или IPA на диске',run:async()=>{
   const files=await window.petya.feature('buildSize','pick');if(!files?.length)return;
   const list=diff||files.length>1?files:[b.path,files[0]];
   await k.ask((list.length>1?'Сравни размер билдов ':'Размер билда ')+list.map(p=>'«'+p+'»').join(' и '),{send:true});}});
  const card=k.card({app:'Размер билда',initial:'⇲',color:'#5b6b3c',key:diff?a.name+' → '+b.name:b.name,status,subtitle:(b.kind||'').toUpperCase()+(!diff&&b.version?' · '+b.version+(b.build?' ('+b.build+')':''):''),body,actions,className:'bsize-card'});
  card.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(card);
 };
})();
