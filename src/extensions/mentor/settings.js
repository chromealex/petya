// «Петя-наставник» settings: the weekly review (off until the user turns it on; default Friday 17:00).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.dataset.extension='mentor';
 card.append(el('h2',null,'Петя-наставник'),el('p',null,'Раз в неделю Петя смотрит историю чатов на этом компьютере и подсказывает, что вы повторяете руками. Ничего не отправляется наружу и ничего не создаётся без «Создать».'));
 const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center';
 const enabled=el('input');enabled.type='checkbox';enabled.name='mentorWeekly';
 label.append(enabled,el('span',null,'Еженедельный разбор'));
 const row=el('div');row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px';
 const day=el('select');day.name='mentorDay';day.setAttribute('aria-label','День разбора');
 ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'].forEach((name,i)=>{const o=el('option',null,name);o.value=String(i);day.append(o);});
 const time=el('input');time.type='time';time.name='mentorTime';time.setAttribute('aria-label','Время разбора');
 row.append(el('span',null,'День и время:'),day,time);
 const status=el('p');status.setAttribute('role','status');
 card.append(label,row,status);
 document.getElementById('settings-form').append(card);
 const sync=st=>{enabled.checked=st.enabled;day.value=String(st.day);time.value=st.time;day.disabled=time.disabled=!st.enabled;};
 async function refresh(){try{sync(await window.petya.feature('mentor','status'));}catch(e){status.textContent=e.message;}}
 async function save(){
  try{
   await window.petya.saveSettings({mentorWeekly:String(enabled.checked),mentorDay:day.value,mentorTime:time.value||'17:00'});
   day.disabled=time.disabled=!enabled.checked;
   status.textContent=enabled.checked?'Разбор будет приходить в чат «Петя-наставник».':'Еженедельный разбор выключен. Спросить можно в любой момент: «что мне автоматизировать?»';
  }catch(e){status.textContent=e.message;refresh();}
 }
 enabled.onchange=save;day.onchange=save;time.onchange=save;
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
