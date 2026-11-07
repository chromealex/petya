const { z } = require('zod');
const { UriTemplate } = require('@modelcontextprotocol/sdk/shared/uriTemplate.js');

const name = z.string().min(1).max(160);
const specs = {
  apply_agent_proposal:{description:'Применить предложенную Петей правку после подтверждения в текущем чате.',schema:z.object({proposalId:z.string().uuid()}).strict()},
  assist:{description:'Разобрать запрос по данным Unity, выбрать инструменты и предложить правку.',schema:z.object({command:z.string().trim().min(1).max(4000)}).strict()},
  discover: {description:'Показать инструменты, схемы параметров и ресурсы подключённого Unity Editor.',schema:z.object({}).strict()},
  call_tool: {description:'Вызвать опубликованный инструмент MCP for Unity с указанными параметрами.',schema:z.object({
    name, arguments:z.record(z.string(),z.unknown()).refine(value=>JSON.stringify(value).length<=8000,'Параметры превышают 8000 символов.')
  }).strict()},
  read_resource: {description:'Прочитать ресурс, опубликованный подключённым Unity Editor.',schema:z.object({uri:z.string().min(1).max(2048)}).strict()}
};

async function pages(client,method,key,check) {
  const rows = [], seen = new Set();
  let cursor;
  do {
    check();
    const page = await client[method](cursor ? {cursor} : {});
    rows.push(...page[key]);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw Error('Unity повторила страницу каталога.');
    seen.add(cursor);
    if(seen.size>100)throw Error('Каталог Unity слишком велик. Уточните включённые группы инструментов.');
  } while (cursor);
  check();
  return rows;
}

async function discover(client,check) {
  const capabilities = client.getServerCapabilities();
  const [tools,resources,templates] = await Promise.all([
    capabilities.tools ? pages(client,'listTools','tools',check) : [],
    capabilities.resources ? pages(client,'listResources','resources',check) : [],
    capabilities.resources ? pages(client,'listResourceTemplates','resourceTemplates',check) : []
  ]);
  return {tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema})),
    resources:resources.map(({uri,name,description})=>({uri,name,description})),
    templates:templates.map(({uriTemplate,name,description})=>({uriTemplate,name,description}))};
}

async function execute(client,action,args,check) {
  if (action === 'discover') {
    const data = await discover(client,check);
    return {structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};
  }
  if (action === 'call_tool') {
    if (args.name==='set_active_instance') throw Error('Укажите редактор в параметре instance текущего вызова.');
    const tools = await pages(client,'listTools','tools',check);
    if (!tools.some(tool=>tool.name === args.name)) throw Error('Этот инструмент не опубликован в подключённом Unity Editor.');
    check();
    const reply = await client.callTool({name:args.name,arguments:args.arguments});
    return reply;
  }
  const catalog = await discover(client,check);
  if (!catalog.resources.some(row=>row.uri === args.uri) &&
      !catalog.templates.some(row=>new UriTemplate(row.uriTemplate).match(args.uri))) throw Error('Этот ресурс не опубликован в Unity.');
  check();
  const reply = await client.readResource({uri:args.uri});
  return {content:reply.contents.map(resource=>({type:'resource',resource}))};
}
module.exports = {specs,pages,discover,execute};
