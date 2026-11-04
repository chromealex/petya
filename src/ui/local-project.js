(() => {
 const form=document.getElementById('settings-form');if(!form)return;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const card=node('article');card.className='card settings-card';card.dataset.service='localproject';
 const icon=node('img');icon.src='../../assets/app-icon.png';icon.alt='Петя';icon.width=32;icon.height=32;
 const heading=node('h2','Локальный проект'),status=node('p');status.className='connection-status';status.setAttribute('role','status');
 const label=node('label','Проект компании'),select=node('select');label.append(select);
 const help=node('p','Сначала скажи «Работаем над проектом …». Подключи папку к этому проекту. В его диалоге Петя перечитывает документацию и подходящие по имени исходники перед ответом. Данные получает настроенная модель Ollama.');help.className='small';
 const details=node('details'),summary=node('summary','Какие файлы прочитаны'),preview=node('pre');preview.style.whiteSpace='pre-wrap';details.append(summary,preview);
 const row=node('div');row.className='row';let busy=false;
 const action=(title,fn)=>{const button=node('button',title);button.type='button';button.onclick=async()=>{if(busy)return;busy=true;row.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent=e.message;status.className='connection-status error';}finally{busy=false;row.querySelectorAll('button').forEach(b=>b.disabled=false);}};row.append(button);return button;};
 let projects=[];
 function display(){const p=projects.find(p=>p.id===select.value);status.textContent=p?.folder?'Подключено · '+p.name+' · '+p.folder:'Папка не подключена';status.className='connection-status'+(p?.folder?' connected':'');preview.textContent='';}
 async function refresh(){const state=await window.petya.localProjectStatus();projects=state.projects;const selected=select.value;select.replaceChildren(new Option('Выберите проект',''));for(const p of projects)select.add(new Option(p.name+(p.id===state.activeId?' — текущий':''),p.id));select.value=state.activeId||selected;display();}
 function show(snapshot){preview.textContent='Прочитано: '+snapshot.readAt+'\n'+snapshot.notice+'\n\n'+snapshot.files.map(f=>f.path+(f.truncated?' (фрагмент)':'')).join('\n')+'\n\nСтруктура (до 100 файлов):\n'+snapshot.structure.join('\n');details.open=true;}
 action('Выбрать папку',async()=>{const result=await window.petya.localProjectConnect(select.value);if(result.canceled)return;await refresh();show(result);});
 action('Обновить контекст',async()=>{show(await window.petya.localProjectRefresh(select.value));status.textContent='Контекст перечитан · '+(projects.find(p=>p.id===select.value)?.folder||'');status.className='connection-status connected';});
 action('Отключить',async()=>{await window.petya.localProjectDisconnect(select.value);await refresh();});
 select.onchange=display;select.onfocus=()=>{if(!busy)refresh().catch(e=>status.textContent=e.message);};
 card.append(icon,heading,help,label,status,row,details);form.prepend(card);
 document.addEventListener('petya-settings-displayed',()=>refresh().catch(e=>status.textContent=e.message));
 refresh().catch(e=>status.textContent=e.message);
})();
