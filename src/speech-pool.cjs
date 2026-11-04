const net = require('node:net');
const os = require('node:os');
function speechConcurrency(memory = os.totalmem(), cores = os.availableParallelism()) {
  return memory >= 32 * 2 ** 30 && cores >= 16 ? 4 : memory >= 16 * 2 ** 30 && cores >= 8 ? 2 : 1;
}
const { Speech } = require('./speech.cjs');
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
// Each whisper-server owns a model mutex; separate processes are required.
class SpeechPool extends Speech {
  constructor(options = {}) {
    super(options);
    this.workerFactory = options.workerFactory || (() => new Speech(options));
    this.port = options.port || freePort;
    this.isolated = options.isolated || false;
    this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency || speechConcurrency())));
    this.lanes = Array.from({length: this.concurrency}, () => Promise.resolve());
    this.loads = Array(this.concurrency).fill(0); this.epoch = 0; this.workers = [];
  }
  ensure(settings) {
    return super.ensure(settings).then(result => { this.warm(settings); return { ...result, concurrency: this.concurrency }; });
  }
  async start(settings) {
    // The bundled runtime owns a private primary port. A leftover server on 8080
    // may have a different model; do not adopt it or terminate an external process.
    if(this.isolated&&settings.whisperUrl==='http://127.0.0.1:8080/inference'&&settings.whisperBinary&&settings.whisperModel&&this.exists(settings.whisperBinary)&&this.exists(settings.whisperModel)){
      if(!this.primaryEndpoint)this.primaryEndpoint=`http://127.0.0.1:${await this.port()}/inference`;
      return super.start({...settings,whisperUrl:this.primaryEndpoint});
    }
    return super.start(settings);
  }
  warm(settings) {
    const key = JSON.stringify([settings.whisperUrl, settings.whisperBinary, settings.whisperModel]);
    if (key === this.workerKey) return this.warming;
    this.workers.forEach(worker => worker.stop()); this.workers = []; this.workerKey = key;
    const epoch = ++this.epoch;
    this.readyWorkers = Array.from({length: this.concurrency - 1}, () => {
      const worker = this.workerFactory(); this.workers.push(worker);
      return (async () => {
        if (!settings.whisperBinary || !settings.whisperModel || !this.exists(settings.whisperBinary) || !this.exists(settings.whisperModel)) return null;
        const port = await this.port();
        if (epoch !== this.epoch) return null;
        const endpoint = `http://127.0.0.1:${port}/inference`;
        await worker.ensure({ ...settings, whisperUrl: endpoint });
        if (epoch !== this.epoch) { worker.stop(); return null; }
        return endpoint;
      })().catch(() => { worker.stop(); return null; });
    });
    this.warming = Promise.all(this.readyWorkers);
    return this.warming;
  }
  lane(index, task) {
    this.loads[index]++;
    const result = this.lanes[index].then(task);
    this.lanes[index] = result.catch(() => {}).finally(() => { this.loads[index]--; });
    return result;
  }
  run(settings, task) {
    const endpoint = this.primaryEndpoint || settings.whisperUrl;
    this.warm(settings);
    const index = this.loads.indexOf(Math.min(...this.loads));
    const ready = this.readyWorkers[index - 1];
    const currentEpoch = this.epoch;
    const check = () => { if (currentEpoch !== this.epoch) throw new Error('Распознавание остановлено или настройки изменились.'); };
    if (index === 0) return this.lane(0, () => { check(); return task(endpoint); });
    return this.lane(index, async () => {
      const second = await ready; check();
      // Unsupported custom runtimes keep working, serially on the primary server.
      if (!second) return this.lane(0, () => { check(); return task(endpoint); });
      return task(second);
    });
  }
  stop() { ++this.epoch; this.workers.forEach(worker => worker.stop()); this.workerKey = null; this.primaryEndpoint=null; super.stop(); }
}
module.exports = { SpeechPool, speechConcurrency };
