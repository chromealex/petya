// People's names in Russian: «Konstantin Shishlov» → «Константин Шишлов». Only names that are clearly Russian
// names written in Latin are converted (the first name is a known Russian name); «John Smith» stays as is.
// The Latin spelling is kept by the caller as an alias, so Slack, Jira and meeting apps still match the person.
const FIRST={
 aleksandr:'Александр',alexander:'Александр',alexandr:'Александр',aleksandra:'Александра',alexandra:'Александра',alexey:'Алексей',aleksey:'Алексей',alexei:'Алексей',aleksei:'Алексей',
 alina:'Алина',alisa:'Алиса',alla:'Алла',anastasia:'Анастасия',anastasiya:'Анастасия',anatoly:'Анатолий',anatoliy:'Анатолий',andrey:'Андрей',andrei:'Андрей',angelina:'Ангелина',
 anna:'Анна',anton:'Антон',arina:'Арина',arkady:'Аркадий',arseny:'Арсений',arseniy:'Арсений',artem:'Артём',artyom:'Артём',artur:'Артур',boris:'Борис',bogdan:'Богдан',
 daria:'Дарья',darya:'Дарья',dasha:'Даша',david:'Давид',denis:'Денис',diana:'Диана',dmitry:'Дмитрий',dmitriy:'Дмитрий',dmitrii:'Дмитрий',egor:'Егор',yegor:'Егор',
 ekaterina:'Екатерина',yekaterina:'Екатерина',elena:'Елена',yelena:'Елена',elizaveta:'Елизавета',evgeny:'Евгений',evgeniy:'Евгений',evgenii:'Евгений',yevgeny:'Евгений',evgenia:'Евгения',
 fedor:'Фёдор',fyodor:'Фёдор',gennady:'Геннадий',georgy:'Георгий',georgiy:'Георгий',gleb:'Глеб',grigory:'Григорий',grigoriy:'Григорий',igor:'Игорь',ilya:'Илья',ilia:'Илья',
 inna:'Инна',irina:'Ирина',ivan:'Иван',kirill:'Кирилл',konstantin:'Константин',kristina:'Кристина',ksenia:'Ксения',kseniya:'Ксения',larisa:'Лариса',lev:'Лев',leonid:'Леонид',
 lidia:'Лидия',liliya:'Лилия',lilia:'Лилия',lyudmila:'Людмила',ludmila:'Людмила',makar:'Макар',maksim:'Максим',maxim:'Максим',margarita:'Маргарита',maria:'Мария',mariya:'Мария',
 marina:'Марина',mark:'Марк',matvey:'Матвей',mikhail:'Михаил',michail:'Михаил',nadezhda:'Надежда',natalia:'Наталья',natalya:'Наталья',nataliya:'Наталья',nikita:'Никита',
 nikolay:'Николай',nikolai:'Николай',nina:'Нина',oksana:'Оксана',oleg:'Олег',olga:'Ольга',pavel:'Павел',petr:'Пётр',pyotr:'Пётр',polina:'Полина',roman:'Роман',ruslan:'Руслан',
 semyon:'Семён',semen:'Семён',sergey:'Сергей',sergei:'Сергей',sofia:'София',sofiya:'София',sophia:'София',stanislav:'Станислав',stepan:'Степан',svetlana:'Светлана',taisia:'Таисия',
 tatiana:'Татьяна',tatyana:'Татьяна',timofey:'Тимофей',timur:'Тимур',ulyana:'Ульяна',valentin:'Валентин',valentina:'Валентина',valeria:'Валерия',valeriya:'Валерия',valery:'Валерий',
 vadim:'Вадим',varvara:'Варвара',vasily:'Василий',vasiliy:'Василий',vera:'Вера',viktor:'Виктор',victor:'Виктор',viktoria:'Виктория',victoria:'Виктория',vitaly:'Виталий',vitaliy:'Виталий',
 vladimir:'Владимир',vladislav:'Владислав',vlad:'Влад',vyacheslav:'Вячеслав',yaroslav:'Ярослав',yana:'Яна',yulia:'Юлия',yuliya:'Юлия',julia:'Юлия',yury:'Юрий',yuri:'Юрий',yuriy:'Юрий',
 zakhar:'Захар',zhanna:'Жанна',sasha:'Саша',masha:'Маша',misha:'Миша',kostya:'Костя',zhenya:'Женя',lena:'Лена',katya:'Катя',nastya:'Настя',dima:'Дима',
};
// Romanization back to Cyrillic, longest sequences first.
const PAIRS=[['shch','щ'],['sch','щ'],['yo','ё'],['yu','ю'],['ya','я'],['ye','е'],['zh','ж'],['kh','х'],['ts','ц'],['ch','ч'],['sh','ш'],['iy','ий'],['yy','ый'],
 ['a','а'],['b','б'],['v','в'],['w','в'],['g','г'],['d','д'],['e','е'],['z','з'],['i','и'],['y','ы'],['k','к'],['l','л'],['m','м'],['n','н'],['o','о'],['p','п'],['r','р'],['s','с'],['t','т'],
 ['u','у'],['f','ф'],['h','х'],['c','к'],['j','й'],['q','к'],['x','кс']];
const VOWELS='аеёиоуыэюя';
function word(latin){
 const w=latin.toLowerCase();let out='';
 for(let i=0;i<w.length;){
  const pair=PAIRS.find(([l])=>w.startsWith(l,i));if(!pair){out+=w[i];i++;continue;}
  let ru=pair[1];
  // «y» after a vowel or at the end of «-iy/-ey/-ay» is «й»; at the start before a vowel the pairs above handle it.
  if(pair[0]==='y'&&(VOWELS.includes(out.at(-1)||'')||i===w.length-1))ru='й';
  if(pair[0]==='e'&&(i===0||VOWELS.includes(out.at(-1)||'')))ru='е';
  out+=ru;i+=pair[0].length;
 }
 // Common surname endings: «-sky» → «-ский», «-oy» → «-ой».
 out=out.replace(/ск[ыи]?й$/,'ский').replace(/цк[ыи]?й$/,'цкий');
 return out.charAt(0).toUpperCase()+out.slice(1);
}
const isLatinName=name=>/^[A-Za-z][A-Za-z'’-]*(\s+[A-Za-z][A-Za-z'’.-]*){0,3}$/.test(String(name||'').trim());
// Returns the Russian spelling, or '' when the name should stay as written.
function russian(name){
 const text=String(name||'').trim();if(!isLatinName(text))return '';
 const parts=text.split(/\s+/);const first=FIRST[parts[0].toLowerCase().replace(/[^a-z]/g,'')];
 const lastFirst=parts.length>1?FIRST[parts.at(-1).toLowerCase().replace(/[^a-z]/g,'')]:'';
 // «Shishlov Konstantin»: the first name may come last.
 if(!first&&!lastFirst)return '';
 return parts.map((p,i)=>{const known=FIRST[p.toLowerCase().replace(/[^a-z]/g,'')];return known||(/^[A-Za-z]\.?$/.test(p)?word(p.replace('.',''))+'.':p.split('-').map(word).join('-'));}).join(' ');
}
module.exports={russian,word};
