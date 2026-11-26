'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, CheckCircle2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

function BillingContent() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedOrgId, setSelectedOrgId] = useState(searchParams.get('orgId') || '');
  const statusParam = searchParams.get('status');
  const sessionIdParam = searchParams.get('sessionId');
  const providerParam = searchParams.get('provider');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const { data: orgsData } = useQuery({
    queryKey: ['billing-orgs'],
    queryFn: () => apiFetch<{ organizations: Array<{ _id: string; name: string }> }>('/organizations', { skipAuth: true }),
  });

  useEffect(() => {
    if (!selectedOrgId && orgsData?.organizations?.[0]?._id) {
      setSelectedOrgId(orgsData.organizations[0]._id);
    }
  }, [selectedOrgId, orgsData]);

  const { data: quotaData } = useQuery({
    queryKey: ['billing-quota', selectedOrgId],
    queryFn: () =>
      apiFetch<{
        month: string;
        baseQuota: number;
        paidExtraQuota: number;
        effectiveLimit: number;
        remoteUsed: number;
        remaining: number;
        providers: Array<{ id: string; name: string; configured: boolean; amount: number; currency: string; tokensUnlocked: number }>;
      }>(`/billing/quota?organizationId=${selectedOrgId}`),
    enabled: Boolean(user && selectedOrgId),
  });

  const { data: historyData } = useQuery({
    queryKey: ['billing-history'],
    queryFn: () =>
      apiFetch<{
        transactions: Array<{
          _id: string;
          provider: string;
          amount: number;
          currency: string;
          tokensUnlocked: number;
          status: string;
          createdAt: string;
          organizationId?: { name: string };
        }>;
      }>('/billing/quota'),
    enabled: Boolean(user),
  });

  const verifyMutation = useMutation({
    mutationFn: (sessionId: string) => apiFetch<{ message: string }>('/billing/verify', { method: 'POST', body: JSON.stringify({ sessionId }) }),
    onSuccess: (res) => {
      toast({ type: 'success', title: 'Tokens Unlocked!', message: res.message });
      queryClient.invalidateQueries({ queryKey: ['billing-quota'] });
      queryClient.invalidateQueries({ queryKey: ['billing-history'] });
      router.replace('/billing');
    },
    onError: (err) => toast({ type: 'error', title: 'Verification failed', message: (err as Error).message }),
  });

  const checkoutMutation = useMutation({
    mutationFn: (provider: 'STRIPE' | 'SSLCOMMERZ' | 'BKASH') =>
      apiFetch<{ checkoutUrl: string; mode: string; sessionId: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ organizationId: selectedOrgId, provider }),
      }),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (err) => toast({ type: 'error', title: 'Checkout failed', message: (err as Error).message }),
  });

  useEffect(() => {
    if (statusParam === 'success' && sessionIdParam && !verifyMutation.isPending) {
      verifyMutation.mutate(sessionIdParam);
    }
  }, [statusParam, sessionIdParam]);

  if (authLoading) return <div className="p-12 text-center text-sm text-slate-500">Loading billing...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to Organizations
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Extra Remote Token Pass</h1>
        <p className="text-sm text-slate-600">
          Your first 3 remote tokens per month are free. Need more? Unlock +5 extra tokens using Stripe, SSLCommerz, or bKash.
        </p>
      </div>

      {statusParam === 'sandbox_confirm' && sessionIdParam && (
        <Card className="border-amber-300 bg-amber-50">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-900">Sandbox Payment Simulation ({providerParam})</p>
              <p className="text-xs text-amber-800">
                Merchant keys are not configured in `.env`, so this runs in local sandbox simulation mode. Session: <code>{sessionIdParam}</code>
              </p>
            </div>
            <Button variant="success" loading={verifyMutation.isPending} onClick={() => verifyMutation.mutate(sessionIdParam)}>
              <CheckCircle2 className="h-4 w-4" /> Confirm Sandbox Payment (+5 Tokens)
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Monthly Quota Status" subtitle="Select organization to check or upgrade quota" />
        <CardBody className="space-y-4">
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
          >
            {(orgsData?.organizations ?? []).map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </select>

          {quotaData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Free Quota</p>
                <p className="text-xl font-bold">{quotaData.baseQuota}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Paid Extra</p>
                <p className="text-xl font-bold text-blue-600">+{quotaData.paidExtraQuota}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Used ({quotaData.month})</p>
                <p className="text-xl font-bold">{quotaData.remoteUsed}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Remaining</p>
                <p className="text-xl font-bold text-emerald-600">{quotaData.remaining}</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            {(quotaData?.providers ?? []).map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <CreditCard className="h-5 w-5 text-slate-700" />
                    <Badge color={p.configured ? 'emerald' : 'amber'}>{p.configured ? 'Live' : 'Sandbox'}</Badge>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-900">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {p.currency} {p.amount} for +{p.tokensUnlocked} tokens
                  </p>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  loading={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(p.id as 'STRIPE' | 'SSLCOMMERZ' | 'BKASH')}
                >
                  Pay with {p.id}
                </Button>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Payments are verified server-side and idempotently recorded.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payment History" />
        <div className="divide-y divide-slate-100">
          {(historyData?.transactions ?? []).length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">No payments yet.</p>
          ) : (
            historyData!.transactions.map((tx) => (
              <div key={tx._id} className="flex items-center justify-between px-6 py-3.5 text-xs">
                <div>
                  <p className="font-bold text-slate-900">
                    {tx.provider} — +{tx.tokensUnlocked} Tokens ({tx.organizationId?.name || 'Organization'})
                  </p>
                  <p className="text-slate-500">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {tx.currency} {tx.amount}
                  </p>
                  <Badge color={tx.status === 'COMPLETED' ? 'emerald' : 'amber'}>{tx.status}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-slate-500">Loading...</div>}>
      <BillingContent />
    </Suspense>
  );
}
