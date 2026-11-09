// «Свежесть документации» settings: the weekly check (off by default) and what the check reads.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.dataset.extension='doc-freshness';
 card.append(el('h2',null,'Свежесть документации'),el('p',null,'Проверка по запросу в чате: Markdown репозитория проекта, страницы Confluence из выбранного пространства и Google Документы подключения «Google Диск» сверяются с историей git. Документы не меняются без вашей кнопки.'));
 const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center';
 const weekly=el('input');weekly.type='checkbox';weekly.name='docFreshnessWeekly';
 label.append(weekly,el('span',null,'Проверять раз в неделю и сообщать в уведомлениях (только Markdown проектов)'));
 const status=el('p','small');status.style.color='var(--muted)';status.setAttribute('role','status');
 card.append(label,status);
 document.getElementById('settings-form').append(card);
 async function refresh(){
  try{const st=await window.petya.feature('docFreshness','status');weekly.checked=!!st.weekly;status.textContent=st.last?'Последняя еженедельная проверка: '+(window.relativeTime?window.relativeTime(st.last):new Date(st.last).toLocaleString(window.petyaLocale||'ru-RU'))+'.':'';}
  catch(e){status.textContent=e.message;}
 }
 weekly.onchange=async()=>{
  try{await window.petya.saveSettings({docFreshnessWeekly:String(weekly.checked)});status.textContent=weekly.checked?'Проверю раз в неделю и сообщу в уведомлениях.':'Еженедельная проверка выключена.';}
  catch(e){status.textContent=e.message;weekly.checked=!weekly.checked;}
 };
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
