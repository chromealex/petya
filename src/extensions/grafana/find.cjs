// Which dashboard the user means: the request's words against dashboard titles, tags and folders. Grafana's own
// search matches a title substring only, and titles are often English («Leagues») while the user speaks Russian
// («лиги»), so the list is ranked here: word stems, plus a small glossary of game-analytics words.
const norm=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
// A crude Russian stem: common endings off, at least 3 letters kept.
function stem(word){
 const w=norm(word);
 if(!/[а-я]/.test(w)||w.length<=3)return w;
 const s=w.replace(/(?:ами|ями|ого|его|ому|ему|ыми|ими|ов|ев|ей|ах|ях|ам|ям|ой|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|ом|ем|а|я|ы|и|у|ю|е|о|ь)$/u,'');
 return s.length>=3?s:w.slice(0,3);
}
// Russian stem → English words that mean it in dashboard titles.
const GLOSSARY={лиг:['league'],ретеншн:['retention'],ретенш:['retention'],удержани:['retention'],выручк:['revenue','income'],доход:['revenue','income'],
 платеж:['payment','purchase','billing'],покупк:['purchase','iap'],игрок:['player','user'],пользовател:['user','player'],юзер:['user'],сервер:['server','backend'],
 ошибк:['error'],матч:['match'],турнир:['tournament'],клан:['clan','guild'],гильди:['guild'],магазин:['shop','store'],реклам:['ads','advert','monetization'],
 трафик:['traffic'],установк:['install'],инсталл:['install'],сесси:['session'],онлайн:['online','ccu'],нагрузк:['load','cpu'],задержк:['latency'],очеред:['queue'],
 баз:['database','db'],экономик:['economy'],монетизаци:['monetization'],воронк:['funnel'],когорт:['cohort'],бо:['battle'],битв:['battle'],ивент:['event'],
 событи:['event'],уровн:['level'],квест:['quest'],рейтинг:['rating','rank'],обзор:['overview'],общ:['overview','general','main'],главн:['main','home','overview'],
 продаж:['sales'],подписк:['subscription'],ферм:['farm'],арен:['arena'],сезон:['season'],пропуск:['pass'],награ:['reward'],склад:['inventory'],инвентар:['inventory'],
 чат:['chat'],аккаунт:['account'],регистраци:['registration','signup'],логин:['login'],авториз:['auth'],лидерборд:['leaderboard'],таблиц:['leaderboard','table'],
 бот:['bot'],античит:['anticheat','cheat'],чит:['cheat'],платформ:['platform'],верси:['version'],релиз:['release'],апдейт:['update'],обновлени:['update']};
const tokens=text=>norm(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Score of one dashboard for the request's words. Strict: every word must be found somewhere, or it scores 0.
// Lenient (an explicit «дашборд …» request): words that are not in the title — a variable's value, «для сервера» —
// are skipped, but at least one must match.
function score(d,words,strict=true){
 if(!words.length)return 0;
 const title=tokens(d.title),tags=(d.tags||[]).flatMap(tokens),folder=tokens(d.folder);
 const hit=(list,w)=>{
  const s=stem(w),en=GLOSSARY[s]||GLOSSARY[s.slice(0,-1)]||[];
  if(list.some(x=>x===norm(w)))return 4;
  if(list.some(x=>x.startsWith(s)||s.length>=4&&x.includes(s)))return 3;
  if(en.length&&list.some(x=>en.some(e=>x.startsWith(e))))return 3;
  if(/^[a-z]/.test(w)&&list.some(x=>x.startsWith(w.slice(0,Math.max(3,w.length-2)))))return 2;
  return 0;
 };
 let total=0,found=0;
 for(const w of words){const v=Math.max(hit(title,w),hit(tags,w)-1,hit(folder,w)-2);if(v<=0){if(strict)return 0;continue;}total+=v;found++;}
 return found?total/(strict?words.length:found)-(words.length-found)*0.01:0;
}
// Dashboards ranked for the words; the default folder wins a tie.
function rank(list,words,{folder='',strict=true}={}){
 const f=norm(folder);
 return list.map(d=>({d,score:score(d,words,strict)+(f&&(norm(d.folder)===f||d.folderUid===folder)?0.1:0)})).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score||a.d.title.localeCompare(b.d.title)).map(x=>({...x.d,score:x.score}));
}
// One clear winner, or the top tie to ask about.
function pick(ranked){
 if(!ranked.length)return {none:true};
 const top=ranked.filter(x=>Math.abs(x.score-ranked[0].score)<0.05);
 return top.length===1?{one:top[0]}:{several:top.slice(0,8)};
}
module.exports={stem,score,rank,pick,GLOSSARY,norm};
