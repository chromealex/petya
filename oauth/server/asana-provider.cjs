'use strict';
const ASANA_SCOPES='workspaces:read projects:read tasks:read tasks:write';
function asanaAdapter(config) {
 return {
  authorize(state,redirect_uri) {return 'https://app.asana.com/-/oauth_authorize?'+new URLSearchParams({client_id:config.clientId,redirect_uri,state,response_type:'code',scope:ASANA_SCOPES});},
  async token(data,call) {
   const t=await call('https://app.asana.com/-/oauth_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...data,client_id:config.clientId,client_secret:config.clientSecret}).toString()});
   // Asana's long-lived refresh token can be omitted from refresh responses.
   const refresh=t.refresh_token || (data.grant_type==='refresh_token'?data.refresh_token:null);
   if(typeof t.access_token!=='string'||!t.access_token||typeof refresh!=='string'||!refresh||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw new Error('Invalid Asana token response');
   return {access_token:t.access_token,refresh_token:refresh,expiresAt:Date.now()+t.expires_in*1000};
  },
  async sites(t,call) {
   const sites=[],seen=new Set();let offset;
   do {
    const q=new URLSearchParams({limit:'100',opt_fields:'name'});if(offset)q.set('offset',offset);
    const r=await call('https://app.asana.com/api/1.0/workspaces?'+q,{headers:{Authorization:'Bearer '+t.access_token}});
    if(!Array.isArray(r.data))throw new Error('Invalid Asana workspaces');
    for(const w of r.data){if(typeof w.gid!=='string'||!/^\d+$/.test(w.gid))throw new Error('Invalid workspace');sites.push({id:w.gid,name:w.name||'Asana',url:'https://app.asana.com',provider:'asana'});}
    offset=r.next_page?.offset;if(offset){if(typeof offset!=='string'||seen.has(offset)||seen.size>=100)throw new Error('Asana pagination limit');seen.add(offset);}
   }while(offset);
   return sites;
  }
 };
}
module.exports={asanaAdapter,ASANA_SCOPES};
