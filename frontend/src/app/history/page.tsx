'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Star, Clock, ArrowLeft, Ticket } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { tokenStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';

interface TokenItem {
  _id: string;
  tokenNumber: string;
  status: string;
  source: string;
  createdAt: string;
  completedAt?: string;
  rating?: number;
  organizationId: { _id: string; name: string };
  serviceId: { _id: string; name: string };
}

const FILTERS = ['ALL', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'] as const;

export default function TokenHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [ratingTokenId, setRatingTokenId] = useState<string | null>(null);
  const [selectedStars, setSelectedStars] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-tokens'],
    queryFn: () => apiFetch<{ tokens: TokenItem[] }>('/tokens/my'),
    enabled: Boolean(user),
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rating, comment }: { id: string; rating: number; comment?: string }) =>
      apiFetch(`/tokens/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Thank you for your feedback!' });
      setRatingTokenId(null);
      setFeedbackComment('');
      queryClient.invalidateQueries({ queryKey: ['my-tokens'] });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const allTokens = data?.tokens ?? [];
  const filtered = allTokens.filter((t) => {
    const matchesStatus = filter === 'ALL' || t.status === filter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.tokenNumber.toLowerCase().includes(q) ||
      t.organizationId?.name?.toLowerCase().includes(q) ||
      t.serviceId?.name?.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const completedCount = allTokens.filter((t) => t.status === 'COMPLETED').length;
  const cancelledCount = allTokens.filter((t) => t.status === 'CANCELLED').length;
  const noShowCount = allTokens.filter((t) => t.status === 'NO_SHOW').length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Token History & Ratings</h1>
          <p className="text-sm text-slate-600">Search past visits, check outcomes, and rate completed services.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Total Tokens</p><p className="text-2xl font-bold mt-1">{allTokens.length}</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Completed</p><p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Cancelled</p><p className="text-2xl font-bold text-slate-700 mt-1">{cancelledCount}</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">No-Show</p><p className="text-2xl font-bold text-red-600 mt-1">{noShowCount}</p></CardBody></Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search token number, organization, or service..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title={`Showing ${filtered.length} token(s)`} />
        {filtered.length === 0 ? (
          <CardBody>
            <EmptyState icon={<Ticket className="h-6 w-6" />} title="No matching tokens" description="Try clearing your search or status filter." />
          </CardBody>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <div key={t._id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-slate-900">{t.tokenNumber}</span>
                    {tokenStatusBadge(t.status)}
                    <span className="text-[11px] font-medium text-slate-400">{t.source}</span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1">{t.organizationId?.name} • {t.serviceId?.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                    <Clock className="h-3 w-3" /> {new Date(t.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.status === 'COMPLETED' && !t.rating && (
                    <Button variant="outline" size="sm" onClick={() => { setRatingTokenId(t._id); setSelectedStars(5); }}>
                      Rate / Feedback
                    </Button>
                  )}
                  {t.rating && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-current" /> {t.rating}/5
                    </span>
                  )}
                  <Link href={`/tokens/${t._id}`}><Button variant="ghost" size="sm">Details</Button></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={Boolean(ratingTokenId)} onClose={() => setRatingTokenId(null)} title="Service Feedback & Complaint">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ratingTokenId) return;
            rateMutation.mutate({ id: ratingTokenId, rating: selectedStars, comment: feedbackComment.trim() || undefined });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Rating</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedStars(star)}
                  className={`p-1.5 rounded-lg border ${selectedStars >= star ? 'text-amber-500 border-amber-300 bg-amber-50' : 'text-slate-300 border-slate-200'}`}
                >
                  <Star className="h-5 w-5 fill-current" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comments or Complaint (Optional)</label>
            <textarea
              rows={3}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Share your experience or report any service issue..."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRatingTokenId(null)}>Cancel</Button>
            <Button type="submit" loading={rateMutation.isPending}>Submit Feedback</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
