// Petya's core keeps no Git logic: the repository workspace, the natural-language Git routes, the chat handler, the
// Git panel and its IPC belong to the Git app (src/extensions/git), which plugs in through a chat route
// (src/features/chat-routes.cjs) and serves `services.gitWorkspace` to other apps. Fails when a core file names the
// app's pieces, apart from the renderer leftovers allowed below (listed in docs/core-audit.md for the next round).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {root,scan}=require('./core-guard-kit.cjs');
const WORDS=/GitWorkspace|gitWorkspace|git-workspace|git-intent|git-setup|naturalGit|commandRoute|gitDiscover|gitSelect|gitInit|gitStatus|gitExecute|gitDiscovery|gitCommand|git-card|project-git-open|openProjectGit|Выполняю Git|Параметры Git|git-input/;
const ALLOWED={
 // Renderer leftovers (docs/core-audit.md): the «Работать с …» / «Создать Git в …» buttons for a Git result that
 // asks which repository, until the chat results carry generic choices.
 'src/ui/dialogue.js':{why:'choice buttons of a Git result',lines:/^if\(result\.gitDiscovery\)/},
 'src/ui/chat-clarification.js':{why:'a Git result with choices is a question',lines:/result\.gitDiscovery/},
 // The chat heading's button order: the Git app's button keeps its slot.
 'src/ui/ux-pass.css':{why:'chat heading button order',lines:/#project-git-open/}
};
const {files,problems,stale}=scan(WORDS,ALLOWED);
assert.deepEqual(problems,[],'Git belongs to src/extensions/git; the core has none of its logic, requires or text');
assert.deepEqual(stale,[],'remove stale allowances');
for(const name of ['git-workspace.cjs','git-intent.cjs','git-setup.cjs','ui/git-workspace.js'])assert.ok(!fs.existsSync(path.join(root,'src',name)),'src/'+name+' is gone');
// The app owns it: its feature (services.gitWorkspace and the panel IPC), its chat route and the panel script.
const app=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/git/extension.json'),'utf8'));
assert.equal(app.feature,'feature.cjs');assert.deepEqual(app.provides,{'chat-route':'chat-route.cjs'});
assert.ok(app.scripts.some(([file])=>file==='git-panel.js'),'the Git panel is the app\'s script');
const feature=require('../src/extensions/git/feature.cjs');assert.equal(feature.name,'gitWorkspace');
const routes=require('../src/features/chat-routes.cjs');
const git=routes.load().find(x=>x.extension==='git');assert.ok(git&&git.route.stage==='commands'&&git.route.foreground,'Git is a foreground chat route');
assert.equal(require('../src/chat-jobs.cjs').eligible('статус гита'),false,'a Git request never runs as a background job');
assert.equal(require('../src/chat-jobs.cjs').eligible('Объясни что такое git'),true);
const caps=require('../src/capabilities.cjs').catalog();assert.ok(caps.find(c=>c.id==='git-read')?.accepts('покажи diff'),'the meaning router gets git-read from the app');
assert.ok(!caps.find(c=>c.id==='git-read').accepts('git push'),'a write is not a read');
console.log('Core Git guard: '+files.length+' core files free of Git app logic ('+Object.keys(ALLOWED).length+' renderer leftovers allowed); the app owns workspace, chat route, panel and capability passed');
