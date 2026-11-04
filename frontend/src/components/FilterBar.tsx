import type { Filters } from '../filters';
import { hasActiveFilters, EMPTY_FILTERS } from '../filters';
import type { Vocabulary } from '../vocab';
import { TRAVEL_MODES, type TravelMode } from '../travel';

interface Props {
  filters: Filters;
  onFilters: (f: Filters) => void;
  vocab: Vocabulary;
  lists: string[];
  hasLocation: boolean;
  travelMode: TravelMode;
  onTravelMode: (m: TravelMode) => void;
  boundsActive: boolean;
  onToggleBounds: () => void;
}

const DURATIONS: { label: string; value: number | null }[] = [
  { label: '指定なし', value: null },
  { label: '30分', value: 30 },
  { label: '1時間', value: 60 },
  { label: '2時間', value: 120 },
  { label: '半日', value: 240 },
];
const RADII: { label: string; value: number | null }[] = [
  { label: '現在地: 指定なし', value: null },
  { label: '1km', value: 1 },
  { label: '3km', value: 3 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
];

export default function FilterBar({
  filters,
  onFilters,
  vocab,
  lists,
  hasLocation,
  travelMode,
  onTravelMode,
  boundsActive,
  onToggleBounds,
}: Props) {
  const toggleBig = (b: string) => {
    const on = filters.bigs.includes(b);
    onFilters({ ...filters, bigs: on ? filters.bigs.filter((x) => x !== b) : [...filters.bigs, b] });
  };

  return (
    <div className="filterbar">
      <div className="filter-cats">
        {vocab.bigs.map((b) => (
          <button
            key={b}
            className={`chip ${filters.bigs.includes(b) ? 'on' : ''}`}
            onClick={() => toggleBig(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="filter-selects">
        <select
          className="sel"
          value={filters.interest}
          onChange={(e) => onFilters({ ...filters, interest: e.target.value as Filters['interest'] })}
        >
          <option value="all">興味度: すべて</option>
          <option value="中以上">中以上</option>
          <option value="高">高のみ</option>
        </select>

        <select
          className="sel"
          value={filters.maxDuration ?? ''}
          onChange={(e) =>
            onFilters({ ...filters, maxDuration: e.target.value ? Number(e.target.value) : null })
          }
        >
          {DURATIONS.map((d) => (
            <option key={d.label} value={d.value ?? ''}>
              {d.value == null ? '滞在: 指定なし' : `滞在 ${d.label}以内`}
            </option>
          ))}
        </select>

        <select
          className="sel"
          value={filters.radiusKm ?? ''}
          disabled={!hasLocation}
          onChange={(e) =>
            onFilters({ ...filters, radiusKm: e.target.value ? Number(e.target.value) : null })
          }
        >
          {RADII.map((r) => (
            <option key={r.label} value={r.value ?? ''}>
              {r.label}
            </option>
          ))}
        </select>

        {lists.length > 1 && (
          <select
            className="sel"
            value={filters.listName ?? ''}
            onChange={(e) => onFilters({ ...filters, listName: e.target.value || null })}
          >
            <option value="">リスト: すべて</option>
            {lists.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        <select
          className="sel"
          value={travelMode}
          disabled={!hasLocation}
          onChange={(e) => onTravelMode(e.target.value as TravelMode)}
          title="移動時間の手段"
        >
          {TRAVEL_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              移動: {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-toggles">
        <button
          className={`chip ${filters.excludeVisited ? 'on' : ''}`}
          onClick={() => onFilters({ ...filters, excludeVisited: !filters.excludeVisited })}
        >
          未訪問のみ
        </button>
        <button
          className={`chip ${boundsActive ? 'on' : ''}`}
          onClick={onToggleBounds}
          title="表示中の地図範囲に限定"
        >
          この範囲で検索
        </button>
        {(hasActiveFilters(filters) || boundsActive) && (
          <button
            className="chip reset"
            onClick={() => {
              onFilters(EMPTY_FILTERS);
              if (boundsActive) onToggleBounds();
            }}
          >
            条件クリア
          </button>
        )}
      </div>
    </div>
  );
}
