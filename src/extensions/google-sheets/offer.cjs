// When to offer «Google Таблицы» to someone who has not added it (or has not given it access yet).
// Only by name or by a spreadsheet link: «таблица» alone is too often a file, a table in the answer or a game table.
const auth=require('./auth.cjs');
module.exports={
 id:'google-sheets',name:'Google Таблицы',
 pitch:'открою Google Таблицу прямо в чате — листы, поиск по ячейкам, новую строку и выгрузку из других карточек; записываю только после вашего подтверждения',
 names:[/(?:гугл|google)[\s-]*(?:таблиц\p{L}*|sheets?|шит\p{L}*)|(?:^|[^\p{L}])spreadsheets?(?=$|[^\p{L}])/iu],
 topics:[/docs\.google\.com\/spreadsheets\//iu],
 // Reconciling a sheet with game configs is «Конфиги и баланс»; Excel/CSV files, tables drawn in an answer,
 // localization tables and leaderboards are not Google Sheets.
 avoid:[/конфиг|свер(?:ь|ить|ка)|расхожд|локализ|таблиц\p{L}*\s+(?:умножени|лидер|рекорд)|(?:составь|сделай|нарисуй)\s+(?:мне\s+)?таблиц|в\s+виде\s+таблиц|(?:^|[^\p{L}])(?:excel|xlsx|csv)(?=$|[^\p{L}])|эксел/iu],
 requests:[/(?:покажи|открой|найди|поищи|добавь|выгрузи|что|какие|подключи)/iu],
 connect:'settings',
 connected:settings=>auth.connected(settings),
 ready:settings=>settings['extension_google-sheets']==='true'&&auth.connected(settings)
};
