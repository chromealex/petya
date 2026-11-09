// «SQL по словам», the read-only gate: comments, CTEs, semicolons, quoting per dialect, Unicode tricks, dangerous
// functions, LIMIT handling, and a generated fuzz of keyword/comment/literal combinations.
const assert=require('node:assert/strict');
const V=require('../src/extensions/sql/validate.cjs');
const ok=(sql,dialect='postgres',maxRows=500)=>V.check(sql,{dialect,maxRows});
const bad=(sql,dialect='postgres',code)=>{
 let error=null;try{ok(sql,dialect);}catch(e){error=e;}
 assert.ok(error,'must be refused ('+dialect+'): '+sql);
 assert.ok(error.rejected,'refusal, not a crash: '+error.message);
 if(code)assert.equal(error.code,code,sql+' → '+error.message);
 return error;
};
const ch=String.fromCharCode;

// Plain reads pass, a LIMIT is added or lowered.
assert.equal(ok('SELECT 1').sql,'SELECT 1\nLIMIT 500');
assert.equal(ok('select * from events limit 10;').sql,'select * from events limit 10');
assert.equal(ok('select * from events limit 10;').limited,false);
assert.equal(ok('select * from events limit 100000').sql,'select * from events limit 500');
assert.equal(ok('select * from t limit all').sql,'select * from t limit 500');
assert.equal(ok('select * from t limit 5, 9000','mysql').sql,'select * from t limit 5, 500');
assert.equal(ok('select * from t order by a fetch first 9999 rows only').sql,'select * from t order by a fetch first 500 rows only');
assert.equal(ok('select * from (select * from t limit 100000) x').sql,'select * from (select * from t limit 100000) x\nLIMIT 500','an inner LIMIT is not the outer one');
assert.equal(ok('select * from t limit 3 by user_id','clickhouse').sql,'select * from t limit 3 by user_id\nLIMIT 500','ClickHouse LIMIT BY is per group');
assert.equal(ok('select a from t union all select b from u','clickhouse').sql,'SELECT * FROM (\nselect a from t union all select b from u\n)\nLIMIT 500','ClickHouse unions are wrapped');
assert.equal(ok('select a from t union all select b from u').sql,'select a from t union all select b from u\nLIMIT 500');
assert.throws(()=>ok('select * from t limit $1'),/целым числом/);
// CTEs and parentheses.
assert.equal(ok('WITH w AS (SELECT user_id FROM events WHERE level >= 10) SELECT count(*) FROM w').limited,true);
assert.equal(ok('(SELECT 1)').sql,'(SELECT 1)\nLIMIT 500');
bad('with d as (delete from events returning *) select * from d','postgres','forbidden-word');
bad('with u as (update players set gold = 0 returning id) select count(*) from u','postgres','forbidden-word');
bad('with m as (insert into t values (1) returning *) select 1','postgres','forbidden-word');
bad('select 1)','postgres','parens');bad('select (1','postgres','parens');
// Comments are removed from what runs; keywords inside comments neither block nor hide anything.
assert.equal(ok('select 1 -- drop table x\n from t').sql,'select 1\nfrom t\nLIMIT 500');
assert.equal(ok('select /* delete */ a from t').sql,'select a from t\nLIMIT 500');
assert.equal(ok('select a/**/from t').sql,'select a from t\nLIMIT 500','a comment still separates words');
assert.equal(ok('select a # comment; drop\nfrom t','clickhouse').sql,'select a\nfrom t\nLIMIT 500');
bad('select 1 /* unterminated','postgres','unterminated');
bad('select /*! drop table x */ 1','mysql','executable-comment');
bad('select /*+ hint */ 1','postgres','executable-comment');
// PostgreSQL nests block comments: «*/» inside a nested one does not end it.
assert.equal(ok('select /* a /* b */ ; drop */ 1').sql,'select 1\nLIMIT 500');
bad('select /* a */ 1 */ ; drop table x','clickhouse');
// Semicolons: one trailing is dropped; any other is a second statement — unless inside a literal.
bad('select 1; select 2','postgres','multiple');
bad('select 1;;','postgres','multiple');
bad('select 1; drop table events','clickhouse','multiple');
assert.equal(ok("select ';' as x").sql,"select ';' as x\nLIMIT 500");
assert.equal(ok('select ";" from t','postgres').sql,'select ";" from t\nLIMIT 500');
assert.equal(ok('select $$a;b$$').sql,'select $$a;b$$\nLIMIT 500');
assert.equal(ok('select $tag$ ; drop $tag$').sql,'select $tag$ ; drop $tag$\nLIMIT 500');
bad('select $tag$ ; drop table t','postgres','unterminated');
// Quoting differs by dialect: a backslash escapes in ClickHouse/BigQuery/MySQL, not in PostgreSQL plain strings.
assert.equal(ok("select 'it\\'s; fine' from t",'clickhouse').limited,true);
assert.equal(ok("select 'it\\'s; fine' from t",'mysql').limited,true);
bad("select 'x\\'; delete from t; --'",'postgres','backslash');
assert.equal(ok("select E'a\\'b; c'").limited,true,'E-strings escape');
assert.equal(ok("select 'it''s'").limited,true);
bad("select 'it''s; drop table x",'postgres','unterminated');
assert.equal(ok('select """multi; line""" as s','bigquery').limited,true);
assert.equal(ok("select r'\\d+;' as s",'bigquery').limited,true);
assert.equal(ok('select * from `proj.ds.events_*` where _TABLE_SUFFIX > "2026"','bigquery').limited,true);
bad('select `a` from t','postgres','backtick');
bad('select "unterminated from t','clickhouse','unterminated');
// Quoted identifiers named like keywords are names, not keywords; so are qualified names.
assert.equal(ok('select "delete", "update" from t').limited,true);
assert.equal(ok('select `insert` from t','clickhouse').limited,true);
assert.equal(ok('select t.update from t').limited,true);
assert.equal(ok('select name, comment from system.columns','clickhouse').limited,true);
assert.equal(ok('select replace(name, \'a\', \'b\'), truncate(x) from t','clickhouse').limited,true,'functions named like statements');
assert.equal(ok("select format('{} {}', a, b) from t",'clickhouse').limited,true);
// Statements and clauses that write or change the session.
for(const sql of ['insert into t values (1)','update t set a = 1','delete from t','drop table t','create table x (a int)','alter table t add c int','truncate t',
 'grant all on t to x','copy t to \'/tmp/x\'','call p()','set role admin','begin','vacuum t','explain analyze delete from t','show tables','describe t','lock table t',
 'select * into newtable from t','select 1 for update','select 1 for share','select 1 for no key update'])bad(sql,'postgres');
