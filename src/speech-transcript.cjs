// Do not turn Whisper's non-speech annotations into commands or guess lost words.
function commandTranscript(text) {
 const value=String(text||'').trim();
 if(!/[\p{L}\p{N}]/u.test(value))return '';
 // Non-lexical vocalizations alone are not commands, regardless of script.
 if(/^(?:[嗯呃啊唔]+|[мМ]{2,}|эм+|uh+|um+|hm+)(?:[\s.,!?。，！？…]*(?:[嗯呃啊唔]+|[мМ]{2,}|эм+|uh+|um+|hm+))*[\s.,!?。，！？…]*$/iu.test(value))return '';
 if(/\[(?:[^\]]*(?:музык|music|тишин|silence|шум|noise|аплодисмент|applause|неразборчив|inaudible)[^\]]*)\]|[♪♫]/iu.test(value))return '';
 // Reject the entire uncertain utterance, never silently execute its prefix.
 if(/(?:^|[.!?]\s*|субтитры\s*[:—-]?\s*)редактор\s+субтитров(?=$|[\s:.,—-])/iu.test(value)&&/корректор/iu.test(value))return '';
 const words=value.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu)||[];
 if(words.length>=8){
  const counts=new Map();for(const word of words)counts.set(word,(counts.get(word)||0)+1);
  if(Math.max(...counts.values())>=6&&Math.max(...counts.values())/words.length>=0.7)return '';
  for(let size=1;size<=5;size++)for(let start=0;start+size*4<=words.length;start++){
   let end=start+size;while(end<words.length&&words[end]===words[start+(end-start)%size])end++;
   if(end-start>=size*4&&(end-start)/words.length>=0.75)return '';
  }
 }
 return value;
}
// Text Whisper makes up on silence or noise: another script while Russian was asked for, or the stock captions of
// video subtitles it was trained on. Returns the reason, or '' for ordinary speech.
const STOCK=/(?:продолжение следует|субтитры (?:сделал|создавал|подготовил)|спасибо за просмотр|подписывайтесь на (?:канал|наш)|ставьте лайк|dimatorzok|amara\.org|редактор субтитров)/iu;
function hallucination(text){
 const value=String(text||''),letters=value.match(/\p{L}/gu)||[];if(!letters.length)return '';
 const foreign=letters.filter(c=>!/[\p{Script=Cyrillic}\p{Script=Latin}]/u.test(c)).length;
 const words=value.match(/[\p{L}\p{N}]+/gu)||[];
 if(foreign>=3&&foreign/letters.length>0.3||foreign&&words.length<=3)return 'другой алфавит';
 // Russian heard as Czech or Polish («říkám, byl čas»): letters of those alphabets.
 if((value.match(/[řěůčšžďťňĺľąęłńśźż]/giu)||[]).length>=2)return 'другой язык';
 // Sounds written as words («Cough.», «(смех)», «*вздох*») and English stock phrases on Russian silence.
 if(/^[\s(\[*]*(?:cough(?:ing|s)?|laugh(?:ing|ter|s)?|sigh(?:s)?|sneez(?:e|ing)|breath(?:ing|es)?|music|applause|silence|noise|кашель|кашляет|смех|смеётся|смеется|вздох|вздыхает|шум|музыка|тишина|аплодисменты)[\s)\]*.!…]*$/iu.test(value))return 'звук, а не речь';
 if(/^(?:thank you(?: for watching| so much| very much)?|thanks for watching|bye(?:-bye)?|you|okay bye|see you(?: next time)?)[\s.!…]*$/iu.test(value.trim()))return 'титры из обучения Whisper';
 if(STOCK.test(value)&&(value.match(/[\p{L}\p{N}]+/gu)||[]).length<=14)return 'титры из обучения Whisper';
 return '';
}
function transcriptResult(text){if(hallucination(text))return null;const clean=commandTranscript(text);return clean||(String(text||'').trim()?null:'');}
module.exports={commandTranscript,transcriptResult,hallucination};
