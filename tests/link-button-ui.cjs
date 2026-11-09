// A status or an error with a link shows a button for it (result-kit.js linkText): the Google Play «API is off»
// error in the dashboard widget and in Settings → «Google Play Console», and a link-free text stays as it is.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=c=>win.webContents.executeJavaScript(c);
 await js('window.chatNavigationReady');
 const text=require('../src/extensions/google-play/client.cjs').explain(Object.assign(Error('x'),{status:403,detail:JSON.stringify({error:{message:'Google Play Developer Reporting API has not been used in project 796206470809 before or it is disabled.'}})})).message;
 const r=await js(`(()=>{const p=document.createElement('p');document.body.append(p);window.resultKit.linkText(p,${JSON.stringify(text)});
  const a=p.querySelector('a.kit-link-button');const out={text:p.childNodes[0].textContent,label:a?.textContent,href:a?.href,target:a?.target,display:a&&getComputedStyle(a).display};p.remove();
  const q=document.createElement('p');window.resultKit.linkText(q,'Без ссылок.');out.plain=q.textContent;out.links=q.querySelectorAll('a').length;return out;})()`);
 assert.match(r.text,/^В Google Cloud \(проект 796206470809\) не включён Google Play Developer Reporting API\. Включите его и через пару минут нажмите «Проверить»\. $/,r.text);
 assert.equal(r.label,'Включить API в Google Cloud');assert.equal(r.href,'https://console.cloud.google.com/apis/library/playdeveloperreporting.googleapis.com?project=796206470809');
 assert.equal(r.target,'_blank');assert.match(r.display,/flex/,'styled as a button');assert.equal(r.plain,'Без ссылок.');assert.equal(r.links,0);
 console.log('Link button UI: the Google Cloud link of an error becomes «Включить API в Google Cloud», plain text untouched passed');
}};
require('../src/main.cjs');
