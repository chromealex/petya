// Company icon, cached in companies.json. Sources, in order:
// 1. Slack team.info (needs the `team:read` user scope);
// 2. the open Slack desktop window — the workspace icon at the top of its left rail, only when the
//    window belongs to the same workspace and screen recording is already allowed (never prompts);
// 3. Jira — the Atlassian site avatar (OAuth) or the avatar of the selected Jira project (API token).
// If none works the tab keeps the last good icon, or the first letter.
const DAY = 86400000;
const SLACK_HOSTS = /(^|\.)slack-edge\.com$|(^|\.)slack\.com$/;
const MAX_BYTES = 512 * 1024;

const toIcon = (nativeImage, bytes) => {
  if (!bytes?.length || bytes.length > MAX_BYTES) return '';
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  return image.isEmpty() ? '' : image.resize({ width: 40, height: 40, quality: 'good' }).toDataURL();
};
const httpsHost = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.hostname : ''; } catch { return ''; } };

// --- 1. Slack API ---
async function slackTeamIcon({ settings, request, download, nativeImage }) {
  if (!settings.slackCredential && !settings.slackToken) return { error: 'not_connected' };
  const headers = { Authorization: 'Bearer ' + (settings.slackCredential ? '' : settings.slackToken) };
  const data = await request('https://slack.com/api/team.info', { headers });
  if (!data?.ok) {
    // Without team:read, auth.test still names the workspace, which identifies the right Slack window.
    let team = '';
    try { const auth = await request('https://slack.com/api/auth.test', { method: 'POST', headers }); if (auth?.ok) team = auth.team || ''; } catch {}
    return { error: data?.error || 'unexpected_response', team };
  }
  const icon = data.team?.icon || {};
  if (icon.image_default) return { icon: '', team: data.team.name || '' };
  const url = icon.image_132 || icon.image_88 || icon.image_68 || icon.image_44 || '';
  if (!SLACK_HOSTS.test(httpsHost(url))) return { error: 'no_icon', team: data.team.name || '' };
  const value = toIcon(nativeImage, await download(url));
  return value ? { icon: value, team: data.team.name || '' } : { error: 'bad_icon', team: data.team.name || '' };
}

// --- 2. Slack window ---
// Finds the workspace icon in a BGRA bitmap: the topmost roughly square solid block in the top of the left rail.
function findWorkspaceIcon(bitmap, width, height) {
  const regionW = Math.min(width, Math.max(Math.round(width * 0.12), 80), 160), regionH = Math.min(height, Math.max(Math.round(height * 0.3), 120), 320);
  if (regionW < 20 || regionH < 20) return null;
  const at = (x, y) => { const i = (y * width + x) * 4; return [bitmap[i + 2], bitmap[i + 1], bitmap[i]]; };
  // Rail background: the most common colour along the rail's left edge.
  const counts = new Map();
  for (let y = 0; y < regionH; y++) for (const x of [1, 2, 3]) { const c = at(x, y).map(v => v >> 3 << 3).join(','); counts.set(c, (counts.get(c) || 0) + 1); }
  const background = [...counts].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  const differs = (x, y) => { const [r, g, b] = at(x, y); return Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > 48; };
  const seen = new Uint8Array(regionW * regionH), blocks = [];
  for (let y = 0; y < regionH; y++) for (let x = 0; x < regionW; x++) {
    if (seen[y * regionW + x] || !differs(x, y)) continue;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0; const stack = [[x, y]]; seen[y * regionW + x] = 1;
    while (stack.length) {
      const [px, py] = stack.pop(); area++;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
        if (nx < 0 || ny < 0 || nx >= regionW || ny >= regionH || seen[ny * regionW + nx] || !differs(nx, ny)) continue;
        seen[ny * regionW + nx] = 1; stack.push([nx, ny]);
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w >= 18 && h >= 18 && w <= 110 && h <= 110 && w / h > 0.8 && w / h < 1.25 && area / (w * h) > 0.6) blocks.push({ x: minX, y: minY, width: w, height: h });
  }
  return blocks.sort((a, b) => a.y - b.y || a.x - b.x)[0] || null;
}

