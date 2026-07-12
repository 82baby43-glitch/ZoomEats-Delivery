"use client";

export interface LocalTrack {
  id: string;
  name: string;
  url: string;
  type: string;
}

export interface EqSettings {
  bass: number;
  mid: number;
  treble: number;
}

type Listener = (state: LocalMusicState) => void;

export interface LocalMusicState {
  tracks: LocalTrack[];
  currentIndex: number;
  playing: boolean;
  currentTrack: LocalTrack | null;
}

const DB_NAME = "zoomeats_companion_music";
const DB_VERSION = 1;
const STORE = "tracks";
const EQ_STORAGE_KEY = "zoomeats_local_music_eq";

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let bassFilter: BiquadFilterNode | null = null;
let midFilter: BiquadFilterNode | null = null;
let trebleFilter: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;
let graphReady = false;

let tracks: LocalTrack[] = [];
let currentIndex = 0;
let playing = false;
let volumePct = 70;
let eq: EqSettings = { bass: 0, mid: 0, treble: 0 };
let listeners: Listener[] = [];
let dbPromise: Promise<IDBDatabase> | null = null;

function loadEqFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<EqSettings>;
    eq = {
      bass: clampEq(parsed.bass ?? 0),
      mid: clampEq(parsed.mid ?? 0),
      treble: clampEq(parsed.treble ?? 0),
    };
  } catch {
    /* ignore */
  }
}

function persistEq() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(eq));
  } catch {
    /* ignore */
  }
}

function clampEq(v: number) {
  return Math.max(-12, Math.min(12, v));
}

function emit() {
  const state = getLocalMusicState();
  listeners.forEach((fn) => fn(state));
}

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.addEventListener("ended", () => skipLocalMusic(1));
    audioEl.addEventListener("error", () => {
      playing = false;
      emit();
    });
  }
  return audioEl;
}

function ensureAudioGraph() {
  if (graphReady || typeof window === "undefined") return;
  const audio = getAudio();
  if (!audio) return;

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(audio);

    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 200;

    midFilter = audioCtx.createBiquadFilter();
    midFilter.type = "peaking";
    midFilter.frequency.value = 1000;
    midFilter.Q.value = 1;

    trebleFilter = audioCtx.createBiquadFilter();
    trebleFilter.type = "highshelf";
    trebleFilter.frequency.value = 4000;

    gainNode = audioCtx.createGain();

    sourceNode.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    graphReady = true;
    applyVolume();
    applyEq();
  } catch {
    graphReady = false;
  }
}

async function resumeAudioContext() {
  ensureAudioGraph();
  if (audioCtx?.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      return false;
    }
  }
  return true;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function persistTrack(id: string, name: string, type: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, name, type, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteTrackFromDb(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTracksFromDb() {
  const db = await openDb();
  const rows = await new Promise<Array<{ id: string; name: string; type: string; blob: Blob }>>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  for (const row of tracks) {
    if (row.url.startsWith("blob:")) URL.revokeObjectURL(row.url);
  }

  tracks = rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    url: URL.createObjectURL(row.blob),
  }));

  if (currentIndex >= tracks.length) currentIndex = 0;
  emit();
}

function applyVolume() {
  const audio = getAudio();
  const vol = Math.max(0, Math.min(1, volumePct / 100));
  if (gainNode) {
    gainNode.gain.value = vol;
  } else if (audio) {
    audio.volume = vol;
  }
}

function applyEq() {
  if (bassFilter) bassFilter.gain.value = eq.bass;
  if (midFilter) midFilter.gain.value = eq.mid;
  if (trebleFilter) trebleFilter.gain.value = eq.treble;
}

export function getLocalMusicState(): LocalMusicState {
  return {
    tracks: [...tracks],
    currentIndex,
    playing,
    currentTrack: tracks[currentIndex] || null,
  };
}

export function getLocalMusicEq(): EqSettings {
  return { ...eq };
}

