// A chat may redraw its messages during a background operation. Reuse the live card.
const motionCards = new Map();
window.renderMotionCard = function(parent, message) {
  const key = message.motionId;
  if (motionCards.has(key)) { parent.append(motionCards.get(key)); return; }
  const card = document.createElement('section');
  card.className = 'blender-motion-card';
  motionCards.set(key,card);
  if (motionCards.size > 40) motionCards.delete(motionCards.keys().next().value);
  parent.append(card);
  const call = (method,...args) => window.petya.feature('blenderMotion',method,...args);
  const button = (text, fn) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = text;
    el.onclick = async () => {
      if (card.dataset.busy === 'yes') return;
      card.dataset.busy = 'yes';
      const controls = [...card.querySelectorAll('button,input,select')];
      controls.forEach(c => c.disabled = true);
      try { await fn(); } catch (error) { status.textContent = error.message; }
      finally { delete card.dataset.busy; controls.forEach(c => c.disabled = false); }
    };
    return el;
  };
  function field(title, control) {
    const label = document.createElement('label');
    label.textContent = title; label.append(control); card.append(label);
    return control;
  }
  const status = document.createElement('p');
  status.setAttribute('role','status');
  const output = document.createElement('div');
  let file = message.motionFile;
  const choose = button('Выбрать .blend', async () => {
    const selected = await call('pick',message.motionId);
    if (!selected) return;
    document.dispatchEvent(new Event('petya-results-changed'));file = selected; choose.textContent = selected.name;
    clip.replaceChildren(); clip.parentElement.hidden = true;
    status.textContent = ''; output.replaceChildren();
  });
  if (file) choose.textContent = file.name;
  card.append(choose);
  const clip = field('Объект и клип',document.createElement('select'));
  clip.parentElement.hidden = true;
  const mode = field('Действие',document.createElement('select'));
  mode.add(new Option('Убрать лишние ключи','clean'));
  mode.add(new Option('Найти и исправить скачок','repair'));
  mode.value = message.motionMode;
  const tolerance = field('Допуск в единицах канала (для поворота — радианы)',document.createElement('input'));
  Object.assign(tolerance,{type:'number',min:'0',max:'1',step:'any',value:'0.001'});
  for (const control of [mode,clip,tolerance]) control.onchange = () => {output.replaceChildren();status.textContent='';};
  card.append(button('Подготовить превью',async () => {
    if (!file) throw Error('Выберите .blend с активной анимацией.');
    if (!Number.isFinite(tolerance.valueAsNumber) || !tolerance.checkValidity()) throw Error('Введите допуск от 0 до 1.');
    output.replaceChildren(); status.textContent = 'Анализирую движение…';
    const result = await call('analyze',file.id,mode.value,clip.value,tolerance.valueAsNumber);
    if (result.clips) {
      clip.replaceChildren(...result.clips.map(c => new Option(c.object+' · '+c.action,c.object)));
      clip.parentElement.hidden = false; status.textContent = 'Выберите нужный клип.'; return;
    }
    if (!result.changed) { status.textContent = result.message; return; }
    status.textContent = result.object+' · '+result.action+' · Ключей: '+result.before+' → '+result.after;
    if (result.frame !== undefined) {
      const detail = document.createElement('p');
      detail.textContent = 'Кадр '+result.frame+' · '+result.channel+' · '+result.axis+': '+result.value.toFixed(3)+' → '+result.proposed.toFixed(3);
      output.append(detail);
    }
    const image = document.createElement('img');
    image.className = 'extension-reply-image';
    image.alt = 'Движение до и после правки';
    image.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(result.preview);
    const apply = button('Применить правку в копии',async () => {
      const saved = await call('apply',result.proposalId);
      apply.replaceWith(document.createTextNode('Сохранено рядом с исходником: '+saved.saved));
    });
    output.append(image,apply);
  }),status,output);
};
