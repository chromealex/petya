// Petya's core keeps no mail service: the Gmail / Outlook clients, the Google and Microsoft accounts, their settings
// card, the tool router's «mail», the mail rules' place in the request pipeline and the daily summary's mail line
// belong to «Почта» (src/extensions/mail). Fails when a core file names Gmail / Outlook outside the allowed lines,
// and checks that what the core used to have is gone and that the app owns it. (Mail rules: core-mail-rules-guard.)
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {scan,root}=require('./core-guard-scan.cjs');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const WORDS=/(?<![a-z])(?:gmail|outlook|hotmail)|аутлук|mailAccounts|microsoftCredential|hasGmail|mail-accounts|mail-setup|mail-connection/iu;
// The service-module tables: one row per Petya service module (ids, switches, names, credentials, browser fallback),
// shared by every service; they go once a service registry replaces them, not service by service.
const TABLE='service-module table (every service module has a row)';
const ALLOWED={
 'src/modules.cjs':{why:TABLE},
 'src/service-access.cjs':{why:TABLE+': names, browser URLs, request words, the Outlook part of «Почта»'},
 'src/project-settings.cjs':{why:TABLE,lines:/^const labels=/},
 'src/request-progress.cjs':{why:TABLE,lines:/^const names=\{jira:/},
 'src/main.cjs':{why:TABLE+': the services the dialogue model is told are on',lines:/services:Object\.entries\(\{jira:'Jira'/},
 'src/features/agents.cjs':{why:TABLE+': areas an agent plan may touch',lines:/const areas=Object\.entries\(\{jira:/},
 'src/converse.cjs':{why:TABLE+': Outlook is the «Почта» module of a failed request',lines:/serviceProblem=\{id:service==='outlook'\?'gmail':service\}/},
 'src/ui/modules.js':{why:TABLE,lines:/^const optionalModules =/},
 'src/ui/app-catalog.js':{why:TABLE+': tile text, icon and saved-credential flags',lines:/^const descriptions=|^gmail:stroke\(|^const SERVICE_FLAGS=/},
 'src/ui/connection-sidebar.js':{why:TABLE+': sidebar badges',lines:/^const services = \[|^const flags=\{slack:/},
 'src/ui/connection-recovery.js':{why:TABLE+': Outlook is the «Почта» card',lines:/^const service=id==='outlook'\?'gmail':id;/},
 'src/ui/service-access.js':{why:TABLE,lines:/const names=\{slack:'Slack'/},
 'src/ui/team.js':{why:TABLE+': services a person is known in',lines:/^const SERVICES=\{slack:/},
 // Words that name a subject without being a request for it (routing of other features).
 'src/agent-team.cjs':{why:'the agent areas a request touches',lines:/^const AREAS=/},
 'src/capabilities.cjs':{why:'service names that are not a capability request',lines:/^const SERVICES=/},
 'src/features/materials.cjs':{why:'which group of «Материалы» a saved item goes to',lines:/^function app\(item\)/},
 'src/onboarding-guess.cjs':{why:'public mail domains are not a company',lines:/^const PUBLIC_MAIL =|^'icloud\.com'/},
 // Consumers of the shared Google / Microsoft accounts «Почта» provides (`services.mailAccounts`).
 'src/google-workspace.cjs':{why:'the shared Google account adapter of every Google app: the Google accounts of the mail connection'},
 'src/features/mail-records.cjs':{why:'reads the accounts «Почта» provides',lines:/s\.mailAccounts/},
 'src/features/meeting-summary.cjs':{why:'a meeting service\'s summary letter, read through the accounts «Почта» provides',lines:/s\.mailAccounts/}
};
const count=scan({service:'Mail',words:WORDS,allowed:ALLOWED});

// What the core used to have is gone.
for(const file of ['src/gmail.cjs','src/gmail-accounts.cjs','src/outlook.cjs','src/mail-accounts.cjs','src/mail-setup.cjs','src/mail-skill.cjs','src/ui/mail-connection.js'])
 assert.equal(fs.existsSync(path.join(root,file)),false,file+' moved into src/extensions/mail');
assert.ok(!/gmail|microsoft|mailCancel/i.test(/const calls = \[.*\]/.exec(read('src/preload.cjs'))[0]),'no mail IPC in the preload');
assert.ok(!/почт|календар/iu.test(read('src/daily-brief.cjs')),'the daily summary names no mail: its line is the app\'s summary section');
const semantic=require('../src/semantic-tools.cjs');
assert.ok(!semantic.routingRequest('m','x',{tools:[]}).format.properties.tool.enum.includes('mail'),'no mail tool without the app');
assert.ok(!/почтов|Для mail/iu.test(read('src/semantic-tools.cjs')+read('src/converse.cjs')),'the router keeps no mail rule');

// The app owns them: the clients, the accounts, the card, the router tool, the pipeline route, the summary line.
const app=JSON.parse(read('src/extensions/mail/extension.json'));
assert.equal(app.setting,'module_gmail','the switch users have');assert.equal(app.service,'gmail');assert.equal(app.settings,true);
for(const [kind,file] of [['route-tool','route-tool.cjs'],['chat-route','chat-route.cjs'],['summary-section','summary-section.cjs']])assert.equal(app.provides[kind],file);
assert.ok(app.scripts.some(([file])=>file==='settings.js'));
const feature=require('../src/extensions/mail/feature.cjs');
assert.deepEqual(Object.keys(feature.defaults).sort(),['gmailCredential','microsoftCredential'],'the settings keys stay');
assert.ok(feature.secrets.includes('gmailCredential')&&feature.secrets.includes('microsoftCredential'));
assert.deepEqual(feature.publicFlags({gmailCredential:'x'}),{hasGmail:true});
assert.throws(()=>feature.validate({},{gmailCredential:'x'.repeat(200001)}),/Gmail/);
const tools=require('../src/features/route-tools.cjs');
assert.deepEqual(tools.list({module_gmail:'true'}).map(t=>t.id).filter(id=>id==='mail'),['mail']);
assert.deepEqual(tools.list({module_gmail:'false'}).map(t=>t.id).filter(id=>id==='mail'),[]);
assert.match(read('src/extensions/mail/settings.js'),/dataset\.service='gmail'/);
console.log('Core mail guard: '+count+' core files free of Gmail / Outlook logic and text ('+Object.keys(ALLOWED).length+' table and consumer uses allowed); «Почта» owns the clients, accounts, card, router tool, pipeline route and summary line passed');
