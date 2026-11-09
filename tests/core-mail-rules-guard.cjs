// Petya's core keeps no mail rules: «Почтовые правила» (how Petya checks mail — taught with «Научись проверять почту»)
// belong to the «Почта» app (src/extensions/mail): its engine (rules.cjs), its storage (rules.json, migrated from the
// learned-skills state), its tab on «Навыки» and its points on «Развитие» (growth-source). Fails when a core file
// (src/*.cjs|js, src/features/*.cjs apart from the extension plumbing, src/ui) has mail rule logic or interface text.
// The mail connection (Google / Microsoft accounts) stays a Petya connection and is not checked here.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const WORDS=/почтов[а-яё]*\s+(?:правил|навык|сценари)|mail-?skill|mailDraft|Научись проверять почту/iu;
const files=[];
const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel,filter);else if(filter(rel))files.push(rel);}};
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js)$/.test(e.name))files.push('src/'+e.name);
walk('src/features',f=>/\.cjs$/.test(f)&&!/^src\/features\/extension-[a-z-]+\.cjs$/.test(f));
walk('src/ui',f=>/\.(?:js|html|css)$/.test(f));
const problems=[];
for(const file of files){
 const text=fs.readFileSync(path.join(root,file),'utf8');
 text.split(/\r?\n/).forEach((line,i)=>{if(WORDS.test(line))problems.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});
}
assert.deepEqual(problems,[],'Mail rules belong to src/extensions/mail; the core has none of their logic or text');

// What the core used to have is gone: the engine, the IPC, the card on «Навыки», the learned-skills field, the scoring.
assert.equal(fs.existsSync(path.join(root,'src/mail-skill.cjs')),false,'the engine moved to src/extensions/mail/rules.cjs');
assert.equal(fs.existsSync(path.join(root,'src/ui/mail-skills.js')),false,'the core renderer keeps only the mail connection');
const {Learning}=require('../src/learning.cjs');
assert.equal(new Learning({}).list().recipes,undefined,'no mail rules in the learned-skills state');
assert.equal(new Learning({state:{version:1,skills:[],recipes:[{id:'x'}]}}).take('recipes')?.[0]?.id,'x','the app can take the old field');
assert.ok(!/mailSkill/.test(fs.readFileSync(path.join(root,'src/preload.cjs'),'utf8')),'no mail rule IPC in the preload');
assert.ok(!/skipPromotions|recipes/.test(fs.readFileSync(path.join(root,'src/growth.cjs'),'utf8')),'growth knows no mail rules');
assert.ok(!/mail-skill-form|mail-skills-list/.test(fs.readFileSync(path.join(root,'src/ui/mail-connection.js'),'utf8')),'no mail rules form in the core');
// The app owns them: the tab, the engine, the points.
const app=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/mail/extension.json'),'utf8'));
assert.deepEqual(app.ui.tabs.map(t=>[t.page,t.title]),[['learning','Почтовые правила']]);
assert.equal(app.setting,'module_gmail','the tab follows «Почта» in the catalog');
assert.equal(app.provides['growth-source'],'growth-source.cjs');
assert.equal(typeof require('../src/extensions/mail/rules.cjs').MailRules,'function');
console.log('Core mail rules guard: '+files.length+' core files free of mail rule logic and text; the app owns engine, storage, tab and growth passed');
