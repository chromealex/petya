// Automatic start and stop of a meeting recording from what meeting sources see (src/features/meeting-sources.cjs).
// `inspect()` returns {active, …}: two sightings in a row start the recording, three misses stop it. A manual stop
// pauses the monitor until the meeting is over, so the same meeting is not picked up again.
class MeetingMonitor {
  constructor({ inspect, start, stop }) { Object.assign(this, { inspect, start, stop }); this.active = false; this.hits = 0; this.misses = 0; this.busy = false; this.paused = false; this.generation = 0; }
  pause() { this.paused = true; this.generation++; }
  async tick(enabled) {
    if (this.busy) return;
    this.busy = true; const generation = this.generation;
    try {
      if (!enabled) { if (this.active) await this.stop(); this.active = false; this.hits = 0; this.misses = 0; this.paused = false; return { message: 'Автозапись встреч выключена' }; }
      const state = await this.inspect();
      if (generation !== this.generation) return;
      const found = state?.active === true;
      if (found) { this.hits++; this.misses = 0; }
      else { this.hits = 0; this.misses++; }
      if (!found && this.misses >= 3) { if (this.active) await this.stop(); this.active = false; this.paused = false; }
      if (found && this.hits >= 2 && !this.active && !this.paused) {
        this.active = true;
        try { await this.start(state); if (generation !== this.generation) { await this.stop(); this.active = false; } } catch (e) { this.paused = true; throw e; }
      }
      return { ...state, message: this.paused ? 'Автозапись приостановлена до следующей встречи' : this.active ? 'Идёт встреча' : 'Ожидаю встречу' };
    } catch (error) { if (this.active) { await this.stop(); this.active = false; this.paused = true; } throw error; }
    finally { this.busy = false; }
  }
}
module.exports = { MeetingMonitor };
