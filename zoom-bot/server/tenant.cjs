// An OAuth connection is also the recorder credential: no manual API key setup.
const crypto=require('node:crypto');
function brokerTenant({fetcher=fetch,now=Date.now}={}){
 const cache=new Map();
 return async token=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const id=crypto.createHash('sha256').update(token).digest('hex'),entry=cache.get(id);
  if(entry&&entry.until>now())return entry.tenant;
  const response=await fetcher('http://127.0.0.1:8787/zoom/v1/token',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok){cache.delete(id);return null;}
  const data=await response.json();if(data.site?.provider!=='zoom'||!data.site.id)return null;
  // Separate connections remain isolated even if they authorize the same Zoom user.
  const tenant='oauth:'+id;if(cache.size>=512)cache.clear();cache.set(id,{tenant,until:now()+60000});return tenant;
 };
}
module.exports={brokerTenant};
