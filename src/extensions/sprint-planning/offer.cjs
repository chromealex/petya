// When to offer «Планирование спринта» to someone who has not added it (or has no Jira connection yet).
// Team workload right now («загрузка команды», «кто перегружен») is Petya's own answer, not this app.
const agile=require('./agile.cjs');
module.exports={
 id:'sprint-planning',name:'Планирование спринта',
 pitch:'посчитаю скорость команды по прошлым спринтам, ёмкость следующего с учётом отпусков и предложу, что в него влезет, — перенос в Jira только после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:velocity|велосити)(?=$|[^\p{L}])/iu],
 topics:[/(?:сплан|планир)\p{L}*\s+(?:\p{L}+\s+)?спринт|план\p{L}*\s+(?:на\s+)?(?:следующ\p{L}*\s+)?спринт/iu,
  /(?:влез|войд[её]т|поместит|успеем)\p{L}*\s+(?:в\s+)?(?:следующ\p{L}*\s+|этот\s+|новый\s+)?спринт/iu,
  /скорост\p{L}*\s+(?:нашей\s+)?(?:команд|спринт|разработк)|^(?:а\s+)?(?:какая|какова)\s+(?:у\s+нас\s+|наша\s+)скорость[?.!]*$/iu,
  /(?:перегруж|недогруж|ёмкост|емкост|capacity)\p{L}*\s+(?:\p{L}+\s+){0,2}(?:в\s+)?спринт|спринт\p{L}*\s+(?:\p{L}+\s+){0,2}(?:перегруж|ёмкост|емкост)/iu],
 // Running sprints, weekend plans, a task's work plan, team workload in general, internet speed.
 avoid:[/бег|забег|спринтер|легк\p{L}*\s+атлет|выходн|по\s+задач|скорост\p{L}*\s+(?:интернет|сет|загрузк|скачиван|печат|набор)/iu],
 requests:[/(?:спланир|сплан|что|какая|кто|покажи|посчитай|собери)/iu],
 connect:'settings',
 ready:settings=>settings['extension_sprint-planning']==='true'&&agile.connected({settings})
};
