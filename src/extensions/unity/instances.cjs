const uri='mcpforunity://instances';
async function inspect(client){
  let cursor;
  const seen=new Set();
  if(!client.getServerCapabilities()?.resources)return null;
  let found=false;
  do{
    const page=await client.listResources({cursor});
    found=page.resources.some(resource=>resource.uri===uri);cursor=page.nextCursor;
    if(cursor && seen.has(cursor))throw Error("Unity повторила страницу ресурсов.");
    seen.add(cursor);
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
