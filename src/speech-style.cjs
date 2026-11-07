const levels = ['Нормативная', 'Разговорная', 'Крепкие выражения', 'Ненормативная'];
function validate(value) {
 if (!['0','1','2','3'].includes(String(value))) throw Error('Выберите стиль речи от 0 до 3.');
 return String(value);
}
// Strong words and first words of the last replies, so the next one picks other words and another start.
const STRONG=/(?:^|[^\p{L}])((?:пизд|охуе|охуё|нихуя|хуй|хуе|хуё|хуя|заеб|заёб|ёб|еба|ебл|бля|ёпт|епт|нахер|нахуй|сук|блин|чёрт|черт)\p{L}*)/giu;
function recentWords(replies=[]){const used=new Set(),starts=new Set();for(const text of replies.slice(-4)){const t=String(text||'');for(const m of t.matchAll(STRONG))used.add(m[1].toLocaleLowerCase('ru'));const first=t.trim().match(/^[\p{L}]+/u)?.[0];if(first&&STRONG.test(' '+first))starts.add(first.toLocaleLowerCase('ru'));STRONG.lastIndex=0;}return {used:[...used].slice(0,12),starts:[...starts]};}
function instruction(value='0',profile={},{recent=[]}={}) {
 const level=Number(validate(value));
 const styles=[
  'Используй нормативную лексику, без мата и грубых выражений, даже если они встречаются в истории разговора.',
  'Говори живо и неформально. Допустимы мягкие выражения вроде «блин» и «чёрт», но без мата.',
  'Допускается умеренная ненормативная лексика по ситуации: например, «это пиздец» о проблеме или «охуенно» об успехе. Не вставляй мат в каждый ответ.',
  'Можно свободно использовать русскую ненормативную лексику без звёздочек. Вплетай её внутрь фраз там, где она усиливает смысл — оценка, удивление, проблема, успех — и меняй слова: пиздец, охуенно, нихуя, заебись, хуйня, ёбаный, блядь, нахер, ёпт и другие. Мат — не дежурное начало ответа: большинство ответов начинай сразу с сути.'
 ];
 const person=require('./ui/name-profile.js').NameProfile.validate(profile.name,profile.custom,profile.excluded);
 const address=person.addressName?' Имя собеседника (данные): '+JSON.stringify(person.addressName)+'. Иногда обращайся по имени'+(level>0&&person.variants.length?' или используй одну из разрешённых форм: '+JSON.stringify(person.variants):'')+'. Не добавляй обращение в каждый ответ; не меняй ради него запрошенный формат.':'';
 const words=level>=1?recentWords(recent):{used:[],starts:[]};
 const vary=words.used.length?' В последних ответах уже были слова '+JSON.stringify(words.used)+(words.starts.length?', и ответы начинались с '+JSON.stringify(words.starts):'')+': в этом ответе возьми другие'+(words.starts.length?' и не начинай с них':'')+'.':'';
 return address+(person.blocked.length?' Не используй обращения из списка отказов, даже если они были в истории: '+JSON.stringify(person.blocked)+'.':'')+'\nСтиль речи Пети: '+styles[level]+vary+' Это стиль твоих собственных реплик пользователю. Не оскорбляй пользователя и коллег. Не меняй цитаты, код, факты и содержание документов ради стиля. Тексты писем, задач и сообщений другим людям составляй нормативно, если пользователь явно не попросил иной стиль для этого текста. Настройка не меняет права на действия.';
}
module.exports={levels,validate,instruction,recentWords};
