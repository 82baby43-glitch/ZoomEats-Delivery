"use client";

import { useCompanionContext } from "./CompanionModeProvider";
import { useMusicPlayback } from "@/lib/companionMode/useMusicPlayback";

/** Keeps companion music volume in sync with ducking state without showing player UI. */
export default function CompanionAudioSync() {
  const { settings, audio, updateSettings } = useCompanionContext();
  useMusicPlayback({ settings, audio, updateSettings });
  return null;
}
