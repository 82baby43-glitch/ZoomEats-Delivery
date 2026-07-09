"use client";

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let nodes: OscillatorNode[] = [];
let playing = false;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function isCompanionPlaybackActive() {
  return playing;
}

export async function startCompanionPlayback(volumePct: number): Promise<boolean> {
  const ctx = ensureContext();
  if (!ctx) return false;

  stopCompanionPlayback();

  masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(100, volumePct)) / 100 * 0.12;
  masterGain.connect(ctx.destination);

  const frequencies = [196, 246.94, 293.66];
  nodes = frequencies.map((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(masterGain!);
    osc.start();
    return osc;
  });

  playing = true;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return true;
}

export function stopCompanionPlayback() {
  for (const node of nodes) {
    try {
      node.stop();
    } catch {
      /* ignore */
    }
  }
  nodes = [];
  masterGain = null;
  playing = false;
}

export function setCompanionPlaybackVolume(volumePct: number) {
  if (masterGain) {
    masterGain.gain.value = Math.max(0, Math.min(100, volumePct)) / 100 * 0.12;
  }
}
