// Petya's core keeps no Unity Editor logic: chat requests reach the app through its chat route, project icons and
// versions of Unity projects come from its project detector (src/features/project-detectors.cjs), its progress uses
// the notification center's generic channel and its token is its own feature secret. Fails when a core file names
// Unity, apart from the uses allowed below: words that are not the app (role names, an ad network, desktop app
// names, test cases) and the leftovers listed in docs/core-audit.md for the next round (each marked «pending»).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {root,scan}=require('./core-guard-kit.cjs');
const WORDS=/unity|юнити/i;
const ALLOWED={
 // Not the app.
 'src/computer-intent.cjs':{why:'desktop apps Petya can open by name, next to Slack and Figma',lines:/^const APPS=/},
 'src/live-cases.cjs':{why:'live dialogue cases: knowledge questions about Unity'},
 'src/team-fill.cjs':{why:'role words of colleagues («Unity-разработчик»)',lines:/^\[\/б\[эе\]к/},
 'src/team-roles.cjs':{why:'role words of colleagues',lines:/^const (?:dev|client)=/},
 'src/onboarding-roles.cjs':{why:'the user\'s own role «Unity-разработчик» on the first run',lines:/id: 'unity'/},
 'src/features/ua-sources.cjs':{why:'Unity Ads, an ad network of the UA sources',lines:/^\/\//},
 'src/features/extension-replies.cjs':{why:'a comment on a past routing bug',lines:/^\/\//},
 'src/capabilities.cjs':{why:'service words the meaning router may restate (pending: from the apps)',lines:/^const SERVICES=/},
 // Pending (docs/core-audit.md): the service-module list and its catalog, onboarding guesses, the MCP chat tools,
 // the URL/token reset on save, the message fields of Unity results.
 'src/modules.cjs':{why:'pending: service modules',lines:/^const optional = /},
 'src/project-settings.cjs':{why:'pending: service modules per project',lines:/^const labels=|^function services\(/},
 'src/ui/modules.js':{why:'pending: service modules',lines:/^const optionalModules = /},
 'src/ui/app-catalog.js':{why:'pending: service modules in the catalog',lines:/^const (?:descriptions|artwork)=/},
 'src/onboarding-guess.cjs':{why:'pending: onboarding role guesses'},
 'src/mcp-chat-tools.cjs':{why:'pending: MCP chat tools of apps'},
 'src/main.cjs':{why:'pending: MCP chat tools, URL change resets the token',lines:/^invokeUnity:|^if \(next\.unityUrl !== settings\.unityUrl/},
 'src/ui/dialogue.js':{why:'pending: message fields of Unity results',lines:/^function renderDialogueMessage\(m\)/}
};
const {files,problems,stale}=scan(WORDS,ALLOWED);
assert.deepEqual(problems,[],'Unity belongs to src/extensions/unity; the core has none of its logic, requires or text');
assert.deepEqual(stale,[],'remove stale allowances');
assert.ok(!fs.existsSync(path.join(root,'src/features/unity.cjs')),'no core alias of the Unity feature');
for(const file of ['src/project-icon.cjs','src/converse.cjs','src/capabilities.cjs','src/preload.cjs','src/ui/notifications.js','src/ui/style.css'])
 assert.ok(!/extensions\/unity|ProjectSettings\.asset|onUnityProgress|unity-progress|unity-prefab|ctx\.unity/.test(fs.readFileSync(path.join(root,file),'utf8')),file+' knows no Unity');
// The app owns them: its chat route and project detector, its secret.
const app=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/unity/extension.json'),'utf8'));
assert.deepEqual(app.provides,{'chat-route':'chat-route.cjs','project-detector':'project-detector.cjs'});
assert.deepEqual(require('../src/extensions/unity/desktop.cjs').secrets,['unityToken']);
const route=require('../src/features/chat-routes.cjs').load().find(x=>x.extension==='unity');
assert.ok(route&&route.route.stage==='commands'&&route.route.handlesOff,'asked while off too: the turn offers to enable the editor');
assert.ok(require('../src/capabilities.cjs').catalog().find(c=>c.id==='unity')?.accepts('покажи префаб Player'));
const detectors=require('../src/features/project-detectors.cjs').load().map(x=>x.id);assert.ok(detectors.includes('unity'));
console.log('Core Unity guard: '+files.length+' core files free of Unity Editor logic ('+Object.keys(ALLOWED).length+' uses allowed, pending ones listed in docs/core-audit.md); the app owns chat route, project detector, progress and token passed');
