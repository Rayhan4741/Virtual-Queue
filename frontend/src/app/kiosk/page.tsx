'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, RotateCcw, Ticket, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';

interface Org { _id: string; name: string; type: string }
interface Service { _id: string; name: string; codePrefix: string; isAvailable: boolean }

export default function KioskPage() {
  const { toast } = useToast();
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [guestName, setGuestName] = useState('');
  const [issued, setIssued] = useState<{
    token: { tokenNumber: string; trackingCode: string; createdAt: string };
    eta: { estimatedWaitMinutes: number; peopleAhead: number };
  } | null>(null);

  const { data: orgData } = useQuery({
    queryKey: ['kiosk-orgs'],
    queryFn: () => apiFetch<{ organizations: Org[] }>('/organizations', { skipAuth: true }),
  });

  const { data: orgDetails } = useQuery({
    queryKey: ['kiosk-services', selectedOrg?._id],
    queryFn: () => apiFetch<{ services: Service[] }>(`/organizations/${selectedOrg!._id}`, { skipAuth: true }),
    enabled: Boolean(selectedOrg),
  });

  const issueMutation = useMutation({
    mutationFn: (serviceId: string) =>
      apiFetch<{ token: { tokenNumber: string; trackingCode: string; createdAt: string }; eta: { estimatedWaitMinutes: number; peopleAhead: number } }>('/kiosk/tokens', {
        method: 'POST',
        body: JSON.stringify({ organizationId: selectedOrg!._id, serviceId, guestName: guestName.trim() || undefined, source: 'KIOSK' }),
        skipAuth: true,
      }),
    onSuccess: (res) => setIssued(res),
    onError: (err) => toast({ type: 'error', title: 'Kiosk error', message: (err as Error).message }),
  });

  useEffect(() => {
    if (!issued) return;
    const timer = setTimeout(() => { setIssued(null); setSelectedOrg(null); setGuestName(''); }, 30000);
    return () => clearTimeout(timer);
  }, [issued]);

  const reset = () => { setIssued(null); setSelectedOrg(null); setGuestName(''); };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-10 flex flex-col justify-between">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6 no-print">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Self-Service Kiosk</span>
            <h1 className="text-3xl font-extrabold mt-1">Touch to Get a Queue Token</h1>
          </div>
          {selectedOrg && !issued && (
            <Button variant="outline" size="lg" onClick={reset} className="border-slate-700 bg-slate-900 text-white">
              <ArrowLeft className="h-5 w-5" /> Start Over
            </Button>
          )}
        </div>

        {issued ? (
          <div className="rounded-3xl bg-white text-slate-900 p-8 sm:p-12 text-center shadow-2xl space-y-6">
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500">{selectedOrg?.name}</p>
            <h2 className="text-6xl sm:text-7xl font-black tracking-tight text-slate-950">{issued.token.tokenNumber}</h2>
            <div className="flex justify-center">
              <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/track/${issued.token.trackingCode}`} size={160} />
            </div>
            <p className="text-lg font-semibold">
              People Ahead: <span className="text-blue-600">{issued.eta.peopleAhead}</span> • Approx. Wait: <span className="text-emerald-600">~{issued.eta.estimatedWaitMinutes} min</span>
            </p>
            <p className="text-xs font-mono text-slate-500">Tracking Code: {issued.token.trackingCode}</p>
            <div className="flex flex-wrap justify-center gap-4 pt-4 no-print">
              <Button size="lg" variant="outline" onClick={() => window.print()}><Printer className="h-5 w-5" /> Print Token Slip</Button>
              <Button size="lg" onClick={reset}><RotateCcw className="h-5 w-5" /> Done (Next Customer)</Button>
            </div>
          </div>
        ) : !selectedOrg ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {(orgData?.organizations ?? []).map((org) => (
              <button key={org._id} onClick={() => setSelectedOrg(org)} className="rounded-2xl border-2 border-slate-800 bg-slate-900 p-8 text-left hover:border-sky-400 hover:bg-slate-800/80 transition-all">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">{org.type.replace('_', ' ')}</span>
                <h2 className="mt-2 text-2xl font-bold text-white">{org.name}</h2>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Your Name (Optional)</label>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Tap to enter name or leave blank..." className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-lg text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {(orgDetails?.services ?? []).filter((s) => s.isAvailable).map((svc) => (
                <button key={svc._id} disabled={issueMutation.isPending} onClick={() => issueMutation.mutate(svc._id)} className="flex items-center justify-between rounded-2xl border-2 border-slate-700 bg-slate-900 p-8 text-left hover:border-emerald-400 hover:bg-slate-800 transition-all">
                  <div>
                    <span className="font-mono text-sm font-bold text-emerald-400">PREFIX {svc.codePrefix}</span>
                    <h3 className="mt-1 text-2xl font-bold">{svc.name}</h3>
                  </div>
                  <Ticket className="h-8 w-8 text-sky-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
