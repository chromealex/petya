// Learning from the chat: recurring commands, skills with files (installed, from a project folder), Petya's own
// words on the growth page that the user can rewrite.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const recurring=require('../src/features/recurring.cjs');
const now=Date.parse('2026-11-07T10:00:00');
const r=recurring.parse('Проверяй почту каждые 5 минут',now);assert.equal(r.command,'Проверь почту');assert.equal(r.every,300000);assert.equal(r.next,now+300000);
assert.equal(recurring.describe(r),'каждые 5 минут');
const daily=recurring.parse('каждый день в 18:30 показывай закрытые задачи',now);assert.deepEqual(daily.daily,{h:18,m:30});assert.equal(daily.command,'Покажи закрытые задачи');assert.equal(new Date(daily.next).getHours(),18);
assert.equal(recurring.parse('Каждое утро присылай сводку',now).daily.h,9);
assert.match(recurring.parse('проверяй почту каждые 10 секунд',now).error,/раза в минуту/);
for(const t of ['Как проверять почту каждые 5 минут?','напомни через 5 минут позвонить','Расскажи про погоду'])assert.equal(recurring.parse(t,now),null,t);
assert.deepEqual(recurring.matchStop('перестань проверять почту',[{command:'Проверь почту'},{command:'Проверь слак'}]).map(i=>i.command),['Проверь почту']);
// The chat side through the feature, with a fake chat runner.
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-learn-'));
 try{
  const said=[];const state={projects:[{id:'general',name:'Общее'}],activeProjectId:'general',topics:[]};
  const started=[];const s={dataRoot:dir,smoke:true,dialogue:{state,active:()=>null,persist(){},rememberAction:(c,t)=>said.push(t)},chatJobs:{busy:()=>false,start:(id,p,c)=>{started.push([id,c]);return {};}}};
  const {recurring:chat,ipc}=recurring.setup(s);
  const reply=chat.turn('Проверяй почту каждые 5 минут');assert.match(reply.text,/каждые 5 минут/);
  const [item]=ipc.list();assert.equal(item.command,'Проверь почту');assert.ok(state.topics.some(t=>t.id===item.topicId&&/По расписанию/.test(t.title)));
  ipc.runNow(item.id);assert.deepEqual(started[0],[item.topicId,'Проверь почту']);
  assert.match(chat.turn('какие у меня повторы').text,/Проверь почту/);
  assert.match(chat.turn('перестань проверять почту').text,/Больше не повторяю/);assert.equal(ipc.list().length,0);
  // Installed skills: a folder and a zip with scripts; SKILL.md one folder down.
  const installed=require('../src/skill-library/installed.cjs'),root=path.join(dir,'packages');
  const src=path.join(dir,'src','release');fs.mkdirSync(path.join(src,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(src,'SKILL.md'),'---\nname: Release-Notes\ndescription: Писать релиз-ноты для стора по списку задач\n---\nСмотри scripts/build.py');fs.writeFileSync(path.join(src,'scripts','build.py'),'print(1)');
  const one=installed.install(root,path.join(dir,'src'),new Set());assert.equal(one.name,'release-notes');assert.deepEqual(one.files,[path.join('scripts','build.py')]);assert.match(one.body,/Файлы скилла/);
  const zip=(entries)=>{const parts=[],dirs=[];let offset=0;for(const [name,text] of entries){const data=zlib.deflateRawSync(Buffer.from(text)),n=Buffer.from(name),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(Buffer.byteLength(text),22);h.writeUInt16LE(n.length,26);parts.push(h,n,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt32LE(Buffer.byteLength(text),24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);dirs.push(c,n);offset+=30+n.length+data.length;}
   const cd=Buffer.concat(dirs),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([...parts,cd,e]);};
  const archive=path.join(dir,'qa.skill');fs.writeFileSync(archive,zip([['qa/SKILL.md','---\nname: qa-check\ndescription: Проверить сборку перед релизом по чек-листу\n---\nЧек-лист в checklist.md'],['qa/checklist.md','- логин'],['qa/config.json','{"a":1}']]));
  const two=installed.install(root,archive,new Set(['qa-check']));assert.equal(two.name,'my-qa-check');assert.deepEqual(two.files,['checklist.md','config.json']);assert.match(two.body,/логин/,'referenced texts reach the model');
  fs.writeFileSync(archive,zip([['../evil/SKILL.md','x']]));assert.throws(()=>installed.install(root,archive),/Небезопасный путь/);
  assert.deepEqual(installed.remove(root,'release-notes').map(s=>s.name),['my-qa-check']);
  // Project skills: <root>/.claude/skills/*/SKILL.md, a built-in name gets a prefix.
  const project=path.join(dir,'game');fs.mkdirSync(path.join(project,'.claude','skills','bug-report'),{recursive:true});
  fs.writeFileSync(path.join(project,'.claude','skills','bug-report','SKILL.md'),'---\nname: bug-report\ndescription: Наш формат баг-репортов для игры\n---\nПиши шаги.');
  const own=require('../src/skill-library/project-skills.cjs').forProject({id:'p',folders:[project]},new Set(['bug-report']));
  assert.deepEqual(own.map(s=>s.name),['project-bug-report']);assert.ok(own[0].project);
  // Growth: Petya's words, the user's rewrite, extra knowledge from the chat counts.
  const {Learning}=require('../src/learning.cjs');const learning=new Learning({});
  learning.putRule({from:'мобилка',to:'проект MOBILE',kind:'alias',origin:'chat'});
  let g=learning.growth([{key:'recurring:1',title:'Проверь почту',points:15,at:1,source:'Повторяющаяся команда из чата',learned:'Сам проверяю почту.'}]);
  const rule=g.events.find(e=>e.collection==='dictionary');assert.match(rule.learned,/для меня теперь означает/);assert.equal(rule.source,'Исправление в чате');assert.equal(g.xp,25);
  g=learning.growthNote(rule.key,'Мобилкой вы зовёте проект MOBILE.');assert.equal(g.events.find(e=>e.key===rule.key).learned,'Мобилкой вы зовёте проект MOBILE.');
  g=learning.growthNote(rule.key,'');assert.match(g.events.find(e=>e.key===rule.key).learned,/означает/);
  console.log('learning from the chat: recurring commands, skills with files and from projects, growth in Petya\'s words passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
