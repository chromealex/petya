// Search terms for a subject («сетевой код», «магазин», «PlayerController»): code identifiers and path parts for
// git, word stems for Jira, Slack and meetings. Code does this without the model (identifiers as written, Russian
// stems, a small dictionary of game-development words); the local model may add English names of the subject as
// they appear in code. Terms only search: nobody is ranked by what the model says.
const STOP=new Set(['код','кода','коде','коду','кодом','коды','кодов','часть','части','штука','штуки','вещь','вещи','тема','теме','темы','тему','проект','проекта','проекте',
 'игра','игры','игре','игру','логика','логике','логику','логики','система','системы','системе','систему','модуль','модуля','модуле','всё','все','это','этот','эта','этом','наш','наша','наше','наши',
 'the','and','for','with','code','system','module','logic','stuff']);
// Russian subject stems → names the code usually uses. Only spelling hints for the search, never evidence.
const DICTIONARY=[
 [/^сет(?:ь|и|ев|ям|ях)/,['net','network','networking','netcode','multiplayer','socket']],
 [/^мультиплеер/,['multiplayer','network','net']],[/^матчмейк/,['matchmaking','matchmaker','lobby']],
 [/^магазин/,['shop','store','iap','purchase','billing']],[/^покуп/,['purchase','iap','billing']],[/^платеж|^платёж/,['payment','billing','iap']],
 [/^инвентар/,['inventory','item','items']],[/^предмет/,['item','items']],[/^сундук/,['chest','loot']],[/^лут/,['loot','drop']],
 [/^сохранен|^сейв/,['save','saves','savegame','persistence']],[/^загрузк/,['loading','loader','load']],
 [/^интерфейс|^ui$|^уи$/,['ui','hud','view','screen']],[/^меню/,['menu','ui']],[/^экран/,['screen','view']],
 [/^шейдер/,['shader','shaders']],[/^рендер/,['render','rendering','graphics']],[/^графи/,['graphics','render']],[/^освещен/,['light','lighting']],
 [/^физик/,['physics','collision']],[/^анимац/,['animation','animator','anim']],[/^звук|^аудио/,['audio','sound','sfx']],[/^музык/,['music','audio']],
 [/^локализац|^перевод/,['localization','l10n','i18n','locale']],[/^аналитик/,['analytics','events','tracking']],[/^реклам/,['ads','advertising','ad']],
 [/^билд|^сборк/,['build','ci','pipeline','gradle']],[/^тест/,['test','tests']],[/^бэкенд|^бекенд|^сервер/,['server','backend','api']],[/^клиент/,['client']],
 [/^авторизац|^логин|^вход/,['auth','login','account']],[/^чат/,['chat']],[/^бо(?:й|ев|я)/,['battle','combat']],[/^оружи/,['weapon','weapons']],
 [/^враг|^противник|^моб/,['enemy','enemies','mob','ai']],[/^ии$|^искусствен/,['ai','behaviour','behavior']],[/^игрок/,['player']],[/^персонаж|^геро/,['character','hero']],
 [/^камер/,['camera']],[/^управлени|^ввод|^контрол/,['input','controls','controller']],[/^уров/,['level','levels']],[/^карт/,['map','level']],
 [/^квест|^задани/,['quest','quests','mission']],[/^достижен|^ачив/,['achievement','achievements']],[/^ивент|^событи/,['event','events','liveops']],
 [/^баттлпас|^боевой пропуск/,['battlepass','pass','season']],[/^валют/,['currency','wallet']],[/^экономик|^баланс/,['economy','balance']],
 [/^уведомлен|^пуш/,['notification','notifications','push']],[/^туториал|^обучени/,['tutorial','onboarding']],[/^крафт/,['craft','crafting','recipe']],
 [/^пул|^пулинг/,['pool','pooling']],[/^ассет|^ресурс/,['asset','assets','addressables','resources']],[/^платформ/,['platform']],
 [/^андроид/,['android']],[/^айос|^ios/,['ios','xcode']],[/^производительн|^оптимизац|^перф/,['performance','profiling','optimization']]
];
const ENDING=/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ые|ие|ая|яя|ое|ее|ую|юю|ой|ей|ий|ый|ом|ем|ах|ях|ам|ям|ов|ев|а|я|о|е|и|ы|у|ю|ь|й)$/u;
// A Russian word without its ending: «сетевом» → «сетев», «магазину» → «магазин».
function stem(word){
 const w=String(word).toLocaleLowerCase().replace(/ё/g,'е');
 if(!/^[а-я]+$/.test(w)||w.length<4)return w;
 const s=w.replace(ENDING,'');
 return s.length>=3?s:w.slice(0,3);
}
const SAFE=/^[\p{L}\p{N}_][\p{L}\p{N}_.\/-]{0,59}$/u;
const isLatin=t=>/^[A-Za-z0-9_.\/-]+$/.test(t);
// CamelCase, snake_case or a file name: searched in code as written.
const isIdentifier=t=>/[a-z][A-Z]|[A-Z][a-z]+[A-Z]|_|\.[A-Za-z]{1,6}$|\//.test(t)&&isLatin(t);
// Path and identifier parts: «Assets/Scripts/Net/PlayerController.cs» → assets, scripts, net, player, controller, cs.
const parts=t=>String(t).split(/[\/\\._\s-]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).map(p=>p.toLowerCase()).filter(Boolean);

