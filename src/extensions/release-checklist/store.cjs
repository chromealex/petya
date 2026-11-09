// What the checklist remembers per company: each project's template and, per release, the manual ticks and the
// statuses of the last check. A small private JSON file in the company data folder; never sent anywhere.
const fs=require('node:fs');
const path=require('node:path');
const template=require('./template.cjs');
const MAX_RELEASES=30;
const versionKey=v=>String(v||'').trim().replace(/^v/i,'').slice(0,40);

class Store{
 constructor(root){this.file=root?path.join(root,'extensions','release-checklist','state.json'):'';this.memory={version:1,projects:{}};}
 read(){
  if(!this.file)return this.memory;
  try{const d=JSON.parse(fs.readFileSync(this.file,'utf8'));return d&&d.version===1&&d.projects&&typeof d.projects==='object'?d:{version:1,projects:{}};}catch{return {version:1,projects:{}};}
 }
 write(data){
  if(!this.file){this.memory=data;return;}
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  fs.writeFileSync(this.file+'.tmp',JSON.stringify(data,null,1),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
 }
 project(data,id){return data.projects[id]||(data.projects[id]={releases:{}});}
 template(projectId){const p=this.read().projects[projectId];try{return p?.template?template.normalize(p.template):template.defaults();}catch{return template.defaults();}}
 saveTemplate(projectId,items){const data=this.read(),p=this.project(data,projectId);p.template=template.normalize(items);this.write(data);return p.template;}
 resetTemplate(projectId){const data=this.read(),p=this.project(data,projectId);delete p.template;this.write(data);return template.defaults();}
 release(projectId,version){return this.read().projects[projectId]?.releases?.[versionKey(version)]||{manual:{},checked:null};}
 // Versions checked before, newest check first.
 releases(projectId){return Object.entries(this.read().projects[projectId]?.releases||{}).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).map(([v])=>v);}
 update(projectId,version,fn){
  const data=this.read(),p=this.project(data,projectId),key=versionKey(version);if(!key)throw Error('Не указана версия.');
  const r=p.releases[key]||(p.releases[key]={manual:{},checked:null});
  fn(r);r.at=Date.now();
  // Only the latest releases are kept.
  const keys=Object.keys(p.releases).sort((a,b)=>(p.releases[b].at||0)-(p.releases[a].at||0));for(const k of keys.slice(MAX_RELEASES))delete p.releases[k];
  this.write(data);return r;
 }
 tick(projectId,version,itemId,done){return this.update(projectId,version,r=>{if(done)r.manual[itemId]={done:true,at:Date.now()};else delete r.manual[itemId];});}
 checked(projectId,version,statuses){return this.update(projectId,version,r=>{r.checked={at:Date.now(),statuses};});}
}
module.exports={Store,versionKey};
