// Settings of the coding extension: which local model writes code, whether checks run, and the step limit.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='coder';
 card.innerHTML='<h2>Программист</h2><p>Петя сам пишет код в подключённой папке проекта: в отдельной ветке и рабочей копии, затем показывает дифф. В папку проекта ничего не попадёт, пока не скажешь «прими». Просите в чате: «Напиши функцию…», «Исправь баг в…», «Добавь тесты для…».</p>'+
  '<label>Модель для кода<select class="coder-model"><option value="">Как в общих настройках</option></select></label><p class="small coder-hint"></p>'+
  '<label class="check"><input type="checkbox" class="coder-run">Запускать тесты и сборку проекта</label>'+
  '<p class="small">Команды выполняются в рабочей копии без оболочки, из списка разрешённых (npm test, pytest, go test, cargo test, make…), без секретов в окружении и без сети к git. Код с опасными действиями не запускается.</p>'+
  '<label>Предел шагов на задачу<input type="number" class="coder-steps" min="10" max="100" step="5"></label>'+
  '<button type="button" class="coder-save">Сохранить</button> <button type="button" class="coder-refresh quiet">Обновить список моделей</button><p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),select=q('.coder-model');
 async function load(){
  status.textContent='';
  try{
   const data=await window.petya.feature('coder','models');
   select.replaceChildren(Object.assign(document.createElement('option'),{value:'',textContent:'Как в общих настройках'+(data.fallback?' ('+data.fallback+')':'')}));
   for(const m of data.models){const o=document.createElement('option');o.value=m.name;o.textContent=m.name+(m.size?' · '+(m.size/1e9).toFixed(1)+' ГБ':'')+(m.coder?' · для кода':'');select.append(o);}
   if(data.current&&!data.models.some(m=>m.name===data.current)){const o=document.createElement('option');o.value=data.current;o.textContent=data.current+' (не найдена в Ollama)';select.append(o);}
   select.value=data.current||'';
   q('.coder-hint').textContent=data.models.some(m=>m.coder)?'Модели «для кода» обычно пишут код лучше общих.':'Для кода лучше подходит отдельная модель, например qwen3-coder:30b (ollama pull qwen3-coder:30b) — ей нужно около 20 ГБ памяти.';
  }catch(e){status.textContent='Ollama недоступна: '+e.message;}
 }
 async function settings(){try{const s=await window.petya.settings();if(s){q('.coder-run').checked=s.coderRun!=='off';q('.coder-steps').value=s.coderSteps||40;}}catch{}}
 q('.coder-save').onclick=async()=>{
  try{await window.petya.saveSettings({coderModel:select.value,coderRun:q('.coder-run').checked?'tests':'off',coderSteps:String(q('.coder-steps').value||40)});status.textContent='Сохранено.';status.className='connection-status connected';}
  catch(e){status.textContent=e.message;status.className='connection-status error';}
 };
 q('.coder-refresh').onclick=load;
 q('.coder-run').checked=true;q('.coder-steps').value=40;
 load();settings();
})();
