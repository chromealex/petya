const operationNames = { edit: 'Правка', undo: 'Откат правки', delete: 'Удаление' };
const operationStates = { ready: 'Не выполнялось', sending: 'Результат неизвестен — проверьте Jira', uncertain: 'Результат неизвестен — проверьте Jira', done: 'Выполнено', partial: 'Выполнено частично', failed: 'Ошибка' };
function historyElement(tag, text, className) { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; }
function historyDiff(target, rows) {
  for (const row of rows) {
    target.append(historyElement('strong', row.key + (row.title ? ' · ' + row.title : '')));
    for (const change of row.changes || []) {
      const diff = historyElement('div', '', 'history-diff');
      diff.append(historyElement('span', change.label, 'small'), historyElement('pre', String(change.before ?? 'Пусто')), historyElement('span', '↓', 'small'), historyElement('pre', String(change.after ?? 'Пусто'))); target.append(diff);
    }
    if (row.state) target.append(historyElement('p', (operationStates[row.state] || row.state) + (row.undone ? ' · Отменено' : '') + (row.error ? ': ' + row.error : ''), 'small'));
  }
}
function renderHistory(records) {
  const target = $('batch-history'); target.replaceChildren();
  if (!records.length) { const empty=historyElement('p', 'Здесь появятся созданные задачи и последующие правки.');empty.dataset.empty='true';target.append(empty); return; }
  for (const record of records) {
    const card = historyElement('article', '', 'card history-entry'); card.dataset.id = record.id;card.dataset.at=record.at;card.dataset.project=record.project;card.dataset.result=record.rows.every(r=>['done','deleted'].includes(r.state))?'done':'attention';
    card.append(historyElement('h2', `${record.project} · ${record.rows.length === 1 ? 'Задача' : 'Пакет задач'}`), historyElement('p', `${new Date(record.at).toLocaleString('ru-RU')}`, 'small'));
    const checks = [];
    for (const [index, row] of record.rows.entries()) {
      const label = historyElement('label', '', 'check history-task'), check = document.createElement('input'); check.type = 'checkbox'; check.value = row.key || ''; check.checked = !!row.key && row.state !== 'deleted'; check.disabled = !check.checked; checks.push(check);
      const text = historyElement('span', `${index + 1}. ${row.key || 'Без ключа'} · ${row.title}`);if(row.key&&record.url){try{const url=new URL(record.url);url.pathname='/browse/'+row.key;url.search='';url.hash='';const link=historyElement('a','Открыть задачу');link.href=url.href;link.target='_blank';link.rel='noopener';text.append(document.createTextNode(' · '),link);}catch{}} label.append(check, text); card.append(label);
      card.append(historyElement('p', (row.state === 'deleted' ? 'Удалена из Jira' : row.state === 'done' && record.kind !== 'edit-existing' ? 'Создана' : (row.state === 'observed' ? 'Существующая задача' : states[row.state] || row.state)) + (row.error ? ': ' + row.error : ''), 'small'));
    }
    if (record.retentionExpired) { card.append(historyElement('p', 'Срок хранения истёк. Локальные снимки для правок и отката удалены.')); target.append(card); continue; }
    const instruction = document.createElement('textarea'); instruction.rows = 2; instruction.maxLength = 4000; instruction.placeholder = 'Например: переназначь вторую задачу на Машу и перенеси её в следующий спринт'; instruction.setAttribute('aria-label', 'Что изменить в выбранных задачах');
    const controls = historyElement('div', '', 'actions'), preview = historyElement('div', '', 'history-preview'); preview.hidden = true;
    const selected = () => checks.filter(c => c.checked && !c.disabled).map(c => c.value);
    async function act(fn) {
      if (workspaceBusy) { notice('Дождитесь завершения текущего действия.'); return; }
      workspaceBusy = true; const enabled = [...card.querySelectorAll('button,input,textarea')].filter(e => !e.disabled); enabled.forEach(e => e.disabled = true);
      try { return await fn(); } catch (e) { notice(e.message, true); preview.hidden = false; preview.replaceChildren(historyElement('p', e.message)); } finally { workspaceBusy = false; enabled.forEach(e => e.disabled = false); }
    }
    function showPreview(p) {
      preview.hidden = false; preview.replaceChildren();
      if (p.questions?.length) { preview.append(historyElement('h3', 'Нужно уточнить'), historyElement('p', p.questions.join('\n')), historyElement('p', 'Дополните запрос выше и подготовьте правку ещё раз.', 'small')); return; }
      preview.append(historyElement('h3', p.destructive ? 'Отмена создания' : 'Проверьте изменения'), historyElement('p', p.warning)); historyDiff(preview, p.rows);
      let confirmation;
      if (p.destructive) { const label = historyElement('label', '', 'check'); confirmation = document.createElement('input'); confirmation.type = 'checkbox'; label.append(confirmation, document.createTextNode('Понимаю, что удаление необратимо')); preview.append(label); }
      const apply = historyElement('button', p.destructive ? `Удалить ${p.rows.length} задач из Jira` : p.rows.length===1?'Применить к '+p.rows[0].key:'Применить к задачам · '+p.rows.length, p.destructive ? 'danger' : 'primary');
      apply.onclick = () => act(async () => {
        if (confirmation && !confirmation.checked) throw new Error('Подтвердите необратимое удаление задач.');
        const result = await window.petya.applyHistoryChange(p.id, !!confirmation?.checked);
        const op = result.operations.find(o => o.id === p.id), done = op.rows.filter(r => r.state === 'done').length;
        await refreshHistory(); notice(`Выполнено: ${done} из ${op.rows.length}. ${done === op.rows.length ? 'История обновлена.' : 'Проверьте результат каждого шага в истории.'}`, done !== op.rows.length);
      });
      const cancel = historyElement('button', 'Отменить'); cancel.onclick = () => { preview.hidden = true; preview.replaceChildren(); };
      const buttons = historyElement('div', '', 'actions'); buttons.append(apply, cancel); preview.append(buttons);
      preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const edit = historyElement('button', 'Подготовить правку', 'primary'); edit.onclick = () => { const keys = selected(); return act(async () => showPreview(await window.petya.previewHistoryEdit(record.id, instruction.value, keys))); };
    const undo = historyElement('button', 'Откатить создание'); undo.hidden = record.kind === 'edit-existing'; undo.onclick = () => { const keys = selected(); return act(async () => showPreview(await window.petya.previewHistoryUndo(record.id, '', keys))); };
    const editor=historyElement('details','','history-editor');editor.append(historyElement('summary','Изменить или откатить задачи'));controls.append(edit, undo); editor.append(instruction, controls, historyElement('p', 'Действия относятся к отмеченным задачам. Правка текстом использует Ollama. Откат создания удаляет задачи; откат правки возвращает прежние значения.', 'small'));card.append(editor);
    if (record.rows.some(r => r.key && !r.snapshot && r.state !== 'deleted')) card.append(historyElement('p', 'Для части задач нет снимка: откат недоступен. Правку можно подготовить по текущим данным Jira.', 'small'));
    for (const op of [...(record.operations || [])].reverse()) {
      const details = document.createElement('details'); details.className = 'history-operation';
      const summary = historyElement('summary', `${operationNames[op.kind] || op.kind} · ${new Date(op.at).toLocaleString('ru-RU')} · ${op.rows.filter(r => r.state === 'done').length}/${op.rows.length}`); details.append(summary, historyElement('p', op.instruction)); historyDiff(details, op.rows);
      if (op.kind === 'edit' && op.rows.some(r => ['done', 'partial'].includes(r.state) && !r.undone)) {
        const revert = historyElement('button', 'Откатить эту правку'); revert.onclick = () => { const keys = selected(); return act(async () => showPreview(await window.petya.previewHistoryUndo(record.id, op.id, keys))); }; details.append(revert);
      }
      card.append(details);
    }
    card.append(preview); target.append(card);
  }
}
run(refreshHistory)();
