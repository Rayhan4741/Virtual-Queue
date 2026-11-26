'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

if (typeof window !== 'undefined') {
  (maplibregl as unknown as { setWorkerUrl?: (url: string) => void }).setWorkerUrl?.('/maplibre-gl-worker.mjs');
}

export interface MapMarker {
  id: string;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
  color?: string;
  href?: string;
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '';

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
          fitBounds: (bounds: unknown, padding?: number) => void;
        };
        Marker: new (opts: Record<string, unknown>) => {
          addListener: (event: string, cb: () => void) => void;
        };
        InfoWindow: new (opts: { content: string }) => {
          open: (map: unknown, marker: unknown) => void;
        };
        Polyline: new (opts: Record<string, unknown>) => unknown;
        LatLngBounds: new () => {
          extend: (pos: { lat: number; lng: number }) => void;
        };
      };
    };
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  const existing = document.getElementById('vq-gmaps-script') as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', () => resolve()));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'vq-gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
}

function buildFallbackStyle(mode: 'street' | 'satellite'): string | maplibregl.StyleSpecification {
  if (MAPTILER_KEY) {
    return mode === 'satellite'
      ? `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`
      : `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`;
  }

  const tiles =
    mode === 'satellite'
      ? ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
      : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom: mode === 'satellite' ? 16 : 19,
        attribution: mode === 'satellite' ? 'Esri World Imagery' : '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 19 }],
  };
}

export function Map3D({
  markers,
  route,
  height = '400px',
  pitch = 45,
  zoom = 13,
}: {
  markers: MapMarker[];
  route?: { from: [number, number]; to: [number, number] } | null;
  height?: string;
  pitch?: number;
  zoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'street' | 'satellite'>('street');
  const [gmapsError, setGmapsError] = useState(false);

  const useGoogle = Boolean(GOOGLE_MAPS_KEY) && !gmapsError;

  useEffect(() => {
    if (!containerRef.current) return;
    const validMarkers = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
    const center = validMarkers.length > 0 ? { lat: validMarkers[0].lat, lng: validMarkers[0].lng } : { lat: 23.8103, lng: 90.4125 };

    if (useGoogle) {
      let cancelled = false;
      loadGoogleMapsScript(GOOGLE_MAPS_KEY)
        .then(() => {
          if (cancelled || !containerRef.current || !window.google?.maps) return;
          const gmaps = window.google.maps;
          const map = new gmaps.Map(containerRef.current, {
            center,
            zoom,
            tilt: 45,
            mapTypeId: mode === 'satellite' ? 'hybrid' : 'roadmap',
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
          });

          const bounds = new gmaps.LatLngBounds();
          for (const m of validMarkers) {
            const pos = { lat: m.lat, lng: m.lng };
            bounds.extend(pos);
            const marker = new gmaps.Marker({ position: pos, map, title: m.name });
            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
            const info = new gmaps.InfoWindow({
              content: `
                <div style="font-family:Inter,sans-serif;padding:4px;min-width:170px;">
                  <strong style="font-size:13px;color:#0f172a;">${m.name}</strong>
                  ${m.subtitle ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${m.subtitle}</div>` : ''}
                  <div style="display:flex;gap:10px;margin-top:8px;">
                    ${m.href ? `<a href="${m.href}" style="font-size:11px;font-weight:600;color:#2563eb;text-decoration:none;">View Services →</a>` : ''}
                    <a href="${gmapsUrl}" target="_blank" rel="noopener" style="font-size:11px;font-weight:600;color:#059669;text-decoration:none;">Directions ↗</a>
                  </div>
                </div>
              `,
            });
            marker.addListener('click', () => info.open(map, marker));
          }

          if (route) {
            const fromPos = { lat: route.from[1], lng: route.from[0] };
            const toPos = { lat: route.to[1], lng: route.to[0] };
            new gmaps.Marker({ position: fromPos, map, title: 'Your Location' });
            new gmaps.Polyline({
              path: [fromPos, toPos],
              geodesic: true,
              strokeColor: '#2563eb',
              strokeOpacity: 0.9,
              strokeWeight: 5,
              map,
            });
            bounds.extend(fromPos);
            bounds.extend(toPos);
            map.fitBounds(bounds, 70);
          } else if (validMarkers.length > 1) {
            map.fitBounds(bounds, 60);
          }
        })
        .catch(() => setGmapsError(true));

      return () => {
        cancelled = true;
      };
    }

    // Fallback: MapTiler (if key provided) or OpenStreetMap / Esri via MapLibre
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildFallbackStyle(mode),
      center: [center.lng, center.lat],
      zoom,
      pitch,
      bearing: -12,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      for (const m of validMarkers) {
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
        const popupHtml = `
          <div style="font-family:Inter,sans-serif;padding:2px 4px;min-width:170px;">
            <strong style="font-size:13px;color:#0f172a;">${m.name}</strong>
            ${m.subtitle ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${m.subtitle}</div>` : ''}
            <div style="display:flex;gap:10px;margin-top:8px;">
              ${m.href ? `<a href="${m.href}" style="font-size:11px;font-weight:600;color:#2563eb;text-decoration:none;">View Services →</a>` : ''}
              <a href="${gmapsUrl}" target="_blank" rel="noopener" style="font-size:11px;font-weight:600;color:#059669;text-decoration:none;">Google Maps ↗</a>
            </div>
          </div>
        `;
        new maplibregl.Marker({ color: m.color || '#ef4444' })
          .setLngLat([m.lng, m.lat])
          .setPopup(new maplibregl.Popup({ offset: 22 }).setHTML(popupHtml))
          .addTo(map);
      }

      if (route) {
        map.addSource('vq-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [route.from, route.to] },
          },
        });
        map.addLayer({
          id: 'vq-route-line',
          type: 'line',
          source: 'vq-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-dasharray': [2, 1.5] },
        });
        new maplibregl.Marker({ color: '#10b981' })
          .setLngLat(route.from)
          .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML('<strong style="font-size:12px;">Your Location</strong>'))
          .addTo(map);
        const bounds = new maplibregl.LngLatBounds(route.from, route.from).extend(route.to);
        map.fitBounds(bounds, { padding: 70, pitch, duration: 700 });
      } else if (validMarkers.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        validMarkers.forEach((m) => bounds.extend([m.lng, m.lat]));
        map.fitBounds(bounds, { padding: 60, pitch, maxZoom: 13, duration: 500 });
      }
    });

    return () => {
      map.remove();
    };
  }, [JSON.stringify(markers), JSON.stringify(route), mode, pitch, zoom, useGoogle]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />

      {!useGoogle && (
        <div className="absolute top-3 left-3 z-10 flex rounded-lg border border-slate-300 bg-white/95 p-1 shadow-md backdrop-blur">
          <button
            type="button"
            onClick={() => setMode('street')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'street' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMode('satellite')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'satellite' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Satellite
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
        {useGoogle
          ? 'Google Maps • Street View, Satellite & Directions'
          : MAPTILER_KEY
          ? 'MapTiler 3D • Drag to rotate/tilt'
          : 'OpenStreetMap • Add Google Maps or MapTiler key in frontend/.env.local for 3D Vector Maps'}
      </div>
    </div>
  );
}
