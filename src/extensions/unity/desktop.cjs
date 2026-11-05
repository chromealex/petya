const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {inspect,target}=require('./instances.cjs');
const {tools,execute}=require('./prefabs.cjs');
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
  validate(settings){endpoint(settings.unityUrl);},
  setup(s){
    const available=project=>{if(s.settings.module_unity!=='true'||project?.disabledServices?.includes('unity'))throw Error('Включите Unity Editor в каталоге и настройках проекта.');};
    const findResults=new WeakMap();
    function turn(command){
      const topic=s.dialogue.active(),selected=require('../previous-reply.cjs')(topic)?.unitySelection;
      const action=/^(?:поверни(?: (влево|вправо))?|покажи сзади|открой в unity)[.!?]*$/iu.exec(command.trim());
      if(action&&selected&&selected.url===s.settings.unityUrl&&selected.project===topic.projectId){
        const open=/открой/iu.test(action[0]),view=/сзади/iu.test(action[0])?4:(selected.view+(action[1]?.toLowerCase()==='влево'?7:1))%8;
        return followup(command,selected,open,view,topic);
      }
      const match=/^(?:покажи|найди|открой|посмотри)\s+(?:мне\s+)?(?:Unity[- ]+)?префаб\s+(.+?)\s*$/iu.exec(command);
      if(!match)return null;
      const query=match[1].replace(/^[«"]|[»".?!]+$/gu,'').trim().slice(0,160);if(!query)return null;
      const d=s.dialogue,p=d.state.projects.find(p=>p.id===d.state.activeProjectId);
      const enabled=s.settings.module_unity==='true'&&!p?.disabledServices?.includes('unity');
      const text=enabled?'Префаб «'+query+'» · Unity Editor':'Для поиска префаба «'+query+'» включите Unity Editor в каталоге приложений и в настройках проекта.';
      d.rememberAction(command,text);const t=d.active(),m=t.messages.at(-1);
      m.unityPrefab=query;m.by='Unity Editor';d.persist();
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
      message.unitySelection={...selected,view:open||problem?selected.view:view};s.dialogue.persist();
      return {handled:true,text,topicId:topic.id,messages:topic.messages};
    }
    async function invoke(id,tool,args,verify=()=>{},instance){
      const company=s.companyId,url=s.settings.unityUrl,topic=s.dialogue.active(),version=topic?.versionIndex,owner=topic?.messages.at(-1),project=topic?.projectId;
      function check(){
        require('../../answer-cancel.cjs').check();verify();
        const t=s.dialogue.active();if(company!==s.companyId||url!==s.settings.unityUrl||t?.id!==id||!t||t.archived)throw Error('Чат или подключение изменились.');
        if(t!==topic||topic.projectId!==project||version!==topic.versionIndex||topic.messages.at(-1)!==owner)throw Error('Сообщения чата изменились.');
        available(s.dialogue.state.projects.find(p=>p.id===t.projectId));
      }
      check();if(!Object.hasOwn(tools,tool))throw Error('Неизвестное действие Unity.');
      const parsed=tools[tool].schema.parse(args);
      const response=await require('electron').dialog.showMessageBox(s.win,{type:'question',message:tools[tool].description,detail:parsed.query||parsed.guid,buttons:['Продолжить','Отмена'],defaultId:0,cancelId:1});
      if(response.response!==0)throw Error('Действие отменено.');
      check();
      const result=await connect(s.settings,async client=>{
        const editors=await inspect(client);check();
        if(editors){
          if(!instance && editors.length>1){
            if(tool==='find_prefabs')return {editors,content:[{type:'text',text:'Выберите проект Unity: '+editors.map(e=>e.id).join(', ')}]};
            throw Error('Укажите редактор Unity для выбранного префаба.');
          }
          instance ||= editors[0].id;
          if(!editors.some(e=>e.id===instance))throw Error('Выбранный редактор Unity недоступен. Повторите поиск.');
          await target(client,instance);
        }else if(instance)throw Error('Сервер больше не подтверждает выбранный редактор Unity.');
        check();const data=await execute(client,tool,parsed);return {...data,instance};
      });
      check();
      if(tool==='find_prefabs'&&result.structuredContent)findResults.set(topic,{instance,url,rows:result.structuredContent.matches});
      const found=findResults.get(topic);
      const item=found?.instance===instance&&found?.url===url&&found.rows.find(r=>r.guid===parsed.guid);
      if(item&&owner?.unityPrefab && tool!=='find_prefabs'){
        owner.unitySelection={instance,url,project:topic.projectId,...item,view:parsed.view??owner.unitySelection?.view??0};s.dialogue.persist();
      }
      return result;
    }
    return {unity:{turn,invoke},ipc:{invoke:(id,tool,args,instance)=>invoke(id,tool,args,()=>{},instance),async test(){
      available();return connect(s.settings,async client=>{
        await inspect(client);return 'Unity подключена';
      });
    }}};
  }
};
