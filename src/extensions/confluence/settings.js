(()=>{
 const form=$('settings-form');
  const confluence = connectionNode('article', '', 'card'); confluence.dataset.service = 'confluence';
  const cs = connectionNode('p', 'Использует подключение Atlassian из карточки Jira', 'connection-status'); cs.setAttribute('role', 'status');
  const cb = connectionNode('button', 'Подключить Confluence', 'primary'); cb.type = 'button';
  cb.onclick = run(async () => {
    const atlassian = window.petyaAtlassian; // the shared Atlassian sign-in of Jira's card (src/extensions/jira/settings.js)
    if(!atlassian?.connected() || confluence.dataset.reconnect === 'true') { if (!atlassian) { cs.textContent = 'Добавьте Jira: вход Atlassian находится в его карточке.'; return; } return atlassian.connect(cs,cb,form); }
    const keys = ['jiraUrl', 'jiraEmail', 'jiraToken', 'confluenceSpace'];
    if (!form.elements.jiraUrl.value || (!atlassian.connected() && !form.elements.jiraEmail.value)) { connectionCards.get('jira').content.open = true; form.elements.jiraUrl.focus(); cs.textContent = 'Сначала укажите адрес Atlassian, email и токен в карточке Jira.'; return; }
    cb.disabled = true; cs.textContent = 'Проверяю Confluence…'; cs.className = 'connection-status';
    try { const r = await window.petya.connectService('confluence', Object.fromEntries(keys.map(k => [k, form.elements[k].value]))); form.elements.jiraToken.value = ''; cs.textContent = r.message; cs.className = 'connection-status' + (r.ready ? ' connected' : ''); }
    catch (e) { cs.textContent = e.message; cs.className = 'connection-status error'; connectionCards.get('jira').content.open = true; }
    finally { cb.disabled = false; }
  });
  confluence.append(form.elements.confluenceSpace.closest('label'));
  confluence.append(connectionNode('h2', 'Confluence'), connectionNode('p', 'Документация Atlassian · общие учётные данные с Jira'), cs, cb); form.insertBefore(confluence, form.querySelector(':scope > button'));
  for (const key of ['jiraUrl', 'jiraEmail', 'jiraToken', 'clear_jiraToken', 'confluenceSpace']) form.elements[key].addEventListener('input', () => { cs.textContent = 'Настройки Atlassian изменены · проверьте доступ заново'; cs.className = 'connection-status'; });
})();
