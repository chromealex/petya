// Jira's main-process part: its IPC (project routing, the settings card's project choices, task metrics, people,
// task batches and their history) and the person search of «Команда». Set up once per company like every feature;
// the service module keeps its settings (`module_jira`, `jiraUrl`, `jiraProjects`, … in src/modules.cjs).
// On save: the browser sign-in owns the site and token, the site is a Jira Cloud origin, and the chosen projects
// stay consistent (src/extensions/jira/selection.cjs). `previous` is the saved settings, `input` the raw form.
function validate(next,previous,input,internal=false){
 // Called without the saved settings (a check of one value) it only checks the address.
 const saving=!!previous;previous=previous||{};input=input||{};
 if(!internal&&previous.atlassianCredential&&(input.jiraToken||(input.jiraUrl&&input.jiraUrl.replace(/\/$/,'')!==previous.jiraUrl)))throw new Error('Сначала отключите вход Atlassian через браузер.');
 if(next.jiraUrl&&!/^[a-z]+:\/\//i.test(next.jiraUrl.trim()))next.jiraUrl='https://'+next.jiraUrl.trim();
 if(next.jiraUrl){let url;try{url=new URL(next.jiraUrl);}catch{throw new Error('Адрес Jira: укажите его в виде https://company.atlassian.net');}if(url.protocol!=='https:'||!url.hostname.endsWith('.atlassian.net')||url.username||url.password||url.pathname!=='/')throw new Error('Укажите адрес Jira Cloud: https://company.atlassian.net');next.jiraUrl=url.origin;}
 if(saving)require('./selection.cjs').normalizeSelection(next,previous,input);
}
module.exports={name:'jira',defaults:{},validate,
 setup(s){
  // The same live getters main.cjs gave the old src/jira-setup.cjs.
  require('./setup.cjs')({get contextFor(){return s.contextFor;},get delegation(){return require('../../agents.cjs').delegation;},get dialogue(){return s.dialogue;},get handle(){return s.handle;},get projectMemory(){return s.projectMemory;},get settings(){return s.settings;},get modules(){return s.modules;},get taskDuplicates(){return s.taskDuplicates;},get text(){return s.text;},get workSkills(){return s.workSkills;},get workspace(){return s.workspace;}});
  // «Команда» → a person's card → «В сервисах» → Jira: people of the allowed projects (src/extensions/jira/team-field.js).
  s.handle('teamJiraSearch',query=>require('./team-search.cjs').search(s.workspace,query));
  return {};
 }};
