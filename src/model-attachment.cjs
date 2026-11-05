// Keep the original bytes for the local viewer and send only metadata to the assistant.
const formats = ['glb','gltf','obj','stl','ply'];
function readModel(bytes,format) {
  let note = 'Геометрия '+format.toUpperCase()+'.';
  if (format==='glb' || format==='gltf') {
    let json=bytes;
    if (format==='glb') {
      if(bytes.length<20 || bytes.toString('ascii',0,4)!=='glTF' || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length || bytes.toString('ascii',16,20)!=='JSON' || bytes.readUInt32LE(12)>bytes.length-20)throw Error('Повреждённый файл GLB 2.0.');
      json=bytes.subarray(20,20+bytes.readUInt32LE(12));
    }
    let scene;
    try { scene=JSON.parse(json.toString('utf8')); } catch { throw Error('Не удалось прочитать описание сцены glTF.'); }
    if(scene?.asset?.version!=='2.0')throw Error('Для просмотра нужен glTF версии 2.0.');
    if([...(scene.buffers||[]),...(scene.images||[])].some(item=>item.uri && !item.uri.startsWith('data:')))throw Error('Модель ссылается на отдельные ресурсы. Экспортируйте её в GLB со встроенными буферами и текстурами.');
    if((scene.extensionsRequired||[]).some(k=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(k)))throw Error('Экспортируйте GLB без сжатия Draco, Meshopt и KTX2.');
    if((scene.accessors||[]).some(a=>!Number.isSafeInteger(a.count)||a.count<0||a.count>3000000))throw Error('Слишком сложная геометрия для просмотра в чате.');
    note='Мешей: '+(scene.meshes?.length||0)+' · материалов: '+(scene.materials?.length||0)+' · анимаций: '+(scene.animations?.length||0)+'.';
  } else if(format==='obj') {
    const source=bytes.toString('utf8');
    const vertices=source.match(/^\s*v\s+/gm)?.length||0;
    if(!vertices)throw Error('В OBJ нет вершин.');
    note='Вершин: '+vertices+' · граней: '+(source.match(/^\s*f\s+/gm)?.length||0)+'.';
    if(/^\s*mtllib\s+/m.test(source))note+=' Внешние материалы MTL и текстуры в превью не загружаются.';
  } else if(format==='stl') {
    const faces=bytes.length>=84?bytes.readUInt32LE(80):0;
    if(faces && bytes.length===84+50*faces)note='Треугольников: '+faces+'.';
    else if(!/^\s*solid\b/i.test(bytes.toString('ascii',0,256)))throw Error('Не удалось прочитать STL.');
  } else if(!/^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0\r?\n/.test(bytes.toString('ascii',0,128)))throw Error('Не удалось прочитать заголовок PLY.');
  if(format==='ply'){
    const head=bytes.toString('ascii',0,Math.min(bytes.length,65536)).split(/\r?\nend_header\r?\n/);
    if(head.length<2)throw Error('Не найден конец заголовка PLY.');
    const elements=[...head[0].matchAll(/^element\s+(\w+)\s+(\d+)\s*$/gm)];
    const count=elements.find(e=>e[1]==='vertex')?.[2];
    if(!Number(count)||elements.some(e=>Number(e[2])>1000000))throw Error('Недопустимое число элементов PLY.');
    note='Вершин: '+count+'.';
  }
  return {modelFormat:format,modelData:bytes.toString('base64'),text:format.toUpperCase()+' · '+note,note};
}
module.exports={formats,readModel};
