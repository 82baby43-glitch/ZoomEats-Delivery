"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { subscribeAudioDucking } from "@/lib/companionMode/audioDucking";
import { useCompanionMode } from "@/lib/hooks/useCompanionMode";
import { useLocalMusic } from "@/lib/hooks/useLocalMusic";

const CompanionCtx = createContext(null);

export function CompanionModeProvider({ children }) {
  const companion = useCompanionMode();
  const localMusic = useLocalMusic();
  const [audio, setAudio] = useState({ volume: 70, ducked: false, lastEvent: null, announcement: null });

  useEffect(() => subscribeAudioDucking(setAudio), []);

  return (
    <CompanionCtx.Provider value={{ ...companion, localMusic, audio }}>
      {children}
    </CompanionCtx.Provider>
  );
}

export function useCompanionContext() {
  const ctx = useContext(CompanionCtx);
  if (!ctx) throw new Error("useCompanionContext requires CompanionModeProvider");
  return ctx;
}
