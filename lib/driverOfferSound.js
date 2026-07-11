let ctx = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function primeDriverOfferSound() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(c, freq, startAt, durationMs, peakGain = 0.35, type = "square") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.03);
}

/** Distinctive loud "new order" alert — three rising notes. */
export function playNewOrderOfferSound() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  tone(c, 523.25, now, 120, 0.32);
  tone(c, 659.25, now + 0.13, 120, 0.34);
  tone(c, 783.99, now + 0.26, 220, 0.36);
}

export function playOfferTimeoutSound() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  tone(c, 392, now, 180, 0.2, "sine");
  tone(c, 311.13, now + 0.15, 240, 0.16, "sine");
}
