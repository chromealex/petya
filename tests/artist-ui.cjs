// Run with Electron against an isolated profile and a loopback WebUI fixture.
process.env.PETYA_SMOKE_TEST = '1';
const assert = require('node:assert/strict');
const http = require('node:http');
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=';
require.cache[require.resolve('./smoke.cjs')] = { exports: async win => {
  let body, respond;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks));
    respond = () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ images: [image] })); };
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const ui = code => win.webContents.executeJavaScript(code);
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Timed out waiting for Artist UI');
  };
  try {
    await ui("window.extensionHost.open('artist')");
    await wait(() => ui("!$('artist-enable').disabled && $('artist-enable').getBoundingClientRect().width > 0"));
    await ui("$('artist-url').value='http://127.0.0.1:" + server.address().port + "'; $('artist-connect').click();");
    // Settings hold the model and the server only; drawing is asked for in the chat.
    assert.equal(await ui("!!document.getElementById('artist-prompt')"), false);
    await wait(() => ui("$('artist-model-status').textContent.includes('свой сервер')"));
    const drawing = ui("window.petya.feature('artist','generate',{prompt:'Ночной маяк',format:'portrait',quality:'draft'})");await ui("view('home')");
    await wait(() => Boolean(respond));
    assert.deepEqual([body.prompt, body.width, body.height, body.steps], ['Ночной маяк', 640, 1024, 12]);
    await wait(() => ui("!!document.querySelector('[data-notification-id=artist] progress')"));
    assert.equal(await ui("window.petya.feature('artist','status').then(s=>s.busy)"), true);
    await assert.rejects(ui("window.petya.feature('artist','generate',{prompt:'Второй рисунок'})"), /занят/);
    respond();
    assert.equal((await drawing).image, image);
    assert.equal(await ui("window.petya.feature('artist','status').then(s=>s.phase)"), 'done');
    const failure = ui("window.petya.feature('artist','generate',{prompt:'Отменяемый рисунок'})");
    await wait(() => ui("window.petya.feature('artist','status').then(s=>s.busy)"));
    await ui("window.petya.feature('artist','stop')");
    await assert.rejects(failure, /остановлена/);
    assert.equal(await ui("window.petya.feature('artist','status').then(s=>s.busy)"), false);
    console.log('Artist UI: preview, save link, notifications, duplicate requests and cancellation passed.');
  } finally { server.closeAllConnections(); server.close(); }
} };
require('../src/main.cjs');
