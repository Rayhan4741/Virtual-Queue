import { env } from '../config/env.js';

export interface TravelEstimate {
  durationMinutes: number;
  distanceKm: number;
  mode: string;
  provider: 'openrouteservice' | 'approximate_haversine';
  isApproximate: true;
  note: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function estimateTravelTime(params: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  mode?: 'driving-car' | 'foot-walking' | 'cycling-regular';
}): Promise<TravelEstimate> {
  const mode = params.mode || 'driving-car';

  if (env.OPENROUTESERVICE_API_KEY) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/${mode}?api_key=${encodeURIComponent(
        env.OPENROUTESERVICE_API_KEY
      )}&start=${params.originLng},${params.originLat}&end=${params.destLng},${params.destLat}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{ properties?: { summary?: { duration?: number; distance?: number } } }>;
        };
        const summary = data.features?.[0]?.properties?.summary;
        if (summary?.duration && summary?.distance) {
          return {
            durationMinutes: Math.max(1, Math.ceil(summary.duration / 60)),
            distanceKm: Number((summary.distance / 1000).toFixed(2)),
            mode,
            provider: 'openrouteservice',
            isApproximate: true,
            note: 'Approximate route estimate via OpenRouteService (does not include live traffic).',
          };
        }
      }
    } catch {
      // Fall through to approximate Haversine fallback
    }
  }

  const distKm = haversineKm(params.originLat, params.originLng, params.destLat, params.destLng);
  const roadDistKm = distKm * 1.3;
  const speedKmh = mode === 'foot-walking' ? 4.8 : mode === 'cycling-regular' ? 15 : 28;
  const durationMinutes = Math.max(2, Math.ceil((roadDistKm / speedKmh) * 60));

  return {
    durationMinutes,
    distanceKm: Number(roadDistKm.toFixed(2)),
    mode,
    provider: 'approximate_haversine',
    isApproximate: true,
    note: 'Approximate route estimate (live traffic unavailable).',
  };
}
