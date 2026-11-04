(() => {
 const slider=document.getElementById('speech-style');
 const labels=['Нормативная','Разговорная','Крепкие выражения','Ненормативная'];
 const descriptions=['Без мата и грубых выражений.','Неформально: «блин», «чёрт», но без мата.','Мат допустим изредка, когда подходит к ситуации.','Свободная речь с матом, без звёздочек и без ругани ради ругани.'];
 const render=()=>{const i=Number(slider.value);document.getElementById('speech-style-value').textContent=labels[i];document.getElementById('speech-style-description').textContent=descriptions[i];slider.setAttribute('aria-valuetext',labels[i]);};
 slider.addEventListener('input',render);
 // Saved as soon as the slider is released: it used to wait for the form's «Сохранить» button far below,
 // so the label changed while Petya kept the previous style.
 slider.addEventListener('change',async()=>{const value=slider.value;try{const saved=await window.petya.saveSettings({speechStyle:value});if(saved?.speechStyle!==undefined&&saved.speechStyle!==value)throw Error('Настройка не сохранилась.');document.getElementById('speech-style-description').textContent=descriptions[Number(value)]+' Сохранено.';}catch(e){notice('Не удалось сохранить лексику: '+e.message,true);}});
 document.addEventListener('petya-settings-displayed',render);
 render();
})();
