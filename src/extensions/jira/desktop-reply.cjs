const { allowed } = require('../../jira-routing.cjs');
const cancel = require('../../answer-cancel.cjs');
module.exports = { service:true, description:'Мои задачи по типам и статусам, поиск зависших задач.', type: 'jira', name: 'Jira', ...require('./chat-reply.cjs'),
  matches(command, {settings,topic}) {
    const connected = require('../../service-access.cjs').ready('jira',settings) && (topic?.jiraProject || allowed(settings).length > 0);
    const named = /jira|д?жир[аеуы]?/iu.test(command);
    if (!named && (!connected || /asana|асана|linear|trello|трелло|github|битрикс|youtrack/iu.test(command))) return false;
    return require('./chat-reply.cjs').matches(command + (named ? '' : ' Jira'));
  },
  scope(s, topic) {
    const keys = allowed(s.settings);
    const binding = s.projectMemory?.get(topic?.projectMemoryId)?.jira;
    const bound = topic?.jiraProject || (binding?.site === s.settings.jiraUrl && binding.key);
    if (bound && !keys.includes(bound)) throw Error('Проект этого чата недоступен в подключении Jira.');
    const projects = bound ? [bound] : keys;
    const signature = () => JSON.stringify([s.companyId, s.settings.jiraUrl, s.settings.jiraEmail,
      s.settings.jiraToken, s.settings.atlassianCredential, allowed(s.settings), s.settings.module_jira]);
    const initial = signature();
    const check = () => {
      cancel.check();
      if (initial !== signature()) throw Error('Подключение Jira изменилось. Повторите запрос.');
      s.modules.assertEnabled(s.settings, 'jira');
    };
    const w = s.workspace, settings = w.settings();
    check();
    return { projects, searchPage: async path => {
      check();
      const page = await w.api(path, {}, settings);
      check();
      return page;
    } };
  }
};
