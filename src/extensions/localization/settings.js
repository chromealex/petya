// «Локализация», settings: source language and the «too long» threshold (saved with the settings form),
// and the translation notification restored when the window opens again.
(()=>{
 const form=document.getElementById('settings-form');
 if(form){
  const card=document.createElement('article');card.className='card';card.dataset.extension='localization';
  const h=document.createElement('h2');h.textContent='Локализация';
  const p=document.createElement('p');p.textContent='Проверка файлов локализации и перевод недостающих строк локальной моделью. Переводы записываются в новые файлы рядом с исходниками.';
  const field=(label,name,attrs)=>{const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.name=name;Object.assign(i,attrs);l.append(i);return l;};
  card.append(h,p,
   field('Исходный язык (код, если файлы его не указывают)','localizationSourceLanguage',{type:'text',placeholder:'en',autocomplete:'off',spellcheck:false}),
   field('Перевод считается слишком длинным, если длиннее исходника в (раз)','localizationLengthRatio',{type:'number',min:'1.05',max:'5',step:'0.05',placeholder:'1.4'}));
  form.insertBefore(card,form.querySelector(':scope > button'));
 }
 const show=item=>{if(item)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:item}));};
 const restore=()=>window.petya?.feature('localizationApp','progress').then(show).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