export function subscribeLocalMusic(fn: Listener) {
  listeners.push(fn);
  fn(getLocalMusicState());
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export async function initLocalMusicLibrary() {
  if (typeof window === "undefined") return;
  loadEqFromStorage();
  try {
    await loadTracksFromDb();
  } catch {
    tracks = [];
    emit();
  }
}

export async function addLocalMusicFiles(files: FileList | File[]) {
  const list = Array.from(files).filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac|webm)$/i.test(f.name));
  if (list.length === 0) return 0;

  for (const file of list) {
    const id = `track_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await persistTrack(id, file.name.replace(/\.[^.]+$/, ""), file.type || "audio/mpeg", file);
  }

  await loadTracksFromDb();
  return list.length;
}

export async function removeLocalTrack(id: string) {
  const idx = tracks.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const wasCurrent = idx === currentIndex;
  const track = tracks[idx];
  if (track.url.startsWith("blob:")) URL.revokeObjectURL(track.url);

  await deleteTrackFromDb(id);
  await loadTracksFromDb();

  if (wasCurrent) {
    pauseLocalMusic();
    if (tracks.length > 0) {
      currentIndex = Math.min(idx, tracks.length - 1);
      if (playing) void playLocalMusic();
    }
  }
  emit();
}

export async function clearLocalMusicLibrary() {
  pauseLocalMusic();
  for (const t of tracks) {
    if (t.url.startsWith("blob:")) URL.revokeObjectURL(t.url);
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  tracks = [];
  currentIndex = 0;
  emit();
}

export async function playLocalMusic() {
  const track = tracks[currentIndex];
  if (!track) return false;

  const audio = getAudio();
  if (!audio) return false;

  const ctxOk = await resumeAudioContext();
  if (!ctxOk) return false;

  if (audio.src !== track.url) {
    audio.src = track.url;
  }

  applyVolume();
  applyEq();
  try {
    await audio.play();
    playing = true;
    emit();
    return true;
  } catch {
    playing = false;
    emit();
    return false;
  }
}

export function pauseLocalMusic() {
  const audio = getAudio();
  audio?.pause();
  playing = false;
  emit();
}

export function toggleLocalMusic() {
  if (playing) {
    pauseLocalMusic();
    return false;
  }
  void playLocalMusic();
  return true;
}

export async function skipLocalMusic(delta = 1) {
  if (tracks.length === 0) return;
  currentIndex = (currentIndex + delta + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  if (!track) return;

  const audio = getAudio();
  if (!audio) return;

  const ctxOk = await resumeAudioContext();
  if (!ctxOk) {
    emit();
    return;
  }

  audio.src = track.url;
  applyVolume();
  applyEq();

  if (playing) {
    try {
      await audio.play();
    } catch {
      playing = false;
    }
  }

  emit();
}

export function seekLocalMusic(deltaSeconds: number) {
  const audio = getAudio();
  if (!audio || !Number.isFinite(audio.duration)) return;
  const next = audio.currentTime + deltaSeconds;
  audio.currentTime = Math.max(0, Math.min(audio.duration, next));
  emit();
}

/** Jump to the start of the current track and play from the beginning. */
export async function restartLocalMusic() {
  const track = tracks[currentIndex];
  if (!track) return false;

  const audio = getAudio();
  if (!audio) return false;

  const ctxOk = await resumeAudioContext();
  if (!ctxOk) return false;

  if (audio.src !== track.url) {
    audio.src = track.url;
  }

  audio.currentTime = 0;
  applyVolume();
  applyEq();
  try {
    await audio.play();
    playing = true;
    emit();
    return true;
  } catch {
    playing = false;
    emit();
    return false;
  }
}

export function setLocalMusicVolume(pct: number) {
  volumePct = Math.max(0, Math.min(100, pct));
  applyVolume();
}

export function setLocalMusicEq(partial: Partial<EqSettings>) {
  eq = {
    bass: clampEq(partial.bass ?? eq.bass),
    mid: clampEq(partial.mid ?? eq.mid),
    treble: clampEq(partial.treble ?? eq.treble),
  };
  applyEq();
  persistEq();
}

export function isLocalMusicActive() {
  return playing && tracks.length > 0;
}

export function hasLocalTracks() {
  return tracks.length > 0;
}

/** Stop local playback (e.g. when switching away from ambient). */
export function stopLocalMusic() {
  const audio = getAudio();
  audio?.pause();
  if (audio) audio.currentTime = 0;
  playing = false;
  emit();
}
