// The mail accounts whose calendars Petya may use (Google / Microsoft tokens shared with mail), whether the calendar
// scopes were granted for each, and for Microsoft whether it is a work or school account (an Entra ID organisation)
// or a personal one (outlook.com, hotmail…): online meetings created with an event and colleagues' free/busy exist
// only for work accounts. The organisation comes from the stored access token when it is a JWT (work and school
// accounts get one with the tenant id `tid`); personal accounts get opaque tokens; without a token the address decides.
const {granted}=require('./client.cjs');
const CONSUMER_TENANT='9188040d-6c67-4c5b-b112-36a304b66dad';
const PERSONAL_DOMAINS=/@(?:outlook|hotmail|live|msn|passport|windowslive)\.[a-z.]{2,12}$/i;
function tenant(token){
 const parts=String(token||'').split('.');if(parts.length!==3)return '';
 try{return String(JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).tid||'');}catch{return '';}
}
function microsoftKind(account){
 const token=account?.tokens?.access_token,tid=tenant(token);
 if(tid)return tid===CONSUMER_TENANT?'personal':'work';
 if(token)return 'personal';
 return PERSONAL_DOMAINS.test(String(account?.email||''))?'personal':'work';
}
function accounts(settings){
 const out=[];
 for(const [provider,key] of [['google','gmailCredential'],['microsoft','microsoftCredential']]){
  let c={};try{c=JSON.parse(settings[key]||'{}')||{};}catch{c={};}
  for(const a of Array.isArray(c.accounts)?c.accounts:[])if(a?.id)out.push({key:provider+':'+a.id,id:a.id,provider,email:String(a.email||''),label:String(a.label||''),calendar:granted(provider,a.tokens?.scope),kind:provider==='microsoft'?microsoftKind(a):''});
 }
 return out;
}
const connected=settings=>accounts(settings).some(a=>a.calendar);
module.exports={accounts,connected,microsoftKind};
