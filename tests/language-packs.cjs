const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanguagePacks}=require('../src/language-packs.cjs');
(async()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'petya-languages-'));let calls=0;const packs=new LanguagePacks({directory,roots:[],fetcher:async()=>{calls++;return {ok:true,arrayBuffer:async()=>Buffer.from('invalid')};}});try{
 assert.deepEqual(packs.list().filter(l=>l.installed).map(l=>l.code),['ru','en']);assert.equal(calls,0);await assert.rejects(()=>packs.install('../escape'));assert.equal(calls,0);await assert.rejects(()=>packs.install('de'),/проверку/);assert(!packs.installed('de'));assert.equal(calls,1);assert.deepEqual(fs.readdirSync(directory),[]);
 assert.deepEqual(await packs.check('Hello'),{missing:[],unavailable:true});
 console.log('Optional language packs: no default downloads, allowlist, checksum failure and missing runtime passed');
}finally{fs.rmSync(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
