// Channel posts (scripts/announce.cjs): the Russian announcement and screenshots of a version, the HISTORY section
// when there is no announcement, and channels without a token skipped (no network in this test).
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const run=(...a)=>execFileSync(process.execPath,[path.join(__dirname,'../scripts/announce.cjs'),...a],{encoding:'utf8',env:{PATH:process.env.PATH}});
const post=JSON.parse(run('app','0.12.3','--dry-run'));
assert.equal(post.heading,'Петя 0.12.3 — Кто из команды — вы');assert.match(post.body,/«Это я»/);
assert.deepEqual(post.shots,['docs/screenshots/0.12.3/team-me.png']);assert.equal(post.link.url,'https://github.com/chromealex/petya/releases/tag/v0.12.3');
const old=JSON.parse(run('app','0.11.4','--dry-run'));
assert.match(old.heading,/^Петя 0\.11\.4 — a Jira link opens that issue$/,'no announcement: the HISTORY section');assert.deepEqual(old.shots,[]);
assert.match(run('app','0.12.3'),/Slack: пропущено \(нет SLACK_BOT_TOKEN\)\nTelegram: пропущено \(нет TELEGRAM_BOT_TOKEN\)/);
assert.throws(()=>run('app','9.9.9','--dry-run'),/no «## 9\.9\.9/);
console.log('Announce: Russian post with screenshots, HISTORY fallback, channels without tokens skipped passed');
