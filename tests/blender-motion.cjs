const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp} = require('../src/mcp.cjs');

module.exports = async function testMotion(ctx) {
  const folder = await fs.mkdtemp(path.join(require('node:os').tmpdir(),'peter-motion-test-'));
  const file = path.join(folder,'walk.blend');
  const live = process.env.PETYA_MOTION_FIXTURE;
  if (live) await fs.copyFile(live,file); else await fs.writeFile(file,'fixture');
  let approved = false;
  const events = [];
  const s = {...ctx,win:{isDestroyed:()=>false,webContents:{send:(name,state)=>events.push(state)}}};
  ctx.dialogue.state.topics[0].at = Date.now();
  ctx.dialogue.state.activeId = ctx.dialogue.state.topics[0].id;
  const feature = require('../src/features/blender-motion.cjs').setup(s,()=>({
    showOpenDialog:async()=>({filePaths:[file]}),showMessageBox:async()=>({response:approved?1:0})
  }));
  const reply = feature.blenderMotion.turn('Найди где дёргается персонаж при движении');
  assert.equal(reply.messages.at(-1).motionMode,'repair');
  assert.equal(feature.blenderMotion.turn('Что такое ключи?'),null);
  const chatId = reply.topicId;
  for (const mode of ['read','edit']) {
    const endpoint = await startMcp({...ctx, access:{mode,projectId:'general'}},{port:0});
    const peer = new Client({name:'motion-test',version:'1'});
    const call = (name,args={})=>peer.callTool({name,arguments:{chatId,...args}});
    try {
      await peer.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
      assert.equal((await peer.listTools()).tools.some(t=>t.name==='analyze_animation'),mode==='edit');
      if (mode==='read') continue;
      assert((await call('pick_animation_file',{chatId:'private-chat'})).isError);
      const picked = await call('pick_animation_file');
      assert(!picked.isError,picked.content[0].text);
      const fileId = picked.structuredContent.id;
      const analyze = mode=>call('analyze_animation',{mode,fileId});
      assert((await analyze('repair')).isError);
      assert(feature.ipc.status().kind==='error');
      assert((await call('apply_animation_edit',{proposalId:'invalid'})).isError);
      if (live) {
        approved = true;
        const fix = await analyze('repair');
        assert(!fix.isError,fix.content[0].text);
        assert.equal(fix.structuredContent.frame,4);
        assert.equal(fix.content[1].mimeType,'image/svg+xml');
        const apply = ()=>call('apply_animation_edit',{proposalId:fix.structuredContent.proposalId});
        approved=false;assert((await apply()).isError);approved=true;
        const saved=await apply();assert(!saved.isError,saved.content[0].text);
        assert((await fs.stat(path.join(folder,saved.structuredContent.saved))).size>0);
        assert.deepEqual(await fs.readFile(file),await fs.readFile(live));
        const clean=await analyze('clean'); assert(!clean.isError,clean.content[0].text);
        assert(clean.structuredContent.after<clean.structuredContent.before);
        assert(events.some(e=>e.busy) && events.at(-1).busy===false);
      }
    } finally {await peer.close();await endpoint.close();}
  }
  await fs.rm(folder,{recursive:true,force:true});
  console.log('Blender animation routing, MCP access and confirmation verified'+(live?' with Blender':''));
};
