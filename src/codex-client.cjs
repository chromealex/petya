const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const readline=require('node:readline');
const {folderProject}=require('./agent-projects.cjs');
function executable() {
  const candidates=process.platform==='darwin'?['/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex','/Applications/Codex.app/Contents/Resources/codex',path.join(os.homedir(),'.local/bin/codex'),'/opt/homebrew/bin/codex','/usr/local/bin/codex']:[];
  return candidates.find(p=>fs.existsSync(p)) || (process.platform==='win32'?'codex.exe':'codex');
}
class CodexClient {
  constructor({launch=spawn,onEvent=()=>{}}={}){this.launch=launch;this.onEvent=onEvent;this.pending=new Map();this.next=0;}
  async ready(){
    if(this.starting)return this.starting;
    this.starting=(async()=>{
      const child=this.child=this.launch(executable(),['app-server','--stdio'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
      const fail=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Соединение с Codex прервано. Проверьте чат перед повтором.'));}this.pending.clear();this.starting=null;this.onEvent('connection/lost',{});};
      child.stdin.on('error',fail);child.on('error',fail);child.on('exit',fail);child.stderr.on('data',()=>{});
      readline.createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
        if(m.method){
          this.onEvent(m.method,m.params||{});
          if(m.id!==undefined){this.onEvent('needsAttention',m.params||{});child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Петя не подтверждает дополнительные разрешения. Продолжите задачу в Codex.'}})+'\n');}
        }else if(this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
      });
      await this.rpc('initialize',{clientInfo:{name:'petya',title:'Петя',version:'0.9.0'}});
      child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    })();
    return this.starting;
  }
  rpc(method,params){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex не ответил вовремя. Проверьте чат перед повтором.'));},30000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});}
  async projects(){
    await this.ready();const roots=new Set();let cursor;
    for(let page=0;page<20;page++){const result=await this.rpc('thread/list',{limit:100,...cursor?{cursor}:{}});for(const t of result.data||[])if(t.cwd&&fs.existsSync(t.cwd))roots.add(t.cwd);cursor=result.nextCursor;if(!cursor)break;}
    // Desktop's saved workspace roots include projects without a prior chat.
    try {const state=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.codex/.codex-global-state.json'),'utf8'));for(const root of state['electron-saved-workspace-roots']||[])if(typeof root==='string'&&fs.existsSync(root))roots.add(root);}catch{}
    return [...roots].map(folderProject);
  }
  async status(row){
    if(!row.threadId||!row.turnId)throw new Error('Нет идентификатора запуска для проверки.');
    await this.ready();const result=await this.rpc('thread/read',{threadId:row.threadId,includeTurns:true});
    const turn=result.thread?.turns?.find(t=>t.id===row.turnId);
    if(!turn)throw new Error('Запуск не найден в истории Codex.');
    return {status:turn.status,answer:(turn.items||[]).filter(i=>i.type==='agentMessage').map(i=>i.text||'').join('\n').slice(-12000)};
  }
  async submit(row,project,persist){
    await this.ready();
    if(!path.isAbsolute(project.cwd)||!fs.statSync(project.cwd).isDirectory())throw new Error('Рабочая папка проекта недоступна.');
    const result=await this.rpc('thread/start',{cwd:project.cwd,approvalPolicy:'on-request',sandbox:'workspace-write'});
    row.threadId=result.thread.id;persist();
    const turn=await this.rpc('turn/start',{threadId:row.threadId,input:[{type:'text',text:row.prompt}]});
    row.turnId=turn.turn.id;return {state:'submitted',threadId:row.threadId,url:'codex://threads/'+encodeURIComponent(row.threadId)};
  }
}
module.exports={CodexClient,executable};
