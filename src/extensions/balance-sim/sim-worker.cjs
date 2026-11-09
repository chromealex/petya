// «Симуляция баланса»: runs sim.cjs off the main process thread (5000 players × 365 days takes seconds).
const {parentPort,workerData}=require('node:worker_threads');
const sim=require('./sim.cjs');
const {model,params,goals,change}=workerData;
const base=sim.run(model,params,goals);
const variant=change?sim.run(sim.apply(model,change),params,goals):null;
parentPort.postMessage({base,variant});
