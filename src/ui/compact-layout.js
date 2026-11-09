// Explicit disclosures preserve the existing controls, listeners and form ownership.
(() => {
 // Use matching vector icons instead of font glyphs with different baselines.
 const navigationIcons={
  growth:['Развитие','M4 20h16 M6 16v-4 M12 16V8 M18 16V4'],
  skills:['Сценарии','M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5'],
  home:['Ассистент','M12 3v3 M12 18v3 M3 12h3 M18 12h3 M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'],
  sources:['Материалы','M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6'],
  team:['Команда','M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 7 M19 15a6 6 0 0 1 3 5'],
  agents:['Агенты','M12 3v3 M6 7h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M9 12v1 M15 12v1 M9.5 16h5 M2 12v3 M22 12v3'],
  history:['История','M3 10a9 9 0 1 1 1 7 M3 4v6h6 M12 7v5l3 2'],
  settings:['Настройки','M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4'],
  learning:['Навыки','M4 20l1-5L16 4a2 2 0 0 1 4 4L9 19z M14 6l4 4 M4 20h16']
 };
 for(const button of document.querySelectorAll('aside .nav')){
  const item=navigationIcons[button.dataset.view];if(!item)continue;
  button.title=item[0];button.setAttribute('aria-label',item[0]);
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
  icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.7');
  icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');icon.classList.add('nav-icon');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',item[1]);icon.append(path);
  const label=document.createElement('span');label.textContent=item[0];button.replaceChildren(icon,label);if(button.dataset.view==='growth'){const ring=document.createElementNS('http://www.w3.org/2000/svg','svg');ring.setAttribute('viewBox','0 0 40 40');ring.setAttribute('aria-hidden','true');ring.classList.add('growth-nav-ring');ring.innerHTML='<circle class="growth-track" cx="20" cy="20" r="17"/><circle class="growth-value" cx="20" cy="20" r="17" pathLength="100"/>';button.append(ring);}
 }
 const services=document.getElementById('sidebar-services'),summary=services.querySelector('summary');
 summary.title='Сервисы';summary.setAttribute('aria-label','Сервисы');
 summary.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
 const popup=document.createElement('div');popup.className='sidebar-services-popup';
 popup.append(...[...services.children].filter(node=>node!==summary));services.append(popup);
 services.open=false;
 const placeServices=()=>{if(!services.open)return;const anchor=summary.getBoundingClientRect(),inset=8,top=Math.min(innerHeight-inset*2,(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-height'))||0)+inset);popup.style.maxHeight=Math.max(32,innerHeight-top-inset)+'px';popup.style.left=Math.max(inset,Math.min(anchor.right+8,innerWidth-popup.offsetWidth-inset))+'px';popup.style.top=Math.max(top,Math.min(anchor.top,innerHeight-popup.offsetHeight-inset))+'px';};
 services.addEventListener('toggle',placeServices);window.addEventListener('resize',placeServices);new ResizeObserver(placeServices).observe(popup);
 document.addEventListener('click',event=>{if(!services.contains(event.target))services.open=false;});
 services.addEventListener('keydown',event=>{if(event.key==='Escape'){services.open=false;summary.focus();}});
 document.querySelector('.aside-bottom').title='Локальное распознавание. Аудио не сохраняется. Контекст хранится до 7 дней.';
 // Labels on demand: the rail can expand to show section names next to the icons; the choice is remembered.
 summary.insertAdjacentHTML('beforeend','<span class="rail-label">Сервисы</span>');
 const expand=document.createElement('button');expand.type='button';expand.className='rail-expand';
 const syncExpand=()=>{const on=document.body.classList.contains('rail-expanded'),label=on?'Скрыть подписи':'Показать подписи';expand.dataset.tooltip=label;expand.setAttribute('aria-label',label);expand.setAttribute('aria-pressed',String(on));};
 expand.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5v14 M9 12h11 M15 7l5 5-5 5"/></svg><span class="rail-label">Скрыть подписи</span>';
 try{document.body.classList.toggle('rail-expanded',localStorage.getItem('petya-rail-expanded')==='true');}catch{}
 expand.title='Показать подписи';expand.onclick=()=>{const on=document.body.classList.toggle('rail-expanded');try{localStorage.setItem('petya-rail-expanded',String(on));}catch{}syncExpand();};syncExpand();
 (document.querySelector('body>aside .nav[data-view="growth"]')||document.querySelector('body>aside .aside-bottom'))?.before(expand);
 const tooltip=document.createElement('div');tooltip.className='sidebar-tooltip';tooltip.id='sidebar-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
 let tooltipTarget=null;
 const hideTooltip=()=>{tooltip.hidden=true;tooltipTarget?.removeAttribute('aria-describedby');tooltipTarget=null;};
 // Rail tooltips; also used for the pages apps add to the rail later (window.petyaRail, extension-places.js).
 function bindTooltip(target,label){
  target.removeAttribute('title');
  const showTooltip=()=>{
   hideTooltip();tooltipTarget=target;tooltip.textContent=target.dataset.tooltip||label;tooltip.hidden=false;target.setAttribute('aria-describedby',tooltip.id);
   const rect=target.getBoundingClientRect();tooltip.style.left=(rect.right+12)+'px';
   tooltip.style.top=Math.max(8,Math.min(innerHeight-tooltip.offsetHeight-8,rect.top+(rect.height-tooltip.offsetHeight)/2))+'px';
  };
  target.addEventListener('pointerenter',showTooltip);target.addEventListener('pointerleave',hideTooltip);
  target.addEventListener('focus',()=>{if(target.matches(':focus-visible'))showTooltip();});target.addEventListener('blur',hideTooltip);target.addEventListener('click',hideTooltip);
 }
 for(const target of document.querySelectorAll('body>aside [title]'))bindTooltip(target,target.title);
 // A rail button of an app's page: its validated stroke icon and label, like the built-in sections.
 window.petyaRail={tooltip:bindTooltip,item(button,label,svg){
  const box=document.createElement('span');box.className='nav-icon-box';box.setAttribute('aria-hidden','true');box.innerHTML=svg;
  const icon=box.querySelector('svg');if(icon){icon.classList.add('nav-icon');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');for(const [k,v] of [['fill','none'],['stroke','currentColor']])if(!icon.getAttribute(k))icon.setAttribute(k,v);}
  const text=document.createElement('span');text.textContent=label;
  button.replaceChildren(icon||box,text);button.setAttribute('aria-label',label);bindTooltip(button,label);
 }};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});
 window.addEventListener('resize',hideTooltip);window.addEventListener('scroll',hideTooltip,true);

 function fold(nodes, title, className='compact-help') {
  nodes=nodes.filter(Boolean);if(!nodes.length)return;
  const details=document.createElement('details');details.className=className;
  const summary=document.createElement('summary');summary.textContent=title;
  nodes[0].before(details);details.append(summary,...nodes);return details;
 }
 function help(selector,title){fold([...document.querySelectorAll(selector)],title);}
 for(const [id,title] of [['learn-form','Создать или изменить навык'],['dictionary-form','Добавить или изменить правило'],['mail-skill-form','Настроить почтовый навык']]){
  const form=document.getElementById(id);if(!form)continue;
  fold([form],title,'compact-editor');
  form.addEventListener('invalid',()=>{form.closest('details').open=true;},true);
 }
 help('#agents>p:not(.intro)','Как передаются задачи');
 help('#companies>p:not(.intro):not([id])','Как работают профили компаний');
 help('#team>p.small','Как заполнить сведения о команде');
 help('#history>p.small','Хранение истории и откат');
 help('.notion-setup','Пошаговая настройка Notion');
 const attachment=document.getElementById('attachment-pick')?.closest('article');
 if(attachment)fold([attachment.querySelector(':scope>p')],'Форматы файлов и ограничения');
 // Fold complete settings cards; keep the original status nodes and their listeners intact.
 for(const card of document.querySelectorAll('#settings>article.card, #settings-form>article.card')){
  const heading=card.querySelector('h2');if(!heading)continue;
  const details=document.createElement('details');details.className='settings-disclosure';
  const summary=document.createElement('summary');
  const status=document.createElement('span');status.className='settings-summary-status';
  summary.append(heading,status);
  const body=document.createElement('div');body.className='settings-disclosure-body';
  if(card.classList.contains('module-picker')){card.classList.remove('module-picker');body.classList.add('module-picker');}
  body.append(...card.childNodes);details.append(summary,body);card.append(details);card.classList.add('settings-card');
  const source=body.querySelector('.connection-status')||body.querySelector('#permission-summary');
  if(source){
   const update=()=>{status.textContent=source.textContent;status.title=source.textContent;status.dataset.state=source.classList.contains('error')?'error':source.classList.contains('connected')?'connected':'';};
   update();new MutationObserver(update).observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  }else status.hidden=true;
  card.addEventListener('invalid',event=>{for(let parent=event.target.parentElement;parent&&parent!==card;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;},true);
 }
 // All integrations have mounted: place the shared save action after the full list.
 const settingsForm=document.getElementById('settings-form');
 const save=settingsForm.querySelector(':scope > button[type="submit"]');
 if(save){
  const panel=document.createElement('div');panel.className='settings-save-panel';
  panel.append(save,document.getElementById('connection-state'));settingsForm.append(panel);
 }
 const learning=document.getElementById('learning');
 if(learning){
  // Keep the page heading above cards inserted by optional learning modules.
  const heading=learning.querySelector(':scope>h1'),intro=heading?.nextElementSibling;
  if(heading){learning.prepend(heading);if(intro?.tagName==='P')heading.after(intro);}
 }
})();
