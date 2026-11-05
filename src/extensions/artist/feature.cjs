const path = require('node:path');
const { z } = require('zod');
const { createArtistRuntime } = require('./runtime.cjs');
const { localEndpoint } = require('../../core.cjs');
const { png } = require('../../local-images.cjs');

const steps = { draft: 12, standard: 28, high: 45 };
const sizes = { square: [768, 768], portrait: [640, 1024], landscape: [1024, 640] };
const schema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  quality: z.enum(['draft', 'standard', 'high']).default('standard'),
  format: z.enum(['square', 'portrait', 'landscape']).default('square')
});

module.exports = {
  name: 'artist', schema, defaults: { artistEnabled: 'false', artistUrl: '' },
  validate(settings) {
    if (settings.artistUrl) localEndpoint(settings.artistUrl);
    if (!['true', 'false'].includes(settings.artistEnabled)) throw Error('Проверьте настройку Художника.');
  },
  setup(s) {
    const { app, dialog } = require('electron');
    let controller, recheck;
    let state = { phase: 'idle', busy: false };
    function publish(phase, message, percent) {
      state = { phase, message, percent, busy: Boolean(controller) };
      if (s.win && !s.win.isDestroyed()) s.win.webContents.send('artist-progress', state);
    }
    const runtime = createArtistRuntime(path.join(app.getPath('userData'), 'artist-runtime'), async bytes => {
      recheck?.();
      if (!require('../../features/extension-replies.cjs').needsApproval(bytes,s.settings)) return true;
      publish('confirm', 'Ожидаю подтверждения загрузки…');
      const size = (bytes / 1e9).toLocaleString('ru', { maximumFractionDigits: 2 });
      const answer = await dialog.showMessageBox(s.win, { message: 'Скачать Художника?',
        detail: 'Генератор и модель Stable Diffusion 1.5 · ' + size + ' ГБ. Потребуется 2,5 ГБ свободного места.',
        buttons: ['Отмена', 'Скачать и нарисовать'], defaultId: 0, cancelId: 0 });
      recheck?.();
      return answer.response === 1;
    }, (message, value) => {
      if (message) publish(value >= 0 && value <= 1 ? 'download' : 'working', message,
        value >= 0 && value <= 1 ? Math.round(value * 100) : undefined);
    });
    function stop() { controller?.abort(); runtime.stop(); }
    async function generate(input, authorize) {
      if (s.settings.artistEnabled !== 'true') throw Error('Включите Художника в разделе «Подключения → Картинки».');
      const args = schema.parse(input);
      if (controller) throw Error('Художник занят. Дождитесь результата.');
      const endpoint = s.settings.artistUrl;
      controller = new AbortController();
      const signal = controller.signal;
      recheck = authorize;
      try {
        publish('preparing', 'Готовлю Художника…');
        if (authorize) {
          const answer = await dialog.showMessageBox(s.win, { message: 'Нарисовать картину по запросу MCP?',
            detail: args.prompt + '\n' + args.quality + ' · ' + args.format, buttons: ['Отмена', 'Нарисовать'], defaultId: 0, cancelId: 0 });
          if (answer.response !== 1) throw Error('Запрос отменён.');
          authorize();
        }
        signal.throwIfAborted();
        const [width, height] = sizes[args.format];
        const params = { prompt: args.prompt, width, height, steps: steps[args.quality] };
        let image;
        if (endpoint) {
          publish('working', 'Художник рисует…');
          const url = new URL('/sdapi/v1/txt2img', localEndpoint(endpoint));
          const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...params, save_images: false, override_settings: { samples_format: 'png' } }),
            signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]) });
          if (!response.ok) throw Error('WebUI вернул HTTP ' + response.status + '. Проверьте подключение.');
          image = (await response.json()).images?.[0];
        } else image = await runtime.generate(params);
        png(image);
        controller = null;
        publish('done', 'Картина готова.');
        return { image, width, height, model: endpoint ? 'WebUI' : 'Stable Diffusion 1.5' };
      } catch (error) {
        controller = null;
        const message = signal.aborted ? 'Работа Художника остановлена.' : error.message;
        publish('error', message);
        throw Error(message);
      } finally { recheck = undefined; }
    }
    const snapshot = () => ({ ...state, enabled: s.settings.artistEnabled === 'true', url: s.settings.artistUrl });
    return { artist: { generate, stop }, ipc: { generate: input => generate(input), status: snapshot, stop,
      async remove() {
        if (controller) throw Error('Дождитесь завершения работы Художника.');
        const result = await dialog.showMessageBox(s.win, { message: 'Удалить скачанный генератор и модель Художника с этого компьютера?',
          buttons: ['Отмена', 'Удалить'], defaultId: 0, cancelId: 0 });
        if (result.response === 1) {
          runtime.remove();
          s.saveSettings({ artistEnabled: 'false', artistUrl: '' });
          publish('removed', 'Компоненты Художника удалены.');
        }
        return snapshot();
      },
      configure(enabled, url = '') {
        if (controller) throw Error('Дождитесь завершения работы Художника.');
        s.saveSettings({ artistEnabled: enabled === true ? 'true' : 'false', artistUrl: url });
        return snapshot();
      }
    } };
  }
};
