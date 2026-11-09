// Google Play: a 403 from the reporting API says why — the API is off in the Google Cloud project (with the link to
// turn it on) or the account has no Play Console access; 401 asks to reconnect; other errors pass through.
const assert=require('node:assert/strict'),{explain,GooglePlay}=require('../src/extensions/google-play/client.cjs');
const e=(status,detail)=>Object.assign(new Error('Сервис вернул HTTP '+status),{status,detail});
const off=explain(e(403,JSON.stringify({error:{code:403,message:'Google Play Developer Reporting API has not been used in project 123456 before or it is disabled.',details:[{reason:'SERVICE_DISABLED'}]}})));
assert.match(off.message,/не включён Google Play Developer Reporting API \(проект 123456\)/);assert.match(off.message,/apis\/library\/playdeveloperreporting\.googleapis\.com\?project=123456/);assert.equal(off.status,403);
const denied=explain(e(403,JSON.stringify({error:{code:403,message:'The caller does not have permission',status:'PERMISSION_DENIED'}})));
assert.match(denied.message,/нет доступа к отчётам Google Play.*Пользователи и разрешения.*The caller does not have permission/s);
assert.match(explain(e(403,'')).message,/нет доступа к отчётам Google Play/);
assert.match(explain(e(401,'')).message,/подключите заново/);
const other=e(500,'x');assert.equal(explain(other),other);
(async()=>{
 const play=new GooglePlay({settings:()=>({googlePlayCredential:JSON.stringify({type:'oauth',client:{client_id:'c'},refresh_token:'r'})}),request:async url=>{if(url.includes('oauth2'))return {access_token:'t',expires_in:3600};throw e(403,JSON.stringify({error:{message:'API has not been used in project 9 before or it is disabled.'}}));}});
 await assert.rejects(play.apps(),/проект 9/);
 console.log('Google Play errors: disabled API with its link, no Play Console access, reconnect on 401, others unchanged passed');
})();
