/**
 * useSpeechRecognition Hook - Browser Web Speech API wrapper
 *
 * Provides speech-to-text functionality using the browser's
 * built-in SpeechRecognition API (Chrome, Edge, Safari).
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Web Speech API types (not in standard lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

// Map app locale to BCP-47 speech recognition language tag
const LOCALE_TO_SPEECH_LANG: Record<string, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  'zh-CN': 'zh-CN',
  ja: 'ja-JP',
  es: 'es-ES',
  pt: 'pt-BR',
};

export function getSpeechLang(locale: string): string {
  return LOCALE_TO_SPEECH_LANG[locale] ?? navigator.language ?? 'en-US';
}

interface UseSpeechRecognitionOptions {
  lang?: string;
  onTranscript: (text: string) => void;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  toggle: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  lang = 'ko-KR',
  onTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const isSupported = getSpeechRecognition() !== null;

  // Keep callback ref up to date to avoid stale closures
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    // Guard: if an instance already exists (starting or active), treat as stop
    if (isListening || recognitionRef.current) {
      stop();
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) {
      setError('not-supported');
      return;
    }

    setError(null);

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' is expected when user stops manually
      if (event.error !== 'aborted') {
        setError(event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setError('start-failed');
      setIsListening(false);
    }
  }, [isListening, lang, stop]);

  return { isListening, isSupported, error, toggle, stop };
}
