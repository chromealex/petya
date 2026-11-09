// Petya's core keeps no Slack or Telegram service: the Slack app (src/extensions/slack) owns the sync, the open-window
// reader, «Попроси команду …», «Что нового в Slack?», the Slack log discussion, report sharing, the Slack profiles of
// the team fill, the connection card and the Slack row on «Команда»; the Telegram app (src/extensions/telegram) owns
// its source, login IPC, sync, media and the answer context. They plug in through registries only: background jobs
// (src/features/service-jobs.cjs), chat routes and answer contexts (src/features/chat-routes.cjs), media sources
// (src/media-sources.cjs), team sources (src/team-sources.cjs), tool-router capabilities (src/capabilities.cjs), the
// connection card registry (window.petyaConnections) and team identities (window.petyaTeamIdentities).
// Fails when
//  - a core file this lane cleaned names Slack or Telegram outside the allowed lines below (each with why), or
//  - any core file (src/*.cjs|js, src/features/*.cjs, src/ui) requires the Slack or Telegram app's code, apart from
//    the allowed requires (features of other lanes that still read Slack threads), or
//  - the old core modules come back.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const WORDS=/slack|слак|telegram|телеграм/iu;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

// 1. The old core modules are gone.
for(const file of ['src/slack.cjs','src/slack-context.cjs','src/slack-channel-route.cjs','src/slack-recipients.cjs','src/slack-request.cjs','src/slack-digest.cjs','src/slack-log.cjs','src/slack-team.cjs','src/slack-setup.cjs','src/slack-view.ps1','src/report-share.cjs','src/telegram.cjs','src/telegram-setup.cjs','src/features/slack-open.cjs','src/features/slack-screen.cjs','src/features/jira-slack-people.cjs','src/ui/report-share.js'])
 assert.equal(fs.existsSync(path.join(root,file)),false,file+' moved into its app');

