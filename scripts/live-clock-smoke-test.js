import assert from "node:assert/strict";
import {
  LIVE_PERIODS,
  LIVE_TIMER_STATUSES,
  calculateElapsedSeconds,
  createLiveTimerState,
  finishLivePeriod,
  pauseLiveTimer,
  resumeLiveTimer,
  startLivePeriod
} from "../src/lib/liveMatchClock.js";

const base = Date.parse("2026-07-14T10:00:00.000Z");
const timer = startLivePeriod(createLiveTimerState(), LIVE_PERIODS.FIRST_HALF, base);

assert.equal(timer.timerStatus, LIVE_TIMER_STATUSES.RUNNING);
assert.equal(calculateElapsedSeconds(timer, base + 10 * 60 * 1000), 600);

const paused = pauseLiveTimer(timer, base + 10 * 60 * 1000);
assert.equal(paused.timerStatus, LIVE_TIMER_STATUSES.PAUSED);
assert.equal(calculateElapsedSeconds(paused, base + 15 * 60 * 1000), 600);

const resumed = resumeLiveTimer(paused, base + 20 * 60 * 1000);
assert.equal(calculateElapsedSeconds(resumed, base + 25 * 60 * 1000), 900);

const halftime = finishLivePeriod(resumed, LIVE_PERIODS.HALFTIME, base + 30 * 60 * 1000);
assert.equal(halftime.timerStatus, LIVE_TIMER_STATUSES.HALFTIME);
assert.equal(calculateElapsedSeconds(halftime, base + 60 * 60 * 1000), 1200);

console.log("Cronometro por timestamps OK");
