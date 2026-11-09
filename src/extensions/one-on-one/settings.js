// «Встречи 1:1» settings: what is kept and where, and deleting the 1:1 notes and follow-ups of this company (absences
// stay). The records are the shared foundation (src/features/people.cjs).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const people=(method,...args)=>window.petya.feature('people',method,...args);
 const card=el('article','card');card.dataset.extension='one-on-one';
 card.append(el('h2',null,'Встречи 1:1'));
 card.append(el('p',null,'Заметки и договорённости со встреч 1:1 сохраняются только после «Сохранить» на карточке итогов и хранятся на этом компьютере (зашифрованными, если система это позволяет). Они не попадают в «Команду», в другие приложения и в запросы к другим ассистентам; локальная модель видит их, только когда вы просите подготовить встречу с этим человеком.'));
 const state=el('p');state.setAttribute('role','status');
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 const wipe=(window.deleteButton||((text,fn)=>{const b=el('button',null,text);b.type='button';b.onclick=fn;return b;}))('Удалить заметки и договорённости 1:1',async()=>{
  if(!await window.petyaConfirm('Удалить все заметки и договорённости со встреч 1:1 этой компании? Отметки об отсутствиях останутся.'))return;
  try{await people('wipe','notes');message='Заметки 1:1 удалены.';}catch(e){message=e.message;}refresh();
 });
 controls.append(wipe);
 card.append(controls,state);
 document.getElementById('settings-form').append(card);
 let message='';
 async function refresh(){
  try{
   const st=await people('status');
   const parts=['заметок: '+st.notes,'договорённостей: '+st.followups];
   if(st.people&&!st.encrypted)parts.push('без шифрования: хранилище ключей системы недоступно');
   state.textContent=(message?message+' ':'')+parts.join(' · ')+'.';message='';
  }catch(e){state.textContent=e.message;}
 }
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
