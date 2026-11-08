// «Microsoft Teams» settings: what the extension adds to Petya's meeting recording (start by a Teams call window)
// and which Microsoft accounts of «Календарь» can create Teams meetings (work or school only). When and how meetings
// are recorded is set in Petya's own «Запись встреч» card.
(async()=>{
 await connectionsReady;
 const card=document.createElement('article');card.className='card';card.dataset.extension='teams';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 card.append(el('h2','Microsoft Teams'),
  el('p','Когда идёт звонок или встреча Teams — в приложении Teams или в браузере, — Петя видит окно встречи: запись начинается сама (или Петя спросит — как выбрано в «Запись встреч»). Кто говорит, Teams в заголовке окна не показывает — в расшифровке говорящие не подписаны.'));
 const windows=el('p','','small'),links=el('p','','small'),personal=el('p','','small');
 for(const n of [windows,links,personal])n.setAttribute('role','status');
 card.append(windows,el('h3','Встречи Teams в календаре'),links,personal);
 document.getElementById('settings-form').append(card);
 const v=await window.petya.feature('msTeams','status');
 windows.textContent=!v.windows?'На этом компьютере Петя не видит окна: встречи Teams записываются по кнопке «Слушать встречу».':v.platform==='darwin'?'На macOS нужен доступ к записи экрана — без него Петя не видит заголовки окон Teams и браузера.':'Петя смотрит заголовки окон приложения Teams и браузеров.';
 const names=list=>{const n=document.createElement('span');n.dataset.noI18n='';n.textContent=list.join(', ');return n;};
 if(!v.calendar)links.textContent='Чтобы создавать встречу Teams вместе с событием, добавьте расширение «Календарь» и подключите в нём рабочий аккаунт Microsoft.';
 else if(v.work.length)links.append('Встречу Teams создаёт Microsoft вместе с событием Outlook в аккаунте ',names(v.work),'.');
 else if(v.noCalendar.length)links.append('Разрешите доступ к календарю в настройках «Календаря» для ',names(v.noCalendar),' — тогда в новых встречах появится выбор Teams.');
 else links.textContent='Подключите рабочий или учебный аккаунт Microsoft в настройках «Календаря» — тогда в новых встречах появится выбор Teams.';
 if(v.personal.length)personal.append('Личные аккаунты Microsoft (outlook.com, hotmail) не создают встречи Teams через календарь — для них Teams не предлагается: ',names(v.personal),'.');
 else personal.hidden=true;
})().catch(e=>notice(e.message,true));
