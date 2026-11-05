const T=PetyaMesh, viewport=document.querySelector('main'), statusLine=document.querySelector('[role=status]');
const reset=document.querySelector('button'), animation=document.querySelector('select');
async function show(data){
  const bytes=Uint8Array.from(atob(data.bytes),c=>c.charCodeAt(0));
  const manager=new T.LoadingManager();
  let externalTexture=false;
  manager.setURLModifier(url=>{
    if(data.format==='fbx' && !/^(?:data:|blob:)/.test(url)){
      externalTexture=true;
      // Substitute a local white pixel so missing sidecars do not hide geometry.
      return 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';
    }
    if(!/^(?:data:|blob:)/.test(url))throw Error('Экспортируйте модель со встроенными ресурсами.');
    return url;
  });
  let object,clips=[];
  if(data.format==='glb'||data.format==='gltf'){
    const gltf=await new T.GLTFLoader(manager).parseAsync(bytes.buffer,'');
    object=gltf.scene;clips=gltf.animations;
  }else if(data.format==='fbx'){
    object=new T.FBXLoader(manager).parse(bytes.buffer,'');clips=object.animations;
  }else if(data.format==='obj'){
    object=new T.OBJLoader(manager).parse(new TextDecoder().decode(bytes));
  }else{
    const geometry=(data.format==='stl'?new T.STLLoader():new T.PLYLoader()).parse(bytes.buffer);
    const colored=!!geometry.getAttribute('color');
    if(data.format==='ply' && !geometry.index){
      object=new T.Points(geometry,new T.PointsMaterial({size:3,sizeAttenuation:false,vertexColors:colored}));
    }else{
      if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
      object=new T.Mesh(geometry,new T.MeshStandardMaterial({color:colored?0xffffff:0xb8c9bf,vertexColors:colored,side:T.DoubleSide}));
    }
  }
  const bounds=new T.Box3().setFromObject(object),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()).length();
  if(bounds.isEmpty() || !Number.isFinite(size) || !Number.isFinite(center.length()))throw Error('В модели нет доступной геометрии.');
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true});}catch{throw Error('Для просмотра нужен WebGL 2. Проверьте аппаратное ускорение.');}
  viewport.append(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new T.Scene();scene.background=new T.Color(0x191e1c);
  const scale=size || 1,camera=new T.PerspectiveCamera(40,1,scale/10000,scale*150);
  scene.add(object,new T.HemisphereLight(0xffffff,0x829887,2));
  const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
  const controls=new T.OrbitControls(camera,renderer.domElement);
  controls.target.copy(center);controls.minDistance=scale*.01;controls.maxDistance=scale*50;
  const draw=()=>renderer.render(scene,camera);
  manager.onLoad=draw;
  const home=()=>{controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(1,.7,1).normalize().multiplyScalar(scale*1.8/Math.min(1,camera.aspect)));controls.update();draw();};
  function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();}
  resize();home();controls.addEventListener('change',draw);new ResizeObserver(resize).observe(viewport);
  reset.onclick=home;reset.hidden=false;
  if(clips.length){
    animation.append(new Option('Без анимации',''));
    clips.forEach((clip,i)=>animation.append(new Option(clip.name||'Анимация '+(i+1),String(i))));
    const mixer=new T.AnimationMixer(object);animation.hidden=false;
    animation.onchange=()=>{mixer.stopAllAction();renderer.setAnimationLoop(null);if(animation.value!==''){
      mixer.clipAction(clips[Number(animation.value)]).play();let last=performance.now();
      renderer.setAnimationLoop(now=>{mixer.update(Math.max(0,Math.min(.1,(now-last)/1000)));last=now;draw();});
    }else draw();};
  }
  statusLine.textContent='Тяните для вращения · колесо для масштаба'+(externalTexture?' · внешние текстуры пропущены':'');
}
function receive(event){
  if(event.source!==parent||!event.data?.bytes)return;
  window.removeEventListener('message',receive);
  show(event.data).catch(e=>{statusLine.textContent='Не удалось показать модель. '+e.message;});
}
window.addEventListener('message',receive);
