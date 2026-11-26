'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface LiteModeContextValue {
  liteMode: boolean;
  toggleLiteMode: () => void;
  online: boolean;
}

const LiteModeContext = createContext<LiteModeContextValue | null>(null);

export function LiteModeProvider({ children }: { children: React.ReactNode }) {
  const [liteMode, setLiteMode] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setLiteMode(localStorage.getItem('vq_lite_mode') === 'true');
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('lite-mode', liteMode);
    localStorage.setItem('vq_lite_mode', String(liteMode));
  }, [liteMode]);

  return (
    <LiteModeContext.Provider value={{ liteMode, toggleLiteMode: () => setLiteMode((v) => !v), online }}>
      {children}
    </LiteModeContext.Provider>
  );
}

export function useLiteMode() {
  const ctx = useContext(LiteModeContext);
  if (!ctx) throw new Error('useLiteMode must be used inside LiteModeProvider');
  return ctx;
}
