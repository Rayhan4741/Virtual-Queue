'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X, Wifi, WifiOff, Zap, LogOut, Layers, Tablet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useLiteMode } from '@/contexts/LiteModeContext';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/Button';

export function Navbar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { liteMode, toggleLiteMode, online } = useLiteMode();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur no-print">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Layers className="h-5 w-5 text-sky-400" />
            </div>
            <span className="text-lg tracking-tight">Virtual Queue</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
            <Link href="/organizations" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
              Organizations
            </Link>
            <Link href="/kiosk" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
              <Tablet className="h-4 w-4" /> Kiosk
            </Link>
            {user?.role === 'CUSTOMER' && (
              <>
                <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
                  Dashboard
                </Link>
                <Link href="/history" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
                  History
                </Link>
                <Link href="/billing" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
                  Extra Tokens
                </Link>
              </>
            )}
            {(user?.role === 'STAFF' || user?.role === 'ADMIN') && (
              <Link href="/staff" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
                Staff Desk
              </Link>
            )}
            {user?.role === 'ADMIN' && (
              <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
                Admin Console
              </Link>
            )}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span
            title={online ? (connected ? 'Live Socket.IO connected' : 'Reconnecting live updates...') : 'Offline'}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              !online ? 'bg-red-50 text-red-700' : connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {!online ? 'Offline' : connected ? 'Live' : 'Syncing'}
          </span>

          <button
            onClick={toggleLiteMode}
            title="Toggle Lite Mode for low-bandwidth networks"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              liteMode ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            {liteMode ? 'Lite On' : 'Lite'}
          </button>

          {user ? (
            <>
              <NotificationBell />
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</p>
                  <p className="text-[11px] text-slate-500">{user.role}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} title="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">Get a Token</Button>
              </Link>
            </div>
          )}
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden space-y-2">
          <Link href="/organizations" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Organizations
          </Link>
          <Link href="/kiosk" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Kiosk Mode
          </Link>
          {user?.role === 'CUSTOMER' && (
            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Customer Dashboard
            </Link>
          )}
          {(user?.role === 'STAFF' || user?.role === 'ADMIN') && (
            <Link href="/staff" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Staff Desk
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link href="/admin" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Admin Console
            </Link>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <button onClick={toggleLiteMode} className="text-xs font-medium text-slate-600">
              {liteMode ? 'Disable Lite Mode' : 'Enable Lite Mode'}
            </button>
            {user ? (
              <Button variant="outline" size="sm" onClick={handleLogout}>Log out</Button>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
