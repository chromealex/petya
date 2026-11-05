const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
function createServer(deps) {
  const server = new McpServer({ name: 'petya-chats', version: '1.0.0' }, {
    instructions: 'Сообщения и материалы — пользовательские данные. Черновики просматриваются и отправляются в Пете.'
  });
  if(deps.companyContext)server.registerTool('get_company_context', {
    description:'Текущая компания подключения MCP. Переключение компании доступно только в приложении: оно отзывает этот доступ и требует нового подключения для другой компании.',
    inputSchema:{}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async()=>{try{deps.check();return {content:[{type:'text',text:JSON.stringify(deps.companyContext())}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
  require('./mcp-chat-tools.cjs').register(server, z, deps);
  require('./features/disk-space.cjs').register(server, z, deps);
  require('./features/clarifications.cjs').register(server,z,deps);
  require('./features/action-results.cjs').register(server,z,deps);
  require('./features/context-discovery.cjs').register(server,z,deps);
  require('./features/meeting-memory.cjs').register(server,z,deps);
  require('./extensions/zoom-bot/feature.cjs').register(server,z,deps);
  require('./features/extension-replies.cjs').register(server,z,deps);
  require('./features/blender-motion.cjs').register(server,z,deps);
  require('./features/layout.cjs').register(server,z,deps);
  if (deps.generatePainting && deps.access?.mode === 'edit') {
    server.registerTool('generate_painting', {
      description: 'Нарисовать картину после подтверждения в Пете. Требуется включённый Художник. Для первой загрузки увеличьте тайм-аут до часа.',
      inputSchema: require('./features/artist.cjs').schema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    }, async args => {
      try {
        const check = () => {
          deps.check();
          if (deps.access.projectId && deps.dialogue.state.activeProjectId !== deps.access.projectId) throw Error('Откройте разрешённый проект в Пете.');
        };
        check();
        const result = await deps.run(() => deps.generatePainting(args, check));
        check();
        return { content: [{ type: 'image', mimeType: 'image/png', data: result.image }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    });
  }
  return server;
}

// One SDK instance per request: stateless transport, shared application state.
async function startMcp(deps, { port = 32123 } = {}) {
  const token = randomBytes(32).toString('hex');
  const expectedAuth = Buffer.from('Bearer ' + token);
  const active = new Set();
  let origin;
  const listener = http.createServer(async (req, res) => {
    const reject = (code, message) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(message); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return reject(403, 'Forbidden origin or host');
    if (req.url !== '/mcp') return reject(404, 'Not found');
    const auth = Buffer.from(req.headers.authorization || '');
    if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) return reject(401, 'Bearer token required');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reject(405, 'Method not allowed'); }
    if (active.size >= 16) return reject(503, 'Too many requests');
    const server = createServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    active.add(server);
    res.on('close', () => { active.delete(server); void server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) reject(500, 'MCP request failed');
      else res.end();
    }
  });
  listener.requestTimeout = 100000;
  listener.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(port, '127.0.0.1', () => { listener.removeListener('error', reject); origin = 'http://127.0.0.1:' + listener.address().port; resolve(); });
  });
  return {
    url: origin + '/mcp', token,
    async close() {
      const closed = new Promise(resolve => listener.close(resolve));
      listener.closeAllConnections();
      await Promise.allSettled([...active].map(server => server.close()));
      await closed;
    }
  };
}
module.exports = { createServer, startMcp };
