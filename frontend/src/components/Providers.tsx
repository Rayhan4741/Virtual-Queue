'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { LiteModeProvider } from '@/contexts/LiteModeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { Navbar } from '@/components/layout/Navbar';
import { AIAssistantWidget } from '@/components/AIAssistantWidget';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5000 } } }));
  const pathname = usePathname();
  const hideChrome = pathname?.startsWith('/kiosk') || pathname?.startsWith('/display');

  return (
    <QueryClientProvider client={queryClient}>
      <LiteModeProvider>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              {!hideChrome && <Navbar />}
              {children}
              {!hideChrome && <AIAssistantWidget />}
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </LiteModeProvider>
    </QueryClientProvider>
  );
}
