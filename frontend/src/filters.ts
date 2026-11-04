import type { Place } from './types';
import { placeBigs, type Vocabulary } from './vocab';

export interface Filters {
  bigs: string[]; // 大カテゴリ（複数選択はOR）
  interest: 'all' | '高' | '中以上';
  maxDuration: number | null; // 滞在の所要時間上限(分)
  listName: string | null;
  excludeVisited: boolean;
  radiusKm: number | null; // 現在地から
}

export const EMPTY_FILTERS: Filters = {
  bigs: [],
  interest: 'all',
  maxDuration: null,
  listName: null,
  excludeVisited: false,
  radiusKm: null,
};

export interface PlaceWithDistance extends Place {
  distanceKm: number | null;
}

const INTEREST_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 };

/** 条件フィルタ（AND結合、大カテゴリ内はOR）。設計書「条件フィルタ」 */
export function applyFilters(
  places: PlaceWithDistance[],
  f: Filters,
  vocab: Vocabulary
): PlaceWithDistance[] {
  return places.filter((p) => {
    if (f.bigs.length) {
      const pb = placeBigs(vocab, p.tags);
      if (!f.bigs.some((b) => pb.includes(b))) return false;
    }
    if (f.interest === '高' && p.interest !== '高') return false;
    if (f.interest === '中以上' && p.interest === '低') return false;
    // 所要時間が不明(null)の場所は除外しない
    if (f.maxDuration != null && p.duration != null && p.duration > f.maxDuration) return false;
    if (f.listName && !p.lists.includes(f.listName)) return false;
    if (f.excludeVisited && p.visited) return false;
    if (f.radiusKm != null && (p.distanceKm == null || p.distanceKm > f.radiusKm)) return false;
    return true;
  });
}

/** キーワード無しの既定順: 興味度→距離（設計書） */
export function orderByInterestThenDistance(
  places: PlaceWithDistance[]
): PlaceWithDistance[] {
  return [...places].sort((a, b) => {
    const r = (INTEREST_RANK[b.interest] ?? 0) - (INTEREST_RANK[a.interest] ?? 0);
    if (r) return r;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    return da - db;
  });
}

export function hasActiveFilters(f: Filters): boolean {
  return (
    f.bigs.length > 0 ||
    f.interest !== 'all' ||
    f.maxDuration != null ||
    f.listName != null ||
    f.excludeVisited ||
    f.radiusKm != null
  );
}
