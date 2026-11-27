'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2, VolumeX, Megaphone } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useSocket } from '@/contexts/SocketContext';

interface DisplayToken {
  _id: string;
  tokenNumber: string;
  calledAt?: string;
  recallCount?: number;
  counterId?: { name: string; counterNumber: number };
  serviceId?: { name: string };
}

export default function DisplayBoardPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId;
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [muted, setMuted] = useState(false);
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [now, setNow] = useState(new Date());
  const announcedKeys = useRef<Set<string>>(new Set());

  const t = lang === 'bn' ? {
    subtitle: 'পাবলিক কিউ ডিসপ্লে',
    loading: 'লোড হচ্ছে...',
    muted: 'মিউট',
    voiceOn: 'ভয়েস চালু',
    waiting: 'জন অপেক্ষায়',
    nowServing: 'এখন সার্ভ করা হচ্ছে',
    noServing: 'এই মুহূর্তে কোনো কাউন্টার সার্ভ করছে না।',
    counterUpper: 'কাউন্টার',
    recentlyCalled: 'সদ্য কল করা হয়েছে',
    waitingCall: 'পরবর্তী কলের জন্য অপেক্ষা করা হচ্ছে...',
    proceedTo: 'যেতে হবে',
    counterLabel: 'কাউন্টার',
  } : {
    subtitle: 'Public Queue Display',
    loading: 'Loading...',
    muted: 'Muted',
    voiceOn: 'Voice On',
    waiting: 'waiting in queue',
    nowServing: 'Now Serving',
    noServing: 'No active counters serving right now.',
    counterUpper: 'COUNTER',
    recentlyCalled: 'Recently Called',
    waitingCall: 'Waiting for next call...',
    proceedTo: 'PROCEED TO',
    counterLabel: 'Counter',
  };

  const { data } = useQuery({
    queryKey: ['display-board', organizationId],
    queryFn: () =>
      apiFetch<{
        organization: { name: string; type: string };
        servingTokens: DisplayToken[];
        calledTokens: DisplayToken[];
        announcements: Array<{ _id: string; message: string }>;
        waitingCount: number;
      }>(`/display/${organizationId}`, { skipAuth: true }),
    enabled: Boolean(organizationId),
    refetchInterval: 10000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const speakAnnouncement = (tokenNumber: string, counterNumber?: number) => {
    if (muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const text = counterNumber
      ? `Token ${tokenNumber}, please proceed to Counter ${counterNumber}.`
      : `Token ${tokenNumber}, please proceed to your counter.`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    if (!organizationId) return;
    socket.emit('join:organization', organizationId);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['display-board', organizationId] });
    const onCalled = (payload: { token?: DisplayToken }) => {
      refresh();
      if (payload?.token) {
        const key = `${payload.token._id}:${payload.token.calledAt || Date.now()}:${payload.token.recallCount || 0}`;
        if (!announcedKeys.current.has(key)) {
          announcedKeys.current.add(key);
          speakAnnouncement(payload.token.tokenNumber, payload.token.counterId?.counterNumber);
        }
      }
    };
    socket.on('token:called', onCalled);
    socket.on('token:recalled', onCalled);
    socket.on('token:completed', refresh);
    socket.on('token:updated', refresh);
    socket.on('announcement:created', refresh);
    return () => {
      socket.off('token:called', onCalled);
      socket.off('token:recalled', onCalled);
      socket.off('token:completed', refresh);
      socket.off('token:updated', refresh);
      socket.off('announcement:created', refresh);
    };
  }, [organizationId, socket, queryClient, muted]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 lg:p-10 flex flex-col justify-between">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">{t.subtitle}</span>
            <h1 className="text-3xl lg:text-4xl font-extrabold mt-1">{data?.organization.name || t.loading}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLang((prev) => (prev === 'en' ? 'bn' : 'en'))} className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-sky-300 hover:bg-slate-800">
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>
            <button onClick={() => setMuted(!muted)} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold hover:bg-slate-800">
              {muted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5 text-emerald-400" />}
              {muted ? t.muted : t.voiceOn}
            </button>
            <div className="text-right">
              <p className="text-2xl font-mono font-bold">{now.toLocaleTimeString()}</p>
              <p className="text-xs text-slate-400">{data?.waitingCount ?? 0} {t.waiting}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-emerald-500/30 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-emerald-400 uppercase tracking-wider mb-4">{t.nowServing}</h2>
            <div className="space-y-4">
              {(data?.servingTokens ?? []).length === 0 ? (
                <p className="text-slate-500 py-8 text-center text-lg">{t.noServing}</p>
              ) : (
                data!.servingTokens.map((tok) => (
                  <div key={tok._id} className="flex items-center justify-between rounded-2xl bg-slate-950 border border-slate-800 px-6 py-5">
                    <div>
                      <p className="text-4xl lg:text-5xl font-black text-white">{tok.tokenNumber}</p>
                      <p className="text-xs text-slate-400 mt-1">{tok.serviceId?.name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400">{t.counterUpper}</span>
                      <p className="text-3xl font-extrabold text-emerald-400">{tok.counterId?.counterNumber ?? '—'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-sky-500/30 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-sky-400 uppercase tracking-wider mb-4">{t.recentlyCalled}</h2>
            <div className="space-y-4">
              {(data?.calledTokens ?? []).length === 0 ? (
                <p className="text-slate-500 py-8 text-center text-lg">{t.waitingCall}</p>
              ) : (
                data!.calledTokens.map((tok) => (
                  <div key={tok._id} className="flex items-center justify-between rounded-2xl bg-slate-950 border border-slate-800 px-6 py-5">
                    <div>
                      <p className="text-4xl font-black text-sky-300">{tok.tokenNumber}</p>
                      <p className="text-xs text-slate-400 mt-1">{tok.serviceId?.name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400">{t.proceedTo}</span>
                      <p className="text-2xl font-extrabold text-white">{t.counterLabel} {tok.counterId?.counterNumber ?? '—'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {(data?.announcements ?? []).length > 0 && (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-6 py-4 text-amber-200">
          <Megaphone className="h-6 w-6 shrink-0 text-amber-400" />
          <p className="text-lg font-medium">{data!.announcements[0].message}</p>
        </div>
      )}
    </div>
  );
}
