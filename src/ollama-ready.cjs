const { localEndpoint } = require('./core.cjs');
const DEFAULT_MODEL = 'qwen3:4b';
async function readProgress(body, onValue) {
  const decoder = new TextDecoder(); let buffer = '', success = false;
  const consume = line => { if (!line.trim()) return; const value = JSON.parse(line); if (value.error) throw new Error(value.error); if (value.status === 'success') success = true; onValue(value); };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let pos; while ((pos = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, pos)); buffer = buffer.slice(pos + 1); }
    if (buffer.length > 1024 * 1024) throw new Error('Некорректный ответ загрузки модели.');
  }
  buffer += decoder.decode(); consume(buffer);
  if (!success) throw new Error('Загрузка модели прервалась. Нажмите «Запустить Ollama» для продолжения.');
}
class OllamaReady {
  constructor({ settings, save, install, emit, fetcher = fetch, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
    Object.assign(this, { settings, save, install, emit, fetcher, wait });
    this.state = { phase: 'idle', busy: false, message: '' };
  }
  update(phase, message, extra = {}) { this.state = { phase, message, busy: !['idle', 'done', 'error', 'cancelled'].includes(phase), ...extra }; this.emit(this.state); return this.state; }
  start(model, {forcePull=false}={}) {
    if (this.pending) return this.pending;
    this.selectedModel = model;this.forcePull=forcePull;
    this.controller = new AbortController();
    this.pending = this.prepare().catch(e => this.update(this.controller.signal.aborted ? 'cancelled' : 'error', this.controller.signal.aborted ? 'Запуск отменён. Загрузку модели можно продолжить следующей попыткой.' : e.message)).finally(() => { this.pending = null; });
    return this.pending;
  }
  cancel() { this.controller?.abort(); this.install.cancel(); return this.state; }
  async prepare() {
    const original = { ollamaUrl: this.settings().ollamaUrl, model: this.settings().model };
    const base = new URL(localEndpoint(original.ollamaUrl));
    const request = async (route, data, timeout = 10000) => {
      const response = await this.fetcher(new URL(route, base), { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(timeout)]) });
      if (!response.ok) throw new Error(`Ollama: HTTP ${response.status}.`);
      return response;
    };
    this.update('starting', 'Запускаю Ollama…');
    let tags;
    try { tags = await (await request('/api/tags')).json(); }
    catch {
      this.controller.signal.throwIfAborted();
      const installed = await this.install.start();
      this.controller.signal.throwIfAborted();
      if (installed.phase !== 'done') throw new Error(installed.message);
      for (let i = 0; i < 60; i++) {
        try { tags = await (await request('/api/tags', null, 2000)).json(); break; }
        catch { this.controller.signal.throwIfAborted(); await this.wait(1000); }
      }
      if (!tags) throw new Error('Ollama пока не запустился. Повторите запуск.');
    }
    if (!Array.isArray(tags.models)) throw new Error('Ollama вернул неверный список моделей.');
    let model = this.selectedModel || original.model;
    // Reuse only local models capable of text completion, never embeddings or cloud models.
    if (!model) {
      const candidates = tags.models.filter(m => typeof m.name === 'string' && !m.name.includes('cloud')).sort((a,b) => (a.size || 0) - (b.size || 0));
      for (const candidate of candidates) {
        const info = await (await request('/api/show', { model: candidate.name })).json();
        if (info.capabilities?.includes('completion') && !info.remote_host) { model = candidate.name; break; }
      }
    }
    model ||= DEFAULT_MODEL;
    if (this.forcePull || !tags.models.some(m => m.name === model || m.name === model + ':latest')) {
      this.update('pulling', `Загружаю модель ${model}…`);
      const response = await request('/api/pull', { model, stream: true }, 2 * 3600000);
      if (!response.body) throw new Error('Ollama не начал загрузку модели.');
      await readProgress(response.body, value => this.update('pulling', `Загружаю модель ${model}…`, { received: value.completed || 0, total: value.total || 0 }));
    }
    this.update('warming', `Проверяю модель ${model}… Первый запуск может занять несколько минут.`);
    const result = await (await request('/api/chat', { model, stream: false, think: false, messages: [{ role: 'user', content: 'Ответь одним словом: готов.' }], options: { num_predict: 32 }, keep_alive: '10m' }, 300000)).json();
    if (result.error || !result.message?.content?.trim()) throw new Error('Модель не ответила на проверку. Повторите запуск.');
    this.controller.signal.throwIfAborted();
    if (original.ollamaUrl !== this.settings().ollamaUrl || original.model !== this.settings().model) throw new Error('Настройки изменились во время запуска. Повторите запуск.');
    await this.save({ model, ollamaUrl: original.ollamaUrl });
    return this.update('done', `Ollama готов · ${model}. Можно давать Пете задачи.`, { model, ollamaUrl: original.ollamaUrl, ready: true });
  }
}
module.exports = { OllamaReady, readProgress, DEFAULT_MODEL };
