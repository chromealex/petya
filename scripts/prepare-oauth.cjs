// Generates registration inputs only. Does not register apps or contact providers.
const fs = require('node:fs'), path = require('node:path');
function registration(origin = 'https://auth.petya-app.ru') {
  const u = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Укажите HTTP localhost origin или HTTPS origin без пути, параметров и пароля.');
  const callbacks = Object.fromEntries(['slack', 'notion', 'atlassian'].map(p => [p, u.origin + '/oauth/' + p + '/callback']));
  const atlassian = { name: 'Petya', grantType: 'resource-level', callbackUrl: callbacks.atlassian, scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user', 'read:sprint:jira-software', 'write:sprint:jira-software', 'read:board-scope:jira-software', 'read:project:jira', 'write:board-scope:jira-software', 'read:issue:jira-software', 'search:confluence', 'offline_access'], distribution: 'private-until-tested', clientSecretLocation: 'server-only' };
  return { callbacks, atlassian, slack: { display_information: { name: 'Petya', description: 'Контекст обсуждений для помощника Петя', background_color: '#171a1b' }, oauth_config: { redirect_urls: [callbacks.slack], scopes: { user: ['channels:read', 'groups:read', 'channels:history', 'groups:history', 'im:history', 'mpim:history'] } }, settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: true } } };
}
if (require.main === module) {
  try {
    const data = registration(process.argv[2]), output = path.resolve(process.argv[3] || 'oauth/generated'); fs.mkdirSync(output, { recursive: true });
    for (const [name, value] of [['slack-manifest.json', data.slack], ['callbacks.json', data.callbacks], ['atlassian-registration.json', data.atlassian]]) fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    console.log('Параметры регистрации созданы: ' + output);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { registration };
