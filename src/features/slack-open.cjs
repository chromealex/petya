// «В обсуждение» and Slack message links open the Slack app, not a browser: a link
// https://<workspace>.slack.com/archives/<channel>/p<ts>[?thread_ts=…] becomes slack://channel?team=…&id=…&message=…
// (the workspace ID comes from auth.test with the Slack token, cached). Without a token the web link goes to the
// system browser, which hands it to the app; it never opens in Petya's own browser. `names` resolves Slack user IDs.
const slackWeb=href=>{try{const url=new URL(String(href||''));return url.protocol==='https:'&&(url.hostname==='slack.com'||url.hostname.endsWith('.slack.com'))?url:null;}catch{return null;}};
function appLink(href,team){
  const url=slackWeb(href);if(!url||!/^[TE][A-Z0-9]+$/.test(team||''))return '';
  const m=url.pathname.match(/^\/archives\/([A-Z0-9]+)(?:\/p(\d{10})(\d{6}))?/);if(!m)return '';
  const query={team,id:m[1]};if(m[2])query.message=m[2]+'.'+m[3];
  const thread=url.searchParams.get('thread_ts');if(thread&&/^\d{10}\.\d{6}$/.test(thread))query.thread_ts=thread;
  return 'slack://channel?'+new URLSearchParams(query);
}
function setup(s){
  const teams=new Map();
  async function team(){
    const token=s.settings.slackToken||'';if(!token&&!s.settings.slackCredential)return '';
    if(teams.has(token))return teams.get(token);
    try{const r=await s.request('https://slack.com/api/auth.test',{method:'POST',headers:{Authorization:'Bearer '+token}});const id=r?.ok&&/^[TE][A-Z0-9]+$/.test(r.team_id||'')?r.team_id:'';if(id)teams.set(token,id);return id;}catch{return '';}
  }
  async function open(href){
    const {shell}=require('electron');
    if(/^slack:\/\/channel\?/.test(String(href||''))){if(!s.smoke)await shell.openExternal(href);return {app:true,url:href};}
    const web=slackWeb(href);if(!web)throw Error('Это не ссылка на Slack.');
    const app=appLink(web.href,await team());
    if(!s.smoke)await shell.openExternal(app||web.href);
    return {app:!!app,url:app||web.href};
  }
  // Names for Slack user IDs that cards could not resolve (older cards, people outside «Команда»).
  const people=new Map();
  async function names(ids){
    const out={},token=s.settings.slackToken||'';
    for(const id of [...new Set((Array.isArray(ids)?ids:[]).map(String))].filter(v=>/^[UWB][A-Z0-9]{6,}$/.test(v)).slice(0,50)){
      if(!people.has(id)&&(token||s.settings.slackCredential)){try{const r=await s.request('https://slack.com/api/users.info?'+new URLSearchParams({user:id}),{headers:{Authorization:'Bearer '+token}});
        const p=r?.ok?r.user:null;people.set(id,p?{name:p.profile?.real_name||p.real_name||p.profile?.display_name||p.name||'',photo:p.profile?.image_72||''}:null);}catch{people.set(id,null);}}
      if(people.get(id)?.name)out[id]=people.get(id);
    }
    return out;
  }
  return {slackOpen:{open,appLink,names},ipc:{open:href=>open(String(href||'')),names}};
}
module.exports={name:'slackOpen',setup,appLink,slackWeb};
