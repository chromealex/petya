// Read-only Jira chat provider. The host supplies its authorized project scope and API client.
const { chartReply } = require('../chart-reply.cjs');
// «Покажи график по закрытым задачам»: closed issues by week (or day for a week) as a chart in the chat.
function closedChart(command){
  const s=String(command);
  return /график|диаграмм|динамик|гистограм|chart|по неделям|по дням/iu.test(s)&&/закрыт|выполнен|сделан|решён|решен|done|завершён|завершен/iu.test(s)
    &&/зада[чн]|таск|тикет|баг|issue/iu.test(s)&&!/^(?:петя[,!\s]+)?(?:не\s|[«"“]|объясни фразу|переведи)/iu.test(s.trim())&&!/созда[йт]|заведи|удали|перенеси/iu.test(s);
}
const dayMs=86400000;
const isoDay=t=>new Date(t).toISOString().slice(0,10);
async function closed(command,{projects,searchPage},now=Date.now()){
  if(!projects.length)throw Error('Выберите доступный проект в подключении Jira.');
  const mine=/у меня|мо[ияёе]|на мн[её]|мне назнач|я закрыл/iu.test(command),bugs=/баг/iu.test(command);
  const days=/за (?:эту |последнюю )?неделю|7 дней/iu.test(command)?7:/за (?:этот |последний )?месяц|30 дней/iu.test(command)?30:/за квартал|90 дней/iu.test(command)?90:56;
  const daily=days<=14;
  const quote=v=>'"'+v.replace(/["\\]/g,'\\$&')+'"';
  const jql=['project IN ('+projects.map(quote).join(', ')+')','statusCategory = Done','resolved >= -'+days+'d',mine?'assignee = currentUser()':'',bugs?'issuetype = Bug':''].filter(Boolean).join(' AND ')+' ORDER BY resolved';
  const start=now-days*dayMs,buckets=new Map();
  // Weeks start on Monday; each bucket is labelled by its first day.
  const bucket=t=>{const d=new Date(t);d.setHours(0,0,0,0);if(!daily)d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();};
  for(let t=bucket(start);t<=now;t+=daily?dayMs:7*dayMs)buckets.set(t,0);
  let token,seen=new Set(),tokens=new Set(),total=0;
  do{
    const params=new URLSearchParams({jql,fields:'resolutiondate',maxResults:'100'});if(token)params.set('nextPageToken',token);
    const page=await searchPage('/rest/api/3/search/jql?'+params);
    if(!Array.isArray(page?.issues))throw Error('Jira вернула неполную страницу задач.');
    for(const issue of page.issues){const id=issue.id||issue.key;if(!id||seen.has(id))continue;seen.add(id);const at=Date.parse(issue.fields?.resolutiondate);if(!Number.isFinite(at)||at<start)continue;const b=bucket(at);buckets.set(b,(buckets.get(b)||0)+1);total++;}
    token=page.nextPageToken;if(page.isLast===false&&!token||token&&tokens.has(token))throw Error('Не удалось получить все страницы задач из Jira.');if(token)tokens.add(token);
    if(seen.size>5000)break;
  }while(token);
  const label=t=>new Date(t).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+(daily?'':' –');
  const rows=[...buckets].sort((a,b)=>a[0]-b[0]).map(([t,count])=>({label:label(t),count}));
  const title='Закрытые '+(bugs?'баги':'задачи')+(mine?' (мои)':'')+' по '+(daily?'дням':'неделям')+' · '+projects.join(', ')+' · с '+isoDay(start);
  return chartReply({kind:'bars',title,rows,emptyText:'За этот период закрытых '+(bugs?'багов':'задач')+' нет.'});
}
function matches(command) {
  if (closedChart(command)) return true;
  return /(?:^|[^\p{L}])(?:jira|д?жир[аеуы]?)(?![\p{L}])/iu.test(command)
    && /зада[чн]|таск/iu.test(command)
    && /у меня|мо[ияёе]|на мн[её]|мне назнач/iu.test(command)
    && /сколько|количеств|по типам|по статусам|распределен|распределён|диаграмм|пончик/iu.test(command)
    && !/^(?:петя[,!\s]+)?(?:не\s|[«"“]|объясни фразу|переведи)/iu.test(command.trim())
    && !/проект[аеу]?\s+[A-Z][A-Z0-9_-]*\b/u.test(command)
    && !/созда[йт]|заведи|удали|перенеси|просроч|за неделю|за месяц|вчера|сегодня|открыт|закрыт|незакрыт|спринт/iu.test(command);
}
async function answer(command, { projects, searchPage }) {
  if (closedChart(command)) return closed(command, { projects, searchPage });
  if (!projects.length) throw Error('Выберите доступный проект в подключении Jira.');
  const stalled = /завис|застрял|без движения/iu.test(command);
  const staleKeys = [];
  const cutoff = Date.now() - 7 * 86400000;
  const byStatus = stalled || /статус/iu.test(command);
  const field = byStatus ? 'status' : 'issuetype';
  const quote = s => '"' + s.replace(/["\\]/g, '\\$&') + '"';
  const jql = 'assignee = currentUser() AND project IN (' + projects.map(quote).join(', ') + ') ORDER BY key';
  const groups = new Map(), ids = new Set(), tokens = new Set();
  let token;
  do {
    const params = new URLSearchParams({ jql, fields: stalled ? 'status,updated' : field, maxResults: '100' });
    if (token) params.set('nextPageToken', token);
    const page = await searchPage('/rest/api/3/search/jql?' + params);
    if (!Array.isArray(page?.issues)) throw Error('Jira вернула неполную страницу задач.');
    for (const issue of page.issues) {
      const id = issue.id || issue.key;
      if (!id) throw Error('Jira вернула задачу без идентификатора.');
      if (ids.has(id)) continue;
      ids.add(id);
      if (stalled && issue.fields?.status?.statusCategory?.key === 'indeterminate' &&
          Date.parse(issue.fields.updated) <= cutoff) staleKeys.push(issue.key);
      const label = issue.fields?.[field]?.name || 'Без значения';
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    token = page.nextPageToken;
    if (page.isLast === false && !token || token && tokens.has(token)) throw Error('Не удалось получить все страницы задач из Jira.');
    if (token) tokens.add(token);
  } while (token);
  const rows = Array.from(groups, ([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  const title = 'Мои задачи Jira по ' + (byStatus ? 'статусам' : 'типам') + ' · ' + projects.join(', ');
  const content = chartReply({ kind: 'donut', title, rows, emptyText: 'Назначенных вам задач нет.' });
  if (stalled) content.push({type:'text',text:'В работе без обновлений 7 дней и дольше: ' + (staleKeys.join(', ') || 'нет') + '.'});
  return content;
}
function context({ settings, workspace, check }) {
  return { projects: settings.jiraProject ? [settings.jiraProject] : [], searchPage: async path => {
    check();
    const page = await workspace.api(path, {}, settings);
    check();
    return page;
  } };
}
module.exports = { matches, answer, context, closedChart, closed };
