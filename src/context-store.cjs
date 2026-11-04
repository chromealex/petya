const DAY = 86400000;
function retention(value) { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error('Срок хранения: от 1 до 7 дней.'); return n; }
class ContextStore {
  constructor({ items = [], days = () => 7, save, now = Date.now }) { this.items = items; this.days = days; this.save = save; this.now = now; this.prune(); }
  prune() {
    const cutoff = this.now() - retention(this.days()) * DAY;
    const next = structuredClone(this.items).filter(x => Number.isFinite(x.at) && x.at >= cutoff && x.at <= this.now());
    // Individual Slack replies have their own expiry, not the parent thread's age.
    for (const x of next) if (x.messages) { x.messages = x.messages.filter(m => m.at >= cutoff && m.at <= this.now()); x.text = x.messages.map(m => `[${new Date(m.at).toISOString()} · ${m.user}] ${m.text}`).join('\n'); }
    const changed = JSON.stringify(next) !== JSON.stringify(this.items);
    if (changed) this.save(next);
    this.items = next;
    return require('./modules.cjs').filterContext(this.items);
  }
  put(items) {
    const old = this.items;
    const map = new Map(old.map(x => [x.id, x]));
    for (const item of items) map.set(item.id, item);
    const next = [...map.values()].filter(x => x.at >= this.now() - retention(this.days()) * DAY && x.at <= this.now()).sort((a,b) => a.at - b.at);
    // Fail visibly, never silently drop recent conversations.
    if (Buffer.byteLength(JSON.stringify(next)) > 100 * 1024 * 1024) throw new Error('Память контекста достигла 100 МБ. Уменьшите срок хранения или очистите память.');
    this.save(next); this.items = next;
  }
  clear() { this.save([]); this.items = []; }
}
module.exports = { ContextStore, retention, DAY };
