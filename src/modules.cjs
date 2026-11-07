const {AsyncLocalStorage}=require('node:async_hooks');
const projectScope=new AsyncLocalStorage();
const optional = ['unity', 'telegram', 'slack', 'notion', 'asana', 'jira', 'confluence', 'ai', 'googleplay', 'gmail', 'web'];
const key = name => 'module_' + (['claude', 'codex'].includes(name) ? 'ai' : name==='outlook'?'gmail':name);
const defaults = Object.fromEntries(optional.map(name => [key(name), 'false']));
function projectDisabled(name){return projectScope.getStore()?.disabledServices?.includes(key(name).replace('module_',''))||false;}
function withProject(project,work){return projectScope.run(project?{id:project.id,disabledServices:[...(project.disabledServices||[])]}:null,work);}
function enabled(settings, name) { return !projectDisabled(name)&&settings[key(name)] !== 'false'; }
function assertEnabled(settings, name) {
  if(projectDisabled(name))throw new Error('Сервис '+name+' отключён для этого проекта. Включите его в настройках проекта.');
  if (!enabled(settings, name)) throw new Error('Модуль ' + name + ' выключен. Включите его галочкой в «Подключениях».');
}
function migrate(settings, saved) {
  const configured = { telegram:settings.telegramCredential, slack: settings.slackToken || settings.slackCredential, notion: settings.notionToken || settings.notionCredential,
    asana: settings.asanaCredential, jira: settings.jiraToken || settings.atlassianCredential,
    confluence: settings.jiraToken || settings.atlassianCredential, ai: false, gmail:settings.gmailCredential||settings.microsoftCredential, googleplay:settings.googlePlayCredential };
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
function filterContext(items){const scope=projectScope.getStore();if(!scope?.disabledServices?.length)return items;return items.filter(item=>{const source=String(item.source||'').toLowerCase();const service=optional.find(name=>source.includes(name))||(/почт|outlook|microsoft/.test(source)?'gmail':null);return !service||!projectDisabled(service);});}
module.exports = { withProject,projectDisabled,filterContext,optional, key, defaults, enabled, assertEnabled, migrate, serviceForURL };
