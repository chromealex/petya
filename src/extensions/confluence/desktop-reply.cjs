const cancel = require('../../answer-cancel.cjs');
module.exports = {
  type: 'confluence', name: 'Confluence', ...require('./chat-reply.cjs'),
  scope(s) {
    const workspace = s.workspace;
    const settings = workspace.settings();
    const company = s.companyId;
    const keys = ['module_confluence', 'jiraUrl', 'jiraEmail', 'jiraToken', 'atlassianCredential', 'confluenceSpace'];
    function check() {
      cancel.check();
      s.modules.assertEnabled(s.settings, 'confluence');
      if (company !== s.companyId || keys.some(key => settings[key] !== s.settings[key])) throw Error('Подключение Confluence изменилось. Повторите запрос.');
    }
    return { space: settings.confluenceSpace, searchPage: async path => {
      check();
      const page = await workspace.api(path, {}, settings);
      check();
      return page;
    } };
  }
};
