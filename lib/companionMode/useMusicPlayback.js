"use client";

import { useCallback, useEffect, useState } from "react";
import { setBaseVolume } from "@/lib/companionMode/audioDucking";
import {
  hasLocalTracks,
  pauseLocalMusic,
  playLocalMusic,
  seekLocalMusic,
  setLocalMusicVolume,
  skipLocalMusic,
  stopLocalMusic,
  subscribeLocalMusic,
} from "@/lib/companionMode/localMusic";
import {
  isCompanionPlaybackActive,
  startCompanionPlayback,
  stopCompanionPlayback,
  setCompanionPlaybackVolume,
} from "@/lib/companionMode/playback";

/** Shared driver music transport — play/pause must run in click handlers for mobile autoplay policy. */
export function useMusicPlayback({ settings, audio, updateSettings }) {
  const [localState, setLocalState] = useState({
    playing: false,
    tracks: [],
    currentTrack: null,
  });
  const [synthPlaying, setSynthPlaying] = useState(false);

  const prefs = settings?.audio_preferences;
  const isAmbient = settings?.music_connected && !settings?.music_provider;
  const effectiveVolume =
    audio.ducked && prefs?.duckingEnabled ? (prefs.duckVolume ?? 20) : audio.volume;
  const useDeviceMusic = isAmbient && hasLocalTracks();
  const useAmbientSynth = isAmbient && !hasLocalTracks();
  const useProviderSynth = Boolean(settings?.music_connected && !isAmbient);

  useEffect(() => subscribeLocalMusic(setLocalState), []);

  useEffect(() => {
    setSynthPlaying(isCompanionPlaybackActive());
  }, [localState.playing]);

  const playing = useDeviceMusic ? localState.playing : synthPlaying;

  useEffect(() => {
    if (!playing) return;
    if (useDeviceMusic) setLocalMusicVolume(effectiveVolume);
    else if (useAmbientSynth || useProviderSynth) setCompanionPlaybackVolume(effectiveVolume);
  }, [effectiveVolume, playing, useDeviceMusic, useAmbientSynth, useProviderSynth]);

  const canPlay =
    useDeviceMusic || useAmbientSynth || useProviderSynth;

  const onVolume = useCallback(
    async (v) => {
      await updateSettings({ musicVolume: v });
      setBaseVolume(v, { ...prefs, musicVolume: v });
      if (useDeviceMusic) setLocalMusicVolume(v);
      else if (useAmbientSynth || useProviderSynth) setCompanionPlaybackVolume(v);
    },
    [updateSettings, prefs, useDeviceMusic, useAmbientSynth, useProviderSynth],
  );

  const onPlay = useCallback(async () => {
    if (useDeviceMusic) {
      setLocalMusicVolume(effectiveVolume);
      const ok = await playLocalMusic();
      return ok;
    }
    if (useAmbientSynth || useProviderSynth) {
      const ok = await startCompanionPlayback(effectiveVolume);
      setSynthPlaying(ok);
      return ok;
    }
    return false;
  }, [useDeviceMusic, useAmbientSynth, useProviderSynth, effectiveVolume]);

  const onPause = useCallback(() => {
    pauseLocalMusic();
    stopCompanionPlayback();
    setSynthPlaying(false);
  }, []);

  const onStop = useCallback(() => {
    stopLocalMusic();
    stopCompanionPlayback();
    setSynthPlaying(false);
  }, []);

  const onTogglePlay = useCallback(async () => {
    if (playing) {
      onPause();
      return;
    }
    await onPlay();
  }, [playing, onPause, onPlay]);

  const onRewind = useCallback(() => {
    if (useDeviceMusic) seekLocalMusic(-10);
  }, [useDeviceMusic]);

  const onFastForward = useCallback(() => {
    if (useDeviceMusic) seekLocalMusic(10);
  }, [useDeviceMusic]);

  const onSkipForward = useCallback(() => {
    if (useDeviceMusic) skipLocalMusic(1);
  }, [useDeviceMusic]);

  const onSkipBack = useCallback(() => {
    if (useDeviceMusic) skipLocalMusic(-1);
  }, [useDeviceMusic]);

  return {
    localState,
    playing,
    canPlay,
    isAmbient,
    useDeviceMusic,
    useAmbientSynth,
    useProviderSynth,
    effectiveVolume,
    onVolume,
    onPlay,
    onPause,
    onStop,
    onTogglePlay,
    onRewind,
    onFastForward,
    onSkipForward,
    onSkipBack,
  };
}
