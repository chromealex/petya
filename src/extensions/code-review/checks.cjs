// Deterministic checks of «Код-ревью», run by code on the added lines whatever the model says: secrets in the diff,
// debug leftovers, TODO without an issue, large files and changed source files without a changed test.
// Every finding points to a real added line (or to the file as a whole) and its text is fixed, so it can be trusted.
const path=require('node:path');

// Token shapes of common services; the value is masked wherever it is shown.
const SECRETS=[
 [/AKIA[0-9A-Z]{16}/,'ключ доступа AWS'],
 [/gh[pousr]_[A-Za-z0-9]{36,}/,'токен GitHub'],
 [/github_pat_[A-Za-z0-9_]{40,}/,'токен GitHub'],
 [/xox[abprs]-[A-Za-z0-9-]{10,}/,'токен Slack'],
 [/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,'приватный ключ'],
 [/AIza[0-9A-Za-z_-]{35}/,'ключ Google API'],
 [/[sr]k_live_[0-9A-Za-z]{20,}/,'ключ Stripe'],
 [/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/,'ключ API'],
 [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,'JWT-токен']
];
// password = "…" written in code: a literal of 8+ characters that is not a placeholder or a read from the environment.
const ASSIGNED=/(?:^|[^\w])(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i;
const PLACEHOLDER=/^(?:x+|\*+|\.+|changeme|change-me|example|placeholder|your[_-]|<|\$\{|%\(|\{\{|test|dummy|fake|sample|redacted|none|null|undefined|password|secret|token)/i;
const SECRET_FILE=/(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|[^/]*\.(?:pem|p12|pfx|keystore|jks|mobileprovision)|id_(?:rsa|ed25519|ecdsa)|\.npmrc|\.pypirc|\.netrc|credentials\.json|service-account[^/]*\.json)$/i;
function secretIn(text){
 for(const [re,what] of SECRETS){const m=text.match(re);if(m)return {what,value:m[0]};}
 const m=text.match(ASSIGNED);if(m&&!PLACEHOLDER.test(m[1])&&!/process\.env|os\.environ|getenv|ENV\[/i.test(text))return {what:'пароль или ключ в коде',value:m[1]};
 return null;
}
// «sk-ab…» — enough to recognise, not enough to use.
function mask(text){
 let out=String(text);
 for(const [re] of SECRETS)out=out.replace(new RegExp(re.source,'g'),v=>v.slice(0,4)+'…');
 return out.replace(new RegExp(ASSIGNED.source,'gi'),(all,value)=>PLACEHOLDER.test(value)?all:all.replace(value,value.slice(0,2)+'…'));
}

const CODE=/\.(?:[cm]?[jt]sx?|py|go|rb|java|kt|kts|cs|swift|rs|php|scala|c|cc|cpp|h|hpp|m|mm|dart|lua|gd|vue|svelte)$/i;
const TEST=/(?:^|\/)(?:tests?|__tests__|specs?|androidTest|testing)\/|[._-](?:test|spec)s?\.[a-z]+$|(?:^|\/)test_[^/]+$|_test\.[a-z]+$|Tests?\.(?:cs|java|kt|swift|m)$/i;
const isTest=file=>TEST.test(file);
const comment=text=>/^\s*(?:\/\/|#|\/?\*|<!--|--|;|%)/.test(text);
// Debug output by language; serious ones (a breakpoint) are warnings, prints are nits.
const DEBUG=[
 [/\.(?:[cm]?[jt]sx?|vue|svelte)$/i,/(?:^|[^\w.])debugger\s*;?\s*$/,'warning','`debugger` останавливает выполнение — уберите перед мержем.'],
 [/\.(?:[cm]?[jt]sx?|vue|svelte)$/i,/(?:^|[^\w.])console\.(?:log|debug|trace|dir)\s*\(/,'nit','Отладочный `console.log` — уберите или замените логгером.'],
 [/\.py$/i,/(?:^|[^\w.])(?:i?pdb\.set_trace|breakpoint)\s*\(\s*\)/,'warning','Точка останова в коде — уберите перед мержем.'],
 [/\.py$/i,/^\s*print\s*\(/,'nit','Отладочный `print` — уберите или замените логгером.'],
 [/\.rb$/i,/\bbinding\.(?:pry|irb)\b/,'warning','`binding.pry` останавливает выполнение — уберите.'],
 [/\.php$/i,/(?:^|[^\w])(?:var_dump|dd|dump)\s*\(/,'warning','Отладочный вывод `var_dump`/`dd` — уберите.'],
 [/\.(?:java|kt)$/i,/System\.(?:out|err)\.print(?:ln)?\s*\(/,'nit','Отладочный вывод в консоль — используйте логгер.']
];
const TODO=/(?:^|[^\w])(TODO|FIXME|XXX|HACK)(?=[^\w]|$)/;
const ISSUE=/#\d+|\b[A-Z][A-Z0-9]{1,9}-\d+\b|https?:\/\/|\bissue\b|задач/i;
const BIG_LINES=800;

const stem=file=>path.basename(file).replace(/\.[^.]+$/,'').replace(/(?:[._-](?:test|spec)s?|Tests?)$/i,'').replace(/^test_/i,'').toLowerCase();

// files: reviewed files (with hunks); skipped: files listed without review; repoFiles: tracked files (for tests).
function run({files,skipped=[],repoFiles=[]}){
 const out=[];
 const add=(file,line,severity,category,comment,check,extra={})=>out.push({file,line,severity,category,comment,check,by:'check',...extra});
 for(const f of [...files,...skipped])if(SECRET_FILE.test(f.path)&&f.reason!=='deleted'&&f.status!=='deleted')add(f.path,null,'blocker','security','Файл с ключами или паролями добавлен в репозиторий. Уберите его из Git и добавьте в .gitignore.','secret-file');
 for(const f of files){
  for(const h of f.hunks)for(const l of h.lines){
   if(l.kind!=='add')continue;
   const secret=secretIn(l.text);
   if(secret){add(f.path,l.n,'blocker','security','Похоже на '+secret.what+' прямо в коде. Уберите из диффа, перевыпустите ключ и читайте его из переменных окружения или хранилища секретов.','secret');continue;}
   if(!isTest(f.path))for(const [ext,re,severity,text] of DEBUG)if(ext.test(f.path)&&re.test(l.text)&&!comment(l.text)){add(f.path,l.n,severity,severity==='warning'?'bug':'style',text,'debug');break;}
   const todo=l.text.match(TODO);
   if(todo&&/(?:\/\/|#|\/\*|<!--|^\s*\*|^\s*--)/.test(l.text.slice(0,todo.index+1))&&!ISSUE.test(l.text))add(f.path,l.n,'nit','style',todo[1]+' без ссылки на задачу — заведите задачу и укажите её номер, иначе он потеряется.','todo');
  }
  if(f.additions>BIG_LINES)add(f.path,null,'warning','style','Большой файл: +'+f.additions+' строк в одном изменении — его трудно проверить. Разбейте на части или вынесите в отдельный PR.','large');
 }
 for(const f of skipped)if(f.reason==='binary'&&f.bytes>1024*1024)add(f.path,null,'warning','perf','Бинарный файл '+(f.bytes/1048576).toFixed(1)+' МБ в репозитории — подумайте о Git LFS.','large');
 // A changed source file without a changed test of the same name; a test that exists but was not touched is a warning.
 const changed=[...files.map(f=>f.path),...skipped.map(f=>f.path)];
 const changedTests=changed.filter(isTest).map(stem);
 for(const f of files){
  if(!CODE.test(f.path)||isTest(f.path)||f.additions<5)continue;
  const name=stem(f.path);if(name.length<3||/^(?:index|main|__init__|mod|lib|app|types?|constants?|config)$/.test(name))continue;
  if(changedTests.some(t=>t===name||t.includes(name)))continue;
  const existing=repoFiles.find(r=>isTest(r)&&(stem(r)===name||stem(r).includes(name)));
  if(existing)add(f.path,null,'warning','test','Код изменён, а тест '+existing+' — нет. Проверьте, что он покрывает новое поведение.','tests',{related:existing});
  else add(f.path,null,'nit','test','Для этого файла не нашлось теста (по имени файла). Стоит добавить тест на изменённое поведение.','tests');
 }
 return out;
}
module.exports={run,secretIn,mask,isTest,stem,SECRETS};
