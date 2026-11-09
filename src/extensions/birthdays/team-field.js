// «Дни рождения», renderer: the «День рождения» field on the cards of «Команда» (extension.json "personFields").
// A date with a calendar; the value stays in the person record (ISO «ГГГГ-ММ-ДД», or «--ММ-ДД» when a Slack profile
// gave no year) and is normalized on save by Petya's team record; the line under it says the date in words and the age.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('team-field.css',document.currentScript.src).href;document.head.append(style);
 window.renderBirthdayField=(container,api)=>{
  let value=api.value||'';
  const box=document.createElement('div');box.className='team-birthday';const date=document.createElement('input');date.type='date';date.setAttribute('aria-label','День рождения');
  const today=new Date(),start=new Date(today.getFullYear(),today.getMonth(),today.getDate()),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');date.max=iso(today);date.min='1930-01-01';
  const note=document.createElement('span');note.className='small team-birthday-note';
  const clear=document.createElement('button');clear.type='button';clear.className='quiet';clear.textContent='Очистить';
  const locale=window.petyaLocale||'ru-RU';
  const set=v=>{value=v;api.set(v);paint();};
  const paint=()=>{const v=value,full=/^\d{4}-\d{2}-\d{2}$/.test(v),partial=/^--\d{2}-\d{2}$/.test(v);date.value=full?v:'';clear.hidden=!v;
   if(full){const d=new Date(v+'T12:00:00'),next=new Date(today.getFullYear(),d.getMonth(),d.getDate());if(next<start)next.setFullYear(today.getFullYear()+1);
    const age=next.getFullYear()-d.getFullYear(),days=Math.round((next-start)/86400000);
    note.textContent=d.toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'})+' · '+(days===0?'сегодня исполняется '+age:'исполнится '+age+(days===1?' завтра':' через '+days+' дн.'));}
   else if(partial){const [,m,d]=/^--(\d{2})-(\d{2})$/.exec(v);note.textContent=new Date(2000,Number(m)-1,Number(d)).toLocaleDateString(locale,{day:'numeric',month:'long'})+' · год неизвестен — выберите дату в календаре';}
   else note.textContent='Не указан — нажмите, чтобы выбрать в календаре';};
  date.addEventListener('change',e=>{e.stopPropagation();if(date.value)set(date.value);else paint();});
  date.addEventListener('input',e=>e.stopPropagation());
  // A click anywhere in the field opens the calendar.
  date.addEventListener('click',()=>{try{date.showPicker();}catch{}});
  // Only day and month known: the calendar opens on that day (the year is to be picked).
  date.addEventListener('focus',()=>{const m=/^--(\d{2})-(\d{2})$/.exec(value);if(m&&!date.value)date.value='1990-'+m[1]+'-'+m[2];});
  date.addEventListener('blur',()=>{if(/^--/.test(value))paint();});
  clear.onclick=()=>set('');
  const row=document.createElement('div');row.className='team-birthday-row';row.append(date,clear);box.append(row,note);container.append(box);paint();
 };
})();
