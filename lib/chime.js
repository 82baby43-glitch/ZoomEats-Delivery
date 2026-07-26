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

function tone(c, freq, startAt, durationMs, peakGain = 0.18, volume = 1) {
  const gainPeak = peakGain * Math.min(1, Math.max(0, volume));
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Quick attack + exponential decay → "ding"
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.02);
}

export function playChime(volume = 1) {
  const c = getCtx();
  if (!c) return;
  // Some browsers leave the ctx suspended even after primeChime; best-effort resume.
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  tone(c, 880, now, 140, 0.18, volume);          // A5
  tone(c, 1318.5, now + 0.11, 220, 0.18, volume); // E6
}

/** Short single-tone beep for repeating merchant alerts. */
export function playBeep(volume = 1) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  tone(c, 1046.5, now, 120, 0.22, volume); // C6
}

export function playMerchantAlert(tone = "chime", volume = 0.8) {
  if (tone === "beep") playBeep(volume);
  else playChime(volume);
}
