(() => {
 const slider=document.getElementById('speech-style');
 const labels=['Нормативная','Разговорная','Крепкие выражения','Ненормативная'];
 const descriptions=['Без мата и грубых выражений.','Неформально: «блин», «чёрт», но без мата.','Мат допустим изредка, когда подходит к ситуации.','Свободная речь с матом, без звёздочек и без ругани ради ругани.'];
 const render=()=>{const i=Number(slider.value);document.getElementById('speech-style-value').textContent=labels[i];document.getElementById('speech-style-description').textContent=descriptions[i];slider.setAttribute('aria-valuetext',labels[i]);};
 slider.addEventListener('input',render);
 document.addEventListener('petya-settings-displayed',render);
 render();
})();
