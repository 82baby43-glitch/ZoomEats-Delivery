/**
 * Synth-based "new order" chime — no audio file, just Web Audio oscillators.
 * Two-note pleasant motif (A5 → E6) with a quick exponential fade so it cuts
 * through kitchen noise but doesn't startle. ~300ms total.
 *
 * Autoplay rules: browsers require a user gesture before AudioContext can play.
 * Call `primeChime()` from inside a click handler (e.g. the "Enable notifications"
 * button) to create + resume the context. After that, `playChime()` works freely.
 */
let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function primeChime() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(c, freq, startAt, durationMs, peakGain = 0.18) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Quick attack + exponential decay → "ding"
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.02);
}

export function playChime() {
  const c = getCtx();
  if (!c) return;
  // Some browsers leave the ctx suspended even after primeChime; best-effort resume.
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  tone(c, 880, now, 140);          // A5
  tone(c, 1318.5, now + 0.11, 220); // E6
}
