// «Патчноуты» settings: which labels and components mark internal changes, the languages and the default tone.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.dataset.extension='patch-notes';
 card.append(el('h2',null,'Патчноуты'),el('p',null,'Изменения берутся из Jira (версия или спринт), из git-репозитория проекта (коммиты между тегами) и из GitHub (слитые PR). Внутренние изменения не попадают в текст для игроков, но остаются в чейнджлоге.'));
 const field=(label,input,hint)=>{const l=el('label');l.style.cssText='display:flex;flex-direction:column;gap:4px';l.append(el('span',null,label),input);if(hint)l.append(el('small',null,hint));return l;};
 const labels=el('input');labels.type='text';labels.name='patchNotesInternalLabels';labels.maxLength=600;
 const components=el('input');components.type='text';components.name='patchNotesInternalComponents';components.maxLength=600;components.placeholder='Backend, Tools';
 const languages=el('input');languages.type='text';languages.name='patchNotesLanguages';languages.maxLength=80;languages.placeholder='ru, en';
 const tone=el('select');tone.name='patchNotesTone';for(const t of ['дружелюбный','весёлый','официальный','краткий','эпичный']){const o=el('option',null,t);o.value=t;tone.append(o);}
 const save=el('button',null,'Сохранить');save.type='button';
 const status=el('p');status.setAttribute('role','status');
 const box=el('div');box.style.cssText='display:flex;flex-direction:column;gap:10px';
 box.append(field('Внутренние метки (Jira и GitHub)',labels,'Через запятую. Коммиты chore:, ci:, refactor:, test:, build:, docs: — внутренние всегда.'),field('Внутренние компоненты Jira',components),field('Языки по умолчанию',languages,'Коды через запятую: ru, en, de, fr, es, pt-BR, ja…'),field('Тон по умолчанию',tone),save,status);
 card.append(box);
 document.getElementById('settings-form').append(card);
 async function refresh(){
  try{const s=await window.petya.settings();labels.value=s.patchNotesInternalLabels??'';components.value=s.patchNotesInternalComponents??'';languages.value=s.patchNotesLanguages||'ru, en';tone.value=s.patchNotesTone||'дружелюбный';}
  catch(e){status.textContent=e.message;}
 }
 save.onclick=async()=>{
  save.disabled=true;
  try{await window.petya.saveSettings({patchNotesInternalLabels:labels.value,patchNotesInternalComponents:components.value,patchNotesLanguages:languages.value,patchNotesTone:tone.value});status.textContent='Настройки патчноутов сохранены.';}
  catch(e){status.textContent=e.message;}finally{save.disabled=false;}
 };
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
