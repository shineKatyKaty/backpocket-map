import type { DataSource, Place } from './types';
import { samplePlaces } from './data/sample';

const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');

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
      // ネットワーク不通 → サンプルへ
    }
  }
  return { places: samplePlaces, source: 'sample' };
}
