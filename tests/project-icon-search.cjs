// Project icon search inside the project folder: app icons win over random images; heavy folders are skipped.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {projectIcon,score}=require('../src/project-icon.cjs');
const native=sizes=>({createFromBuffer:buffer=>{const name=buffer.toString();return {isEmpty:()=>name==='broken',getSize:()=>sizes[name]||{width:512,height:512},resize:()=>({toDataURL:()=>'data:image/png;base64,'+Buffer.from(name).toString('base64')})};}});
const decode=url=>Buffer.from(url.split(',')[1]||'','base64').toString();
const write=async(root,file,text)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);};
(async()=>{const base=await fs.mkdtemp(path.join(os.tmpdir(),'petya-icon-search-'));try{
 // iOS AppIcon beats a deep generic image and anything in node_modules.
 const ios=path.join(base,'ios');
 await write(ios,'node_modules/pkg/app-icon.png','dependency');
 await write(ios,'docs/screens/screen.png','screenshot');
 await write(ios,'Game/Assets.xcassets/AppIcon.appiconset/Icon-1024.png','ios-icon');
 assert.equal(decode(await projectIcon(ios,native({}))),'ios-icon');
 // Android launcher in mipmap-xxxhdpi; non-square banners are rejected.
 const android=path.join(base,'android');
 await write(android,'mobile/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png','android-icon');
 await write(android,'mobile/marketing/logo.png','banner');
 assert.equal(decode(await projectIcon(android,native({banner:{width:1200,height:300}}))),'android-icon');
 // Unity: the player icon referenced from ProjectSettings by GUID.
 const unity=path.join(base,'unity');
 await write(unity,'ProjectSettings/ProjectSettings.asset','m_BuildTargetIcons:\n  - m_BuildTarget:\n    m_Icons:\n    - serializedVersion: 2\n      m_Icon: {fileID: 2800000, guid: 0123456789abcdef0123456789abcdef, type: 3}\n');
 await write(unity,'Assets/Art/UI/game_mark.png','unity-icon');await write(unity,'Assets/Art/UI/game_mark.png.meta','fileFormatVersion: 2\nguid: 0123456789abcdef0123456789abcdef\n');
 await write(unity,'Assets/Art/UI/button_icon.png','button');
 assert.equal(decode(await projectIcon(unity,native({}))),'unity-icon');
 // Nothing that looks like an icon → no icon.
 const none=path.join(base,'none');await write(none,'src/photo.png','photo');
 assert.equal(await projectIcon(none,native({})),'');
 assert.ok(score('a/AppIcon.appiconset/x.png')>score('favicon.png'));assert.equal(score('img/arrow_icon.png'),0);
 console.log('Project icon search: AppIcon, Android launcher, Unity player icon, skipped dependencies, shape filter passed');
}finally{await fs.rm(base,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
