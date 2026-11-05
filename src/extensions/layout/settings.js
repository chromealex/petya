(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='layout';
 card.innerHTML='<h2>Вёрстка Unity</h2><p>Figma или Zeplin → изображения, шрифты и адаптивный интерфейс в сцене. Требуется Unity Editor с execute_code.</p><label>Токен Figma (file_content:read)<input name="layoutFigmaToken" type="password" autocomplete="off"></label><label><input type="checkbox" class="clear-figma">Удалить токен Figma</label><label>Токен Zeplin<input name="layoutZeplinToken" type="password" autocomplete="off"></label><label><input type="checkbox" class="clear-zeplin">Удалить токен Zeplin</label><button type="button" class="save">Сохранить подключения</button><label>Ссылка на фрейм или экран<input type="url" class="source" placeholder="https://www.figma.com/design/…?node-id=1-2"></label><label><input type="checkbox" class="responsive" checked>Перенести Auto Layout и адаптивные привязки</label><button type="button" class="prepare">Подготовить интерфейс</button><div class="fonts"></div><details><summary>Разметка интерфейса</summary><pre class="preview" style="max-height:280px;overflow:auto;white-space:pre-wrap"></pre></details><div class="editors"></div><button type="button" class="apply" hidden>Разместить в сцене Unity</button><p role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),call=(method,...args)=>window.petya.feature('layout',method,...args);let proposal,busy=false;
 const run=work=>async()=>{if(busy)return;busy=true;card.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();}catch(e){status.textContent=e.message;}finally{busy=false;card.querySelectorAll('button').forEach(b=>b.disabled=false);q('.apply').disabled=!proposal?.ready;}};
 function show(result){
  proposal=result;q('.preview').textContent=result.uxml;q('.fonts').replaceChildren();q('.editors').replaceChildren();
  status.textContent=result.name+' · '+result.layers+' слоёв · '+result.assets.length+' ресурсов. '+result.warnings.join(' ');
  for(const font of result.fonts){const row=document.createElement('p'),button=document.createElement('button');row.textContent=font.family+' · '+font.weight+(font.italic?' italic':'')+(font.ready?' · файл добавлен ':' · нужен TTF/OTF ');button.type='button';button.textContent=font.ready?'Заменить файл':'Выбрать файл';button.onclick=run(async()=>show(await call('pickFont',proposal.id,font.key)));row.append(button);q('.fonts').append(row);}
  q('.apply').hidden=false;q('.apply').disabled=!result.ready;
 }
 q('.save').onclick=run(async()=>{await window.petya.saveSettings({layoutFigmaToken:q('[name=layoutFigmaToken]').value,layoutZeplinToken:q('[name=layoutZeplinToken]').value,clear_layoutFigmaToken:q('.clear-figma').checked,clear_layoutZeplinToken:q('.clear-zeplin').checked});card.querySelectorAll('input[type=password]').forEach(n=>n.value='');q('.clear-figma').checked=q('.clear-zeplin').checked=false;proposal=null;q('.apply').hidden=true;status.textContent='Подключения сохранены. Подготовьте макет.';});
 q('.prepare').onclick=run(async()=>{proposal=null;q('.apply').hidden=true;q('.fonts').replaceChildren();q('.editors').replaceChildren();q('.preview').textContent='';status.textContent='Читаю макет и загружаю изображения…';show(await call('prepare',{url:q('.source').value,responsive:q('.responsive').checked}));});
 async function apply(instance){
  const result=await call('apply',proposal.id,instance);
  if(result.editors){q('.editors').replaceChildren();status.textContent='Выберите редактор Unity.';for(const editor of result.editors){const b=document.createElement('button');b.type='button';b.textContent=editor.name||editor.id;b.onclick=run(()=>apply(editor.id));q('.editors').append(b);}return;}
  status.textContent='Интерфейс «'+result.objectName+'» размещён в сцене. Ресурсы: '+result.folder+'. Сохраните сцену в Unity. Undo отменяет создание объекта.';proposal=null;q('.apply').hidden=true;q('.editors').replaceChildren();
 }
 q('.apply').onclick=run(()=>apply());
 window.renderLayoutProposal=(parent,result)=>{const b=document.createElement('button');b.type='button';b.textContent='Шрифты и размещение в сцене';b.onclick=run(async()=>{show(await call('proposal',result.id));view('settings');window.revealSettings?.(card);});parent.append(b);};
 const restore=()=>call('status').then(item=>{if(item)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:item}));}).catch(()=>{});
 window.petyaEvents.onWindowShown(restore);restore();
})();