// One group per subject word: «UI магазина» → [ui…], [магазин, shop, store…]. A file that matches more groups is
// closer to the subject.
function fromTopic(topic){
 const words=String(topic||'').match(/[\p{L}\p{N}_][\p{L}\p{N}_.\/-]*/gu)||[];
 const groups=[];
 for(const w of words){
  if(isIdentifier(w)){groups.push({identifiers:[w.replace(/[.\/]+$/,'')],latin:[],russian:[]});continue;}
  if(isLatin(w)){const l=w.toLowerCase();if(l.length>=2&&!STOP.has(l))groups.push({identifiers:[],latin:[l],russian:[]});continue;}
  const l=w.toLocaleLowerCase().replace(/ё/g,'е');if(l.length<3||STOP.has(l))continue;
  const g={identifiers:[],latin:[],russian:[stem(l)]};
  for(const [re,names] of DICTIONARY)if(re.test(l))g.latin.push(...names);
  groups.push(g);
 }
 return groups;
}
const uniq=a=>[...new Set(a)].filter(Boolean);
// Joins topic terms with the model's suggestions (if any): identifiers (code search and file names), path words per
// group (file paths), text words (Jira, Slack, meetings). The model's words are synonyms of the whole subject.
function build(topic,model={}){
 const groups=fromTopic(topic);
 const extra=[...(Array.isArray(model.terms)?model.terms:[]),...(Array.isArray(model.paths)?model.paths:[])].map(t=>String(t||'').trim()).filter(t=>SAFE.test(t)).slice(0,16);
 const more={identifiers:[],latin:[],russian:[]};
 for(const t of extra){if(isIdentifier(t))more.identifiers.push(t);else if(isLatin(t))more.latin.push(t.toLowerCase());else for(const g of fromTopic(t)){more.russian.push(...g.russian);more.latin.push(...g.latin);}}
 const identifiers=uniq([...groups.flatMap(g=>g.identifiers),...more.identifiers]).slice(0,8);
 const pathWords=g=>uniq([...g.latin,...more.latin]).filter(p=>p.length>=2&&!STOP.has(p)).slice(0,16);
 const pathGroups=groups.filter(g=>!g.identifiers.length).map(pathWords).filter(g=>g.length);
 if(!pathGroups.length&&more.latin.length)pathGroups.push(pathWords({latin:[]}));
 const text=uniq([...groups.flatMap(g=>g.russian),...more.russian,...groups.flatMap(g=>g.latin),...more.latin].filter(w=>w.length>=3).concat(identifiers)).slice(0,20);
 return {identifiers,pathGroups,paths:uniq(pathGroups.flat()),text};
}
// How many subject groups a file path matches (0 = unrelated): a path part starts with a group word («net» → Net/,
// NetworkManager), or the path contains an identifier («PlayerController» → PlayerController.cs).
function pathScore(file,{pathGroups=[],identifiers=[]}){
 const lower=String(file).toLowerCase();
 if(identifiers.some(i=>lower.includes(i.toLowerCase())))return pathGroups.length+1;
 const p=parts(file);
 return pathGroups.filter(words=>words.some(w=>w.length<=2?p.includes(w):p.some(x=>x.startsWith(w)||(w.length>=5&&x.includes(w))))).length;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// One regular expression for the text sources: stems take an ending, identifiers and English words are whole.
function textPattern(words){
 const list=words.filter(Boolean).map(w=>/^[а-яё]+$/iu.test(w)?escape(w)+'\\p{L}{0,4}':escape(w)+(/^[a-z]+$/.test(w)?'(?:s|es)?':''));
 return list.length?new RegExp('(?:^|[^\\p{L}\\p{N}_])(?:'+list.join('|')+')(?=$|[^\\p{L}\\p{N}_])','iu'):null;
}
module.exports={stem,fromTopic,build,pathScore,textPattern,parts,isIdentifier};
