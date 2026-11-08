// «Разбор плейтеста»: negative think-aloud in the transcript Petya's video reader made («[12.0–41.5 с] текст»).
// Only phrases the player said are used, quoted verbatim; a sentence with swearing is marked «негатив» without a quote.
// Whisper's fragments are up to ~30 s long, so a phrase's moment is estimated by its position in the fragment.

// Confusion and frustration said aloud (Russian; English think-aloud is rare and covered by a few words).
const CONFUSED=/не\s+понима\p{L}*|непонятн\p{L}*|что\s+(?:делать|это\s+(?:было|значит)|за\s+(?:фигня|ерунда))|куда\s+(?:идти|жать|нажимать|нажать|дальше)|как\s+(?:тут|здесь)\s+\p{L}+|где\s+(?:кнопка|выход|дверь|тут)|не\s+вижу|не\s+могу\s+найти|не\s+ясно|(?:^|[^\p{L}])(?:what|how do i|where is)(?=$|[^\p{L}])/iu;
const ANGRY=/(?:^|[^\p{L}])(?:опять|снова|блин|ч[её]рт|бесит|достал\p{L}*|раздража\p{L}*|застрял\p{L}*|ну\s+почему|да\s+ладно|невозможно|ужас\p{L}*|отстой|фигня|капец|жесть|нечестно|не\s+(?:получается|работает|успева\p{L}*|могу\s+пройти))(?=$|[^\p{L}])/iu;
// Swearing: detected, never quoted.
const SWEAR=/(?:^|[^\p{L}])(?:х[уy][йяеёию]\p{L}*|п[иі]зд\p{L}*|бл[яь]\p{L}*|[её]б[аеиуо]\p{L}*|сук[аи]|нах(?:ер|рен|уй)\p{L}*|муда\p{L}*|f+u+c+k\p{L}*|shit\p{L}*|wtf)(?=$|[^\p{L}])/iu;

// «[a–b с] text» lines → fragments.
function fragments(transcript){
 const out=[];
 for(const line of String(transcript||'').split('\n')){
  const m=line.match(/^\[(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\s*с\]\s*(.+)$/u);
  if(m)out.push({start:Number(m[1]),end:Number(m[2]),text:m[3].trim()});
 }
 return out;
}
function hallucinated(text){try{return !!require('../../speech-transcript.cjs').hallucination(text);}catch{return false;}}

// [{t, approx, quote|null, swearing, kind:'confused'|'angry'|'swearing', fragment:[start,end]}]
function negative(transcript){
 const found=[];
 for(const f of fragments(transcript)){
  if(hallucinated(f.text))continue;
  const parts=f.text.split(/(?<=[.!?…])\s+/u);let offset=0;
  for(const sentence of parts){
   const at=f.text.indexOf(sentence,offset);offset=at+sentence.length;
   const swearing=SWEAR.test(sentence),confused=CONFUSED.test(sentence),angry=ANGRY.test(sentence);
   if(!swearing&&!confused&&!angry)continue;
   const t=f.start+(f.end-f.start)*(Math.max(0,at)/Math.max(1,f.text.length));
   const quote=swearing?null:sentence.length>220?sentence.slice(0,217).replace(/\s+\S*$/,'')+'…':sentence;
   found.push({t:Math.round(t*10)/10,approx:f.end-f.start>3,quote,swearing,kind:swearing?'swearing':confused?'confused':'angry',fragment:[f.start,f.end]});
  }
 }
 return found;
}
module.exports={fragments,negative,CONFUSED,ANGRY,SWEAR};
