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

window.renderUnityRequest = function(parent,message) {
  const box=document.createElement('section'), controls=document.createElement('div'), output=document.createElement('div');
  const owner=topicSelect.value;
  let instance;
  const call=async(method,args)=>{
    const reply=await window.petya.feature('unity','invoke',owner,method,args,instance);
    if(reply.editors){
      controls.replaceChildren();
      const select=document.createElement('select');select.setAttribute('aria-label','Редактор Unity');
      for(const editor of reply.editors)select.add(new Option(editor.name+' · '+editor.id,editor.id));
      controls.append(select,button('Использовать выбранный редактор',async()=>{
        instance=select.value;controls.replaceChildren();
        if(method==='discover')await catalog();else show(await call(method,args));
      }));
      throw Error('Выберите редактор Unity для этого запроса.');
    }
    return reply;
  };
  function show(reply) {
    output.replaceChildren();
    for(const block of reply.content || []) {
      if(block.type==='image' && ['image/png','image/jpeg','image/webp'].includes(block.mimeType)){
        const image=document.createElement('img');
        image.alt='Ответ Unity Editor';image.src='data:'+block.mimeType+';base64,'+block.data;output.append(image);
      } else {
        const pre=document.createElement('pre');
        pre.textContent=block.text ?? block.resource?.text ?? JSON.stringify(block.resource?.uri || block.type);
        output.append(pre);
      }
    }
  }
  function button(label,run) {
    const b=document.createElement('button'); b.type='button';b.textContent=label;
    b.onclick=async()=>{
      if(!moduleEnabled('unity')){window.openAppCatalog('Unity');return;}
      box.inert=true;
      try{await run();}catch(error){output.textContent=error.message;}finally{box.inert=false;}
    };
    return b;
  }
  async function catalog() {
    const {tools,resources,templates}=(await call('discover',{})).structuredContent;
    controls.replaceChildren();output.replaceChildren();
    if (tools.length) {
      const select=document.createElement('select'),schema=document.createElement('pre'),params=document.createElement('textarea');
      select.setAttribute('aria-label','Инструмент Unity');params.setAttribute('aria-label','Параметры инструмента в JSON');
      tools.forEach(t=>select.add(new Option(t.name,t.name)));
      select.onchange=()=>{const t=tools[select.selectedIndex];schema.textContent=[t.description,JSON.stringify(t.inputSchema,null,2)].join('\n');params.value='{}';};
      select.onchange();
      controls.append(select,schema,params,button('Выполнить в Unity',async()=>show(await call('call_tool',{name:select.value,arguments:JSON.parse(params.value)}))));
    }
    if(resources.length || templates.length){
      const uri=document.createElement('input');uri.setAttribute('aria-label','URI ресурса Unity');
      uri.value=resources[0]?.uri || templates[0].uriTemplate;
      const list=document.createElement('pre');list.textContent=[...resources.map(r=>r.uri),...templates.map(r=>r.uriTemplate)].join('\n');
      controls.append(list,uri,button('Прочитать ресурс',async()=>show(await call('read_resource',{uri:uri.value}))));
    }
    if(!controls.childNodes.length)output.textContent='Редактор не опубликовал инструменты или ресурсы.';
  }
  const request=message.unityRequest;
  if(request.name)box.append(button(request.name==='read_console'?'Прочитать консоль':'Показать иерархию',async()=>show(await call('call_tool',request))));
  box.append(button('Инструменты и ресурсы Unity',catalog),controls,output);parent.append(box);
};
