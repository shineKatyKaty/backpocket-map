import { describe, it, expect } from 'vitest';
import { applyFilters, orderByInterestThenDistance, EMPTY_FILTERS, type PlaceWithDistance } from './filters';
import { DEFAULT_VOCAB } from './vocab';
import type { Place } from './types';

function mk(p: Partial<Place> & { id: string }, distanceKm: number | null = null): PlaceWithDistance {
  return {
    id: p.id, name: p.name ?? p.id, name_kana: null, lat: 35, lng: 135, address: null,
    note: null, gmaps_url: null, place_id: null, duration: p.duration ?? null,
    interest: p.interest ?? '中', visited: p.visited ?? false, needs_review: false,
    saved_at: null, lists: p.lists ?? ['Want to go'], tags: p.tags ?? [], distanceKm,
  };
}

const places: PlaceWithDistance[] = [
  mk({ id: 'a', interest: '高', duration: 60, tags: ['喫茶店'] }, 1),
  mk({ id: 'b', interest: '中', duration: 90, tags: ['美術館'] }, 5),
  mk({ id: 'c', interest: '低', duration: 30, tags: ['ラーメン'], visited: true }, 0.5),
  mk({ id: 'd', interest: '高', duration: 120, tags: ['温泉'] }, 20),
];

describe('applyFilters', () => {
  it('大カテゴリ(飲食)で絞り込み', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, bigs: ['飲食'] }, DEFAULT_VOCAB);
    expect(r.map((p) => p.id).sort()).toEqual(['a', 'c']);
  });
  it('興味度 高のみ', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, interest: '高' }, DEFAULT_VOCAB);
    expect(r.map((p) => p.id).sort()).toEqual(['a', 'd']);
  });
  it('所要時間 上限60分', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, maxDuration: 60 }, DEFAULT_VOCAB);
    expect(r.map((p) => p.id).sort()).toEqual(['a', 'c']);
  });
  it('未訪問のみ', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, excludeVisited: true }, DEFAULT_VOCAB);
    expect(r.find((p) => p.id === 'c')).toBeUndefined();
  });
  it('現在地から2km', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, radiusKm: 2 }, DEFAULT_VOCAB);
    expect(r.map((p) => p.id).sort()).toEqual(['a', 'c']);
  });
  it('複合: 飲食 × 高 × 2km（完了条件相当）', () => {
    const r = applyFilters(places, { ...EMPTY_FILTERS, bigs: ['飲食'], interest: '高', radiusKm: 2 }, DEFAULT_VOCAB);
    expect(r.map((p) => p.id)).toEqual(['a']);
  });
});

describe('orderByInterestThenDistance', () => {
  it('興味度→距離の順', () => {
    const r = orderByInterestThenDistance(places);
    expect(r.map((p) => p.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});
