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
function transcriptResult(text){const clean=commandTranscript(text);return clean||(String(text||'').trim()?null:'');}
module.exports={commandTranscript,transcriptResult};
