const { DAY } = require('./context-store.cjs');
const { selectors: channels, channelId, matches } = require('./slack.cjs');
class SlackContext {
  constructor({ settings, request, store, now = Date.now }) { Object.assign(this, { settings, request, store, now }); this.queue = []; this.next = {}; this.epoch = 0; this.running = false; this.status = { message: 'Slack ещё не обновлялся', pending: 0 }; }
  reset() { this.epoch++; this.queue = []; this.next = {}; this.status = { message: 'Настройки Slack изменены', pending: 0 }; }
  start() {
    const s = this.settings(); if (!s.slackToken && !s.slackCredential) throw new Error('Подключите Slack.');
    const ids = channels(s.slackChannels);
    if (!this.queue.length && !this.running) {
      // Rescan the whole retained window so edits and replies on older roots are discovered.
      const oldest = String((this.now() - Number(s.contextDays) * DAY) / 1000);
      this.discovered = new Set(ids.filter(id => channelId.test(id)));
      this.listCursors = new Set();
      this.queue = [...this.discovered].map(channel => ({ method: 'conversations.history', channel, oldest }));
      if (ids.some(id => !channelId.test(id))) this.queue.unshift({ method: 'conversations.list', selectors: ids, oldest });
      this.status.errors = [];
      this.status.message = 'Обновляю Slack, включая треды…';
    }
    this.status.pending = this.queue.length;
    return this.tick();
  }
  async tick() {
    if (this.running || !this.queue.length) return this.status;
    const index = this.queue.findIndex(j => (this.next[j.method] || 0) <= this.now());
    if (index < 0) { this.status.message = 'Ожидаю лимит Slack; загрузка продолжится автоматически'; return this.status; }
    this.running = true; const job = this.queue.splice(index, 1)[0], epoch = this.epoch, s = { ...this.settings() };
    this.next[job.method] = this.now() + 61000;
    try {
      const query = job.method === 'conversations.list' ? { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200' } : { channel: job.channel, oldest: job.oldest, limit: '15' };
      if (job.cursor) query.cursor = job.cursor;
      if (job.ts) query.ts = job.ts;
      const data = await this.request('https://slack.com/api/' + job.method + '?' + new URLSearchParams(query), { headers: { Authorization: 'Bearer ' + s.slackToken } });
      if (epoch !== this.epoch || s.slackToken !== this.settings().slackToken || s.slackCredential !== this.settings().slackCredential || s.slackChannels !== this.settings().slackChannels) return this.status;
      if (!data.ok) throw new Error('Slack: ' + data.error);
      if (job.method === 'conversations.list') {
        for (const c of data.channels || []) {
          if (!c.is_archived && channelId.test(c.id) && matches(c.name, job.selectors) && !this.discovered.has(c.id)) {
            this.discovered.add(c.id);
            this.queue.push({ method: 'conversations.history', channel: c.id, oldest: job.oldest });
          }
        }
        const cursor = (data.response_metadata?.next_cursor || '').trim();
        if (cursor) {
          if (this.listCursors.has(cursor)) throw new Error('Slack повторил страницу списка каналов.');
          this.listCursors.add(cursor);
          this.queue.push({ ...job, cursor });
        } else if (!this.discovered.size) throw new Error('Не найдены каналы по указанным названиям или маскам.');
        this.status.message = `Найдено каналов/переписок: ${this.discovered.size}. Загружаю обсуждения…`;
        return this.status;
      }
      const staged = new Map();
      for (const m of data.messages || []) {
        if ((!m.text && !m.files?.length) || m.subtype === 'channel_join' || !/^\d+\.\d+$/.test(m.ts)) continue;
        const root = job.ts || m.thread_ts || m.ts, id = `slack:${job.channel}:${root}`;
        let item = staged.get(id) || this.store.items.find(x => x.id === id);
        item = item ? structuredClone(item) : { id, source: 'Slack', channel: job.channel, title: (m.text||m.files?.[0]?.name||'Лог Slack').replace(/\s+/g, ' ').slice(0, 100), messages: [], url: `https://app.slack.com/archives/${job.channel}/p${root.replace('.', '')}` };
        const message = { ts: m.ts, at: Number(m.ts) * 1000, user: m.user || m.bot_id || 'Slack', text: (m.text||'')+(m.files?.length?'\nВложения: '+m.files.map(f=>f.name).join(', '):''), files:(m.files||[]).map(({id,name,size,url_private,url_private_download,is_external,mode,filetype})=>({id,name,size,url_private,url_private_download,is_external,mode,filetype})) };
        item.messages = [...(item.messages || []).filter(v => v.ts !== m.ts), message].filter(v => v.at >= this.now() - Number(s.contextDays) * DAY && v.at <= this.now()).sort((a,b) => a.at - b.at);
        if (!item.messages.length) continue;
        item.at = Math.max(...item.messages.map(v => v.at));
        item.text = item.messages.map(v => `[${new Date(v.at).toISOString()} · ${v.user}] ${v.text}`).join('\n');
        staged.set(id, item);
        if (job.method === 'conversations.history' && m.reply_count > 0 && !this.queue.some(j => j.channel === job.channel && j.ts === root)) this.queue.push({ method: 'conversations.replies', channel: job.channel, oldest: job.oldest, ts: root });
      }
      this.store.put([...staged.values()]);
      const cursor = data.response_metadata?.next_cursor;
      if (cursor) this.queue.push({ ...job, cursor });
      else if (data.has_more) { throw new Error('Slack вернул неполную страницу без курсора; повторите синхронизацию.'); }
      this.status.updatedAt = this.now(); this.status.message = this.queue.length ? 'Slack обновляется: загружаю страницы и ответы в тредах' : 'Slack обновлён, включая доступные треды';
      if (this.status.errors?.length) this.status.message += '. Не всё загружено: ' + this.status.errors.join('; ');
    } catch (e) {
      if (epoch !== this.epoch) return this.status;
      if (e.status === 429) { this.next[job.method] = this.now() + Math.max(61000, (e.retryAfter || 60) * 1000); this.queue.unshift(job); this.status.message = 'Slack ограничил запросы; продолжу после Retry-After'; }
      else { this.status.errors = [...(this.status.errors || []), (job.channel || 'Поиск каналов') + ': ' + e.message].slice(-20); this.status.message = 'Часть переписок не загружена: ' + this.status.errors.join('; '); }
    } finally { this.running = false; this.status.pending = this.queue.length; }
    return this.status;
  }
}
module.exports = { SlackContext, channels };
