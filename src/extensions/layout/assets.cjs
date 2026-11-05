const {children}=require('./markup.cjs');
const MAX_FILE=12*1024*1024,MAX_TOTAL=48*1024*1024;
async function bytes(response,max=MAX_FILE){
 if(!response.ok)throw Error('Не удалось получить ресурс: HTTP '+response.status);
 if(Number(response.headers.get('content-length'))>max)throw Error('Ресурс превышает допустимый размер.');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Ресурс превышает допустимый размер.');parts.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(parts);
}
function imageType(data){
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(data[0]===255&&data[1]===216&&data[2]===255)return 'jpg';
 throw Error('Ресурс не является PNG или JPEG. Экспортируйте изображение в одном из этих форматов.');
}
function fontType(data){
 if(data.length<12||data.length>MAX_FILE)throw Error('Некорректный размер файла шрифта.');
 if(data.readUInt32BE(0)===0x00010000||data.toString('ascii',0,4)==='true')return 'ttf';
 if(data.toString('ascii',0,4)==='OTTO')return 'otf';
 throw Error('Выберите файл TTF или OTF.');
}
function assetUrl(value){
 const u=new URL(value),domains=['figma.com','figmausercontent.com','zeplin.io','zeplin.dev','amazonaws.com','cloudfront.net'];
 if(u.protocol!=='https:'||u.username||u.password||u.port||!domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Сервис вернул неподдерживаемый адрес ресурса.');
 return u.href;
}
async function collect(root,ref,token,{request=fetch,check=()=>{},report=()=>{}}={}){
 const nodes=[];let count=0;
 function visit(node,depth=0){if(depth>40||++count>1500)throw Error('Макет слишком большой.');if(node.visible===false)return;nodes.push(node);for(const c of children(node))visit(c,depth+1);}
 visit(root);
 const wanted=[];
 if(ref.provider==='figma'){
  const leaves=nodes.filter(n=>!children(n).length&&n.type!=='TEXT'&&(n.fills?.some(f=>f.visible!==false&&f.type!=='SOLID')||['VECTOR','BOOLEAN_OPERATION','ELLIPSE','STAR','POLYGON','LINE'].includes(n.type)||n.effects?.some(e=>e.visible!==false)));
  for(let i=0;i<leaves.length;i+=25){
   check();report('Получаю экспорт изображений Figma…');
   const response=await request('https://api.figma.com/v1/images/'+ref.key+'?format=png&scale=2&ids='+encodeURIComponent(leaves.slice(i,i+25).map(n=>n.id).join(',')),{headers:{'X-Figma-Token':token},redirect:'error',signal:AbortSignal.timeout(30000)});
   const exported=JSON.parse((await bytes(response,5*1024*1024)).toString('utf8'));check();
   for(const n of leaves.slice(i,i+25)){const url=exported.images?.[n.id];if(!url)throw Error('Figma не экспортировала слой '+n.name);wanted.push({node:n,url});}
  }
  // Container image fills use source bitmaps, preserving separately editable children.
  const containers=nodes.filter(n=>children(n).length&&n.fills?.some(f=>f.type==='IMAGE'&&f.visible!==false));
  if(containers.length){
   check();const response=await request('https://api.figma.com/v1/files/'+ref.key+'/images',{headers:{'X-Figma-Token':token},redirect:'error',signal:AbortSignal.timeout(30000)});
   const data=JSON.parse((await bytes(response,5*1024*1024)).toString('utf8'));check();
   for(const n of containers){const paint=n.fills.find(f=>f.type==='IMAGE'&&f.visible!==false),url=data.meta?.images?.[paint.imageRef];if(!url)throw Error('Нет фонового изображения слоя '+n.name);wanted.push({node:n,url});n._layoutImageMode=paint.scaleMode;}
  }
 }else{
  for(const asset of root.assets||[]){
   const matches=nodes.filter(n=>n.source_id&&n.source_id===asset.layer_source_id);
   if(!matches.length)continue;
   const content=asset.contents?.filter(c=>['png','jpg','jpeg'].includes(c.format?.toLowerCase())).sort((a,b)=>Math.abs((a.density||1)-2)-Math.abs((b.density||1)-2))[0];
   if(!content)throw Error('В Zeplin экспортируйте PNG/JPEG для '+asset.display_name);
   for(const node of matches){node._layoutFlatten=true;wanted.push({node,url:content.url});}
  }
  for(const n of nodes)if(n.exportable&&!wanted.some(w=>w.node===n))throw Error('Zeplin не предоставил экспорт слоя '+n.name);
 }
 if(wanted.length>100)throw Error('Слишком много изображений: разделите макет на экраны.');
 const files=[],images={};let total=0;
 for(const [index,item] of wanted.entries()){
  check();report('Загружаю изображение '+(index+1)+' из '+wanted.length+'…');
  const response=await request(assetUrl(item.url),{redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await bytes(response);check();total+=data.length;if(total>MAX_TOTAL)throw Error('Ресурсы макета превышают 48 МиБ.');
  const name='images/image-'+index+'.'+imageType(data);files.push({name,data});images[item.node.id||item.node.source_id]=name;
 }
 return {files,images,total};
}
module.exports={collect,bytes,imageType,fontType,assetUrl,MAX_TOTAL};
