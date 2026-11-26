'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      toast({ type: 'success', title: 'Password updated! Please log in.' });
      router.push('/login');
    } catch (err) {
      setError((err as Error).message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <Input label="Reset Token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <Input label="New Password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" className="w-full" loading={loading}>Update Password</Button>
        </form>
      </CardBody>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center text-slate-900">Set New Password</h1>
        <Suspense fallback={<div className="text-center text-sm">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
