'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  PhoneCall,
  RotateCcw,
  CheckCircle2,
  SkipForward,
  PauseCircle,
  PlayCircle,
  UserPlus,
  Megaphone,
  ArrowRightLeft,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, tokenStatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

interface StaffQueueResponse {
  counter: {
    _id: string;
    organizationId: string;
    name: string;
    counterNumber: number;
    status: 'ACTIVE' | 'PAUSED' | 'INACTIVE';
    assignedServices: Array<{ _id: string; name: string; codePrefix: string }>;
  } | null;
  currentToken: { _id: string; tokenNumber: string; status: string; source: string; guestName?: string; recallCount: number } | null;
  waitingQueue: Array<{ _id: string; tokenNumber: string; status: string; source: string; priority: number; guestName?: string; createdAt: string }>;
  stats: { servedToday: number; avgDurationSec: number };
}

export default function StaffDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { socket } = useSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [walkInOpen, setWalkInOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [walkInServiceId, setWalkInServiceId] = useState('');
  const [manualFallback, setManualFallback] = useState(false);
  const [announcementMsg, setAnnouncementMsg] = useState('');
  const [confirmSkip, setConfirmSkip] = useState<'SKIPPED' | 'NO_SHOW' | null>(null);
  const [transferTarget, setTransferTarget] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN'))) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['staff-queue'],
    queryFn: () => apiFetch<StaffQueueResponse>('/staff/queue'),
    enabled: Boolean(user && (user.role === 'STAFF' || user.role === 'ADMIN')),
    refetchInterval: 15000,
  });

  const counter = data?.counter;
  const current = data?.currentToken;

  useEffect(() => {
    if (!counter) return;
    socket.emit('join:organization', counter.organizationId);
    socket.emit('join:counter', counter._id);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
    socket.on('queue:updated', refresh);
    socket.on('token:created', refresh);
    socket.on('token:updated', refresh);
    socket.on('token:cancelled', refresh);
    socket.on('counter:updated', refresh);
    return () => {
      socket.off('queue:updated', refresh);
      socket.off('token:created', refresh);
      socket.off('token:updated', refresh);
      socket.off('token:cancelled', refresh);
      socket.off('counter:updated', refresh);
    };
  }, [counter?._id, counter?.organizationId, socket, queryClient]);

  const op = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) =>
      apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-queue'] }),
    onError: (err) => toast({ type: 'error', title: 'Operation failed', message: (err as Error).message }),
  });

  const handleWalkIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!counter) return;
    const svcId = walkInServiceId || counter.assignedServices[0]?._id;
    if (!svcId) return;
    op.mutate(
      { path: '/staff/walk-in', body: { organizationId: counter.organizationId, serviceId: svcId, guestName, manualFallback } },
      {
        onSuccess: () => {
          toast({ type: 'success', title: 'Walk-in token issued' });
          setWalkInOpen(false);
          setGuestName('');
        },
      }
    );
  };

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!counter) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-900">No Counter Assigned</h2>
        <p className="mt-2 text-sm text-slate-600">Ask your Organization Administrator to assign you to an active service counter.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{counter.name}</h1>
            <Badge color={counter.status === 'ACTIVE' ? 'emerald' : 'amber'}>{counter.status}</Badge>
          </div>
          <p className="text-sm text-slate-600 mt-0.5">Services: {counter.assignedServices.map((s) => s.name).join(', ')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setWalkInOpen(true)}><UserPlus className="h-4 w-4" /> Issue Walk-In Token</Button>
          {counter.status === 'ACTIVE' ? (
            <Button variant="outline" onClick={() => op.mutate({ path: '/staff/counter/pause', body: { counterId: counter._id } })}>
              <PauseCircle className="h-4 w-4" /> Pause Counter
            </Button>
          ) : (
            <Button variant="success" onClick={() => op.mutate({ path: '/staff/counter/resume', body: { counterId: counter._id } })}>
              <PlayCircle className="h-4 w-4" /> Resume Counter
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Served Today</p><p className="text-2xl font-bold mt-1">{data?.stats.servedToday ?? 0}</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Avg Service Time</p><p className="text-2xl font-bold mt-1">{Math.round((data?.stats.avgDurationSec ?? 0) / 60)}m</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Waiting Queue</p><p className="text-2xl font-bold mt-1">{data?.waitingQueue.length ?? 0}</p></CardBody></Card>
        <Card><CardBody className="p-4"><p className="text-xs text-slate-500">Counter #</p><p className="text-2xl font-bold mt-1">{counter.counterNumber}</p></CardBody></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Current Token Control" subtitle="Execute state-validated queue operations" />
          <CardBody className="space-y-6">
            {current ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase text-slate-500">{current.source}</span>
                    <h2 className="text-4xl font-black text-slate-900">{current.tokenNumber}</h2>
                    {current.guestName && <p className="text-sm text-slate-600">Guest: {current.guestName}</p>}
                  </div>
                  <div className="text-right space-y-1">
                    {tokenStatusBadge(current.status)}
                    <p className="text-xs text-slate-500">Recalls: {current.recallCount}/2</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {current.status === 'CALLED' && (
                    <>
                      <Button variant="success" onClick={() => op.mutate({ path: '/staff/start', body: { tokenId: current._id, counterId: counter._id } })} loading={op.isPending}>
                        <Play className="h-4 w-4" /> Start Service
                      </Button>
                      <Button variant="outline" disabled={current.recallCount >= 2} onClick={() => op.mutate({ path: '/staff/recall', body: { tokenId: current._id, counterId: counter._id } })}>
                        <RotateCcw className="h-4 w-4" /> Recall ({current.recallCount}/2)
                      </Button>
                      <Button variant="danger" onClick={() => setConfirmSkip('NO_SHOW')}><AlertTriangle className="h-4 w-4" /> Mark No-Show</Button>
                    </>
                  )}
                  {current.status === 'SERVING' && (
                    <>
                      <Button variant="success" onClick={() => op.mutate({ path: '/staff/complete', body: { tokenId: current._id, counterId: counter._id } })} loading={op.isPending}>
                        <CheckCircle2 className="h-4 w-4" /> Complete Service
                      </Button>
                      <Button variant="outline" onClick={() => setConfirmSkip('SKIPPED')}><SkipForward className="h-4 w-4" /> Skip</Button>
                    </>
                  )}
                </div>

                {counter.assignedServices.length > 1 && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                    <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs">
                      <option value="">Transfer to service...</option>
                      {counter.assignedServices.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={!transferTarget} onClick={() => op.mutate({ path: '/staff/transfer', body: { tokenId: current._id, targetServiceId: transferTarget, sourceCounterId: counter._id } })}>
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 space-y-4">
                <p className="text-sm text-slate-600">Counter is ready for the next customer.</p>
                <Button size="lg" disabled={counter.status !== 'ACTIVE' || (data?.waitingQueue.length ?? 0) === 0} loading={op.isPending} onClick={() => op.mutate({ path: '/staff/call-next', body: { counterId: counter._id } })}>
                  <PhoneCall className="h-5 w-5" /> Call Next Customer
                </Button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!announcementMsg.trim()) return;
                op.mutate(
                  { path: '/staff/announcements', body: { organizationId: counter.organizationId, message: announcementMsg } },
                  { onSuccess: () => { toast({ type: 'success', title: 'Announcement broadcast' }); setAnnouncementMsg(''); } }
                );
              }}
              className="flex gap-2 pt-2 border-t border-slate-100"
            >
              <Input placeholder="Broadcast announcement to public display board..." value={announcementMsg} onChange={(e) => setAnnouncementMsg(e.target.value)} />
              <Button type="submit" variant="outline"><Megaphone className="h-4 w-4" /> Announce</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Waiting Queue" subtitle={`${data?.waitingQueue.length ?? 0} customers`} />
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {(data?.waitingQueue ?? []).length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">Queue is empty.</p>
            ) : (
              data!.waitingQueue.map((t, idx) => (
                <div key={t._id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <span className="font-mono text-sm font-bold text-slate-900">{t.tokenNumber}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{t.source} {t.priority > 0 ? `• Priority ${t.priority}` : ''}</p>
                  </div>
                  {tokenStatusBadge(t.status)}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Modal open={walkInOpen} onClose={() => setWalkInOpen(false)} title="Issue Walk-In / Manual Fallback Token">
        <form onSubmit={handleWalkIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
            <select value={walkInServiceId || counter.assignedServices[0]?._id || ''} onChange={(e) => setWalkInServiceId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {counter.assignedServices.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Customer Name (optional)" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={manualFallback} onChange={(e) => setManualFallback(e.target.checked)} />
            Record as Manual Fallback Reconciliation entry
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWalkInOpen(false)}>Cancel</Button>
            <Button type="submit" loading={op.isPending}>Issue Token</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmSkip)}
        onClose={() => setConfirmSkip(null)}
        onConfirm={() => {
          if (!current || !confirmSkip) return;
          op.mutate({ path: '/staff/skip', body: { tokenId: current._id, counterId: counter._id, reason: confirmSkip } }, { onSuccess: () => setConfirmSkip(null) });
        }}
        title={confirmSkip === 'NO_SHOW' ? 'Mark Token as No-Show?' : 'Skip Current Token?'}
        description="This action will release the counter and record an immutable audit log entry."
        confirmLabel={confirmSkip === 'NO_SHOW' ? 'Mark No-Show' : 'Skip Token'}
        loading={op.isPending}
      />
    </div>
  );
}
