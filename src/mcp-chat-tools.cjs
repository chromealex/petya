const {withProject} = require('./modules.cjs');
const {revision}=require('./chat-revision.cjs');
const {preview} = require('./chat-tools.cjs');

function register(server, z, ctx) {
  const id = z.string().min(1).max(200);
  const index = z.number().int().nonnegative();
  const page = {offset:index.default(0), limit:z.number().int().min(1).max(100).default(25)};
  const chat = {chatId:id};
  const draft = {owner:id};
  const shared = {};
  require('./chat-workspace.cjs').register({...ctx, handle:(name, fn) => { shared[name] = fn; }});
  const state = ctx.dialogue.state;
  const projects = () => state.projects.filter(p => !p.archived && (!ctx.access?.projectId || p.id===ctx.access.projectId));
  const chats = () => state.topics.filter(t => !t.archived && projects().some(p => p.id === t.projectId));
  const list = (rows, args) => ({total:rows.length, items:rows.slice(args.offset,args.offset+args.limit)});
  const topicFor = key => {
    const topic = chats().find(t => t.id === key);
    if (!topic) throw Error('Чат недоступен.');
    return topic;
  };
  function tool(name, description, schema, fn, change = false) {
    if(change && ctx.access?.mode==='read') return;
    if(change && ctx.access?.mode==='drafts' && !['set_chat_draft','add_draft_attachment','remove_draft_attachment','prepare_chat_version'].includes(name)) return;
    if(ctx.access?.projectId && name==='add_chat_note') return;
    server.registerTool(name, {description, inputSchema:schema, annotations:{readOnlyHint:!change, destructiveHint:change, openWorldHint:false}}, async args => {
      try {
        ctx.check();
        const owner = args.owner;
        const topic = args.chatId ? topicFor(args.chatId) : owner && !owner.startsWith('draft:') ? topicFor(owner) : null;
        const projectId = topic?.projectId || (owner?.startsWith('draft:') ? owner.slice(6) : owner ? topicFor(owner).projectId : null);
        const project = projects().find(p => p.id === projectId);
        if (projectId !== null && !project) throw Error('Проект недоступен.');
        const key=owner || topic?.id;
        const verify=()=>{
          ctx.check();
          if(project && (!projects().some(p=>p.id===project.id) || (topic && (topic.projectId!==project.id || !chats().includes(topic))))) throw Error('Проект или чат изменился.');
          if(args.revision && args.revision!==revision(ctx,key)) throw Error('Черновик, вложения или версия изменились. Обновите данные перед повтором.');
        };
        verify();
        const removed=name==='remove_draft_attachment'?ctx.attachments.pending.get(args.fileId):null;
        const result = await ctx.run(() => withProject(project, () => fn(args,topic,verify)));
        if (change) ctx.changed({owner:key,name,previous:name==='set_chat_draft'?args.previous:undefined,added:name==='add_draft_attachment'?result.id:undefined,removed,revision:revision(ctx,key)});
        return {content:[{type:'text',text:JSON.stringify(result ?? {ok:true})}]};
      } catch (error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
    });
  }
  tool('list_chat_projects','Проекты и владельцы черновиков новых чатов.',page,a=>list(projects().map(p=>({id:p.id,name:p.name,draftOwner:'draft:'+p.id})),a));
  tool('list_chats','Доступные чаты. ID чата также служит владельцем его черновика.',{projectId:id.optional(),...page},a=>list(chats().filter(t=>!a.projectId || t.projectId===a.projectId).map(t=>({id:t.id,title:t.title,projectId:t.projectId,attention:require('./chat-location.cjs').attention(t)})),a));
  const draftText = owner => shared.chatDrafts()[owner] || '';
  const draftFiles = owner => [...ctx.attachments.pending.values()].filter(f => f.owner===owner);
  tool('get_chat_draft','Текст и список вложений черновика.',draft,({owner})=>({revision:revision(ctx,owner),text:draftText(owner),files:draftFiles(owner).map(({id,name,note})=>({id,name,note}))}));
  tool('set_chat_draft','Сохранить текст или очистить пустой строкой. Передайте предыдущий текст из get_chat_draft.',{...draft,revision:id,text:z.string().max(4000),previous:z.string().max(4000)},({owner,text,previous})=>{
    if (draftText(owner)!==previous) throw Error('Черновик изменился. Прочитайте его снова.');
    shared.chatDraftSet(owner,text);
  },true);
  tool('add_draft_attachment','Прикрепить данные файла в base64 (до 1 МБ); локальные пути не принимаются.',{...draft,revision:id,name:z.string().min(1).max(180),base64:z.string().min(4).max(1398104)},async ({owner,name,base64},_,verify)=>{
    const bytes=Buffer.from(base64,'base64');
    if (!bytes.length || bytes.length>1048576 || bytes.toString('base64')!==base64 || /[/\\]/.test(name)) throw Error('Некорректное вложение.');
    if (!/\.(?:txt|md|csv|json|yaml|yml|log|xml|docx|png|jpe?g|webp)$/i.test(name)) throw Error('Через MCP доступны текст, DOCX и изображения. Для других форматов используйте приложение.');
    const file=await ctx.attachments.add(name,bytes,owner,verify);
    return {id:file.id,name:file.name,note:file.note};
  },true);
  tool('read_draft_attachment','Прочитать содержимое вложения из конкретного черновика.',{...draft,fileId:id},({owner,fileId})=>{
    const file=draftFiles(owner).find(f=>f.id===fileId);
    if(!file)throw Error('Вложение не найдено в черновике.');
    return {id:file.id,name:file.name,text:file.text,image:file.image,note:file.note};
  });
  tool('remove_draft_attachment','Удалить конкретное вложение из черновика.',{...draft,revision:id,fileId:id},({owner,fileId})=>{
    if (!draftFiles(owner).some(f=>f.id===fileId)) throw Error('Вложение не найдено в черновике.');
    ctx.attachments.remove(fileId);
  },true);
  tool('list_chat_versions','Версии чата и индекс выбранной (индексы начинаются с нуля).',chat,(_,t)=>{
    const {index,count}=shared.chatWorkspaceInfo(t.id);
    return {index,count,revision:revision(ctx,t.id)};
  });
  tool('read_chat_version','Прочитать сообщения любой версии без переключения.',{...chat,version:index.optional(),query:z.string().trim().max(300).optional(),...page},(a,t)=>{
    const {index,count}=shared.chatWorkspaceInfo(t.id), version=a.version ?? index;
    if(version>=count)throw Error('Версия недоступна.');
    const messages=(version===index?t:t.versions[version]).messages;
    const term=a.query?.toLowerCase();
    const hits=messages.flatMap((m,index)=>!term||String(m.text).toLowerCase().includes(term)?[index]:[]);
    return {total:hits.length,items:hits.slice(a.offset,a.offset+a.limit).map(index=>{
      const {role,text,at,attachments,usedMaterials}=messages[index];
      const link=role==='assistant'&&ctx.companyId?require('./chat-location.cjs').link(ctx.companyId,t,version,index):undefined;
      return {index,role,text,at,usedMaterials,files:attachments?.map(({id,name})=>({id,name})),link};
    })};
  });
  tool('select_chat_version','Переключить версию в чате Пети.',{...chat,revision:id,version:index},(a,t)=>shared.chatVersionSelect(t.id,a.version),true);
  tool('prepare_chat_version','Создать версию от сообщения пользователя для правки или повторного ответа. Вопрос останется в черновике для отправки в приложении.',{...chat,revision:id,version:index,messageIndex:index,original:z.string().min(1).max(4000),text:z.string().trim().min(1).max(4000).optional()},(a,t)=>{
    if (draftText(t.id) || draftFiles(t.id).length) throw Error('Сначала завершите текущий черновик.');
    if (shared.chatWorkspaceInfo(t.id).index!==a.version || t.messages[a.messageIndex]?.text!==a.original) throw Error('Версия или сообщение изменились.');
    shared.chatVersionEdit(t.id,a.messageIndex,a.text ?? a.original,true);
    return shared.chatWorkspaceInfo(t.id).index;
  },true);
  const materials=()=>{
    const rows=ctx.memory.prune();
    if(!ctx.access?.projectId)return rows;
    const refs=new Set(chats().flatMap(t=>t.messages.flatMap(m=>(m.usedMaterials||[]).filter(r=>r.type==='material').map(r=>r.id))));
    return rows.filter(row=>refs.has(row.id));
  };
  tool('add_chat_note','Сохранить заметку в общей памяти компании для использования в чатах.',{...chat,title:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(50000)},a=>{
    const {id,title}=ctx.addContext({source:'Заметка',title:a.title,text:a.text});
    return {id,title};
  },true);
  tool('list_chat_materials','Материалы и файлы чата с отметкой использования в следующих ответах.',{...chat,...page},(a,t)=>{
    const {files,excluded}=shared.chatWorkspaceInfo(t.id);
    return list([...files.map(f=>({...f,type:'file'})),...materials().map(m=>({type:'material',id:m.id,name:m.title,enabled:!excluded.includes(m.id)}))],a);
  });
  const item = {...chat,type:z.enum(['file','material']),key:id};
  function findItem(t,a) {
    const row=a.type==='file'?shared.chatWorkspaceInfo(t.id).files.find(f=>f.id===a.key):materials().find(m=>m.id===a.key);
    if(!row)throw Error('Материал недоступен в этом чате.');
    return row;
  }
  tool('read_chat_material','Прочитать выбранный материал или предпросмотр файла чата.',item,(a,t)=>{
    const m=findItem(t,a);
    return a.type==='file'?preview(state,t.id,a.key):{id:m.id,title:m.title,text:m.text,source:m.source};
  });
  tool('set_chat_material_enabled','Включить или исключить материал только для выбранного чата.',{...item,enabled:z.boolean()},(a,t)=>{
    findItem(t,a);
    shared.chatContextToggle(t.id,a.type,a.key,a.enabled);
  },true);
}
module.exports={register};
