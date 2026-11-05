const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function generate(root,provider){
 const warnings=['Базовая фиксированная вёрстка UI Toolkit. Изображения, шрифты, эффекты, адаптивность и поведение требуют доработки.'];
 let count=0;
 const number=(n)=>{if(!Number.isFinite(n)||Math.abs(n)>100000)throw Error('Некорректные размеры макета.');return Math.round(n*100)/100;};
 function element(node,parent,depth){
  if(node.visible===false)return '';
  if(++count>100||depth>20)throw Error('Слишком много слоёв. Выберите меньший фрейм.');
  const box=node.absoluteBoundingBox||node.rect;
  if(!box)throw Error('Слой без размеров: '+String(node.name||node.id));
  const x=provider==='figma'?box.x-(parent?.x||0):box.x,y=provider==='figma'?box.y-(parent?.y||0):box.y;
  const styles=[`position: absolute`,`left: ${depth?number(x):0}px`,`top: ${depth?number(y):0}px`,`width: ${number(box.width)}px`,`height: ${number(box.height)}px`];
  const text=node.characters??node.content;
  const fill=node.fills?.find(f=>f.visible!==false&&['SOLID','color'].includes(f.type))?.color;
  if(fill){const scale=provider==='figma'?255:1;styles.push(`${text==null?'background-color':'color'}: rgba(${['r','g','b'].map(k=>Math.max(0,Math.min(255,Math.round(number(fill[k])*scale)))).join(',')},${Math.max(0,Math.min(1,fill.a??1))})`);}
  if(node.style?.fontSize)styles.push(`font-size: ${number(node.style.fontSize)}px`);
  if(text!=null)styles.push('white-space: normal');
  const tag=text==null?'VisualElement':'Label';
  return `<ui:${tag} name="layer-${count}"${text==null?'':` text="${xml(text)}"`} style="${xml(styles.join('; '))}">${(node.children||node.layers||[]).map(n=>element(n,box,depth+1)).join('')}</ui:${tag}>`;
 }
 const uxml='<ui:UXML xmlns:ui="UnityEngine.UIElements">'+element(root,null,0)+'</ui:UXML>';
 if(Buffer.byteLength(uxml)>4500)throw Error('Для одного импорта выберите меньший фрейм (до 4500 байт UXML).');
 return {name:String(root.name||'Макет').slice(0,160),uxml,layers:count,warnings};
}
function code(uxml){
 const base64=Buffer.from(uxml).toString('base64');
 return `var folder = "Assets/PetyaLayouts";
if (!UnityEditor.AssetDatabase.IsValidFolder(folder)) UnityEditor.AssetDatabase.CreateFolder("Assets", "PetyaLayouts");
var path = UnityEditor.AssetDatabase.GenerateUniqueAssetPath(folder + "/Layout.uxml");
System.IO.File.WriteAllBytes(path, System.Convert.FromBase64String("${base64}"));
UnityEditor.AssetDatabase.ImportAsset(path);
UnityEditor.Selection.activeObject = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.VisualTreeAsset>(path);
return path;`;
}
module.exports={generate,code};
