"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addLocalMusicFiles,
  clearLocalMusicLibrary,
  getLocalMusicState,
  initLocalMusicLibrary,
  removeLocalTrack,
  subscribeLocalMusic,
  type LocalMusicState,
} from "@/lib/companionMode/localMusic";

export function useLocalMusic() {
  const [state, setState] = useState<LocalMusicState>(() => ({
    tracks: [],
    currentIndex: 0,
    playing: false,
    currentTrack: null,
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    initLocalMusicLibrary().then(() => {
      if (mounted) {
        setState(getLocalMusicState());
        setReady(true);
      }
    });
    const unsub = subscribeLocalMusic(setState);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const count = await addLocalMusicFiles(files);
    return count;
  }, []);

  const removeTrack = useCallback(async (id: string) => {
    await removeLocalTrack(id);
  }, []);

  const clearLibrary = useCallback(async () => {
    await clearLocalMusicLibrary();
  }, []);

  return {
    ...state,
    ready,
    addFiles,
    removeTrack,
    clearLibrary,
  };
}
