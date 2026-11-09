// «Онбординг новичка» settings: the accesses checklist the user keeps (one per line; «бэкенд: доступ к staging» only
// for that role), the Jira labels of starter tasks, what is stored and where, and deleting every stored plan.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('onboarding',method,...args);
 const card=el('article','card');card.dataset.extension='onboarding';
 card.append(el('h2',null,'Онбординг новичка'));
 card.append(el('p',null,'Планы онбординга сохраняются только после «Начать онбординг» и хранятся на этом компьютере (зашифрованными, если система это позволяет). Они не попадают в другие приложения и в запросы к ассистентам; приветствие уходит только через мессенджер после вашего подтверждения.'));
 const accessLabel=el('label');accessLabel.append(el('span',null,'Чек-лист доступов (по одному в строке; «роль: доступ» — только для этой роли)'));
 const accesses=el('textarea');accesses.name='onboardingAccesses';accesses.rows=5;accesses.placeholder='Корпоративная почта\nSlack и каналы команды\nJira и Confluence\nбэкенд: доступ к staging и логам';
 accessLabel.append(accesses);
 const labelsLabel=el('label');labelsLabel.append(el('span',null,'Метки стартовых задач в Jira (через запятую)'));
 const labels=el('input');labels.name='onboardingLabels';labels.type='text';labels.placeholder='good-first-issue, starter';
 labelsLabel.append(labels);
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 let message='';
 const wipe=(window.deleteButton||((text,fn)=>{const b=el('button',null,text);b.type='button';b.onclick=fn;return b;}))('Удалить все планы онбординга',async()=>{
  if(!confirm('Удалить все сохранённые планы онбординга этой компании?'))return;
  try{await call('wipe');message='Планы удалены.';}catch(e){message=e.message;}refresh();
 });
 controls.append(wipe);
 card.append(accessLabel,labelsLabel,controls,state);
 document.getElementById('settings-form').append(card);
 async function refresh(){
  try{
   const st=await call('status');
   const parts=['планов: '+st.plans,'пунктов: '+st.items];
   if(st.plans&&!st.encrypted)parts.push('без шифрования: хранилище ключей системы недоступно');
   state.textContent=(message?message+' ':'')+parts.join(' · ')+'.';message='';
  }catch(e){state.textContent=e.message;}
 }
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
