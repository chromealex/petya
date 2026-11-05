// Only explicit edit requests enter the write-preview pipeline.
function parse(command){
 const text=String(command).trim().replace(/^пожалуйста[, ]+/iu,'');let m;
 if((m=text.match(/^(?:нет[, ]+)?(?:измени|поменяй|оставь)\s+только\s+(первый|второй|третий|четвёртый|четвертый|пятый|\d+)(?:[- ]?(?:й|ый|ой))?\s+пункт[.!]?$/iu)))return {kind:'restrict',number:({первый:1,второй:2,третий:3,'четвёртый':4,четвертый:4,пятый:5})[m[1].toLowerCase()]||Number(m[1])};
 if((m=text.match(/^(?:назначь|переназначь)\s+(?:(?:эту\s+)?задачу\s+|([A-Z][A-Z0-9_]*-\d+)\s+)?(?:на\s+)?(.+?)\s*[.!]?$/iu)))return {kind:'assignee',service:'jira',key:m[1]?.toUpperCase(),query:m[2]};
 if((m=text.match(/^переименуй\s+(?:(?:эту\s+)?задачу\s+|([A-Z][A-Z0-9_]*-\d+)\s+)?в\s+(.+)$/iu)))return {kind:'summary',service:'jira',key:m[1]?.toUpperCase(),value:m[2]};
 if((m=text.match(/^добавь\s+в\s+описание(?:\s+([A-Z][A-Z0-9_]*-\d+))?\s+([\s\S]+)$/iu))){const v=m[2].trim(),criteria=v.match(/^критерии\s+при[её]мки(?:\s*:\s*([\s\S]+))?[.!]?$/iu);return {kind:'append',service:'jira',key:m[1]?.toUpperCase(),value:criteria?criteria[1]||'':v,heading:criteria?'Критерии приёмки':''};}
 if((m=text.match(/^замени\s+(?:в\s+файле(?:\s+[«"]([^»"]+)[»"])?\s+)?[«"]([^»"]+)[»"]\s+на\s+[«"]([^»"]*)[»"]\s*[.!]?$/iu)))return {kind:'replace',service:'files',file:m[1],from:m[2],to:m[3]};
 if((m=text.match(/^замени\s+в\s+файле\s+([^«"\n]+?)\s+на\s+([^»"\n]+)$/iu))&&!m[2].includes(' на '))return {kind:'replace',service:'files',from:m[1],to:m[2]};
 if(/^замени\s+в\s+файле\s+/iu.test(text))return {kind:'replace-help',service:'files'};
 return null;
}
function changedLines(before,after){
 const a=before.split(/\r?\n/),b=after.split(/\r?\n/);let first=0,lastA=a.length,lastB=b.length;
 while(first<lastA&&first<lastB&&a[first]===b[first])first++;
 while(lastA>first&&lastB>first&&a[lastA-1]===b[lastB-1]){lastA--;lastB--;}
 if(a.length===b.length)return a.flatMap((line,i)=>line===b[i]?[]:[{label:'Строка '+(i+1),before:line,after:b[i]}]);
 return [{label:'Изменённый фрагмент · со строки '+(first+1),before:a.slice(first,lastA).join('\n'),after:b.slice(first,lastB).join('\n')}];
}
function restrictPoints(before,after,number){
 const a=before.split(/(?<=\n)/),b=after.split(/(?<=\n)/);
 if(a.length!==b.length)throw Error('Структура списка изменилась. Укажите точный текст замены второго предпросмотра.');
 const starts=a.flatMap((line,i)=>/^\s*(?:\d+[.)]|[-*•])\s+/.test(line)?[i]:[]);
 if(!Number.isInteger(number)||number<1||number>starts.length)throw Error('Не нашёл этот пункт в исходном списке. Укажите текст для замены.');
 const from=starts[number-1],to=starts[number]??a.length;
 return a.map((line,i)=>i>=from&&i<to?b[i]:line).join('');
}
module.exports={parse,changedLines,restrictPoints};
