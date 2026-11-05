const {intent} = require('./intent.cjs');
module.exports = {
  type:'unity',name:'Unity Editor',description:'Префабы, иерархия сцены, консоль и инструменты подключённого редактора.',
  matches:command=>Boolean(intent(command)),
  turn:(s,command)=>s.unity.turn(command)
};
