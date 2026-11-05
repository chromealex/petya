const {randomUUID,createHash}=require('node:crypto');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {inspect,target}=require('../unity/instances.cjs');
function staging(id){if(!/^[a-f0-9]{32}$/.test(id))throw Error('Некорректный идентификатор импорта.');return 'Temp/PetyaLayout-'+id;}
function uploadCode(id,name,data,offset){
 if(!/^(?:layout\.uxml|(?:fonts|images)\/[a-zA-Z0-9-]+\.(?:ttf|otf|png|jpg))$/.test(name))throw Error('Некорректное имя ресурса.');
 if(!Number.isSafeInteger(offset)||offset<0)throw Error('Некорректное смещение.');
 return `var path = "${staging(id)}/${name}"; System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
using (var stream = new System.IO.FileStream(path, System.IO.FileMode.OpenOrCreate, System.IO.FileAccess.Write)) {
if (stream.Length != ${offset}) throw new System.InvalidOperationException("Upload offset mismatch");
stream.Position = ${offset}; var bytes = System.Convert.FromBase64String("${data.toString('base64')}"); stream.Write(bytes,0,bytes.Length); }
return true;`;
}
function sceneCode(id,design,manifest){
 const folder='Assets/PetyaLayouts/Layout-'+id,tmp=staging(id);
 const checks=manifest.map(f=>`{ var bytes=System.IO.File.ReadAllBytes("${tmp}/${f.name}"); using(var hash=System.Security.Cryptography.SHA256.Create()){if(System.BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant()!="${f.hash}")throw new System.InvalidOperationException("Asset checksum mismatch");}}`).join('\n');
 return `if(UnityEditor.EditorApplication.isPlayingOrWillChangePlaymode)throw new System.InvalidOperationException("Stop Play Mode before importing");
var scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene();if(!scene.IsValid()||!scene.isLoaded)throw new System.InvalidOperationException("Open a scene first");
${checks}
var folder="${folder}";if(System.IO.Directory.Exists(folder))throw new System.InvalidOperationException("Import already exists");
System.IO.Directory.CreateDirectory("Assets/PetyaLayouts");System.IO.Directory.Move("${tmp}",folder);
var file=folder+"/layout.uxml";System.IO.File.WriteAllText(file,System.IO.File.ReadAllText(file).Replace("__PETYA_ASSETS__","project://database/"+folder));
UnityEditor.AssetDatabase.Refresh(UnityEditor.ImportAssetOptions.ForceSynchronousImport);
foreach(var resource in System.IO.Directory.GetFiles(folder,"*",System.IO.SearchOption.AllDirectories)) {
var ext=System.IO.Path.GetExtension(resource).ToLowerInvariant();
if((ext==".ttf"||ext==".otf") && UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.Font>(resource)==null)throw new System.InvalidOperationException("Font import failed: "+resource);
if((ext==".png"||ext==".jpg") && UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.Texture2D>(resource)==null)throw new System.InvalidOperationException("Image import failed: "+resource);
}
var tree=UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.VisualTreeAsset>(file);
if(tree==null)throw new System.InvalidOperationException("UXML import failed");
var panel=UnityEngine.ScriptableObject.CreateInstance<UnityEngine.UIElements.PanelSettings>();
panel.scaleMode=UnityEngine.UIElements.PanelScaleMode.${design.responsive?'ScaleWithScreenSize':'ConstantPixelSize'};
panel.referenceResolution=new UnityEngine.Vector2Int(${Math.round(design.width)},${Math.round(design.height)});
panel.screenMatchMode=UnityEngine.UIElements.PanelScreenMatchMode.MatchWidthOrHeight;panel.match=0.5f;
UnityEditor.AssetDatabase.CreateAsset(panel,folder+"/PanelSettings.asset");
UnityEditor.Undo.IncrementCurrentGroup();var undoGroup=UnityEditor.Undo.GetCurrentGroup();UnityEditor.Undo.SetCurrentGroupName("Import Petya layout");
var go=new UnityEngine.GameObject("Petya UI ${id.slice(0,8)}");UnityEditor.Undo.RegisterCreatedObjectUndo(go,"Import Petya layout");
UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(go,scene);
var document=UnityEditor.Undo.AddComponent<UnityEngine.UIElements.UIDocument>(go);document.panelSettings=panel;document.visualTreeAsset=tree;
UnityEditor.EditorUtility.SetDirty(panel);UnityEditor.AssetDatabase.SaveAssets();UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(scene);
UnityEditor.Selection.activeGameObject=go;UnityEditor.Undo.CollapseUndoOperations(undoGroup);
return new { folder=folder, objectName=go.name, scene=scene.path, sceneDirty=scene.isDirty };`;
}
function payload(result){
 if(result.isError)throw Error('Unity отклонила импорт: '+(result.content?.find(c=>c.type==='text')?.text||''));
 let data=result.structuredContent;if(!data){try{data=JSON.parse(result.content?.find(c=>c.type==='text')?.text);}catch{}}
 if(data?.success!==true)throw Error('Unity не подтвердила выполнение импорта.');return data.data?.result??data.data;
}
async function apply(settings,design,files,{instance,check,report,confirm,connect}={}){
 const u=new URL(settings.unityUrl);
 if(u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('Нужен локальный адрес MCP for Unity.');
 const client=connect?await connect():new Client({name:'Petya layout',version:'0.8.3'});
 try{
  if(!connect)await client.connect(new StreamableHTTPClientTransport(u,{requestInit:{redirect:'error',headers:settings.unityToken?{Authorization:'Bearer '+settings.unityToken}:{}}}),{timeout:10000});
  check();const editors=await inspect(client);check();
  if(editors){if(!instance&&editors.length>1)return {editors};instance ||= editors[0].id;if(!editors.some(e=>e.id===instance))throw Error('Редактор Unity недоступен.');}
  else if(instance)throw Error('Сервер не подтверждает выбранный редактор.');
  let cursor,found=false;const seen=new Set();do{const page=await client.listTools(cursor?{cursor}:{});check();found ||= page.tools.some(t=>t.name==='execute_code');cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw Error('Повтор страницы инструментов Unity.');seen.add(cursor);}while(cursor&&!found);
  if(!found)throw Error('Включите execute_code в MCP for Unity.');
  let identity;
  const id=randomUUID().replaceAll('-',''),bundle=[...files,{name:'layout.uxml',data:Buffer.from(design.uxml)}];
  async function execute(code){check();if(identity)code='if(UnityEngine.Application.dataPath!='+JSON.stringify(identity.project)+' || UnityEngine.SceneManagement.SceneManager.GetActiveScene().handle!='+identity.handle+')throw new System.InvalidOperationException("Project or active scene changed");\n'+code;if(instance){await target(client,instance);check();}const result=await client.callTool({name:'execute_code',arguments:{action:'execute',code,safety_checks:true}},undefined,{timeout:120000});check();return payload(result);}
  identity=await execute('var scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene(); if(!scene.IsValid()||!scene.isLoaded||UnityEditor.EditorApplication.isPlayingOrWillChangePlaymode)throw new System.InvalidOperationException("Open an editable scene"); return new {project=UnityEngine.Application.dataPath,handle=scene.handle,name=scene.name};');
  if(typeof identity?.project!=='string'||!Number.isSafeInteger(identity.handle))throw Error('Unity не подтвердила активную сцену.');
  if(!await confirm(instance,identity))throw Error('Импорт отменён.');check();
  for(const [i,file] of bundle.entries()){
   report('Передаю ресурс '+(i+1)+' из '+bundle.length+' в Unity…');
   for(let offset=0;offset<file.data.length;offset+=24000)await execute(uploadCode(id,file.name,file.data.subarray(offset,offset+24000),offset));
  }
  report('Создаю интерфейс в активной сцене Unity…');
  return {instance,...await execute(sceneCode(id,design,bundle.map(f=>({name:f.name,hash:createHash('sha256').update(f.data).digest('hex')}))))};
 }finally{await client.close();}
}
module.exports={apply,uploadCode,sceneCode,payload,staging};
