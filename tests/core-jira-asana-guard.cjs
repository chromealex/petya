// Jira and Asana are apps: their code lives in src/extensions/jira and src/extensions/asana, and they plug into
// Petya's core through registries — the «bugs» chat subject (dialogue-kind, src/features/dialogue-kinds.cjs) and router tool (route-tool), the Jira
// connection card (window.addConnectionCard in src/ui/connections.js), the «Jira» row of «В сервисах» on «Команда»
// (window.petyaTeamServices in src/ui/team.js), message fields of chat results (chat-results `fields`), feature
// IPC and settings checks. The Atlassian sign-in is the Jira app's (src/extensions/jira/atlassian-oauth.cjs), shared
// with Confluence; the broker it uses is service-neutral (src/oauth-broker.cjs).
// This guard fails when
//  - a moved module comes back to the core;
//  - a core file (src/*.cjs|js, src/features/*.cjs, anything in src/ui) carries the bugs kind, the Jira people search,
//    the Atlassian sign-in or the Asana page;
//  - a core file requires into the Jira or Asana app beyond the couplings listed in REMAINING (each with its reason;
//    the list only shrinks);
//  - a core file mentions Jira / Atlassian / Asana more often than tests/core-jira-asana-remaining.json records (a
//    ratchet over the parts not moved yet — the workspace that decomposes features into tasks, team load, history,
//    service modules; lower a number when you remove mentions).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=[];
const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory()){if(e.name!=='vendor')walk(rel,filter);}else if(filter(rel))files.push(rel);}};
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js|ps1)$/.test(e.name))files.push('src/'+e.name);
walk('src/features',f=>/\.cjs$/.test(f));
walk('src/ui',f=>/\.(?:js|html|css)$/.test(f));

// 1. The moved modules are gone from the core.
const MOVED={'src/jira-insights.cjs':'insights.cjs','src/jira-issue.cjs':'issue.cjs','src/jira-options.cjs':'options.cjs','src/jira-routing.cjs':'routing.cjs',
 'src/jira-selection.cjs':'selection.cjs','src/jira-setup.cjs':'setup.cjs','src/team-jira.cjs':'team-search.cjs','src/team-jira-roster.cjs':'team-roster.cjs',
 'src/task-duplicates.cjs':'duplicates.cjs','src/task-metrics.cjs':'metrics.cjs','src/atlassian-oauth.cjs':'atlassian-oauth.cjs',
 'src/ui/task-metrics.js':'task-metrics.js'};
// «Люди из Jira с должностями из Slack» belongs to the Slack app (src/extensions/slack/jira-people.cjs): it reads Jira
// through the shared workspace and joins Slack profiles there.
assert.ok(!fs.existsSync(path.join(root,'src/features/jira-slack-people.cjs')),'src/features/jira-slack-people.cjs moved to the Slack app');
assert.ok(fs.existsSync(path.join(root,'src/extensions/slack/jira-people.cjs')),'src/extensions/slack/jira-people.cjs exists');
for(const [old,now] of Object.entries(MOVED)){assert.ok(!fs.existsSync(path.join(root,old)),old+' is the Jira app\'s');assert.ok(fs.existsSync(path.join(root,'src/extensions/jira',now)),'src/extensions/jira/'+now+' exists');}
for(const old of ['src/asana.cjs','src/asana-setup.cjs','src/ui/asana.js'])assert.ok(!fs.existsSync(path.join(root,old)),old+' is the Asana app\'s');
for(const now of ['asana.cjs','asana-page.js','feature.cjs'])assert.ok(fs.existsSync(path.join(root,'src/extensions/asana',now)),'src/extensions/asana/'+now+' exists');

