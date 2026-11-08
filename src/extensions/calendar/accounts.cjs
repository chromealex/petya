// The mail accounts whose calendars Petya may use (Google / Microsoft tokens shared with mail) and whether the
// calendar scopes were granted for each.
const {granted}=require('./client.cjs');
function accounts(settings){
 const out=[];
 for(const [provider,key] of [['google','gmailCredential'],['microsoft','microsoftCredential']]){
  let c={};try{c=JSON.parse(settings[key]||'{}')||{};}catch{c={};}
  for(const a of Array.isArray(c.accounts)?c.accounts:[])if(a?.id)out.push({key:provider+':'+a.id,id:a.id,provider,email:String(a.email||''),label:String(a.label||''),calendar:granted(provider,a.tokens?.scope)});
 }
 return out;
}
const connected=settings=>accounts(settings).some(a=>a.calendar);
module.exports={accounts,connected};
