// Shared name data and validation for settings, prompts and the settings preview.
class NameProfile{
 static key(value){return String(value).trim().toLocaleLowerCase('ru').replace(/ё/g,'е');}
 static variants(name,custom=''){
  const groups={александр:['Саша','Сань','Санёк'],алексей:['Лёша','Лёх','Лёш'],сергей:['Серёжа','Серёж','Серёга'],михаил:['Миша','Миш','Мишаня'],дмитрий:['Дима','Дим','Димон'],иван:['Ваня','Вань'],андрей:['Андрюша','Андрюх'],николай:['Коля','Коль'],анна:['Аня','Ань','Анюта'],мария:['Маша','Маш','Машенька'],екатерина:['Катя','Кать','Катюша'],елена:['Лена','Лен','Леночка'],ольга:['Оля','Оль']};
  return custom.trim()?custom.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean):groups[name.trim().toLocaleLowerCase('ru')]||[];
 }
 static validate(name='',custom='',excluded=''){
  name=String(name).trim();custom=String(custom).trim();
  const valid=value=>value.length<=50&&/^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u.test(value);
  if(name&&!valid(name))throw Error('В имени допустимы буквы, пробел, апостроф и дефис, до 50 символов.');
  const variants=this.variants(name,custom);
  if(variants.length>8||variants.some(v=>!valid(v)))throw Error('Укажи до восьми обращений через запятую, без цифр и служебных символов.');
  if(!name&&custom)throw Error('Сначала укажи имя.');
  const blocked=String(excluded).split(/[,;\n]/).map(v=>v.trim()).filter(Boolean);
  if(blocked.length>32||blocked.some(v=>!valid(v)))throw Error('Укажи до 32 нежелательных обращений через запятую.');
  const denied=new Set(blocked.map(v=>this.key(v)));
  return {name,custom,excluded:blocked.join(', '),blocked,variants:name?variants.filter(v=>!denied.has(this.key(v))):[],addressName:denied.has(this.key(name))?'':name};
 }
}
if(typeof module!=='undefined')module.exports={NameProfile};