// 2. What the apps own now never comes back to a core file.
const OWNED=[
 [/['"]bugs['"]|\bbugs:|Баги в Jira|Проверить баги|Jira: баги|запрос к Jira'\s*,\s*tasks/,'the «bugs» chat kind (src/extensions/jira/dialogue-kind.cjs)'],
 [/teamJiraSearch|Найти человека в Jira|jiraLink\(/,'the Jira people search on «Команда» (src/extensions/jira/team-field.js)'],
 [/connectAtlassian|atlassianConnected|Подключить Jira и Confluence|Отключить Atlassian/,'the Atlassian sign-in card (src/extensions/jira/settings.js)'],
 [/asanaProjects\(|asanaTasks\(|asanaPreview\(|Открыть задачи Asana/,'the Asana page (src/extensions/asana/asana-page.js)'],
 [/class AtlassianOAuth|requireConfluence|api\.atlassian\.com\/ex\//,'the Atlassian adapter (src/extensions/jira/atlassian-oauth.cjs)']
];
// Generic plumbing that names these only as IPC channel names (the preload's list of calls the renderer may make).
const CHANNELS={'src/preload.cjs':/^const calls = \[/,
 // Live dialogue test cases (PETYA_LIVE_SET=500) expect the answer labels of the apps that answer them.
 'src/live-cases.cjs':/^const tasks=\{by:'Jira: задачи\|рабочий запрос'\},bugs=\{by:'Jira: баги\|рабочий запрос'\};$/};
const owned=[];
for(const file of files){const text=read(file);text.split(/\r?\n/).forEach((line,i)=>{for(const [re,why] of OWNED)if(re.test(line)&&!(CHANNELS[file]?.test(line.trim())))owned.push(file+':'+(i+1)+' — '+why+': '+line.trim().slice(0,120));});}
assert.deepEqual(owned,[],'these belong to the Jira and Asana apps');

// 3. Requires into the apps: only the couplings not moved yet, each with its reason.
const REMAINING={
 'src/main.cjs':{why:'the Atlassian request rewrite and its IPC (connections-setup), the «tasks» chat reader and the project-memory Jira binding; the «tasks» kind and the Jira workspace are not moved yet',
  lines:/extensions\/jira\/(?:atlassian-oauth|read|selection)\.cjs/},
 'src/skills-setup.cjs':{why:'task duplicates of the Jira workspace plan (created with the review state there)',lines:/extensions\/jira\/duplicates\.cjs/},
 'src/workspace.cjs':{why:'the Jira workspace (feature decomposition into Jira issues) is not moved yet',lines:/extensions\/jira\/routing\.cjs/},
 'src/history.cjs':{why:'history of the Jira workspace batches',lines:/extensions\/jira\/routing\.cjs/},
 'src/agents.cjs':{why:'agents re-check the Jira project of a delegated issue',lines:/extensions\/jira\/routing\.cjs/},
 'src/learning-setup.cjs':{why:'learning names Jira project keys in global phrases',lines:/extensions\/jira\/routing\.cjs/},
 'src/project-catalog.cjs':{why:'the project catalogue lists Jira projects',lines:/extensions\/jira\/selection\.cjs/},
 'src/team-fill-setup.cjs':{why:'the team fill falls back to Jira assignees',lines:/extensions\/jira\/team-roster\.cjs/},
 'src/features/dashboards.cjs':{why:'dashboards build Jira JQL widgets',lines:/extensions\/jira\/dashboard\.cjs/},
 'src/features/assignment.cjs':{why:'team load and task assignment read Asana (with Jira, src/workload.cjs)',lines:/extensions\/asana\/asana\.cjs/}
};
const requires=[];
for(const file of files){const text=read(file);text.split(/\r?\n/).forEach((line,i)=>{if(/require\([^)]*extensions\/(?:jira|asana)\//.test(line)&&!(REMAINING[file]?.lines.test(line)))requires.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});}
assert.deepEqual(requires,[],'core files reach the Jira and Asana apps only through registries');
for(const [file,{lines}] of Object.entries(REMAINING))assert.ok(read(file).split(/\r?\n/).some(l=>/require\(/.test(l)&&lines.test(l)),'remove the stale allowance for '+file);

// 4. The ratchet over mentions in the parts not moved yet.
const WORDS=/jira|джир|atlassian|asana|асан[аеуы]/gi;
const recorded=JSON.parse(read('tests/core-jira-asana-remaining.json'));
const grown=[],lower=[];
for(const file of files){const n=(read(file).match(WORDS)||[]).length,max=recorded[file]||0;if(n>max)grown.push(file+': '+n+' mentions, recorded '+max);else if(n<max)lower.push(file+': '+n+' < '+max);}
assert.deepEqual(grown,[],'Jira and Asana do not spread in the core: move the code into the apps (or, for a reduction, lower the record)');
for(const file of Object.keys(recorded))assert.ok(files.includes(file),'remove '+file+' from tests/core-jira-asana-remaining.json: it is gone');

// 5. The apps are really apps: declared, providing the registries they plug in through.
const jira=JSON.parse(read('src/extensions/jira/extension.json')),asana=JSON.parse(read('src/extensions/asana/extension.json'));
assert.equal(jira.setting,'module_jira');assert.equal(jira.feature,'feature.cjs');
for(const kind of ['dialogue-kind','task-tracker','voice-action'])assert.ok(jira.provides[kind],'Jira provides '+kind);
assert.ok(jira.scripts.some(([f])=>f==='team-field.js')&&jira.scripts.some(([f])=>f==='settings.js'),'Jira draws its card and its «Команда» row');
assert.equal(asana.feature,'feature.cjs');assert.ok(asana.scripts.some(([f])=>f==='asana-page.js'));
assert.ok(fs.existsSync(path.join(root,'src/extensions/jira/offer.cjs')),'without Jira its requests get the offer');
const kinds=require('../src/features/dialogue-kinds.cjs');
assert.deepEqual(kinds.load().filter(k=>k.extension==='jira').map(k=>k.id),['bugs']);
assert.ok(jira.provides['route-tool'],'Jira provides the bugs tool of the router');
kinds.bind({settings:{module_jira:'false'}});assert.equal(kinds.detect('Проверь баги'),null,'without Jira «Проверь баги» is ordinary chat (and gets the offer)');
kinds.bind({settings:{module_jira:'true'}});assert.equal(kinds.detect('Проверь баги'),'bugs');kinds.bind(null);
console.log('Core Jira/Asana guard: '+files.length+' core files; moved modules gone, owned parts only in the apps, '+Object.keys(REMAINING).length+' remaining requires with reasons, ratchet over '+Object.keys(recorded).length+' files'+(lower.length?' ('+lower.length+' below their record)':'')+' passed');