// Slack window titles end with «… - <Workspace> - Slack»; only that workspace's window is used.
async function slackWindowIcon({ team, getSources, screenAllowed, nativeImage }) {
  if (!team || !getSources || !screenAllowed?.()) return { error: 'no_window' };
  const sources = await getSources({ types: ['window'], thumbnailSize: { width: 1600, height: 1000 }, fetchWindowIcons: false });
  const wanted = team.toLowerCase();
  const source = sources.find(s => / slack$/i.test(s.name) && s.name.toLowerCase().split(/\s+[-–—|]\s+/).some(part => part.trim() === wanted) && !s.thumbnail.isEmpty());
  if (!source) return { error: 'no_window' };
  const { width, height } = source.thumbnail.getSize();
  const rect = findWorkspaceIcon(source.thumbnail.toBitmap(), width, height);
  if (!rect) return { error: 'no_icon' };
  return { icon: source.thumbnail.crop(rect).resize({ width: 40, height: 40, quality: 'good' }).toDataURL() };
}

// --- 3. Jira ---
async function jiraIcon({ settings, request, download, atlassianToken, nativeImage }) {
  if (!settings.module_jira || settings.module_jira === 'false' || !settings.jiraUrl) return { error: 'not_connected' };
  if (settings.atlassianCredential && atlassianToken) {
    // OAuth: the site avatar from accessible-resources is a public image URL.
    const token = await atlassianToken(settings.atlassianCredential);
    const resources = await request('https://api.atlassian.com/oauth/token/accessible-resources', { headers: { Authorization: 'Bearer ' + token.accessToken } });
    const site = Array.isArray(resources) ? resources.find(r => r.id === token.site?.id) || resources.find(r => r.url === settings.jiraUrl) : null;
    if (site?.avatarUrl && httpsHost(site.avatarUrl)) { const value = toIcon(nativeImage, await download(site.avatarUrl)); if (value) return { icon: value }; }
    return { error: 'no_icon' };
  }
  // API token: the avatar of the selected Jira project, fetched from the same site with the same credentials.
  const key = String(settings.jiraProject || String(settings.jiraProjects || '').split(/[\s,]+/)[0] || '').trim();
  if (!key || !settings.jiraEmail || !settings.jiraToken) return { error: 'no_icon' };
  const site = new URL(settings.jiraUrl);
  const auth = { Authorization: 'Basic ' + Buffer.from(settings.jiraEmail + ':' + settings.jiraToken).toString('base64') };
  const project = await request(site.origin + '/rest/api/3/project/' + encodeURIComponent(key), { headers: auth });
  const url = project?.avatarUrls?.['48x48'] || '';
  if (!url || new URL(url).origin !== site.origin) return { error: 'no_icon' };
  const value = toIcon(nativeImage, await download(url, { headers: { ...auth, Accept: 'image/png' } }));
  return value ? { icon: value } : { error: 'bad_icon' };
}

// Refresh the active company's icon at most once a day (or when forced, e.g. right after connecting a service).
async function refreshCompanyIcon({ companies, companyId, force = false, now = Date.now, ...source }) {
  const company = companies.get(companyId);
  if (!force && company.iconAt && now() - company.iconAt < DAY) return false;
  const attempt = async fn => { try { return await fn(source); } catch (error) { return { error: error.message }; } };
  const slack = await attempt(slackTeamIcon);
  let result = slack.icon !== undefined ? { ...slack, source: 'slack' } : null;
  if (!result && slack.error !== 'not_connected') { const shot = await attempt(s => slackWindowIcon({ ...s, team: slack.team })); if (shot.icon) result = { icon: shot.icon, source: 'slack-window' }; }
  let jira = null;
  if (!result?.icon) { jira = await attempt(jiraIcon); if (jira.icon) result = { icon: jira.icon, source: 'jira' }; }
  if (result) { companies.setIcon(companyId, { icon: result.icon, source: result.icon ? result.source : '', at: now() }); return true; }
  // Nothing connected: drop an icon that came from a service; otherwise keep the last good icon.
  if (slack.error === 'not_connected' && jira?.error === 'not_connected') { companies.setIcon(companyId, { icon: '', source: '', at: now() }); return !!company.icon; }
  companies.setIcon(companyId, { icon: company.icon || '', source: company.iconSource || '', at: now() });
  return false;
}

module.exports = { slackTeamIcon, slackWindowIcon, findWorkspaceIcon, jiraIcon, refreshCompanyIcon };
