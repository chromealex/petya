(()=>{
// The Notion card of «Notion» in «Настройки» → «Сервисы»: sign-in through the browser (Petya's OAuth broker) or a
// token from an internal Notion connection, and «Сохранить и проверить» (connection-check.cjs). The card is Petya's
// shared service card (window.addConnectionCard, src/ui/connections.js); its markup moved here from src/ui/index.html.
// `data-clear-secret`: the form's save sends «Удалить сохранённый токен» as Petya's own cards do.
const form=$('settings-form');
const card=document.createElement('article');card.className='card';
card.innerHTML=`<div class="eyebrow">ДОКУМЕНТАЦИЯ</div><h2>Notion</h2><div class="connection-help" data-help-title="Пошаговая настройка Notion"><h3>Как подключить Notion</h3><ol><li><strong>Создайте подключение.</strong> Нажмите «Создать подключение в Notion» выше. В Notion выберите New connection / New integration, назовите его «Петя» и выберите рабочее пространство с вашей документацией. Тип — Internal (внутреннее).</li><li><strong>Разрешите чтение.</strong> В Capabilities (права доступа) включите Read content и сохраните.</li><li><strong>Скопируйте токен.</strong> В настройках созданного подключения найдите Internal Integration Secret / Internal connection token, нажмите Show, затем Copy. Вставьте скопированное значение в поле ниже.</li><li><strong>Дайте доступ к страницам.</strong> Откройте нужную страницу в Notion → ••• → Connections → Add connections → выберите «Петя». Повторите для нужных разделов документации.</li><li><strong>Проверьте подключение.</strong> Вернитесь сюда и нажмите «Сохранить и проверить». Петя проверит токен и наличие доступных страниц.</li></ol><p class="small">Нет кнопки создания или нужного рабочего пространства? Попросите владельца рабочего пространства создать внутреннее подключение.</p></div><label>Токен подключения Notion<input name="notionToken" type="password" autocomplete="off" placeholder="Вставьте токен, скопированный из Notion"></label><label class="check"><input name="clear_notionToken" type="checkbox" data-clear-secret>Удалить сохранённый токен</label><p class="small">Петя ищет по названиям страниц, доступных подключению. Содержимое документа добавляется в контекст после вашего выбора.</p>`;
const slack=form.querySelector('[data-service="slack"]');
if(slack)slack.after(card);else form.insertBefore(card,form.querySelector(':scope > button'));
window.addConnectionCard({id:'notion',title:'Notion',description:'Документация и требования',field:'notionToken',flag:'hasNotionToken',fields:['notionToken'],oauth:true,
 guideLabel:'Настройки Notion ↗',connected:'Доступны страницы, выбранные при входе.',
 placeholder:{saved:'Токен сохранён. Оставьте пустым, чтобы использовать его',empty:'Вставьте токен, скопированный из Notion'}});
})();