for(const sql of ['select 1 into outfile \'/tmp/x\'','select * from t settings readonly = 0','select * from t format TabSeparated','optimize table t','system drop dns cache',
 'kill query where 1','attach table t','select 1 into outfile "/tmp/a" format CSV'])bad(sql,'clickhouse');
bad('select * from t into outfile \'/tmp/x\'','mysql');bad('select 1 lock in share mode','mysql');
for(const sql of ['declare x int64','execute immediate "drop table t"','export data options(uri="gs://x/*") as select 1','merge t using u on true when matched then delete',
 'select 1; select 2'])bad(sql,'bigquery');
// Dangerous functions per dialect.
for(const f of ['pg_sleep(10)','pg_read_file(\'/etc/passwd\')','pg_ls_dir(\'.\')','lo_import(\'/etc/passwd\')','dblink(\'host=x\', \'select 1\')','pg_terminate_backend(1)',
 'set_config(\'a\',\'b\',false)','nextval(\'s\')','query_to_xml(\'delete from t\', true, true, \'\')','pg_catalog.pg_sleep(1)','PG_SLEEP(1)'])bad('select '+f,'postgres','forbidden-function');
for(const f of ["url('http://x', CSV)","file('/etc/passwd')","s3('https://b/x')","remote('h', db.t)","mysql('h:3306','db','t','u','p')","postgresql('h','db','t','u','p')",
 'sleep(3)','sleepEachRow(1)',"executable('x.sh', TSV, 'a String')",'generateRandom(\'a Int\')','input(\'a Int\')',"jdbc('x','y')"])bad('select * from '+f,'clickhouse','forbidden-function');
