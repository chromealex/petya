// «Обучение» is what Petya learned from the chat: recurring commands with their timers, corrections, reminders,
// mail skills. Things are taught in the chat («Проверяй почту каждые 5 минут», «я имел в виду …», «Научись
// проверять почту»); this page lists them with deletion. The manual forms stay out of sight.
(() => {
 const page=$('learning');if(!page)return;
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const button=(text,fn,cls)=>{const b=node('button',cls,text);b.type='button';b.onclick=run(fn);return b;};
 const trash=(fn)=>{const b=button('',fn,'material-delete delete-button');b.innerHTML=window.petyaIcons?.trash||'×';b.title='Удалить';b.setAttribute('aria-label','Удалить');return b;};
 const intro=page.querySelector(':scope>p');if(intro)intro.textContent='Чему Петя научился в разговорах. Учите его прямо в чате — здесь всё видно и можно удалить.';
 // Recurring commands.
 const card=node('article','card learning-recurring');card.innerHTML='<h2>Повторяющиеся команды</h2><p class="small">Скажите в чате, например: «Проверяй почту каждые 5 минут» или «Каждое утро в 9 присылай сводку по задачам». Остановить: «перестань проверять почту».</p><div class="recurring-list"></div>';
 page.querySelector(':scope>h1')?.after(card);
 const list=card.querySelector('.recurring-list');let rows=[];
 const left=t=>{const ms=t-Date.now();if(ms<=0)return 'сейчас';const s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return 'через '+(h?h+' ч '+m+' мин':m?m+' мин '+String(sec).padStart(2,'0')+' с':sec+' с');};
 function draw(items){rows=items||[];list.replaceChildren();
  if(!rows.length){list.append(node('p','small','Пока нет. Петя будет делать такие команды сам и писать ответ в чат «По расписанию».'));return;}
  for(const r of rows){const row=node('div','recurring-row'+(r.enabled?'':' paused')),info=node('div','recurring-info');
   info.append(node('strong',null,r.command),node('p','material-meta',r.schedule+(r.lastRun?' · последний раз '+new Date(r.lastRun).toLocaleString(window.petyaLocale||'ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+(r.lastState?' — '+r.lastState:''):'')));
   const timer=node('span','recurring-timer',r.enabled?left(r.next):'на паузе');timer.dataset.next=r.enabled?r.next:'';info.append(timer);
   const actions=node('div','material-actions');
   actions.append(button('Открыть чат',async()=>{view('home');await selectDialogueTopic(r.topicId);}),button(r.enabled?'Пауза':'Продолжить',async()=>draw(await window.petya.feature('recurring','toggle',r.id,!r.enabled))),button('Сейчас',async()=>{draw(await window.petya.feature('recurring','runNow',r.id));notice('Запустил «'+r.command+'».');}),trash(async()=>{draw(await window.petya.feature('recurring','remove',r.id));notice('Повтор «'+r.command+'» удалён.');}));
   row.append(info,actions);list.append(row);}
 }
 setInterval(()=>{if(page.hidden)return;for(const t of list.querySelectorAll('.recurring-timer'))if(t.dataset.next)t.textContent=left(Number(t.dataset.next));},1000);
 const refresh=()=>window.petya.feature('recurring','list').then(draw).catch(e=>notice(e.message,true));
 window.petyaEvents.onRecurring?.(draw);document.addEventListener('petya-view',e=>{if(e.detail==='learning')refresh();});refresh();
 // Corrections: learned from the chat; the manual form is folded away.
 const dictionary=$('dictionary-form')?.closest('article');
 if(dictionary){dictionary.querySelector('h2').textContent='Исправления';const p=dictionary.querySelector(':scope>p');if(p)p.textContent='Когда вы поправляете Петю в чате («Нет, я имел в виду …»), он запоминает исправление сам и сразу делает по-новому. Ненужное удалите.';
  const form=$('dictionary-form');if(!form.closest('details.learning-manual')){const d=node('details','learning-manual');d.append(node('summary',null,'Добавить вручную'));form.before(d);d.append(form);}
  const list=$('dictionary-list');if(list&&form.closest('details'))form.closest('details').before(list);}
 // Phrase skills: the list stays, the editor goes; mail skills are taught in the chat («Научись проверять почту»).
 for(const id of ['learn-form','mail-skill-form']){const form=$(id);const holder=form?.closest('details')||form;holder?.classList.add('never-shown');}
 $('learn-new')?.classList.add('never-shown');$('mail-new')?.classList.add('never-shown');
 const skills=$('learned-list')?.closest('article');if(skills){const h=skills.querySelector('h2');if(h)h.textContent='Фразы';}
 const mail=$('mail-skills-list')?.closest('article');if(mail){const p=mail.querySelector(':scope>p');if(p)p.textContent='Скажите в чате «Научись проверять почту» и опишите правила — Петя предложит пробный запуск и сохранит навык.';}
})();
