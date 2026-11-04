/**
 * Google Routes API プロキシ（移動時間）。
 * 鍵をブラウザに晒さないよう Worker 経由で呼ぶ。設計書「移動時間の表示」:
 * 現在地から結果上位の数件分だけまとめて取得し、フロント側でキャッシュする。
 *
 * 徒歩/車/自転車: computeRouteMatrix（1リクエストでまとめて）
 * 公共交通(TRANSIT): matrix 非対応のため computeRoutes を宛先ごとに呼ぶ
 */
import type { Env } from './types';

export type TravelMode = 'WALK' | 'DRIVE' | 'BICYCLE' | 'TRANSIT';
const MODES = new Set<TravelMode>(['WALK', 'DRIVE', 'BICYCLE', 'TRANSIT']);

interface LatLng {
  lat: number;
  lng: number;
}
export interface RoutesRequest {
  origin: LatLng;
  destinations: { id: string; lat: number; lng: number }[];
  mode: TravelMode;
}
export interface RoutesResult {
  id: string;
  durationSec: number | null;
  distanceMeters: number | null;
}

function waypoint(p: LatLng) {
  return { waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } };
}

/** "123s" -> 123 */
function parseDuration(d: unknown): number | null {
  if (typeof d === 'number') return d;
  if (typeof d === 'string') {
    const m = d.match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.round(parseFloat(m[1]));
  }
  return null;
}

export function validateRoutesRequest(body: unknown): RoutesRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const o = b.origin as Record<string, unknown> | undefined;
  if (!o || typeof o.lat !== 'number' || typeof o.lng !== 'number') return null;
  if (!Array.isArray(b.destinations) || b.destinations.length === 0) return null;
  const mode = (typeof b.mode === 'string' ? b.mode : 'WALK') as TravelMode;
  if (!MODES.has(mode)) return null;
  const destinations: RoutesRequest['destinations'] = [];
  for (const d of b.destinations) {
    if (!d || typeof d !== 'object') return null;
    const dd = d as Record<string, unknown>;
    if (typeof dd.id !== 'string' || typeof dd.lat !== 'number' || typeof dd.lng !== 'number')
      return null;
    destinations.push({ id: dd.id, lat: dd.lat, lng: dd.lng });
  }
  return { origin: { lat: o.lat, lng: o.lng }, destinations, mode };
}

async function matrix(key: string, req: RoutesRequest): Promise<RoutesResult[]> {
  const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'originIndex,destinationIndex,duration,distanceMeters,condition',
    },
    body: JSON.stringify({
      origins: [waypoint(req.origin)],
      destinations: req.destinations.map((d) => waypoint({ lat: d.lat, lng: d.lng })),
      travelMode: req.mode,
      ...(req.mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    }),
  });
  if (!res.ok) throw new Error(`routematrix ${res.status}`);
  const elements = (await res.json()) as {
    destinationIndex?: number;
    duration?: unknown;
    distanceMeters?: number;
    condition?: string;
  }[];
  const out: RoutesResult[] = req.destinations.map((d) => ({
    id: d.id,
    durationSec: null,
    distanceMeters: null,
  }));
  for (const el of elements ?? []) {
    const i = el.destinationIndex;
    if (i == null || i < 0 || i >= out.length) continue;
    if (el.condition && el.condition !== 'ROUTE_EXISTS') continue;
    out[i].durationSec = parseDuration(el.duration);
    out[i].distanceMeters = typeof el.distanceMeters === 'number' ? el.distanceMeters : null;
  }
  return out;
}

async function transit(key: string, req: RoutesRequest): Promise<RoutesResult[]> {
  const results = await Promise.all(
    req.destinations.map(async (d) => {
      try {
        const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
          },
          body: JSON.stringify({
            origin: waypoint(req.origin),
            destination: waypoint({ lat: d.lat, lng: d.lng }),
            travelMode: 'TRANSIT',
          }),
        });
        if (!res.ok) return { id: d.id, durationSec: null, distanceMeters: null };
        const data = (await res.json()) as {
          routes?: { duration?: unknown; distanceMeters?: number }[];
        };
        const r = data.routes?.[0];
        return {
          id: d.id,
          durationSec: parseDuration(r?.duration),
          distanceMeters: typeof r?.distanceMeters === 'number' ? r.distanceMeters : null,
        };
      } catch {
        return { id: d.id, durationSec: null, distanceMeters: null };
      }
    })
  );
  return results;
}

export async function computeTravelTimes(env: Env, req: RoutesRequest): Promise<RoutesResult[]> {
  const key = env.ROUTES_API_KEY;
  if (!key) throw new Error('no ROUTES_API_KEY');
  return req.mode === 'TRANSIT' ? transit(key, req) : matrix(key, req);
}
