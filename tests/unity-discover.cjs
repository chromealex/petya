// Unity found by itself: the first local address that answers; Petya's project folders scanned for Unity projects
// (also one or two levels down); «Подключить» adds MCP for Unity to Packages/manifest.json, keeping the file's style.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const d=require('../src/extensions/unity/discover.cjs');
const unity=require('../src/extensions/unity/desktop.cjs');
(async()=>{
 const asked=[];
 const found=await d.server({saved:'http://127.0.0.1:9999/mcp',probe:async url=>{asked.push(url);return url==='http://localhost:8080/mcp'?{editors:[{id:'BW@1',name:'BW'}]}:null;}});
 assert.equal(found.url,'http://localhost:8080/mcp');assert.equal(asked[0],'http://127.0.0.1:9999/mcp','the saved address first');
 assert.equal(await d.server({probe:async()=>null}),null);
 // An empty address is the usual one, not «Invalid URL».
 const settings={unityUrl:'  '};unity.validate(settings);assert.equal(settings.unityUrl,'http://127.0.0.1:8080/mcp');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-unity-'));
 try{
  const game=path.join(root,'repo','Client');fs.mkdirSync(path.join(game,'ProjectSettings'),{recursive:true});fs.mkdirSync(path.join(game,'Packages'));
  fs.writeFileSync(path.join(game,'ProjectSettings','ProjectSettings.asset'),'x');
  fs.writeFileSync(path.join(game,'Packages','manifest.json'),'{\n    "dependencies": {\n        "com.unity.ugui": "1.0.0"\n    }\n}\n');
  let rows=d.projects([{id:'bw',name:'BW',folders:[path.join(root,'repo')]}]);
  assert.equal(rows.length,1);assert.equal(rows[0].root,game);assert.equal(rows[0].name,'repo');assert.equal(rows[0].installed,false);
  assert.deepEqual(d.install(game),{installed:true,changed:true});
  const text=fs.readFileSync(path.join(game,'Packages','manifest.json'),'utf8');
  assert.match(text,/\n {8}"com\.coplaydev\.unity-mcp": "https:\/\/github\.com\/CoplayDev\/unity-mcp\.git\?path=\/MCPForUnity#main"/);
  assert.equal(d.projects([{id:'bw',name:'BW',folders:[path.join(root,'repo')]}])[0].installed,true);
  assert.deepEqual(d.install(game),{installed:true,changed:false});
  assert.throws(()=>d.install(root),/не проект Unity/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 console.log('Unity discovery: saved address first, usual ports, empty address, nested Unity projects, package install passed');
})().catch(e=>{console.error(e);process.exit(1);});
