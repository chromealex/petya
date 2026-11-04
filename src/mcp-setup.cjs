module.exports = function setup(ctx) {
  let endpoint, changing = false;
  const status = () => ({enabled:!!endpoint,url:endpoint?.url || ''});
  const stop = async () => {
    const current = endpoint;
    endpoint = undefined;
    await current?.close();
  };
  ctx.handle('mcpStatus', status);
  ctx.handle('mcpStart', async () => {
    if (changing) throw Error('Подключение MCP уже изменяется.');
    changing = true;
    try {
      endpoint ||= await require('./mcp.cjs').startMcp(ctx, {port:0});
      return status();
    } finally { changing = false; }
  });
  ctx.handle('mcpCopy', () => {
    if (!endpoint) throw Error('Сначала включите доступ через MCP.');
    require('electron').clipboard.writeText(JSON.stringify({mcpServers:{petya:{url:endpoint.url,headers:{Authorization:'Bearer '+endpoint.token}}}},null,2));
  });
  ctx.handle('mcpStop', async () => {
    if (changing) throw Error('Подключение MCP уже изменяется.');
    changing = true;
    try { await stop(); return status(); } finally { changing = false; }
  });
  return stop;
};
