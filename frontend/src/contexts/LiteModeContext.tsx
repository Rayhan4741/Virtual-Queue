'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface LiteModeContextValue {
  liteMode: boolean;
  toggleLiteMode: () => void;
  a11yMode: boolean;
  toggleA11yMode: () => void;
  online: boolean;
}

const LiteModeContext = createContext<LiteModeContextValue | null>(null);

export function LiteModeProvider({ children }: { children: React.ReactNode }) {
  const [liteMode, setLiteMode] = useState(false);
  const [a11yMode, setA11yMode] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setLiteMode(localStorage.getItem('vq_lite_mode') === 'true');
    setA11yMode(localStorage.getItem('vq_a11y_mode') === 'true');
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

  useEffect(() => {
    document.documentElement.classList.toggle('a11y-mode', a11yMode);
    localStorage.setItem('vq_a11y_mode', String(a11yMode));
  }, [a11yMode]);

  return (
    <LiteModeContext.Provider
      value={{
        liteMode,
        toggleLiteMode: () => setLiteMode((v) => !v),
        a11yMode,
        toggleA11yMode: () => setA11yMode((v) => !v),
        online,
      }}
    >
      {children}
    </LiteModeContext.Provider>
  );
}

export function useLiteMode() {
  const ctx = useContext(LiteModeContext);
  if (!ctx) throw new Error('useLiteMode must be used inside LiteModeProvider');
  return ctx;
}
