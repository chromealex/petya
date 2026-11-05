(()=>{
  const card=document.createElement('article');card.className='card';card.dataset.service='unity';card.hidden=true;
  card.innerHTML='<h2>Unity Editor</h2><p>Запустите MCP for Unity в открытом проекте и включите действие execute_code.</p><label>Адрес редактора<input type="url" name="unityUrl" placeholder="http://127.0.0.1:8080/mcp"></label><label>Токен доступа<input type="password" name="unityToken" autocomplete="off" placeholder="Если требуется редактором"></label><label class="check"><input type="checkbox" class="clear-unity-token">Удалить сохранённый токен</label><button type="button">Сохранить и проверить</button><p class="connection-status" role="status">Требуется настройка</p>';
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
