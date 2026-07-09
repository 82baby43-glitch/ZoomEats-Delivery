"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceCommandHandlers {
  onAcceptOrder?: () => void;
  onStartNavigation?: () => void;
  onArrivedRestaurant?: () => void;
  onDelivered?: () => void;
}

const PHRASE_MAP: Array<{ patterns: RegExp[]; key: keyof VoiceCommandHandlers }> = [
  { patterns: [/accept order/i, /take order/i], key: "onAcceptOrder" },
  { patterns: [/start navigation/i, /navigate/i, /open maps/i], key: "onStartNavigation" },
  { patterns: [/arrived at restaurant/i, /at restaurant/i, /picked up/i], key: "onArrivedRestaurant" },
  { patterns: [/delivered/i, /complete delivery/i, /drop off/i], key: "onDelivered" },
];

export function useVoiceCommands(enabled: boolean, handlers: VoiceCommandHandlers) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const win = window as Window & {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim();
      if (!transcript) return;
      setLastHeard(transcript);

      for (const { patterns, key } of PHRASE_MAP) {
        if (patterns.some((re) => re.test(transcript))) {
          handlersRef.current[key]?.();
          break;
        }
      }
    };

    recognition.onend = () => {
      if (enabled) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }

    return () => {
      recognition.onend = null;
      try { recognition.stop(); } catch { /* ignore */ }
      setListening(false);
    };
  }, [enabled]);

  return { listening, lastHeard };
}
