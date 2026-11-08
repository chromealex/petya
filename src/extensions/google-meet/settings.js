// «Google Meet» settings: what the extension adds to Petya's meeting recording (start by a Meet call's browser tab)
// and where Meet links for new meetings come from (the Google account of «Календарь»). When and how meetings are
// recorded is set in Petya's own «Запись встреч» card.
(async()=>{
 await connectionsReady;
 const card=document.createElement('article');card.className='card';card.dataset.extension='google-meet';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 card.append(el('h2','Google Meet'),
  el('p','Когда в браузере открыта вкладка созвона Google Meet, Петя видит её: запись начинается сама (или Петя спросит — как выбрано в «Запись встреч»). Петя видит только активную вкладку окна браузера. Кто говорит, Meet не показывает — в расшифровке говорящие не подписаны.'));
 const windows=el('p','','small'),links=el('p','','small');windows.setAttribute('role','status');links.setAttribute('role','status');
 card.append(windows,el('h3','Ссылки на встречи'),links);
 document.getElementById('settings-form').append(card);
 const v=await window.petya.feature('googleMeet','status');
 windows.textContent=!v.windows?'На этом компьютере Петя не видит окна браузера: созвоны Meet записываются по кнопке «Слушать встречу».':v.platform==='darwin'?'На macOS нужен доступ к записи экрана — без него Петя не видит заголовки окон браузера.':'Петя смотрит заголовки окон браузеров: Chrome, Edge, Firefox, Arc, Яндекс Браузер.';
 const who=document.createElement('span');who.dataset.noI18n='';who.textContent=v.linksAccount;
 if(!v.calendar)links.textContent='Чтобы добавлять ссылку Meet в новые встречи, добавьте расширение «Календарь» и подключите в нём аккаунт Google.';
 else if(!v.calendarAccounts.length)links.textContent=v.googleAccounts?'Разрешите доступ к календарю для аккаунта Google в настройках «Календаря» — тогда в новых встречах появится выбор Google Meet.':'Подключите аккаунт Google в настройках «Календаря» — тогда в новых встречах появится выбор Google Meet.';
 else links.append('Ссылку Meet создаёт Google вместе со встречей в календаре ',who,'. Для встреч Outlook Meet не предлагается.');
})().catch(e=>notice(e.message,true));
