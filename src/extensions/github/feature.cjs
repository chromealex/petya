// GitHub connection shared by «Сборки» (ci-builds) and «Pull requests»: the token (stored as a secret) and the
// default repositories. It has no chat turn and no cards of its own; the apps require ./client.cjs.
const github=require('./client.cjs');
function validate(next){
 if(typeof next.githubRepos==='string')next.githubRepos=github.parseRepos(next.githubRepos).join(', ');
}
function setup(s){
 // Settings form: whether a token is stored (secrets never reach the renderer) and which repos are used.
 async function status(){
  let repos=[];try{repos=github.parseRepos(s.settings.githubRepos);}catch{repos=[];}
  return {connected:github.connected(s.settings),repos,project:repos.length?'':await github.projectRepo(s),permissions:github.PERMISSIONS};
 }
 // «Проверить»: who the token belongs to, and that each default repository is reachable.
 async function check(){
  const api=github.create(s);const user=await api.get('/user');
  let repos=[];try{repos=github.parseRepos(s.settings.githubRepos);}catch{repos=[];}
  const missing=[];for(const repo of repos.slice(0,10)){try{await api.get('/repos/'+repo);}catch{missing.push(repo);}}
  return {login:String(user?.login||''),missing};
 }
 return {ipc:{status,check}};
}
module.exports={name:'githubConnection',defaults:{extension_github:'false',githubToken:'',githubRepos:''},secrets:['githubToken'],validate,setup};
