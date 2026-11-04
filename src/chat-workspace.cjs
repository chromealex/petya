// Version snapshots contain conversation data. Project placement and sidebar state belong to the chat.
const shared = new Set(['id', 'projectId', 'title', 'order', 'pinned', 'archived', 'versions', 'versionIndex','savedAnswers','origin']);
function snapshot(topic) {
  return structuredClone(Object.fromEntries(Object.entries(topic).filter(([key]) => !shared.has(key))));
}
function replaceContent(topic, content) {
  for (const key of Object.keys(topic)) if (!shared.has(key)) delete topic[key];
  Object.assign(topic, structuredClone(content));
}
function info(topic) {
  return {index: topic?.versionIndex || 0, count: topic?.versions?.length || 1};
}
function register(ctx) {
  function get(id, mutate = false) {
    const topic = ctx.dialogue.state.topics.find(item => item.id === id);
    if (!topic || topic.archived) throw Error('Чат недоступен.');
    if (mutate && (ctx.chatJobs.busy(id) || ctx.dialogue.running.has(id))) throw Error('Дождитесь завершения ответа.');
    return topic;
  }
  ctx.handle('chatVersionMessages',(id,index)=>{
    const t=get(id);
    if(!Number.isInteger(index)||index<0||index>=info(t).count)throw Error('Версия недоступна.');
    const v=index===info(t).index?t:t.versions[index];
    const messages=v.messages.map(({role,text})=>({role,text}));
    if(v.versionQuestion && v.messages.length===v.versionQuestion.index)messages.push({role:'user',text:v.versionQuestion.text});
    return messages;
  });
  ctx.handle('chatKeepPrepared',(id)=>{delete get(id).preparedQuestion;ctx.dialogue.persist();});
  ctx.handle('chatDrafts', () => ctx.dialogue.state.composerDrafts || {});
  ctx.handle('chatDraftSet', (owner,value) => {
    const state=ctx.dialogue.state;
    if(!state.topics.some(t=>t.id===owner) && !state.projects.some(p=>'draft:'+p.id===owner)) return;
    const topic=state.topics.find(t=>t.id===owner);
    if(topic?.preparedQuestion && value!==topic.preparedQuestion)delete topic.preparedQuestion;
    const drafts=state.composerDrafts ||= {};
    if(value) drafts[owner]=String(value).slice(0,4000); else delete drafts[owner];
    ctx.dialogue.persist();
  });
  ctx.handle('chatWorkspaceInfo', id => {
    const topic = get(id);
    return {...info(topic),origin:topic.origin||null,preparedQuestion:topic.preparedQuestion===ctx.dialogue.state.composerDrafts?.[id]?topic.preparedQuestion:'', excluded: topic.excludedMaterials || [], files: [
      ...(topic.attachments || []).map(f => ({id:f.id, name:f.name, enabled:true})),
      ...(topic.excludedFiles || []).map(f => ({id:f.id, name:f.name, enabled:false}))
    ]};
  });
  ctx.handle('chatVersionEdit', (id,index,value,saveAsDraft=false) => {
    const topic = get(id,true), message = topic.messages[index];
    const command = typeof value === 'string' ? value.trim() : '';
    if (!Number.isInteger(index) || message?.role !== 'user' || !command || command.length>4000) throw Error('Проверьте текст сообщения.');
    const versions = topic.versions || [null];
    versions[topic.versionIndex || 0] = snapshot(topic);
    const history = topic.messages.slice(0,index);
    const ids = new Set([...history,message].flatMap(m => (m.attachments || []).map(f => f.id)));
    const content = {kind:'chat', versionQuestion:{index:history.length,text:command}, messages:history, at:Date.now(), attachments:(topic.attachments || []).filter(f=>ids.has(f.id)), pendingEditAttachments:message.attachments || []};
    content.excludedFiles = (topic.excludedFiles || []).filter(file => ids.has(file.id));
    for(const key of ['model','projectMemoryId','excludedMaterials']) if(topic[key]) content[key]=topic[key];
    if(message.replyTo) content.nextQuote=message.replyTo;
    replaceContent(topic,content);
    topic.versionIndex=versions.length;
    versions.push(null);
    topic.versions=versions;
    if (saveAsDraft) {
      (ctx.dialogue.state.composerDrafts ||= {})[id]=command;
      topic.preparedQuestion=command;
    }
    ctx.dialogue.persist();
    return {topicId:id,command};
  });
  ctx.handle('chatVersionSelect',(id,index)=>{
    const topic=get(id,true);
    if(!Number.isInteger(index)||index<0||index>=info(topic).count) throw Error('Версия недоступна.');
    if(index!==info(topic).index){
      const versions=topic.versions;
      versions[topic.versionIndex]=snapshot(topic);
      replaceContent(topic,versions[index]);
      versions[index]=null;
      topic.versionIndex=index;
      ctx.dialogue.persist();
    }
    return info(topic);
  });
  ctx.handle('chatQuote',(id,ref)=>{
    const topic=get(id,true),message=topic.messages[ref?.index];
    if(!message||message.at!==ref.at||message.text!==ref.text) throw Error('Сообщение изменилось. Выберите его ещё раз.');
    topic.nextQuote={role:message.role,text:message.text.slice(0,4000),at:message.at};
    ctx.dialogue.persist();
  });
  ctx.handle('chatContextToggle',(id,type,key,enabled)=>{
    const topic=get(id,true);
    if(typeof key!=='string'||typeof enabled!=='boolean') throw Error('Материал недоступен.');
    if(type==='file'){
      const source=enabled?'excludedFiles':'attachments', target=enabled?'attachments':'excludedFiles';
      const files=topic[source]||[], index=files.findIndex(f=>f.id===key);
      if(index>=0)(topic[target] ||= []).push(files.splice(index,1)[0]);
    }else if(type==='material'){
      const excluded=new Set(topic.excludedMaterials||[]);
      if(enabled)excluded.delete(key);else excluded.add(key);
      topic.excludedMaterials=[...excluded];
    }else throw Error('Неизвестный тип материала.');
    ctx.dialogue.persist();
  });
}
module.exports={register};
