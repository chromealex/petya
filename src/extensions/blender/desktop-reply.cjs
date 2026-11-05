const {animationMode} = require('./animation.cjs');
const acceptsFiles = files => files.length === 1 && /\.blend$/i.test(files[0].name);
module.exports = {
  type:'blender', name:'Blender', description:'Поиск рывков и очистка ключей с предпросмотром движения до и после.', acceptsFiles,
  matches(command,{files}) { return !!animationMode(command + (acceptsFiles(files) ? ' анимация' : '')); },
  turn(s,command,{files}) { return s.blenderMotion.turn(command,files[0]); }
};
