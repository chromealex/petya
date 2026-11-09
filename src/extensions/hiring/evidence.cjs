// «Найм», what may be said about a candidate. The model never ranks or scores people: it may only point at sentences of
// the interviewers' notes that bear on a criterion of the role, and code keeps a point only when its quote is a
// verbatim part of that note. Anything about protected characteristics (age, sex, family, pregnancy, health,
// nationality, religion, appearance, orientation, politics) is never quoted, summarised or used for questions.
const norm=t=>String(t||'').replace(/[«»"“”„]/g,'"').replace(/[‐-―]/g,'-').replace(/ё/g,'е').replace(/\s+/g,' ').trim().toLowerCase();
const clip=(t,n=300)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};

// Protected characteristics in Russian and English. A sentence that mentions one is left out of every summary.
const PROTECTED=/(?:^|[^\p{L}])(?:возраст\p{L}*|\d{2}\s*(?:лет|год)\p{L}*|молод\p{L}*|пожил\p{L}*|стар\p{L}*\s+для|беремен\p{L}*|декрет\p{L}*|дет(?:и|ей|ям|ьми)|ребен\p{L}*|ребён\p{L}*|замуж\p{L}*|женат\p{L}*|разведен\p{L}*|семейн\p{L}*\s+положен\p{L}*|мать|отец|мам[аы]|национальн\p{L}*|этническ\p{L}*|расов\p{L}*|раса|религи\p{L}*|вероисповед\p{L}*|верующ\p{L}*|пол\s+кандидат\p{L}*|женщин\p{L}*|мужчин\p{L}*|девушк\p{L}*|парен\p{L}*|здоровь\p{L}*|инвалид\p{L}*|болезн\p{L}*|болеет|диагноз\p{L}*|внешност\p{L}*|внешн\p{L}*\s+вид|акцент\p{L}*|ориентаци\p{L}*|политическ\p{L}*|gender|pregnan\p{L}*|religio\p{L}*|ethnic\p{L}*|disabilit\p{L}*|married|age)(?=$|[^\p{L}])/iu;
const protectedText=t=>PROTECTED.test(String(t||''));

// Sentences of a note: lines, «;» and sentence ends.
function sentences(text){
 return String(text||'').split(/\n+|;\s*|(?<=[.!?])\s+/u).map(x=>x.replace(/^\s*(?:[-–—*•]|\d+[.)])\s+/u,'').trim()).filter(x=>x.length>=6);
}
// Whether `quote` is a verbatim part of `text` (spacing, quotes, dashes and ё normalised; at least 8 characters).
function verbatim(quote,text){const q=norm(quote);return q.length>=8&&norm(text).includes(q);}