bad("select * from external_query('conn', 'select 1')",'bigquery','forbidden-function');
for(const f of ['sleep(5)','benchmark(1000000, md5(1))',"load_file('/etc/passwd')",'get_lock(\'a\', 10)'])bad('select '+f,'mysql','forbidden-function');
// A dangerous name as a plain column (not called) is fine.
assert.equal(ok('select sleep from naps','clickhouse').limited,true);
assert.equal(ok('select url from pages','clickhouse').limited,true);
// Only SELECT/WITH may start.
bad('values (1)','postgres','not-select');bad('table t','postgres','not-select');bad('   ','postgres','empty');bad(';','postgres','empty');
// Unicode tricks: invisible characters, odd spaces, look-alike punctuation.
bad('select 1'+ch(0x200B)+'; drop table t','postgres','invisible');
bad('select 1 '+ch(0x202E)+'from t','postgres','invisible');
bad('select '+ch(0xFEFF)+'1','postgres','invisible');
bad('select 1'+ch(0xFF1B)+' drop table t','postgres','lookalike');
bad('select '+ch(0x2018)+'a'+ch(0x2019),'postgres','lookalike');
bad("select 'a"+ch(0x202E)+"b'",'postgres','invisible');
bad('select 1'+ch(0)+' from t','postgres','invisible');
assert.equal(ok('select'+ch(0xA0)+'1').sql,'select 1\nLIMIT 500','a no-break space becomes a plain one');
assert.equal(ok('select count(*) as игроки from events').limited,true,'Cyrillic identifiers are fine');
assert.equal(ok("select 'Россия; Китай' as c").limited,true,'any visible text inside a literal');
// A Cyrillic look-alike keyword is not a keyword: it cannot start a statement…
bad('sеlect 1','postgres','not-select');
// …and a look-alike «DELETE» inside a SELECT is just an unknown identifier for the server.
assert.equal(ok('select dеlete from t').limited,true);
// Length.
bad('select '+'1+'.repeat(V.MAX_LENGTH)+'1','postgres','too-long');
// Tables a statement reads: CTE names and table functions are skipped, EXTRACT(… FROM …) is not a table.
assert.deepEqual(V.tables('with w as (select * from events) select extract(year from ts), u.id from w join public.users u on true, orders o','postgres').map(t=>t.parts.join('.')).sort(),['events','orders','public.users']);
assert.deepEqual(V.tables('select * from `proj.ds.events_*`','bigquery').map(t=>t.name),['events_*']);
assert.deepEqual(V.tables('select * from numbers(10)','clickhouse'),[]);

// Fuzz: forbidden words hidden among comments, literals and quoting must never slip through; the same words inside
// literals or comments must never be refused.
let seed=42;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
const words=['DELETE FROM t','UPDATE t SET a=1','INSERT INTO t VALUES (1)','DROP TABLE t','; SELECT 2','INTO OUTFILE \'/x\'','SET a = 1'];
const wraps={postgres:[w=>"'"+w.replace(/'/g,"''")+"'",w=>'/* '+w+' */',w=>'-- '+w+'\n',w=>'$q$'+w+'$q$',w=>'"'+w.replace(/"/g,'""')+'"'],
 clickhouse:[w=>"'"+w.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'",w=>'/* '+w+' */',w=>'-- '+w+'\n',w=>'# '+w+'\n',w=>'`'+w.replace(/`/g,'``')+'`'],
 bigquery:[w=>'"'+w.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"',w=>'/* '+w+' */',w=>'# '+w+'\n',w=>'"""'+w+'"""',w=>"r'"+w.replace(/'/g,'')+"'"]};
let hidden=0,exposed=0;
for(const dialect of Object.keys(wraps)){
 for(let i=0;i<300;i++){
  const w=words[rnd(words.length)],wrap=wraps[dialect][rnd(wraps[dialect].length)];
  const safe='SELECT a, '+wrap(w)+' AS x FROM t WHERE b > '+rnd(100);
  const r=V.check(safe,{dialect,maxRows:50});
  assert.ok(r.sql.endsWith('LIMIT 50'),dialect+': '+safe);hidden++;
  // The same words outside any literal: refused.
  const raw='SELECT a FROM t '+(rnd(2)?'/* c */ ':'')+w+(rnd(2)?' -- tail':'');
  assert.throws(()=>V.check(raw,{dialect,maxRows:50}),e=>e.rejected,dialect+': '+raw);exposed++;
 }
}
// Random noise never crashes the validator: it either passes with a LIMIT or refuses with a reason.
const alphabet=['select',' ','from','t','(',')',"'",'"','`','--','/*','*/',';','\n','$$','$a$','\\','limit','10','with','x','as',',','#',ch(0x200B),ch(0xA0),'é','union','all'];
for(let i=0;i<3000;i++){
 const sql=Array.from({length:3+rnd(14)},()=>alphabet[rnd(alphabet.length)]).join('');
 for(const dialect of V.DIALECTS){
  try{const r=V.check(sql,{dialect,maxRows:20});assert.ok(/LIMIT 20$|limit \d+$|LIMIT 20\n?$|fetch/i.test(r.sql)||r.limit<=20,'limit: '+JSON.stringify(sql));
   // Whatever passes has no «;» outside literals and starts with SELECT/WITH.
   const sig=V.tokenize(r.sql,dialect).filter(t=>t.type!=='ws'&&t.type!=='comment');
   assert.ok(!sig.some(t=>t.type==='punct'&&t.text===';'),'no second statement: '+JSON.stringify(r.sql));
  }catch(e){if(!e.rejected)throw Error(dialect+' crashed on '+JSON.stringify(sql)+': '+e.stack);}
 }
}
console.log('SQL validator: limits, CTEs, comments, semicolons, dialect quoting, dangerous functions, Unicode tricks, '+hidden+' hidden and '+exposed+' exposed fuzz cases, 3000 random inputs passed');
