(() => {
  const call = (method,...args) => window.petya.feature('extensionReplies',method,...args);
  const list = document.getElementById('chat-extension-list');
  const limit = document.getElementById('chat-extension-limit');
  const status = document.getElementById('chat-extension-status');
  async function refresh() {
    try {
      const entries = await call('catalog');
      list.replaceChildren(...entries.map(entry => {
        const item = document.createElement('li');
        item.textContent = entry.name + (entry.installed ? ' · добавлено' : '') + ' — ' + entry.description;
        return item;
      }));
      if (document.activeElement !== limit) limit.value = await call('limit');
    } catch (error) { status.textContent = error.message; }
  }
  limit.onchange = async () => {
    try { await call('setLimit',limit.value); status.textContent = 'Порог сохранён.'; }
    catch (error) { status.textContent = error.message; }
  };
  document.getElementById('chat-extension-details').addEventListener('toggle',event=>{
    if (event.target.open) refresh();
  });
})();
