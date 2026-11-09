const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {inspect,target}=require('./instances.cjs');
const prefabs=require('./prefabs.cjs');
const native=require('./native.cjs');
const tools={...prefabs.tools,...native.specs};
function endpoint(address){
  const url=new URL(address);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.hash||url.search)
    throw Error('Введите локальный HTTP-адрес MCP for Unity.');
  return url;
}
async function connect(settings,work){
  const client=new Client({name:'Petya Unity',version:'0.8.3'});
  const transport=new StreamableHTTPClientTransport(endpoint(settings.unityUrl),{requestInit:{
    redirect:'error',headers:settings.unityToken?{Authorization:'Bearer '+settings.unityToken}:{}
  }});
  try{await client.connect(transport,{timeout:10000});return await work(client);}
  catch(e){if(/fetch failed|ECONNREFUSED/i.test(e.message))throw Error('Не удалось подключиться к Unity по адресу '+settings.unityUrl+'. Запустите локальный сервер MCP for Unity.');throw e;}
  finally{await client.close();}
}
module.exports={
  name:'unity',defaults:{unityUrl:'http://127.0.0.1:8080/mcp',unityToken:''},
  // An empty address means the usual one (the field is optional; Petya finds the editor by itself).
  validate(settings){if(!String(settings.unityUrl||'').trim())settings.unityUrl='http://127.0.0.1:8080/mcp';endpoint(settings.unityUrl);},
  tools,
  setup(s,dialog=()=>require('electron').dialog){
    const available=project=>{if(s.settings.module_unity!=='true'||project?.disabledServices?.includes('unity'))throw Error('Включите Unity Editor в каталоге и настройках проекта.');};
    const findResults=new WeakMap();
    const proposals=new Map();
    let operation;
    function progress(text,busy,error=false){
      operation={id:'unity-mcp',title:'Unity Editor',text,busy,kind:error?'error':'info'};
      if(s.win && !s.win.isDestroyed())s.win.webContents.send('unity-progress',operation);
    }
    async function invoke(...args){
      if(operation?.busy)throw Error('Дождитесь завершения текущего запроса Unity.');
      progress('Ожидаю подтверждения действия…',true);
      try{const result=await perform(...args);progress(result.isError?'Unity сообщила об ошибке.':'Ответ Unity получен.',false,!!result.isError);return result;}
      catch(error){progress(error.message,false,true);throw error;}
    }
    async function assistTurn(command,verify=()=>{},approved=false) {
      let topic=s.dialogue.active();
      if(!topic){
        topic={id:require('node:crypto').randomUUID(),projectId:s.dialogue.state.activeProjectId||'general',title:command.slice(0,80),kind:'chat',messages:[],at:Date.now()};
        s.dialogue.state.topics.push(topic);s.dialogue.state.activeId=topic.id;delete s.dialogue.state.newChat;s.dialogue.persist();
      }
      require('./enable.cjs')(s,()=>assistTurn(command,verify));
      if(!approved)return require('./approval.cjs')(s,command,()=>assistTurn(command,verify,true));
      const result=await invoke(topic.id,'assist',{command},verify,undefined,true);
      const data=result.structuredContent;
      const text='Использую расширение «Unity Editor».\n'+(data?.answer || result.content?.find(b=>b.type==='text')?.text || 'Выберите редактор.');
      s.dialogue.rememberAction(command,text);
      const message=topic.messages.at(-1);
      message.by='Unity Editor';
      message.unityRequest={name:'assist',arguments:{command}};
      message.unityAgent=data;
      message.unityInstance=result.instance;
      const proposal=proposals.get(data?.proposalId);
      if(proposal)proposal.owner=message;
      s.dialogue.persist();
      return {handled:true,text,by:message.by,topicId:topic.id,messages:topic.messages};
    }
    function turn(command){
      const topic=s.dialogue.active(),selected=s.chatResults?s.chatResults.current(topic,'unitySelection'):require('../previous-reply.cjs')(topic)?.unitySelection;
      const action=/^(?:поверни(?: (влево|вправо))?|покажи сзади|открой в unity)[.!?]*$/iu.exec(command.trim());
      if(action&&selected){
        require('./enable.cjs')(s,()=>turn(command));
        if(selected.url!==s.settings.unityUrl||selected.project!==topic.projectId)throw Error('Подключение Unity изменилось. Найдите префаб заново.');
        const open=/открой/iu.test(action[0]),view=/сзади/iu.test(action[0])?4:(selected.view+(action[1]?.toLowerCase()==='влево'?7:1))%8;
        return followup(command,selected,open,view,topic);
      }
      const request=require('./intent.cjs').intent(command);
      if(!request)return null;
      require('./enable.cjs')(s,()=>turn(command));
      const {query}=request;
      const d=s.dialogue,p=d.state.projects.find(p=>p.id===d.state.activeProjectId);
      const enabled=s.settings.module_unity==='true'&&!p?.disabledServices?.includes('unity');
      const text=enabled?'Использую расширение «Unity Editor». '+(query?'Префаб «'+query+'».':request.catalog?'Доступные инструменты и ресурсы редактора.':'Запрос к редактору: '+request.name):'Включите Unity Editor в каталоге и настройках проекта.';
      d.rememberAction(command,text);const t=d.active(),m=t.messages.at(-1);
      if(query)m.unityPrefab=query;else m.unityRequest=request;
      m.by='Unity Editor';d.persist();
      return {handled:true,text,topicId:t.id,topicTitle:t.title,messages:t.messages,by:m.by};
    }
    async function followup(command,selected,open,view,topic){
      const tool=open?'open_prefab':'preview_prefab';
      const args={guid:selected.guid,...(!open&&{view})};
      let result,problem;
      try{result=await invoke(topic.id,tool,args,()=>{},selected.instance);}
      catch(error){
        if(s.dialogue.active()!==topic||!/(Не удалось подключиться к Unity|нажмите Connect|инструмент execute_code)/u.test(error.message))throw error;
        problem=error.message;
      }
      const text=problem||(open?'Открыл в Unity':'Превью')+' · '+[selected.instance,selected.path].filter(Boolean).join(' · ');
      s.dialogue.rememberAction(command,text);const message=topic.messages.at(-1);
      message.by='Unity Editor';message.extensionImages=result?.content.filter(b=>b.type==='image')||[];
      if(problem)message.serviceProblem={id:'unity',query:command};
      message.unitySelection={...selected,view:open||problem?selected.view:view};s.dialogue.persist();s.chatResults?.adopt(topic,message);
      return {handled:true,text,topicId:topic.id,messages:topic.messages};
    }
    async function perform(id,tool,args,verify=()=>{},instance,approved=false){
      const company=s.companyId,url=s.settings.unityUrl,token=s.settings.unityToken,topic=s.dialogue.active(),version=topic?.versionIndex,owner=topic?.messages.at(-1),project=topic?.projectId;
      function check(){
        require('../../answer-cancel.cjs').check();verify();
        const t=s.dialogue.active();if(company!==s.companyId||url!==s.settings.unityUrl||token!==s.settings.unityToken||t?.id!==id||!t||t.archived)throw Error('Чат или подключение изменились.');
        if(t!==topic||topic.projectId!==project||version!==topic.versionIndex||topic.messages.at(-1)!==owner)throw Error('Сообщения чата изменились.');
        const currentProject=s.dialogue.state.projects.find(p=>p.id===t.projectId);
        if(!currentProject || currentProject.archived)throw Error('Проект недоступен.');
        available(currentProject);
      }
      check();if(!Object.hasOwn(tools,tool))throw Error('Неизвестное действие Unity.');
      const parsed=tools[tool].schema.parse(args);
      const proposal=tool==='apply_agent_proposal' && proposals.get(parsed.proposalId);
      if(tool==='apply_agent_proposal' && (!proposal || proposal.topic!==topic || proposal.owner!==owner ||
          proposal.version!==version || proposal.project!==project || proposal.company!==company || proposal.url!==url || proposal.token!==token))
        throw Error('Предложение устарело. Повторите диагностику.');
      if(proposal)instance=proposal.instance;
      if(!(approved&&tool==='assist')){const response=await dialog().showMessageBox(s.win,{type:'question',message:tools[tool].description,detail:[url,instance||'Редактор будет проверен перед вызовом',tool==='call_tool'?parsed.name:tool,JSON.stringify(proposal?.call || parsed.arguments||parsed,null,2)].join('\n'),buttons:['Продолжить','Отмена'],defaultId:1,cancelId:1});
      if(response.response!==0)throw Error('Действие отменено.');}
      check();
      progress('Выполняю запрос MCP…',true);
      const result=await connect(s.settings,async client=>{
        const editors=await inspect(client);check();
        if(editors){
          if(!instance && editors.length>1){
            return {editors,structuredContent:{editors},content:[{type:'text',text:'Выберите проект Unity: '+editors.map(e=>e.id).join(', ')}]};

          }
          instance ||= editors[0].id;
          if(!editors.some(e=>e.id===instance))throw Error('Выбранный редактор Unity недоступен. Повторите поиск.');
          await target(client,instance);
        }else if(instance)throw Error('Сервер больше не подтверждает выбранный редактор Unity.');
        check();
        if(proposal){
          if(proposals.get(parsed.proposalId)!==proposal)throw Error('Предложение уже применено.');
          proposals.delete(parsed.proposalId);
          return {...await native.execute(client,'call_tool',proposal.call,check),instance};
        }
        if(tool==='assist'){
          const data=await require('./agent.cjs').assist(s,client,parsed.command,check,text=>{progress(text,true);s.requestProgress?.report(text);});
          if(data.proposal){
            data.proposalId=require('node:crypto').randomUUID();
            proposals.set(data.proposalId,{topic,owner,version,project,company,url,token,instance,call:data.proposal});
            if(proposals.size>40)proposals.delete(proposals.keys().next().value);
          }
          return {structuredContent:data,content:[{type:'text',text:data.answer}],instance};
        }
        const data=Object.hasOwn(native.specs,tool)?await native.execute(client,tool,parsed,check):await prefabs.execute(client,tool,parsed,check);return {...data,instance};
      });
      check();
      if(tool==='find_prefabs'&&Array.isArray(result.structuredContent?.matches))findResults.set(topic,{instance,url,rows:result.structuredContent.matches});
      const found=findResults.get(topic);
      const item=found?.instance===instance&&found?.url===url&&found.rows?.find(r=>r.guid===parsed.guid);
      if(item&&owner?.unityPrefab && tool!=='find_prefabs'){
        owner.unitySelection={instance,url,project:topic.projectId,...item,view:parsed.view??owner.unitySelection?.view??0};s.dialogue.persist();s.chatResults?.adopt(topic,owner);
      }
      return result;
    }
    return {unity:{turn,invoke,assistTurn},ipc:{status:()=>operation,invoke:(id,tool,args,instance)=>invoke(id,tool,args,()=>{},instance),async test(){
      available();return connect(s.settings,async client=>{
        const editors=await inspect(client);const catalog=await native.discover(client,()=>available());
        return 'Unity подключена · инструментов: '+catalog.tools.length+(editors?' · редакторов: '+editors.length:'');
      });
    },
    // Settings open → Petya looks for the editor on the usual addresses and saves the one that answers, and lists
    // the Unity projects among Petya's projects with or without MCP for Unity.
    async discover(){
      const discover=require('./discover.cjs');
      const probe=async(url,token)=>{try{endpoint(url);}catch{return null;}
        const client=new Client({name:'Petya Unity',version:'0.8.3'});
        const transport=new StreamableHTTPClientTransport(new URL(url),{requestInit:{redirect:'error',headers:token?{Authorization:'Bearer '+token}:{}}});
        try{await client.connect(transport,{timeout:1500});let editors=null;try{editors=await inspect(client);}catch(e){editors={error:e.message};}return {editors};}catch{return null;}finally{try{await client.close();}catch{}}};
      const found=await discover.server({saved:s.settings.unityUrl,token:s.settings.unityToken,probe});
      if(found&&found.url!==s.settings.unityUrl)s.saveSettings?.({unityUrl:found.url},true);
      const rows=(s.dialogue.state.projects||[]).filter(p=>!p.archived).map(p=>({id:p.id,name:p.name,folders:require('../../project-folders.cjs').projectFolders(p,s.projectMemory?.get?.(p.memoryId))}));
      return {server:found?{url:found.url,editors:Array.isArray(found.editors)?found.editors:[],error:found.editors?.error||''}:null,projects:discover.projects(rows)};
    },
    // «Подключить» for a Unity project: the MCP for Unity package goes into its Packages/manifest.json.
    install(root){
      const discover=require('./discover.cjs'),rows=(s.dialogue.state.projects||[]).filter(p=>!p.archived).map(p=>({id:p.id,name:p.name,folders:require('../../project-folders.cjs').projectFolders(p,s.projectMemory?.get?.(p.memoryId))}));
      if(!discover.projects(rows).some(p=>p.root===root))throw Error('Проект Unity не найден среди папок проектов Пети.');
      return discover.install(root);
    }}};
  }
};
