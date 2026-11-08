// «Поиск по всему», the request: whether it is a search everywhere («найди везде про матчмейкинг», «где обсуждали
// оплату в Китае», «поиск по всему: лиги») or an answer from the last results («ответь по найденному»), the subject
// without the trigger words, and its search terms as stems (a light Russian/English suffix stripper, so «оплату»,
// «оплата», «оплаты» meet, and «Китае» meets «Китай»).
const SEARCH=/(?:^|[^\p{L}])(?:найди|найти|поищи|поискать|ищи|искать|отыщи)\s+(?:мне\s+|нам\s+)?(?:везде|повсюду|всюду)(?=$|[^\p{L}])|(?:найди|найти|поищи|ищи|поиск\p{L}*)\s+по\s+(?:всему|всем\s+источникам|всем\s+сервисам)(?=$|[^\p{L}])|(?:^|[^\p{L}])поиск\p{L}*\s+(?:везде|повсюду)(?=$|[^\p{L}])|(?:^|[^\p{L}])где\s+(?:мы\s+|у\s+нас\s+|вообще\s+|ещё\s+|еще\s+)?(?:обсуждали|обсуждалось|обсуждался|обсуждалась|говорили|писали|упоминали|упоминалось|упоминался|упоминалась|спорили|решали)(?=$|[^\p{L}])/iu;
const ANSWER=/(?:^|[^\p{L}])(?:ответь|ответ|расскажи|подытожь|резюмируй|суммируй|обобщи|скажи)\p{L}*\s+(?:мне\s+)?(?:по|на\s+основе|из|исходя\s+из)\s+(?:найденн\p{L}*|результат\p{L}*\s+поиска|результат\p{L}*)|(?:^|[^\p{L}])(?:подытожь|резюмируй|суммируй|обобщи|перескажи)\s+(?:найденн\p{L}*|результат\p{L}*\s+поиска)/iu;
// Neighbours: the internet (web search), a spreadsheet (Google Sheets), a file or folder by name (files), a person
// («кто знает»), contacts.
const AVOID=/(?:^|[^\p{L}])(?:в\s+интернете|в\s+сети|в\s+гугле|в\s+google|в\s+яндексе|в\s+вебе|онлайн|в\s+таблиц\p{L}*|google\s+sheets|гугл[- ]?таблиц\p{L}*|кто\s+знает|кто\s+разбирается|к\s+кому)(?=$|[^\p{L}])|(?:найди|поищи|ищи)\s+(?:мне\s+)?(?:везде\s+)?(?:файл\p{L}*|папк\p{L}*|человек\p{L}*|сотрудник\p{L}*|контакт\p{L}*|номер\p{L}*\s+телефон\p{L}*)/iu;
const TRIGGERS=[
 /^\s*(?:петя|petya)[,!:]?\s*/iu,
 /(?:найди|найти|поищи|поискать|ищи|искать|отыщи)\s+(?:мне\s+|нам\s+)?(?:везде|повсюду|всюду)(?:\s+(?:в\s+)?(?:slack|слаке|jira|джире|почте|confluence|notion|телеграме|telegram))*/giu,
 /(?:найди|найти|поищи|ищи|поиск\p{L}*)\s+по\s+(?:всему|всем\s+источникам|всем\s+сервисам)/giu,
 /поиск\p{L}*\s+(?:везде|повсюду)/giu,
 /где\s+(?:мы\s+|у\s+нас\s+|вообще\s+|ещё\s+|еще\s+)?(?:обсуждали|обсуждалось|обсуждался|обсуждалась|говорили|писали|упоминали|упоминалось|упоминался|упоминалась|спорили|решали)/giu
];
const LEAD=/^(?:про|о|об|обо|насч[её]т|по\s+поводу|по\s+теме|на\s+тему|тему|всё|все|что-нибудь|что-то|что\s+есть|упоминания|упоминание)\s+/iu;
const STOP=new Set(('и или а но в во на по про о об обо с со к ко у за из от до для что как это мы вы я он она они оно все всё нас наш наша наши ваш где когда был была было были '+
 'ли же бы не ни то так там тут этот эта эти тот та те его её их мне нам вам какой какая какие который которая которые есть ещё еще уже очень просто '+
 'the a an of in on for and or to is are was were be by with from at as it this that').split(' '));

