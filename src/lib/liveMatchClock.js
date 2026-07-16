export const LIVE_TIMER_STATUSES = Object.freeze({
  NOT_STARTED: "not_started",
  RUNNING: "running",
  PAUSED: "paused",
  HALFTIME: "halftime",
  SUSPENDED: "suspended",
  FINISHED: "finished"
});

export const LIVE_PERIODS = Object.freeze({
  PRE_MATCH: "pre_match",
  FIRST_HALF: "first_half",
  HALFTIME: "halftime",
  SECOND_HALF: "second_half",
  EXTRA_TIME_FIRST: "extra_time_first",
  EXTRA_TIME_SECOND: "extra_time_second",
  FINISHED: "finished"
});

export function getLiveClientSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function periodNumberToKey(period) {
  if (Number(period) === 4) return LIVE_PERIODS.EXTRA_TIME_SECOND;
  if (Number(period) === 3) return LIVE_PERIODS.EXTRA_TIME_FIRST;
  if (Number(period) === 2) return LIVE_PERIODS.SECOND_HALF;
  return LIVE_PERIODS.FIRST_HALF;
}

export function periodKeyToNumber(period) {
  if (period === LIVE_PERIODS.FINISHED) return 5;
  if (period === LIVE_PERIODS.EXTRA_TIME_SECOND) return 4;
  if (period === LIVE_PERIODS.EXTRA_TIME_FIRST) return 3;
  if (period === LIVE_PERIODS.SECOND_HALF) return 2;
  return 1;
}

export function getLivePeriodLabel(period) {
  if (period === LIVE_PERIODS.EXTRA_TIME_SECOND) return "2TE";
  if (period === LIVE_PERIODS.EXTRA_TIME_FIRST) return "1TE";
  if (period === LIVE_PERIODS.SECOND_HALF) return "2T";
  if (period === LIVE_PERIODS.HALFTIME) return "Descanso";
  if (period === LIVE_PERIODS.FINISHED) return "Finalizado";
  if (period === LIVE_PERIODS.PRE_MATCH) return "Prepartido";
  return "1T";
}

function toTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

export function createLiveTimerState(overrides = {}) {
  const now = Date.now();
  return {
    currentPeriod: overrides.currentPeriod || LIVE_PERIODS.PRE_MATCH,
    timerStatus: overrides.timerStatus || LIVE_TIMER_STATUSES.NOT_STARTED,
    periodStartedAt: overrides.periodStartedAt || null,
    accumulatedSeconds: Math.max(0, Number(overrides.accumulatedSeconds || 0)),
    pausedAt: overrides.pausedAt || null,
    totalPausedSeconds: Math.max(0, Number(overrides.totalPausedSeconds || 0)),
    firstHalfStartedAt: overrides.firstHalfStartedAt || null,
    firstHalfEndedAt: overrides.firstHalfEndedAt || null,
    secondHalfStartedAt: overrides.secondHalfStartedAt || null,
    secondHalfEndedAt: overrides.secondHalfEndedAt || null,
    extraTimeSeconds: Math.max(0, Number(overrides.extraTimeSeconds || 0)),
    suspensionStartedAt: overrides.suspensionStartedAt || null,
    suspensionReason: overrides.suspensionReason || "",
    lastUpdatedAt: overrides.lastUpdatedAt || nowIso(now),
    clientSessionId: overrides.clientSessionId || getLiveClientSessionId(),
    version: Math.max(1, Number(overrides.version || 1)),
    serverTimeOffsetMs: Number(overrides.serverTimeOffsetMs || 0)
  };
}

export function calculateElapsedSeconds(timerState, now = Date.now()) {
  if (!timerState) return 0;
  const accumulated = Math.max(0, Number(timerState.accumulatedSeconds || 0));
  if (timerState.timerStatus !== LIVE_TIMER_STATUSES.RUNNING) return accumulated;
  const startedAt = toTimestamp(timerState.periodStartedAt);
  if (!startedAt) return accumulated;
  return Math.max(0, accumulated + Math.floor((now - startedAt) / 1000));
}

export function startLivePeriod(timerState, period, now = Date.now()) {
  const current = createLiveTimerState(timerState);
  const next = {
    ...current,
    currentPeriod: period,
    timerStatus: LIVE_TIMER_STATUSES.RUNNING,
    periodStartedAt: nowIso(now),
    accumulatedSeconds: 0,
    pausedAt: null,
    suspensionStartedAt: null,
    suspensionReason: "",
    lastUpdatedAt: nowIso(now),
    version: current.version + 1
  };
  if (period === LIVE_PERIODS.FIRST_HALF && !next.firstHalfStartedAt) next.firstHalfStartedAt = nowIso(now);
  if (period === LIVE_PERIODS.SECOND_HALF && !next.secondHalfStartedAt) next.secondHalfStartedAt = nowIso(now);
  return next;
}

export function pauseLiveTimer(timerState, now = Date.now()) {
  const current = createLiveTimerState(timerState);
  const elapsed = calculateElapsedSeconds(current, now);
  return {
    ...current,
    timerStatus: LIVE_TIMER_STATUSES.PAUSED,
    periodStartedAt: null,
    accumulatedSeconds: elapsed,
    pausedAt: nowIso(now),
    lastUpdatedAt: nowIso(now),
    version: current.version + 1
  };
}

export function resumeLiveTimer(timerState, now = Date.now()) {
  const current = createLiveTimerState(timerState);
  return {
    ...current,
    timerStatus: LIVE_TIMER_STATUSES.RUNNING,
    periodStartedAt: nowIso(now),
    pausedAt: null,
    lastUpdatedAt: nowIso(now),
    version: current.version + 1
  };
}

export function finishLivePeriod(timerState, nextPeriod = LIVE_PERIODS.HALFTIME, now = Date.now()) {
  const current = pauseLiveTimer(timerState, now);
  const next = {
    ...current,
    currentPeriod: nextPeriod,
    timerStatus: nextPeriod === LIVE_PERIODS.FINISHED ? LIVE_TIMER_STATUSES.FINISHED : LIVE_TIMER_STATUSES.HALFTIME,
    lastUpdatedAt: nowIso(now),
    version: current.version + 1
  };
  if (timerState?.currentPeriod === LIVE_PERIODS.FIRST_HALF) next.firstHalfEndedAt = nowIso(now);
  if (timerState?.currentPeriod === LIVE_PERIODS.SECOND_HALF) next.secondHalfEndedAt = nowIso(now);
  return next;
}

export function suspendLiveTimer(timerState, reason = "", now = Date.now()) {
  const current = pauseLiveTimer(timerState, now);
  return {
    ...current,
    timerStatus: LIVE_TIMER_STATUSES.SUSPENDED,
    suspensionStartedAt: nowIso(now),
    suspensionReason: reason,
    lastUpdatedAt: nowIso(now),
    version: current.version + 1
  };
}

export function detectTimeDrift({ serverTimestamp, localTimestamp = Date.now(), thresholdMs = 120000 }) {
  const serverTime = toTimestamp(serverTimestamp);
  if (!serverTime) return { hasDrift: false, driftMs: 0 };
  const driftMs = localTimestamp - serverTime;
  return {
    hasDrift: Math.abs(driftMs) > thresholdMs,
    driftMs
  };
}
