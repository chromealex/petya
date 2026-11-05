const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
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
  catch(e){if(/fetch failed|ECONNREFUSED/i.test(e.message))throw Error('Не удалось подключиться к Unity. Запустите MCP for Unity в редакторе и проверьте адрес.');throw e;}
  finally{await client.close();}
}
module.exports={
  name:'unity',defaults:{unityUrl:'http://127.0.0.1:8080/mcp',unityToken:''},
  validate(settings){endpoint(settings.unityUrl);},
  setup(s){
    const available=project=>{if(s.settings.module_unity!=='true'||project?.disabledServices?.includes('unity'))throw Error('Включите Unity Editor в каталоге и настройках проекта.');};
    function turn(command){
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
    async function invoke(id,tool,args,verify=()=>{}){
      const company=s.companyId,url=s.settings.unityUrl;
      function check(){
        verify();
        const t=s.dialogue.active();if(company!==s.companyId||url!==s.settings.unityUrl||t?.id!==id||!t||t.archived)throw Error('Чат или подключение изменились.');
        available(s.dialogue.state.projects.find(p=>p.id===t.projectId));
      }
      check();if(!Object.hasOwn(tools,tool))throw Error('Неизвестное действие Unity.');
      const parsed=tools[tool].schema.parse(args);
      const response=await require('electron').dialog.showMessageBox(s.win,{type:'question',message:tools[tool].description,detail:parsed.query||parsed.guid,buttons:['Продолжить','Отмена'],defaultId:0,cancelId:1});
      if(response.response!==0)throw Error('Действие отменено.');
      check();const result=await connect(s.settings,client=>execute(client,tool,parsed));check();return result;
    }
    return {unity:{turn,invoke},ipc:{invoke,async test(){
      available();return connect(s.settings,async client=>{
        let cursor;
        do{const page=await client.listTools({cursor});if(page.tools.some(t=>t.name==='execute_code'))return 'Unity подключена';cursor=page.nextCursor;}while(cursor);
        throw Error('Включите execute_code в MCP for Unity.');
      });
    }}};
  }
};
