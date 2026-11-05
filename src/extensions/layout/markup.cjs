const {createHash}=require('node:crypto');
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=n=>{if(!Number.isFinite(n)||Math.abs(n)>100000)throw Error('Некорректное число в макете.');return Math.round(n*100)/100;};
function font(node,provider){
 const s=provider==='figma'?node.style:node.text_styles?.[0]?.style;
 const family=s?.fontFamily||s?.font_family||s?.postscript_name;
 if(!family)return null;
 const weight=s.fontWeight||s.font_weight||400,italic=s.italic||s.font_style==='italic';
 return {key:createHash('sha256').update(JSON.stringify([family,weight,!!italic])).digest('hex').slice(0,16),family,weight,italic:!!italic};
}
const children=n=>n.children||n.layers||[];
function direction(n,p){return p==='figma'?({HORIZONTAL:'row',VERTICAL:'column'}[n.layoutMode]):n.layout?.direction;}
function generate(root,provider,{responsive=true,fonts={},images={}}={}){
 const warnings=new Set(),needed=new Map();let count=0;
 const color=c=>`rgba(${['r','g','b'].map(k=>Math.max(0,Math.min(255,Math.round(num(c[k])*(provider==='figma'?255:1))))).join(',')},${Math.max(0,Math.min(1,num(c.a??1)))})`;
 const rootBox=root.absoluteBoundingBox||root.rect;
 if(!rootBox||rootBox.width<=0||rootBox.height<=0)throw Error('У макета нет положительных размеров.');
 function axis(n,styles,axis,offset,size,total){
  const horizontal=axis==='horizontal',start=horizontal?'left':'top',end=horizontal?'right':'bottom',dimension=horizontal?'width':'height';
  let mode=n.constraints?.[axis];
  if(provider==='zeplin'){const c=mode||{};mode=c.sizing_mode==='stretch'||c.min&&c.max?'STRETCH':c.max?'MAX':'MIN';}
  if(!responsive)mode='MIN';
  if(mode==='STRETCH'){styles.push(`${start}: ${num(offset)}px`,`${end}: ${num(total-offset-size)}px`);}
  else if(mode==='MAX'){styles.push(`${end}: ${num(total-offset-size)}px`,`${dimension}: ${num(size)}px`);}
  else if(mode==='SCALE'&&total>0){styles.push(`${start}: ${num(offset/total*100)}%`,`${dimension}: ${num(size/total*100)}%`);}
  else if(mode==='CENTER'&&total>0){styles.push(`${start}: 50%`,`margin-${start}: ${num(offset-total/2)}px`,`${dimension}: ${num(size)}px`);}
  else styles.push(`${start}: ${num(offset)}px`,`${dimension}: ${num(size)}px`);
 }
 function element(node,parent,depth,index){
  if(node.visible===false)return '';
  if(++count>1500||depth>40)throw Error('Макет слишком большой: максимум 1500 слоёв и 40 уровней.');
  const id='layer-'+count,box=node.absoluteBoundingBox||node.rect,pb=parent&&(parent.absoluteBoundingBox||parent.rect);
  if(!box||box.width<0||box.height<0)throw Error('Некорректные размеры слоя '+String(node.name||node.id));
  const parentDir=parent&&responsive&&direction(parent,provider),dir=responsive&&direction(node,provider);
  const flow=parentDir&&node.layoutPositioning!=='ABSOLUTE';
  const styles=['margin-left: 0','margin-right: 0','margin-top: 0','margin-bottom: 0','padding-left: 0','padding-right: 0','padding-top: 0','padding-bottom: 0','flex-shrink: 0'];
  if(depth===0){styles.push('position: relative',`width: ${responsive?'100%':num(box.width)+'px'}`,`height: ${responsive?'100%':num(box.height)+'px'}`);}
  else if(flow){
   styles.push('position: relative');
   const h=node.layoutSizingHorizontal||node.constraints?.horizontal?.sizing_mode,v=node.layoutSizingVertical||node.constraints?.vertical?.sizing_mode;
   for(const [dimension,size,sizing] of [['width',box.width,h],['height',box.height,v]]){
    const main=(parentDir==='row')===(dimension==='width');
    if(['FILL','stretch'].includes(sizing)||main&&node.layoutGrow>0)styles.push(main?'flex-grow: 1':'align-self: stretch',`${dimension}: auto`,'flex-shrink: 1');
    else if(['HUG','hug-contents'].includes(sizing))styles.push(`${dimension}: auto`);
    else styles.push(`${dimension}: ${num(size)}px`);
   }
   if(parent.layoutWrap==='WRAP'&&parent.itemSpacing)styles.push(`margin-bottom: ${num(parent.itemSpacing)}px`);
   const siblings=children(parent).filter(c=>c.visible!==false),gap=parent.itemSpacing??parent.layout?.gap??0;
   if(index<siblings.length-1&&gap)styles.push(`margin-${parentDir==='row'?'right':'bottom'}: ${num(gap)}px`);
  }else{
   styles.push('position: absolute');
   axis(node,styles,'horizontal',provider==='figma'?box.x-pb.x:box.x,box.width,pb.width);
   axis(node,styles,'vertical',provider==='figma'?box.y-pb.y:box.y,box.height,pb.height);
  }
  const scroll=({VERTICAL_SCROLLING:'Vertical',HORIZONTAL_SCROLLING:'Horizontal',HORIZONTAL_AND_VERTICAL_SCROLLING:'VerticalAndHorizontal'})[node.overflowDirection];
  const flowStyles=scroll?[]:styles;
  if(dir){
   flowStyles.push(`flex-direction: ${dir}`);
   const align={MIN:'flex-start',MAX:'flex-end',CENTER:'center',STRETCH:'stretch',BASELINE:'flex-start',min:'flex-start',max:'flex-end',center:'center',stretch:'stretch'};
   flowStyles.push('align-items: '+(align[node.counterAxisAlignItems||node.layout?.item_alignment]||'flex-start'));
   const justify={...align,SPACE_BETWEEN:'space-between','space-between':'space-between'};
   flowStyles.push('justify-content: '+(justify[node.primaryAxisAlignItems||node.layout?.distribution]||'flex-start'));
   if(node.layoutWrap==='WRAP'){flowStyles.push('flex-wrap: wrap');warnings.add('При переносе строк Auto Layout межстрочный интервал требует визуальной проверки.');}
   for(const side of ['left','right','top','bottom'])flowStyles.push(`padding-${side}: ${num(node['padding'+side[0].toUpperCase()+side.slice(1)]??node.layout?.padding?.[side]??0)}px`);
  }
  const text=node.characters??node.content,ts=provider==='zeplin'?node.text_styles?.[0]?.style:node.style;
  const paint=node.fills?.find(f=>f.visible!==false&&['SOLID','color'].includes(f.type));
  const fill=ts?.color||paint?.color;
  if(fill)styles.push(`${text==null?'background-color':'color'}: ${color({...fill,a:(fill.a??1)*(paint?.opacity??1)})}`);
  if(node.opacity!=null)styles.push(`opacity: ${num(node.opacity)}`);
  const radius=node.cornerRadius??node.border_radius;
  if(radius)for(const side of ['top-left','top-right','bottom-left','bottom-right'])styles.push(`border-${side}-radius: ${num(radius)}px`);
  if(node.clipsContent)styles.push('overflow: hidden');
  if(text!=null){
   const f=font(node,provider);if(f){needed.set(f.key,f);if(fonts[f.key])styles.push(`-unity-font: url('__PETYA_ASSETS__/${fonts[f.key]}')`);}
   const size=ts?.fontSize??ts?.font_size;if(size)styles.push(`font-size: ${num(size)}px`);
   styles.push('white-space: normal');
   const align=String(ts?.textAlignHorizontal||ts?.text_align||'left').toLowerCase();
   styles.push('-unity-text-align: upper-'+(['left','center','right'].includes(align)?align:'left'));
   if(node.text_styles?.length>1||node.characterStyleOverrides?.some(v=>v))warnings.add('Смешанные стили внутри текста требуют проверки: используется основной стиль.');
  }
  const image=images[node.id||node.source_id];
  if(image){styles.push(`background-image: url('__PETYA_ASSETS__/${image}')`,'-unity-background-scale-mode: '+({FILL:'scale-and-crop',FIT:'scale-to-fit'}[node._layoutImageMode]||'stretch-to-fill'));}
  if(!image&&(node.effects?.some(e=>e.visible!==false)||node.shadows?.length||node.fills?.some(f=>/GRADIENT|gradient/.test(f.type))))warnings.add('Эффекты и градиенты без растрового экспорта требуют визуальной проверки.');
  const tag=scroll?'ScrollView':text==null?'VisualElement':'Label';
  const body=image&&node._layoutFlatten?'':children(node).filter(n=>n.visible!==false).map((n,i)=>element(n,node,depth+1,i)).join('');
  return `<ui:${tag} name="${id}"${scroll?` mode="${scroll}"`:""}${text==null?'':` text="${xml(text)}" enable-rich-text="false"`} style="${xml(styles.join('; '))}">${scroll?`<ui:VisualElement style="${xml((scroll==='Vertical'?['width: 100%','flex-shrink: 0']:['flex-shrink: 0']).concat(flowStyles).join('; '))}">${body}</ui:VisualElement>`:body}</ui:${tag}>`;
 }
 const uxml='<ui:UXML xmlns:ui="UnityEngine.UIElements">'+element(root,null,0,0)+'</ui:UXML>';
 if(Buffer.byteLength(uxml)>2*1024*1024)throw Error('UXML превышает 2 МиБ. Разделите макет.');
 return {name:String(root.name||'Макет').slice(0,160),uxml,layers:count,width:num(rootBox.width),height:num(rootBox.height),responsive,fonts:[...needed.values()].map(f=>({...f,ready:!!fonts[f.key]})),warnings:[...warnings]};
}
// Kept for the standalone asset importer and its historical regression test.
function code(uxml){const base64=Buffer.from(uxml).toString('base64');return `var folder = "Assets/PetyaLayouts";
if (!UnityEditor.AssetDatabase.IsValidFolder(folder)) UnityEditor.AssetDatabase.CreateFolder("Assets", "PetyaLayouts");
var path = UnityEditor.AssetDatabase.GenerateUniqueAssetPath(folder + "/Layout.uxml");
System.IO.File.WriteAllBytes(path, System.Convert.FromBase64String("${base64}"));
UnityEditor.AssetDatabase.ImportAsset(path, UnityEditor.ImportAssetOptions.ForceSynchronousImport);
var asset = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.VisualTreeAsset>(path);
if (asset == null) throw new System.InvalidOperationException("UXML import failed: " + path);
UnityEditor.Selection.activeObject = asset;return path;`;}
module.exports={generate,code,font,children};
