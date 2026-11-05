const uri='mcpforunity://instances';
async function inspect(client){
  let cursor,hasCode=false;
  do{
    const page=await client.listTools({cursor});
    hasCode ||= page.tools.some(tool=>tool.name==='execute_code');
    cursor=page.nextCursor;
  }while(cursor);
  if(!hasCode)throw Error('В MCP for Unity включите инструмент execute_code в группе Scripting.');
  if(!client.getServerCapabilities()?.resources)return null;
  let found=false;
  do{
    const page=await client.listResources({cursor});
    found=page.resources.some(resource=>resource.uri===uri);cursor=page.nextCursor;
  }while(!found&&cursor);
  if(!found)return null;
  const response=await client.readResource({uri});
  const data=JSON.parse(response.contents.find(item=>typeof item.text==='string').text);
  if(!data.success||!Array.isArray(data.instances))throw Error('Не удалось получить список редакторов Unity.');
  if(!data.instances.length)throw Error('Сервер доступен. В редакторе откройте MCP for Unity и нажмите Connect.');
  return data.instances.map(({id,name})=>({id,name}));
}
async function target(client,id){
  const response=await client.callTool({name:'set_active_instance',arguments:{instance:id}});
  const data=response.structuredContent??JSON.parse(response.content.find(item=>item.type==='text').text);
  if(response.isError||!data.success||data.data?.instance!==id)throw Error('Выбранный редактор Unity недоступен. Повторите поиск.');
}
module.exports={inspect,target};
