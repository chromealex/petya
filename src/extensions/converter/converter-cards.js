// «Конвертер», renderer: input files with thumbnails, the planned operation as editable chips (format, size,
// quality, target weight, height, fps, trim, metadata, loudness, output folder), the estimated result size,
// per-file progress with «Отменить» while it runs, and results as before → after bars with «Показать в Finder».
// Nothing is converted until «Конвертировать» is pressed.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('converter-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('converter',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const U=unit=>' '+(/^ru/i.test(locale())?unit:({ГБ:'GB',МБ:'MB',КБ:'KB',Б:'B'}[unit]||unit));
 function human(bytes){const n=Number(bytes)||0;for(const [d,u] of [[1024**3,'ГБ'],[1024**2,'МБ'],[1024,'КБ']])if(n>=d)return (n/d).toLocaleString(locale(),{maximumFractionDigits:n/d>=100?0:1})+U(u);return n+U('Б');}
 const TARGETS={image:['png','jpg','webp','tiff','gif'],video:['mp4','mov','webm','gif'],audio:['mp3','wav','ogg','m4a'],document:['pdf']};
 const GLYPH={video:'▶',audio:'♪',document:'▤',image:'▣'};
 const finder=c=>(c.platform||window.petyaPlatform)==='win32'?'Показать в Проводнике':'Показать в Finder';

 // Thumbnails are asked once per card and file, not on every repaint.
 const thumbs=new Map();
 const thumbnail=(c,i)=>{const key=c.id+'\n'+i;if(!thumbs.has(key))thumbs.set(key,call('thumbnail',c.id,i).catch(()=>''));return thumbs.get(key);};
 function tiles(k,c){
  const box=k.el('div','conv-files');
  c.files.slice(0,8).forEach((f,i)=>{
   const tile=k.el('figure','conv-file');tile.title=f.dir+'/'+f.name;tile.dataset.noI18n='';
   const thumb=k.el('div','conv-thumb kind-'+(f.kind||'file'));thumb.append(k.el('span','conv-glyph',GLYPH[f.kind]||'·'));
   thumb.append(k.el('span','conv-ext',(f.name.split('.').pop()||'').toUpperCase()));
   if(f.kind==='image'||f.kind==='video')thumbnail(c,i).then(url=>{if(!/^data:image\/(png|jpeg);base64,/.test(url||''))return;const img=k.el('img');img.alt='';img.src=url;thumb.classList.add('has-image');thumb.prepend(img);}).catch(()=>{});
   const cap=k.el('figcaption');cap.append(k.el('span','conv-name',f.name),k.el('small','conv-size',human(f.bytes)+(f.width?' · '+f.width+'×'+f.height:'')));
   tile.append(thumb,cap);box.append(tile);
  });
  if(c.count>8)box.append(k.el('div','conv-more','+'+(c.count-8)));
  return box;
 }
 // Chips of the plan; each edit goes to the main process (validated there) and repaints with the new estimate.
 function chips(k,c,edit,busy){
  const p=c.params||{},out=[];
  const menu=(label,options,current,apply)=>k.chip({label,menu:async()=>options.map(([value,text])=>({label:text,value,current:value===current})),pick:o=>edit(apply(o.value)),editable:!busy});
  out.push(menu('Формат: '+(c.to?c.to.toUpperCase():'как есть'),(TARGETS[c.kind]||[]).map(f=>[f,f.toUpperCase()]),c.to,v=>({to:v})));
  if(c.kind==='image'){
   out.push(menu(p.maxSide?'Размер: до '+p.maxSide+' px':'Размер: исходный',[[null,'Исходный'],[512,'до 512 px'],[1024,'до 1024 px'],[1600,'до 1600 px'],[2048,'до 2048 px']],p.maxSide??null,v=>({params:{maxSide:v}})));
   out.push(menu(p.quality?'Качество: '+p.quality:'Качество: авто',[[null,'Авто'],[95,'95'],[85,'85'],[75,'75'],[60,'60']],p.quality??null,v=>({params:{quality:v}})));
  }
  if(c.kind==='video'){
   out.push(menu(p.targetBytes?'Вес: до '+human(p.targetBytes):'Вес: без цели',[[null,'Без цели'],[5*1048576,'до 5 МБ'],[10*1048576,'до 10 МБ'],[25*1048576,'до 25 МБ'],[50*1048576,'до 50 МБ']],p.targetBytes??null,v=>({params:{targetBytes:v}})));
   out.push(menu(p.height?'Высота: '+p.height+'p':'Высота: исходная',[[null,'Исходная'],[1080,'1080p'],[720,'720p'],[480,'480p']],p.height??null,v=>({params:{height:v}})));
   out.push(menu(p.fps?'Кадров: '+p.fps+' к/с':'Кадров: '+(c.to==='gif'?'12/с':'как есть'),[[null,c.to==='gif'?'12/с (по умолчанию)':'Как есть'],[10,'10/с'],[15,'15/с'],[24,'24/с'],[30,'30/с']],p.fps??null,v=>({params:{fps:v}})));
   out.push(k.chip({label:p.trim?'Отрезок: '+p.trim.start+'–'+p.trim.end+' сек':'Отрезок: всё видео',onClick:()=>edit(null,'trim'),editable:!busy}));
  }
  if(c.kind==='audio'){
   out.push(k.chip({label:p.normalize?'Громкость: выровнять':'Громкость: как есть',onClick:()=>edit({params:{normalize:!p.normalize}}),editable:!busy}));
   out.push(k.chip({label:p.compress?'Сжатие: сильнее':'Сжатие: обычное',onClick:()=>edit({params:{compress:!p.compress}}),editable:!busy}));
  }
  if(c.kind!=='document')out.push(k.chip({label:p.strip?'Метаданные: убрать':'Метаданные: оставить',onClick:()=>edit({params:{strip:!p.strip}}),editable:!busy}));
  const where=k.chip({label:c.outDir?'Куда: '+c.outDir.split(/[\\/]/).filter(Boolean).pop():'Куда: рядом с исходниками',menu:async()=>[{label:'Рядом с исходниками',value:'',current:!c.outDir},{label:'Выбрать папку…',value:'pick',current:false}],pick:o=>edit(null,o.value==='pick'?'folder':'reset'),editable:!busy});
  if(c.outDir){where.title=c.outDir;where.dataset.noI18n='';}
  out.push(where);
  return out;
 }
 // Before → after: two bars on one scale.
 function compare(k,before,after,{estimate=false}={}){
  const max=Math.max(before,after||0,1),box=k.el('div','conv-compare');
  const row=(label,bytes,cls)=>{const r=k.el('div','conv-bar-row '+cls);const track=k.el('span','conv-track');const fill=k.el('span','conv-fill');fill.style.width=Math.max(1,100*bytes/max).toFixed(1)+'%';track.append(fill);r.append(k.el('span','conv-bar-label',label),track,k.el('span','conv-bar-size',(estimate&&cls==='after'?'≈ ':'')+human(bytes)));return r;};
  box.append(row('было',before,'before'));
  if(Number.isFinite(after)&&after>0)box.append(row(estimate?'будет':'стало',after,'after'+(after>before?' grew':'')));
  box.setAttribute('role','img');box.setAttribute('aria-label',(estimate?'Оценка: ':'')+human(before)+' → '+(after?human(after):'—'));
  return box;
 }
 function change(before,after){if(!before||!after)return '';const d=Math.round((after/before-1)*100);return (d>0?'+':d<0?'−':'±')+Math.abs(d)+' %';}

 window.renderConverterCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.conv-card'))return;
  let c={...data},job=data.result||null,timer=null,trimOpen=false,node=null;
  const busy=()=>!!job?.running;
  const poll=()=>{clearTimeout(timer);if(!busy())return;timer=setTimeout(async()=>{try{job=await call('status',job.id);}catch{job={...job,running:false};}paint();poll();},400);};
  async function edit(patch,special){
   try{
    if(special==='trim'){trimOpen=!trimOpen;paint();return;}
    if(special==='folder'){const r=await call('chooseFolder',c.id);c={...c,outDir:r.outDir};paint();return;}
    if(special==='reset'){await call('resetFolder',c.id);c={...c,outDir:''};paint();return;}
    const next=await call('update',c.id,patch);c={...c,...next,result:undefined};paint();
   }catch(e){k.toast(e.message,{error:true});}
  }
  function trimEditor(){
   const box=k.el('form','conv-trim');const p=c.params||{};
   const field=(label,value)=>{const l=k.el('label',null,label);const i=k.el('input');i.type='number';i.min='0';i.step='0.1';i.value=value??'';l.append(i);return [l,i];};
   const [l1,start]=field('Начало, с',p.trim?.start??0),[l2,end]=field('Конец, с',p.trim?.end??'');
   const ok=k.el('button','primary','Применить');ok.type='submit';
   const clear=k.el('button',null,'Всё видео');clear.type='button';clear.onclick=()=>{trimOpen=false;edit({params:{trim:null}});};
   box.onsubmit=e=>{e.preventDefault();trimOpen=false;edit({params:{trim:{start:Number(start.value),end:Number(end.value)}}});};
   box.append(l1,l2,ok,clear);return box;
  }
  function progress(){
   const list=k.el('ul','conv-progress');
   for(const f of job.files){
    const li=k.el('li','state-'+f.state);
    const name=k.el('span','conv-name',f.name);name.dataset.noI18n='';
    const track=k.el('span','conv-track');const fill=k.el('span','conv-fill');fill.style.width=(f.state==='done'?100:f.percent||0)+'%';track.append(fill);
    track.setAttribute('role','progressbar');track.setAttribute('aria-valuenow',String(f.state==='done'?100:f.percent||0));track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-label',f.name);
    li.append(name,track,k.el('span','conv-state',{waiting:'в очереди',running:(f.percent||0)+' %',done:'готово',error:'ошибка',cancelled:'отменено'}[f.state]||''));
    list.append(li);
   }
   return list;
  }
  function results(){
   const list=k.el('ul','conv-results');
   job.files.forEach((f,i)=>{
    const li=k.el('li','state-'+f.state);
    const head=k.el('div','conv-result-head');
    const name=k.el('span','conv-name',f.output||f.name);name.dataset.noI18n='';name.title=f.name+(f.output?' → '+f.output:'');
    head.append(name);
    if(f.state==='done'){
     head.append(k.el('span','conv-change'+(f.after>f.before?' grew':''),change(f.before,f.after)));
     const show=k.el('button','conv-show',finder(c));show.type='button';show.onclick=()=>call('reveal',job.id,i).catch(e=>k.toast(e.message,{error:true}));head.append(show);
    }
    li.append(head);
    if(f.state==='done'){li.append(compare(k,f.before,f.after));if(f.warning)li.append(k.el('p','conv-warn',f.warning));}
    else{const p=k.el('p','conv-error',f.state==='cancelled'?'Отменено — файл не создан.':f.error||'Не получилось.');p.dataset.noI18n='';li.append(p);}
    list.append(li);
   });
   return list;
  }
  function paint(){
   const body=k.el('div','conv-body');
   body.append(tiles(k,c));
   const row=k.el('div','conv-chips');row.append(...chips(k,c,edit,busy()));body.append(row);
   if(trimOpen&&!busy())body.append(trimEditor());
   if(job&&(busy()||job.files.some(f=>f.state==='running')))body.append(progress());
   else if(job)body.append(results());
   else{
    const est=k.el('div','conv-estimate');
    est.append(k.el('span','conv-estimate-label',c.estimate!=null?'Оценка размера':'Размер результата станет известен после конвертации'));
    est.append(compare(k,c.before,c.estimate,{estimate:true}));
    body.append(est);
    if(c.needs==='ffmpeg')body.append(k.el('p','conv-warn','Для видео и звука нужен ffmpeg. Скачаю закреплённую сборку с проверкой SHA-256 — прогресс будет в уведомлениях.'));
    if(c.needs==='soffice')body.append(k.el('p','conv-warn','Для документов нужен LibreOffice (soffice). Установите его с libreoffice.org и нажмите «Конвертировать».'));
   }
   const done=job&&!busy(),ok=done?job.files.filter(f=>f.state==='done'):[];
   const status=busy()?{label:'идёт: '+Math.min(job.files.filter(f=>['done','error','cancelled'].includes(f.state)).length+1,job.files.length)+' из '+job.files.length,tone:'progress'}
    :done?(job.cancelled?{label:'отменено',tone:'alert'}:ok.length===job.files.length?{label:'готово',tone:'done'}:{label:'готово '+ok.length+' из '+job.files.length,tone:'alert'})
    :c.needs?{label:c.needs==='ffmpeg'?'нужен ffmpeg':'нужен LibreOffice',tone:'alert'}:{label:'готово к запуску',tone:'accent'};
   const actions=[];
   if(busy())actions.push({label:'Отменить',run:async()=>{await call('cancel',job.id);}});
   else{
    if(c.needs==='ffmpeg')actions.push({label:'Скачать ffmpeg',primary:true,run:async()=>{const r=await call('downloadFfmpeg');if(r?.present){c={...c,...await call('update',c.id,{})};paint();k.toast('ffmpeg готов');}}});
    actions.push({label:done?'Конвертировать заново':'Конвертировать',primary:!c.needs&&!done,run:async()=>{if(c.needs)throw Error(c.needs==='ffmpeg'?'Сначала скачайте ffmpeg.':'Сначала установите LibreOffice.');job=await call('start',c.id);paint();poll();}});
    if(ok.length)actions.push({label:finder(c),run:()=>call('reveal',job.id,job.files.indexOf(ok[0]))});
   }
   const total=ok.length?' · '+human(ok.reduce((a,f)=>a+f.before,0))+' → '+human(ok.reduce((a,f)=>a+f.after,0)):'';
   const next=k.card({app:'Конвертер',initial:'⇄',color:'#5b6e8f',key:c.label,status,subtitle:c.count+' '+(c.count%10===1&&c.count%100!==11?'файл':[2,3,4].includes(c.count%10)&&![12,13,14].includes(c.count%100)?'файла':'файлов')+total,body,actions,className:'conv-card'});
   next.dataset.planId=c.id;
   if(node)node.replaceWith(next);else parent.append(next);node=next;
  }
  paint();poll();
 };
})();
