// Petya's core keeps no reminders: they belong to the «Напоминания» app (src/extensions/reminders), which stores and
// fires them and shows them on «Навыки» through its own tab (extension.json "ui"). Fails when a core file
// (src/*.cjs, src/features/*.cjs apart from the extension plumbing, src/ui) has reminder logic or reminder interface
// text, apart from the unrelated uses allowed below; and checks the pieces the core used to have are gone.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const WORDS=/напоминани|напомню|напоминалк|reminder/i;
// file → why it may use the words, and the only lines that may (a whole-file allowance has no pattern).
const ALLOWED={
 // Cross-app kinds and registries every app may provide (`reminder`, `reminder-trigger`): the extension plumbing.
 'src/features/app-links.cjs':{why:'cross-app kind names',lines:/^const (?:KINDS|REGISTRIES)=/},
 'src/ui/app-catalog.js':{why:'catalog names of cross-app kinds',lines:/^const KIND_NAMES=/},
 // Any app's notification that says it is a reminder is urgent, like an error or a meeting about to start.
 'src/features/notification-policy.cjs':{why:'urgency of app notifications',lines:/^(?:\/\/ policy \(|const URGENT=)/},
 // Slack sidebar entries that are apps, not people (Slack has a «Reminders» app there).
 'src/team-fill.cjs':{why:'Slack sidebar app names',lines:/^const NOT_PERSON=/},
 // Live checks of self-corrections («…, хотя нет, не надо») and of the polite-reminder instruction skill.
 'src/live-cases.cjs':{why:'live dialogue cases',lines:/^T\(|^skill\('polite-reminder'/}
};
const files=[];
const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel,filter);else if(filter(rel))files.push(rel);}};
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js)$/.test(e.name))files.push('src/'+e.name);
// The extension plumbing (registry, host, offers, replies, catalog data) names whatever apps declare.
walk('src/features',f=>/\.cjs$/.test(f)&&!/^src\/features\/extension-[a-z-]+\.cjs$/.test(f));
walk('src/ui',f=>/\.(?:js|html|css)$/.test(f));
const problems=[];
for(const file of files){
 const text=fs.readFileSync(path.join(root,file),'utf8');if(!WORDS.test(text))continue;
 const allowed=ALLOWED[file];
 if(allowed&&!allowed.lines)continue;
 text.split(/\r?\n/).forEach((line,i)=>{if(WORDS.test(line)&&!(allowed?.lines?.test(line.trim())))problems.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});
}
assert.deepEqual(problems,[],'Reminders belong to src/extensions/reminders; the core has none of their logic or text');
for(const file of Object.keys(ALLOWED))assert.ok(WORDS.test(fs.readFileSync(path.join(root,file),'utf8')),'remove the stale allowance for '+file);

// What the core used to have is gone: storage and scheduling, the IPC, the card, the voice-command action.
const {Learning}=require('../src/learning.cjs');
const learning=new Learning({});
assert.equal(learning.list().reminders,undefined,'no reminders in the learning state');
for(const method of ['tick','cancel'])assert.equal(typeof learning[method],'undefined','Learning.'+method+' is gone');
assert.throws(()=>learning.put({name:'x',action:'reminder',patterns:['через {delay} {message}'],output:'x'}),'no «reminder» action for voice commands');
assert.ok(!/reminderCancel/.test(fs.readFileSync(path.join(root,'src/preload.cjs'),'utf8')),'no reminder IPC in the preload');
assert.ok(!/learn-reminders/.test(fs.readFileSync(path.join(root,'src/ui/learning.js'),'utf8')),'no reminders card on «Навыки»');
assert.ok(!/напоминай/.test(fs.readFileSync(path.join(root,'src/features/recurring.cjs'),'utf8')),'recurring commands do not take «напоминай»');
assert.ok(!/напомни/.test(/const QUIET=.*/.exec(fs.readFileSync(path.join(root,'src/features/extension-offers.cjs'),'utf8'))[0]),'«напомни …» may be offered the app');
// The app owns them: its tab on «Навыки», its storage, the offer for «напомни …».
const app=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/reminders/extension.json'),'utf8'));
assert.deepEqual(app.ui.tabs.map(t=>[t.page,t.title]),[['learning','Напоминания']]);
const offers=require('../src/features/extension-offers.cjs');
const offered=text=>offers.decide(offers.candidates(text,{offers:offers.load(),settings:{}}))?.one?.offer.id||null;
assert.equal(offered('напомни в 16:00 позвонить в банк'),'reminders');
assert.equal(offered('напомни Ивану про отчёт'),null);
console.log('Core reminders guard: '+files.length+' core files free of reminder logic and text ('+Object.keys(ALLOWED).length+' unrelated uses allowed); the app owns storage, tab and offer passed');
