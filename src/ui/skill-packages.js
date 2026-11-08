// «Навыки»: skills with their files — installed from a folder or an archive, or written by Petya in the chat
// («Сделай навык: …»). Skills found in a project's folder (skills/, .claude/skills) are used for its chats.
(() => {
 const page=$('skills');if(!page)return;
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const note=page.querySelector('#instruction-import')?.closest('label')?.nextElementSibling;if(note?.classList.contains('small'))note.textContent='Импортируются name, description и инструкции Markdown. Навык с файлами, скриптами и настройками — кнопками ниже.';
 const card=node('article','card skill-packages');card.innerHTML='<h2>Навыки с файлами</h2><p class="small">Папка или архив .zip/.skill с SKILL.md, справочниками, скриптами и настройками. Ещё проще — попросите в чате: «Сделай навык: как оформлять релиз-ноты». Навыки из папки проекта (skills/, .claude/skills, .agents/skills) Петя берёт сам для чатов этого проекта.</p><div class="skill-package-list"></div><div class="actions"></div>';
 const mine=$('instruction-list')?.closest('article');(mine||page.querySelector(':scope>h1')).after(card);
 const list=card.querySelector('.skill-package-list'),actions=card.querySelector('.actions');
 const add=(label,kind)=>{const b=node('button',null,label);b.type='button';b.onclick=run(async()=>{const skill=await window.petya.feature('skillPackages','install',kind);if(skill){notice('Навык «'+skill.name+'» установлен: '+skill.files+' файлов.'+(skill.audit?.critical?' В скриптах есть опасные операции — посмотрите проверку в списке.':''),!!skill.audit?.critical);await refresh();}});actions.append(b);};
 add('Установить из папки','folder');add('Установить из архива','archive');
 function draw(rows){list.replaceChildren();if(!rows.length){list.append(node('p','small','Пока нет.'));return;}
  for(const r of rows){const row=node('div','recurring-row'),info=node('div','recurring-info');info.append(node('strong',null,r.name),node('p','material-meta',r.description+(r.files?' · файлов: '+r.files:'')));
   // The script check: a highlighted badge, and the findings with file and line on demand.
   if(r.audit?.report){const box=node('details','skill-audit'+(r.audit.critical?' danger':r.audit.warning?' warn':''));box.append(node('summary',null,r.audit.critical?'⛔ Опасных операций в скриптах: '+r.audit.critical:r.audit.warning?'⚠️ Рискованных мест в скриптах: '+r.audit.warning:'ℹ️ Проверка скриптов'),node('pre',null,r.audit.report));info.append(box);}
   const del=node('button','material-delete');del.type='button';del.title='Удалить';del.setAttribute('aria-label','Удалить');del.innerHTML=window.petyaIcons?.trash||'×';
   del.onclick=run(async()=>{if(del.dataset.confirm!=='1'){del.dataset.confirm='1';del.classList.add('confirm');del.textContent='Удалить?';setTimeout(()=>{if(del.isConnected){del.dataset.confirm='';del.classList.remove('confirm');del.innerHTML=window.petyaIcons?.trash||'×';}},4000);return;}draw(await window.petya.feature('skillPackages','remove',r.name));notice('Навык «'+r.name+'» удалён.');});
   const actions=node('div','material-actions');actions.append(del);row.append(info,actions);list.append(row);}}
 const refresh=()=>window.petya.feature('skillPackages','list').then(draw).catch(e=>notice(e.message,true));
 document.addEventListener('petya-view',e=>{if(e.detail==='skills')refresh();});refresh();
})();
