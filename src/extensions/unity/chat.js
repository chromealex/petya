window.renderUnityPrefab=function(node,query){
  const box=document.createElement('div'),status=document.createElement('p'),results=document.createElement('div'),preview=document.createElement('div');
  box.className='unity-prefab-actions';status.setAttribute('role','status');
  let instance;
  const settings=document.createElement('button');settings.type='button';settings.hidden=true;settings.textContent='Настройки Unity';
  settings.onclick=()=>window.openChatServiceSettings('unity');
  const retry=document.createElement('button');retry.type='button';retry.hidden=true;retry.textContent='Проверить снова';
  const button=(name,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=async()=>{
    const controls=[...box.querySelectorAll('button')];controls.forEach(c=>c.disabled=true);
    retry.hidden=settings.hidden=true;retry.onclick=null;
    try{await fn();}catch(e){
      const disconnected=/Не удалось подключиться к Unity|нажмите Connect|инструмент execute_code|редактор Unity недоступен/.test(e.message);
      status.textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
      if(disconnected){retry.hidden=settings.hidden=false;retry.onclick=()=>b.click();}
    }finally{controls.forEach(c=>c.disabled=false);}
  };return b;};
  const call=(tool,args)=>window.petya.feature('unity','invoke',topicSelect.value,tool,args,instance);
  async function show(item){
    preview.replaceChildren();const controls=document.createElement('div'),img=document.createElement('img');img.hidden=true;img.alt=item.path;
    let angle=0;const cache=new Map();
    async function render(n){
      status.textContent='Получаю превью из Unity…';
      if(!cache.has(n)){const r=await call('preview_prefab',{guid:item.guid,view:n});const frame=r.content.find(b=>b.type==='image'&&b.mimeType==='image/png');if(!frame)throw Error('Нет изображения от Unity.');cache.set(n,'data:image/png;base64,'+frame.data);}
      angle=n;img.src=cache.get(n);img.hidden=false;status.textContent=[instance,item.path].filter(Boolean).join(' · ');
    }
    controls.className='actions';controls.append(button('Повернуть влево',()=>render((angle+7)%8)),button('Повернуть вправо',()=>render((angle+1)%8)),button('Открыть в Unity',async()=>{await call('open_prefab',{guid:item.guid});status.textContent='Открыт в Unity · '+item.path;}));
    preview.append(img,controls);controls.inert=true;try{await render(0);}finally{controls.inert=false;}
  }
  const find=button('Найти префаб',()=>search());
  async function search(editor){
    instance=editor;
    if(!moduleEnabled('unity')){window.openAppCatalog('Unity');return;}
    results.replaceChildren();preview.replaceChildren();status.textContent='Ищу в Assets…';
    const found=await call('find_prefabs',{query});
    if(found.editors){status.textContent='В каком проекте искать?';for(const e of found.editors)results.append(button(e.id,()=>search(e.id)));return;}
    instance=found.instance;const {matches,more}=found.structuredContent;
    if(matches.length===1){await show(matches[0]);return;}
    status.textContent=more?'Первые 50 совпадений. Уточните название.':matches.length?'Выберите префаб':'Совпадений нет.';
    for(const item of matches)results.append(button(item.path,()=>show(item)));
  }
  results.className='actions';box.append(find,status,retry,settings,results,preview);node.append(box);
};
