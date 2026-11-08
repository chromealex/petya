// When to offer «Фокус» to someone who has not added it: focus / pomodoro sessions and «how long did I focus».
// Not camera or input focus, focus groups, or a team planning to «focus on bugs».
module.exports={
 id:'focus',name:'Фокус',
 pitch:'засеку фокус-сессию или помодоро, придержу не срочные уведомления, предупрежу о встрече и посчитаю, сколько вы сфокусировались',
 names:[/(?:^|[^\p{L}])(?:помодоро|pomodoro)(?=$|[^\p{L}])/iu],
 topics:[/(?:^|[^\p{L}])фокус(?:-сесси\p{L}*)?\s+(?:на\s+)?(?:\d{1,3}\s*(?:мин|час)|полчаса|час(?=$|[^\p{L}]))/iu,/фокус-сесси\p{L}*/iu,/сколько\s+(?:я\s+)?(?:сегодня\s+|за\s+неделю\s+|на\s+этой\s+неделе\s+)?(?:я\s+)?с?фокусир\p{L}*/iu,/помоги\s+(?:мне\s+)?(?:с?концентр\p{L}*|сосредоточ\p{L}*)/iu],
 avoid:[/камер|unity|юнити|объектив|автофокус|фокус-?групп|фокусник|с?фокусируемся|фокус\p{L}*\s+(?:ввода|окна|элемент|кнопк|поля)/iu],
 requests:[/(?:^|[^\p{L}])(?:запусти|начни|поставь|засеки|сколько|давай|помоги|фокус)/iu],
 connect:'install',
 ready:settings=>settings.extension_focus==='true'
};
