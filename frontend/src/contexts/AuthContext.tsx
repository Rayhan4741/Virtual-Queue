'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, setAccessToken, getAccessToken } from '@/lib/api';
import { reconnectSocketWithAuth } from '@/lib/socket';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  organizationId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<AuthUser>;
  register: (data: { name: string; phone: string; email?: string; password: string; role?: 'CUSTOMER' | 'ADMIN' }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: AuthUser }>('/auth/me');
      setUser(data.user);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (phone: string, password: string): Promise<AuthUser> => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      skipAuth: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    reconnectSocketWithAuth();
    return data.user;
  };

  const register = async (payload: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    role?: 'CUSTOMER' | 'ADMIN';
  }): Promise<AuthUser> => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    reconnectSocketWithAuth();
    return data.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
    reconnectSocketWithAuth();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
