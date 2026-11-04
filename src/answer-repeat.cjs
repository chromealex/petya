// Guard against Petya answering the same thing twice in one conversation.
// A repeated question means the previous answer did not help, so a repeat is never useful.
const words=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)||[];
const MIN_WORDS=6; // short factual answers («4», «Да») may legitimately coincide
function similar(a,b){
 const x=words(a),y=words(b);if(x.length<MIN_WORDS||y.length<MIN_WORDS)return false;
 if(x.join(' ')===y.join(' '))return true;
 const A=new Set(x),B=new Set(y);let common=0;for(const w of A)if(B.has(w))common++;
 return common/(A.size+B.size-common)>=0.8;
}
const recentAnswers=(topic,limit=6)=>(topic?.messages||[]).filter(m=>m.role==='assistant'&&typeof m.text==='string').slice(-limit).map(m=>m.text);
const repeated=(answer,topic)=>recentAnswers(topic).some(previous=>similar(answer,previous));
const variants=['Похоже, я хожу по кругу: нужных сведений у меня нет, а прошлый ответ не помог. Подскажи, где их взять, или спроси иначе — попробую по-другому.','Кажется, я снова отвечаю то же самое — значит, у меня не хватает данных. Скажи, что именно нужно или откуда это узнать.'];
// Never returns the text of the previous answer, so the guard itself cannot loop.
function fallback(topic){const last=recentAnswers(topic,1)[0];const used=new Set(recentAnswers(topic,10));return variants.find(v=>!used.has(v))||variants.find(v=>v!==last);}
module.exports={similar,repeated,fallback,recentAnswers};
