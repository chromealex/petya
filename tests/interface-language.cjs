// Interface language: system default, explicit choice, translation of composed strings, and coverage:
// every Russian interface string must have an English translation in src/locales/en.json (or be listed
// there as "untranslated" when it must stay as written, like Russian name forms).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../src/ui/i18n-core.js');
const {collect}=require('../scripts/i18n-strings.cjs');
const en=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/locales/en.json'),'utf8'));

// System language by default, explicit choice wins, unsupported languages fall back to English.
assert.equal(core.resolve('system',['ru-RU','en-US']),'ru');
assert.equal(core.resolve('system',['de-DE','en-GB']),'en');
assert.equal(core.resolve('system',['fr-FR']),'en');
assert.equal(core.resolve('system',[]),'en');
assert.equal(core.resolve('ru',['en-US']),'ru');
assert.equal(core.resolve('en',['ru-RU']),'en');

// Exact strings keep surrounding whitespace; composed strings translate fragment by fragment on word boundaries.
const t=core.create({'Сохранить':'Save','Скачать язык:':'Download language:','Немецкий':'German','шаг':'step'}).translate;
assert.equal(t('Сохранить'),'Save');
assert.equal(t('  Сохранить\n'),'  Save\n');
assert.equal(t('Скачать язык: Немецкий'),'Download language: German');
assert.equal(t('шаг 3'),'step 3');
assert.equal(t('Шаги'),'Шаги','a fragment is not replaced inside a longer word');
const short=core.create({'из':'of','готово':'done','на':'by'}).translate;
assert.equal(short('готово 2 из 3'),'done 2 of 3','a short word between two numbers is translated');
assert.equal(short('из 3'),'из 3','a short word elsewhere stays as written');
assert.equal(short('готово на диске'),'готово на диске');
assert.equal(t('Release notes'),'Release notes');
assert.equal(core.create({}).translate('Сохранить'),'Сохранить');

// Outside Electron the interface stays Russian, so unit tests of Russian text are unaffected.
const language=require('../src/interface-language.cjs');
assert.equal(language.t('Открыть Петю'),'Открыть Петю');
assert.equal(require('../src/tray-menu.cjs').createTrayMenu({Menu:{buildFromTemplate:x=>x},nativeImage:{},platform:'linux',company:'A',listening:false,ready:true,show(){},navigate(){},toggle(){},pause(){},quit(){}})[3].label,'Открыть Петю');

// Coverage: new interface text must come with its English translation.
const strings=collect();
const missing=[...strings.keys()].filter(key=>!(key in en.strings)&&!(en.untranslated||[]).includes(key));
assert.deepEqual(missing.map(key=>key+'  ← '+[...strings.get(key)].join(', ')),[],'Add English translations to src/locales/en.json (list: node scripts/i18n-strings.cjs --missing en)');

// Translations keep placeholders, and nothing Russian leaks into English.
for(const [key,value] of Object.entries(en.strings)){
 assert.equal(typeof value,'string',key);
 assert.ok(value.length>0,'empty translation: '+key);
 // Russian may stay only inside «…»: voice commands Petya understands in Russian.
 assert.ok(!/[А-Яа-яЁё]/.test(value.replace(/«[^»]*»/g,'')),'Russian left in translation: '+key+' → '+value);
 for(const token of key.match(/\{\w*\}|%[sd]|\$\{[^}]*\}/g)||[])assert.ok(value.includes(token),'placeholder '+token+' lost: '+key);
}
for(const key of en.untranslated||[])assert.ok(!(key in en.strings),'listed both as translated and untranslated: '+key);

// The settings card and the bootstrap are wired into the window.
const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
assert.ok(html.indexOf('i18n.js')<html.indexOf('<body'),'i18n.js loads before the markup');
assert.match(html,/data-src="interface-language.js"/);
assert.match(fs.readFileSync(path.join(__dirname,'../src/preload.cjs'),'utf8'),/petya:interface-language-bootstrap/);
assert.ok(require('../src/features.cjs').some(feature=>feature.name==='interfaceLanguage'));
console.log('interface language: ok ('+Object.keys(en.strings).length+' English strings)');
