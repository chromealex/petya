// Recognize bounded technical excerpts so the surrounding explanation stays visible.
function technicalExcerpt(lines, start) {
  const first = lines[start].trim();
  let end = start + 1, kind;
  if (/^at\s+\S|^File ".+", line \d+/.test(first)) {
    kind = 'Стек вызовов';
    while (end < lines.length && /^\s*(?:at\s+\S|File ".+", line \d+)/.test(lines[end])) end++;
  } else if (/^[{\[]$/.test(first)) {
    let depth=0;
    end=start;
    do {
      const tokens=lines[end++].replace(/"(?:\\.|[^"\\])*"/g,'');
      for(const char of tokens){
        if(char==='{' || char==='[') depth++;
        if(char==='}' || char===']') depth--;
      }
    } while(depth>0 && end<lines.length);
    if(depth!==0)return null;
    try { JSON.parse(lines.slice(start,end).join('\n')); } catch { return null; }
    kind = 'JSON';
  } else if (/^(?:\$ |> |stdout:|stderr:)/i.test(first)) {
    kind = 'Вывод команды';
    while (end < lines.length && lines[end].trim() && !/^(?:#+\s|\*\*|итог|вывод|дальше|следующий шаг|рекоменд)/iu.test(lines[end])) end++;
  }
  return kind && end-start >= 8 ? {kind,end} : null;
}

function renderTechnicalBlock(body, kind, fold) {
  const pre = document.createElement('pre'), code = document.createElement('code');
  code.textContent = body.join('\n'); pre.append(code);
  if (!fold || body.length < 8) return pre;
  const panel = document.createElement('details'), summary = document.createElement('summary');
  panel.className = 'technical-block';
  summary.textContent = kind + ' · строк: ' + body.length;
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Копировать блок';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'Скопировано'; }
    catch { notice('Не удалось скопировать блок.', true); }
  };
  panel.append(summary,pre,copy); return panel;
}
