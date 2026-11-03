const optional = ['telegram', 'slack', 'notion', 'asana', 'jira', 'confluence', 'ai', 'googleplay', 'gmail', 'web'];
const key = name => 'module_' + (['claude', 'codex'].includes(name) ? 'ai' : name);
const defaults = Object.fromEntries(optional.map(name => [key(name), 'false']));
function enabled(settings, name) { return settings[key(name)] !== 'false'; }
function assertEnabled(settings, name) {
  if (!enabled(settings, name)) throw new Error('Модуль ' + name + ' выключен. Включите его галочкой в «Подключениях».');
}
function migrate(settings, saved) {
  const configured = { telegram:settings.telegramCredential, slack: settings.slackToken || settings.slackCredential, notion: settings.notionToken || settings.notionCredential,
    asana: settings.asanaCredential, jira: settings.jiraToken || settings.atlassianCredential,
    confluence: settings.jiraToken || settings.atlassianCredential, ai: false, gmail:settings.gmailCredential, googleplay:settings.googlePlayCredential };
  for (const name of optional) if (!(key(name) in saved)) settings[key(name)] = String(!!configured[name]);
}
function serviceForURL(address) {
  const u = new URL(address);
  if (u.hostname === 'slack.com' || u.hostname.endsWith('.slack.com')) return 'slack';
  if (u.hostname === 'playdeveloperreporting.googleapis.com') return 'googleplay';
  if (u.hostname === 'api.notion.com') return 'notion';
  if (u.hostname === 'app.asana.com') return 'asana';
  if (u.hostname.endsWith('.atlassian.net') || u.hostname === 'api.atlassian.com') return u.pathname.includes('/wiki/') ? 'confluence' : 'jira';
  return null;
}
module.exports = { optional, key, defaults, enabled, assertEnabled, migrate, serviceForURL };
