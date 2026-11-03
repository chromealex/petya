const STOP = new Set('петя заведи создай задачу задачи таску таск жире jira для реализации этой это эту фичи фичу нужно сделать пожалуйста'.split(' '));
function words(text) { return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2 && !STOP.has(w)); }
function wake(text) {
  const match = /(?:^|[\s,.!?])петя(?=$|[\s,:.!?—-])[\s,:.!?—-]*(.*)$/iu.exec(text.trim());
  return match ? match[1].trim() : null;
}
function actionableContext(context) {
  const value = String(context?.text || '').trim();
  return value.length >= 20 && words(value).length >= 4 && /(?:исправ|добав|сдела|реализ|нуж|долж|ошиб|не работа|сломан|поддерж|убра|убер|измен|созда|провер|почин|экран|функци|требован|критери|implement|fix|add|bug)/iu.test(value);
}
function doCommand(text) {
  const command = String(text).split('\nУточнение пользователя:')[0].trim();
  const match = /^(?:петя[,\s]*)?делай(?:[,\s]+(?:через|с помощью|силами|в|передай|поручи|исполнитель)?\s*(claude|клод[ауом]*|клауд[ауом]*|codex|кодекс[ауом]*))?[.!?\s]*$/iu.exec(command);
  if (!match) return null;
  return { target: match[1] ? /^(?:codex|кодекс)/iu.test(match[1]) ? 'codex' : 'claude' : '' };
}
function isDoCommand(text) { return Boolean(doCommand(text)); }

function isJiraCommand(text) { return /(?:декомпоз|разбей.*(?:фич|функц|задач))/iu.test(text) || /(?:созда|заве|добав|оформ|декомпоз|разбей|разби)/iu.test(text) && /(?:таск|задач|jira|жир)/iu.test(text); }
function candidates(command, contexts, before = Date.now(), days = 7) {
  const terms = words(command);
  const eligible = contexts.map(c => {
    if (!c.messages) return c;
    const messages = c.messages.filter(m => m.at <= before && before - m.at <= days * 86400000);
    return { ...c, at: messages.length ? Math.max(...messages.map(m => m.at)) : Infinity, text: messages.map(m => `[${new Date(m.at).toISOString()} · ${m.user}] ${m.text}`).join('\n') };
  }).filter(c => c.at <= before && before - c.at <= days * 86400000).sort((a,b) => a.at - b.at);
  const grouped = [], meetings = new Map();
  for (const item of eligible) {
    if (!item.sessionId) { grouped.push({ ...item }); continue; }
    let group = meetings.get(item.sessionId);
    if (!group || group.text.length + item.text.length > 44000) { group = { ...item, source: 'Zoom', title: 'Встреча · ' + new Date(item.at).toLocaleString('ru-RU'), text: '' }; meetings.set(item.sessionId, group); grouped.push(group); }
    group.text = (group.text + `\n[${item.source}] ` + item.text).trim(); group.at = item.at;
  }
  return grouped.map(c => {
    const hay = words(c.title + ' ' + c.text).join(' ');
    const score = terms.reduce((sum, w) => sum + (hay.includes(w) ? 1 : 0), 0);
    return { ...c, score };
  }).sort((a, b) => b.score - a.score || b.at - a.at).slice(0, 6);
}
function resolve(command, contexts, before, days = 7, sessionId = '') {
  const activeMeeting = sessionId && contexts.filter(c => c.sessionId === sessionId);
  const useMeeting = activeMeeting?.length && !/(?:slack|слак|вчера|прошл|позавчера)/iu.test(command);
  const options = candidates(command, useMeeting ? activeMeeting : contexts, before, days);
  if (!options.length) return { kind: 'missing', options };
  // Recency alone does not identify “this feature”. Ask when several sources are plausible.
  if (options.length === 1 || (options[0].score >= 2 && options[0].score > (options[1]?.score || 0) + 1)) {
    return { kind: 'selected', context: options[0], options };
  }
  return { kind: 'choose', options };
}
function standaloneContext(command, at, id) {
  if (words(command).length < 3 || /(?:этой|эту|этого|обсужд|разговор|выше|сказан)/iu.test(command)) return null;
  return { id, at, source:'Команда', title:command.replace(/^(?:петя[, ]*)?(?:создай|заведи|оформи|добавь)\s+(?:задачу|таску)\s*/iu,'').slice(0,100), text:command };
}
function fallbackDraft(command, context) {
  return {
    summary: ('Реализовать: ' + context.title).slice(0, 200),
    description: `Запрос: ${command}\n\nКонтекст (${context.source}, ${new Date(context.at).toISOString()}):\n${context.text}${context.url ? '\n\nИсточник: ' + context.url : ''}\n\nКритерии приёмки: уточнить перед началом реализации.`
  };
}
function adf(text) { return { type: 'doc', version: 1, content: text.split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }; }
function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Распознавание и модель должны работать на localhost по HTTP.');
  return url.href;
}
function isDocsCommand(text) { return /(?:найди|найти|покажи|ищи|поищи)/iu.test(text) && /(?:док|спек|описан|confluence|конфлю)/iu.test(text); }
module.exports = { doCommand, actionableContext, isDoCommand, standaloneContext, words, isDocsCommand, wake, isJiraCommand, candidates, resolve, fallbackDraft, adf, localEndpoint };
