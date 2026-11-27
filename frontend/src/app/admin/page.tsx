'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { Building2, Users, Activity, ShieldAlert, QrCode, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, tokenStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

type AdminTab = 'overview' | 'analytics' | 'services' | 'counters' | 'staff' | 'branches' | 'audit' | 'status';

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [orgModal, setOrgModal] = useState(false);
  const [svcModal, setSvcModal] = useState(false);
  const [counterModal, setCounterModal] = useState(false);
  const [staffModal, setStaffModal] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ qrDataUrl: string; qrPayload: string } | null>(null);

  const [orgForm, setOrgForm] = useState({ name: '', type: 'BANK', address: '', city: '' });
  const [svcForm, setSvcForm] = useState({ name: '', codePrefix: 'B', avgServiceTimeSec: 300, monthlyQuota: 10 });
  const [counterForm, setCounterForm] = useState({ name: '', counterNumber: 2, serviceId: '', staffId: '' });
  const [staffForm, setStaffForm] = useState({ name: '', phone: '', password: '' });
  const [branchForm, setBranchForm] = useState({ name: '', code: '', address: '', city: '', timezone: 'Asia/Dhaka' });

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const { data: orgsData } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => apiFetch<{ organizations: Array<{ _id: string; name: string; type: string }> }>('/admin/my-organizations'),
    enabled: Boolean(user && user.role === 'ADMIN'),
  });

  const activeOrg = orgsData?.organizations?.[0];

  const { data: dashData } = useQuery({
    queryKey: ['admin-dashboard', activeOrg?._id],
    queryFn: () =>
      apiFetch<{
        summary: {
          totalTokensToday: number;
          waiting: number;
          serving: number;
          completed: number;
          cancelled: number;
          noShow: number;
          activeCounters: number;
          avgWaitMinutes: number;
          avgServiceMinutes: number;
        } | null;
        activeQueue?: Array<{
          _id: string;
          tokenNumber: string;
          status: string;
          source: string;
          serviceId?: { name: string };
          counterId?: { _id: string; name: string; counterNumber: number };
        }>;
      }>(`/admin/dashboard?organizationId=${activeOrg?._id || ''}`),
    enabled: Boolean(activeOrg),
    refetchInterval: 10000,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['admin-analytics', activeOrg?._id],
    queryFn: () =>
      apiFetch<{
        analytics: {
          tokensPerDay: Array<{ date: string; total: number; completed: number; cancelled: number; noShow: number }>;
          peakHours: Array<{ hour: string; served: number; avgWaitMin: number }>;
          servicePopularity?: Array<{ name: string; count: number }>;
          counterUtilization?: Array<{ counterName: string; served: number; avgDurationMin: number }>;
        };
      }>(`/admin/analytics?organizationId=${activeOrg?._id}`),
    enabled: Boolean(activeOrg) && tab === 'analytics',
  });

  const { data: healthData, refetch: refetchHealth, isFetching: healthLoading } = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: () =>
      apiFetch<{
        status: string;
        instanceId: string;
        uptimeSec: number;
        database: { connected: boolean; readyState: number; activeTier?: string };
        redis: { connected: boolean; mode: string };
        metrics: {
          totalRequests: number;
          errorRatePercent: number;
          avgResponseTimeMs: number;
          failedTokenRequests: number;
          paymentFailures: number;
          cronFailures: number;
          socketConnections: number;
          memoryMb: { rss: number; heapUsed: number };
        };
        timestamp: string;
      }>('/admin/system-status'),
    enabled: tab === 'status',
    refetchInterval: 10000,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['admin-services', activeOrg?._id],
    queryFn: () =>
      apiFetch<{ services: Array<{ _id: string; name: string; codePrefix: string; avgServiceTimeSec: number; isAvailable: boolean; monthlyQuota: number }> }>(
        `/services?organizationId=${activeOrg?._id}`
      ),
    enabled: Boolean(activeOrg),
  });

  const { data: countersData } = useQuery({
    queryKey: ['admin-counters', activeOrg?._id],
    queryFn: () =>
      apiFetch<{
        counters: Array<{
          _id: string;
          name: string;
          counterNumber: number;
          status: string;
          assignedStaff?: { name: string };
          assignedServices: Array<{ name: string }>;
        }>;
      }>(`/admin/counters?organizationId=${activeOrg?._id}`),
    enabled: Boolean(activeOrg),
  });

  const { data: staffData } = useQuery({
    queryKey: ['admin-staff', activeOrg?._id],
    queryFn: () => apiFetch<{ staff: Array<{ _id: string; name: string; phone: string; status: string }> }>(`/admin/staff?organizationId=${activeOrg?._id}`),
    enabled: Boolean(activeOrg),
  });

  const { data: auditData } = useQuery({
    queryKey: ['admin-audit', activeOrg?._id],
    queryFn: () =>
      apiFetch<{
        logs: Array<{
          _id: string;
          action: string;
          actorRole: string;
          previousState?: string;
          newState?: string;
          createdAt: string;
          actorId?: { name: string };
          tokenId?: { tokenNumber: string };
        }>;
      }>(`/admin/audit-logs?organizationId=${activeOrg?._id}`),
    enabled: Boolean(activeOrg) && tab === 'audit',
  });

  const { data: branchesData } = useQuery({
    queryKey: ['admin-branches', activeOrg?._id],
    queryFn: () =>
      apiFetch<{ branches: Array<{ _id: string; name: string; code: string; timezone: string; location: { address: string; city: string }; status: string }> }>(
        `/admin/branches?organizationId=${activeOrg?._id}`
      ),
    enabled: Boolean(activeOrg) && tab === 'branches',
  });

  const { data: planData } = useQuery({
    queryKey: ['admin-plan', activeOrg?._id],
    queryFn: () =>
      apiFetch<{
        plan: 'FREE' | 'PRO' | 'ENTERPRISE';
        limits: { maxBranches: number; maxCounters: number; priceUsdMonth: number };
        plans: Record<string, { maxBranches: number; maxCounters: number; priceUsdMonth: number }>;
      }>(`/admin/plan?organizationId=${activeOrg?._id}`),
    enabled: Boolean(activeOrg) && tab === 'branches',
  });

  const createBranch = useMutation({
    mutationFn: () => apiFetch('/admin/branches', { method: 'POST', body: JSON.stringify({ ...branchForm, organizationId: activeOrg!._id }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Branch created' });
      setBranchModal(false);
      setBranchForm({ name: '', code: '', address: '', city: '', timezone: 'Asia/Dhaka' });
      queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Branch limit or error', message: (err as Error).message }),
  });

  const updatePlan = useMutation({
    mutationFn: (plan: 'FREE' | 'PRO' | 'ENTERPRISE') =>
      apiFetch('/admin/plan', { method: 'POST', body: JSON.stringify({ organizationId: activeOrg!._id, plan }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'B2B Subscription plan updated' });
      queryClient.invalidateQueries({ queryKey: ['admin-plan'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Error', message: (err as Error).message }),
  });

  const createOrg = useMutation({
    mutationFn: () =>
      apiFetch('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: orgForm.name, type: orgForm.type, location: { address: orgForm.address, city: orgForm.city } }),
      }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Organization created' });
      setOrgModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Error', message: (err as Error).message }),
  });

  const createService = useMutation({
    mutationFn: () => apiFetch('/services', { method: 'POST', body: JSON.stringify({ ...svcForm, organizationId: activeOrg!._id }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Service created' });
      setSvcModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Error', message: (err as Error).message }),
  });

  const createCounter = useMutation({
    mutationFn: () =>
      apiFetch('/admin/counters', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrg!._id,
          name: counterForm.name,
          counterNumber: Number(counterForm.counterNumber),
          assignedServices: counterForm.serviceId ? [counterForm.serviceId] : [],
          assignedStaff: counterForm.staffId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Counter created' });
      setCounterModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-counters'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Error', message: (err as Error).message }),
  });

  const createStaff = useMutation({
    mutationFn: () => apiFetch('/admin/staff', { method: 'POST', body: JSON.stringify({ ...staffForm, organizationId: activeOrg!._id }) }),
    onSuccess: () => {
      toast({ type: 'success', title: 'Staff account created' });
      setStaffModal(false);
      setStaffForm({ name: '', phone: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) => toast({ type: 'error', title: 'Error', message: (err as Error).message }),
  });

  const loadEntranceQr = async () => {
    if (!activeOrg) return;
    const res = await apiFetch<{ qrDataUrl: string; qrPayload: string }>(`/organizations/${activeOrg._id}/entrance-qr`);
    setQrPreview(res);
  };

  if (authLoading) return <div className="p-12 text-center text-sm text-slate-500">Loading console...</div>;
  const summary = dashData?.summary;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organization Admin Console</h1>
          <p className="text-sm text-slate-600">{activeOrg ? activeOrg.name : 'Create your first organization to get started.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeOrg && <Button variant="outline" onClick={loadEntranceQr}><QrCode className="h-4 w-4" /> Entrance QR Code</Button>}
          <Button onClick={() => setOrgModal(true)}><Plus className="h-4 w-4" /> New Organization</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {([['overview', 'Overview'], ['analytics', 'Analytics'], ['services', 'Services'], ['counters', 'Counters'], ['staff', 'Staff'], ['branches', 'Branches & Plan'], ['audit', 'Audit Logs'], ['status', 'System Status']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && summary && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total Tokens Today', value: summary.totalTokensToday, icon: <Building2 className="h-5 w-5 text-blue-600" /> },
              { label: 'Currently Waiting', value: summary.waiting, icon: <Users className="h-5 w-5 text-amber-600" /> },
              { label: 'Completed Today', value: summary.completed, icon: <Activity className="h-5 w-5 text-emerald-600" /> },
              { label: 'No-Show / Cancelled', value: `${summary.noShow} / ${summary.cancelled}`, icon: <ShieldAlert className="h-5 w-5 text-red-600" /> },
              { label: 'Active Counters', value: summary.activeCounters },
              { label: 'Currently Serving', value: summary.serving },
              { label: 'Avg Wait Time', value: `${summary.avgWaitMinutes} min` },
              { label: 'Avg Service Time', value: `${summary.avgServiceMinutes} min` },
            ].map((k) => (
              <Card key={k.label}><CardBody className="p-5 flex items-center justify-between"><div><p className="text-xs font-medium text-slate-500">{k.label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{k.value}</p></div>{k.icon}</CardBody></Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Live Active Queue"
              subtitle="All tokens currently Waiting, Checked-In, Called, or Serving"
              action={<Link href="/staff"><Button size="sm">Open Staff Desk</Button></Link>}
            />
            <div className="divide-y divide-slate-100">
              {(dashData?.activeQueue ?? []).length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">No active tokens in queue right now.</p>
              ) : (
                dashData!.activeQueue!.map((t) => (
                  <div key={t._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-bold text-slate-900">{t.tokenNumber}</span>
                        {tokenStatusBadge(t.status)}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.serviceId?.name || 'Service'} • {t.source} {t.counterId ? `• ${t.counterId.name}` : ''}
                      </p>
                    </div>
                    {t.status === 'SERVING' && t.counterId && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={async () => {
                          await apiFetch('/staff/complete', {
                            method: 'POST',
                            body: JSON.stringify({ tokenId: t._id, counterId: t.counterId!._id }),
                          });
                          toast({ type: 'success', title: `Token ${t.tokenNumber} completed!` });
                          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
                        }}
                      >
                        Done (Complete)
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'analytics' && analyticsData?.analytics && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tokens Issued & Completed Per Day" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.analytics.tokensPerDay}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Bar dataKey="total" fill="#0f172a" name="Total" /><Bar dataKey="completed" fill="#10b981" name="Completed" /><Bar dataKey="noShow" fill="#ef4444" name="No-Show" />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Peak Hours & Average Wait (min)" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.analytics.peakHours}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Line type="monotone" dataKey="served" stroke="#2563eb" name="Tokens Served" /><Line type="monotone" dataKey="avgWaitMin" stroke="#f59e0b" name="Avg Wait (min)" />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Service Performance (Completed Tokens)" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.analytics.servicePopularity ?? []}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Bar dataKey="count" fill="#2563eb" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Counter Throughput (Served) & Avg Service Duration (min)" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.analytics.counterUtilization ?? []}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="counterName" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Bar dataKey="served" fill="#10b981" name="Tokens Served" /><Bar dataKey="avgDurationMin" fill="#8b5cf6" name="Avg Duration (min)" />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'status' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">System Health & Observability</h2>
              <p className="text-xs text-slate-500">Live backend, database, Redis, and notification transport telemetry</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchHealth()} loading={healthLoading}>
              Refresh Status
            </Button>
          </div>
          {healthData ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardBody>
                  <p className="text-xs text-slate-500">Backend API</p>
                  <p className={`text-2xl font-bold ${healthData.status === 'ok' ? 'text-emerald-600' : 'text-amber-600'}`}>{healthData.status.toUpperCase()}</p>
                  <p className="text-xs text-slate-500 mt-1">Uptime: {healthData.uptimeSec}s • {healthData.instanceId}</p>
                </CardBody></Card>
                <Card><CardBody>
                  <p className="text-xs text-slate-500">MongoDB ({healthData.database.activeTier || 'primary'})</p>
                  <p className={`text-2xl font-bold ${healthData.database.connected ? 'text-emerald-600' : 'text-red-600'}`}>{healthData.database.connected ? 'Connected' : 'Disconnected'}</p>
                  <p className="text-xs text-slate-500 mt-1">ReadyState: {healthData.database.readyState}</p>
                </CardBody></Card>
                <Card><CardBody>
                  <p className="text-xs text-slate-500">Redis ({healthData.redis.mode})</p>
                  <p className={`text-2xl font-bold ${healthData.redis.connected ? 'text-emerald-600' : 'text-amber-600'}`}>{healthData.redis.connected ? 'Connected' : 'Fallback'}</p>
                  <p className="text-xs text-slate-500 mt-1">Active Socket.IO: {healthData.metrics.socketConnections}</p>
                </CardBody></Card>
                <Card><CardBody>
                  <p className="text-xs text-slate-500">Latency & Memory</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{healthData.metrics.avgResponseTimeMs} ms</p>
                  <p className="text-xs text-slate-500 mt-1">RSS: {healthData.metrics.memoryMb.rss} MB • Heap: {healthData.metrics.memoryMb.heapUsed} MB</p>
                </CardBody></Card>
              </div>
              <Card>
                <CardHeader title="Runtime Error & Job Counters" />
                <CardBody className="grid gap-4 sm:grid-cols-4 text-sm">
                  <div><p className="text-xs text-slate-500">Total Requests</p><p className="text-lg font-bold">{healthData.metrics.totalRequests}</p></div>
                  <div><p className="text-xs text-slate-500">Error Rate</p><p className="text-lg font-bold">{healthData.metrics.errorRatePercent}%</p></div>
                  <div><p className="text-xs text-slate-500">Failed Token Requests</p><p className="text-lg font-bold">{healthData.metrics.failedTokenRequests}</p></div>
                  <div><p className="text-xs text-slate-500">Cron / Payment Failures</p><p className="text-lg font-bold">{healthData.metrics.cronFailures} / {healthData.metrics.paymentFailures}</p></div>
                </CardBody>
              </Card>
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading system status...</p>
          )}
        </div>
      )}

      {tab === 'services' && (
        <Card>
          <CardHeader title="Services" action={<Button size="sm" onClick={() => setSvcModal(true)}><Plus className="h-4 w-4" /> Add Service</Button>} />
          <div className="divide-y divide-slate-100">
            {(servicesData?.services ?? []).map((s) => (
              <div key={s._id} className="flex items-center justify-between px-6 py-4">
                <div><p className="text-sm font-bold text-slate-900">[{s.codePrefix}] {s.name}</p><p className="text-xs text-slate-500">Avg: {Math.round(s.avgServiceTimeSec / 60)}m • Monthly Quota: {s.monthlyQuota}</p></div>
                <Badge color={s.isAvailable ? 'emerald' : 'red'}>{s.isAvailable ? 'Active' : 'Paused'}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'counters' && (
        <Card>
          <CardHeader title="Service Counters" action={<Button size="sm" onClick={() => setCounterModal(true)}><Plus className="h-4 w-4" /> Add Counter</Button>} />
          <div className="divide-y divide-slate-100">
            {(countersData?.counters ?? []).map((c) => (
              <div key={c._id} className="flex items-center justify-between px-6 py-4">
                <div><p className="text-sm font-bold text-slate-900">#{c.counterNumber} — {c.name}</p><p className="text-xs text-slate-500">Staff: {c.assignedStaff?.name || 'Unassigned'} • Services: {c.assignedServices.map((s) => s.name).join(', ')}</p></div>
                <Badge color={c.status === 'ACTIVE' ? 'emerald' : 'amber'}>{c.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'staff' && (
        <Card>
          <CardHeader title="Staff Accounts" action={<Button size="sm" onClick={() => setStaffModal(true)}><Plus className="h-4 w-4" /> Add Staff</Button>} />
          <div className="divide-y divide-slate-100">
            {(staffData?.staff ?? []).map((st) => (
              <div key={st._id} className="flex items-center justify-between px-6 py-4">
                <div><p className="text-sm font-bold text-slate-900">{st.name}</p><p className="text-xs text-slate-500">{st.phone}</p></div>
                <Badge color={st.status === 'ACTIVE' ? 'emerald' : 'red'}>{st.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'branches' && (
        <div className="space-y-6">
          {planData && (
            <Card>
              <CardHeader title={`B2B SaaS Subscription — Current Plan: ${planData.plan}`} subtitle={`Allows up to ${planData.limits.maxBranches} branch(es) and ${planData.limits.maxCounters} counters`} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                {(['FREE', 'PRO', 'ENTERPRISE'] as const).map((p) => {
                  const info = planData.plans[p];
                  const isCurrent = planData.plan === p;
                  return (
                    <div key={p} className={`rounded-xl border p-4 space-y-2 ${isCurrent ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{p}</span>
                        <span className="text-xs font-semibold">${info.priceUsdMonth}/mo</span>
                      </div>
                      <p className="text-xs text-slate-600">{info.maxBranches} branches • {info.maxCounters} counters</p>
                      <Button size="sm" className="w-full" variant={isCurrent ? 'outline' : 'primary'} disabled={isCurrent || updatePlan.isPending} onClick={() => updatePlan.mutate(p)}>
                        {isCurrent ? 'Current Plan' : `Switch to ${p}`}
                      </Button>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Organization Branches" action={<Button size="sm" onClick={() => setBranchModal(true)}><Plus className="h-4 w-4" /> Add Branch</Button>} />
            <div className="divide-y divide-slate-100">
              {(branchesData?.branches ?? []).length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">No additional branches created yet (using main organization branch).</p>
              ) : (
                branchesData!.branches.map((b) => (
                  <div key={b._id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">[{b.code}] {b.name}</p>
                      <p className="text-xs text-slate-500">{b.location.address}, {b.location.city} • {b.timezone}</p>
                    </div>
                    <Badge color={b.status === 'ACTIVE' ? 'emerald' : 'red'}>{b.status}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'audit' && (
        <Card>
          <CardHeader title="Append-Only Audit Logs" subtitle="Immutable record of staff and queue operations" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Token</th><th className="px-4 py-3">Transition</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(auditData?.logs ?? []).map((log) => (
                  <tr key={log._id}>
                    <td className="px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{log.actorId?.name || log.actorRole}</td>
                    <td className="px-4 py-3 font-mono">{log.action}</td>
                    <td className="px-4 py-3 font-mono">{log.tokenId?.tokenNumber || '—'}</td>
                    <td className="px-4 py-3">{log.previousState ? `${log.previousState} → ${log.newState}` : log.newState || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={orgModal} onClose={() => setOrgModal(false)} title="Create Organization">
        <form onSubmit={(e) => { e.preventDefault(); createOrg.mutate(); }} className="space-y-4">
          <Input label="Organization Name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={orgForm.type} onChange={(e) => setOrgForm({ ...orgForm, type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="BANK">Bank</option><option value="HOSPITAL">Hospital</option><option value="PUBLIC_OFFICE">Public Office</option><option value="UNIVERSITY">University</option><option value="UTILITY">Utility Center</option>
            </select>
          </div>
          <Input label="Address" value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} required />
          <Input label="City" value={orgForm.city} onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })} required />
          <Button type="submit" className="w-full" loading={createOrg.isPending}>Create Organization</Button>
        </form>
      </Modal>

      <Modal open={svcModal} onClose={() => setSvcModal(false)} title="Add Service">
        <form onSubmit={(e) => { e.preventDefault(); createService.mutate(); }} className="space-y-4">
          <Input label="Service Name" value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} required />
          <Input label="Token Prefix (e.g. A, B)" maxLength={4} value={svcForm.codePrefix} onChange={(e) => setSvcForm({ ...svcForm, codePrefix: e.target.value.toUpperCase() })} required />
          <Input label="Avg Service Time (seconds)" type="number" value={svcForm.avgServiceTimeSec} onChange={(e) => setSvcForm({ ...svcForm, avgServiceTimeSec: Number(e.target.value) })} required />
          <Input label="Monthly Remote Quota" type="number" value={svcForm.monthlyQuota} onChange={(e) => setSvcForm({ ...svcForm, monthlyQuota: Number(e.target.value) })} required />
          <Button type="submit" className="w-full" loading={createService.isPending}>Create Service</Button>
        </form>
      </Modal>

      <Modal open={counterModal} onClose={() => setCounterModal(false)} title="Add Service Counter">
        <form onSubmit={(e) => { e.preventDefault(); createCounter.mutate(); }} className="space-y-4">
          <Input label="Counter Name" placeholder="Counter 2" value={counterForm.name} onChange={(e) => setCounterForm({ ...counterForm, name: e.target.value })} required />
          <Input label="Counter Number" type="number" value={counterForm.counterNumber} onChange={(e) => setCounterForm({ ...counterForm, counterNumber: Number(e.target.value) })} required />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Service</label>
            <select value={counterForm.serviceId} onChange={(e) => setCounterForm({ ...counterForm, serviceId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select service...</option>
              {(servicesData?.services ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Staff (optional)</label>
            <select value={counterForm.staffId} onChange={(e) => setCounterForm({ ...counterForm, staffId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {(staffData?.staff ?? []).map((st) => <option key={st._id} value={st._id}>{st.name}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" loading={createCounter.isPending}>Create Counter</Button>
        </form>
      </Modal>

      <Modal open={staffModal} onClose={() => setStaffModal(false)} title="Create Staff Account">
        <form onSubmit={(e) => { e.preventDefault(); createStaff.mutate(); }} className="space-y-4">
          <Input label="Staff Name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required />
          <Input label="Phone Number" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} required />
          <Input label="Password" type="password" minLength={6} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required />
          <Button type="submit" className="w-full" loading={createStaff.isPending}>Create Staff</Button>
        </form>
      </Modal>

      <Modal open={branchModal} onClose={() => setBranchModal(false)} title="Add Organization Branch">
        <form onSubmit={(e) => { e.preventDefault(); createBranch.mutate(); }} className="space-y-4">
          <Input label="Branch Name" placeholder="Gulshan Branch" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required />
          <Input label="Branch Code" placeholder="GUL" maxLength={12} value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })} required />
          <Input label="Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} required />
          <Input label="City" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} required />
          <Input label="Timezone (IANA)" value={branchForm.timezone} onChange={(e) => setBranchForm({ ...branchForm, timezone: e.target.value })} required />
          <Button type="submit" className="w-full" loading={createBranch.isPending}>Create Branch</Button>
        </form>
      </Modal>

      <Modal open={Boolean(qrPreview)} onClose={() => setQrPreview(null)} title="Signed Entrance Check-In QR">
        {qrPreview && (
          <div className="text-center space-y-4">
            <img src={qrPreview.qrDataUrl} alt="Entrance QR Code" className="mx-auto rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-500">Valid for 12 hours. Customers can scan this or paste the signed payload below:</p>
            <textarea readOnly value={qrPreview.qrPayload} rows={3} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px]" />
          </div>
        )}
      </Modal>
    </div>
  );
}
