// Search source of Slack for «Поиск по всему» (`search-source`, src/extensions/search-all/registry.cjs): Slack's
// search.messages with the connected token. Only a token allowed to search (a user token with search:read) can;
// otherwise the card says so and the Slack threads Petya keeps in its context memory still answer.
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const https=u=>/^https:\/\//.test(String(u||''))?String(u):'';
const OFF=new Set(['not_allowed_token_type','missing_scope','not_authed','invalid_auth','no_permission','token_revoked','account_inactive']);
const connected=settings=>!!(settings.slackToken||settings.slackCredential);
module.exports={
 id:'slack',label:'Slack',order:10,icon:'chat',
 ready:settings=>connected(settings),
 off:'Slack не подключён.',
 async search(s,{own}){
  const settings=s.settings||{};
  if(!connected(settings))return {state:'off',items:[],note:'Slack не подключён.'};
  const query=own.slice(0,4).join(' ');
  const r=await s.request('https://slack.com/api/search.messages?'+new URLSearchParams({query,count:'20',sort:'score',highlight:'false'}),{headers:{Authorization:'Bearer '+(settings.slackToken||'')},timeoutMs:8000});
  if(!r?.ok){if(OFF.has(r?.error))return {state:'limited',items:[],note:'Токен Slack не даёт искать по всему Slack — искал в сохранённой переписке.'};throw Error('Slack: '+(r?.error||'ошибка поиска'));}
  return {items:(r.messages?.matches||[]).filter(m=>m?.text).map(m=>({source:'slack',id:'slack:'+(m.channel?.id||'')+':'+m.ts,title:m.channel?.name?'#'+one(m.channel.name):'Slack',text:String(m.text).slice(0,4000),
   url:https(m.permalink),at:Math.round(Number(m.ts)*1000)||0,meta:one(m.username||m.user).slice(0,80),ts:String(m.ts||''),thread:(m.channel?.id||'')+':'+(m.thread_ts||m.ts)}))};
 }
};
