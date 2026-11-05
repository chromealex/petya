const assert=require('node:assert/strict');const {ownedByPetya}=require('../src/features/extension-replies.cjs');
// Requests Petya's own handlers answer never go to a model-picked extension («Какие на мне таски?» went to Unity).
for(const q of ['Какие на мне таски?','Какие задачи на мне в работе?','Какие баги открыты в BW?','Статус проекта MW2','Что нового в слаке?','Какая погода в Москве?','Какой курс евро?'])assert(ownedByPetya(q,{}),q);
for(const q of ['Покажи ошибки в консоли Unity','Найди объект Player в сцене','Сделай анимацию прыжка','Проверь сцену на ошибки'])assert(!ownedByPetya(q,{}),q);
console.log('Extension routing: Jira tasks and bugs, work reports, Slack digest, weather and rates stay with Petya; editor requests may pick an extension passed');
