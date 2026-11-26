'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QrCode, Clock, Navigation, PauseCircle, RotateCcw, XCircle, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { tokenStatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { QRScannerModal } from '@/components/QRScannerModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Map3D } from '@/components/Map3D';

export default function ActiveTokenPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { socket } = useSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [qrOpen, setQrOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmLatePass, setConfirmLatePass] = useState(false);
  const [leaveAlert, setLeaveAlert] = useState<{
    travel: { durationMinutes: number; distanceKm: number; note: string };
    leaveInMinutes: number;
    shouldLeaveNow: boolean;
  } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['token', id],
    queryFn: () =>
      apiFetch<{
        token: {
          _id: string;
          tokenNumber: string;
          status: string;
          trackingCode: string;
          latePassUsed: boolean;
          snoozeCount: number;
          updatedAt: string;
          organizationId: { _id: string; name: string; location: { address: string; city: string; lat?: number; lng?: number } };
          serviceId: { _id: string; name: string; maxSnoozes: number; snoozeDelayMinutes: number };
          counterId?: { name: string; counterNumber: number };
        };
        eta: { estimatedWaitMinutes: number | null; statusLabel?: string; peopleAhead: number; activeCounters: number; note: string };
        currentServingToken: string | null;
      }>(`/tokens/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!data?.token) return;
    const joinRooms = () => {
      socket.emit('join:organization', data.token.organizationId._id);
      socket.emit('join:service', data.token.serviceId._id);
    };
    joinRooms();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['token', id] });
    const onReconnect = () => {
      joinRooms();
      refresh();
    };
    socket.on('connect', onReconnect);
    socket.on('token:updated', refresh);
    socket.on('token:called', refresh);
    socket.on('token:recalled', refresh);
    socket.on('token:completed', refresh);
    socket.on('queue:updated', refresh);
    return () => {
      socket.off('connect', onReconnect);
      socket.off('token:updated', refresh);
      socket.off('token:called', refresh);
      socket.off('token:recalled', refresh);
      socket.off('token:completed', refresh);
      socket.off('queue:updated', refresh);
    };
  }, [data?.token, socket, queryClient, id]);

  const checkInMutation = useMutation({
    mutationFn: (qrPayload: string) => apiFetch(`/tokens/${id}/check-in`, { method: 'POST', body: JSON.stringify({ qrPayload }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Checked in successfully!' });
      setQrOpen(false);
      queryClient.invalidateQueries({ queryKey: ['token', id] });
    },
    onError: (err) => toast({ type: 'error', title: 'Check-in failed', message: (err as Error).message }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/tokens/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast({ type: 'info', title: 'Token cancelled' });
      setConfirmCancel(false);
      queryClient.invalidateQueries({ queryKey: ['token', id] });
    },
    onError: (err) => toast({ type: 'error', title: 'Cannot cancel', message: (err as Error).message }),
  });

  const snoozeMutation = useMutation({
    mutationFn: () => apiFetch(`/tokens/${id}/snooze`, { method: 'POST' }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Turn snoozed' });
      queryClient.invalidateQueries({ queryKey: ['token', id] });
    },
    onError: (err) => toast({ type: 'error', title: 'Snooze unavailable', message: (err as Error).message }),
  });

  const latePassMutation = useMutation({
    mutationFn: () => apiFetch(`/tokens/${id}/late-pass`, { method: 'POST' }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Late Pass applied!', message: 'You rejoined the queue 5 places back.' });
      setConfirmLatePass(false);
      queryClient.invalidateQueries({ queryKey: ['token', id] });
    },
    onError: (err) => toast({ type: 'error', title: 'Late Pass failed', message: (err as Error).message }),
  });

  const checkLeaveAlert = () => {
    if (!navigator.geolocation) {
      toast({ type: 'warning', title: 'Location unavailable' });
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setUserCoords([pos.coords.longitude, pos.coords.latitude]);
        try {
          const res = await apiFetch<{
            travel: { durationMinutes: number; distanceKm: number; note: string };
            leaveInMinutes: number;
            shouldLeaveNow: boolean;
          }>(`/tokens/${id}/leave-alert`, {
            method: 'POST',
            body: JSON.stringify({ originLat: pos.coords.latitude, originLng: pos.coords.longitude }),
          });
          setLeaveAlert(res);
        } catch (err) {
          toast({ type: 'error', title: 'Leave alert failed', message: (err as Error).message });
        } finally {
          setLocLoading(false);
        }
      },
      () => {
        setLocLoading(false);
        toast({ type: 'warning', title: 'Location permission denied' });
      }
    );
  };

  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-64 rounded-xl" /></div>;
  if (!data?.token) return <div className="p-8 text-center">Token not found.</div>;
  const { token, eta, currentServingToken } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      <Card className="overflow-hidden">
        <div className="bg-slate-950 px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">{token.organizationId.name}</p>
              <h1 className="text-4xl font-extrabold tracking-tight mt-1">{token.tokenNumber}</h1>
              <p className="text-sm text-sky-300 mt-1">{token.serviceId.name}</p>
            </div>
            <div className="text-right space-y-2">
              {tokenStatusBadge(token.status)}
              {token.counterId && <p className="text-sm font-bold text-emerald-400">Counter {token.counterId.counterNumber}</p>}
            </div>
          </div>
        </div>

        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Queue Position</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">#{eta.peopleAhead + 1}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">People Ahead</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{eta.peopleAhead}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Approx. Wait</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {eta.estimatedWaitMinutes === null ? (eta.statusLabel || 'Unavailable') : `~${eta.estimatedWaitMinutes}m`}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Now Serving</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{currentServingToken || '—'}</p>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-4 w-4 shrink-0" /> {eta.note} • Last updated {new Date(token.updatedAt).toLocaleTimeString()}
          </p>

          {token.status === 'CALLED' && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900 font-medium">
              Your token has been called! Please proceed to {token.counterId?.name || 'your assigned counter'} immediately.
            </div>
          )}

          {leaveAlert && (
            <div className={`rounded-xl border p-4 text-xs space-y-1 ${leaveAlert.shouldLeaveNow ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
              <p className="font-bold text-sm">{leaveAlert.shouldLeaveNow ? 'Leave now to arrive on time!' : `Recommended departure in ~${leaveAlert.leaveInMinutes} minutes`}</p>
              <p>Estimated travel: ~{leaveAlert.travel.durationMinutes} min ({leaveAlert.travel.distanceKm} km)</p>
              <p className="text-[11px] opacity-80">{leaveAlert.travel.note}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {token.status === 'WAITING' && (
              <Button variant="secondary" onClick={() => setQrOpen(true)}><QrCode className="h-4 w-4" /> Scan Entrance QR Check-In</Button>
            )}
            {['WAITING', 'CHECKED_IN'].includes(token.status) && (
              <>
                <Button variant="outline" onClick={checkLeaveAlert} loading={locLoading}><Navigation className="h-4 w-4" /> When Should I Leave?</Button>
                <Button variant="outline" onClick={() => snoozeMutation.mutate()} loading={snoozeMutation.isPending} disabled={token.snoozeCount >= (token.serviceId.maxSnoozes ?? 2)}>
                  <PauseCircle className="h-4 w-4" /> Snooze ({token.snoozeCount}/{token.serviceId.maxSnoozes ?? 2})
                </Button>
                <Button variant="danger" onClick={() => setConfirmCancel(true)}><XCircle className="h-4 w-4" /> Cancel Token</Button>
              </>
            )}
            {token.status === 'NO_SHOW' && !token.latePassUsed && (
              <Button variant="primary" onClick={() => setConfirmLatePass(true)}><RotateCcw className="h-4 w-4" /> Use Late Pass (Rejoin 5 Places Back)</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <QRScannerModal open={qrOpen} onClose={() => setQrOpen(false)} onSubmitPayload={(payload) => checkInMutation.mutate(payload)} loading={checkInMutation.isPending} />
      {token.organizationId.location?.lat && token.organizationId.location?.lng && (
        <Map3D
          height="320px"
          markers={[
            {
              id: token.organizationId._id,
              name: token.organizationId.name,
              subtitle: `${token.organizationId.location.address}, ${token.organizationId.location.city}`,
              lat: token.organizationId.location.lat,
              lng: token.organizationId.location.lng,
            },
          ]}
          route={
            userCoords
              ? { from: userCoords, to: [token.organizationId.location.lng, token.organizationId.location.lat] }
              : null
          }
        />
      )}
      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={() => cancelMutation.mutate()} title="Cancel Token?" description="Cancelling removes you from the queue permanently." confirmLabel="Yes, Cancel Token" loading={cancelMutation.isPending} />
      <ConfirmDialog open={confirmLatePass} onClose={() => setConfirmLatePass(false)} onConfirm={() => latePassMutation.mutate()} title="Use Your One-Time Late Pass?" description="This will recover your NO_SHOW token as CHECKED_IN and place you 5 places back." confirmLabel="Apply Late Pass" variant="primary" loading={latePassMutation.isPending} />
    </div>
  );
}
