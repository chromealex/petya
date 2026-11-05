const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const markup=require('../src/extensions/layout/markup.cjs'),importer=require('../src/extensions/layout/import.cjs');
const editor=process.env.PETYA_UNITY_EDITOR;if(!editor)throw Error('Set PETYA_UNITY_EDITOR.');
const fontFile=process.env.PETYA_TEST_FONT||'/System/Library/Fonts/Supplemental/Arial.ttf';
const fontData=fs.readFileSync(fontFile),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=','base64');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-layout-scene-'));
for(const name of ['Assets/Editor','Packages','ProjectSettings'])fs.mkdirSync(path.join(root,name),{recursive:true});
fs.writeFileSync(path.join(root,'Packages/manifest.json'),JSON.stringify({dependencies:{'com.unity.modules.ui':'1.0.0','com.unity.modules.uielements':'1.0.0','com.unity.modules.imgui':'1.0.0','com.unity.modules.imageconversion':'1.0.0'}}));
fs.writeFileSync(path.join(root,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: '+(process.env.PETYA_UNITY_VERSION||'6000.3.15f1')+'\n');
const b=(x,y,width,height)=>({x,y,width,height});
const figma={id:'root',name:'Responsive card',layoutMode:'VERTICAL',paddingLeft:16,paddingRight:16,paddingTop:16,paddingBottom:16,itemSpacing:12,absoluteBoundingBox:b(100,200,320,240),children:[
 {id:'image',name:'Image',layoutSizingHorizontal:'FILL',absoluteBoundingBox:b(116,216,288,80)},
 {id:'text',type:'TEXT',characters:'Hello Unity',layoutSizingHorizontal:'FILL',absoluteBoundingBox:b(116,308,288,40),style:{fontFamily:'Arial',fontWeight:400,fontSize:24},fills:[{type:'SOLID',color:{r:1,g:0,b:0,a:1}}]},
 {id:'footer',name:'Footer',layoutPositioning:'ABSOLUTE',constraints:{horizontal:'STRETCH',vertical:'MAX'},absoluteBoundingBox:b(116,400,288,24)}]};
const zeplin={id:'root',name:'Responsive card',rect:b(0,0,320,240),layout:{direction:'column',gap:12,padding:{left:16,right:16,top:16,bottom:16}},layers:[
 {id:'image',rect:b(16,16,288,80),constraints:{horizontal:{sizing_mode:'stretch'}}},
 {id:'text',content:'Hello Unity',rect:b(16,108,288,40),constraints:{horizontal:{sizing_mode:'stretch'}},text_styles:[{style:{font_family:'Arial',font_weight:400,font_size:24,color:{r:255,g:0,b:0,a:1}}}]}]};
const complex=process.env.PETYA_LAYOUT_COMPLEX==='1'?require('./fixtures/layout-complex.cjs'):null;
let methods='',calls='',index=0;
for(const [provider,fixture] of Object.entries(complex?{complex:complex.root}:{figma,zeplin})){
 const format=provider==='complex'?'figma':provider,fonts={},images={},files=[{name:'images/image-0.png',data:png}];
 function visit(n){const f=markup.font(n,format);if(f&&!fonts[f.key]){fonts[f.key]='fonts/font-'+f.key+'.ttf';files.push({name:fonts[f.key],data:f.weight>=700?fs.readFileSync(process.env.PETYA_TEST_FONT_BOLD||'/System/Library/Fonts/Supplemental/Arial Bold.ttf'):fontData});}if(n.id==='image'||n.fills?.some(p=>p.type==='IMAGE'))images[n.id]='images/image-0.png';for(const c of markup.children(n))visit(c);}visit(fixture);
 const design=markup.generate(fixture,format,{images,fonts});
 const id=String(++index).padStart(32,'0');files.push({name:'layout.uxml',data:Buffer.from(design.uxml)});
 fs.writeFileSync(path.join(root,provider+'.json'),JSON.stringify(fixture,null,2));
 let upload='';for(const file of files)for(let offset=0;offset<file.data.length;offset+=24000){const name='Upload_'+index+'_'+offset+'_'+file.name.replace(/[^a-zA-Z0-9]/g,'_');methods+=`static object ${name}(){${importer.uploadCode(id,file.name,file.data.subarray(offset,offset+24000),offset)}}\n`;upload+=`${name}();\n`;}
 methods+=`static object Import_${provider}(){${importer.sceneCode(id,design,files.map(f=>({name:f.name,hash:createHash('sha256').update(f.data).digest('hex')})))}}\n`;
 calls+=upload+`Import_${provider}(); Attach("${provider}","Assets/PetyaLayouts/Layout-${id}");\n`;
}
const template=fs.readFileSync(path.join(__dirname,complex?'fixtures/layout-complex-check.cs.txt':'fixtures/layout-scene-check.cs.txt'),'utf8');
fs.writeFileSync(path.join(root,'Assets/Editor/LayoutSceneCheck.cs'),template.replace('/* METHODS */',methods).replace('/* CALLS */',calls).replace('/* IDS */',complex?Object.entries(complex.elements).map(([k,v])=>'['+JSON.stringify(k)+']='+JSON.stringify(v)).join(','):''));
console.log('Scene verification project: '+root);
const result=spawnSync(editor,['-batchmode','-projectPath',root,'-executeMethod','LayoutSceneCheck.Run','-logFile',path.join(root,'editor.log')],{timeout:240000,stdio:'inherit'});
const report=path.join(root,'verification.txt');if(fs.existsSync(report))console.log(fs.readFileSync(report,'utf8'));
if(result.error||result.status!==0||!fs.existsSync(report)||!fs.readFileSync(report,'utf8').startsWith('PASS'))throw Error('Scene verification failed; inspect '+root);
