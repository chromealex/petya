// Prepare a spoken copy; technical identifiers remain untouched in chat history.
function spokenText(value) {
 if(typeof value!=='string'||value.length>12000)throw Error('Слишком длинный ответ для озвучивания.');
 return value
  .replace(/```[\s\S]*?```/g,' Код показан на экране. ')
  .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1')
  .replace(/https?:\/\/\S+/g,' ссылка на экране ')
  .replace(/([\w.-]+)-(\d+)-g[0-9a-f]{7,64}(-dirty)?\b/gi,(_,tag,count,dirty)=>`${tag}, ${count} коммитов после тега${dirty?', есть незакоммиченные изменения':''}`)
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'')
  .replace(/((?:коммит\p{L}*|commit|sha(?:-?256|-?1)?|х[еэ]ш\p{L}*)\s*[:#=]?\s*)[0-9a-f]{7,64}\b/giu,'$1')
  .replace(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,64}\b/gi,'')
  .replace(/#[0-9a-f]{6}\b/gi,'')
  .replace(/\p{Extended_Pictographic}|[\uFE0F\u200D]/gu,'')
  .replace(/^[ \t]*[-*#>]+[ \t]+/gm,'')
  .replace(/[\[\]{}*_`~#|\\]/g,' ')
  .replace(/[→⇒←↔]/g,', ')
  .replace(/<=|≤/g,' меньше или равно ').replace(/>=|≥/g,' больше или равно ')
  .replace(/</g,' меньше ').replace(/>/g,' больше ').replace(/=/g,' равно ')
  .replace(/\n+/g,'. ').replace(/([.!?])\s*\./g,'$1').replace(/\.{2,}/g,'.')
  .replace(/\s+([,.;:!?])/g,'$1').replace(/\s+/g,' ').trim();
}
module.exports={spokenText};
