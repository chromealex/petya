// Petya's core keeps no build flows: watching a build in a Slack thread, asking the person responsible what is up
// with a build and repairing a failing build belong to «Сборки» (src/extensions/ci-builds: build-watch,
// build-question, build-repair, build-repair-sources, build-flows), asked through its chat route and reset through
// the company lifecycle (src/features/lifecycle.cjs). Fails when a core file has their logic, requires or IPC, apart
// from the uses allowed below (renderer choice keys, listed in docs/core-audit.md for the next round).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {root,scan}=require('./core-guard-kit.cjs');
const WORDS=/build-(?:watch|question|repair|flows)|BuildWatch|BuildQuestion|BuildRepair|RepairSources|buildQuestion|buildRepair|buildWatch|repairSelect|isBuildQuestion|isRepair\b|repair-input|ciBuilds|repairChoices/;
const ALLOWED={
 // Result keys whose choices the chat shows as buttons and as the question panel: generic choice plumbing that
 // still names each flow's key (docs/core-audit.md: one generic choices key).
 'src/chat-jobs.cjs':{why:'choice keys of background job results',lines:/^const CHOICES=/},
 'src/ui/chat-clarification.js':{why:'choice keys of the question panel',lines:/^const keys=\[/},
 'src/ui/dialogue.js':{why:'choice buttons of the build flows\' results',lines:/^for\(const item of result\.(?:repairChoices|buildQuestionChoices)|^if\(result\.(?:repairChoices|buildQuestionChoices)|^const options=\(result\.clarificationOptions/},
 // The Slack review flow («следи за билдом», src/review-assistant.cjs, Slack's lane) uses the app's build watch.
 'src/main.cjs':{why:'Slack review uses the app\'s build watch',lines:/^reviewAssistant=new \(require\('\.\/review-assistant\.cjs'\)/}
};
const {files,problems,stale}=scan(WORDS,ALLOWED);
assert.deepEqual(problems,[],'Build flows belong to src/extensions/ci-builds; the core has none of their logic, requires or IPC');
assert.deepEqual(stale,[],'remove stale allowances');
for(const name of ['build-watch.cjs','build-question.cjs','build-repair.cjs','build-repair-sources.cjs'])assert.ok(!fs.existsSync(path.join(root,'src',name)),'src/'+name+' is gone');
assert.ok(!/reviewState\.(?:repairs|buildQuestions|watches)/.test(fs.readFileSync(path.join(root,'src/main.cjs'),'utf8')),'the core prunes and clears no build rows');
// The app owns them: the flows, the chat route of stage 'builds' with the meaning-router entry and the clarification.
const app=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/ci-builds/extension.json'),'utf8'));
assert.equal(app.provides['chat-route'],'chat-route.cjs');
const routes=require('../src/features/chat-routes.cjs');
const route=routes.load().find(x=>x.extension==='ci-builds');assert.ok(route&&route.route.stage==='builds'&&route.route.resume.kind==='repair-input');
assert.ok(!route.route.handlesOff,'asked only while «Сборки» is added');
assert.ok(require('../src/capabilities.cjs').catalog().find(c=>c.id==='build-question')?.accepts('почини билд'));
// Without the app, its requests are offered it; Slack log questions stay with the Slack review.
const offers=require('../src/features/extension-offers.cjs');
const offered=text=>{const d=offers.decide(offers.candidates(text,{offers:offers.load(),settings:{}}));return d?.one?.offer.id||null;};
for(const text of ['почини билд','что с билдом','спроси что с билдом','как там сборка'])assert.equal(offered(text),'ci-builds',text);
assert.equal(offered('почему упал билд'),null);
// Existing users keep the flows: the app is added once for a company with Slack or Claude / Codex.
const {migrate}=require('../src/extensions/ci-builds/feature.cjs');
const with_=(settings,saved)=>{const s={...settings};migrate(s,saved);return s['extension_ci-builds'];};
assert.equal(with_({'extension_ci-builds':'false',module_slack:'true',slackToken:'x'},{slackToken:'x'}),'true');
assert.equal(with_({'extension_ci-builds':'false',module_ai:'true'},{module_ai:'true'}),'true');
assert.equal(with_({'extension_ci-builds':'false',module_slack:'true',slackToken:'x'},{'extension_ci-builds':'false'}),'false','a saved choice wins');
assert.equal(with_({'extension_ci-builds':'false',module_slack:'false',module_ai:'false'},{module_slack:'false'}),'false');
console.log('Core build-flows guard: '+files.length+' core files free of build flows ('+Object.keys(ALLOWED).length+' uses allowed); the app owns flows, route, capability, offer and migration passed');
