const assert=require('node:assert/strict'),{commandRoute}=require('../src/extensions/git/workspace.cjs'),{eligible}=require('../src/chat-jobs.cjs');
const groups={
 status:['Можешь проверить гит?','А сейчас можешь гит посмотреть','Пожалуйста, проверь репозиторий'],
 diff:['Можешь показать изменения в файлах?','Давай посмотрим изменения','Покажи разницу в коде'],
 staged:['Что войдёт в коммит?','Можешь показать изменения для коммита?'],
 log:['Можешь показать последние коммиты?','Пожалуйста, покажи историю коммитов','Посмотри историю гита'],
 branches:['Какие есть ветки в проекте?','Можешь перечислить все ветки?','На какой ветке мы сейчас?'],
 createBranch:['Можешь создать новую ветку feature/test?','Давай заведём ветку feature/test','Создай ветку с именем feature/test'],
 switchBranch:['Можешь переключиться на ветку main?','Перейди на ветку main','Теперь переключись на ветку main'],
 stage:['Добавь все изменения в коммит','Можешь добавить файл src/a.js в коммит?','Подготовь src/a.js для коммита','Добавь в коммит src/a.js'],
 unstage:['Убери все файлы из коммита','Можешь убрать файл src/a.js из коммита?','Исключи src/a.js из коммита','Теперь убери из коммита src/a.js'],
 commit:['Можешь сделать коммит с сообщением «Исправлен вход»?','Создай коммит: Исправлен вход','Закоммить изменения с описанием Исправлен вход'],
 fetch:['Сделай fetch из origin','Можешь сделать fetch?','Обнови данные удалённого репозитория','Получи изменения без слияния'],
 pull:['Подтяни изменения из origin','Можешь подтянуть последние изменения?','Получи свежие изменения с сервера','Сделай пулл'],
 push:['Отправь коммиты в origin','Можешь отправить коммиты на сервер?','Давай запушим изменения','Можешь сделать push?'],
 init:['Можешь создать git для этого проекта?','Инициализируй репозиторий в папке проекта','Создай git для проекта']};
// Shared with the composer test; every supported variant traverses its entry point.
function check(){let count=0;for(const [action,phrases]of Object.entries(groups))for(const phrase of phrases){const route=commandRoute(phrase);assert.equal(route?.action,action==='staged'?'diff':action,phrase);if(action==='staged')assert.equal(route.staged,true);assert.equal(eligible(phrase),false,phrase);count++;}
for(const q of ['Не делай push','Можешь не отправлять коммиты?','Как сделать коммит?','Объясни, как переключиться на ветку main','Если получится, сделай push','«Отправь коммиты на сервер»','Перейди в настройки','Посмотри код','Как убрать файл из коммита?'])assert.equal(commandRoute(q),null,q);
for(const q of ['Сделай коммит и пуш','Сделай коммит','Можешь создать новую ветку?','Добавь изменения в коммит'])assert.equal(commandRoute(q)?.action,'clarify',q);
assert.deepEqual(commandRoute('Добавь файлы "src/a, b.js", "src/c d.js" в коммит').paths,['src/a, b.js','src/c d.js']);
assert.equal(commandRoute('Добавь все изменения в коммит').all,true);assert.equal(commandRoute('Убери все файлы из коммита').all,true);
assert.equal(commandRoute('Отправь коммиты в origin').remote,'origin');assert.equal(commandRoute('Подтяни изменения из upstream').remote,'upstream');
assert.equal(commandRoute('Сделай коммит с сообщением «Не удалять: $(touch nope)!»').message,'Не удалять: $(touch nope)!');
console.log('Natural Git: '+count+' variants, negatives, missing arguments, literal paths and messages passed.');}
if(require.main===module)check();module.exports={groups};
