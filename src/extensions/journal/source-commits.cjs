// Journal source: commits of the user (git config user.email) in the current project's repository, from the local
// clone (all branches, no merges). Nothing leaves the computer. Without a project folder or Git there is nothing
// to add, which is not an error.
module.exports={
 id:'git',name:'Коммиты',icon:'commit',
 ready:()=>true,
 async collect(s,{from,to}){
  const git=s.gitWorkspace;if(!git)return {items:[]};
  let repo;try{repo=await git.repository();}catch{return {items:[]};}
  let email='';try{email=(await git.git(repo.root,['config','user.email'])).trim();}catch{email='';}
  const args=['log','--all','--no-merges','--since='+new Date(from).toISOString(),'--until='+new Date(to).toISOString(),'-n','300','--format=%h%x09%aI%x09%s'];
  if(email)args.push('--author='+email);
  const out=await git.git(repo.root,args);
  const items=String(out||'').split('\n').filter(Boolean).map(line=>{const [hash,date,...subject]=line.split('\t');return {at:Date.parse(date),icon:'commit',kind:'commit',title:subject.join('\t').slice(0,200)||hash,detail:hash+' · '+require('node:path').basename(repo.root)};}).filter(i=>i.at>=from&&i.at<to);
  return {items};
 }
};
