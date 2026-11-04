const fs = require('node:fs');
const path = require('node:path');
const cancel = require('../answer-cancel.cjs');
const directory = path.join(__dirname, '../extensions');
const providers = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
  .map(entry => path.join(directory, entry.name, 'desktop-reply.cjs')).filter(file => fs.existsSync(file)).map(file => require(file));
module.exports = {
  name: 'extensionReplies',
  setup(s) {
    async function turn(command) {
      const provider = providers.find(p => p.matches(command));
      if (!provider) return null;
      const dialogue = s.dialogue, topic = dialogue.active();
      const access = await s.serviceAccess.offer('Проверь ' + provider.name + ': ' + command, topic);
      if (access) return access;
      s.requestProgress.report('Собираю данные · ' + provider.name);
      const content = await provider.answer(command, provider.scope(s, topic));
      cancel.check();
      if (s.dialogue !== dialogue || dialogue.active() !== topic) throw Error('Чат изменился. Повторите запрос.');
      const text = content.filter(block => block.type === 'text').map(block => block.text).join('\n');
      dialogue.rememberAction(command, text);
      const owner = dialogue.active(), message = owner.messages.at(-1);
      message.by = provider.name;
      message.extensionImages = content.filter(block => block.type === 'image');
      dialogue.persist();
      return { handled: true, text, by: provider.name, topicId: owner.id, topicTitle: owner.title, messages: owner.messages };
    }
    return { extensionReplies: { turn } };
  }
};
