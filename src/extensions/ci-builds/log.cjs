// First error lines of a CI log (GitHub Actions job log or Unity Build Automation build log), found by code.
// Timestamps, ANSI colours and log-group markers are stripped; summary noise («0 errors», «exit code 1») is
// used only when nothing better is found.
const ANSI=/\x1b\[[0-9;?]*[A-Za-z]/g;
const STAMP=/^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\s?/;
const UNITY_PREFIX=/^\s*(?:\d+:\s*)?(?:\[\d{4}-\d\d-\d\d[^\]]*\]\s*)?(?:\[(?:Unity|Xcode|Gradle|SCM|Build|Builder)\]\s*)?/i;
const STRONG=/##\[error\]|\berror\s+(?:CS|TS|FS|C|LNK|MSB)\d+|\bERROR\b|\bFAILED\b|BUILD FAILED|npm ERR!|\bfatal(?: error)?:|\w+(?:Exception|Error):|\bException\b|Traceback \(most recent call last\)|(?:^|\s)error(?:\[[A-Z0-9]+\])?:|\bFAIL\b|[✕✖✗]\s|\bAssertionError\b|\bpanicked at\b|Compilation failed|Scripts have compiler errors/;
const NOISE=/\b0\s+(?:errors?|failed|failures)\b|error(?:s)?\s*[:=]\s*0\b|##\[(?:group|endgroup|debug)\]|^\s*(?:warning|info)\b|\bwarning\s+(?:CS|TS)\d+|continue-on-error|--no-error|ignore[-_ ]?errors?|errorlevel|^\s*(?:Run|shell:)\s/i;
const EXIT=/Process completed with exit code \d+|exited with code \d+|exit status \d+|Build failed|build of .* failed/i;

function clean(line){return line.replace(ANSI,'').replace(STAMP,'').replace(UNITY_PREFIX,'').replace(/^##\[error\]\s*/,'').replace(/\s+$/,'');}
function errorLines(text,{max=8,width=300}={}){
 const raw=String(text||'').split(/\r?\n/);
 const picked=[],seen=new Set();
 const add=line=>{const v=line.trim().slice(0,width);if(!v||seen.has(v))return;seen.add(v);picked.push(v);};
 for(let i=0;i<raw.length&&picked.length<max;i++){
  const original=raw[i].replace(ANSI,'').replace(STAMP,'');
  if(!STRONG.test(original)||NOISE.test(clean(original))||EXIT.test(original))continue;
  add(clean(original));
  // Continuation lines of the same error (indented details, «at …» frames) give the context.
  for(let j=i+1;j<raw.length&&j<=i+2&&picked.length<max;j++){const next=clean(raw[j].replace(STAMP,''));if(/^\s{2,}\S|^\s*at\s|^\s*-->|^\s*\|/.test(raw[j].replace(STAMP,''))&&!NOISE.test(next))add(next);else break;}
 }
 if(!picked.length){
  const exit=raw.map(l=>clean(l.replace(STAMP,''))).filter(l=>EXIT.test(l));
  const tail=raw.map(l=>clean(l.replace(STAMP,''))).filter(l=>l.trim()&&!/^##\[/.test(l)).slice(-4);
  for(const l of [...tail,...exit.slice(-1)])add(l);
 }
 return picked.slice(0,max);
}
module.exports={errorLines,clean};
