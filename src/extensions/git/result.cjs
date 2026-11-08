// Git plugin: the repository state of a Git answer as a card (message.extensionData.gitState) with stage,
// commit and push. Every write goes through GitWorkspace.execute with the token of the state the user saw,
// so a repository changed elsewhere is never committed blindly.
const MAX_FILES=200,MAX_DIFF=60000;
function slim(state,action,text){
  if(!state?.root)return null;
  return {root:state.root,projectId:state.projectId,name:state.name,branch:state.branch||'',head:(state.head||'').slice(0,12),token:state.token,
    upstream:state.upstream?{remote:state.upstream.remote,ref:state.upstream.ref}:null,remotes:(state.remotes||[]).slice(0,10),
    files:(state.files||[]).slice(0,MAX_FILES).map(f=>({path:f.path,oldPath:f.oldPath||'',status:f.status,staged:!!f.staged,unstaged:!!f.unstaged,conflict:!!f.conflict})),
    more:Math.max(0,(state.files||[]).length-MAX_FILES),action:action||'status',diff:action==='diff'?String(text||'').slice(0,MAX_DIFF):''};
}
function extract(result){
  const git=result?.git;if(!git||!['status','diff','stage','unstage','commit'].includes(git.action))return null;
  const card=slim(git.state,git.action,git.text);return card?{gitState:card}:null;
}
const key=state=>JSON.stringify(['git',state.root]);
function describe(message){
  const state=message.extensionData?.gitState;if(!state?.root)return [];
  return [{key:['git',state.root],state,presentationKey:key(state),title:'Git · '+state.name,subtitle:state.branch,
    actions:['stage','unstage','commit','push','diff','suggest'].map(id=>({id,label:id,hidden:true}))}];
}
async function perform(action,row,s,check,args={}){
  const message=row.message,state=message.extensionData.gitState;
  const expected={root:state.root,projectId:state.projectId,token:state.token};
  const save=(next,text)=>{const fresh=slim(next,action==='diff'?'diff':'status',text);if(fresh){fresh.diff=action==='diff'?fresh.diff:state.diff;message.extensionData={...message.extensionData,gitState:fresh};s.dialogue.persist();}return fresh;};
  if(action==='diff'){const r=await s.gitWorkspace.execute({action:'diff',staged:!!args.staged,expected});check();return {handled:true,diff:String(r.text||'').slice(0,MAX_DIFF)};}
  if(action==='suggest'){
    if(!s.settings.model)throw Error('Для сообщения коммита нужна локальная модель.');
    const r=await s.gitWorkspace.execute({action:'diff',staged:true,expected});check();
    const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,options:{temperature:0.2,num_predict:120},messages:[
      {role:'system',content:'Напиши одно короткое сообщение коммита (до 72 символов) в повелительном наклонении на языке прошлых коммитов или по-английски. Только текст сообщения.'},{role:'user',content:String(r.text||'').slice(0,20000)}]})});
    return {handled:true,message:String(response?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().split('\n')[0].replace(/^["'`]|["'`]$/g,'').slice(0,200)};
  }
  if(['stage','unstage'].includes(action)){
    const input={action,expected,...(args.all?{all:true}:{paths:Array.isArray(args.paths)?args.paths.slice(0,200).map(String):[]})};
    const r=await s.gitWorkspace.execute(input);check();return {handled:true,text:r.text.split('\n')[0],state:save(r.state)};
  }
  if(action==='commit'){const r=await s.gitWorkspace.execute({action:'commit',message:String(args.message||''),expected});check();return {handled:true,text:'Коммит создан: '+(r.state?.head||'').slice(0,8),state:save(r.state)};}
  if(action==='push'){const r=await s.gitWorkspace.execute({action:'push',expected});check();return {handled:true,text:'Отправлено в '+(r.state?.upstream?.remote||'удалённый репозиторий')+'.',state:save(r.state)};}
  throw Error('Неизвестное действие Git.');
}
module.exports={id:'git',extract,describe,perform};
