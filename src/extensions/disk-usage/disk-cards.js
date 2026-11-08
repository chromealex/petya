// «Место на диске», renderer: the volume bar (used/free), a horizontal bar chart of categories sorted by size with
// a tag and a one-line explanation each, expandable rows with the biggest subfolders, and per-row cleanup that
// first lists the exact paths and total size and runs only after «Переместить в корзину» is pressed.
(()=>{
 const U=unit=>' '+(/^ru/i.test(window.petyaLocale||'ru')?unit:({ТБ:'TB',ГБ:'GB',МБ:'MB',КБ:'KB',Б:'B',с:'s',мин:'min',ч:'h'}[unit]||unit));
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('disk-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('diskUsage',method,...args);
 const TAGS={safe:{label:'можно удалить безопасно',tone:'done'},regen:{label:'пересоздастся',tone:'progress'},caution:{label:'осторожно',tone:'alert'}};
 function human(bytes){
  const n=Number(bytes)||0;
  for(const [d,u] of [[1e12,'ТБ'],[1e9,'ГБ'],[1e6,'МБ'],[1e3,'КБ']])if(n>=d)return (n/d).toLocaleString(locale(),{maximumFractionDigits:n/d>=100?0:1})+U(u);
  return n+U('Б');
 }
 const locale=()=>window.petyaLocale||'ru-RU';
 const finder=()=>window.petyaPlatform==='win32'?'Показать в Проводнике':'Показать в Finder';

 function volumeBar(k,v){
  const box=k.el('div','disk-volume');
  const share=v.total?v.used/v.total:0,freeShare=v.total?v.free/v.total:0;
  const tone=freeShare<0.1?'alert':freeShare<0.2?'progress':'ok';
  const head=k.el('div','disk-volume-head');
  head.append(k.el('strong',null,'Свободно '+human(v.free)),k.el('span','disk-muted','занято '+human(v.used)+' из '+human(v.total)));
  const track=k.el('div','disk-volume-track '+tone);track.setAttribute('role','img');
  track.setAttribute('aria-label','Занято '+Math.round(share*100)+'%, свободно '+human(v.free)+' из '+human(v.total));
  const used=k.el('span','disk-volume-used');used.style.width=Math.min(100,share*100).toFixed(1)+'%';
  track.append(used);
  box.append(head,track);return box;
 }

 // One confirmation per row: exact paths (or model names) with sizes, a live total, then the only button that acts.
 function confirmBox(k,scan,c,row,onDone){
  const ollama=c.clean==='ollama';
  const box=k.el('div','disk-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение очистки');
  box.append(k.el('p','disk-confirm-title',ollama?'Удалить выбранные модели командой «ollama rm»? Их придётся скачать заново.':'Переместить выбранное в Корзину? Вернуть можно из Корзины, пока она не очищена.'));
  const list=k.el('ul','disk-confirm-list');const chosen=new Set();
  const total=k.el('strong','disk-confirm-total');
  const go=k.el('button','primary');go.type='button';
  const sync=()=>{const sum=c.items.filter(i=>chosen.has(ollama?i.name:i.path)).reduce((a,i)=>a+i.bytes,0);total.textContent='Итого: '+human(sum)+' · выбрано '+chosen.size;go.textContent=(ollama?'Удалить модели':'Переместить в корзину')+' · '+human(sum);go.disabled=!chosen.size;};
  for(const item of c.items.filter(i=>!i.removed)){
   const target=ollama?item.name:item.path;
   const li=k.el('li');const label=k.el('label');const input=k.el('input');input.type='checkbox';
   input.checked=c.tag!=='caution';if(input.checked)chosen.add(target);
   input.onchange=()=>{input.checked?chosen.add(target):chosen.delete(target);sync();};
   const code=k.el('code',null,ollama?item.name:item.path);code.setAttribute('data-no-i18n','');
   label.append(input,code,k.el('span','disk-size',human(item.bytes)));
   li.append(label);list.append(li);
  }
  const cancelButton=k.el('button',null,'Отмена');cancelButton.type='button';cancelButton.onclick=()=>{box.remove();row.querySelector('.disk-clean')?.removeAttribute('hidden');};
  go.onclick=async()=>{
   go.disabled=cancelButton.disabled=true;go.setAttribute('aria-busy','true');
   try{
    const result=await call('clean',scan.scanId,c.id,[...chosen]);
    for(const item of c.items)if(result.removed.includes(ollama?item.name:item.path))item.removed=true;
    c.bytes=result.bytes;k.toast(result.text,{error:!result.removed.length});box.remove();onDone();
   }catch(e){k.toast(e.message,{error:true});go.disabled=cancelButton.disabled=false;}
   finally{go.removeAttribute('aria-busy');}
  };
  const bar=k.el('div','disk-confirm-actions');bar.append(total,go,cancelButton);
  box.append(list,bar);sync();return box;
 }

 function itemList(k,c,max){
  const nodes=c.items.map(item=>{
   const li=k.el('div','disk-item'+(item.removed?' removed':''));
   const share=max?Math.max(0.5,100*item.bytes/max):0;
   const fill=k.el('span','disk-item-fill');fill.style.width=share.toFixed(1)+'%';
   const name=k.el('span','disk-item-name',item.name);name.setAttribute('data-no-i18n','');name.title=c.clean==='ollama'?item.name:item.path;
   li.append(name,k.el('span','disk-item-track'),k.el('span','disk-size',item.removed?(c.clean==='ollama'?'удалена':'в корзине'):human(item.bytes)));
   li.children[1].append(fill);return li;
  });
  return k.collapse(nodes,6,'Ещё');
 }

 function categoryRow(k,scan,c,max){
  const tag=TAGS[c.tag]||TAGS.caution;
  const row=k.el('details','disk-row tag-'+c.tag);
  const head=k.el('summary','disk-row-head');
  const label=k.el('span','disk-row-label');label.append(k.el('span','disk-row-name',c.label),k.chip({label:tag.label,tone:tone(tag)}));
  const track=k.el('span','disk-row-track');const fill=k.el('span','disk-row-fill');fill.style.width=(max?Math.max(1,100*c.bytes/max):0).toFixed(1)+'%';track.append(fill);
  const sizeText=k.el('span','disk-row-size',(c.partial?'≥ ':'')+human(c.bytes));
  const note=k.el('span','disk-row-note',c.note+(c.partial?' Подсчёт частичный.':'')+(c.skipped?' Закрытых папок: '+c.skipped+'.':''));
  head.append(label,track,sizeText,note);
  row.append(head);
  const body=k.el('div','disk-row-body');
  const paint=()=>{
   sizeText.textContent=(c.partial?'≥ ':'')+human(c.bytes);
   body.replaceChildren();
   if(c.items.length)body.append(itemList(k,c,c.items[0]?.bytes||0));
   else body.append(k.el('p','disk-muted','Подпапок нет'));
   const actions=k.el('div','disk-row-actions');
   if(c.clean&&c.items.some(i=>!i.removed&&(i.bytes>0||c.clean==='ollama'))){
    const clean=k.el('button','disk-clean',c.clean==='ollama'?'Удалить модели…':'Очистить…');clean.type='button';
    clean.onclick=()=>{if(body.querySelector('.disk-confirm'))return;clean.hidden=true;body.append(confirmBox(k,scan,c,body,()=>{paint();}));body.querySelector('.disk-confirm input')?.focus();};
    actions.append(clean);
   }
   if(c.roots?.length&&c.clean!=='ollama'||c.id==='ollama'&&c.roots?.length){
    const show=k.el('button',null,finder());show.type='button';
    show.onclick=async()=>{try{await call('reveal',scan.scanId,c.id,c.roots[0]);}catch(e){k.toast(e.message,{error:true});}};
    actions.append(show);
   }
   if(actions.children.length)body.append(actions);
  };
  paint();row.append(body);
  return row;
 }
 const tone=tag=>tag.tone;

 window.renderDiskUsage=(parent,scan)=>{
  const k=window.resultKit;if(!k||!scan||parent.querySelector('.disk-card'))return;
  const body=k.el('div','disk-body');
  if(scan.volume)body.append(volumeBar(k,scan.volume));
  const rows=(scan.categories||[]).filter(c=>c.bytes>0||c.items?.length);
  const max=Math.max(1,...rows.map(c=>c.bytes));
  const chart=k.el('div','disk-rows');chart.setAttribute('aria-label','Категории по размеру');
  for(const c of rows)chart.append(categoryRow(k,scan,c,max));
  if(rows.length)body.append(chart);else body.append(k.el('p','disk-muted','Ничего крупного в известных местах не нашлось.'));
  const meta=[];
  if(scan.elapsedMs)meta.push('посчитано за '+Math.max(1,Math.round(scan.elapsedMs/1000))+U('с'));
  if(scan.skipped)meta.push('закрытых папок пропущено: '+scan.skipped);
  if(!scan.unityRoots?.length)meta.push('проекты Unity не искались');
  meta.push('ничего не удаляется без подтверждения');
  const free=scan.volume?scan.volume.free/scan.volume.total:1;
  const status=scan.cancelled?{label:'остановлено',tone:'progress'}:scan.partial?{label:'частично',tone:'progress',title:'Не уложился в лимит времени или часть папок закрыта'}:free<0.1?{label:'мало места',tone:'alert'}:{label:'посчитано',tone:'done'};
  const when=scan.at?new Date(scan.at).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  parent.append(k.card({app:'Место на диске',initial:'◔',color:'#4a5f8a',key:'Место на диске',status,subtitle:when,body,meta,className:'disk-card',
   actions:[{label:'Проверить снова',run:()=>k.ask('чем забит диск',{send:true})},{label:'Что почистить первым?',run:()=>k.ask('Что из этого безопаснее всего почистить первым?')}]}));
 };
})();
