'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; devResetToken?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ phone }),
        skipAuth: true,
      });
      setMessage(res.message);
      if (res.devResetToken) setDevToken(res.devResetToken);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center text-slate-900">Reset Password</h1>
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Registered Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <Button type="submit" className="w-full" loading={loading}>Request Reset Code</Button>
            </form>
            {message && <p className="mt-4 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-lg">{message}</p>}
            {devToken && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 p-3 rounded-lg">
                Dev Reset Token: <code className="font-mono break-all">{devToken}</code>{' '}
                <Link href={`/reset-password?token=${devToken}`} className="font-semibold text-blue-600 underline ml-1">Reset now</Link>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
