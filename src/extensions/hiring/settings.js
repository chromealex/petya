// «Найм» settings: the roles with their skills (the criteria of interview prep and feedback summaries), what is
// stored and where, and deleting the whole pipeline.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('hiring',method,...args);
 const card=el('article','card');card.dataset.extension='hiring';
 card.append(el('h2',null,'Найм'));
 card.append(el('p',null,'Кандидаты, этапы и заметки интервью сохраняются только по кнопкам на карточках и хранятся на этом компьютере (зашифрованными, если система это позволяет). Они не попадают в другие приложения. Петя не оценивает и не сравнивает кандидатов и не учитывает возраст, пол, семью, здоровье, национальность и другие личные характеристики.'));
 const label=el('label');label.append(el('span',null,'Роли и навыки (по одной роли в строке: «Роль: навык, навык»)'));
 const rolesInput=el('textarea');rolesInput.name='hiringRoles';rolesInput.rows=4;rolesInput.placeholder='Бэкенд: Go, PostgreSQL, проектирование API, Kafka\nГеймдизайнер: баланс, экономика, документация';
 label.append(rolesInput);
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 let message='';
 const wipe=(window.deleteButton||((text,fn)=>{const b=el('button',null,text);b.type='button';b.onclick=fn;return b;}))('Удалить всех кандидатов и заметки',async()=>{
  if(!confirm('Удалить всех кандидатов, этапы и заметки интервью этой компании?'))return;
  try{await call('wipe');message='Данные найма удалены.';}catch(e){message=e.message;}refresh();
 });
 controls.append(wipe);
 card.append(label,controls,state);
 document.getElementById('settings-form').append(card);
 async function refresh(){
  try{
   const st=await call('status');
   const parts=['кандидатов: '+st.candidates,'заметок: '+st.notes,'ролей: '+st.roles];
   if(st.candidates&&!st.encrypted)parts.push('без шифрования: хранилище ключей системы недоступно');
   state.textContent=(message?message+' ':'')+parts.join(' · ')+'.';message='';
  }catch(e){state.textContent=e.message;}
 }
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
