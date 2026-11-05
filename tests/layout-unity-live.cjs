const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const markup=require('../src/extensions/layout/markup.cjs');
const editor=process.env.PETYA_UNITY_EDITOR;
if(!editor)throw Error('Set PETYA_UNITY_EDITOR to the Unity executable. This test creates an isolated temporary project.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-layout-unity-'));
fs.mkdirSync(path.join(root,'Assets/Editor'),{recursive:true});fs.mkdirSync(path.join(root,'Packages'));fs.mkdirSync(path.join(root,'ProjectSettings'));
fs.writeFileSync(path.join(root,'Packages/manifest.json'),JSON.stringify({dependencies:{'com.unity.modules.ui':'1.0.0','com.unity.modules.uielements':'1.0.0','com.unity.modules.imgui':'1.0.0'}}));
fs.writeFileSync(path.join(root,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: '+(process.env.PETYA_UNITY_VERSION||'6000.3.15f1')+'\n');
const box=(x,y,width,height)=>({x,y,width,height});
const figma={name:'Card',absoluteBoundingBox:box(100,200,320,240),fills:[{type:'SOLID',color:{r:.1,g:.2,b:.3,a:1}}],children:[{name:'Panel',absoluteBoundingBox:box(120,230,280,180),children:[{name:'Title',characters:'Hello Unity',absoluteBoundingBox:box(136,246,220,32),style:{fontSize:24},fills:[{type:'SOLID',color:{r:1,g:0,b:0,a:1}}]}]}]};
const zeplin={name:'Card',rect:box(0,0,320,240),layers:[{name:'Panel',rect:box(20,30,280,180),layers:[{name:'Title',content:'Hello Unity',rect:box(16,16,220,32),text_styles:[{range:{location:0,length:11},style:{font_size:24,color:{r:255,g:0,b:0,a:1}}}]}]}]};
let methods='',calls='';
for(const [name,fixture] of Object.entries({figma,zeplin})){
 const result=markup.generate(fixture,name,{responsive:false});
 fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(fixture,null,2));
 methods+=`static string Import_${name}(){${markup.code(result.uxml)}}\n`;
 calls+=`Attach("${name}", Import_${name}());\n`;
}
const template=fs.readFileSync(path.join(__dirname,'fixtures/layout-unity-check.cs.txt'),'utf8');
fs.writeFileSync(path.join(root,'Assets/Editor/LayoutCheck.cs'),template.replace('/* IMPORT_METHODS */',methods).replace('/* IMPORT_CALLS */',calls));
console.log('Unity verification project: '+root);
const result=spawnSync(editor,['-batchmode','-projectPath',root,'-executeMethod','LayoutCheck.Run','-logFile',path.join(root,'editor.log')],{timeout:240000,stdio:'inherit'});
const report=path.join(root,'verification.txt');
if(fs.existsSync(report))console.log(fs.readFileSync(report,'utf8'));
if(result.error||result.status!==0||!fs.existsSync(report)||!fs.readFileSync(report,'utf8').startsWith('PASS'))throw Error('Live Unity verification failed; inspect '+path.join(root,'editor.log'));
