import type { DataSource } from '../types';

export interface Filters {
  onlyHigh: boolean;
  onlyUnvisited: boolean;
}

interface Props {
  query: string;
  onQuery: (v: string) => void;
  count: number;
  total: number;
  source: DataSource;
  filters: Filters;
  onFilters: (f: Filters) => void;
}

export default function SearchBar({
  query,
  onQuery,
  count,
  total,
  source,
  filters,
  onFilters,
}: Props) {
  return (
    <div className="searchbar">
      <div className="search-row">
        <input
          type="search"
          className="search-input"
          placeholder="名前・メモ・タグで検索（例: きっさ、美術館）"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="clear-btn" onClick={() => onQuery('')} aria-label="クリア">
            ×
          </button>
        )}
      </div>
      <div className="chips">
        <button
          className={`chip ${filters.onlyHigh ? 'on' : ''}`}
          onClick={() => onFilters({ ...filters, onlyHigh: !filters.onlyHigh })}
        >
          興味度 高のみ
        </button>
        <button
          className={`chip ${filters.onlyUnvisited ? 'on' : ''}`}
          onClick={() => onFilters({ ...filters, onlyUnvisited: !filters.onlyUnvisited })}
        >
          未訪問のみ
        </button>
        <span className="count">
          {count}/{total} 件
          {source === 'sample' && <span className="badge sample">サンプル</span>}
        </span>
      </div>
    </div>
  );
}
