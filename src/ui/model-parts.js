// «Модели Пети»: the group (Petya Andromeda R1-A1-D1) and its parts in the settings; A is optional and downloaded on
// its own. Downloads report to the notification center whether or not the settings are open.
(()=>{
 const call=(method,...args)=>window.petya.feature('modelParts',method,...args);
 const gb=bytes=>bytes>=1e9?(bytes/1e9).toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:1})+' ГБ':Math.max(1,Math.round(bytes/1e6))+' МБ';
 const card=document.createElement('article');card.className='card';card.dataset.service='model-parts';
 const title=document.createElement('h2'),intro=document.createElement('p'),status=document.createElement('p'),list=document.createElement('div');
 title.textContent='Модели Пети';intro.textContent='Группа своих моделей: R выбирает функцию, A отвечает (необязательная, качается отдельно), D пишет черновики требований. Веса берутся из релизов Пети на GitHub, базовая модель — с Hugging Face; каждый файл проверяется по хэшу.';
 status.className='connection-status';status.hidden=true;status.setAttribute('role','status');list.className='model-parts';card.append(title,intro,status,list);
 $('settings-form').insertBefore(card,$('settings-form').querySelector(':scope > button'));
 const button=(label,fn,quiet)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(quiet)b.className='quiet';b.onclick=async()=>{b.disabled=true;try{draw(await fn());}catch(e){status.hidden=false;status.textContent=e.message;}finally{b.disabled=false;}};return b;};
 function row(item){
  const box=document.createElement('div');box.className='model-part';const head=document.createElement('strong'),note=document.createElement('small');
  head.textContent=(item.id==='base'?'':item.id+' · ')+item.role+(item.optional?' · необязательная':'');
  note.textContent=item.needed||(item.busy?'Скачиваю… '+(item.total?Math.min(99,Math.floor(item.received*100/item.total))+'%':''):item.installed?'Скачана и проверена · '+gb(item.bytes):item.error?'Ошибка: '+item.error:'Не скачана · '+gb(item.bytes));
  const actions=document.createElement('div');actions.className='actions';
  if(!item.needed){if(item.busy)actions.append(button('Остановить',()=>call('cancel',item.id).then(()=>call('status'))));else if(item.installed)actions.append(button('Удалить',()=>call('remove',item.id),true));else actions.append(button('Скачать',()=>call('install',item.id)));}
  box.append(head,note,actions);return box;
 }
 function draw(state){if(!state)return;title.textContent='Модели Пети · '+state.version;const ready=[state.base,...state.parts].filter(p=>!p.needed&&p.installed).map(p=>p.id==='base'?'база':p.id);status.hidden=true;status.classList.toggle('connected',ready.length>0);status.textContent=ready.length?'Скачано: '+ready.join(', '):'Не скачаны';list.replaceChildren(row(state.base),...state.parts.map(row));}
 const refresh=force=>call('status',force).then(draw).catch(e=>{status.hidden=false;status.textContent='Каталог моделей недоступен: '+e.message;});
 document.addEventListener('petya-settings-displayed',()=>refresh(false));
 window.petyaEvents.onModelParts(item=>{
  if(item?.title)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{...item,kind:item.kind||'model',actions:item.busy?[['Остановить',()=>call('cancel',item.part)]]:item.retry?[['Повторить',()=>call('install',item.part)]]:[]}}));
  if(!card.closest('[hidden]'))refresh(false);
 });
})();
