// «Договоры в PDF»: which requests are about a contract in a PDF — to read («разбери договор», «какие штрафы в
// договоре») or to compare versions («сравни с прошлой версией договора») — and which terms they ask about.
// A contract is a document here: «договор» in talk about agreements with a colleague, writing a new contract, or
// «договорились» is not it. Without a PDF (attached, a path, the word «PDF», or a contract card earlier in this chat)
// nothing is claimed.
const CONTRACT=/(?:^|[^\p{L}])(?:договор(?:а|у|ом|е|ы|ов|ам|ами|ах)?|контракт(?:а|у|ом|е|ы|ов)?|соглашени(?:е|я|ю|ем|и)|оферт\p{L}*|nda|contract|agreement)(?=$|[^\p{L}])/iu;
const PDF=/(?:^|[^\p{L}])(?:pdf|пдф)(?=$|[^\p{L}])/iu;
const ACTION=/разбер\p{L}*|проанализ\p{L}*|изучи|прочитай|прочти|посмотри|проверь|что\s+(?:в|там|по|за)|извлеки|вытащи|выпиши|найди|покажи|какие|какой|какая|каков\p{L}*|сколько|когда|есть\s+ли|кто|перескажи|кратко|главное|услови\p{L}*|срок\p{L}*|штраф\p{L}*|неустойк\p{L}*|пен[иья](?=$|[^\p{L}])|оплат\p{L}*|платеж\p{L}*|продл\p{L}*|пролонг\p{L}*|расторж\p{L}*|расторгн\p{L}*|лицензи\p{L}*|прав[аоу](?=$|[^\p{L}])|сторон\p{L}*|стоимост\p{L}*|цен[аыу](?=$|[^\p{L}])|сумм\p{L}*|дедлайн\p{L}*|напомин\p{L}*/iu;
const COMPARE=/(?:сравни\p{L}*|сопостав\p{L}*|сверь|отлича\p{L}*|отличи\p{L}*|разниц\p{L}*|(?:^|[^\p{L}])(?:дифф?|diff)(?=$|[^\p{L}])|что\s+(?:\p{L}+\s+)?(?:поменял|изменил)\p{L}*)/iu;
const VERSION=/верси\p{L}*|редакци\p{L}*|прошл\p{L}*|предыдущ\p{L}*|стар\p{L}*|нов\p{L}*|исходн\p{L}*|друг\p{L}*|(?:^|[^\p{L}])(?:два|две|двух|оба|обе|обоих)(?=$|[^\p{L}])/iu;
// Writing a contract, agreements between people, «договорились».
const AVOID=/(?:напиши|составь|подготовь|набросай|создай|сочини|оформи)\s+(?:\p{L}+\s+)?(?:договор|контракт|соглашени)\p{L}*|договорил\p{L}*|договорён\p{L}*|договорен\p{L}*|договорим\p{L}*|договорит\p{L}*|договорив\p{L}*|договориться/iu;
// «договор с Олегом / с коллегой / с командой» without a document is talk about people.
const PEOPLE=/(?:с|между)\s+(?:коллег\p{L}*|командой|ребятами|друг\p{L}*|\p{Lu}\p{Ll}+(?:ом|ой|ем|ей|ёй)(?:\s+и\s+\p{Lu}\p{Ll}+(?:ом|ой|ем|ей|ёй))?)(?=$|[\s,.?!:;])/u;
const STRONG=/(?:разбер|проанализир|изучи|прочитай|прочти)\p{L}*\s+(?:этот\s+|мой\s+|наш\s+|прикрепл\p{L}*\s+|новый\s+)?(?:договор|контракт|соглашени)|(?:штраф|неустойк|пен[иья]|автопродлени|пролонгаци|расторжени)\p{L}*\s+(?:в|по)\s+(?:этому\s+)?(?:договор|контракт)|(?:верси|редакци)\p{L}*\s+(?:договор|контракт)|(?:договор|контракт)\p{L}*\s+(?:в\s+)?(?:pdf|пдф)/iu;
const PATH=/(?:~|\/|[A-Za-z]:\\)[^\s«»"]*?\.pdf(?=$|[\s,.;:!?)»"])/giu;

function about(text,{pdfs=0,hasCard=false}={}){
 const t=String(text||'').trim();
 if(!t||t.length>800||!CONTRACT.test(t)||AVOID.test(t))return null;
 const written=paths(t).length>0,pdf=pdfs>0||written||PDF.test(t);
 if(!pdf&&PEOPLE.test(t))return null;
 // Without a file, only a clearly document request is claimed — to ask for the PDF.
 if(!pdfs&&!written&&!hasCard)return STRONG.test(t)?'need-file':null;
 if(COMPARE.test(t)&&VERSION.test(t)&&(pdf||hasCard))return 'compare';
 if(ACTION.test(t)&&(pdf||hasCard))return pdfs>0||written||hasCard?'analyze':'need-file';
 return null;
}
function paths(text){return [...String(text||'').matchAll(PATH)].map(m=>m[0]);}
// Which terms a question asks about (for a follow-up answered from the card).
const FOCUS=[['penalty',/штраф|неустойк|пен[иья](?=$|[^\p{L}])|санкци/iu],['payment',/оплат|платеж|платёж|аванс|предоплат/iu],['renewal',/продл|пролонг/iu],
 ['termination',/расторж|расторгн|выйти\s+из\s+договор|отказ\p{L}*\s+от\s+договор/iu],['term',/срок\p{L}*\s+действ|до\s+како|когда\s+(?:заканчива|истека|кончает)|действует\s+до/iu],
 ['price',/стоимост|цен[аыу](?=$|[^\p{L}])|сколько\s+стоит|сумм[аы]\s+договор/iu],['parties',/сторон|кто\s+(?:заказчик|исполнитель|подписал)|с\s+кем/iu],['ip',/прав[аоу]?\s+на|исключительн|лицензи|интеллектуальн/iu],
 ['deadlines',/дедлайн|сроки|какие\s+даты|когда\s+(?:платить|оплат)|напомин/iu]];
const focus=text=>FOCUS.filter(([,re])=>re.test(text)).map(([k])=>k);
module.exports={about,paths,focus,CONTRACT};
