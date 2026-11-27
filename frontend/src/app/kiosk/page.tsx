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
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [guestName, setGuestName] = useState('');
  const [issued, setIssued] = useState<{
    token: { tokenNumber: string; trackingCode: string; createdAt: string };
    eta: { estimatedWaitMinutes: number; peopleAhead: number };
  } | null>(null);

  const t = lang === 'bn' ? {
    badge: 'সেলফ-সার্ভিস কিয়স্ক',
    title: 'কিউ টোকেন নিতে স্পর্শ করুন',
    startOver: 'শুরু থেকে',
    peopleAhead: 'সামনে আছেন',
    approxWait: 'সম্ভাব্য অপেক্ষা',
    min: 'মিনিট',
    trackingCode: 'ট্র্যাকিং কোড',
    printSlip: 'টোকেন স্লিপ প্রিন্ট করুন',
    doneNext: 'সম্পন্ন (পরবর্তী গ্রাহক)',
    yourName: 'আপনার নাম (ঐচ্ছিক)',
    namePlaceholder: 'নাম লিখুন অথবা খালি রাখুন...',
    prefix: 'প্রিফিক্স',
  } : {
    badge: 'Self-Service Kiosk',
    title: 'Touch to Get a Queue Token',
    startOver: 'Start Over',
    peopleAhead: 'People Ahead',
    approxWait: 'Approx. Wait',
    min: 'min',
    trackingCode: 'Tracking Code',
    printSlip: 'Print Token Slip',
    doneNext: 'Done (Next Customer)',
    yourName: 'Your Name (Optional)',
    namePlaceholder: 'Tap to enter name or leave blank...',
    prefix: 'PREFIX',
  };

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
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">{t.badge}</span>
            <h1 className="text-3xl font-extrabold mt-1">{t.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'bn' : 'en'))}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-slate-800"
            >
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>
            {selectedOrg && !issued && (
              <Button variant="outline" size="lg" onClick={reset} className="border-slate-700 bg-slate-900 text-white">
                <ArrowLeft className="h-5 w-5" /> {t.startOver}
              </Button>
            )}
          </div>
        </div>

        {issued ? (
          <div className="rounded-3xl bg-white text-slate-900 p-8 sm:p-12 text-center shadow-2xl space-y-6">
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500">{selectedOrg?.name}</p>
            <h2 className="text-6xl sm:text-7xl font-black tracking-tight text-slate-950">{issued.token.tokenNumber}</h2>
            <div className="flex justify-center">
              <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/track/${issued.token.trackingCode}`} size={160} />
            </div>
            <p className="text-lg font-semibold">
              {t.peopleAhead}: <span className="text-blue-600">{issued.eta.peopleAhead}</span> • {t.approxWait}: <span className="text-emerald-600">~{issued.eta.estimatedWaitMinutes} {t.min}</span>
            </p>
            <p className="text-xs font-mono text-slate-500">{t.trackingCode}: {issued.token.trackingCode}</p>
            <div className="flex flex-wrap justify-center gap-4 pt-4 no-print">
              <Button size="lg" variant="outline" onClick={() => window.print()}><Printer className="h-5 w-5" /> {t.printSlip}</Button>
              <Button size="lg" onClick={reset}><RotateCcw className="h-5 w-5" /> {t.doneNext}</Button>
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
              <label className="block text-sm font-medium text-slate-300 mb-2">{t.yourName}</label>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t.namePlaceholder} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-lg text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {(orgDetails?.services ?? []).filter((s) => s.isAvailable).map((svc) => (
                <button key={svc._id} disabled={issueMutation.isPending} onClick={() => issueMutation.mutate(svc._id)} className="flex items-center justify-between rounded-2xl border-2 border-slate-700 bg-slate-900 p-8 text-left hover:border-emerald-400 hover:bg-slate-800 transition-all">
                  <div>
                    <span className="font-mono text-sm font-bold text-emerald-400">{t.prefix} {svc.codePrefix}</span>
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
