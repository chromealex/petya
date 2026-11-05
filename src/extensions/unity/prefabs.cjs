const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { z } = require('zod');
const guid = z.string().regex(/^[0-9a-f]{32}$/i);
const tools = {
  find_prefabs: { description:'Найти префабы по имени в Assets подключённого проекта Unity.', schema:z.object({query:z.string().trim().min(1).max(160)}).strict() },
  preview_prefab: { description:'Показать собранный префаб с выбранной стороны (0–7).', schema:z.object({guid,view:z.number().int().min(0).max(7).default(0)}).strict() },
  open_prefab: { description:'Открыть выбранный префаб в Prefab Mode редактора Unity.', schema:z.object({guid}).strict() }
};
async function execute(client,tool,args){
  let code;
  if(tool==='find_prefabs'){
    const encoded=Buffer.from(args.query).toString('base64');
    code=`var query = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String("${encoded}"));
var rows = AssetDatabase.FindAssets("t:Prefab", new[] {"Assets"}).Select(id => new { guid=id, path=AssetDatabase.GUIDToAssetPath(id) })
.Where(r => r.path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
.Where(r => { var filename=r.path.Substring(r.path.LastIndexOf('/')+1); return filename.Substring(0,filename.Length-".prefab".Length).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0; })
.OrderBy(r=>r.path).Take(51).ToArray(); return rows;`;
  }else{
    code=`var path = AssetDatabase.GUIDToAssetPath("${args.guid}");
if (!path.StartsWith("Assets/") || !path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Префаб больше недоступен.");
var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
if (!root) throw new InvalidOperationException("Префаб не найден.");
`;
    code+=tool==='open_prefab'?'return UnityEditor.SceneManagement.PrefabStageUtility.OpenPrefab(path) != null;':
      'var yaw = '+(35+args.view*45)+'f;\n'+readFileSync(join(__dirname,'preview-prefab.cs.txt'),'utf8');
  }
  const response=await client.callTool({name:'execute_code',arguments:{action:'execute',code,safety_checks:true}});
  const text=response.content?.find(b=>b.type==='text')?.text;
  if(response.isError)throw Error(text||'Unity недоступна.');
  const payload=response.structuredContent??JSON.parse(text);
  if(!payload.success)throw Error(payload.message||'Unity не выполнила действие.');
  const result=payload.data?.result;
  if(tool==='find_prefabs'){
    const rows=z.array(z.object({guid,path:z.string()})).max(51).parse(result);
    const data={matches:rows.slice(0,50),more:rows.length>50};
    return {structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};
  }
  if(tool==='open_prefab'){if(result!==true)throw Error('Редактор не открыл префаб.');return {content:[{type:'text',text:'Префаб открыт в Unity.'}]};}
  const png=z.string().max(2500000).regex(/^iVBORw0KGgo[A-Za-z0-9+/=]+$/).parse(result);
  return {content:[{type:'image',mimeType:'image/png',data:png}]};
}
module.exports={tools,execute};
