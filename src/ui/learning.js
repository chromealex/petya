const learningNav=document.createElement('button');learningNav.className='nav';learningNav.dataset.view='learning';learningNav.textContent='✎   Обучение';document.querySelector('aside nav').append(learningNav);
const learningView=document.createElement('section');learningView.id='learning';learningView.className='view';learningView.hidden=true;
learningView.innerHTML=`<h1>Обучение Пети</h1><p>Научите Петю вашим фразам без пересборки приложения. Фразы сопоставляются с вашими шаблонами; добавьте разные формулировки отдельными строками. Регистр и знаки в конце не важны. Локальная модель для этого не нужна.</p>
<article class="card" id="growth-card"><h2>Рост Пети</h2><div id="growth-content" aria-live="polite"></div></article>
<article class="card"><h2>Мои голосовые команды</h2><div id="learned-list"></div><button id="learn-new" type="button">Новая команда</button></article>
<article class="card"><form id="learn-form"><h2 id="learn-heading">Новая команда</h2><label>Название<input id="learn-name" maxlength="100" required></label><label>Что делать<select id="learn-action"><option value="reminder">Поставить напоминание</option><option value="answer">Ответить заданным текстом</option><option value="bugs">Проверить баги в Jira</option><option value="anr">Проверить ANR в Google Play</option></select></label>
<label>Варианты фразы — по одному на строку<textarea id="learn-patterns" rows="4" required placeholder="Введите свою фразу с переменными"></textarea></label><p class="small">Для напоминаний используйте {delay} для времени и {message} для текста. Например, шаблон «таймер на {delay} — {message}» распознает «таймер на пять минут — проверить почту». Для других действий доступна и переменная {query}. Между переменными нужны слова или знак-разделитель.</p>
<label id="learn-output-label">Ответ или запрос к сервису<textarea id="learn-output" rows="3" placeholder="Можно использовать переменные из фразы"></textarea></label><p id="learn-action-help" class="small"></p>
<label class="check"><input id="learn-enabled" type="checkbox" checked>Навык включён</label><button class="primary" type="submit">Сохранить команду</button>
<label>Проверочная фраза<input id="learn-example" maxlength="4000"></label><button id="learn-test" type="button">Проверить без выполнения</button><p id="learn-result" role="status"></p></form></article>
<article class="card"><h2>Напоминания</h2><p>Петя уведомит вас, пока работает в трее. Если компьютер спал или приложение было закрыто, напоминание появится после пробуждения или запуска. Уведомления должны быть разрешены в настройках ОС. Напоминание ничего не отправляет в другие сервисы.</p><div id="learn-reminders"></div><button id="learn-refresh" type="button">Обновить</button></article>`;
document.querySelector('main footer').before(learningView);
const growthView=document.createElement('section');growthView.id='growth';growthView.className='view';growthView.hidden=true;growthView.innerHTML='<h1>Развитие</h1><p class="intro">Ваши результаты и результаты команды в Jira.</p>';growthView.append($('growth-card'));learningView.after(growthView);
const growthNav=document.createElement('button');growthNav.className='nav';growthNav.dataset.view='growth';growthNav.textContent='Развитие';document.querySelector('aside nav [data-view="home"]').after(growthNav);growthNav.onclick=run(async()=>{view('growth');await refreshLearning();});
let editingSkill='';
function learningDraft(){return {...editingSkill?{id:editingSkill}:{},name:$('learn-name').value,action:$('learn-action').value,patterns:$('learn-patterns').value.split('\n'),output:$('learn-output').value,enabled:$('learn-enabled').checked};}
function learningActionHelp(){const action=$('learn-action').value;$('learn-output-label').hidden=action==='reminder';$('learn-action-help').textContent=action==='reminder'?'Время берётся из {delay}, текст уведомления — из {message}. Поддерживаются секунды, минуты, часы и дни.':action==='answer'?'Петя произнесёт этот ответ. Это действие не вызывает другие сервисы.':'Укажите запрос с проектом или приложением либо переменной {query}. Петя прочитает данные через подключённый сервис; при нехватке данных уточнит выбор.';}
function editLearning(skill){const editor=$('learn-form').closest('details');if(editor)editor.open=true;editingSkill=skill?.id||'';$('learn-heading').textContent=skill?'Изменить команду':'Новая команда';$('learn-name').value=skill?.name||'';$('learn-action').value=skill?.action||'reminder';$('learn-patterns').value=skill?.patterns.join('\n')||'';$('learn-output').value=skill?.output||'';$('learn-enabled').checked=skill?.enabled!==false;$('learn-result').textContent='';learningActionHelp();}
async function refreshLearning(){const state=await window.petya.learningList();renderGrowth(state.growthSummary);const list=$('learned-list');list.replaceChildren();if(!state.skills.length)list.textContent='Пока нет своих команд.';
 for(const skill of state.skills){const row=document.createElement('p');const label=document.createElement('span');label.textContent=skill.name+(skill.enabled?'':' · выключен')+' ';const edit=document.createElement('button');edit.type='button';edit.textContent='Изменить';edit.onclick=()=>editLearning(skill);const toggle=document.createElement('button');toggle.type='button';toggle.textContent=skill.enabled?'Выключить':'Включить';toggle.onclick=run(async()=>{await window.petya.learningSave({...skill,enabled:!skill.enabled});await refreshLearning();});const remove=window.deleteButton('Удалить навык «'+skill.name+'»');remove.onclick=run(async()=>{await window.petya.learningDelete(skill.id);if(editingSkill===skill.id)editLearning();await refreshLearning();});row.append(label,edit,toggle,remove);list.append(row);}
 const reminders=$('learn-reminders');reminders.replaceChildren();const visible=state.reminders.filter(r=>r.state==='pending').sort((a,b)=>a.due-b.due);if(!visible.length)reminders.textContent='Активных напоминаний нет.';
 for(const r of visible){const row=document.createElement('p'),label=document.createElement('span');label.textContent=window.relativeTime(r.due)+' · '+r.text+' ';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отменить';cancel.onclick=run(async()=>{await window.petya.reminderCancel(r.id);await refreshLearning();});row.append(label,cancel);reminders.append(row);}
}
learningNav.onclick=run(async()=>{view('learning');await refreshLearning();});
$('learn-action').onchange=learningActionHelp;$('learn-new').onclick=()=>editLearning();
$('learn-form').onsubmit=run(async event=>{event.preventDefault();const saved=await window.petya.learningSave(learningDraft());editLearning(saved);await refreshLearning();$('learn-result').textContent='Навык сохранён и уже работает. Перезапуск и пересборка не нужны.';});
$('learn-test').onclick=run(async()=>{const r=await window.petya.learningTest($('learn-example').value,learningDraft());$('learn-result').textContent=r.error||(!r.matched?'Фраза не совпала. Добавьте ещё один вариант шаблона.':r.action==='reminder'?'Распознано: через '+r.delay/1000+' сек. уведомить «'+r.slots.message+'». Напоминание не создано.':'Распознано: '+r.output+'. Действие не выполнено.');});
$('learn-refresh').onclick=run(refreshLearning);
const teachButton=document.createElement('button');teachButton.type='button';teachButton.textContent='Научить новой фразе';$('command-shortcuts').append(teachButton);teachButton.onclick=run(async()=>{view('learning');editLearning();const phrase=$('command').value.replace(/^петя[,\s]+/iu,'').trim();$('learn-patterns').value=phrase;$('learn-example').value=phrase;await refreshLearning();$('learn-name').focus();});
learningActionHelp();

const undoButton=document.createElement('button');undoButton.type='button';undoButton.textContent='Отменить последнее локальное действие';undoButton.className='never-shown';learningView.prepend(undoButton);
// Name the action that will be undone and hide the button when there is nothing to undo.
undoButton.className='never-shown learning-undo quiet';undoButton.hidden=true;
async function syncUndo(){try{const info=await window.petya.undoInfo();undoButton.hidden=!info;if(info){undoButton.textContent='↶ Отменить: '+info.label;undoButton.title=new Date(info.at).toLocaleString(window.petyaLocale||'ru-RU');}}catch{undoButton.hidden=true;}}
document.addEventListener('petya-view',event=>{if(event.detail==='learning')syncUndo();});undoButton.onclick=run(async()=>{const info=await window.petya.undoInfo();if(!info){notice('Нет действия для отмены.');return;}if(!await window.confirmLocalUndo?.(info))return;const result=await window.petya.undoLast(info.id);await refreshLearning();await refreshDictionary();await syncUndo();await showDialogueReply(result);view('home');});

function renderGrowth(growth){
 const root=$('growth-content');root.replaceChildren();if(!growth)return;
 const nav=document.querySelector('[data-view="growth"]');if(nav){nav.style.setProperty('--growth-progress',Math.max(0,Math.min(100,growth.percent)));nav.dataset.tooltip='Развитие · '+growth.level.name+' · '+growth.xp+' очков'+(growth.next?' · до «'+growth.next.name+'» '+(growth.next.xp-growth.xp):'');nav.setAttribute('aria-label',nav.dataset.tooltip);}
 const add=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 const headline=add(root,'div','');headline.className='growth-headline';add(headline,'strong',growth.level.name);add(headline,'span',growth.xp+' очков');
 add(root,'p',growth.level.description+'. Активных знаний: '+growth.count+'.');
 const bar=add(root,'progress','');bar.max=100;bar.value=growth.percent;bar.setAttribute('aria-label','Прогресс до следующего уровня');bar.style.width='100%';
 add(root,'p',growth.next?'До уровня «'+growth.next.name+'»: '+(growth.next.xp-growth.xp)+' очков.':'Уровень «Лид» достигнут. Новые знания продолжают попадать в историю.');
 const ladder=add(root,'ol','');ladder.className='growth-levels';for(const level of growth.levels){const row=add(ladder,'li',level.name+' · '+level.xp);if(level.name===growth.level.name)row.setAttribute('aria-current','step');}
 const explanation=add(root,'details','');explanation.className='compact-help';add(explanation,'summary','Как начисляются очки');add(explanation,'p','Правило словаря — 10 очков, навык фраз — 25, почтовый сценарий — 40. Считаются уникальные включённые знания. Удаление, отключение и отмена пересчитывают шкалу; история остаётся. Это шкала сохранённых знаний, а не оценка качества ответов или переобучение модели. Подсказка учитывается после сохранения в навык или словарь.');
 add(root,'h3','Чему я научился');
 if(!growth.events.length)add(root,'p','Пока нет сохранённых знаний. Научите Петю новой фразе или добавьте правило в личный словарь.');
 for(const event of growth.events){const details=add(root,'details','');details.className='growth-event';add(details,'summary',event.title+' · '+(event.active?'+'+event.points+' очков':'не учитывается'));
 add(details,'p',event.at===null?'Добавлено из ранее сохранённых знаний':window.relativeTime(event.at));
 add(details,'p','Источник: '+event.source);
 // Petya's words about what he learned; the user can rewrite them, an empty text brings his back.
 const said=add(details,'blockquote',event.learned);said.className='growth-learned';if(event.edited)said.title='Изменено вами';
 const edit=add(details,'button','Изменить формулировку');edit.type='button';edit.onclick=()=>{const area=document.createElement('textarea');area.value=event.learned;area.rows=3;area.maxLength=2000;const save=document.createElement('button');save.type='button';save.textContent='Сохранить';save.className='primary';
  save.onclick=run(async()=>{renderGrowth(await window.petya.growthNote(event.key,area.value));notice(area.value.trim()?'Формулировка сохранена.':'Вернул формулировку Пети.');});said.replaceWith(area);edit.replaceWith(save);area.focus();};
 if(event.previous)add(details,'p','Раньше: '+event.previous);
 add(details,'p','Почему получен рост: '+event.reason);
 add(details,'p',event.active?'В расчёте: '+event.points+' очков за это уникальное знание.':'Знание удалено, отключено или заменено другой версией.');
 }
}
// Keep the sidebar metric current even when the dashboard is not open.
let growthRefreshPending=false;
async function refreshGrowthIndicator(){if(growthRefreshPending)return;growthRefreshPending=true;try{const state=await window.petya.learningList();renderGrowth(state.growthSummary);}catch{}finally{growthRefreshPending=false;}}
refreshGrowthIndicator();document.addEventListener('petya-view',refreshGrowthIndicator);window.addEventListener('focus',refreshGrowthIndicator);
