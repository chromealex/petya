// A name as a meeting app shows it («Sergey Ivanov», «Сергей И.», «sivanov») matched to a member of the team (Команда):
// by name in either alphabet, aliases, the Jira name or the email's local part. Only a single clear match counts.
const RU={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
// Spellings that differ between transliterations: «Sergey/Sergei», «Aleksandr/Alexander», «Yulia/Julia».
const latin=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[а-яё]/g,c=>RU[c]??c)
 .replace(/x/g,'ks').replace(/iy\b|yi\b|ij\b/g,'i').replace(/ei\b/g,'ey').replace(/^j(?=[aeiou])|\bj(?=[aeiou])/g,'y').replace(/kh/g,'h').replace(/w/g,'v').replace(/ph/g,'f').replace(/(.)\1/g,'$1');
const tokens=s=>latin(s).split(/[^a-z0-9]+/).filter(Boolean);
function names(member){return [member.name,member.jiraName,...String(member.aliases||'').split(/[,;]/),String(member.email||'').split('@')[0].replace(/[._-]+/g,' ')].map(n=>String(n||'').trim()).filter(Boolean);}
function score(shown,candidate){
 const a=tokens(shown),b=tokens(candidate);if(!a.length||!b.length)return 0;
 if(a.join(' ')===b.join(' ')||a.join('')===b.join(''))return 3;
 const full=a.filter(t=>t.length>1),initials=a.filter(t=>t.length===1);
 // Each shown word takes a different word of the candidate: exact first, then a prefix («Alex» — «Aleksandr»).
 const free=[...b];let hit=0,exact=0;
 for(const t of [...full].sort((x,y)=>y.length-x.length)){let i=free.indexOf(t);if(i>=0)exact++;else i=free.findIndex(v=>v.length>3&&t.length>3&&(v.startsWith(t)||t.startsWith(v)));if(i>=0){hit++;free.splice(i,1);}}
 if(full.length>=2&&!exact)return 0;
 const ini=initials.filter(i=>b.some(v=>v[0]===i)).length;
 if(hit===full.length&&hit>=2)return 2.5;
 if(hit===full.length&&hit===1&&ini===initials.length&&initials.length)return 2;
 if(hit>=1&&full.length===1&&b.length>=1)return 1;
 // «sivanov»: first letter of the first name joined to the last name.
 if(a.length===1&&b.length>=2&&a[0]===b[0][0]+b.at(-1))return 2;
 return 0;
}
// Names chosen by hand in «Команда» («Имя на встречах», several through a comma) win over the automatic match.
const same=(a,b)=>tokens(a).join(' ')===tokens(b).join(' ')&&tokens(a).length>0;
const chosen=member=>String(member.meetingName||'').split(/[,;]/).map(v=>v.trim()).filter(Boolean);
function match(shown,members=[]){
 const own=members.filter(m=>chosen(m).some(n=>same(n,shown)));if(own.length===1)return own[0];if(own.length>1)return null;
 return auto(shown,members);
}
function auto(shown,members=[]){
 // «iPhone (Анна)», «Анна (Android)»: the words inside and outside the brackets are tried separately.
 const inner=/\(([^)]+)\)/.exec(String(shown||''))?.[1],outer=String(shown||'').replace(/\([^)]*\)/g,'').trim();
 if(inner&&outer!==shown){const a=auto(outer,members);if(a)return a;return /^(?:iphone|ipad|android|galaxy|pixel|macbook|телефон)/i.test(outer)?auto(inner,members):null;}
 const rows=members.map(m=>({m,s:Math.max(0,...names(m).map(n=>score(shown,n)))})).filter(r=>r.s>0).sort((x,y)=>y.s-x.s);
 if(!rows.length)return null;if(rows[1]&&rows[1].s===rows[0].s)return null;if(rows[0].s<2&&rows.length>1)return null;
 return rows[0].m;
}
// «Сергей Иванов, QA» for a name shown in a meeting, or that name itself when nobody in the team fits.
function label(shown,members){const m=shown?match(shown,members):null;return m?{name:m.name,role:m.role||'',member:true}:{name:shown||'',role:'',member:false};}
module.exports={match,label,latin,score,chosen};
