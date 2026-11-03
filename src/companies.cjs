const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const localKeys=['model','ollamaUrl','whisperUrl','whisperBinary','whisperModel'];
class Companies{
 constructor(root){this.root=root;this.file=path.join(root,'companies.json');fs.mkdirSync(root,{recursive:true});
  this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,activeId:'default',companies:[{id:'default',name:'Компания 1'}]};
  const s=this.state;if(s.version!==1||!Array.isArray(s.companies)||!s.companies.length||s.companies.length>50||new Set(s.companies.map(c=>c.id)).size!==s.companies.length||!s.companies.some(c=>c.id==='default')||!s.companies.some(c=>c.id===s.activeId))throw Error('Повреждён список компаний.');
  for(const c of s.companies){if(c.id!=='default'&&!/^[a-f0-9-]{36}$/.test(c.id))throw Error('Некорректный профиль компании.');this.name(c.name);}
  if(!fs.existsSync(this.file))this.save(s);
 }
 name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>100||/[\x00-\x1f]/.test(value))throw Error('Название компании: от 1 до 100 символов.');return value.trim();}
 get(id){const c=this.state.companies.find(c=>c.id===id);if(!c)throw Error('Компания не найдена.');return c;}
 directory(id){this.get(id);return id==='default'?this.root:path.join(this.root,'companies',id);}
 list(){return structuredClone(this.state);}
 save(next){fs.writeFileSync(this.file+'.tmp',JSON.stringify(next),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);this.state=next;}
 unique(name,except){if(this.state.companies.some(c=>c.id!==except&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Компания с таким названием уже есть.');}
 create(value,settings={}){const name=this.name(value);this.unique(name);if(this.state.companies.length>=50)throw Error('Можно добавить до 50 компаний.');const id=randomUUID();const dir=path.join(this.root,'companies',id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const local=Object.fromEntries(localKeys.filter(k=>typeof settings[k]==='string').map(k=>[k,settings[k]]));fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(local),{mode:0o600});this.save({...this.state,companies:[...this.state.companies,{id,name}]});return {id,name};}
 rename(id,value){this.get(id);const name=this.name(value);this.unique(name,id);this.save({...this.state,companies:this.state.companies.map(c=>c.id===id?{...c,name}:c)});}
 select(id){this.get(id);this.save({...this.state,activeId:id});}
}
module.exports={Companies};
