const { allowed } = require('../../jira-routing.cjs');
const cancel = require('../../answer-cancel.cjs');
module.exports = { type: 'jira', name: 'Jira', ...require('./chat-reply.cjs'),
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
