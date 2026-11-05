const {intent} = require('./intent.cjs');
module.exports = {
  type:'unity',name:'Unity Editor',description:'Префабы, иерархия сцены, консоль и инструменты подключённого редактора.',
  agent:'Диагностика и правки открытого проекта Unity: сцены, игровые объекты, компоненты, физика, анимация, ассеты и ошибки редактора.',
  agentTurn:(s,command,check)=>s.unity.assistTurn(command,check),
  matches:command=>Boolean(intent(command)),
  turn:(s,command)=>s.unity.turn(command)
};
