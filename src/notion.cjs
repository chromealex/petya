const rich = items => (items || []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
class Notion {
  constructor(request, pause = ms => new Promise(r => setTimeout(r, ms))) { this.request = request; this.pause = pause; this.queue = Promise.resolve(); this.last = 0; }
  api(route, token, body) {
    const job = this.queue.catch(() => {}).then(async () => {
      await this.pause(Math.max(0, 350 - (Date.now() - this.last))); this.last = Date.now();
      return this.request('https://api.notion.com/v1' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    }); this.queue = job; return job;
  }
  async content(id, token) {
    let calls = 0, text = '', truncated = false; const seen = new Set();
    const walk = async (blockId, depth) => {
      if (seen.has(blockId)) return; seen.add(blockId);
      let cursor; const cursors = new Set();
      do {
        if (calls >= 8 || depth > 4 || text.length >= 18000) { truncated = true; return; }
        calls++;
        const data = await this.api('/blocks/' + encodeURIComponent(blockId) + '/children?' + new URLSearchParams({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }), token);
        for (const block of data.results || []) {
          if (block.archived || block.in_trash) continue;
          const value = block[block.type] || {};
          const line = rich(value.rich_text || value.caption) || (value.cells ? value.cells.map(rich).join(' | ') : value.title || value.expression || '');
          if (line) text += line + '\n';
          if (text.length >= 18000) { truncated = true; return; }
          if (block.has_children && !['child_page', 'child_database'].includes(block.type)) await walk(block.id, depth + 1);
        }
        cursor = data.has_more ? data.next_cursor : null;
        if (data.has_more && (!cursor || cursors.has(cursor))) { truncated = true; break; }
        cursors.add(cursor);
      } while (cursor);
    };
    await walk(id, 0); return { text: text.slice(0, 18000), truncated };
  }
  async search(terms, token) {
    const pages = new Map(), warnings = [];
    for (const term of terms.slice(0, 4)) {
      let cursor;
      for (let i = 0; i < 2; i++) {
        const data = await this.api('/search', token, { query: term, filter: { value: 'page', property: 'object' }, sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: 50, ...(cursor ? { start_cursor: cursor } : {}) });
        for (const page of data.results || []) if (page.object === 'page' && !page.archived && !page.in_trash) pages.set(page.id, page);
        if (!data.has_more) break;
        if (i === 1) warnings.push('Notion: выдача ограничена; уточните поисковую фразу.');
        if (!data.next_cursor || data.next_cursor === cursor) break; cursor = data.next_cursor;
      }
    }
    const candidates = [...pages.values()].map(p => ({ page: p, title: rich(Object.values(p.properties || {}).find(v => v.type === 'title')?.title) || 'Без названия' })).map(p => ({ ...p, score: terms.reduce((n,t) => n + (p.title.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a,b) => b.score - a.score);
    if (candidates.length > 10) warnings.push('Notion: показаны 10 наиболее подходящих страниц.');
    const docs = [];
    for (const { page, title, score } of candidates.slice(0, 10)) {
      try {
        const content = await this.content(page.id, token);
        docs.push({ id: 'notion:' + page.id, source: 'Notion', title, ...content, url: 'https://www.notion.so/' + encodeURIComponent(page.id.replace(/-/g, '')), updated: page.last_edited_time || '', score });
        if (content.truncated) warnings.push(`Notion: «${title}» прочитана частично.`);
      } catch (e) {
        warnings.push(`Notion: не удалось прочитать «${title}»: ${e.message}`);
        if ([401, 403, 429].includes(e.status)) break;
      }
    }
    return { docs, warnings: [...new Set(warnings)] };
  }
}
module.exports = { Notion, rich };
