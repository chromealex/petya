module.exports = { name: 'diskSpace', defaults: {}, validate() {}, setup() { return {}; }, register };
function register(server, z, ctx) {
  server.registerTool('check_model_disk_space', {
    description: 'Проверить свободное место перед загрузкой модели. Без model возвращает доступные байты; с model читает только манифест реестра и возвращает размер, запас 512 МиБ, дефицит и sufficient/insufficient/unknown. Оценка для локального стандартного хранилища или OLLAMA_MODELS; не гарантирует место на другом диске сервера. Ничего не загружает и не удаляет. Повторите проверку непосредственно перед загрузкой.',
    inputSchema: { model: z.string().min(1).max(180).regex(/^(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?$/).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  }, async ({ model }) => {
    try {
      ctx.check();
      const result = await require('../disk-space.cjs').inspectModelSpace(model);
      ctx.check();
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  });
}
