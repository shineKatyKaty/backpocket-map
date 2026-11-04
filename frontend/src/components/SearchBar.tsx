import type { DataSource } from '../types';

interface Props {
  query: string;
  onQuery: (v: string) => void;
  count: number;
  total: number;
  source: DataSource;
}

export default function SearchBar({ query, onQuery, count, total, source }: Props) {
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
      <div className="count-row">
        <span className="count">
          {count}/{total} 件
          {source === 'sample' && <span className="badge sample">サンプル</span>}
        </span>
      </div>
    </div>
  );
}