// 2. Files this lane cleaned: no Slack or Telegram outside these lines.
const CLEAN={
 'src/converse.cjs':[
  // Computer control's Telegram contact search renders its own cards (computer-control lane, not moved here).
  /extensions\/telegram\/contact-result\.cjs/,
  // The build repair flow copies the source thread of the chat it continues (build cluster, not moved here).
  /repairSource:previousTopic\?\.repairSource,slackSource/],
 'src/main.cjs':[
  // The shared OAuth clients of the connection layer (src/service-oauth.cjs), like the mail connection.
  /new ServiceOAuth\('slack'/,
  // The speech recognizer's default vocabulary of product names.
  /whisperVocabulary: 'Петя, Jira, Confluence, Asana, Slack/,
  // A material added by hand may be labelled as a Slack conversation (the «Добавить текст» form).
  /source: \['Встреча', 'Slack', 'Asana'/,
  // The request pipeline's readable message for HTTP 429 from slack.com.
  /hostname === 'slack\.com'|slack\\\.com\$/,
  // IPC names the window calls (kept so the window and the apps need no other change).
  /const projectOperations=new Set\(\[/,
  // Build watchers of Slack threads (build cluster: build-watch, build-question, build-repair, review-assistant).
  /buildWatch=new|reviewAssistant=new|buildQuestion=new|new repairSourcesModule\.RepairSources/,
  // The team record's Slack member id (team data model, src/team.cjs).
  /m\.slackId/,
  // Project memory binds Slack channels per account (src/project-memory.cjs, src/chat-project-context.cjs).
  /slackAccount/,
  // The company icon is read from the Slack workspace or Jira (src/company-icon.cjs, not moved here).
  /\/\/ Company icon: Slack workspace/],
 'src/preload.cjs':[/^const calls = \[/],
 'src/features.cjs':[],'src/dialogue-answer.cjs':[],'src/intent-router.cjs':[],
 'src/dialogue-request.cjs':[/const standaloneKnowledge=/],
 // An undo restores the chat's source thread with the other chat fields.
 'src/chat-tools.cjs':[/const fields=\[/],
 'src/attachments-setup.cjs':[],'src/media-sources.cjs':[],'src/team-sources.cjs':[],'src/context-reference.cjs':[],
 'src/computer-setup.cjs':[/extensions\/telegram\/contact-result\.cjs/],
 // The extraction prompt's field list and the profiles' key read by src/team-fill.cjs (team data model).
 'src/team-fill-setup.cjs':[/"slackId":"ID"/,/out\.slack=profiles/],
 // Project memory binds Slack channels to projects (src/project-memory.cjs, not moved here).
 'src/capabilities.cjs':[/id:'project-memory'/],
 'src/features/service-jobs.cjs':[],'src/features/chat-routes.cjs':[],'src/features/extension-offers.cjs':[],'src/features/extension-replies.cjs':[],
 'src/ui/notifications.js':[],'src/ui/background.js':[],'src/ui/chat-browser.js':[],'src/ui/connections.js':[],'src/ui/team.js':[],'src/ui/app.js':[],
 // The module switches of the connections page.
 'src/ui/modules.js':[/^const optionalModules =/],
 // The «Добавить текст» form's source label for a pasted Slack conversation; computer control's example request.
 'src/ui/index.html':[/<option value="Slack">Переписка Slack<\/option>/,/В Телеграме найди мне контакт Васи/]
};
const problems=[];
for(const [file,allowed] of Object.entries(CLEAN)){
 read(file).split(/\r?\n/).forEach((line,i)=>{if(WORDS.test(line)&&!allowed.some(re=>re.test(line)))problems.push(file+':'+(i+1)+': '+line.trim().slice(0,160));});
}
assert.deepEqual(problems,[],'Slack and Telegram belong to their apps; these core files name them outside the allowed lines');

// 3. No core file loads the apps' code, apart from features of other lanes that still read Slack threads.
const REQUIRES={
 // Build watchers and the build repair read Slack thread links and logs (build cluster, a later lane).
 'src/build-watch.cjs':'build cluster','src/build-question.cjs':'build cluster','src/build-repair.cjs':'build cluster','src/build-repair-sources.cjs':'build cluster',
 // The connection check of the Slack card resolves the chosen channels (connection layer, like the mail connection).
 'src/connections.cjs':'connection layer',
 // Computer control's Telegram contact search (computer-control lane).
 'src/converse.cjs':'computer control','src/computer-setup.cjs':'computer control','src/computer-intent.cjs':'computer control'
};
const files=[];
const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel,filter);else if(filter(rel))files.push(rel);}};
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js)$/.test(e.name))files.push('src/'+e.name);
walk('src/features',f=>/\.cjs$/.test(f));
walk('src/ui',f=>/\.(?:js|html)$/.test(f));
const loads=[];
for(const file of files)read(file).split(/\r?\n/).forEach((line,i)=>{if(/require\(\s*['"`][^'"`]*(?:slack|telegram)[^'"`]*['"`]/i.test(line)&&!REQUIRES[file])loads.push(file+':'+(i+1));});
assert.deepEqual(loads,[],'core files load Slack or Telegram code');

// 4. The apps own it and plug in through the registries.
const slack=JSON.parse(read('src/extensions/slack/extension.json')),telegram=JSON.parse(read('src/extensions/telegram/extension.json'));
assert.equal(slack.setting,'module_slack');assert.equal(telegram.setting,'module_telegram');
assert.equal(slack.feature,'feature.cjs');assert.equal(telegram.feature,'feature.cjs');
for(const kind of ['chat-route','media-source','team-source','capability','messenger-source','share-message'])assert.ok(slack.provides[kind],'Slack provides '+kind);
for(const kind of ['chat-route','answer-context','media-source','capability','messenger-source'])assert.ok(telegram.provides[kind],'Telegram provides '+kind);
assert.ok(slack.scripts.some(([file])=>file==='settings.js')&&slack.scripts.some(([file])=>file==='team-identity.js')&&slack.scripts.some(([file])=>file==='report-share.js'),'the Slack card, the «Команда» row and the report panel are the app\'s scripts');
const slackFeature=require('../src/extensions/slack/feature.cjs'),telegramFeature=require('../src/extensions/telegram/feature.cjs');
assert.deepEqual(slackFeature.secrets,['slackCredential','slackToken'],'the same setting keys: saved connections keep working');
assert.deepEqual(Object.keys(slackFeature.defaults).sort(),['slackAutoSync','slackChannels','slackCredential','slackInterval','slackToken']);
assert.deepEqual(telegramFeature.secrets,['telegramCredential']);assert.deepEqual(Object.keys(telegramFeature.defaults).sort(),['telegramAutoSync','telegramCredential']);
const links=require('../src/features/app-links.cjs');
for(const kind of ['chat-route','answer-context','media-source','team-source','capability'])assert.ok(links.REGISTRIES.includes(kind),kind+' is a registry');
const routes=require('../src/features/chat-routes.cjs').routes().map(r=>r.extension+':'+r.provider.stage).sort();
assert.deepEqual(routes,['slack:digest','slack:media','slack:people','slack:reference','slack:screen','slack:send','telegram:media','telegram:sync']);
assert.deepEqual(require('../src/features/chat-routes.cjs').contexts().map(c=>c.extension+':'+c.provider.key),['telegram:telegramContext']);

// 5. Without the apps their requests are not the core's: no route, no capability, no media.
const chat=require('../src/features/chat-routes.cjs').create({settings:{module_slack:'false',module_telegram:'false'}});
(async()=>{
 for(const stage of chat.stages)assert.equal(await chat.run(stage,'Что нового в Slack?',{}),null,stage);
 assert.equal(await chat.answerContext('Что писали в телеграме?',{}),null);
 const capabilities=require('../src/capabilities.cjs');
 assert.ok(!capabilities.catalog({module_slack:'false'}).some(c=>c.id==='slack-digest'));assert.ok(capabilities.catalog({module_slack:'true'}).some(c=>c.id==='slack-digest'));
 assert.equal(capabilities.owned('Что нового в Slack?',{module_slack:'false'}),false);assert.equal(capabilities.owned('Что нового в Slack?',{module_slack:'true'}),true);
 assert.equal(require('../src/media-sources.cjs').candidates([{id:'slack:C1:1.0',source:'Slack',channel:'C1',messages:[{ts:'1.0',at:1,files:[{id:'F',name:'a.png'}]}]}],{module_slack:'false'}).length,0);
 console.log('Core Slack/Telegram guard: '+files.length+' core files load no Slack or Telegram code, '+Object.keys(CLEAN).length+' cleaned files name them only on allowed lines; the apps own sync, routes, media, team source, settings and team row passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
