const {parse,resolve}=require('../chat-location.cjs');
const {randomUUID}=require('node:crypto');

function topicFor(state,id){
  const topic=state.topics.find(t=>t.id===id&&!t.archived);
  if(!topic||!state.projects.some(p=>p.id===(topic.projectId||'general')&&!p.archived))throw Error('Чат недоступен.');
  return topic;
}
function savedAnswers(state,project){
  return state.topics.filter(t=>!t.archived && (t.projectId||'general')===project)
    .flatMap(t=>(t.savedAnswers||[]).map(b=>({...b,chat:t.title}))).sort((a,b)=>b.at-a.at);
}
function bookmark(dialogue,company,raw,save){
  const location=parse(raw);
  if(!location || location.company!==company)throw Error('Ссылка относится к другой компании.');
  const topic=topicFor(dialogue.state,location.chat);
  const rows=topic.savedAnswers||[];
  if(!save){topic.savedAnswers=rows.filter(row=>row.url!==raw);}
  else{
    const target=resolve(dialogue.state,location);
    const messages=target.version===(topic.versionIndex||0)?topic.messages:topic.versions[target.version].messages;
    const message=messages[target.index];
    if(message.role!=='assistant')throw Error('Выберите ответ Пети.');
    if(!rows.some(row=>row.url===raw))topic.savedAnswers=[...rows,{url:raw,title:message.text.trim().split(/\r?\n/)[0].slice(0,180),at:Date.now()}];
  }
  dialogue.persist();
  return {saved:save};
}
function searchFiles(topic,query,offset=0,limit=40){
  const needle=String(query||'').trim().slice(0,300).toLowerCase(),items=[];
  let total=0;
  if(needle)for(const file of [...(topic.attachments||[]),...(topic.excludedFiles||[])]){
    let ordinal=0,lineNumber=0;
    for(const line of String(file.text||'').split(/\r?\n/)){
      lineNumber++;
      const lower=line.toLowerCase();let pos=0;
      while((pos=lower.indexOf(needle,pos))!==-1){
        if(total>=offset&&items.length<limit)items.push({id:file.id,name:file.name,line:lineNumber,ordinal,snippet:line.slice(Math.max(0,pos-36),pos+needle.length+60)});
        ordinal++;total++;pos+=needle.length;
      }
    }
  }
  return {items,total};
}
function setup(ctx){
  let removed,timer;
  ctx.handle('discardComposerFile',id=>{
    if(!ctx.attachments.list().some(f=>f.id===id))throw Error('Вложение уже недоступно.');
    const file=ctx.attachments.pending.get(id),token=randomUUID();
    ctx.attachments.remove(id);removed={file,token};
    clearTimeout(timer);timer=setTimeout(()=>{removed=null;},12000);timer.unref();
    return token;
  });
  ctx.handle('restoreComposerFile',token=>{
    if(!removed || token!==removed.token || removed.file.owner!==ctx.attachments.scope())throw Error('Время отмены истекло или выбран другой чат.');
    if(ctx.attachments.list().length>=5)throw Error('В черновике уже пять вложений.');
    ctx.attachments.store(removed.file);removed=null;clearTimeout(timer);
  });
  ctx.handle('searchChatFiles',(id,q,offset)=>searchFiles(topicFor(ctx.dialogue.state,id),q,Math.max(0,Number(offset)||0)));
  ctx.handle('projectAnswers',project=>savedAnswers(ctx.dialogue.state,project));
  ctx.handle('bookmarkAnswer',(url,save)=>bookmark(ctx.dialogue,ctx.companyId,url,save===true));
}
module.exports={name:'chatLibrary',setup,savedAnswers,bookmark,searchFiles};
