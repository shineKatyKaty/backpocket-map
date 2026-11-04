import type { DataSource, Interest, Place } from './types';
import { samplePlaces } from './data/sample';
import { DEFAULT_VOCAB, type Vocabulary } from './vocab';
import type { TravelMode } from './travel';

const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');

/** バックエンドに接続しているか（サンプルモードなら編集はローカルのみ） */
export const apiAvailable = !!BASE;

/**
 * 場所一覧を取得。VITE_API_BASE があれば Worker から、
 * 無い/失敗時はバンドルされたサンプルデータにフォールバックする。
 */
export async function fetchPlaces(): Promise<{ places: Place[]; source: DataSource }> {
  if (BASE) {
    try {
      const res = await fetch(`${BASE}/places`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as { places: Place[] };
        if (Array.isArray(data.places)) return { places: data.places, source: 'api' };
      }
    } catch {
      /* ネットワーク不通 → サンプルへ */
    }
  }
  return { places: samplePlaces, source: 'sample' };
}

/** タグ語彙を取得。未接続/失敗時は既定語彙。 */
export async function fetchVocab(): Promise<Vocabulary> {
  if (BASE) {
    try {
      const res = await fetch(`${BASE}/tags`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
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

/** 興味度/所要時間/訪問済みの更新。未接続なら false（呼び出し側がローカル反映）。 */
export async function patchPlace(id: string, patch: PlacePatch): Promise<boolean> {
  if (!BASE) return false;
  const res = await fetch(`${BASE}/places/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export async function addTag(id: string, name: string): Promise<boolean> {
  if (!BASE) return false;
  const res = await fetch(`${BASE}/places/${encodeURIComponent(id)}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}

export async function removeTag(id: string, name: string): Promise<boolean> {
  if (!BASE) return false;
  const res = await fetch(
    `${BASE}/places/${encodeURIComponent(id)}/tags/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  return res.ok;
}

export interface TravelResult {
  durationSec: number | null;
  distanceMeters: number | null;
}

/** 現在地→候補地点の移動時間。未接続/失敗時は空（距離のみ表示）。 */
export async function fetchTravelTimes(
  origin: { lat: number; lng: number },
  destinations: { id: string; lat: number; lng: number }[],
  mode: TravelMode
): Promise<Record<string, TravelResult>> {
  if (!BASE || destinations.length === 0) return {};
  try {
    const res = await fetch(`${BASE}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destinations, mode }),
    });
    if (!res.ok) return {};
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
