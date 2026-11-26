'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock,
  QrCode,
  Bell,
  ShieldCheck,
  BarChart3,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  Building2,
  Users,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const FAQS = [
  {
    q: 'How does remote token booking work?',
    a: 'Select an organization and service, confirm your token request, and receive a unique server-generated token number with live queue position and approximate waiting time.',
  },
  {
    q: 'What happens if I miss my turn?',
    a: 'After two recalls and a 3-minute grace period, a token is marked No-Show. Eligible customers can use one Late Pass to rejoin the queue 5 places back.',
  },
  {
    q: 'Do walk-in customers without smartphones get fair access?',
    a: 'Yes. Kiosk and guest mode issue tokens into the exact same shared queue with identical fairness and priority-aging rules.',
  },
  {
    q: 'How do you prevent people from holding the front of the line forever?',
    a: 'Our queue engine applies anti-starvation priority aging and limits snoozes and Late Passes server-side.',
  },
];

export default function LandingPage() {
  const [demoAhead, setDemoAhead] = useState(4);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const id = setInterval(() => {
      setDemoAhead((prev) => (prev <= 1 ? 5 : prev - 1));
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-sky-300">
                Real-Time Queue & Token Platform
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Wait from anywhere. Arrive right on time.
              </h1>
              <p className="mt-5 text-lg text-slate-300 leading-relaxed max-w-xl">
                Virtual Queue replaces crowded waiting rooms at banks, hospitals, and public offices with live digital
                tokens, accurate EMA wait estimates, QR check-in, and smart travel-time leave alerts.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/register">
                  <Button variant="secondary" size="lg">
                    Get a Token <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/organizations">
                  <Button variant="outline" size="lg" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800">
                    Explore Organizations
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                    Interactive Demo Preview
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">Metro National Bank — Teller</h3>
                </div>
                <Badge color="emerald">Live Simulation</Badge>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800">
                  <p className="text-xs text-slate-400">Your Token</p>
                  <p className="mt-1 text-2xl font-extrabold text-sky-400">A-108</p>
                </div>
                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800">
                  <p className="text-xs text-slate-400">People Ahead</p>
                  <p className="mt-1 text-2xl font-extrabold text-white">{demoAhead}</p>
                </div>
                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800">
                  <p className="text-xs text-slate-400">Approx. Wait</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-400">~{demoAhead * 4}m</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-3 text-xs text-slate-300">
                <span>Now Serving: <strong className="text-white">A-{108 - demoAhead}</strong></span>
                <span>Counter 2 • Checked In</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">How Virtual Queue Works</h2>
          <p className="mt-3 text-slate-600">Three simple steps from booking to service completion.</p>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Book Remotely or at Kiosk',
              desc: 'Choose an organization and service to receive an atomic, conflict-free token number.',
              icon: <Smartphone className="h-6 w-6 text-blue-600" />,
            },
            {
              step: '02',
              title: 'Track Live & Leave on Time',
              desc: 'Monitor real-time queue position via Socket.IO and get travel-time leave alerts.',
              icon: <Clock className="h-6 w-6 text-emerald-600" />,
            },
            {
              step: '03',
              title: 'Scan QR & Get Served',
              desc: 'Check in at the entrance with a signed QR code and proceed when your counter calls.',
              icon: <QrCode className="h-6 w-6 text-slate-900" />,
            },
          ].map((item) => (
            <div key={item.step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-slate-100 p-3">{item.icon}</div>
                <span className="text-xs font-bold text-slate-400">STEP {item.step}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-slate-200 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-6 w-6 text-blue-600" /> Benefits for Customers
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  'Real-time queue position & approximate EMA waiting time',
                  'Travel-time-aware leave alerts before your turn',
                  'Fair Snooze & one-time Late Pass (5 places back) recovery',
                  'Installable PWA with Lite Mode for low-bandwidth networks',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-slate-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-6 w-6 text-slate-900" /> Benefits for Organizations
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  'Fast Staff Desk: Call Next, Recall, Start, Complete, Skip & Transfer',
                  'Public TV Display Board with Web Speech voice announcements',
                  'Recharts analytics: peak hours, counter utilization & no-show rates',
                  'Append-only audit logs and anti-starvation priority aging',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-slate-700">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Bell className="h-5 w-5" />, title: 'Multi-Channel Alerts', desc: 'In-app, Web Push & Email notifications' },
              { icon: <QrCode className="h-5 w-5" />, title: 'Signed QR Check-In', desc: 'HMAC-verified expiring entrance QR codes' },
              { icon: <BarChart3 className="h-5 w-5" />, title: 'Operational Analytics', desc: 'Real-time throughput & wait-time trends' },
              { icon: <ShieldCheck className="h-5 w-5" />, title: 'Enterprise Security', desc: 'RBAC, JWT rotation & append-only audits' },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-slate-900">{f.icon}</div>
                <h4 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h4>
                <p className="mt-1 text-xs text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 className="text-2xl font-bold text-center text-slate-900">Frequently Asked Questions</h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-slate-900"
              >
                <span>{item.q}</span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === idx && <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-slate-900">Virtual Queue — Real-Time Queue Management</p>
          <div className="flex flex-wrap gap-6 text-xs text-slate-500">
            <Link href="/organizations" className="hover:text-slate-900">Organizations</Link>
            <Link href="/kiosk" className="hover:text-slate-900">Kiosk Mode</Link>
            <Link href="/login" className="hover:text-slate-900">Staff & Admin Login</Link>
          </div>
          <p className="text-xs text-slate-400">support@virtualqueue.app</p>
        </div>
      </footer>
    </div>
  );
}
