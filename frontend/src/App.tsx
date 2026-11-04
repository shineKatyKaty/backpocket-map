import { useEffect, useMemo, useState } from 'react';
import { fetchPlaces } from './api';
import { buildFuse, runSearch } from './search';
import type { DataSource, Place } from './types';
import SearchBar, { type Filters } from './components/SearchBar';
import ResultList from './components/ResultList';
import MapView from './components/MapView';
import DetailSheet from './components/DetailSheet';

type SheetState = 'peek' | 'half' | 'full';
const SHEET_CYCLE: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' };

export default function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [source, setSource] = useState<DataSource>('sample');
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ onlyHigh: false, onlyUnvisited: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>('half');

  useEffect(() => {
    fetchPlaces().then(({ places, source }) => {
      setPlaces(places);
      setSource(source);
      setLoading(false);
    });
  }, []);

  const fuse = useMemo(() => buildFuse(places), [places]);

  const results = useMemo(() => {
    let r = runSearch(fuse, places, query);
    if (filters.onlyHigh) r = r.filter((p) => p.interest === '高');
    if (filters.onlyUnvisited) r = r.filter((p) => !p.visited);
    return r;
  }, [fuse, places, query, filters]);

  const selected = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId]
  );

  const onSelect = (id: string) => {
    setSelectedId(id);
    if (sheet === 'peek') setSheet('half');
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="app-title">保存リスト検索マップ</h1>
        <SearchBar
          query={query}
          onQuery={setQuery}
          count={results.length}
          total={places.length}
          source={source}
          filters={filters}
          onFilters={setFilters}
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
          />
        </section>
      </main>

      <DetailSheet place={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
