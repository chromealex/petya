// Live check of the skill sandbox with the local Docker: run with `node tests/skill-sandbox-live.cjs`.
// Skipped when Docker or the python:3.12-slim image is not available.
const assert=require('node:assert/strict');
const {SkillSandbox}=require('../src/skill-sandbox.cjs');
(async()=>{
 const sandbox=new SkillSandbox(),status=await sandbox.status();
 if(!status.ready){console.log('Skill sandbox live: skipped ('+status.message+')');return;}
 const files={
  'skill/scripts/total.py':'import csv, os, sys, json\nfrom lib.util import money\nrows=list(csv.reader(open(os.path.join(os.environ["PETYA_INPUT"],"sales.csv"),encoding="utf-8")))\ntotal=sum(float(r[1]) for r in rows[1:])\nprint("Итого:",money(total),"для",sys.argv[1])\nos.makedirs(os.path.join(os.environ["PETYA_OUT"],"reports"),exist_ok=True)\nopen(os.path.join(os.environ["PETYA_OUT"],"reports","итог.json"),"w",encoding="utf-8").write(json.dumps({"total":total},ensure_ascii=False))\n',
  'skill/scripts/lib/__init__.py':'',
  'skill/scripts/lib/util.py':'def money(v):\n    return f"{v:,.2f}".replace(","," ")\n',
  'skill/scripts/probe.py':'import os, socket\nr=[]\ntry:\n    socket.create_connection(("1.1.1.1",53),timeout=2); r.append("network")\nexcept OSError: r.append("offline")\ntry:\n    open("/etc/petya","w"); r.append("root-writable")\nexcept OSError: r.append("read-only")\nr.append("uid="+str(os.getuid()))\nprint(" ".join(r))\n',
  'skill/scripts/hang.py':'while True: pass\n',
  'input/sales.csv':'товар,сумма\nМагазин,1200.5\nПодписка,800\n'
 };
 let r=await sandbox.run({files,command:['python','scripts/total.py','ноябрь']});
 assert(r.ok,r.stderr);assert.equal(r.stdout.trim(),'Итого: 2 000.50 для ноябрь');
 assert.deepEqual(JSON.parse(r.files['reports/итог.json'].toString()),{total:2000.5},'files in out/ come back with their folders');
 r=await sandbox.run({files,command:['python','scripts/probe.py']});
 assert.equal(r.stdout.trim(),'offline read-only uid=65534','no network, read-only root, unprivileged user');
 r=await sandbox.run({files,command:['python','scripts/hang.py'],timeoutMs:3000});
 assert(!r.ok&&r.exitCode===-9,'a hanging script is stopped');
 await assert.rejects(sandbox.run({files,command:['ruby','x.rb']}),/python, bash или node/);
 console.log('Skill sandbox live: real Docker run, nested modules, user files, output folders, no network, read-only root, unprivileged user and timeout OK');
})().catch(e=>{console.error(e);process.exit(1);});
