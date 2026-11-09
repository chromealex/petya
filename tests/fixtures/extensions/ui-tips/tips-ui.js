// Renderers of «Советы дня»: a tab named like another app's tab on «Навыки» (one tab, a section per app) and a tab on
// that app's own page. No main-process code: api.feature is not used.
(()=>{
 const tips=['Скажите «Петя, сводка», чтобы получить итоги дня.','Исправления фраз учат Петю вашим словам.','Сценарий задаёт формат ответа.'];
 const k=()=>window.resultKit;
 const block=(title)=>{const box=k().el('div','tips-box');box.style.cssText='display:grid;gap:6px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;max-width:620px';box.append(k().el('strong',null,title));return box;};
 window.renderTipsLearning=(container,api)=>{
  const box=block('Совет дня'),text=k().el('p','small tips-text');text.style.margin='0';let i=0;
  const next=()=>{text.textContent=tips[i++%tips.length];};
  api.onShow(next);next();box.append(text);container.append(box);
 };
 window.renderTipsNotes=container=>{const box=block('Как вести заметки');box.append(k().el('p','small','Одна мысль — одна заметка. Отмечайте сделанное, чтобы список не разрастался.'));container.append(box);};
})();
