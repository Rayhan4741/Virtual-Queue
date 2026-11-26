'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Building2, Monitor, ArrowRight, Globe } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Map3D } from '@/components/Map3D';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';

interface OrgItem {
  _id: string;
  name: string;
  type: string;
  description?: string;
  location: { address: string; city: string; lat?: number; lng?: number };
  servicesCount: number;
  waitingCount: number;
}

const ORG_TYPES = ['ALL', 'BANK', 'HOSPITAL', 'PUBLIC_OFFICE', 'UNIVERSITY', 'UTILITY'];

export default function OrganizationsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [showMap, setShowMap] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['organizations', search, type],
    queryFn: () =>
      apiFetch<{ organizations: OrgItem[] }>(
        `/organizations?q=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}`,
        { skipAuth: true }
      ),
  });

  const orgs = data?.organizations ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Explore Organizations</h1>
          <p className="text-sm text-slate-600">Select a bank, hospital, or public office to view live queues and book a token.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
          <Globe className="h-4 w-4" /> {showMap ? 'Hide 3D Map' : 'Show 3D Map'}
        </Button>
      </div>

      {showMap && orgs.some((o) => o.location?.lat && o.location?.lng) && (
        <Map3D
          height="360px"
          markers={orgs
            .filter((o) => o.location?.lat && o.location?.lng)
            .map((o) => ({
              id: o._id,
              name: o.name,
              subtitle: `${o.type.replace('_', ' ')} • ${o.waitingCount} waiting`,
              lat: o.location.lat!,
              lng: o.location.lng!,
              href: `/organizations/${o._id}`,
            }))}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or city..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ORG_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                type === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState icon={<Building2 className="h-6 w-6" />} title="No organizations found" description="Try adjusting your search query or category filter." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Card key={org._id} className="flex flex-col justify-between">
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge color="blue">{org.type.replace('_', ' ')}</Badge>
                  <span className="text-xs font-medium text-slate-500">{org.waitingCount} waiting</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{org.name}</h3>
                {org.description && <p className="text-xs text-slate-600 line-clamp-2">{org.description}</p>}
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {org.location.address}, {org.location.city}
                </p>
              </CardBody>
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5 bg-slate-50/50 rounded-b-xl">
                <Link href={`/display/${org._id}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
                  <Monitor className="h-3.5 w-3.5" /> Display Board
                </Link>
                <Link href={`/organizations/${org._id}`}>
                  <Button size="sm">View Services ({org.servicesCount}) <ArrowRight className="h-3.5 w-3.5" /></Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
