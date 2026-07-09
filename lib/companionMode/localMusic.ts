"use client";

export interface LocalTrack {
  id: string;
  name: string;
  url: string;
  type: string;
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

let audioEl: HTMLAudioElement | null = null;
let tracks: LocalTrack[] = [];
let currentIndex = 0;
let playing = false;
let volumePct = 70;
let listeners: Listener[] = [];
let dbPromise: Promise<IDBDatabase> | null = null;

function emit() {
  const state = getLocalMusicState();
  listeners.forEach((fn) => fn(state));
}

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.addEventListener("ended", () => skipLocalMusic(1));
    audioEl.addEventListener("error", () => {
      playing = false;
      emit();
    });
  }
  return audioEl;
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
  if (!audio) return;
  audio.volume = Math.max(0, Math.min(1, volumePct / 100));
}

export function getLocalMusicState(): LocalMusicState {
  return {
    tracks: [...tracks],
    currentIndex,
    playing,
    currentTrack: tracks[currentIndex] || null,
  };
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

  if (audio.src !== track.url) {
    audio.src = track.url;
  }

  applyVolume();
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

export function skipLocalMusic(delta = 1) {
  if (tracks.length === 0) return;
  currentIndex = (currentIndex + delta + tracks.length) % tracks.length;
  const audio = getAudio();
  if (audio && playing) {
    audio.src = tracks[currentIndex].url;
    applyVolume();
    void audio.play();
  }
  emit();
}

export function setLocalMusicVolume(pct: number) {
  volumePct = Math.max(0, Math.min(100, pct));
  applyVolume();
}

export function isLocalMusicActive() {
  return playing && tracks.length > 0;
}

export function hasLocalTracks() {
  return tracks.length > 0;
}

/** Stop local playback (e.g. when switching away from ambient). */
export function stopLocalMusic() {
  pauseLocalMusic();
}
