// People for «Кто знает»: a git author, a Jira user, a Slack user ID or a meeting speaker is matched to a member of
// «Команда» (email, service account IDs, names in either alphabet through team-match); unmatched identities stay
// separate people under the name the source gives. Points per source are summed per person, with evidence.
const match=require('../../team-match.cjs');
const lower=v=>String(v||'').trim().toLowerCase();
const emails=m=>[m.email,...Object.values(m.accounts||{}).map(a=>a.email)].map(lower).filter(Boolean);

class People{
 constructor(members=[]){this.members=members;this.rows=new Map();this.aliases=new Map();}
 member({email,name,jira,slack}={}){
  const e=lower(email);
  if(e){const byMail=this.members.filter(m=>emails(m).includes(e));if(byMail.length===1)return byMail[0];}
  if(jira){const m=this.members.find(m=>m.jiraId===jira||m.accounts?.jira?.id===jira);if(m)return m;}
  if(slack){const m=this.members.find(m=>m.slackId===slack||m.accounts?.slack?.id===slack);if(m)return m;}
  // «ivan.petrov@studio.dev» without a name: the local part is a name too.
  const shown=name||(e?e.split('@')[0].replace(/[._-]+/g,' '):'');
  return shown?match.match(shown,this.members):null;
 }
 // The person row for an identity; the same email or name from another source lands in the same row.
 get(identity){
  const m=this.member(identity);
  const name=String(identity.name||'').trim()||(identity.email?String(identity.email).split('@')[0]:'')||String(identity.slack||'')||'?';
  const keys=[m?'m:'+m.name:null,identity.email?'e:'+lower(identity.email):null,'n:'+match.latin(name).replace(/[^a-z0-9]+/g,' ').trim()].filter(Boolean);
  let row=null;for(const k of keys){const r=this.aliases.get(k);if(r){row=r;break;}}
  if(!row){row={name:m?m.name:name,member:!!m,role:m?.role||'',email:m?.email||lower(identity.email)||'',slackId:m?.slackId||m?.accounts?.slack?.id||'',points:{code:0,jira:0,slack:0,meetings:0},
   files:new Map(),commits:[],issues:new Map(),threads:new Map(),meetings:new Map(),lastCommit:null,lastAt:0};this.rows.set(row,row);}
  else if(m&&!row.member){row.name=m.name;row.member=true;row.role=m.role||'';row.email=m.email||row.email;row.slackId=m.slackId||m.accounts?.slack?.id||row.slackId;}
  for(const k of keys)if(!this.aliases.has(k))this.aliases.set(k,row);
  return row;
 }
 list(){return [...this.rows.values()];}
}
module.exports={People};
