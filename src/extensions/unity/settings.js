(()=>{
  const card=document.createElement('article');card.className='card';card.dataset.service='unity';card.hidden=true;
  // Only the editor address lives here (filled in by default); everything else — prefabs, scenes, errors — is asked in the chat.
  card.innerHTML='<h2>Unity Editor</h2><p>Петя работает с открытым проектом Unity через MCP for Unity: просите в чате найти префаб, разобрать ошибку консоли или поправить сцену.</p><label>Адрес редактора<input type="url" name="unityUrl" placeholder="http://127.0.0.1:8080/mcp"></label><details><summary>Токен доступа</summary><label>Токен<input type="password" name="unityToken" autocomplete="off" placeholder="Если требуется редактором"></label><label class="check"><input type="checkbox" class="clear-unity-token">Удалить сохранённый токен</label></details><button type="button">Проверить</button><p class="connection-status" role="status">Не проверено · запусти MCP for Unity в редакторе</p>';
  $('settings-form').prepend(card);
  const form=$('settings-form'),status=card.querySelector('.connection-status'),clear=card.querySelector('.clear-unity-token'),save=card.querySelector('button');
  save.onclick=async()=>{
    save.disabled=true;status.className='connection-status';status.textContent='Проверяю подключение…';
    try{
      const saved=await window.petya.saveSettings({unityUrl:form.elements.unityUrl.value,unityToken:form.elements.unityToken.value,clear_unityToken:clear.checked});
      form.elements.unityToken.value='';clear.checked=false;renderModules(saved);
      status.textContent=await window.petya.feature('unity','test');status.className='connection-status connected';
    }catch(e){status.textContent=e.message;status.className='connection-status error';}
    finally{save.disabled=false;}
  };
})();
