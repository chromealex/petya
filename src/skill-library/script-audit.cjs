// Static check of a skill's scripts and SQL before they run: dangerous operations (deleting files,
// dropping databases, piping downloads into a shell, reading keys and passwords, running generated code)
// and SQL mistakes (UPDATE/DELETE without WHERE, «= NULL», a cartesian join, SQL glued from variables).
// Findings are shown to the user before the first run and next to the answer; a critical one makes Petya ask
// even for a built-in skill, and any change in a skill's files asks again. The sandbox still applies: this check is for the user to
// see what a script would do, not a replacement for isolation.
const fs=require('node:fs'),path=require('node:path');
const SCRIPT=/\.(?:py|sh|bash|zsh|js|mjs|cjs|ts|rb|pl|ps1|bat|cmd)$/i,SQL=/\.(?:sql|psql|ddl)$/i;
// [severity, rule id, pattern, explanation]. critical — destroys data, escapes the task or runs code from
// outside; warning — can do harm if pointed at the wrong place; info — worth knowing.
const RULES={
 shell:[
  ['critical','rm-rf',/\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+-?[a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR]|--recursive\s+--force|-[rR][fF]?)\s+(?:--no-preserve-root\s+)?(?:--\s+)?["']?(?:\/(?:["']?\s|$|\*)|~|\$HOME|\$\{?\w+\}?["']?(?:\/?\*?)?(?:\s|$)|\*|\.\.?(?:\/|\s|$))/m,'рекурсивное удаление по корню, домашней папке, переменной или маске'],
  ['warning','rm-r',/\brm\s+-[a-zA-Z]*[rR]/,'рекурсивное удаление папки'],
  ['critical','pipe-shell',/\b(?:curl|wget|fetch)\b[^\n|]*\|\s*(?:sudo\s+)?(?:(?:ba|z|da)?sh|python3?|perl|ruby|node)\b|\b(?:(?:ba)?sh|python3?|perl|node)\s+(?:<\(|-c\s+["']?\$\()\s*(?:curl|wget)/,'скачанный из сети код выполняется сразу'],
  ['critical','disk',/\b(?:mkfs(?:\.\w+)?|fdisk|parted|wipefs)\b|\bdd\b[^\n]*\bof=\/dev\/|>\s*\/dev\/(?:sd|disk|nvme)/,'запись на диск или его форматирование'],
  ['critical','fork-bomb',/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,'форк-бомба'],
  ['critical','secrets',/(?:~|\$HOME|\/home\/\w+|\/Users\/\w+)\/\.(?:ssh|aws|gnupg|kube|docker|config\/gh|netrc)|\bid_(?:rsa|ed25519|ecdsa)\b|\/etc\/(?:shadow|sudoers)|security\s+find-(?:generic|internet)-password|keychain/i,'обращение к ключам, паролям или учётным данным'],
  ['critical','find-delete',/\bfind\s+(?:\/|~|\$HOME)\s[^\n]*(?:-delete|-exec\s+rm\b)/,'удаление файлов по всему диску или домашней папке'],
  ['warning','find-rm',/\bfind\s[^\n]*(?:-delete|-exec\s+rm\b)/,'массовое удаление найденных файлов'],
  ['warning','chmod',/\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx|\+s|u\+s)|\bchown\s+-R\b/,'широкие права или смена владельца'],
  ['warning','sudo',/\bsudo\b|\bsu\s+-/,'запуск с правами администратора'],
  ['warning','system',/\b(?:systemctl|launchctl|crontab|shutdown|reboot|halt|kill\s+-9|pkill|killall)\b|\/etc\/(?:hosts|crontab|profile)|>>?\s*~\/\.(?:bash|zsh)rc/,'изменение системы, автозапуска или процессов'],
  ['warning','git-force',/\bgit\s+(?:push\s+[^\n]*(?:--force|-f)\b|reset\s+--hard|clean\s+-[a-z]*f)/,'необратимые операции git'],
  ['info','network',/(?:^|[;&|(`]|\$\()\s*(?:sudo\s+)?(?:curl|wget|nc|ncat|netcat|ssh|scp|rsync|ftp|telnet)\b/m,'обращение к сети (в изолированной среде сети нет)'],
  ['critical','reverse-shell',/\b(?:nc|ncat|netcat)\b[^\n]*\s-e\s|\/dev\/tcp\//,'обратное подключение к удалённой машине'],
  ['warning','eval',/\beval\s+["'$`]|\bbase64\s+(?:-d|--decode)[^\n]*\|\s*(?:ba)?sh/,'выполнение собранной или закодированной команды']
 ],
 python:[
  ['critical','rmtree-root',/\bshutil\.rmtree\(\s*(?:["']\/["']|["']~|os\.path\.expanduser|Path\.home\(\)|os\.environ)/,'удаление корня, домашней папки или пути из переменных окружения'],
  ['warning','rmtree',/\bshutil\.rmtree\(|\bos\.removedirs\(/,'удаление папок целиком'],
  ['info','remove',/\bos\.(?:remove|unlink|rmdir)\(|\.unlink\(\)|\.rmdir\(\)/,'удаление файлов'],
  ['critical','exec-encoded',/\b(?:exec|eval)\(\s*(?:base64|codecs|zlib|marshal|bytes\.fromhex|__import__)/,'выполнение закодированного кода'],
  ['warning','exec',/(?<![\w.])(?:exec|eval)\(|\bcompile\([^)]*["']exec["']|__import__\(|__builtins__\s*[\[.]|getattr\(\s*(?:builtins|__builtins__)/,'выполнение кода, собранного во время работы'],
  ['warning','process',/\bos\.(?:exec[lv]p?e?|spawn[lv]p?e?|fork|kill)\(|\bpty\.spawn\(/,'запуск или подмена процессов'],
  ['warning','shell',/\bos\.system\(|\bos\.popen\(|\bsubprocess\.\w+\([^)]*shell\s*=\s*True|\bcommands\.getoutput/,'команда через оболочку'],
  ['info','subprocess',/\bsubprocess\.(?:run|call|Popen|check_output|check_call)\(/,'запуск внешних программ'],
  ['warning','pickle',/\b(?:pickle|cPickle|dill|shelve)\.loads?\(|\byaml\.load\((?![^)]*Loader\s*=\s*yaml\.SafeLoader)/,'небезопасная загрузка данных (может выполнить код)'],
  ['critical','secrets',/\.ssh\/|id_(?:rsa|ed25519)|\.aws\/credentials|\.netrc|\/etc\/shadow|keyring\.get_password|browser_cookie|Cookies\.binarycookies|Login Data/i,'чтение ключей, паролей или cookies'],
  ['info','env',/\bos\.environ(?:\.get)?\[?\(?\s*["'][^"']*(?:TOKEN|SECRET|KEY|PASSWORD|PASS)\b/i,'чтение секретов из переменных окружения'],
  ['info','network',/\b(?:requests|httpx|aiohttp|urllib\.request|urllib3|socket|smtplib|ftplib|paramiko)\b/,'обращение к сети (в изолированной среде сети нет)'],
  ['warning','ctypes',/\bimport\s+ctypes\b|\bctypes\.(?:CDLL|cdll|windll)/,'вызов системных библиотек напрямую']
 ],
 js:[
  ['critical','rm-root',/\bfs\.(?:rmSync|rm|rmdirSync)\(\s*(?:["']\/["']|os\.homedir\(\)|process\.env)/,'удаление корня, домашней папки или пути из переменных окружения'],
  ['warning','rm',/\bfs\.(?:rmSync|rm|rmdirSync|unlinkSync|unlink)\(/,'удаление файлов или папок'],
  ['warning','exec',/\b(?:child_process|execSync|exec|spawnSync|spawn|execFile)\s*\(|(?:require|import)\(?\s*["'](?:node:)?child_process["']|from\s+["'](?:node:)?child_process["']/,'запуск внешних программ'],
  ['warning','eval',/(?<![\w.])eval\(|new\s+Function\(|\bvm\.run/,'выполнение кода, собранного во время работы'],
  ['critical','secrets',/\.ssh\/|id_rsa|\.aws\/credentials|\.npmrc|keytar/i,'чтение ключей или паролей'],
  ['info','network',/\b(?:fetch|axios|https?\.request|net\.connect|WebSocket)\b/,'обращение к сети (в изолированной среде сети нет)']
 ]
};
const kind=file=>/\.(?:sh|bash|zsh|bat|cmd|ps1)$/i.test(file)?'shell':/\.py$/i.test(file)?'python':/\.(?:js|mjs|cjs|ts)$/i.test(file)?'js':null;
// Line numbers by binary search over precomputed line starts: linear in the file, not per finding.
let lastText=null,lastStarts=null;
function lineOf(text,index){
 let s=text===lastText?lastStarts:null;
 if(!s){s=[0];for(let i=text.indexOf('\n');i>=0;i=text.indexOf('\n',i+1))s.push(i+1);lastText=text;lastStarts=s;}
 let lo=0,hi=s.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(s[mid]<=index)lo=mid;else hi=mid-1;}return lo+1;
}
// ---- SQL ---------------------------------------------------------------------------------------------
const SQL_START=/^\s*(?:with\b[\s\S]*?\)\s*)?(select|insert|update|delete|drop|truncate|alter|create|grant|revoke|merge|replace)\b/i;
function sqlStatements(text,file){
 // Statements of an .sql file: split at semicolons outside quotes and comments.
 const out=[];let start=0,quote=null;
 for(let i=0;i<=text.length;i++){
  const c=text[i];
  if(quote){if(c===quote)quote=null;continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='-'&&text[i+1]==='-'){const e=text.indexOf('\n',i);i=e<0?text.length:e;continue;}
  if(c==='/'&&text[i+1]==='*'){const e=text.indexOf('*/',i+2);i=e<0?text.length:e+1;continue;}
  if(c===';'||i===text.length){const sql=text.slice(start,i),lead=sql.match(/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/)[0].length;if(sql.trim())out.push({file,line:lineOf(text,start+lead),sql});start=i+1;}
 }
 return out;
}
// SQL inside a script: string literals that start like a statement, and whether they are glued from variables.
// String literals of a script, found by a linear scan (a regular expression with alternatives here can take
// exponential time on an unclosed quote). Returns {index, prefix, quote, body}.
function literals(text){
 const out=[];
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c!=='"'&&c!=="'"&&c!=='`')continue;
  const triple=(c==='"'||c==="'")&&text.startsWith(c+c+c,i),q=triple?c+c+c:c;
  let j=i+q.length,end=-1;
  for(;j<text.length;j++){if(text[j]==='\\'){j++;continue;}if(text.startsWith(q,j)){end=j;break;}if(!triple&&c!=='`'&&text[j]==='\n')break;}
  if(end<0){continue;}
  const prefix=/([rRbBfF]{1,2})$/.exec(text.slice(Math.max(0,i-2),i))?.[1]||'';
  out.push({index:i,prefix,quote:q,body:text.slice(i+q.length,end)});i=end+q.length-1;
 }
 return out;
}
// SQL inside a script: string literals that start like a statement, and whether they are glued from variables.
function embeddedSql(text,file){
 const out=[];
 for(const m of literals(text)){
  const body=m.body;if(body.length>20000||!SQL_START.test(body)||!/\b(?:from|into|table|set|database|schema|where|values)\b/i.test(body))continue;
  const close=m.index+m.quote.length*2+body.length+m.prefix.length*0,after=text.slice(close,close+40),before=text.slice(Math.max(0,m.index-m.prefix.length-20),m.index-m.prefix.length);
  const glued=/f/i.test(m.prefix)&&/\{[^}]+\}/.test(body)||m.quote==='`'&&/\$\{/.test(body)||/^\s*(?:\+|%\s*[(\w]|\.format\()/.test(after)||/\+\s*$/.test(before);
  out.push({file,line:lineOf(text,m.index),sql:body,glued});
 }
 return out;
}
function sqlFindings({file,line,sql,glued}){
 const f=[],add=(severity,rule,text)=>f.push({file,line,severity,rule,text,snippet:sql.replace(/\s+/g,' ').trim().slice(0,140)});
 const s=sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,' ').replace(/'(?:''|[^'])*'/g,"''").replace(/\s+/g,' ').trim(),u=s.toUpperCase();
 if(/^DROP\s+(?:DATABASE|SCHEMA)\b/.test(u))add('critical','sql-drop-db','удаление всей базы данных или схемы');
 else if(/^DROP\s+(?:TABLE|VIEW|INDEX)\s+IF\s+EXISTS\b/.test(u))add('warning','sql-drop-if','удаление таблицы, если она есть (обычно в миграциях — проверьте, что это не рабочие данные)');
 else if(/^DROP\s+(?:TABLE|VIEW|INDEX|USER|ROLE)\b/.test(u))add('critical','sql-drop','удаление таблицы или другого объекта базы');
 if(/^TRUNCATE\b/.test(u))add('critical','sql-truncate','очистка всей таблицы без возможности отката');
 if(/^DELETE\s+FROM\b/.test(u)&&!/\bWHERE\b/.test(u))add('critical','sql-delete-all','DELETE без WHERE удалит все строки таблицы');
 if(/^UPDATE\b[\s\S]*\bSET\b/.test(u)&&!/\bWHERE\b/.test(u))add('critical','sql-update-all','UPDATE без WHERE изменит все строки таблицы');
 if(/^(?:DELETE|UPDATE)\b[\s\S]*\bWHERE\s+(?:1\s*=\s*1|TRUE|'1'\s*=\s*'1'|1)\s*(?:$|;|\bOR\b)/.test(u))add('critical','sql-where-true','условие WHERE всегда истинно: затронет все строки');
 if(/\bWHERE\b[\s\S]*\bOR\s+1\s*=\s*1\b/.test(u))add('critical','sql-or-true','«OR 1=1» отключает условие');
 if(/^ALTER\s+TABLE\b[\s\S]*\bDROP\s+(?:COLUMN|CONSTRAINT)\b/.test(u))add('warning','sql-drop-column','удаление столбца или ограничения');
 if(/^GRANT\s+ALL\b|\bTO\s+PUBLIC\b|^GRANT\b[\s\S]*\bWITH\s+GRANT\s+OPTION\b/.test(u))add('warning','sql-grant','слишком широкие права');
 if(/^(?:CREATE|ALTER)\s+(?:USER|ROLE)\b[\s\S]*\b(?:PASSWORD|IDENTIFIED\s+BY)\b/.test(u))add('warning','sql-password','пароль записан прямо в запросе');
 if(/(?:=|<>|!=)\s*NULL\b/.test(u))add('warning','sql-null','сравнение «= NULL» всегда ложно: нужно IS NULL / IS NOT NULL');
 if(/\bNOT\s+IN\s*\(\s*SELECT\b/.test(u))add('warning','sql-not-in','NOT IN с подзапросом не вернёт строк, если в подзапросе есть NULL: надёжнее NOT EXISTS');
 if(/^SELECT\b/.test(u)){
  const from=/\bFROM\s+([\s\S]*?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bHAVING\b|$)/.exec(u)?.[1]||'';
  if(/,/.test(from.replace(/\([^)]*\)/g,''))&&!/\bWHERE\b/.test(u))add('warning','sql-cartesian','таблицы через запятую без условия: декартово произведение');
  if(/\bSELECT\s+(?:DISTINCT\s+)?\*/.test(u))add('info','sql-star','SELECT * тянет все столбцы: лучше перечислить нужные');
 }
 if(/\bJOIN\b/.test(u)&&!/\bCROSS\s+JOIN\b|\bNATURAL\b/.test(u)&&(u.match(/\bJOIN\b/g)||[]).length>(u.match(/\b(?:ON|USING)\b/g)||[]).length)add('warning','sql-join-on','JOIN без ON/USING: декартово произведение');
 if(/\bLIKE\s+''/.test(u)&&/LIKE\s+'%/i.test(sql))add('info','sql-like','LIKE с «%» в начале не использует индекс');
 if(glued)add('warning','sql-injection','SQL собирается из переменных: риск SQL-инъекции, нужны параметры запроса');
 return f;
}
// ---- Audit -----------------------------------------------------------------------------------------
function auditText(text,file){
 const findings=[],type=kind(file);
 if(type)for(const [severity,rule,re,why] of RULES[type]){
  const g=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');let m,seen=0;
  while((m=g.exec(text))&&seen<5){seen++;const line=lineOf(text,m.index);
   // A softer rule does not repeat a stronger one on the same line.
   if(findings.some(f=>f.line===line&&f.file===file&&f.rule.split('-')[0]===rule.split('-')[0]))continue;
   findings.push({file,line,severity,rule,text:why,snippet:text.split('\n')[line-1].trim().slice(0,140)});if(!m[0].length)g.lastIndex++;}
 }
 const statements=SQL.test(file)?sqlStatements(text,file):type?embeddedSql(text,file):[];
 for(const st of statements){findings.push(...sqlFindings(st));if(findings.length>300)break;}
 // Python and shell also run SQL through command-line clients: «psql -c "DROP …"».
 return findings;
}
const ORDER={critical:0,warning:1,info:2};
// Results per file are cached by path, size and modification time: the check runs once per version.
const cache=new Map();
function audit(skill){
 const out=[];
 for(const f of skill.files||[]){
  if(!SCRIPT.test(f)&&!SQL.test(f))continue;
  const full=path.join(skill.folder,f),name=f.split(path.sep).join('/');let st;
  try{if(fs.lstatSync(full).isSymbolicLink())continue;st=fs.statSync(full);if(!st.isFile()||st.size>2*1024*1024)continue;}catch{continue;}
  const key=full+'|'+st.size+'|'+st.mtimeMs;let hit=cache.get(key);
  if(!hit){try{hit=auditText(fs.readFileSync(full,'utf8'),name);}catch{continue;}cache.set(key,hit);if(cache.size>2000)cache.delete(cache.keys().next().value);}
  out.push(...hit);
 }
 return out.sort((a,b)=>ORDER[a.severity]-ORDER[b.severity]||a.file.localeCompare(b.file)||a.line-b.line);
}
const ICON={critical:'⛔',warning:'⚠️',info:'ℹ️'};
// A short report for the chat: critical and warnings first, at most `limit` lines.
function report(findings,limit=8){
 if(!findings.length)return '';
 const counts=['critical','warning','info'].map(k=>[k,findings.filter(f=>f.severity===k).length]).filter(([,n])=>n);
 const head='Проверка скриптов: '+counts.map(([k,n])=>({critical:'опасных',warning:'рискованных',info:'для сведения'})[k]+' — '+n).join(', ')+'.';
 const rows=findings.filter(f=>f.severity!=='info').concat(findings.filter(f=>f.severity==='info')).slice(0,limit).map(f=>ICON[f.severity]+' '+f.file+':'+f.line+' — '+f.text+(f.snippet?' («'+f.snippet.slice(0,90)+'»)':''));
 return head+'\n'+rows.join('\n')+(findings.length>limit?'\n… и ещё '+(findings.length-limit):'');
}
module.exports={audit,auditText,sqlFindings,sqlStatements,embeddedSql,report,RULES};
