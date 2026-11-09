// What the Slack card saves and checks (connection-check, src/features/connection-checks.cjs): the user token and the
// channels, then auth.test and one read of the first chosen channel; nothing is changed. Moved from Petya's core
// (src/connections.cjs). With the browser sign-in the token is empty and Petya's client signs the request
// (src/service-oauth.cjs).
const {resolveChannels}=require('./channels.cjs');
module.exports={
 service:'slack',fields:['slackToken','slackChannels'],guide:'https://api.slack.com/apps',
 configured:settings=>!!(settings.slackToken||settings.slackCredential),
 async check(s,request){
  const need=(value,name)=>{if(!value)throw Error('Укажите '+name+'.');return value;};
  const call=(url,headers={},options={})=>request(url,{...options,headers});
    const headers = { Authorization: 'Bearer ' + (s.slackCredential ? '' : need(s.slackToken,'Slack token')) };
    const data = await call('https://slack.com/api/auth.test', headers, { method: 'POST' });
    if (!data.ok) throw new Error('Slack: ' + data.error);
    const channels = (s.slackChannels || '').trim() ? await resolveChannels(s.slackChannels, s.slackToken, request) : [];
    for (const channel of channels.slice(0, 1)) { const history = await call('https://slack.com/api/conversations.history?' + new URLSearchParams({ channel, limit: 1 }), headers); if (!history.ok) throw new Error(`Нет доступа к ${channel}: ${history.error}`); }
    return { message: `${data.team || 'Slack'} · ${data.user || 'авторизация проверена'}. ${channels.length ? `Найдено каналов/переписок: ${channels.length}. Чтение первого проверено; остальные проверяются при загрузке.` : 'Укажите каналы для загрузки обсуждений.'}`, ready: !!channels.length };
 }
};
