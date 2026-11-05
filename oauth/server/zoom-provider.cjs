const ZOOM_SCOPES='user:read:user user:read:token';
function zoomAdapter(config){return {
 authorize(state,redirect_uri){return 'https://zoom.us/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri,state,scope:ZOOM_SCOPES});},
 async token(data,call){const t=await call('https://zoom.us/oauth/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()});if(!t.access_token||!t.refresh_token||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw Error('Invalid Zoom token response');return {access_token:t.access_token,refresh_token:t.refresh_token,expiresAt:Date.now()+t.expires_in*1000};},
 async sites(t,call){const u=await call('https://api.zoom.us/v2/users/me',{headers:{Authorization:'Bearer '+t.access_token}});if(typeof u.id!=='string'||!u.id)throw Error('Zoom user missing');return [{id:u.id,name:u.display_name||[u.first_name,u.last_name].filter(Boolean).join(' ')||'Zoom',url:'https://zoom.us',provider:'zoom'}];}
};}
module.exports={zoomAdapter,ZOOM_SCOPES};
