let startupConnectionCheck, connectionCheckBusy = false, lastConnectionCheck = 0;
async function checkConnectionsOnOpen() {
  if (connectionCheckBusy || Date.now() - lastConnectionCheck < 30000) return;
  connectionCheckBusy = true; lastConnectionCheck = Date.now();
  try {
    await connectionsReady;
    await modulesReady;
    await Promise.allSettled(['whisper', 'ollama', 'slack', 'notion', 'asana', 'jira', 'confluence', 'zoom', 'claude', 'codex'].map(async service => {
      if (!moduleEnabled(service)) return;
      const card = document.querySelector(['claude', 'codex'].includes(service) ? `[data-ai-provider="${service}"]` : `[data-service="${service}"]`);
      const status = card?.querySelector('.connection-status');
      if (!status || card.querySelector('button:disabled') || serviceLogins.has(service) || (['jira', 'confluence'].includes(service) && atlassianLoginActive)) return;
      const checking = service === 'whisper' ? 'Запускаю Whisper и жду загрузки модели…' : 'Проверяю подключение при открытии…';
      status.textContent = checking; status.className = 'connection-status'; updateAIStatus();
      try {
        const result = await window.petya.checkSavedConnection(service);
        // A manual check, edit or sign-in always takes precedence over this result.
        if (status.textContent !== checking) return;
        status.textContent = result.message; status.className = 'connection-status ' + result.state;
        window.showConnectionRecovery?.(card,status,result);
        if (service === 'confluence') card.dataset.reconnect = String(result.action === 'reconnect');
      } catch (e) {
        if (status.textContent !== checking) return;
        status.textContent = e.message; status.className = 'connection-status error';
      } finally { updateAIStatus(); }
    }));
  } finally { connectionCheckBusy = false; }
}
window.addEventListener('DOMContentLoaded', () => { startupConnectionCheck = checkConnectionsOnOpen(); });
window.petyaEvents.onWindowShown(() => { startupConnectionCheck = checkConnectionsOnOpen(); });
