"use client";

import type { AudioPreferences, DuckingEvent } from "./types";

const STORAGE_KEY = "zoomeats_companion_audio";

type Listener = (state: AudioDuckingState) => void;

export interface AudioDuckingState {
  volume: number;
  ducked: boolean;
  lastEvent: DuckingEvent | null;
  announcement: string | null;
}

let restoreTimer: ReturnType<typeof setTimeout> | null = null;
let listeners: Listener[] = [];
const duckingState: AudioDuckingState = {
  volume: 70,
  ducked: false,
  lastEvent: null,
  announcement: null,
};

function emit() {
  listeners.forEach((fn) => fn({ ...duckingState }));
}

function loadPrefs(): AudioPreferences {
  if (typeof window === "undefined") return { musicVolume: 70, duckingEnabled: true, safetyMode: false, duckVolume: 20 };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { musicVolume: 70, duckingEnabled: true, safetyMode: false, duckVolume: 20 };
  } catch {
    return { musicVolume: 70, duckingEnabled: true, safetyMode: false, duckVolume: 20 };
  }
}

function savePrefs(prefs: AudioPreferences) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function subscribeAudioDucking(fn: Listener) {
  listeners.push(fn);
  fn({ ...duckingState });
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function setBaseVolume(volume: number, prefs?: AudioPreferences) {
  const p = prefs || loadPrefs();
  p.musicVolume = Math.min(100, Math.max(0, volume));
  savePrefs(p);
  if (!duckingState.ducked) {
    duckingState.volume = p.musicVolume;
    emit();
  }
}

export function triggerAudioDucking(event: DuckingEvent, prefs?: AudioPreferences) {
  const p = prefs || loadPrefs();
  if (!p.duckingEnabled) return;

  if (restoreTimer) clearTimeout(restoreTimer);

  duckingState.ducked = true;
  duckingState.volume = p.duckVolume ?? 20;
  duckingState.lastEvent = event;
  duckingState.announcement = event.message || null;
  emit();

  if (event.message && typeof window !== "undefined" && "speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(event.message);
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  }

  const restoreMs = event.priority === "high" ? 6000 : 4000;
  restoreTimer = setTimeout(() => restoreAudioVolume(p), restoreMs);
}

export function restoreAudioVolume(prefs?: AudioPreferences) {
  const p = prefs || loadPrefs();
  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
  duckingState.ducked = false;
  duckingState.volume = p.musicVolume;
  duckingState.announcement = null;
  emit();
}

export function getAudioDuckingState() {
  return { ...duckingState };
}
