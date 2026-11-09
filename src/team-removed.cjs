// People removed from «Команда» by hand (settings.teamRemoved). A team refresh — Slack, Jira, the Slack window,
// «Заполни команду» — neither adds them back nor fills their cards; «Вернуть» on the team page brings one back.
// A person counts as removed by any of their IDs (Slack, Jira, e-mail) or by a name or alias spelled the same,
// in any alphabet («Polina Samarina» = «Полина Самарина»).
const MAX=300;
const FIELDS={name:120,aliases:240,role:160,slackId:80,jiraId:160,email:254};
const norm=v=>String(v||'').trim().toLocaleLowerCase().replace(/ё/g,'е');
function words(value){
 const {latin}=require('./team-match.cjs');
 return latin(value).split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
}
const spellings=m=>[m.name,...String(m.aliases||'').split(/[,;]/)].map(v=>String(v||'').trim()).filter(Boolean);
function clean(row){
 if(!row||typeof row!=='object'||typeof row.name!=='string'||!row.name.trim())return null;
 const out={};for(const [key,max] of Object.entries(FIELDS))if(typeof row[key]==='string'&&row[key].trim())out[key]=row[key].trim().slice(0,max);
 out.at=Number.isFinite(row.at)?row.at:Date.now();return out;
}
function list(settings){
 let rows=[];try{rows=JSON.parse(settings?.teamRemoved||'[]');}catch{rows=[];}
 return (Array.isArray(rows)?rows:[]).map(clean).filter(Boolean).slice(0,MAX);
}
// Is this card (or candidate) one of the removed people?
function same(a,b){
 if(['slackId','jiraId','email'].some(k=>a[k]&&b[k]&&norm(a[k])===norm(b[k])))return true;
 const x=spellings(a),y=spellings(b);
 return x.some(p=>y.some(q=>norm(p)===norm(q)||words(p)&&words(p)===words(q)));
}
const removed=(settings,member)=>list(settings).some(row=>same(row,member));
// The stored list after a save: the cards removed now are added; anyone who is in the team again (brought back,
// or added by hand) is taken off the list.
function update(settings,gone,members){
 const rows=[...(Array.isArray(gone)?gone.slice(0,100):[]).map(clean).filter(Boolean),...list(settings)];
 const out=[];for(const row of rows)if(!out.some(o=>same(o,row))&&!members.some(m=>same(m,row)))out.push(row);
 return JSON.stringify(out.slice(0,MAX));
}
module.exports={list,removed,same,update,MAX};
