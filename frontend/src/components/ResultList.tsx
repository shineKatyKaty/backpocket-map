import type { Place } from '../types';

interface Props {
  places: Place[];
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function formatDuration(min: number | null): string {
  if (min == null) return '';
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${min}分`;
}

export default function ResultList({ places, selectedId, onHover, onSelect }: Props) {
  if (places.length === 0) {
    return <div className="empty">該当する場所がありません</div>;
  }
  return (
    <ul className="result-list">
      {places.map((p) => (
        <li
          key={p.id}
          className={`result-row ${p.id === selectedId ? 'selected' : ''}`}
          onMouseEnter={() => onHover(p.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(p.id)}
        >
          <div className="row-main">
            <span className={`dot interest-${p.interest}`} aria-hidden />
            <span className="row-name">{p.name}</span>
            {p.visited && <span className="badge visited">訪問済</span>}
            {p.needs_review && <span className="badge review">要確認</span>}
          </div>
          <div className="row-meta">
            {p.tags.length > 0 && <span className="row-tags">{p.tags.join('・')}</span>}
            {p.duration != null && <span className="row-dur">滞在 {formatDuration(p.duration)}</span>}
          </div>
          {p.note && <div className="row-note">{p.note}</div>}
        </li>
      ))}
    </ul>
  );
}
