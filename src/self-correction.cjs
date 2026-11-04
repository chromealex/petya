// Corrections inside one utterance: «проект Альфа, нет, проект Бета», «десять плюс пять, нет,
// десять плюс семь», «про Java, нет, лучше про JavaScript». Routing and the model see only the
// corrected request; «создай задачу, нет, ничего не создавай» cancels the action.
const MARKER=/,\s*(?:нет|вернее|точнее|ой|я имел в виду|я имела в виду|в смысле)(?!\s+ли(?:\s|$|[,.!?]))\s*[,—-]?\s+/iu;
const ACTION=/(?:^|\s)(создай|заведи|оформи|добавь|отправь|напиши|удали|запусти|закрой|назначь|перенеси|сделай|опубликуй|перешли|позвони)(?=\s|$|[,.!?])/iu;
const CANCEL=/^(?:лучше\s+)?(?:(?:ничего|пока)\s+)?(?:не\s+(?:создавай|делай|отправляй|пиши|удаляй|запускай|закрывай|назначай|переноси|публикуй|пересылай|надо|нужно|стоит|звони|добавляй)|отмена|отбой|забудь|не надо|стоп)(?=\s|$|[,.!?])/iu;
const COMMAND=/^(?:покажи|открой|найди|расскажи|сделай|посмотри|проверь|напиши|отправь|создай|заведи|скажи|назови|дай|объясни|переведи|посчитай|сравни|запусти|включи|выключи|переключись|какой|какая|какие|сколько|что|кто|где|когда|почему|как)(?=\s|$|[,.!?])/iu;
const INFINITIVE={создай:'создавать',заведи:'заводить',оформи:'оформлять',добавь:'добавлять',отправь:'отправлять',напиши:'писать',удали:'удалять',запусти:'запускать',закрой:'закрывать',назначь:'назначать',перенеси:'переносить',сделай:'делать',опубликуй:'публиковать',перешли:'пересылать',позвони:'звонить'};
const words=s=>s.trim().split(/\s+/u).filter(Boolean);
const bare=w=>w.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}+*/-]/gu,'');
function correctSentence(sentence){
 const m=MARKER.exec(sentence);if(!m)return null;
 const left=sentence.slice(0,m.index).trim(),right=sentence.slice(m.index+m[0].length).trim();
 if(!left||!right||/(?:^|\s)или$/iu.test(left))return null;
 const end=/[.!?]+$/u.exec(right)?.[0]||'';const body=right.slice(0,right.length-end.length).replace(/^(?:лучше|на самом деле|всё-таки|все-таки)\s+/iu,'');
 const action=ACTION.exec(left);
 if(CANCEL.test(right))return action?{cancelled:true,verb:action[1].toLowerCase(),object:left.slice(action.index+action[0].length).trim()}:null;
 const l=words(left),r=words(body);if(!r.length)return null;
 // The correction restarts from a word that already occurred: replace from there.
 const first=bare(r[0]);let at=-1;for(let i=l.length-1;i>=0;i--)if(bare(l[i])===first){at=i;break;}
 if(at>=0)return {text:[...l.slice(0,at),...r].join(' ')+end};
 // A lone word («Альфа, нет, Бета») or a new command («…, нет, покажи задачи») replaces everything.
 if(l.length===1||COMMAND.test(body))return {text:body+end};
 // Otherwise the last word before the marker (a name, number or title) is replaced.
 return {text:[...l.slice(0,-1),...r].join(' ')+end};
}
function resolve(text){
 const source=String(text||'');
 if(/[«»"“”]/u.test(source))return {text:source,changed:false};
 const sentences=source.split(/(?<=[.!?])\s+/u);let changed=false;
 for(let i=0;i<sentences.length;i++){
  // apply repeatedly: «А, нет, Б, нет, В»
  for(let guard=0;guard<3;guard++){const r=correctSentence(sentences[i]);if(!r)break;
   if(r.cancelled){const infinitive=INFINITIVE[r.verb]||'это делать';const object=r.object.replace(/[.!?]+$/u,'');return {text:source,changed:true,cancelled:true,reply:'Хорошо, не буду '+infinitive+(object?' '+object:'')+'.'};}
   sentences[i]=r.text;changed=true;}
 }
 return {text:sentences.join(' '),changed};
}
module.exports={resolve};
