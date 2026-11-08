// Company icon from the connected Slack workspace (team.info → icon), cached in companies.json.
// Needs the `team:read` user scope; tokens without it simply keep the letter avatar.
const DAY = 86400000;
const ICON_HOSTS = /(^|\.)slack-edge\.com$|(^|\.)slack\.com$/;

// Returns {icon, team} or {error}. `request` is the app's API request (adds OAuth tokens); `download` fetches bytes.
async function slackTeamIcon({ settings, request, download, nativeImage }) {
  if (!settings.slackCredential && !settings.slackToken) return { error: 'not_connected' };
  const data = await request('https://slack.com/api/team.info', { headers: { Authorization: 'Bearer ' + (settings.slackCredential ? '' : settings.slackToken) } });
  if (!data?.ok) return { error: data?.error || 'unexpected_response' };
  const icon = data.team?.icon || {};
  if (icon.image_default) return { icon: '', team: data.team.name || '' };
  const url = icon.image_132 || icon.image_88 || icon.image_68 || icon.image_44 || '';
  let host = '';
  try { const parsed = new URL(url); if (parsed.protocol === 'https:') host = parsed.hostname; } catch {}
  if (!ICON_HOSTS.test(host)) return { error: 'no_icon' };
  const bytes = await download(url);
  if (!bytes?.length || bytes.length > 512 * 1024) return { error: 'bad_icon' };
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) return { error: 'bad_icon' };
  return { icon: image.resize({ width: 40, height: 40, quality: 'good' }).toDataURL(), team: data.team.name || '' };
}

// Refresh the active company's icon at most once a day (or when forced, e.g. right after connecting Slack).
async function refreshCompanyIcon({ companies, companyId, force = false, now = Date.now, ...source }) {
  const company = companies.get(companyId);
  if (!force && company.iconAt && now() - company.iconAt < DAY) return false;
  let result;
  try { result = await slackTeamIcon(source); } catch (error) { result = { error: error.message }; }
  if (result.error === 'not_connected') { if (company.iconSource === 'slack') companies.setIcon(companyId, { icon: '', source: '', at: now() }); return true; }
  // Keep the last good icon when Slack is unreachable or the token lacks team:read.
  if (result.error) { companies.setIcon(companyId, { icon: company.icon || '', source: company.iconSource || '', at: now() }); return false; }
  companies.setIcon(companyId, { icon: result.icon, source: 'slack', at: now() });
  return true;
}

module.exports = { slackTeamIcon, refreshCompanyIcon };
