// Which chat requests are coding work for Petya himself, and which are follow-ups on an open review.
// Handoffs to Codex/Claude, build repair, Git commands and Jira tasks keep their own handlers.
// JavaScript's \b and \w do not know Cyrillic, so boundaries here are written with Unicode letter classes.
const L='[\\p{L}\\p{N}_]';
const B='(?:(?<!'+L+')(?='+L+')|(?<='+L+')(?!'+L+'))';
const re=(source,flags='iu')=>new RegExp(source.replace(/\\b/g,B).replace(/\\w/g,L),flags);

const PREFIX=re('^(?:петя[,!\\s]+)?(?:пожалуйста[,\\s]+)?(?:давай[,\\s]+)?');
const VERB=re('^(?:напиши|допиши|перепиши|добавь|реализуй|сделай|создай|исправь|почини|поправь|пофикси|отрефактор\\w*|рефактор\\w*|переименуй|вынеси|раздели|упрости|оптимизируй|покрой|обнови|удали|убери|замени|перенеси|закодь|запрограммируй|имплементируй|доделай|внедри|подключи)\\b');
const CODE=re('(?:\\bкод\\w*|\\bфункци\\w*|\\bметод\\w*|\\bкласс\\w*|\\bтест\\w*|\\bюнит|\\bмодул\\w*|\\bкомпонент\\w*|\\bэндпоинт\\w*|\\bendpoint|\\bapi\\b|\\bскрипт\\w*|\\bбаг\\w*|\\bрефакторинг|\\bобработчик\\w*|\\bвалидаци\\w*|\\bпарсер\\w*|\\bcli\\b|\\bутилит\\w*|\\bконстант\\w*|\\bпеременн\\w*|\\bтипизаци\\w*|\\bхук\\w*|\\bhook\\w*|\\bроут\\w*|\\bмиграци\\w*|\\b(?:в|из|к)\\s+(?:проект\\w*|репозитори\\w*|приложени\\w*)\\b|[\\p{L}\\p{N}_/-]+\\.(?:js|cjs|mjs|ts|tsx|jsx|py|go|rs|cs|java|kt|swift|rb|php|c|cc|cpp|h|hpp|css|scss|html|vue|svelte|sql|sh|json|ya?ml|toml)\\b)');
const EXPLICIT=re('(?:\\bсам(?:о)?\\s+(?:напиши|сделай|поправь|исправь|допиши)\\b.*\\bкод|\\bкак программист|\\bпетя[- ]программист|\\bрежим программиста|\\bзакодь\\b|\\bзапрограммируй\\b|\\bв (?:моём|моем|этом|нашем) (?:проекте|репозитории|коде)\\b)');
const HANDOFF=re('(?:\\bкодекс\\w*|\\bcodex\\b|\\bclaude\\b|\\bклод\\w*|\\bбилд\\w*|\\bсборк\\w*|\\bci\\b|\\bзадач\\w* в (?:jira|джир\\w*|жир\\w*)|\\bjira\\b|\\bджир\\w*|\\bтикет\\w*|\\bкоммит\\w*|\\bзакоммит\\w*|\\bpush\\b|\\bpull\\b|\\bзапушь|\\bветк[уи] [\\p{L}\\p{N}_/-]+$|\\bчерез (?:python|питон\\w*))');
const ELSEWHERE=re('(?:\\bписьм\\w*|\\bсообщени\\w* (?:в|для) |\\bслак\\w*|\\bslack|\\bтелеграм\\w*|\\bпрезентаци\\w*|\\bдокумент(?!аци)\\w*|\\bтаблиц\\w*|\\bexcel|\\bword\\b|\\bpdf\\b|\\bрасскажи|\\bобъясни|\\bчто такое|\\bкак работает|\\bпочему|\\bзачем|\\bзадач\\w*|\\bотч[её]т\\w*|\\bвстреч\\w*)');
const STRONG=re('(?:\\bфункци\\w*|\\bметод\\w*|\\bкласс\\w*|\\bкод\\w*|[\\p{L}\\p{N}_/-]+\\.(?:js|cjs|mjs|ts|tsx|jsx|py|go|rs|cs|java|kt|swift|rb|php|c|cc|cpp|h|hpp|vue|svelte)\\b)');
const KEEP=re('^(?:оставь|сохрани|закоммить)\\s+(?:(?:их|это|правки|изменения)\\s+)?(?:в|во)\\s+(?:отдельн\\w+\\s+)?ветк\\w*$');
const ACCEPT=re('^(?:прими|принимаю|принять|применяй|примени|применить|влей|влить|вливай|смержи|мержи|мёрджи|мерджи|(?:ок|годится|отлично|хорошо),?\\s+(?:влей|прими|принимаю))(?:\\s+(?:правки|изменения|это|их|всё|все|в\\s+\\S+))?$');
const DISCARD=re('^(?:отклони|отклонить|отклоняю|откати|выкинь|выбрось|удали (?:ветку|правки|изменения)|отмени (?:правки|изменения)|не (?:надо|нужно) (?:это|такое|правк\\w*|изменени\\w*))(?:\\s+(?:правки|изменения|это|их|всё|все))?$');
const SHOW=re('^(?:покажи|открой)\\s+(?:дифф?|diff|изменения|правки)$');
const FOLLOW=re('^(?:а\\s+)?(?:ещё|еще|теперь|также|и\\s+ещё|и\\s+еще|только|нет,|не так|тест\\w*)\\b');

const other=t=>HANDOFF.test(t)||(ELSEWHERE.test(t)&&!STRONG.test(t));
function clean(text){return String(text||'').trim().replace(PREFIX,'').trim();}
function isCoding(text){
 const t=clean(text);if(t.length<6||t.length>4000)return false;
 if(other(t))return false;
 if(EXPLICIT.test(t))return true;
 return VERB.test(t)&&CODE.test(t);
}
// Follow-ups that only make sense while a coding result waits for review in this chat.
function decision(text){
 const t=clean(text).replace(/[.!?]+$/,'').trim();
 if(KEEP.test(t))return 'keep';
 if(ACCEPT.test(t))return 'accept';
 if(DISCARD.test(t))return 'discard';
 if(SHOW.test(t))return 'show';
 return '';
}
// A follow-up on the open result («а ещё добавь тест», «переименуй её в sum»).
function refinement(text){
 const t=clean(text);
 if(other(t)||t.length>2000||decision(t))return false;
 return FOLLOW.test(t)||VERB.test(t);
}
module.exports={isCoding,decision,refinement,clean};
