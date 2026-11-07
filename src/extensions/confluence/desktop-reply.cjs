const cancel = require('../../answer-cancel.cjs');
module.exports = {
  service:true, description:'Диаграмма количества страниц по пространствам.', type: 'confluence', name: 'Confluence', ...require('./chat-reply.cjs'),
  choices(scope){return [...scope.visibleSpaces].sort();},
  select(scope,key){if(scope.space&&scope.space!==key)throw Error('Пространство изменилось.');scope.space=key;},
  source(scope,s){return [new URL(s.settings.jiraUrl).hostname,scope.space||'Все доступные пространства'].join(' · ');},
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
    const visibleSpaces=new Set();
    return { visibleSpaces,space: settings.confluenceSpace, searchPage: async path => {
      check();
      const page = await workspace.api(path, {}, settings);
      check();
      for(const row of page.results||[])if(row.space?.key)visibleSpaces.add(row.space.key);
      return page;
    } };
  }
};