// Stems of a criterion («проектирование API» → «проектир», «api») for the rule-based matching.
function stems(criterion){
 return String(criterion||'').toLowerCase().replace(/ё/g,'е').split(/[^\p{L}\p{N}+#.]+/u).filter(w=>w.length>=2&&!/^(?:и|в|на|по|с|для|от|до|опыт|умени\p{L}*|знани\p{L}*|работ\p{L}*)$/u.test(w))
  .map(w=>/^[a-z0-9+#.]+$/.test(w)?w:w.slice(0,Math.max(4,Math.min(8,w.length-2))));
}

// Per criterion: verbatim quotes with who said them and in which round. `model` is the model's mapping
// [{criterion, note, quote}] (null without a model); every point is checked here. Without a model, sentences that
// name a criterion's words are quoted. Quotes about protected characteristics are dropped and counted.
function summarize({criteria,notes,model=null}){
 const byId=new Map(notes.map((n,i)=>['N'+(i+1),n]));
 const rows=criteria.map(c=>({criterion:c,quotes:[]}));
 const other=[];let rejected=0;
 const add=(row,n,quote)=>{if(row.quotes.some(q=>norm(q.text)===norm(quote)))return;row.quotes.push({text:clip(quote,400),note:n.id,interviewer:n.interviewer,round:n.round,date:n.date});};
 if(Array.isArray(model)){
  for(const m of model){
   const n=byId.get(String(m?.note||'')),row=rows.find(r=>norm(r.criterion)===norm(m?.criterion));
   const quote=String(m?.quote||'').trim();
   if(!n||!quote||!verbatim(quote,n.text)){rejected++;continue;}
   if(protectedText(quote))continue;
   if(row)add(row,n,quote);else if(other.length<6&&!other.some(o=>norm(o.text)===norm(quote)))other.push({text:clip(quote,400),note:n.id,interviewer:n.interviewer,round:n.round,date:n.date});
  }
 }else{
  for(const n of notes)for(const sentence of sentences(n.text)){
   if(protectedText(sentence))continue;
   for(const row of rows){const words=stems(row.criterion);if(words.length&&words.some(w=>norm(sentence).includes(w)))add(row,n,sentence);}
  }
 }
 // Sentences about protected characteristics, counted once whichever path read the notes: the card says they were left out.
 const dropped=notes.reduce((n,x)=>n+sentences(x.text).filter(protectedText).length,0);
 for(const r of rows)r.quotes=r.quotes.slice(0,6);
 return {criteria:rows,other,dropped,rejected};
}

// Lines of earlier rounds to come back to: doubts the interviewers wrote down, quoted as written.
const DOUBT=/(?:не\s+уверен\p{L}*|сомнева\p{L}*|сомнени\p{L}*|слаб\p{L}*|поверхностн\p{L}*|не\s+смог\p{L}*|не\s+смогла|не\s+знает|не\s+знал\p{L}*|путал\p{L}*|плава\p{L}*|проверить|уточнить|доспросить|вернуться\s+к|не\s+успели|не\s+обсудили|вопрос\s+остал\p{L}*|непонятно)/iu;
function followups(notes,limit=5){
 const out=[];
 for(const n of notes)for(const sentence of sentences(n.text)){
  if(!DOUBT.test(sentence)||protectedText(sentence))continue;
  out.push({text:clip(sentence,300),note:n.id,interviewer:n.interviewer,round:n.round,date:n.date});
  if(out.length>=limit)return out;
 }
 return out;
}

// Questions per skill without a model: two plain ones that ask for experience, not for a grade.
function templateQuestions(skills){
 return skills.flatMap(skill=>[
  {skill,text:'Расскажите о задаче, где вы применяли '+skill+': что было сложным и как вы это решили?'},
  {skill,text:'Какие ошибки или подводные камни в '+skill+' вы встречали и как их находили?'}
 ]);
}
// Keeps model questions that name one of the role's skills and say nothing about protected characteristics.
function checkQuestions(list,skills){
 const out=[];
 for(const q of Array.isArray(list)?list:[]){
  const skill=skills.find(s=>norm(s)===norm(q?.skill));
  const text=clip(q?.text,240);
  if(!skill||text.length<12||protectedText(text)||out.some(o=>norm(o.text)===norm(text)))continue;
  if(out.filter(o=>o.skill===skill).length>=3)continue;
  out.push({skill,text});
 }
 return out;
}

// Requests to compare, rank or grade people: the app does not do that.
const RANKING=/(?:кто\s+(?:из\s+(?:них|кандидат\p{L}*)\s+)?(?:лучше|сильнее|слабее|хуже|подходит\s+больше)|(?:ранжируй|отранжируй|рейтинг|проранжируй|сравни|оцени|поставь\s+оценк|выстави\s+балл|баллы|скоринг|отсортируй)\p{L}*\s+(?:\p{L}+\s+)?кандидат\p{L}*|(?:выбери|выбрать|кого\s+(?:взять|нанять|выбрать))\s+(?:\p{L}+\s+)?(?:кандидат\p{L}*|из\s+(?:них|кандидат\p{L}*))|лучш\p{L}*\s+кандидат\p{L}*|кого\s+(?:из\s+кандидатов\s+)?(?:взять|нанять))/iu;

module.exports={PROTECTED,protectedText,sentences,verbatim,stems,summarize,followups,templateQuestions,checkQuestions,RANKING,norm,clip};
