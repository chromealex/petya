function intent(command) {
  const prefab = /^(?:покажи|найди|открой|посмотри)\s+(?:мне\s+)?(?:Unity[- ]+)?префаб\s+(.+?)\s*$/iu.exec(command);
  if (prefab) {
    const query=prefab[1].replace(/^[«"]|[»".?!]+$/gu,'').trim().slice(0,160);
    if (query) return {query};
  }
  if (!/unity|юнити/iu.test(command) || !/^(?:покажи|посмотри|прочитай|проверь|выведи|перечисли|какие|что в)/iu.test(command)) return null;
  if (/консол|ошибк/iu.test(command)) return {name:'read_console',arguments:{action:'get',...(/ошибк/iu.test(command)?{types:['error']}:{})}};
  if (/иерархи|объект.*сцен|сцен.*объект/iu.test(command)) return {name:'manage_scene',arguments:{action:'get_hierarchy'}};
  if (/инструмент|возможност|ресурс|\bmcp\b/iu.test(command)) return {catalog:true};
  return null;
}
module.exports = {intent};
