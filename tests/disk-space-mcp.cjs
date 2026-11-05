const assert=require('node:assert/strict');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
const {z}=require('zod');
const disk=require('../src/disk-space.cjs');
(async()=>{
 const small=()=>({bavail:1,bsize:4096}),big=()=>({bavail:1024**3,bsize:16});
 const fetcher=async()=>new Response(JSON.stringify({layers:[{size:1024**3}]}));
 assert.equal((await disk.inspectModelSpace('qwen3:4b',{fetcher,statfs:small})).status,'insufficient');
 assert.equal((await disk.inspectModelSpace('qwen3:4b',{fetcher,statfs:big})).status,'sufficient');
 const unknown=await disk.inspectModelSpace('qwen3:4b',{fetcher:async()=>{throw Error('offline');},statfs:big});
 assert.equal(unknown.status,'unknown');assert.equal(unknown.enough,null);
 let valid=true;
 const server=new McpServer({name:'test',version:'1'});
 require('../src/features/disk-space.cjs').register(server,z,{check(){if(!valid)throw Error('Revoked');}});
 const client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try {
  const tools=await client.listTools();assert(tools.tools.find(t=>t.name==='check_model_disk_space').annotations.readOnlyHint);
  const result=await client.callTool({name:'check_model_disk_space',arguments:{}});
  assert(!result.isError);const data=JSON.parse(result.content[0].text);assert.equal(data.status,'space_only');assert(data.available>=0);assert(!result.content[0].text.includes(require('node:os').homedir()));
  assert((await client.callTool({name:'check_model_disk_space',arguments:{model:'https://evil.test/model'}})).isError);
  valid=false;assert((await client.callTool({name:'check_model_disk_space',arguments:{}})).isError);
 } finally { await client.close();await server.close(); }
 console.log('Disk MCP: real transport, read-only discovery, validation, revoked access, sufficient/insufficient/unknown passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
