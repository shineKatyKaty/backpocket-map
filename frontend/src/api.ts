import type { DataSource, Interest, Place } from './types';
import { samplePlaces } from './data/sample';
import { DEFAULT_VOCAB, type Vocabulary } from './vocab';
import type { TravelMode } from './travel';

const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');

/** バックエンドに接続しているか（サンプルモードなら編集はローカルのみ） */
export const apiAvailable = !!BASE;

/** 同一オリジン（/api …）か。Access 配下なのでセッション切れ時は再ログインへ飛ばす */
const sameOrigin = !!BASE && BASE.startsWith('/');

/**
 * Access のセッション切れで /api がログインへ 302 された場合に再認証する。
 * redirect:'manual' だと res.type==='opaqueredirect' になるのでそれを合図にリロード。
 * PWAのキャッシュ殻で古い画面が残るのを避けつつ、無限ループを防ぐため間引く。
 */
function reauth(): void {
  if (!sameOrigin) return;
  try {
    const last = Number(sessionStorage.getItem('reauth_at') || '0');
    if (Date.now() - last < 15000) return; // 15秒以内の連続リロードは抑止
    sessionStorage.setItem('reauth_at', String(Date.now()));
  } catch {
    /* sessionStorage 不可でも続行 */
  }
  location.reload();
}

/** fetch ラッパー。Access ログインへのリダイレクトを検知して再認証。 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response | null> {
  if (!BASE) return null;
  const res = await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
  if (res.type === 'opaqueredirect' || res.status === 0) {
    reauth();
    return null;
  }
  return res;
}

export async function fetchPlaces(): Promise<{ places: Place[]; source: DataSource }> {
  if (BASE) {
    try {
      const res = await apiFetch('/places', { headers: { Accept: 'application/json' } });
      if (res && res.ok) {
        const data = (await res.json()) as { places: Place[] };
        if (Array.isArray(data.places)) return { places: data.places, source: 'api' };
      }
    } catch {
      /* ネットワーク不通 → サンプルへ */
    }
  }
  return { places: samplePlaces, source: 'sample' };
}

export async function fetchVocab(): Promise<Vocabulary> {
  if (BASE) {
    try {
      const res = await apiFetch('/tags', { headers: { Accept: 'application/json' } });
      if (res && res.ok) {
        const data = (await res.json()) as { vocab?: Vocabulary };
        if (data.vocab?.bigs?.length) return data.vocab;
      }
    } catch {
      /* fallthrough */
    }
  }
  return DEFAULT_VOCAB;
}

export interface PlacePatch {
  interest?: Interest;
  duration_manual?: number | null;
  visited?: boolean;
}

export async function patchPlace(id: string, patch: PlacePatch): Promise<boolean> {
  const res = await apiFetch(`/places/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return !!res && res.ok;
}

export async function addTag(id: string, name: string): Promise<boolean> {
  const res = await apiFetch(`/places/${encodeURIComponent(id)}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return !!res && res.ok;
}

export async function removeTag(id: string, name: string): Promise<boolean> {
  const res = await apiFetch(`/places/${encodeURIComponent(id)}/tags/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  return !!res && res.ok;
}

export interface TravelResult {
  durationSec: number | null;
  distanceMeters: number | null;
}

export async function fetchTravelTimes(
  origin: { lat: number; lng: number },
  destinations: { id: string; lat: number; lng: number }[],
  mode: TravelMode
): Promise<Record<string, TravelResult>> {
  if (!BASE || destinations.length === 0) return {};
  try {
    const res = await apiFetch('/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destinations, mode }),
    });
    if (!res || !res.ok) return {};
    const data = (await res.json()) as {
      results?: { id: string; durationSec: number | null; distanceMeters: number | null }[];
    };
    const out: Record<string, TravelResult> = {};
    for (const r of data.results ?? []) {
      out[r.id] = { durationSec: r.durationSec, distanceMeters: r.distanceMeters };
    }
    return out;
  } catch {
    return {};
  }
}
