// Petya's core keeps no Notion: the client, Notion as a documentation source of the decomposition, the connection
// check and the settings card belong to «Notion» (src/extensions/notion). Fails when a core file names Notion outside
// the allowed lines, and checks that what the core used to have is gone and that the app owns it.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {scan,root}=require('./core-guard-scan.cjs');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const WORDS=/notion|ноуш/iu;
const TABLE='service-module table (every service module has a row)';
const ALLOWED={
 'src/modules.cjs':{why:TABLE},
 'src/service-access.cjs':{why:TABLE+': names, browser URLs, request words'},
 // Petya's OAuth broker client: one row per provider the broker signs in (Slack, Notion, Asana).
 'src/service-oauth.cjs':{why:'the providers of Petya\'s OAuth broker'},
 'src/main.cjs':{why:'the broker clients; the services the dialogue model is told are on; the speech recognition hint words',lines:/^const serviceOAuth =|services:Object\.entries\(\{jira:'Jira'|^const defaults = /},
 'src/project-settings.cjs':{why:TABLE,lines:/^const labels=/},
 'src/request-progress.cjs':{why:TABLE,lines:/^const names=\{jira:/},
 'src/ui/modules.js':{why:TABLE,lines:/^const optionalModules =/},
 'src/ui/app-catalog.js':{why:TABLE+': tile text, artwork and saved-credential flags',lines:/^const descriptions=|^const artwork=|^const SERVICE_FLAGS=/},
 'src/ui/connection-sidebar.js':{why:TABLE+': sidebar badges',lines:/^const services = \[|^const flags=\{slack:/},
 'src/ui/startup-connections.js':{why:TABLE+': cards checked when the window opens',lines:/Promise\.allSettled\(\['whisper'/},
 'src/ui/service-access.js':{why:TABLE,lines:/const names=\{slack:'Slack'/},
 'src/ui/team.js':{why:TABLE+': services a person is known in',lines:/^const SERVICES=\{slack:/},
 'src/ui/materials.js':{why:'groups of «Материалы» by where an item was saved from',lines:/^const GROUPS=/},
 'src/features/materials.cjs':{why:'which group of «Материалы» a saved item goes to',lines:/^function app\(item\)/},
 // Words that name a subject without being a request for it (routing of other features).
 'src/agent-team.cjs':{why:'the agent areas a request touches',lines:/^const AREAS=/},
 'src/capabilities.cjs':{why:'service names that are not a capability request',lines:/^const SERVICES=/},
 'src/chat-jobs.cjs':{why:'requests that are not background chat jobs',lines:/confluence\|notion\|asana/},
 'src/semantic-tools.cjs':{why:'the internet never answers about the workspace',lines:/route\.tool==='web'/},
 'src/work-query-route.cjs':{why:'work lists other trackers keep are not Jira\'s',lines:/asana\|асан/},
 'src/personal-tasks.cjs':{why:'my own tasks in other trackers are not Jira\'s',lines:/asana\|асана\|асане\|notion/},
 'src/team-fill.cjs':{why:'Slack sidebar entries that are apps, not people',lines:/^const NOT_PERSON=/},
 'src/onboarding-guess.cjs':{why:'work programs that hint at a role',lines:/^\[\/\^\(jira\|linear/}
};
const count=scan({service:'Notion',words:WORDS,allowed:ALLOWED});

// What the core used to have is gone.
assert.equal(fs.existsSync(path.join(root,'src/notion.cjs')),false,'the client moved to src/extensions/notion/client.cjs');
assert.ok(!/notion/i.test(read('src/workspace.cjs')),'the decomposition reads app documentation sources, not Notion');
assert.ok(!/notion/i.test(read('src/connections.cjs')+read('src/connections-setup.cjs')),'no Notion connection check in the core');
assert.ok(!/notion/i.test(read('src/ui/index.html')+read('src/ui/connections.js')+read('src/ui/style.css')+read('src/ui/compact-layout.js')+read('src/ui/app.js')),'no Notion card in the core window');
const groups=JSON.parse(read('src/extensions/categories.json'));
assert.equal(groups.moduleQuickStart?.notion,undefined,'«С чего начать» takes Notion from the app');
assert.equal(groups.moduleExamples?.notion,undefined,'the examples are the app\'s');

// The app owns them: the switch and keys users have, the quick start, the source, the check and the card.
const app=JSON.parse(read('src/extensions/notion/extension.json'));
assert.equal(app.setting,'module_notion');assert.equal(app.service,'notion');assert.equal(app.settings,true);assert.deepEqual(app.quickStart,{order:30});
assert.equal(app.provides['doc-source'],'doc-source.cjs');assert.equal(app.provides['connection-check'],'connection-check.cjs');
const feature=require('../src/extensions/notion/feature.cjs');
assert.deepEqual(Object.keys(feature.defaults).sort(),['notionCredential','notionToken']);
assert.deepEqual(feature.publicFlags({notionCredential:'x'}),{hasNotionOAuth:true,hasNotionToken:true});
assert.throws(()=>feature.validate({notionCredential:'c'},{notionToken:'t'}),/отключите вход notion/);
assert.deepEqual(require('../src/features/doc-sources.cjs').list({notionToken:'t'}).map(s=>s.id),['notion']);
assert.deepEqual(require('../src/features/doc-sources.cjs').list({notionToken:'t',module_notion:'false'}),[]);
assert.equal(require('../src/connections.cjs').guide('notion'),'https://www.notion.so/my-integrations');
assert.match(read('src/extensions/notion/settings.js'),/name="notionToken"/);
console.log('Core Notion guard: '+count+' core files free of Notion logic and text ('+Object.keys(ALLOWED).length+' table and word-list uses allowed); «Notion» owns the client, documentation source, connection check, card and quick start passed');
