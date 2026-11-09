(()=>{
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('settings.css',document.currentScript.src).href;document.head.append(sheet);
  const card=document.createElement('article');card.className='card unity-card';card.dataset.service='unity';card.hidden=true;
  // Petya finds the editor by itself (MCP for Unity on the usual local addresses) and lists Petya's projects that are
  // Unity projects: «Подключить» adds the MCP for Unity package to one. The address and token are under «Вручную».
  card.innerHTML='<h2>Unity Editor</h2><p>Петя работает с открытым проектом Unity через MCP for Unity: просите в чате найти префаб, разобрать ошибку консоли или поправить сцену.</p>'
   +'<div class="unity-found" role="status"><span class="unity-dot"></span><span class="unity-found-text">Ищу редактор Unity…</span><button type="button" class="unity-refresh">Найти снова</button></div>'
   +'<div class="unity-projects"></div>'
   +'<details class="unity-manual"><summary>Вручную: адрес и токен</summary><label>Адрес редактора<input type="url" name="unityUrl" placeholder="http://127.0.0.1:8080/mcp"></label><label>Токен<input type="password" name="unityToken" autocomplete="off" placeholder="Если требуется редактором"></label><label class="check"><input type="checkbox" class="clear-unity-token">Удалить сохранённый токен</label><button type="button" class="unity-save">Сохранить и проверить</button></details>'
   +'<p class="connection-status" role="status" hidden></p>';
  $('settings-form').prepend(card);
  const form=$('settings-form'),status=card.querySelector('.connection-status'),clear=card.querySelector('.clear-unity-token'),save=card.querySelector('.unity-save');
  const found=card.querySelector('.unity-found'),foundText=card.querySelector('.unity-found-text'),again=card.querySelector('.unity-refresh'),list=card.querySelector('.unity-projects');
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  let busy=false;
  async function discover(){
    if(busy)return;busy=true;again.disabled=true;found.dataset.state='busy';foundText.textContent='Ищу редактор Unity…';
    try{
      const r=await window.petya.feature('unity','discover');
      if(r.server){const names=(r.server.editors||[]).map(e=>e.name).filter(Boolean);found.dataset.state=r.server.error?'warn':'ok';
        foundText.textContent=r.server.error?'Сервер MCP for Unity найден ('+r.server.url+'), но '+r.server.error.charAt(0).toLowerCase()+r.server.error.slice(1):'Подключено'+(names.length?': '+names.join(', '):'')+' · '+r.server.url;
        if(form.elements.unityUrl)form.elements.unityUrl.value=r.server.url;}
      else{found.dataset.state='off';foundText.textContent='Редактор не найден. Откройте проект в Unity и в меню Window → MCP for Unity нажмите Start Server — Петя подключится сам.';}
      list.replaceChildren();
      if(r.projects.length){list.append(el('h3',null,'Проекты Unity'));
        for(const p of r.projects){const row=el('div','unity-project'),name=el('div','unity-project-name');name.append(el('strong',null,p.project),el('span',null,p.root));row.append(name);
          if(p.installed)row.append(el('span','unity-project-ok','MCP for Unity есть'));
          else{const add=el('button',null,'Подключить');add.type='button';add.title='Добавить пакет MCP for Unity в Packages/manifest.json проекта';
            add.onclick=async()=>{if(!await window.petyaConfirm('Добавить MCP for Unity в проект «'+p.project+'»?',{detail:'В Packages/manifest.json появится пакет com.coplaydev.unity-mcp. Unity скачает его, когда вы переключитесь в редактор; затем Window → MCP for Unity → Start Server.',ok:'Добавить'}))return;
              add.disabled=true;try{await window.petya.feature('unity','install',p.root);row.replaceChild(el('span','unity-project-ok','Пакет добавлен — переключитесь в Unity'),add);}catch(e){notice(e.message,true);add.disabled=false;}};
            row.append(add);}
          list.append(row);}}
    }catch(e){found.dataset.state='off';foundText.textContent=e.message;}
    finally{busy=false;again.disabled=false;}
  }
  again.onclick=discover;
  // Looks again whenever the card becomes visible (settings opened, Unity Editor turned on).
  new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))discover();}).observe(card);
  save.onclick=async()=>{
    save.disabled=true;status.hidden=false;status.className='connection-status';status.textContent='Проверяю подключение…';
    try{
      const saved=await window.petya.saveSettings({unityUrl:form.elements.unityUrl.value.trim(),unityToken:form.elements.unityToken.value,clear_unityToken:clear.checked});
      form.elements.unityToken.value='';clear.checked=false;renderModules(saved);
      status.textContent=await window.petya.feature('unity','test');status.className='connection-status connected';discover();
    }catch(e){status.textContent=e.message;status.className='connection-status error';}
    finally{save.disabled=false;}
  };
})();
