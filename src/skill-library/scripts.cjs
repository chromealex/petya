// Scripts and other files of a skill: what they need to run and how Petya runs them. Scripts never run on
// the computer itself: they run in the isolated Docker sandbox (src/skill-sandbox.cjs) without network,
// with the skill's folder and the user's files copied in. Packages a skill needs (requirements.txt, Python
// imports, package.json) are installed once into the skill's own image, with the user's consent.
const fs=require('node:fs'),path=require('node:path');
// The Python 3.12 standard library (sys.stdlib_module_names).
const STDLIB=new Set(('__future__ abc argparse array ast asyncio atexit base64 bdb binascii bisect builtins bz2 cProfile calendar cmath cmd code codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars copy copyreg csv ctypes curses dataclasses datetime dbm decimal difflib dis doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http imaplib importlib inspect io ipaddress itertools json keyword linecache locale logging lzma mailbox marshal math mimetypes mmap modulefinder multiprocessing netrc numbers opcode operator optparse os pathlib pdb pickle pickletools pkgutil platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtplib socket socketserver sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess symtable sys sysconfig syslog tabnanny tarfile tempfile termios textwrap threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty types typing unicodedata unittest urllib uuid venv warnings wave weakref wsgiref xml xmlrpc zipapp zipfile zipimport zlib zoneinfo').split(' '));
// Import names whose pip package is called differently.
const PIP={yaml:'pyyaml',docx:'python-docx',pptx:'python-pptx',PIL:'pillow',fitz:'pymupdf',bs4:'beautifulsoup4',cv2:'opencv-python-headless',sklearn:'scikit-learn',dateutil:'python-dateutil',dotenv:'python-dotenv',jwt:'pyjwt',Crypto:'pycryptodome',magic:'python-magic',pdfplumber:'pdfplumber',pypdf:'pypdf',PyPDF2:'pypdf2',openpyxl:'openpyxl',xlsxwriter:'xlsxwriter',lxml:'lxml',markdown:'markdown',jinja2:'jinja2',matplotlib:'matplotlib',numpy:'numpy',pandas:'pandas',reportlab:'reportlab',imageio:'imageio',anthropic:'anthropic',requests:'requests'};
const NODE_BUILTIN=new Set('assert buffer child_process crypto events fs http https net os path process querystring readline stream string_decoder timers tls url util v8 vm worker_threads zlib'.split(' '));
const SCRIPT=/\.(?:py|sh|bash|js|mjs|cjs)$/i;
const interpreter=file=>/\.py$/i.test(file)?'python':/\.(?:sh|bash)$/i.test(file)?'bash':/\.(?:js|mjs|cjs)$/i.test(file)?'node':null;
function imports(code){return [...new Set([...String(code).matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import|import[ \t]+([\w.,  \t]+))/gm)].flatMap(m=>(m[1]||m[2]).split(',').map(x=>x.trim().split(/[.\s]/)[0]).filter(Boolean)))];}
const read=(skill,f)=>{try{return fs.readFileSync(path.join(skill.folder,f),'utf8');}catch{return '';}};
const scripts=skill=>(skill.files||[]).filter(f=>SCRIPT.test(f));
// What a skill's scripts need beyond the base image (python:3.12-slim with bash): pip and npm packages,
// and whether Node.js is needed at all.
function requirements(skill){
 const files=skill.files||[],local=new Set(files.filter(f=>/\.py$/i.test(f)).flatMap(f=>{const parts=f.replace(/\.py$/i,'').split('/');return [parts.at(-1),...parts.slice(0,-1)];}));
 const pip=new Set(),npm=new Set();
 for(const f of files.filter(f=>/(?:^|\/)requirements[\w.-]*\.txt$/i.test(f)))for(const line of read(skill,f).split('\n')){const v=line.replace(/#.*/,'').trim();if(v&&!v.startsWith('-'))pip.add(v);}
 const named=new Set([...pip].map(p=>p.toLowerCase().split(/[<>=!~[ ;]/)[0]));
 for(const f of files.filter(f=>/\.py$/i.test(f)))for(const m of imports(read(skill,f))){if(STDLIB.has(m)||local.has(m))continue;const name=PIP[m]||m.toLowerCase().replace(/_/g,'-');if(!named.has(name)){pip.add(name);named.add(name);}}
 const node=files.some(f=>/\.(?:js|mjs|cjs)$/i.test(f));
 for(const f of files.filter(f=>/(?:^|\/)package\.json$/i.test(f)&&!/node_modules/.test(f))){try{const p=JSON.parse(read(skill,f));for(const [k,v] of Object.entries({...p.dependencies}))npm.add(k+'@'+String(v).replace(/^[\^~]/,''));}catch{/* A broken package.json adds nothing. */}}
 if(node)for(const f of files.filter(f=>/\.(?:js|mjs|cjs)$/i.test(f)))for(const m of String(read(skill,f)).matchAll(/(?:require\(|from\s+)['"]([^'".][^'"]*)['"]/g)){const name=m[1].startsWith('@')?m[1].split('/').slice(0,2).join('/'):m[1].split('/')[0];if(!NODE_BUILTIN.has(name.replace(/^node:/,''))&&!name.startsWith('node:')&&![...npm].some(x=>x.startsWith(name+'@')))npm.add(name);}
 return {pip:[...pip].sort(),npm:[...npm].sort(),node};
}
// Python scripts that run in the plain sandbox (standard library only): the Python extension takes them.
function runnable(skill){
 return (skill.files||[]).filter(f=>/\.py$/i.test(f)).flatMap(f=>{
  const code=read(skill,f);if(!code||code.length>24000)return [];
  const used=imports(code).filter(m=>!(skill.files||[]).some(x=>path.basename(x,'.py')===m));
  return used.some(m=>!STDLIB.has(m)||m==='subprocess')?[]:[{file:f,code}];
 });
}
// The sentence the model reads under a skill's file list.
function note(skill){
 if(!scripts(skill).length)return '';
 const need=requirements(skill),deps=[...need.pip,...need.npm];
 return ' Скрипты навыка запускаются действием run в изолированной среде без сети и без доступа к компьютеру'+(deps.length?'; им нужны пакеты '+deps.slice(0,12).join(', ')+(deps.length>12?' и другие':'')+', Петя установит их в эту среду с согласия пользователя':'')+'.';
}
module.exports={runnable,note,imports,requirements,scripts,interpreter,STDLIB,PIP};
