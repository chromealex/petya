const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/клиенск/g,'клиентск');
const tokens=s=>norm(s).match(/[\p{L}\p{N}]+/gu)||[];
function roles(value){
 const t=tokens(value),has=re=>t.some(w=>re.test(w));
 const qa=has(/^(?:qa|sdet|test|tester|testers|тест|тестировщик\p{L}*|куашник\p{L}*|тестировани\p{L}*)$/u)||has(/^quality$/u)&&has(/^assurance$/u);
 const dev=(has(/^(?:dev|developer|developers|programmer|разраб(?:ы|ов|ам|ами)?|разработчик\p{L}*|разработк\p{L}*|программист\p{L}*)$/u)||has(/^engineer$/u)&&has(/^(?:software|client|frontend|unity|ios|android|backend)$/u))&&!qa;
 const client=has(/^(?:клиент\p{L}*|client|фронтенд\p{L}*|frontend|front|unity|ios|android|mobile)$/u);
 const server=has(/^(?:сервер\p{L}*|backend|back|бэкенд\p{L}*|бекенд\p{L}*)$/u);
 return new Set([...(qa?['qa']:[]),...(dev?['dev']:[]),...(dev&&client?['client-dev']:[]),...(dev&&server?['server-dev']:[])]);
}
function addressed(text){
 const m=/^(?:(всех)\s+)?((?:(?:клиентских|клиенских|клиентскую|фронтенд|серверных|серверную|бэкенд|бекенд)\s+)?(?:разрабов|разрабы|разработчиков|разработку)|куашников|куашники|тестировщиков|тестирование|qa)\s+(.+)$/iu.exec(text);
 if(!m)return null;
 const r=roles(m[2]);const role=r.has('client-dev')?'client-dev':r.has('server-dev')?'server-dev':r.has('qa')?'qa':'dev';
 // Collective "разработка/тестирование" keeps the channel-only behavior; named groups are mentioned.
 return {role,mentions:!!m[1]||!/^(?:разработку|тестирование)$/iu.test(m[2]),body:m[3]};
}
function projectMatch(row,topic){
 const ids=[topic.projectName,topic.jiraProject,topic.reviewScope].filter(Boolean).map(s=>norm(s).trim());
 const listed=String(row.projects||'').split(/[,;\n|]/).map(s=>norm(s).trim()).filter(Boolean);
 const memberId=row.slackId||row.jiraId||row.email||row.name;
 if((topic.projectMembers||[]).some(m=>m.id===memberId))return true;
 return listed.length&&ids.length?listed.some(p=>ids.includes(p)):null;
}
module.exports={roles,addressed,projectMatch};
