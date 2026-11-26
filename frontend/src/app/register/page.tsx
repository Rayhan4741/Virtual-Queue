'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

export default function RegisterPage() {
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'ADMIN'>('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register({ name, phone, email, password, role });
      toast({ type: 'success', title: 'Account created!' });
      router.push(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-600">Book remote tokens or manage your organization&apos;s queues</p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}
              <Input label="Full Name" placeholder="e.g. Arefin Hasan" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Phone Number" placeholder="e.g. 01712345678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <Input label="Email (optional, for alerts)" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Password (min 6 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CUSTOMER', 'ADMIN'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        role === r ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {r === 'CUSTOMER' ? 'Customer' : 'Organization Admin'}
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" loading={loading}>
                Create Account
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-slate-600">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
