import { useEffect, useMemo, useState } from 'react';
import {
  apiAvailable,
  fetchPlaces,
  fetchVocab,
  fetchTravelTimes,
  patchPlace,
  addTag,
  removeTag,
  type PlacePatch,
  type TravelResult,
} from './api';
import { buildFuse, runSearch } from './search';
import { haversineKm } from './distance';
import {
  applyFilters,
  orderByInterestThenDistance,
  EMPTY_FILTERS,
  type Filters,
  type PlaceWithDistance,
} from './filters';
import { DEFAULT_VOCAB, type Vocabulary } from './vocab';
import { TRAVEL_MODES, type TravelMode } from './travel';
import type { DataSource, Place } from './types';
import SearchBar from './components/SearchBar';
import FilterBar from './components/FilterBar';
import ResultList from './components/ResultList';
import MapView, { type MapBounds } from './components/MapView';
import DetailSheet from './components/DetailSheet';

type SheetState = 'peek' | 'half' | 'full';
const SHEET_CYCLE: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' };
const TRAVEL_TOP_N = 8;

function withinBounds(p: PlaceWithDistance, b: MapBounds): boolean {
  if (p.lat == null || p.lng == null) return false;
  return p.lat <= b.north && p.lat >= b.south && p.lng <= b.east && p.lng >= b.west;
}

function patchPlaceLocal(p: Place, patch: PlacePatch): Place {
  const next = { ...p };
  if (patch.interest !== undefined) next.interest = patch.interest;
  if (patch.visited !== undefined) next.visited = patch.visited;
  if (patch.duration_manual !== undefined) {
    next.duration = patch.duration_manual ?? next.duration;
  }
  return next;
}

export default function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [vocab, setVocab] = useState<Vocabulary>(DEFAULT_VOCAB);
  const [source, setSource] = useState<DataSource>('sample');
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>('half');

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('WALK');
  const [travelById, setTravelById] = useState<Record<string, TravelResult>>({});

  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [boundsActive, setBoundsActive] = useState(false);

  // 初期ロード
  useEffect(() => {
    Promise.all([fetchPlaces(), fetchVocab()]).then(([pl, vc]) => {
      setPlaces(pl.places);
      setSource(pl.source);
      setVocab(vc);
      setLoading(false);
    });
  }, []);

  // 現在地（距離・移動時間用）
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setOrigin(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  const fuse = useMemo(() => buildFuse(places), [places]);

  // 距離付与
  const withDistance = useMemo<PlaceWithDistance[]>(
    () =>
      places.map((p) => ({
        ...p,
        distanceKm:
          origin && p.lat != null && p.lng != null
            ? haversineKm(origin, { lat: p.lat, lng: p.lng })
            : null,
      })),
    [places, origin]
  );

  // 検索 × フィルタ × 範囲 → 並べ替え
  const results = useMemo<PlaceWithDistance[]>(() => {
    const q = query.trim();
    let list = withDistance;
    if (q) {
      const ordered = runSearch(fuse, places, q);
      const rank = new Map(ordered.map((p, i) => [p.id, i]));
      list = withDistance.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }
    list = applyFilters(list, filters, vocab);
    if (boundsActive && mapBounds) list = list.filter((p) => withinBounds(p, mapBounds));
    if (!q) list = orderByInterestThenDistance(list);
    return list;
  }, [withDistance, fuse, places, query, filters, vocab, boundsActive, mapBounds]);

  // 移動時間: 上位数件だけ Worker 経由で取得（API接続時のみ）
  const topDestKey = useMemo(
    () => results.filter((p) => p.lat != null).slice(0, TRAVEL_TOP_N).map((p) => p.id).join(','),
    [results]
  );
  useEffect(() => {
    if (!origin || !apiAvailable || !topDestKey) {
      setTravelById({});
      return;
    }
    const dests = results
      .filter((p) => p.lat != null && p.lng != null)
      .slice(0, TRAVEL_TOP_N)
      .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng! }));
    let cancelled = false;
    fetchTravelTimes(origin, dests, travelMode).then((r) => {
      if (!cancelled) setTravelById(r);
    });
    return () => {
      cancelled = true;
    };
    // results は topDestKey で代表させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, travelMode, topDestKey]);

  const lists = useMemo(() => {
    const s = new Set<string>();
    for (const p of places) for (const l of p.lists) s.add(l);
    return [...s];
  }, [places]);

  const selected = useMemo(() => places.find((p) => p.id === selectedId) ?? null, [places, selectedId]);
  const selectedDist = useMemo(
    () => withDistance.find((p) => p.id === selectedId)?.distanceKm ?? null,
    [withDistance, selectedId]
  );
  const travelLabel = TRAVEL_MODES.find((m) => m.key === travelMode)?.label ?? '';

  const onSelect = (id: string) => {
    setSelectedId(id);
    if (sheet === 'peek') setSheet('half');
  };

  // 編集（楽観的にローカル反映 → API接続時は書き戻し）
  const onPatch = (id: string, patch: PlacePatch) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? patchPlaceLocal(p, patch) : p)));
    if (apiAvailable) void patchPlace(id, patch);
  };
  const onAddTag = (id: string, name: string) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id && !p.tags.includes(name) ? { ...p, tags: [...p.tags, name] } : p))
    );
    if (apiAvailable) void addTag(id, name);
  };
  const onRemoveTag = (id: string, name: string) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, tags: p.tags.filter((t) => t !== name) } : p))
    );
    if (apiAvailable) void removeTag(id, name);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="app-title">保存リスト検索マップ</h1>
        <SearchBar query={query} onQuery={setQuery} count={results.length} total={places.length} source={source} />
        <FilterBar
          filters={filters}
          onFilters={setFilters}
          vocab={vocab}
          lists={lists}
          hasLocation={!!origin}
          travelMode={travelMode}
          onTravelMode={setTravelMode}
          boundsActive={boundsActive}
          onToggleBounds={() => setBoundsActive((v) => !v)}
        />
      </header>

      <main className="body">
        <aside className={`list-pane sheet-${sheet}`}>
          <button
            className="sheet-handle"
            onClick={() => setSheet(SHEET_CYCLE[sheet])}
            aria-label="リストの高さを切り替え"
          />
          <div className="list-scroll">
            {loading ? (
              <div className="empty">読み込み中…</div>
            ) : (
              <ResultList
                places={results}
                travelById={travelById}
                travelLabel={travelLabel}
                selectedId={selectedId}
                onHover={setHoverId}
                onSelect={onSelect}
              />
            )}
          </div>
        </aside>

        <section className="map-pane">
          <MapView
            places={results}
            selectedId={selectedId}
            hoverId={hoverId}
            onSelect={onSelect}
            origin={origin}
            onBoundsChange={setMapBounds}
          />
        </section>
      </main>

      <DetailSheet
        place={selected}
        distanceKm={selectedDist}
        travel={selectedId ? travelById[selectedId] : undefined}
        travelLabel={travelLabel}
        vocab={vocab}
        onClose={() => setSelectedId(null)}
        onPatch={onPatch}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
      />
    </div>
  );
}
