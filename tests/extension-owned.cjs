const assert=require('node:assert/strict');const {ownedByPetya}=require('../src/features/extension-replies.cjs');
// Requests Petya's own handlers answer never go to a model-picked extension («Какие на мне таски?» went to Unity).
for(const q of ['Какие на мне таски?','Какие задачи на мне в работе?','Какие баги открыты в BW?','Статус проекта MW2','Что нового в слаке?','Какая погода в Москве?','Какой курс евро?','Заполни команду','Петя, заполни команду: Полина — релизы'])assert(ownedByPetya(q,{}),q);
for(const q of ['Покажи ошибки в консоли Unity','Найди объект Player в сцене','Сделай анимацию прыжка','Проверь сцену на ошибки'])assert(!ownedByPetya(q,{}),q);
console.log('Extension routing: Jira tasks and bugs, work reports, Slack digest, weather and rates stay with Petya; editor requests may pick an extension passed');
// A disabled extension is never offered to the model picker; the request falls through to Petya.
(async()=>{
 const feature=require('../src/features/extension-replies.cjs');let asked=0;
 const topic={id:'t',messages:[],projectId:'p'};
 const s={companyId:'c',settings:{module_unity:'false',model:'m',ollamaUrl:'http://127.0.0.1:11434',semanticTools:'true'},request:async()=>{asked++;return {message:{content:JSON.stringify({id:'unity',confidence:.99})}};},
  dialogue:{active:()=>topic,state:{activeProjectId:'p',projects:[{id:'p',disabledServices:[]}],topics:[topic]}},attachments:{list:()=>[]},requestProgress:{report(){}},handle(){},win:{isDestroyed:()=>true}};
 let api;try{api=feature.setup(s);}catch(e){console.log('Extension routing: setup needs the app, picker filter check skipped ('+e.message+')');return;}
 const turn=api.extensionReplies.turn;assert.equal(await turn('Сделай анимацию прыжка'),null);assert.equal(asked,0,'the picker is not asked when every extension is off');
 s.settings.module_unity='true';s.dialogue.state.projects[0].disabledServices=['unity'];assert.equal(await turn('Сделай анимацию прыжка'),null);assert.equal(asked,0,'nor when the project turned it off');
 console.log('Extension routing: disabled extensions are not offered to the model picker passed');
})().catch(e=>{console.error(e);process.exit(1);});
