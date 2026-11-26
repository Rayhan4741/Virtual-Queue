'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Clock, MapPin, Users, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

interface ServiceItem {
  _id: string;
  name: string;
  codePrefix: string;
  description?: string;
  avgServiceTimeSec: number;
  isAvailable: boolean;
  remoteBookingEnabled: boolean;
  monthlyQuota: number;
  waitingCount: number;
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () =>
      apiFetch<{
        organization: {
          _id: string;
          name: string;
          type: string;
          description?: string;
          location: { address: string; city: string };
          workingHours: { open: string; close: string; days: string[] };
        };
        services: ServiceItem[];
      }>(`/organizations/${id}`, { skipAuth: true }),
    enabled: Boolean(id),
  });

  const bookMutation = useMutation({
    mutationFn: (serviceId: string) =>
      apiFetch<{ token: { _id: string; tokenNumber: string } }>('/tokens', {
        method: 'POST',
        body: JSON.stringify({ organizationId: id, serviceId }),
      }),
    onSuccess: (res) => {
      toast({ type: 'success', title: `Token ${res.token.tokenNumber} issued!` });
      router.push(`/tokens/${res.token._id}`);
    },
    onError: (err) => {
      const apiErr = err as Error & { code?: string };
      if (apiErr.code === 'QUOTA_EXCEEDED') setQuotaExceeded(true);
      toast({ type: 'error', title: 'Could not issue token', message: apiErr.message });
      setBookingServiceId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!data?.organization) return <div className="p-8 text-center text-slate-600">Organization not found.</div>;
  const { organization: org, services } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to Organizations
      </Link>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge color="blue">{org.type.replace('_', ' ')}</Badge>
            <Link href={`/display/${org._id}`}>
              <Button variant="outline" size="sm">Open Public Display Board</Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
          {org.description && <p className="text-sm text-slate-600">{org.description}</p>}
          <div className="flex flex-wrap gap-6 pt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {org.location.address}, {org.location.city}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {org.workingHours.open} – {org.workingHours.close}</span>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        {quotaExceeded && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div>
              <p className="font-bold">Monthly Free Quota Reached (3/3)</p>
              <p className="text-xs">Unlock +5 extra remote tokens via Stripe, SSLCommerz, or bKash.</p>
            </div>
            <Link href={`/billing?orgId=${id}`}>
              <Button variant="primary" size="sm">Unlock Extra Tokens</Button>
            </Link>
          </div>
        )}
        <h2 className="text-lg font-bold text-slate-900">Available Services</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((svc) => (
            <Card key={svc._id}>
              <CardBody className="flex h-full flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">Prefix {svc.codePrefix}</span>
                    <Badge color={svc.isAvailable ? 'emerald' : 'red'}>{svc.isAvailable ? 'Available' : 'Paused'}</Badge>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{svc.name}</h3>
                  {svc.description && <p className="text-xs text-slate-600">{svc.description}</p>}
                  <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {svc.waitingCount} in queue</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{Math.round(svc.avgServiceTimeSec / 60)} min avg</span>
                    <span>Quota: {svc.monthlyQuota}/mo</span>
                  </div>
                </div>
                <div className="pt-2">
                  {!user ? (
                    <Link href="/login"><Button variant="outline" className="w-full">Sign in to Book Token</Button></Link>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={!svc.isAvailable || !svc.remoteBookingEnabled}
                      loading={bookingServiceId === svc._id && bookMutation.isPending}
                      onClick={() => {
                        setBookingServiceId(svc._id);
                        bookMutation.mutate(svc._id);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {svc.remoteBookingEnabled ? 'Get Remote Token' : 'Walk-In Only'}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
