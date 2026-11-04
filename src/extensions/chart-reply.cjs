const colors = ['#86c2ff', '#ffd07d', '#ba9bff', '#83dcbb', '#ff9daf', '#94dbea'];
function drawing(rows, total, kind) {
  let offset = 0;
  const rings = kind === 'donut' ? rows.map(({ count }, index) => {
    const percentage = 100 * count / total;
    const circle = `<circle r="54" cx="76" cy="76" pathLength="100" fill="none" stroke="${colors[index % colors.length]}" stroke-width="18" stroke-dasharray="${percentage} ${100 - percentage}" stroke-dashoffset="${-offset}"/>`;
    offset += percentage;
    return circle;
  }).join('') : '';
  const xml = value => value.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);
  const height = Math.max(kind === 'donut' ? 152 : 40, rows.length * 24 + 16);
  const max = Math.max(...rows.map(row => row.count));
  const legend = rows.map(({ label, count }, i) => {
    const y = 24 + i * 24;
    if (kind === 'bars') {
      return `<text x="12" y="${y}" font-size="14">${xml(label.slice(0, 20))}</text><rect x="192" y="${y-12}" width="${max ? 190 * count / max : 0}" height="12" rx="3" fill="${colors[0]}"/><text x="446" y="${y}" text-anchor="end" font-size="14">${count}</text>`;
    }
    return `<circle cx="166" cy="${y-5}" r="5" fill="${colors[i % colors.length]}"/><text x="178" y="${y}" font-size="14">${xml(label.slice(0, 26))}</text><text x="446" y="${y}" text-anchor="end" font-size="14">${count}</text>`;
  }).join('');
  const center = kind === 'donut' ? `<g transform="rotate(-90 76 76)">${rings}</g><text x="76" y="84" text-anchor="middle" font-size="26">${total}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 ${height}" width="460" height="${height}" font-family="sans-serif" fill="#edf2f5"><rect width="100%" height="100%" rx="12" fill="#20282d"/>${center}${legend}</svg>`;
  return { type: 'image', mimeType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') };
}

function chartReply({ kind, title, rows, emptyText }) {
  if (!['bars','donut'].includes(kind) || rows.some(row => typeof row.label !== 'string' || !Number.isSafeInteger(row.count) || row.count < 0)) throw Error('Некорректные данные диаграммы.');
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const lines = rows.map(({label, count}) => label + ' — ' + count);
  const text = total ? [title, 'Всего: ' + total, ...lines].join('\n') : title + '\n' + emptyText;
  const content = [{type: 'text', text}];
  if (total) {
    // Keep long legends readable while retaining every category in the text.
    const visible = rows.length <= 24 ? rows : [...rows.slice(0, 23), {
      label: 'Остальные категории', count: rows.slice(23).reduce((sum, row) => sum + row.count, 0)
    }];
    content.push(drawing(visible, total, kind));
  }
  return content;
}
module.exports = { chartReply };
