// Removing a company: never the first one (its data is the app's root folder) nor the current one.
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {Companies}=require('../src/companies.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-companies-'));
try{
 const c=new Companies(root),second=c.create('Zillion Whales');
 assert.throws(()=>c.remove('default'),/Первую компанию/);
 c.select(second.id);assert.throws(()=>c.remove(second.id),/переключитесь/);
 c.select('default');const removed=c.remove(second.id);
 assert.equal(removed.dir,path.join(root,'companies',second.id));assert.deepEqual(c.list().companies.map(x=>x.id),['default']);
 assert.deepEqual(new Companies(root).list().companies.map(x=>x.id),['default'],'saved');
 console.log('Companies: remove keeps the first and the current company passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
