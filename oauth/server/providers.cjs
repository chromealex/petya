'use strict';
const SLACK_SCOPES = 'channels:read,groups:read,channels:history,groups:history,im:history,mpim:history,files:read,chat:write,im:write,users:read';
function adapter(name, config) {
 const basic='Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64');
 if(name==='asana') return require('./asana-provider.cjs').asanaAdapter(config);
 if(!['slack','notion'].includes(name)) throw new Error('Unknown provider');
 return {
  authorize(state, callback) {
   const q=new URLSearchParams({client_id:config.clientId,redirect_uri:callback,state,response_type:'code'});
   if(name==='slack')q.set('user_scope',SLACK_SCOPES);else q.set('owner','user');
   return (name==='slack'?'https://slack.com/oauth/v2/authorize?':'https://api.notion.com/v1/oauth/authorize?')+q;
  },
  async token(data, call) {
   let t;
   if(name==='slack') {
    const r=await call('https://slack.com/api/oauth.v2.access',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:basic},body:new URLSearchParams(data).toString()});
    if(!r.ok)throw new Error('Slack authorization failed');
    t=data.grant_type==='refresh_token'?r:{...r.authed_user,team:r.team};
    if(t.token_type!=='user')throw new Error('Slack user token required');
   } else t=await call('https://api.notion.com/v1/oauth/token',{method:'POST',headers:{'Content-Type':'application/json',Authorization:basic,'Notion-Version':'2025-09-03'},body:JSON.stringify(data)});
   if(typeof t.access_token!=='string'||!t.access_token||typeof t.refresh_token!=='string'||!t.refresh_token)throw new Error('Rotating tokens required');
   // Notion does not document expires_in: rotate proactively once per hour.
   const lifetime=t.expires_in ?? (name==='notion'?3600:0);
   if(!Number.isFinite(lifetime)||lifetime<=0)throw new Error('Invalid token lifetime');
   return {access_token:t.access_token,refresh_token:t.refresh_token,expiresAt:Date.now()+lifetime*1000,...(name==='slack'?{team:t.team}:{workspace_id:t.workspace_id,workspace_name:t.workspace_name})};
  },
  async sites(t) {
   const id=name==='slack'?t.team?.id:t.workspace_id;
   if(typeof id!=='string'||!id)throw new Error('Workspace missing');
   return [{id,name:(name==='slack'?t.team.name:t.workspace_name)||name,url:name==='slack'?'https://app.slack.com/client/'+encodeURIComponent(id):'https://www.notion.so',provider:name}];
  }
 };
}
module.exports={adapter,SLACK_SCOPES};
