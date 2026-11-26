'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { tokenStatusBadge } from '@/components/ui/Badge';

export default function TrackGuestPage() {
  const params = useParams<{ trackingCode: string }>();
  const trackingCode = params?.trackingCode;

  const { data, isLoading, error } = useQuery({
    queryKey: ['track-guest', trackingCode],
    queryFn: () =>
      apiFetch<{
        token: { tokenNumber: string; status: string; organizationId: { name: string }; serviceId: { name: string } };
        eta: { peopleAhead: number; estimatedWaitMinutes: number };
      }>(`/kiosk/track/${trackingCode}`, { skipAuth: true }),
    enabled: Boolean(trackingCode),
    refetchInterval: 10000,
  });

  if (isLoading) return <div className="p-12 text-center text-slate-500">Loading token status...</div>;
  if (error || !data?.token) return <div className="p-12 text-center text-red-600">Tracking code not found.</div>;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardBody className="text-center space-y-4">
          <p className="text-xs font-medium text-slate-500">{data.token.organizationId.name}</p>
          <h1 className="text-4xl font-black text-slate-900">{data.token.tokenNumber}</h1>
          <div>{tokenStatusBadge(data.token.status)}</div>
          <p className="text-sm text-slate-600">{data.token.serviceId.name}</p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">People Ahead</p>
              <p className="text-xl font-bold">{data.eta.peopleAhead}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Approx. Wait</p>
              <p className="text-xl font-bold text-emerald-600">~{data.eta.estimatedWaitMinutes}m</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
