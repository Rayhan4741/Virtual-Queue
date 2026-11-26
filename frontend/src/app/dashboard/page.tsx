'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, ArrowRight, Star, PlusCircle, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { tokenStatusBadge } from '@/components/ui/Badge';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';

interface TokenItem {
  _id: string;
  tokenNumber: string;
  status: string;
  source: string;
  createdAt: string;
  rating?: number;
  organizationId: { _id: string; name: string };
  serviceId: { _id: string; name: string };
  counterId?: { name: string; counterNumber: number };
}

export default function CustomerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ratingTokenId, setRatingTokenId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-tokens'],
    queryFn: () =>
      apiFetch<{
        tokens: TokenItem[];
        activeToken: TokenItem | null;
        activeEta: { estimatedWaitMinutes: number | null; statusLabel?: string; peopleAhead: number; note: string } | null;
      }>('/tokens/my'),
    enabled: Boolean(user),
    refetchInterval: 15000,
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      apiFetch(`/tokens/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Thank you for your feedback!' });
      setRatingTokenId(null);
      queryClient.invalidateQueries({ queryKey: ['my-tokens'] });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const active = data?.activeToken;
  const eta = data?.activeEta;
  const history = data?.tokens ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.name}</h1>
          <p className="text-sm text-slate-600">Monitor your live queue position and manage your tokens.</p>
        </div>
        <Link href="/organizations">
          <Button><PlusCircle className="h-4 w-4" /> Get a Token</Button>
        </Link>
      </div>

      {active ? (
        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-sky-400">Active Token</p>
                <h2 className="text-3xl font-extrabold mt-1">{active.tokenNumber}</h2>
                <p className="text-sm text-slate-300 mt-0.5">{active.organizationId?.name} — {active.serviceId?.name}</p>
              </div>
              <div className="text-right space-y-1">
                {tokenStatusBadge(active.status)}
                {active.counterId && <p className="text-xs text-emerald-400 font-semibold">Proceed to {active.counterId.name}</p>}
              </div>
            </div>
            {eta && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl bg-slate-900 p-4 border border-slate-800">
                <div>
                  <p className="text-xs text-slate-400">People Ahead</p>
                  <p className="text-xl font-bold text-white">{eta.peopleAhead}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Approx. Wait</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {eta.estimatedWaitMinutes === null ? (eta.statusLabel || 'Unavailable') : `~${eta.estimatedWaitMinutes} min`}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
                  <Link href={`/tokens/${active._id}`}>
                    <Button variant="secondary" size="sm">Live Tracker & QR <ArrowRight className="h-4 w-4" /></Button>
                  </Link>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title="No active token right now"
          description="Browse organizations to book a remote token and skip the physical waiting room."
          action={<Link href="/organizations"><Button>Explore Organizations</Button></Link>}
        />
      )}

      <Card>
        <CardHeader title="Recent Token History" subtitle="Your latest queue requests and completed visits" />
        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No token history yet.</p>
          ) : (
            history.map((t) => (
              <div key={t._id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-slate-900">{t.tokenNumber}</span>
                    {tokenStatusBadge(t.status)}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{t.organizationId?.name} • {t.serviceId?.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5"><Clock className="h-3 w-3" /> {new Date(t.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.status === 'COMPLETED' && !t.rating && (
                    ratingTokenId === t._id ? (
                      [1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => rateMutation.mutate({ id: t._id, rating: star })} className="p-1 text-amber-400 hover:scale-110">
                          <Star className="h-4 w-4 fill-current" />
                        </button>
                      ))
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setRatingTokenId(t._id)}>Rate Service</Button>
                    )
                  )}
                  {t.rating && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5 fill-current" /> {t.rating}/5</span>}
                  <Link href={`/tokens/${t._id}`}><Button variant="ghost" size="sm">Details</Button></Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
