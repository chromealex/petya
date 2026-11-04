const assert=require('node:assert/strict');
const configure=require('../src/external-links.cjs');
(async()=>{
 let popup,navigate;const opened=[],errors=[];
 configure({setWindowOpenHandler:fn=>popup=fn,on:(event,fn)=>{assert.equal(event,'will-navigate');navigate=fn;}},url=>{opened.push(url);return Promise.resolve();},error=>errors.push(error));
 const jira='https://example.atlassian.net/issues/?jql=project%3DBW%20AND%20affectedVersion%3D1.19.0';
 assert.deepEqual(popup({url:jira}),{action:'deny'});assert.equal(opened[0],jira);
 let prevented=false;navigate({preventDefault(){prevented=true;}},'https://example.com/docs#section');
 assert.ok(prevented);assert.equal(opened[1],'https://example.com/docs#section');
 for(const url of ['javascript:alert(1)','file:///etc/passwd','data:text/html,test','not a URL'])popup({url});
 assert.equal(opened.length,2);assert.equal(errors.length,0);
 configure({setWindowOpenHandler:fn=>popup=fn,on(){}},()=>Promise.reject(Error('Browser unavailable')),error=>errors.push(error));
 popup({url:jira});await new Promise(resolve=>setImmediate(resolve));assert.equal(errors[0].message,'Browser unavailable');
 console.log('External links passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
