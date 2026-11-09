// Petya's core knows no meeting app: Zoom lives only in src/extensions/zoom, Google Meet in src/extensions/google-meet,
// Microsoft Teams in src/extensions/teams, and they plug in through generic interfaces (meeting sources, app links).
// Fails when a core file (src/*.cjs, src/features/*.cjs, anything in src/ui) or another extension (the calendar
// included) mentions one of them, apart from the uses allowed below that have nothing to do with the meeting app.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
// file → why it may say «zoom», and the only lines that may (a whole-file allowance has no pattern).
const ALLOWED={
 // The one-time migration reads the old Zoom-named settings keys, memory labels and extension id.
 'src/meeting-migration.cjs':{why:'migration of old keys'},
 // A bundled three.js build: camera zoom of the 3D model viewer.
 'src/ui/model-viewer.html':{why:'3D viewer camera zoom',lines:/zoom/i},
 // Slack sidebar entries that are apps, not people (Slack shows a «Zoom» app there).
 'src/team-fill.cjs':{why:'Slack sidebar app names',lines:/^const NOT_PERSON=/},
 // «Открой Zoom»: desktop apps Petya can open by name, next to Slack, Chrome, Figma.
 'src/computer-intent.cjs':{why:'desktop app names to open',lines:/^const APPS=/},
 // Image zoom in file previews.
 'src/extensions/files/file-previews.js':{why:'image zoom',lines:/const zoom=el\(|zoom\.(?:type|title|onclick|textContent)|tools\.append\(info,zoom\)/},
 // Page zoom of the main window, so the chat browser's page lines up with its panel.
 'src/features/chat-browser.cjs':{why:'window page zoom',lines:/getZoomFactor\(\)/},
 'src/extensions/files/file-previews.css':{why:'image zoom cursor',lines:/cursor:zoom-(?:in|out)/}
};
const files=[];
const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel,filter);else if(filter(rel))files.push(rel);}};
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js|ps1)$/.test(e.name))files.push('src/'+e.name);
walk('src/features',f=>/\.cjs$/.test(f));
walk('src/ui',()=>true);
// Other extensions must not special-case Zoom either: only providers and meeting sources know their own app.
walk('src/extensions',f=>!f.startsWith('src/extensions/zoom/')&&/\.(?:cjs|js|json|html|css)$/.test(f));
const problems=[];
for(const file of files){
 const text=fs.readFileSync(path.join(root,file),'utf8');if(!/zoom/i.test(text))continue;
 const allowed=ALLOWED[file];
 if(allowed&&!allowed.lines)continue;
 text.split(/\r?\n/).forEach((line,i)=>{if(/zoom/i.test(line)&&!(allowed?.lines?.test(line.trim())))problems.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});
}
assert.deepEqual(problems,[],'Zoom belongs to src/extensions/zoom; core and other extensions use meeting sources and app links');
// The allowlist itself stays honest: every allowed file still exists and still needs the allowance.
for(const file of Object.keys(ALLOWED))assert.ok(/zoom/i.test(fs.readFileSync(path.join(root,file),'utf8')),'remove the stale allowance for '+file);
// And the Zoom extension is really an extension: declared, off by default, providing the generic capabilities.
const zoom=JSON.parse(fs.readFileSync(path.join(root,'src/extensions/zoom/extension.json'),'utf8'));
assert.equal(zoom.id,'zoom');assert.equal(zoom.setting,'extension_zoom');assert.equal(zoom.category,'meetings');
assert.deepEqual(Object.keys(zoom.provides).sort(),['meeting-recording','meeting-source','video-meeting']);
assert.equal(require('../src/extensions/zoom/feature.cjs').defaults.extension_zoom,'false','not installed for new users');
assert.ok(!fs.existsSync(path.join(root,'src/extensions/zoom-bot')),'the old extension directory is gone');

// Google Meet and Microsoft Teams are extensions too (src/extensions/google-meet, src/extensions/teams): the core and
// every other extension, the calendar included, know neither by name, nor their links, nor their calendar fields.
// The calendar only asks video-meeting providers (app links: run, prepareEvent, recognizeLink).
const VIDEO=/google[\s-]?meet|meet\.google|hangout|microsoft[\s-]?teams|teams\.(?:microsoft|live)|teamsforbusiness|onlineMeetingProvider|isOnlineMeeting|тимс|extension_(?:google-meet|teams)/i;
const VIDEO_WORDS=/\bMeet\b|\bTeams\b|['"](?:google-meet|teams)['"]/;
const VIDEO_ALLOWED={
 // The one-time migration adds the two extensions for calendar users.
 'src/meeting-migration.cjs':{why:'migration of calendar users to the video apps'}
};
const videoFiles=[];
for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js|ps1)$/.test(e.name))videoFiles.push('src/'+e.name);
{const all=files.length;files.length=0;walk('src/features',f=>/\.cjs$/.test(f));walk('src/ui',()=>true);walk('src/extensions',f=>!/^src\/extensions\/(?:google-meet|teams|vk-teams)\//.test(f)&&/\.(?:cjs|js|json|html|css)$/.test(f));videoFiles.push(...files);files.length=all;}
// VK Teams is another product (a messenger, src/extensions/vk-teams, which names Microsoft Teams only to avoid it):
// its names, also as written in regular expressions, are not Microsoft Teams.
const VK_TEAMS=/(?:vk|вк)(?:\\s\*|\\s|[\s-])*(?:teams|тимс(?:\\p\{L\}\*|\p{L}*))|vk-teams|vkTeams|вктимс/giu;
const videoProblems=[];
for(const file of videoFiles){
 const text=fs.readFileSync(path.join(root,file),'utf8').replace(VK_TEAMS,'');if(!VIDEO.test(text)&&!VIDEO_WORDS.test(text))continue;
 if(VIDEO_ALLOWED[file])continue;
 text.split(/\r?\n/).forEach((line,i)=>{if(VIDEO.test(line)||VIDEO_WORDS.test(line))videoProblems.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});
}
assert.deepEqual(videoProblems,[],'Google Meet and Teams belong to their extensions; core and other extensions use video-meeting providers and meeting sources');
for(const file of Object.keys(VIDEO_ALLOWED)){const text=fs.readFileSync(path.join(root,file),'utf8');assert.ok(VIDEO.test(text)||VIDEO_WORDS.test(text),'remove the stale allowance for '+file);}
for(const [id,setting] of [['google-meet','extension_google-meet'],['teams','extension_teams']]){
 const d=JSON.parse(fs.readFileSync(path.join(root,'src/extensions',id,'extension.json'),'utf8'));
 assert.equal(d.id,id);assert.equal(d.setting,setting);assert.equal(d.category,'meetings');
 assert.deepEqual(Object.keys(d.provides).sort(),['meeting-recording','meeting-source','video-meeting']);
 assert.equal(require('../src/extensions/'+id+'/feature.cjs').defaults[setting],'false','not installed for new users: '+id);
}
assert.ok(!fs.existsSync(path.join(root,'src/extensions/calendar/video-meet.cjs'))&&!fs.existsSync(path.join(root,'src/extensions/calendar/video-teams.cjs')),'the calendar provides no video meetings of its own');
// The calendar provides no meeting capability (it is a people source for absences only).
assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'src/extensions/calendar/extension.json'),'utf8')).provides||{}).filter(k=>/meeting/.test(k)),[]);
console.log('Core meeting guard: '+files.length+' core and extension files free of Zoom outside the extension ('+Object.keys(ALLOWED).length+' unrelated uses allowed), '+videoFiles.length+' free of Google Meet and Teams outside theirs passed');
