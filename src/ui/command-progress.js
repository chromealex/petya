// Completed steps are reused on retry; external writes are never blindly replayed.
class CommandProgress {
  constructor({ change = () => {}, now = Date.now } = {}) {
    this.change = change; this.now = now; this.state = 'idle'; this.busy = false;
    this.failed = null; this.startedAt = 0; this.label = 'Готов к команде'; this.steps = [];
  }
  // Steps of the current request, shown in the chat as an expandable list.
  update(state, label) { if(state==='running')state='working';if(state==='working'&&!String(label||'').trim())label='Думаю…'; if (state === 'working' && label && this.steps?.at(-1)?.label !== label) { const last = this.steps.at(-1); if (last) last.done = this.now(); this.steps.push({ label, at: this.now() }); } this.state = state; this.label = label; this.change(this); }
  reset() { if(this.busy)return false;this.failed=null;this.request=null;this.retryable=false;this.startedAt=0;this.update('idle','');return true; }
  cancel(){if(this.request)this.request.cancelled=true;this.failed=null;this.retryable=false;this.update('idle','Ответ остановлен');}
  async resume(request=this.request){if(this.busy||!request?.cancelled)return false;request.cancelled=false;return this.execute(request);}
  async start(command, work) {
    if (this.busy) return false;
    this.failed = null;
    return this.execute({ command, work, cache: new Map() });
  }
  async execute(request) {
    if (this.busy) return false;
    this.busy = true; this.request = request; this.startedAt = this.now(); this.retryable = false; this.steps = [];
    this.update('working', 'Разбираю запрос');
    try {
      await request.work(this);
      this.failed = null;
      if (this.state === 'working') this.update('done', 'Готово');
      return true;
    } catch (error) {
      if(request.cancelled){this.failed=null;this.update('idle','Ответ остановлен');return false;}
      this.failed = this.retryable ? request : null;
      this.update('error', String(error.message || error) + (this.failed
        ? ' Запрос сохранён. Скажите «повтори».'
        : ' Запрос сохранён в поле ввода. Перед повторной отправкой проверьте результат действия.'));
      return false;
    } finally { this.busy = false; this.change(this); }
  }
  async step(key, label, action, retryable = false) {
    if(this.request.cancelled)throw Error('Ответ остановлен.');
    if (this.request.cache.has(key)) return this.request.cache.get(key);
    this.retryable = retryable; this.update('working', label);
    const value = await action();
    if(this.request.cancelled)throw Error('Ответ остановлен.');
    this.request.cache.set(key, value);
    // Code outside a known safe step must not inherit its retry permission.
    this.retryable = false;
    return value;
  }
  async retry() {
    if (this.busy || !this.failed) return false;
    const request = this.failed; this.failed = null;
    return this.execute(request);
  }
  static isRetry(text) { return /^(?:петя[\s,:.!?—-]*)?(?:повтори|попробуй (?:ещ[её] раз|снова)|повтори (?:запрос|команду|пожалуйста))[.!?\s]*$/iu.test(String(text).trim()); }
}
if (typeof module !== 'undefined') module.exports = { CommandProgress };