const ENDINGS=['иями','ями','ами','иях','ого','его','ому','ему','ыми','ими','ией','ость','ться','ешь','ете','ала','али','ало','ила','или','ило','ия','ие','ий','ой','ей','ый','ая','яя','ое','ее','ые','ях','ах','ом','ем','ам','ям','ов','ев','ую','юю','ть','ет','ут','ют','ит','ат','ят','ил','ла','ли','ло','а','я','о','е','ы','и','у','ю','ь','й'];
const norm=w=>String(w||'').toLowerCase().replace(/ё/g,'е');
function stem(word){
 const w=norm(word);
 if(/^[а-я]+$/.test(w)&&w.length>=4){const min=w.length>=5?4:3;for(const e of ENDINGS)if(w.endsWith(e)&&w.length-e.length>=min)return w.slice(0,-e.length);return w;}
 if(/^[a-z]+$/.test(w)&&w.length>=5){for(const e of ['ings','ing','ies','es','ed','s'])if(w.endsWith(e)&&w.length-e.length>=4)return e==='ies'?w.slice(0,-3)+'y':w.slice(0,-e.length);}
 return w;
}
const WORD=/[\p{L}\p{N}][\p{L}\p{N}_'-]*(?:\.\d+)*/gu;
// Stems of a text in order (for ranking); short words and stop words are skipped.
function tokens(text){
 const out=[];
 for(const m of String(text||'').matchAll(WORD)){const w=norm(m[0]).replace(/['-]+$/,'');if(w.length<2||STOP.has(w))continue;out.push(stem(w));}
 return out;
}

function kind(text){
 const t=String(text||'').trim();
 if(!t)return null;
 if(ANSWER.test(t))return 'answer';
 if(AVOID.test(t))return null;
 if(SEARCH.test(t))return 'search';
 return null;
}
// The subject: the request without the trigger, leading «про/о/насчёт», punctuation and quotes.
function subject(text){
 let t=String(text||'');
 for(const re of TRIGGERS)t=t.replace(re,' ');
 t=t.replace(/(?<!\d)[.,](?!\d)|[«»"“”„!?;]+/g,' ').replace(/^\s*:\s*/,'').replace(/\s+/g,' ').trim();
 for(let i=0;i<3;i++)t=t.replace(LEAD,'');
 return t.replace(/^:\s*/,'').trim().slice(0,200);
}
// Search terms: the subject's own words (weight 1) and words the model added (weight 0.6), as unique stems.
function terms(topic,extra=[]){
 const out=new Map();
 for(const m of String(topic||'').matchAll(WORD)){const w=norm(m[0]);if(w.length<2||STOP.has(w))continue;const s=stem(w);if(!out.has(s))out.set(s,{stem:s,word:m[0],weight:1});}
 for(const x of extra){for(const m of String(x||'').matchAll(WORD)){const w=norm(m[0]);if(w.length<3||STOP.has(w))continue;const s=stem(w);if(!out.has(s))out.set(s,{stem:s,word:m[0],weight:0.6,extra:true});}}
 return [...out.values()].slice(0,14);
}
// Whether a text token meets a search term: the same stem, or the same word with a slightly longer or shorter ending
// («игро» from «игрой» meets «игр»).
function meets(token,term){
 if(token===term)return true;
 if(term.length>=3&&token.startsWith(term)&&token.length-term.length<=2)return true;
 return token.length>=4&&term.startsWith(token)&&term.length-token.length<=1;
}
// A regular expression that finds the terms' words in text (a stem and any ending), for snippets and pre-filters.
function pattern(list){
 const stems=[...new Set(list.map(t=>t.stem).filter(Boolean))].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 if(!stems.length)return null;
 return new RegExp('(?<![\\p{L}\\p{N}])(?:'+stems.join('|')+')[\\p{L}\\p{N}]*','giu');
}
// Sources a request names («ответь по найденному в Slack», «только Jira»).
const NAMED={slack:/slack|слак\p{L}*/iu,jira:/jira|джир\p{L}*|жир[аеуы]/iu,confluence:/confluence|конфлюенс\p{L}*|конфл\p{L}*/iu,notion:/notion|ноушн\p{L}*|ноушен\p{L}*/iu,
 mail:/почт\p{L}*|письм\p{L}*|писем|gmail|outlook|mail/iu,telegram:/telegram|телеграм\p{L}*|тг(?=$|[^\p{L}])/iu,meetings:/встреч\p{L}*|созвон\p{L}*|митинг\p{L}*/iu,
 files:/файл\p{L}*|код\p{L}*|проект\p{L}* папк\p{L}*/iu,glossary:/глоссари\p{L}*|термин\p{L}*/iu};
function named(text){return Object.entries(NAMED).filter(([,re])=>re.test(String(text||''))).map(([id])=>id);}
module.exports={kind,subject,terms,tokens,stem,meets,pattern,named,norm,STOP,SEARCH,ANSWER,AVOID};
